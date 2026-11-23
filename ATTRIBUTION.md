# 内容来源与使用范围（ATTRIBUTION）

## 来源

本项目皮肤健康知识的原始依据，来自 **American Academy of Dermatology（AAD，美国皮肤病学会）**
面向公众的科普页面：

- 站点：https://www.aad.org/
- 范围：`public/everyday-care/`、`public/diseases/`、`public/cosmetic/`、`public/public-health/` 下的公众科普正文
- 仓库与发布包里保留的是索引元数据 `skill/sources/index.jsonl`：每行 `id / slug / url / title / section / words / kind / in_scope`，
  即页面地址、标题、栏目、篇幅，以及本项目自己判断的「是否适用于本知识库」。它等价于一张带出处的链接清单。

版权：© American Academy of Dermatology. All rights reserved.
本项目**不主张**对 AAD 内容的任何权利，也**未获得** AAD 的授权或背书。任何对外表述都不得暗示 AAD
与本项目有合作、认证或推荐关系。

## 仓库与发布包里**没有**什么

以下内容一律不进 Git 仓库、不进 npm 包，也不随任何分发物提供：

- **AAD 英文原文副本**：开发期曾用离线副本做核对，该目录（`skill/sources/core/`）被 `.gitignore`
  与 `.npmignore` 双重排除，发布物里不存在。
- **AAD 正文的中文机器翻译**：语料快照目录（`corpus/`）同样被双重排除，不随包、不入库。
  机器翻译属于对原文的演绎，与原文同样不得再分发。
- 语料审计报告与统计（`skill/sources/REPORT.md`、`STATS.json`）也不发布。

需要原文的使用者，用 `skill/scripts/fetch_sources.py` 按 `index.jsonl` 里的 `url` 自行拉取，
或直接在浏览器里打开该地址阅读英文原文（英文即可，不需要译文）。

## 中文知识模块是什么

`skill/references/` 的 13 个模块是本项目自己的写作，不是译文，也不是逐句改写：

- 事实、数值、机制、红旗条款都能通过 `[s:<slug>]` 追到具体来源页面，`python3 skill/scripts/lookup.py --audit` 可校验；
- 组织方式、举例、执行口径、分诊规则由本项目重写，凡属推断的地方在文内明确标注；
- 做过逐字比对：13 个模块与开发期中文机翻（856 篇正文）之间，**12 个连续汉字的逐字重合为 0**。
  也就是说，模块不是把机翻换个说法，而是重新组织过的独立表述。

## 使用范围

- 代码（`lib/`、`skill/scripts/`、`scripts/`）：MIT，见 [LICENSE](LICENSE)。
- 中文知识模块（`skill/references/`、`skill/SKILL.md`、`skill/agents/`）：CC BY-SA 4.0。
- AAD 内容：版权归 AAD，本项目不再分发其正文。

## 非医疗建议

本项目内容为科普资料整理，**不构成医疗建议**，不能替代专业医生的诊断与治疗。任何健康问题请咨询有执照的医疗专业人员。

## 下架请求

若 AAD 或权利人认为本项目的使用超出合理范围，作者将在收到通知后立即停止抓取并删除相关内容。
