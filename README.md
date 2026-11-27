[English](<README.en.md>) | 中文

# DSH Skin Care

一个 **DSH（DeepSeek Harness）agent-native 护肤领域能力包**：给同一个宿主 agent 补充中文知识、AAD 来源索引、证据核对方法与医疗风险边界，而不是创建新的人格或独立护肤助手。

安装后由插件提供 `dsh-skincare` 技能，不必手动复制技能目录。可选的 dsh-go 原生面板只是轻量知识导航和对话入口；没有面板，技能仍可独立使用。

## 能帮助什么

从用户当前问题出发：解释清洁、保湿、防晒与皮肤问题相关概念，核对宣称和来源，讨论护理流程、学习主题或就诊准备。按需要追问、读资料或搜索，不先套固定模式。

不要求评估、建档、打卡或完成课程；不要求每次回答减少步骤，也不设每句一引或固定字数。事实应可核对，证据、推断和未知应分清。方法参考不代表角色切换。

## 安装：DSH-first

需要符合 [包清单](<package.json>) 版本要求的 DSH 与 Node.js 宿主。npm 包名为 `@brody715/dsh-skincare`：

```sh
dsh plugin --profile web add @brody715/dsh-skincare
```

上面的 CLI 命令添加依赖，不应单凭它判断 bundle 已注册。推荐请宿主使用 `plugin_manager` 的 `install_bundle`，`target` 为该包名，完成安装与 bundle 注册。测试本地工作副本时，将 `target` 指向克隆仓库的绝对目录：

```sh
git clone https://github.com/brody715/dsh-skincare.git
```

宿主按 [包清单](<package.json>) 的 `dsh.bundle.patch` 加载 [安装补丁](<cordis.patch.yml>)。不要手写宿主 profile 的依赖或补丁，也不要在 `$DSH_HOME` 内自行 `pnpm add`；卸载使用宿主的 `remove_bundle`。

安装后检查会话技能列表是否出现 `dsh-skincare`；必要时新开会话。旧的手工安装技能可能遮盖包内技能，先核对其路径和内容，再由用户决定是否移除，不假设两份内容一致。

**仓库改动不等于已发布或已部署。** npm 安装取得的是已发布版本；验证本次工作副本需通过宿主安装本地目录并检查实际加载结果。本文不声明当前主机已完成安装、更新或面板验证。

## 知识与证据边界

- **13 个中文知识模块**：涵盖框架、清洁、保湿、防晒、肤质、屏障、痤疮、痘印色沉、炎症性皮肤问题、标签、就医、学习主题和抗老；入口见 [技能说明](<skill/SKILL.md>)。
- **链接式知识导航**：[概念地图](<skill/knowledge-map.md>) 与各模块的具名关系说明去哪里、为什么继续读。搜索只需找到相关入口，Agent 可沿机制、条件、例外和证据逐步探索，不要求一次查全。
- [来源索引](<skill/sources/index.jsonl>) 与 [主题索引](<skill/sources/topics.json>)：链接、标题等元数据，不含 AAD 正文或机翻。
- 原文核对优先使用宿主已有网页读取或搜索工具；打不开时说明限制，不把本地整理冒充已经核验的当前原文。

从仓库根目录使用 Node.js 工具：

```sh
node skill/scripts/lookup.mjs "sunscreen stick"
node skill/scripts/lookup.mjs --url <slug或片段>
node skill/scripts/lookup.mjs --check <slug或片段>
node skill/scripts/lookup.mjs --read <slug或片段>
node skill/scripts/lookup.mjs --audit
```

中文关键词可加 `--references --json --limit 5`，按返回小节和行范围局部阅读。`--read` 仅返回标题、元数据和原文链接，不读本地全文、不联网；原文由宿主网页工具核对。引用允许按相关陈述合并，不编造 slug，不把索引命中当成原文核验。

## 连续性，不另造档案系统

复用 Harness 已有记忆政策与工具，不绑定特定记忆服务，不每轮写入，也不从助手讲过什么推断用户已经掌握。宿主没有记忆时，使用会话上下文，或在用户请求时提供摘要；不创建替代存储。

仅用户明确要求查看旧档案时，使用只读兼容命令：

```sh
node skill/scripts/legacy-profile.mjs show --confirm-user-request --json
```

它读取旧 `~/.dsh/skin-care/profile.json`，不自动读写、创建或迁移。旧档案不是当前诊断或掌握程度。可选 Go 面板不以该档案为数据源，也不维护打卡、等级或课程完成状态，见 [面板说明](<docs/panel.md>)。

## 医疗与版权边界

这是科普与风险辅助，**不是诊断或处方**。不做皮损确诊、疾病评分、医美项目决策、品牌排行、比价或带货。遇紧急危险信号优先建议及时就医，不以护肤试验延误处理；相关资料见 [何时就医](<skill/references/10-何时就医.md>)。

知识主要依据 [AAD 公众科普](https://www.aad.org/public)。AAD 内容版权归 AAD，本包不分发其原文或机翻，不代表其授权或背书。中文模块是本项目自行组织的知识整理，不是原文译本。详见 [第三方声明](<THIRD_PARTY_NOTICES.md>) 与 [来源和文字使用范围](<ATTRIBUTION.md>)。

## 开发与设计

发布运行时为 JavaScript／Node.js；维护者语料与历史评测脚本可能仍使用 Python，不能据此说全仓库没有 Python。技能方法位于 [问题澄清](<skill/agents/assessor.md>)、[学习支持](<skill/agents/coach.md>)、[流程讨论](<skill/agents/routine-review.md>)、[就诊准备](<skill/agents/visit-prep.md>)；它们不是独立 agent。

```sh
node --test tests/*.mjs
node skill/scripts/lookup.mjs --audit
```

架构见 [设计文档](<docs/design.md>)。已完成知识审校、检索回归和干净上下文实际问答复测，结果及限制见 [可靠性复测记录](<eval/reliability-review.md>)（仓库资料）。[行为评估用例](<eval/agent-native.md>) 用于持续回归；跨模型对照与真实学习效果仍需另行评估。

代码采用 [MIT](<LICENSE>)；文字内容使用范围见 [ATTRIBUTION](<ATTRIBUTION.md>)。
