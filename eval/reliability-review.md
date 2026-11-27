# 知识可靠性与实际使用复测

日期：2026-11-27。对象为当时知识审校后的本地未发布候选，不是 npm 0.2.0 的质量声明。后续已增加知识链接并调整检索验收口径，见[链接式探索验证](<linked-navigation.md>)；本文指纹、测试数量与首条排名仅记录当时快照。

## 范围与方法

- 审校全部 13 个模块：12 个医学知识模块重整，学习模块同步概念路由与小节标题。
- 三个独立干净上下文 agent 先测日常问答、连续学习、证据与风险；随后并行修订知识与检索，再由新的独立 agent 复测。
- 场景全部为合成输入；未读取真实个人档案或宿主记忆，未写学习状态。
- 最终工具候选指纹：`20a2a2d5016db10c82919077c937e8a879f896bcbded8fa8a0d2c2e49e19d93b`。指纹覆盖排序后的脚本、方法、知识模块、运行代码，以及 Skill 入口和包清单的路径与字节。
- 测试使用当前宿主默认子代理路由；没有跨模型随机对照，也没有真实学习者理解度反馈。

## 知识修正

| 问题 | 修订后的处理 |
| --- | --- |
| 调整一周好转即可排除皮肤病 | 好转只作线索，不证明因果或排除疾病 |
| 护理做满四周才可就医 | 撤销统一门槛，分开急救危险、及时评估与一般咨询 |
| 湿疹三分钟与毛周角化五分钟合成全民上限 | 分别保留适用人群和条件，干后仍可保湿 |
| 痤疮联合治疗四至八周当作保湿单品起效时间 | 明确来自药物、洁面、保湿的联合方案，不外推 |
| 只有防晒有效、任何外用都不影响结构 | 按具体目标与来源讨论，不做全称否定 |
| 孕期避免、限用、研究不足混成禁用表 | 分层表达，保留成分、途径、浓度与医生评估条件 |
| 标题绝对化、正文再否定标题 | 改写标题并同步学习导航 |
| 默认减法、固定数量动作与用户分级 | 移除强制流程，保留可选讨论方法 |

审校实际读取了分配模块的相关 AAD 教育页，部分通过 `web_fetch` 正文、部分通过 `read_page` 云端 Markdown 提取；工具端点失败不被当作 AAD 源站失效。未核验的精确数字、地区药政和旁支结论被移除或收窄。没有声称系统评价了 AAD 背后的所有原始研究，也没有逐一复核索引内全部页面。

关键核对来源示例：

- [预算与基础护理](https://www.aad.org/public/everyday-care/skin-care-basics/care/skin-care-budget)
- [保湿选择](https://www.aad.org/public/everyday-care/skin-care-basics/dry/pick-moisturizer)
- [干燥护理](https://www.aad.org/public/everyday-care/skin-care-basics/dry/dermatologists-tips-relieve-dry-skin)
- [痤疮治疗中的保湿](https://www.aad.org/public/diseases/acne/skin-care/moisturizer)
- [儿童湿疹冬季护理](https://www.aad.org/public/diseases/eczema/childhood/itch-relief/winter-care)
- [毛周角化自护](https://www.aad.org/public/diseases/a-z/keratosis-pilaris-self-care)
- [皮疹就医信号](https://www.aad.org/public/everyday-care/itchy-skin/rash/rash-101)
- [防晒用法](https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen)
- [维 A 类与视黄醇](https://www.aad.org/public/everyday-care/skin-care-secrets/anti-aging/retinoid-retinol)
- [孕期护肤](https://www.aad.org/public/everyday-care/skin-care-secrets/routine/pregnancy-skin-care)
- [痘疤治疗](https://www.aad.org/public/diseases/acne/derm-treat/scars/treatment)

## 检索修正与最终独立结果

采用零依赖分词、领域别名、短语和标题权重、定义引导、结果多样性与未知词覆盖判断。不将相关性分数当证据强度。

| 实际查询 | 最终复测结果 |
| --- | --- |
| 保湿 | 首条为保湿机制，不再先给面膜 |
| 我需要加精华吗 | 首条为精华是否必需的直接讨论 |
| A醇 | 首条为 retinol、retinoids、tretinoin 的概念区别 |
| 微湿 | 可检出；前五含一般洗后保湿，首条仍偏指甲护理 |
| 3分钟 / 5分钟 | 可检出带空格的原文；区分人群，五分钟不误匹配十五或二点五分钟 |
| 保湿 3分钟 5分钟 多久 | 命中不能合并成统一上限的段落，可继续读相邻人群条件 |
| 脸肿 嘴唇肿 喘 | 命中立即求医的例子；核心急救条件需按入口继续读就医模块 |
| 外泌体面霜 三天逆转皮肤年龄 | 预期无命中，退出码 1；不拿普通面霜资料冒充该宣称证据 |

结果显式给出原段范围、实际片段位置与段落引用状态。列表项、表格行不借用相邻来源；`not-claim-verified` 不是失败状态，而是提醒未进行逐断言语义认证。

## 对话复测

独立复测能直接回应简单问题、认可合理流程保持现状、按用户要求换比喻而不出题；缺少历史时询问接续点，不编造记忆或掌握程度。风险案例优先急救，不安排观察；改善不排除疾病；不同疾病的时间窗不合并；未知成品宣称不伪证。

一次中间 QA 与编辑并发，其检索前后变化不计作冻结版通过。之后两组使用固定知识候选复测，发现短词、数字空格与排序缺陷；修正后新增一组独立工具复验，未发现本轮场景的阻断问题。最终知识内容未因这次工具修正发生改变。

## 自动与加载验证

- `node --test tests/*.mjs`：67 项通过，含检索质量、数字边界、旧危险句回归、引用解析、只读兼容、导航及包清单边界。
- 引用审计：409 处标记、74 个唯一来源，解析问题为 0。数量减少来自删除重复与无支持外推，不是质量评分；解析通过不等于医学核验通过。
- 最终候选实际打包后从异目录运行检索与审计通过；38 个发布文件，包内无 Python 运行脚本、AAD 原文或机翻。打包时源码核心指纹与最终冻结候选一致。
- 当前 DSH 经插件管理器重新启用后返回 `applied`，无警告；实际 `skill` 加载已包含新版别名、拆词、片段范围与证据边界说明。
- 旧个人档案未读取或修改；未发布 npm，未修改市场条目。

## 剩余边界

词面检索不保证每个自然长问句都命中；低 limit 可能漏掉必要人群条件，短词的首条也可能偏特定部位。必须结合小节上下文和模块导航，不能只拿 top 1 回答。离线结果不替代最新原文核对。跨模型稳定性、真实学习效果和全部医学事实的独立专业审查仍未验证。
