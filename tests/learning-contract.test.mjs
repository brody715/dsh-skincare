import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'

const learningUrl = new URL('../skill/references/11-学习路径.md', import.meta.url)
const learning = readFileSync(learningUrl, 'utf8')
const index = readFileSync(new URL('../skill/sources/index.jsonl', import.meta.url), 'utf8')
  .trim().split('\n').map(line => JSON.parse(line))

// Documentation contracts: these checks guard the published teaching material,
// not a claim that a language model or a user has learned its contents.
test('learning material belongs to the host agent and labels teaching design separately', () => {
  assert.match(learning, /同一个宿主 agent/)
  assert.match(learning, /教学设计，非 AAD 建议/)
  assert.match(learning, /索引命中只证明页面存在，不代表已核对原文/)
  assert.match(learning, /不从.{0,80}用户已掌握/)
  assert.match(learning, /不创建课程完成状态、认知等级或档案/)
  assert.match(learning, /科普不能代替临床诊断/)
})

test('no mandatory progress ladder, fixed study duration, or profile commands', () => {
  assert.doesNotMatch(learning, /\bL[0-3]\b|profile\.(?:py|mjs)|python3?|set-learning|log-done|set-stage/)
  assert.doesNotMatch(learning, /完成标志|掌握标准|升级门槛|不能跳|禁止跳|连续\s*\d+\s*天|每课\s*\d+|\d+\s*(?:分钟|小时)/)
  assert.doesNotMatch(learning, /```(?:sh|bash|shell|python)/)
  assert.match(learning, /不设等级门槛、固定学习时长、必修顺序或强制打卡/)
  assert.match(learning, /无需补课、提交作业或证明习惯稳定/)
})

test('user questions can route directly to independent topics including advanced questions and care', () => {
  const routes = learning.split('## 按用户问题路由')[1]?.split('## 概念关系')[0]
  assert.ok(routes, 'missing question-driven routing section')
  assert.match(routes, /每个入口都可以独立使用/)
  for (const topic of ['00-框架', '01-清洁', '02-保湿', '03-防晒', '04-肤质与分龄',
    '05-屏障与刺激', '06-痤疮', '07-痘印与色沉', '08-炎症性皮肤病',
    '09-产品与标签', '10-何时就医', '12-抗老与光老化']) {
    assert.ok(routes.includes(`${topic}.md`), `missing route: ${topic}`)
  }
  assert.match(routes, /能直接讲 A 醇和光老化吗/)
  assert.match(routes, /优先风险辨识与就诊准备，不先安排学习/)
  assert.match(learning, /用户没有请求练习或计划，就停在当前问题的答案/)
})

test('concept relationships and optional scenarios include discriminating follow-ups', () => {
  assert.match(learning, /箭头表示「有助于理解」，不是「完成前者才能问后者」/)
  const scenarios = learning.split('## 误解、情境例子与追问判别')[1]?.split('## 安全细节')[0]
  assert.ok(scenarios)
  const cards = scenarios.split(/^### /m).slice(1)
  assert.ok(cards.length > 0, 'missing reusable teaching cards')
  for (const card of cards) {
    for (const field of ['可能的误解', '情境', '可选追问', '判别线索', '来源入口']) {
      assert.ok(card.includes(`**${field}**`), `${card.split('\n')[0]} lacks ${field}`)
    }
  }
  assert.match(scenarios, /例子是假设情境，不是对当前用户的评估/)
  assert.match(scenarios, /不要求提交照片、完成观察周期或继续试产品才能求医/)
})

test('every retained citation uniquely resolves to a real source slug', () => {
  const citations = [...learning.matchAll(/\[s:([^\]]+)\]/g)].map(match => match[1])
  assert.ok(citations.length > 0, 'retain relevant evidence entry points')
  for (const citation of new Set(citations)) {
    const matches = index.filter(row => row.slug.includes(citation))
    assert.equal(matches.length, 1, `citation must resolve uniquely: ${citation}`)
    assert.match(matches[0].url, /^https:\/\/www\.aad\.org\//)
  }
})

test('knowledge references use existing files and named sections, not stale line numbers', () => {
  const links = [...learning.matchAll(/\]\(<([^>]+)>\)/g)].map(match => match[1])
  for (const link of links) {
    assert.ok(existsSync(new URL(link, learningUrl)), `missing linked resource: ${link}`)
  }
  assert.doesNotMatch(learning, /#L\d+|第\s*\d+\s*[–-]\s*\d+\s*节|第\s*\d+\s*行/)
  // Each named relationship endpoint is a heading in the referenced module.
  const relations = learning.split('## 概念关系')[1]?.split('## 误解')[0]
  const endpoints = [...relations.matchAll(/\]\(<([^>]+)>\)「([^」]+)」/g)]
  assert.ok(endpoints.length > 0)
  for (const [, path, heading] of endpoints) {
    const source = readFileSync(new URL(path, learningUrl), 'utf8')
    const headings = source.split('\n').filter(line => /^#{1,6} /.test(line))
      .map(line => line.replace(/^#{1,6} /, ''))
    assert.ok(headings.includes(heading), `missing section ${path}: ${heading}`)
  }
})

test('uncertain safety details are routed to verification rather than copied prescriptions', () => {
  assert.doesNotMatch(learning, /只涂脸约|脸约\s*1\s*茶匙|大于\s*2%|孕期不用|妊娠期间不用|隔天一次/)
  assert.match(learning, /具体剂量、覆盖部位与补涂条件应读/)
  assert.match(learning, /不能仅凭小节标题作一刀切禁用结论/)
  assert.match(learning, /疗效观察时间不是学习时长/)
  assert.match(learning, /无法读取原文时说明仅依据本地整理/)
})
