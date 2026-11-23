[English](README.en.md) | 中文

# DSH Skin Care

一个 **DSH（DeepSeek Harness）插件包**：把 [AAD（美国皮肤病学会）](https://www.aad.org/) 面向公众的护肤科普，
做成一个**能查、能学、能评估、能跟踪**的技能，随包分发。

装好插件，会话里就有 `dsh-skincare` 技能——不用手动往 `~/.dsh/skills` 拷东西。
同一个包里还附带一个可选的 dsh-go 手机原生面板，那是第二层，没有也不影响。

```
包根
├─ lib/            插件入口（Cordis 插件：注册技能提供者 + 可选面板）
├─ skill/          技能本体：SKILL.md、13 个知识模块、专家角色、来源索引、脚本
├─ cordis.patch.yml  安装补丁
├─ icon.svg
├─ docs/           设计文档、面板说明、调研
├─ scripts/        维护脚本（语料挖掘；只在本机跑，不入包）
└─ THIRD_PARTY_NOTICES.md  第三方内容边界（哪些不发、为什么）
```

## 它解决什么

护肤不缺信息，缺的是**判断**。营销把「基础维持 / 问题处理 / 医疗边界」混成一团，最赚钱的词永远是「修复」和「淡印」。

这个项目只做四件事：

1. **查** — 任何结论给 AAD 出处，能展开原文。
2. **学** — L0→L3 系统路径，每课 3–5 分钟，带自测。
3. **评** — 判断你现在的认知阶段、护理复杂度、主诉该自我处理还是就医。
4. **跟** — 把目标拆成能勾选的行为，按周复盘。

好的结果可能是：**少买两样东西**，或者**去挂个皮肤科号**。

## 装

需要 DSH 宿主（`dsh` 命令可用）。包在 npm 上：`@brody715/dsh-skincare`。

```sh
dsh plugin --profile web add @brody715/dsh-skincare
```

不想用命令行，也可以在会话里让 Host 调 `plugin_manager` 的 `install_bundle`，`target` 直接填包名
`@brody715/dsh-skincare`；想装本地改动版就 `git clone https://github.com/brody715/dsh-skincare.git`
后把 `target` 换成目录绝对路径。安装会读 `package.json` 里的 `dsh.bundle.patch`，把
`cordis.patch.yml` 里的 `insert` 项并进 profile；插件名是 `@brody715/dsh-skincare`。

**别手写 profile 的 `package.json` / `cordis.patch.yml`，也别在 `$DSH_HOME` 里 `pnpm add`，**
那些地方由宿主管理。卸载用同一个工具的 `remove_bundle`。

装完确认技能在：新开会话问它一句护肤问题，或看会话的可用技能列表里有没有 `dsh-skincare`。

> 早前手动装过技能（`~/.dsh/skills/dsh-skincare`）的话，那份优先级更高（用户层 400 比随包 600 靠前），
> 不会冲突，内容也是同一份。想只留包内这份，删掉那个目录即可。

想要 dsh-go 手机原生面板，见 [docs/panel.md](docs/panel.md)（同一套包，无需另外安装）。

## 边界（先声明，避免误解）

- 是科普与分诊辅助，**不是诊断，不是处方**。
- 不测评产品、不比价、不带货、不给链接。
- 命中红旗症状（见 `skill/references/10-何时就医.md`）直接建议就医，不再给自我处理方案。
- 任何皮肤问题，最终请由有执照的皮肤科医生面诊。

## 知识从哪来

三层，边界很清楚：

| 层 | 在哪 | 随包发 | 作用 |
| --- | --- | --- | --- |
| 中文知识模块 | `skill/references/*.md` | 是 | 回答的主体：机制、数值、分诊口径、常见错误 |
| 来源索引（只有元数据） | `skill/sources/index.jsonl` | 是 | 一行一页：`slug / url / title / section`，用来校验引用、取原文地址 |
| AAD 原文副本与译文 | 本地生成 | **否** | 核对用。第三方内容，不能二次分发 |

索引只有链接和标题，没有正文、没有译文。知识模块按索引里的 URL 现场核对原文（英文即可）：

```sh
python3 skill/scripts/lookup.py --url acne          # 取这一页的原文地址
python3 skill/scripts/lookup.py "sunscreen stick"   # 搜索引定位 slug
```

如果你在本地按需生成了原文副本（`skill/sources/core/`）或中文机翻（`corpus/`），
`--read <slug>` 会直接把正文给你；两种都缺时它打印标题和原文地址，让人自己去读。
为什么这样切，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 来源与版权

知识依据是 AAD 公众科普页面（`aad.org/public/...`），引用处标 slug 与原始 URL。
**AAD 内容版权归 AAD 所有**：本项目不复制、不翻译、不再分发它的正文，只引用链接与事实；
也不构成 AAD 的授权或背书。

中文知识模块是本项目自己写的，不是原文翻译——机制与数值有依据，表述、结构与分诊口径由本项目重写。
边界细节（哪些内容不发、为什么）见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，
来源、版权与使用范围的完整说明见 [ATTRIBUTION.md](ATTRIBUTION.md)。

## 开发

零构建、零依赖：`lib/` 是纯 ESM，改完直接在宿主里生效（改清单会自动重载，改代码需重启引擎）。

```sh
node --test tests/smoke.mjs          # 插件入口 + 技能提供者的冒烟测试
python3 skill/scripts/lookup.py --audit   # 校验知识模块里所有 [s:slug] 引用
python3 eval/run.py                  # 评测用例
```

设计取舍见 [docs/design.md](docs/design.md)，验收证据在 [eval/rubric.md](eval/rubric.md)，
「带技能 vs 普通聊天」的实测在 [eval/ab-v0.1.md](eval/ab-v0.1.md)。

## 许可证

代码 MIT（见 [LICENSE](LICENSE)）。文字内容使用范围见 [ATTRIBUTION.md](ATTRIBUTION.md)。
