# dsh-skincare 组织方式调研（benchmark）

> **说明（0.2.0 后）**：本文是 2026-11-22 重构前的调研快照，保留当时的证据与结论原文。仓库已改成
> 单包结构（包根即仓库根，`lib/` + `skill/` + `corpus/`），文中的 `plugin/` 目录、`local-skin-care`
> 包名和 `dsh plugin add ./plugin` 安装方式已被 `plugin_manager` + `install_bundle` 取代；
> 现行结构见 [../design.md](../design.md) 与根 README。


调研范围：A) 开源 Agent Skill 如何组织「知识库型」技能；B) dsh-go 插件生态与「一份仓库同时出技能+插件」的可行性。

**证据分级**：`[已核实]` = 本机文件已读原文 / 网页正文已取到；`[搜索片段]` = 只有搜索结果摘要，未取到原文，**不可当结论照抄**。

**一句话结论**：知识库型技能的主流形态是「**薄 SKILL.md 索引 + 按需读 references + 本地检索脚本**」；dsh-go 官方明确支持插件包内带 `SKILL.md` 并被 App 原生渲染，因此 `skill/` 与插件代码同仓库、同包分发是本仓库的正确形态，且**不需要 npm/市场上架**（私有仓库也上不了）。

---

## 0. 本项目的硬约束（先量再设计）

`[已核实]` 语料实测（`/root/aad-library/pages/corpus.json`，2026-11-22 生成）：

| 指标 | 数值 |
| --- | --- |
| 页面数 | **856** |
| 总体积 | **4,702,212 B ≈ 4.7 MB** |
| 单页 JSON 平均 | 5,541 B |
| 单页 JSON 最大 | 47,914 B |
| 单页字段 | `id, url, slug, title, summary, body_md, words, kind, updated, reviewers, path, children` |
| 附带文件 | `pages/pages.jsonl`（876 行，含 status / final_url / h1 / breadcrumbs） |

**推论（这两条决定了后面所有结构选择）**：
1. 4.7 MB 无法整体放进 SKILL.md，也无法让模型「读一遍」。→ 必须索引 + 按需取单页。
2. 单页 5.5 KB（最大 48 KB）是可读粒度。→ **一页一个文件**，让模型按需只读 1–2 页，而不是读整库。

---

## 1. 官方 Agent Skill 规范

### 1.1 仓库形态 `[已核实]`

来源：<https://github.com/anthropics/skills>（README 正文 + `spec/` 目录树已取到）

- 顶层分三类：`skills/`（技能示例集）、`spec/agent-skills-spec.md`（规范）、`template/`（技能模板）。
- 官方原话：每个技能「self-contained in its own folder with a `SKILL.md`」，SKILL.md 里放 instructions + metadata。
- 许可证：多数技能 Apache 2.0；`skills/docx`、`skills/pdf`、`skills/pptx`、`skills/xlsx` 是 Claude 生产环境实际在用的复杂技能，作为「复杂技能」参考。
- **同一仓库可以是插件市场**：`/plugin marketplace add anthropics/skills`，marketplace 名 `anthropic-agent-skills`，内含 `document-skills` / `example-skills` 两个插件，每个插件里装一批技能。→ **「一个仓库同时充当分发容器 + 技能集」有官方先例**，与本仓库「一份仓库两种交付物」同构。

`[搜索片段]` 专项：<https://claude.com/docs/plugins/build> — 插件 manifest 为 `plugin.json`；若无 `plugin.json`，目录只接受 `skills/<name>/SKILL.md` 结构（每个技能一个子目录）；上架官方目录还需 README + license；目录名必须等于 `name` 字段。说明「插件 = 装技能的容器」是官方一等设计。

### 1.2 frontmatter 字段 `[搜索片段，多来源一致]`

| 字段 | 必需 | 约束 |
| --- | --- | --- |
| `name` | 是 | 1–64 字符；仅小写字母/数字/连字符；**必须等于父目录名**；不能以 `-` 开头结尾；不能有 `--`；不用保留词 `anthropic`/`claude` |
| `description` | 是 | 1–**1024** 字符；第三人称（"Extracts text"，不是 "I help you"）；必须含触发短语（"Use when…" / "Use for…"） |

可选扩展字段（非规范核心）：`license`、`compatibility`、`metadata`、`allowed-tools`、`hooks`。
`[已核实]` 本机 `/root/.dsh/skills/design-taste-frontend/SKILL.md` 确实带 `hooks:` 段，说明额外字段被容忍。

> 未取到：`spec/agent-skills-spec.md` 与 `template/SKILL.md` 的**原文**。`raw.githubusercontent.com`、`cdn.jsdelivr.net`、`raw.githack.com` 均 404，GitHub blob 页只返回 JS 壳。以上字段约束来自三个独立二手来源交叉一致（`shipshitdev/library` 的 frontmatter-field-spec、`oakoss/agent-skills` 的 `references/frontmatter.md`、`numman-ali/openskills` 的 `docs/creating-skills.md`），可信但**未与规范原文逐字核对**。

### 1.3 渐进披露（三级加载）`[搜索片段 + 本机实证]`

| 级别 | 内容 | 何时进上下文 | 规模目标 |
| --- | --- | --- | --- |
| L1 | 仅 frontmatter（`name` + `description`） | 每个会话常驻 | ~100 词 |
| L2 | SKILL.md 正文 | 判定相关时加载 | 目标 <5k 词，尽量 <2k / <200 行 |
| L3 | `references/` `scripts/` `assets/` | **仅当 SKILL.md 明确让读时** | 不限 |

社区对 `description` 的定性很统一：**它不是摘要，是「什么时候触发的 if 语句」**，启动时所有技能的 description 会拼成一张清单供模型扫描。

### 1.4 社区是单文件还是多文件？

两种都有，按知识量分叉：

- **单文件**：`[已核实]` 本机 `/root/.dsh/skills/dsh-go-support` = 20 KB / **1 个文件**；`/root/.dsh/skills/interface-design` = 51 KB / 4 文件。小技能不拆。
- **多文件**：`[搜索片段]` 社区几乎都遵循 `skill-name/{SKILL.md, references/, scripts/, assets/}`（`numman-ali/openskills` 的 `docs/creating-skills.md`、`alirezarezvani/claude-skills` 的 `skills/skill-tester/references/skill-structure-specification.md`），并把**规范本身**也拆进 `references/*.md`（如 `oakoss/agent-skills` 的 `skills/meta-skill-creator/references/frontmatter.md`）。

→ 判断规则：内容能一屏讲完就单文件；**有「可枚举的知识条目」就拆 `references/`**。

---

## 2. 最关键的取舍：知识库怎么放

### 2.1 本机 6 个真实技能的实测画像 `[已核实]`

| 技能 | 体积 | 文件数 | 组织方式 |
| --- | --- | --- | --- |
| `dsh-go-guide` | 343 K | 38 | **SKILL.md 仅 20 行**，纯索引 + 阅读协议；知识拆 `zh/01-chat.md … 18-schedules.md` + `en/` 全量镜像 |
| `ui-ux-pro-max` | 3.5 M | 51 | **数据 + 检索脚本**：`data/*.csv`（38 个，含 `data/stacks/*`）+ `scripts/search.py`（纯标准库） |
| `design-taste-frontend` | **40 M** | 1633 | 正文 381 行；`references/` 440 K、`scripts/` 1.6 M、`library/` 72 K、`assets/` 38 M 分层 |
| `dsh-go-plugin` | 416 K | 23 | SKILL.md 252 行 + `template/`(19 K) + `kit/`(370 K) |
| `dsh-go-ui` | 87 K | 6 | 中等 |
| `dsh-go-support` | 20 K | 1 | 单文件 |

### 2.2 三个可直接照抄的范式

**范式 1：薄索引 + 编号知识文件（最适合 AAD）**
`[已核实]` `/root/.dsh/skills/dsh-go-guide/SKILL.md`（20 行）全文就是索引，且**它在正文里写明了阅读协议**：

> 说明文件都在本技能目录里：`README.md`、`zh/`、`en/`，按需读取。
> 1. 先读 `README.md`：适用版本和每页的内容。再只读和问题相关的一两页……

配合 `zh/01-chat.md … zh/18-schedules.md` 的**编号分主题**命名。这是官方自家技能的做法，最权威。
→ 对 AAD：`references/01-清洁.md … 10-何时就医.md`，SKILL.md 只写「先读 sources/topics.json 定位，再只读对应 1–2 个模块」。

**范式 2：本地语料 + 检索脚本**
`[已核实]` `/root/.dsh/skills/ui-ux-pro-max`：`description` 里直接写能力清单「Searchable local data: 80 searchable styles (51 active), 194 product palettes, 74 font pairings, 130 UX guidelines…」，数据 38 个 CSV，`scripts/search.py` 只依赖 Python 标准库、无网络。
→ 与已写的 `skill/scripts/lookup.py`（`--topic` / `--check` / `--url` / `--topics` / `--in-scope` / `--limit`）完全同构，**方向正确**。

**范式 3：大资产与正文分离**
`[已核实]` `design-taste-frontend`：SKILL.md 只留主流程，重资产进 `assets/`(38 M) / `scripts/`(1.6 M) / `references/`(440 K)，`references/` 按需读。
→ 印证：语料不该进 SKILL.md 正文，也不该被整体读取。

### 2.3 参考引用必须可校验（本项目特有的强需求）

`[已核实]` `skill/scripts/lookup.py` 的设计原则（源码 docstring 原文）：

> 设计原则：引用只能来自 index.jsonl 里真实存在的 slug，杜绝凭记忆编引用。找不到就返回非 0，调用方必须如实说「没有查到」。

这比一般技能更严，因为护肤结论涉及健康。→ **`index.jsonl` 必须作为一等交付物存在**，`--check <slug>` 必须能跑通，SKILL.md 的铁律 1（`[s:slug]` 引用）才有执行基础。这与 `ui-ux-pro-max` 的 `validate_data.py`（`[已核实]` 存在于 `/root/.dsh/skills/ui-ux-pro-max/scripts/validate_data.py`）思路一致。

---

## 3. dsh-go 插件侧

### 3.1 安装与分发机制 `[已核实]`

- 插件是**普通目录**，位于 `$DSH_HOME/dsh-go/plugins/<name>/`；安装命令 `dsh plugin --profile web add <目录绝对路径>`（`/root/workspace/vendor/dsh-Go/examples/plugins/README.md` 明确给出这一行）。
- `dsh plugin` 本身是薄封装：把参数**原样转发**给 profile 目录里的 pnpm（CLI help 原文：manage a profile's plugins by forwarding the remaining arguments to pnpm；参数为 pnpm arguments, forwarded verbatim）。
  → `github:user/repo`、`git+https://…` 这类 pnpm specifier **机制上可传**，但**官方文档从未示范，本机也未实测**。`[未验证]` 私有仓库不要把它当主路径。
- 插件**不是** Cordis bundle，两套体系别混。

### 3.2 包清单硬性要求 `[已核实]`

来自 `docs/plugins/market.md`（已读全文）与 `examples/plugins/*/package.json`（已读原文）：

| 要求 | 说明 |
| --- | --- |
| `package.json` `name` | 包名，且 `cordis.patch.yml` 里的 `name` **必须与之完全一致**（scoped 名在 YAML 里要加引号） |
| `dsh.bundle.patch` | 指向 `./cordis.patch.yml` |
| `engines.dsh` | 必须是**实测过的范围**，如 `">=0.2.1-rc.2 <0.3.0-0"`；写死精确版本会在引擎升级后被拒 |
| `type: "module"` + `main: "lib/index.js"` | 6 个已装插件 + 官方模板全部一致 |
| `exports` 映射 | 官方示例为 `.` / `./cordis.patch.yml` / `./package.json` |
| `files` 白名单 | 控制打包范围（市场限约 50 MiB） |
| `scripts.test` | 惯例 `node --test test/*.test.js` |

`[已核实]` 6 个已装插件（`/root/.dsh/dsh-go/plugins/`）的共同点与差异：

- **全部**：`type: module`、`main: lib/index.js`、`engines.dsh: ">=0.2.1-rc.2 <0.3.0-0"`、`scripts.test`。
- 4 个带 `data/*.json`（知识数据）：`local-life-compass`、`local-photo-lab`、`local-singing-lab`、`local-reading-library`。
- 5 个带 `test/*.test.js`。
- `wants` **可省略**：`local-social-practice` 没有该字段。`[已核实]`
- 版本化先例：`local-yuland-flow` 在 `lib/` 里留多版本副本（`index-0.2.0.js`、`index-0.4.0.js` 等）+ `scripts/build-release.mjs`。**不推荐**照抄（会膨胀），用 git tag 更好。
- `local-reading-library` 是唯一带 `dependencies`（`marked` / `sanitize-html` / `htmlparser2`）和 `dsh.client` 的，因为它是**网页面板**插件；纯手机原生插件不需要。

### 3.3 单仓库「技能 + 插件」：官方明确支持 `[已核实，决定性]`

`docs/plugins/native-for-free.md`（已读全文）列出**六个不需要任何 dsh-go 代码就能原生渲染**的东西，其中第二行就是：

| 能力 | 变成 | 原生程度 | 主机 |
| --- | --- | --- | --- |
| **技能（`SKILL.md`）** | **`/` 菜单的技能组、「技能」页** | **完全原生** | **全部主机** |

另外两条对本项目直接有用：
- 教模型输出 ` ```dsh-ui ` 代码块（写进技能或系统提示）→ App 原生画成图表/卡片（`chart`/`metric`/`compare`/`options`），推荐 ≤4 KiB、≤40 节点。→ **技能文本本身就能驱动好 UI，插件不是唯一路径**。
- 工具的 `presentationMeta` 带 `"dsh-go/view"` → 工具行里展开成原生卡片。

结论：**插件包内可以带 `SKILL.md`，App 会把它当正规技能展示**。所以「一份仓库两种交付物」在 dsh-go 侧是被支持的，且**技能部分零 dsh-go 代码即可生效**。

### 3.4 技能分发通道与体积上限 `[已核实]`

- 技能装到 `$DSH_HOME/skills/`（`docs/plugins/README.md`：「App 自动装进本机引擎的 `$DSH_HOME/skills/`」）。
- `[已核实]` `docs/design/managed-skill-install.md`（已读全文）：**App 托管安装只针对 3 个内置技能**（`dsh-go-ui` / `dsh-go-plugin` / `dsh-go-guide`），硬预算 **≤64 文件 / 单文件 ≤512 KiB / 总计 ≤1 MiB**，SKILL.md 必须带 managed 标记，且**最后写入**；无标记的文件判为 `userOwned`，App 永不覆盖。
- **该 1 MiB 预算不适用于第三方技能**：本机 `design-taste-frontend` 40 M、`ui-ux-pro-max` 3.5 M 都能正常安装使用。`[已核实]`
  → 所以 4.7 MB AAD 语料放进 `skill/sources/` **不违规**；但**绝不能整体读入上下文**（第 0 节）。

### 3.5 私有仓库能不能上官方市场？**不能** `[已核实]`

`docs/plugins/market.md` 准入要求：公开 npm 包 + `repository` 回链真实公开仓库 + `keywords` 含 `dsh-plugin`/`dsh-bundle` + OSI 许可证文件 + GitHub 仓库打 `dsh-plugin` topic + 市场条目**只接受精确 npm 版本（明确不接受 latest、范围或 Git 地址）**。

→ **私有仓库 = 只能靠 README 写本地安装步骤**。这是约束，不要写成「后续可上架」的规划。

`[未验证]` 两个市场索引 URL（`https://go.dshtui.com/market/index.json`、`https://api.dshfind.com/market/dsh-index.json`）本次未取到（fetch 404）。市场目录只列了 5 个条目（`/root/workspace/vendor/dsh-Go/market/plugins/`），说明**公开插件生态目前很小**，不能作为「容易被发现」的依据。

### 3.6 「技能源码 → 分发资产」的构建先例 `[已核实]`

`sdk/plugin-kit/scripts/sync-skill.mjs` + `sdk/plugin-kit/test/skill.test.js`（已读原文）说明官方怎么把技能目录变成 App 内置资产：

- `sources()` 显式列出「**安装后技能目录里的目标路径 → 源码路径**」映射；`render()` 把每个文件按**扁平名**（`kit/lib/x.js` → `kit-lib-x.js`）输出到 `app/assets/skills/<name>/`，并生成 `manifest.json`：`{"name": "<目录名>", "files": {"<扁名>": "<目录内相对路径>"}}`。
- `--check` 模式：不一致就 exit 1。测试会**按 App 的安装布局还原目录**再跑检查器。
- 与 `/root/workspace/vendor/dsh-Go/app/assets/skills/dsh-go-plugin/manifest.json`（23 条目，`{name, files:{扁名:相对路径}}`）完全对应。

→ 对我们有用的一点：如果将来要把 `skill/` 复制进 `plugin/` 内一起分发，**照 sync-skill.mjs 写个 30 行同步脚本 + `--check` 进 CI** 即可，不要手工复制两份。

---

## 4. 给 dsh-skincare 的推荐目录结构

以下每条都对应上面的证据编号。**与仓库现有骨架完全兼容**（现有：`README.md`、`ATTRIBUTION.md`、`LICENSE`、`skill/`、`plugin/`、`eval/`、`docs/`）。

```text
dsh-skincare/
├── README.md                     # 已有：双交付物表 + 两条安装路径（证据 §1.1 一仓多交付）
├── ATTRIBUTION.md                # 已有：AAD 来源与许可
├── LICENSE                       # 代码许可证；AAD 内容另在 ATTRIBUTION 说明
├── .gitignore
│
├── skill/                        # 装到 ~/.dsh/skills/dsh-skincare/
│   ├── SKILL.md                  # 【薄索引】铁律 + 四模式路由 + 阅读协议（证据 §2.2 范式1，对标 dsh-go-guide 20 行）
│   ├── references/               # 【L3 知识模块】编号分主题，按需只读 1–2 个（证据 §2.2 范式1）
│   │   ├── 01-清洁.md
│   │   ├── 02-保湿.md
│   │   ├── 03-防晒.md
│   │   ├── 04-痘痘.md
│   │   ├── 05-色沉.md
│   │   ├── 06-抗老.md
│   │   ├── 07-敏感与屏障.md
│   │   ├── 08-成分.md
│   │   ├── 09-流程与叠加.md
│   │   ├── 10-何时就医.md       # 红旗条款，最高优先级
│   │   └── 11-学习路径.md       # L0–L3
│   ├── agents/                   # 专家角色（评估师.md 等）
│   ├── scripts/                  # 已有：lookup.py / profile.py / fetch_sources.py（mine_corpus.py 已移到仓库 scripts/，不随包）
│   └── sources/                  # 【语料层】可 4.7 MB，不进上下文
│       ├── index.jsonl           # 一行一页：slug/title/url/topic/words —— 检索与引用校验的唯一真相源（证据 §2.3）
│       ├── topics.json           # 主题树，供 --topics / --topic
│       └── aad/                  # 一页一文件，按 slug 落盘（单页 5.5 KB 可读；证据 §0）
│           └── skin-care-basics/care.md
│
├── lib/panel.js                  # dsh-go 面板（0.2.0 起并入包根，不再单独目录）
│   ├── package.json              # 见模板二
│   ├── cordis.patch.yml          # name 必须 == package.json name（证据 §3.2）
│   ├── lib/
│   │   ├── index.js              # export const name / export function apply(ctx)
│   │   ├── view.js               # 工具卡 JSON 构造，>8 KiB 必须退回 {}
│   │   └── store.js              # 读写 ~/.dsh/skin-care/profile.json
│   ├── data/                     # 学习路径/评估题库等（4/6 已装插件有此目录；证据 §3.2）
│   │   └── curriculum.json
│   ├── test/skin-care.test.js    # 5/6 插件有测试（证据 §3.2）
│   ├── README.md                 # 安装步骤（私有仓库唯一的分发手段；证据 §3.5）
│   └── LICENSE
│
├── eval/                         # 触发率与回答质量用例
└── docs/
    ├── design.md
    └── research/benchmark.md     # 本文件
```

### 4.1 结构与证据对照表

| 决定 | 证据 |
| --- | --- |
| `SKILL.md` 保持薄，只做索引与路由 | `/root/.dsh/skills/dsh-go-guide/SKILL.md` 仅 20 行；L2 目标 <2k 词（§1.3） |
| 知识拆 `references/`，编号命名，按需读 | `dsh-go-guide` 的 `zh/01…18`；社区 `references/` 惯例（§1.4） |
| 语料一页一文件 + `index.jsonl` + 检索脚本 | `ui-ux-pro-max`（`data/*.csv` + `scripts/search.py`）；`design-taste-frontend`（`references/` 440 K 分层）；语料 4.7 MB（§0/§2.2/§2.3） |
| `plugin/data/*.json` 放结构化知识 | 4/6 已装插件带 `data/`（§3.2） |
| `plugin/test/*.test.js` | 5/6 已装插件带测试；所有官方示例包都有（§3.2） |
| 一份仓库两种交付物 | `anthropics/skills` 自身即 marketplace 容器（§1.1）；`native-for-free.md` 插件内 `SKILL.md` 完全原生（§3.3） |
| 技能与插件共用 `~/.dsh/skin-care/profile.json` | 与 `local-*` 插件「本机数据放 `$DSH_HOME`」一致；技能目录内数据在升级时可能被清（§3.4 userOwned 语义） |
| 不规划市场上架 | 私有仓库不满足市场准入，且市场条目拒绝 Git 地址（§3.5） |
| **不做** `lib/*-0.2.0.js` 多版本副本 | `local-yuland-flow` 有，但属膨胀反例，改用 git tag（§3.2） |

### 4.2 三条硬建议（直接可执行）

1. **SKILL.md 正文控制在 60–100 行**，且必须包含「按需读取协议」一句话段（照抄 `dsh-go-guide` 的写法），否则模型会把整库往里读。
2. **`index.jsonl` 一行一页、只放检索字段**（`slug,title,url,topic,words`），不放 `body_md`；正文留在本地的 `sources/core/<slug>.md`（0.2.0 起：原文副本与译文属第三方内容，不随包发布，见 `THIRD_PARTY_NOTICES.md`）。这是唯一同时满足「可引用校验」和「不炸上下文」的切法。
3. **插件只做 UI + 档案读写，不重复实现检索**：插件通过 `scripts/lookup.py` 或读 `profile.json` 工作，知识仍然单一来源在 `skill/sources/`，避免两套语料漂移。

---

## 5. 模板一：SKILL.md frontmatter 最小可用模板

依据：`/root/.dsh/skills/dsh-go-plugin/SKILL.md`（`name` + 长双语 `description` 塞满触发例句 + `whenToUse`）、`/root/.dsh/skills/dsh-go-guide/SKILL.md`（同样三字段 + managed 标记行）、规范约束（§1.2）。

```markdown
---
name: dsh-skincare
description: >-
  有出处的护肤知识库 + 分诊助手，知识底座是美国皮肤病学会（AAD）公众科普。自带中文知识模块、原文来源、
  学习路径、皮肤状态评估和目标跟踪。用于一切日常护肤与皮肤健康问题：「洗面奶怎么选」「防晒到底怎么涂」
  「痘印/黑头能不能去掉」「屏障受损、敏感泛红怎么办」「干皮/油皮/混合」「刷酸和 A 醇能不能一起用」
  「精华要不要叠加」「我这个情况该去看皮肤科吗」「帮我看看我的护肤流程合不合理」「我想系统学一下护肤」
  「帮我定个护肤目标」。不用于医美项目决策、药品处方、皮损确诊。
whenToUse: 日常护肤与皮肤健康问题；不用于医美决策、处方药、皮损确诊。
---

# DSH Skin Care

知识库不是一次性倒出来的。**先定模式，再只读相关的那 1–2 个文件。**

- 事实性结论必须挂 `[s:slug]` 引用，slug 必须能被 `scripts/lookup.py --check` 验证通过。
- 查不到就说「没查到 AAD 原文」，不要补常识。
- 命中 `references/10-何时就医.md` 的红旗条款，直接建议就医，不再给自我处理方案。
- 不诊断、不排产品、不报品牌。
```

**要点**：
- `description` **≤1024 字符**，塞真实用户说法（中英都放，便于跨语言触发），并显式写「不用于…」划边界。
- 加 `whenToUse` 是 dsh-go 本机两个官方技能的实际做法。
- **不要**加 `# dsh-go:managed` 标记行 —— 那是 App 内置托管技能专用（§3.4）；第三方技能加了反而可能被 App 接管覆盖。

---

## 6. 模板二：dsh-go `package.json` 最小可用清单

依据：`/root/.dsh/skills/dsh-go-plugin/template/package.json`（未发布的本机开发模板）、`/root/workspace/vendor/dsh-Go/examples/plugins/dsh-go-example-readaloud/package.json`（官方示例，含 `exports` + `files` + `test`）、`docs/plugins/market.md` 的 `engines.dsh` 要求（§3.2）。

```json
{
  "name": "local-skin-care",
  "version": "0.1.0",
  "private": true,
  "description": "DSH Go 原生护肤面板：学习路径、状态评估、目标跟踪，读写同一份本地档案。",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "files": ["lib", "data", "cordis.patch.yml", "README.md", "LICENSE"],
  "scripts": {
    "test": "node --test test/*.test.js"
  },
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  },
  "dshGo": {
    "v": 1,
    "title": { "zh": "护肤", "en": "Skin care" },
    "icon": "heart",
    "contributes": {
      "panels": [
        {
          "id": "skin-care-panel",
          "label": { "zh": "护肤", "en": "Skin care" },
          "icon": "heart",
          "placement": ["session.tab", "features"]
        }
      ]
    }
  },
  "engines": {
    "node": ">=22.19",
    "dsh": ">=0.2.1-rc.2 <0.3.0-0"
  }
}
```

配套 `cordis.patch.yml`（`name` 必须与上面 `name` **完全一致**）：

```yaml
# id: any unique id; name: must equal "name" in package.json.
- insert:
    - id: local-skin-care
      name: local-skin-care
```

**要点**：
- `icon` 只能在宿主图标枚举里选（`sdk/plugin-kit/schema/view.schema.json` 的 `$defs.icon.enum`）。`[已核实]` `heart`、`bolt`、`star`、`sparkle`、`flag`、`bookmark`、`pin`、`bell`、`clock`、`alarm` 等在其中；已装插件用过 `travel`/`camera`/`book`/`music`/`chat`/`puzzle`/`play`/`document`。写错只会 warn（`unknown-icon`），但仍应选枚举内的值。
- `private: true` — 私有仓库不上 npm（§3.5），设了可防误发布。
- `engines.dsh` 写**范围**不写精确版本，否则引擎一升级就被拒。
- `wants` 可省略（`local-social-practice` 即无此字段）；确实需要剪贴板等再加，并在 `lib/index.js` 里写 `ctx.inject(['dshGo'])`（**不要**写 `['dshGo?']`）。
- 纯手机原生面板**不需要** `dependencies` / `dsh.client`（那是网页面板插件才要）；若 `lib/view.js` 只是拼 JSON 交给 App 画，连 `@deepseek-ai/dsh-tools` 之外的依赖都不必加。
- 工具卡 JSON 超过 **8 KiB** 或构造失败时，必须返回 `{}` 退回纯文本。

---

## 7. 未核实事项（别当结论用）

1. `anthropics/skills` 的 `spec/agent-skills-spec.md` 与 `template/SKILL.md` **原文未取到**（raw/CDN 全 404，blob 是 JS 壳）。frontmatter 约束来自三方二手一致来源。
2. `dsh plugin add github:user/repo` 等 **git specifier 未实测**，官方文档未示范。
3. 两个市场索引 JSON（go.dshtui.com、api.dshfind.com）**未取到**，公开插件生态实际规模未知。
4. `market/` 下 `VERIFICATION.md`、`candidates/`、`platforms/`、`schema/` **未读**（不影响本文结论）。
5. 社区若干仓库（`shipshitdev/library`、`oakoss/agent-skills`、`numman-ali/openskills`、`alirezarezvani/claude-skills`、`terrylica/cc-skills`）**仅读搜索结果摘要**，未逐仓库核对目录。
