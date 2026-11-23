# dsh-go 原生面板（次要交付物）

包里的 `lib/panel.js` 是给 **dsh-go 手机 App** 的可选面板：在「会话标签」和「功能」页放一个护肤面板，
读技能写的档案，显示当前状态和下一步，并提供两个一键入口。不联网、不调模型、不做产品推荐。

它是这个包的第二层。第一层是 `skill/` 随包分发的技能（见根 README）。Linux 桌面版、macOS 版和网页版
Harness 都没有 `dshGo` 服务，面板那部分代码内部 `ctx.inject(['dshGo'], …)` 不触发，等于不存在——
装了也不会报错，技能照常可用。

## 面板显示什么

面板 id `skin-care-panel`，位置 `session.tab` + `features`，图标 `heart`，只展示「状态 + 下一步」：

| 面板内容 | 来源键（`profile.json`） |
| --- | --- |
| 认知阶段 `L1 · 基础` | `stage.knowledge` |
| 护理复杂度 | `stage.care_complexity`（`minimal` / `clean` / `stacked` / `overloaded`） |
| 分诊（灰/黄/红） | `stage.triage`（`self-care` / `see-doctor` / `urgent`，只反映已记录状态，不是建议） |
| 近期主诉 | `concerns[]`（最多 5 条） |
| 今日流程清单 | `routine[].step`，`done` 与否看 `log[今天].done`；`detail` 取 `routine[].product_type · routine[].freq` |
| 近 7 天打卡 | `log[].date` 里最近 7 天的独立天数（progress `value / 7`） |
| 目标 | `goals[]` 中 `status === "active"` 的前 3 条 |
| 学习进度 L0–L3 | `learning.L0…L3`（`todo` / `in_progress` / `done`）；未完成的行可点，点了就把它标成 `done` |
| 「今日打卡」按钮 | 把今天还没完成的 `routine[].step` 追加进 `log[今天].done` |

没有档案时面板不报错也不留白，显示一行引导：**还没建档，跟我说一句「帮我看看我的护肤流程」**。

面板刻意不放：产品推荐、购买链接、评分、知识库正文（那些都在技能里）。

## 两个入口

- **面板按钮**「今日打卡」：记今天已完成；「学习进度」里点一行 → 把该级标成已完成。成功后自动刷新面板。
- **输入框上方胶囊**「今天怎么护肤」（`composer.actions`，id `skin-care-ask`）：把一段带当前档案的提示词
  填进输入框，**绝不自动发送**，发不发、怎么改由你自己决定。

## 档案写入怎么走

插件自己写档案：`node:fs` 读改写，不起子进程、不拼 shell 命令、不依赖 Python。

- 「今日打卡」→ 把今天还没完成的 `routine[].step` 逐个追加进 `log[今天].done`（去重）；
- 学习进度里点一行 → 把 `learning.<L>` 设成 `done`。

写入规则与 `skill/scripts/profile.py` 完全一致：原子写（同目录临时文件 + `rename`）、`JSON.stringify(…, null, 2)`
加末尾换行、`updated_at` 是 UTC 的 `2026-11-23T01:55:06Z` 形状、`log` 按日期升序只留最近 180 天、
日期用本地时区（用户感知的「今天」）。档案位置：`$DSH_SKIN_PROFILE` → `$DSH_HOME/skin-care/profile.json`
→ `~/.dsh/skin-care/profile.json`；上级目录不存在会自动创建。

技能里仍保留 `profile.py`，负责面板没做的 `set-stage` / `set-concerns` / `add-goal` / `add-routine`。
两条路径写同一个文件、同一套格式，互不覆盖。

## 写入失败时

权限不足、目录不可写、档案超过 256 KB 上限或解析不出来时，面板只弹一句「档案写入失败，检查一下文件权限」，
不动文件，也不把任何命令塞进输入框。
