# 变更记录

## 0.2.0

重构成标准的 DSH 插件包（仓库根即包根），技能改为随包分发。

- **插件优先**：仓库根就是 npm 包，`package.json` 带 `dsh.bundle.patch`，`cordis.patch.yml` 在根目录；
  用宿主的 `install_bundle` 装。
- **技能随包**：`lib/` 通过 `ctx.skills.registerProvider` 把包内 `skill/` 注册成随包技能提供者，
  不再往 `$DSH_HOME/skills` 建软链。装插件即得技能，卸载即干净。
- **dsh-go 面板降为第二层**：`dshGo` 清单保留在同一个 `package.json` 里，代码在 `lib/panel.js`，
  只在 dsh-go 宿主里生效；没有 `dshGo` 服务的宿主不加载它，也不报错。
- **语料不随包分发**：860 页 AAD 原文副本（`skill/sources/core/`）与其中文机翻（`corpus/`）都属第三方内容，
  不得再分发，改为本地生成物并被 `.gitignore` 排除；包里只留 `skill/sources/index.jsonl` 的元数据
  （slug / URL / 标题 / 栏目）。知识模块按 URL 现场核对原文（英文即可），使用者也可自行拉取。
  第三方授权边界见新增的 `THIRD_PARTY_NOTICES.md`。
- **面板写档案改为纯 Node**：`lib/panel.js` 的写入不再起 `python3` 子进程、不拼 shell 命令，
  直接用 `node:fs` 原子写（同目录临时文件 + `rename`，`indent: 2`，末尾换行，`updated_at` 为 UTC 秒级）。
  行为与 `profile.py` 等价，安装时不再因「子进程」被标风险；写失败只弹提示，不往输入框塞命令。
  日期口径统一为本地时区（`profile.py` 的 `log-done` / `add-goal` 同步改为本地日期）。
- **新增** `lookup.py --read <slug>`：本地有原文副本或译文就直接给；都没有时打印标题与原文地址，
  让人自己去读原文（英文即可），不再当成错误退出。
- **打包边界收紧**：`files` 精确到文件，原文副本、中文机翻、`sources/REPORT.md`、`tests/`、`eval/`
  都不进 npm 包（`npm pack` 实测 39 项 / 187 KB）。加 `.npmignore` 兜底。
- **知识模块改成能自足的长文**：既然原文副本与译文都不随包，`references/` 的 13 个模块必须自己把机制、
  数值、适用条件、分诊口径讲完。全部重写扩写，每篇 7000–9000 字符，合计约 11.3 万字符（此前约 3.5 万），
  每篇 ≥ 25 个可被 `--audit` 追到原文的 `[s:slug]`。为确认不是把机翻换个说法，做了逐字比对：
  13 篇模块与本地中文机翻（856 篇 `body_md_zh`）之间，12 个连续汉字的逐字重合为 **0**。
- **`mine_corpus.py` 移出包**：语料挖掘脚本只对本地语料有意义，移到仓库 `scripts/`（维护用，不随包），
  `lookup.py` 的提示语同步改口径。
- 写作规范 `docs/writing-guide.md` 的篇幅与自检命令同步为 7000–9000 字符（`wc -m` 口径）。
- 冒烟测试新增两条回归：知识模块的篇数/字数/骨架，以及打包清单里不许出现语料目录。
- **删除** `plugin/` 子包：目录合并到根包，`plugin/README.md` 并入 `docs/panel.md`。
- 包名从 `local-skin-care` 改为 `@brody715/dsh-skincare`（插件 id 同步改；旧的 profile 链接需卸载重装）。

## 0.1.0

- AAD 护肤技能（知识模块、专家角色、来源索引、学习路径、档案脚本）。
- dsh-go 原生护肤面板。
- 评测用例与 A/B 对照。
