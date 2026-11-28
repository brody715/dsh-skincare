#!/usr/bin/env node
/** Offline metadata/citation and Chinese paragraph lookup. Never reads core, corpus or profiles. */
import { readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { readBounded } from './read-bounded.mjs'

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const citations = text => [...text.matchAll(/\[s:([^\]]+)\]/g)].map(m => m[1].trim())
const placeholder = s => /^(slug|<.*|\.\.\.|…|slug>|xxx)$/i.test(s)
export function loadIndex(root = SKILL_DIR) {
  const path = join(root, 'sources/index.jsonl')
  const seen = new Set()
  return readBounded(path, 8 * 1024 * 1024).split(/\r?\n/).flatMap((line, i) => {
    if (!line.trim()) return []
    let row
    try { row = JSON.parse(line) } catch { throw new Error(`索引 JSON 损坏: ${path}:${i + 1}`) }
    if (!row || !['id', 'slug', 'title', 'url'].every(k => typeof row[k] === 'string' && row[k])) throw new Error(`索引字段无效: ${path}:${i + 1}`)
    const url = new URL(row.url)
    if (url.protocol !== 'https:' || !['aad.org', 'www.aad.org'].includes(url.hostname) || url.username || url.password || url.port) throw new Error(`索引 URL 不是 AAD HTTPS: ${path}:${i + 1}`)
    if (seen.has(row.slug)) throw new Error(`索引重复 slug: ${row.slug}`)
    seen.add(row.slug)
    return [row]
  })
}
export function resolveSlug(fragment, rows) {
  const f = fragment.trim().replace(/^\/+|\/+$/g, '')
  if (!f) throw new Error('slug 不能为空')
  const exact = rows.find(r => r.slug === f)
  const hits = exact ? [exact] : rows.filter(r => r.slug.endsWith('/' + f))
  if (hits.length !== 1) throw new Error(hits.length ? `引用有歧义: ${f}\n候选: ${hits.slice(0, 10).map(r => r.slug).join(', ')}` : `slug 不存在: ${f}`)
  return hits[0]
}
function markdownFiles(root, folder) {
  try { return readdirSync(join(root, folder), { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.md')).map(e => join(root, folder, e.name)).sort() }
  catch (e) { if (e.code === 'ENOENT') return []; throw e }
}
export function audit(root = SKILL_DIR, rows = loadIndex(root)) {
  const files = [...markdownFiles(root, 'references'), ...markdownFiles(root, 'agents'), join(root, 'SKILL.md')]
  const problems = []; const seen = new Set(); let total = 0
  for (const path of files) {
    let text
    try { text = readBounded(path, 512 * 1024) } catch (e) { if (e.code === 'ENOENT') continue; throw e }
    text.split(/\r?\n/).forEach((line, i) => {
      for (const fragment of citations(line).filter(s => !placeholder(s))) {
        total++; seen.add(fragment)
        try { resolveSlug(fragment, rows) } catch (e) { problems.push({ path, line: i + 1, fragment, error: e.message }) }
      }
    })
  }
  return { total, unique: seen.size, problemCount: problems.length, problems: problems.slice(0, 50), truncated: problems.length > 50 }
}
// Small, reviewable vocabulary, not query-to-document routing. Alternatives are
// lexical/domain concept aliases (补水/吸水/保水 are retrieval concepts, not a
// claim of physiological equivalence). RELATED expansions never establish coverage.
// Weights: literal unit 8, alias 6, phrase (>3 chars) 12, related concept 3;
// leaf title 0.8 (primary clause 0.65, full title 0.15), ancestors 0.2.
// Definition introductions +12, other definition paragraphs +6, with context match;
// inline bold headings 0.8; citation navigation +4 is not evidence.
// Coverage >=0.65 (two-unit queries require 0.95); repeat module/section *=0.82/0.6.
const ALIASES = [
  ['紧绷', '发紧', '绷紧', '很紧'], ['洗后', '洗完', '洁面后', '洗脸后'],
  ['清洁', '洁面', '洗脸'], ['痤疮', '痘痘', '长痘'], ['闭口', '粉刺'],
  ['色沉', '色素沉着'], ['脱屑', '起皮', '脱皮'], ['泛红', '发红'],
  ['透明质酸', '玻尿酸'], ['视黄醇', 'retinol', 'a醇', 'a 醇'], ['无香精', 'fragrance-free'],
  ['面部肿胀', '脸肿', '面部肿'], ['嘴唇', '唇部'], ['肿胀', '肿'],
  ['呼吸困难', '喘', '气喘', '喘不过气', '喘不上气'],
  ['补涂'], ['保湿'], ['补水', '吸水', '保水'], ['精华'], ['防晒'], ['屏障'], ['痘印'],
  ['神经酰胺'], ['烟酰胺'], ['水杨酸'], ['过氧化苯甲酰'], ['去角质'],
  ['锁水'], ['柔润'], ['面膜'], ['面霜'], ['油皮', '油性皮肤'], ['干皮', '干性皮肤'],
]
const RELATED = { 紧绷: ['洗过头', '过度清洁'], 补水: ['吸水', '锁水', '保水', '作用机制'], 保湿: ['吸水', '锁水', '柔润'] }
const STOP = new Set(['的', '了', '我', '是', '和', '与', '后', '吗', '呢', '要', '用', '在', '很', '有', '不', '怎么', '如何', '什么', '可以', '是不是', '为什么', '需要', '一个', '还是', '应该', '以后', '怎么办', '办', '必要', '脸', '上', '敷', '加', '给', '区别', '懂', '了解', '也', '到底', '要不要', '能不能', '有没有'])
const GENERIC = new Set(['皮肤', '产品', '年龄', '效果', '护肤', '修复'])
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
const vocabulary = ALIASES.flat().sort((a, b) => b.length - a.length)
const cleanText = text => text.toLowerCase().replace(/\[s:[^\]]+\]/g, '').replace(/`[^`]*\.md`/g, '').replace(/(\d)\s+(?=分钟|小时|个月|天|周|月|次|%)/g, '$1')
function termsFor(query) {
  if (!query.trim() || query.length > 256) throw new Error('查询须为 1–256 字符')
  const lower = query.toLowerCase().trim()
  const tokens = []
  // Longest domain word first; ICU handles other words. Keep unknown words in
  // the coverage denominator instead of reducing a novel claim to '皮肤/年龄'.
  let rest = lower
  while (rest) {
    // Numeric units are one literal search term; typography (3 分钟 / 3分钟)
    // must not change retrieval, and this does not equate different time units.
    const measurement = rest.match(/^\d+(?:\.\d+)?\s*(?:分钟|小时|个月|天|周|月|次|%)/u)?.[0]
    if (measurement) { tokens.push(measurement.replace(/\s+/g, '')); rest = rest.slice(measurement.length); continue }
    const word = vocabulary.find(w => rest.startsWith(w))
    if (word) { tokens.push(word); rest = rest.slice(word.length); continue }
    let next = [...segmenter.segment(rest)][0].segment
    // ICU can join a verb to half a domain term (敷面 + 膜). Do not consume
    // through the start of a known term; unknown prefixes still count as unknown.
    for (const term of vocabulary) {
      const boundary = rest.indexOf(term)
      if (boundary > 0 && boundary < next.length) next = rest.slice(0, boundary)
    }
    if (/^[\p{L}\p{N}-]+$/u.test(next) && !STOP.has(next)) tokens.push(next)
    rest = rest.slice(next.length)
  }
  // ICU sometimes splits a legitimate short word such as 微湿 into two
  // single characters. Preserve the exact short query instead of inventing
  // bigram matches for arbitrary long sentences or unknown product claims.
  if (/^[\p{Script=Han}]{2,4}$/u.test(lower) && tokens.length > 1 && tokens.every(t => t.length === 1)) tokens.splice(0, tokens.length, lower)
  const units = [...new Set(tokens)].map(token => ({ token, alternatives: ALIASES.find(g => g.includes(token)) || [token], weight: GENERIC.has(token) ? 0.2 : 1 }))
  return { exact: lower.split(/[\s,，。？！、;；]+/u).filter(t => t.length >= 2 && !STOP.has(t)), units,
    related: [...new Set(units.flatMap(u => RELATED[u.alternatives[0]] || []))] }
}
function hasTerm(text, term) {
  const numeric = term.match(/^(\d+(?:\.\d+)?)(分钟|小时|个月|天|周|月|次|%)$/u)
  if (numeric) return new RegExp('(?<![\\d.])' + numeric[1].replace(/\./g, '\\.') + numeric[2]).test(text)
  return text.includes(term)
}
function matches(text, terms) {
  const lower = cleanText(text)
  return terms.units.filter(u => (u.token.length >= 2 || u.alternatives.some(t => t.length >= 2)) && u.alternatives.some(t => hasTerm(lower, t)))
}
function scoreText(text, terms) {
  const lower = cleanText(text)
  return matches(text, terms).reduce((n, u) => n + 8 * u.weight * (hasTerm(lower, u.token) ? 1 : 0.75), 0)
    + terms.exact.reduce((n, t) => n + (t.length > 3 && hasTerm(lower, t) ? 12 : 0), 0)
    + terms.related.reduce((n, t) => n + (lower.includes(t) ? 3 : 0), 0)
}
function excerpt(text, terms, lineStart) {
  // Find the highest scoring local window, not the first common-character hit.
  // Offsets refer to the original paragraph (UTF-16), not flattened text.
  const lower = text.toLowerCase()
  const needles = [...terms.exact, ...terms.units.flatMap(u => u.alternatives).filter(t => t.length >= 2)]
  const positions = [0]
  for (const needle of needles) {
    const numeric = needle.match(/^(\d+(?:\.\d+)?)(分钟|小时|个月|天|周|月|次|%)$/u)
    if (numeric) for (const match of lower.matchAll(new RegExp(numeric[1].replace(/\./g, '\\.') + '\\s*' + numeric[2], 'g'))) positions.push(Math.max(0, match.index - 60))
    let p = lower.indexOf(needle)
    while (p >= 0) { positions.push(Math.max(0, p - 60)); p = lower.indexOf(needle, p + needle.length) }
  }
  const start = [...new Set(positions)].map(start => ({ start, score: scoreText(text.slice(start, start + 420), terms) }))
    .sort((a, b) => b.score - a.score || a.start - b.start)[0].start
  const end = Math.min(text.length, start + 420)
  return { snippet: (start ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ') + (end < text.length ? '…' : ''),
    snippetRange: { startOffset: start, endOffset: end, offsetUnit: 'UTF-16', lineStart: lineStart + text.slice(0, start).split('\n').length - 1, lineEnd: lineStart + text.slice(0, end).split('\n').length - 1, truncated: start > 0 || end < text.length } }
}
export function searchReferences(query, { root = SKILL_DIR, rows = loadIndex(root), limit = 8 } = {}) {
  checkLimit(limit)
  const terms = termsFor(query); const results = []
  for (const path of markdownFiles(root, 'references')) {
    const lines = readBounded(path, 512 * 1024).split(/\r?\n/)
    let headings = []; let start = -1; let sectionParagraphIndex = 0
    const flush = end => {
      if (start < 0) return
      const text = lines.slice(start, end).join('\n')
      // Heading boosts only paragraphs that actually match; do not return entire unrelated sections.
      const bodyScore = scoreText(text, terms)
      const matched = matches(text, terms)
      const covered = matches(text + '\n' + headings.join(' '), terms)
      const coverage = covered.reduce((n, u) => n + u.token.length * u.weight, 0) / (terms.units.reduce((n, u) => n + u.token.length * u.weight, 0) || 1)
      if (matched.some(u => u.weight === 1) && coverage >= (terms.units.length === 2 ? 0.95 : 0.65)) {
        const fragments = [...new Set(citations(text))]
        const sources = []; const unresolved = []
        for (const f of fragments) { try { sources.push(resolveSlug(f, rows).slug) } catch { unresolved.push(f) } }
        const section = headings.filter(Boolean).join(' > ')
        const leaf = headings.at(-1) || ''
        const headingDensity = Math.min(1, 12 / Math.max(1, leaf.length))
        const primaryHeading = leaf.split(/[，：:]/u)[0]
        const inlineHeading = text.match(/^\*\*([^*]+)\*\*/u)?.[1] || ''
        const headingScore = (scoreText(primaryHeading, terms) * 0.65 + scoreText(leaf, terms) * 0.15) * headingDensity + scoreText(headings.slice(0, -1).join(' '), terms) * 0.2 + scoreText(inlineHeading, terms) * 0.8
        // A matching concept's introduction should precede incidental examples.
        // The parent heading supplies context for headings such as 三种作用机制.
        const definitionBonus = terms.units.length <= 2 && /机制|是什么|含义|区别|定义|差异/.test(leaf) && scoreText(headings.join(' '), terms) > 0 ? (sectionParagraphIndex === 0 ? 12 : 6) : 0
        const sectionFactor = /自测|练习|最该记住|常见错误/.test(section) ? 0.65 : 1
        // Small source-navigation bonus only; it is NOT a support/evidence rating.
        const citationNavigationBonus = sources.length ? 4 : 0
        const baseScore = (bodyScore + headingScore + definitionBonus + citationNavigationBonus) * coverage * sectionFactor
        results.push({ kind: 'reference', path, section, lineStart: start + 1, lineEnd: end, ...excerpt(text, terms, start + 1), sourceSlugs: [...new Set(sources)].slice(0, 12), unresolvedCitations: unresolved.slice(0, 12),
          evidence: { scope: 'paragraph-citations', verification: 'not-claim-verified', note: '仅本段引用及 slug 解析，不是逐断言验证；引用范围为完整段落，截取片段可能不含对应支持句。', lineStart: start + 1, lineEnd: end, citationCount: fragments.length },
          ranking: { matchedTerms: matched.map(u => u.token), matchedLexemes: matched.map(u => ({ queryTerm: u.token, textTerms: u.alternatives.filter(t => hasTerm(cleanText(text), t)) })), coveredTerms: covered.map(u => u.token), coverage, bodyScore, headingScore, definitionBonus, citationNavigationBonus, sectionFactor, baseScore }, score: baseScore })
      }
      sectionParagraphIndex++
      start = -1
    }
    lines.forEach((line, i) => {
      const h = line.match(/^(#{1,6})\s+(.+)$/)
      if (h) { flush(i); sectionParagraphIndex = 0; headings = headings.slice(0, h[1].length - 1); headings[h[1].length - 1] = h[2]; return }
      if (!line.trim()) { flush(i); return }
      // List items and table rows are separate citation units: do not borrow
      // the next item's/row's source, even without intervening blank lines.
      if (/^\s*(?:[-*+] |\d+\. |\|)/.test(line)) flush(i)
      if (start < 0) start = i
    })
    flush(lines.length)
  }
  const selected = []; const modules = new Map(); const sections = new Map()
  while (results.length && selected.length < limit) {
    for (const r of results) {
      const diversity = 0.82 ** (modules.get(r.path) || 0) * 0.6 ** (sections.get(r.path + r.section) || 0)
      r.score = r.ranking.baseScore * diversity
      r.ranking.diversityFactor = diversity
    }
    results.sort((a, b) => b.score - a.score || b.ranking.coverage - a.ranking.coverage || a.snippet.length - b.snippet.length || a.path.localeCompare(b.path) || a.lineStart - b.lineStart)
    const hit = results.shift(); selected.push(hit)
    modules.set(hit.path, (modules.get(hit.path) || 0) + 1)
    sections.set(hit.path + hit.section, (sections.get(hit.path + hit.section) || 0) + 1)
  }
  return selected
}
function checkLimit(limit) { if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('--limit 须为 1–20 的整数') }
export function searchIndex(query, rows, limit = 8) {
  checkLimit(limit); const terms = termsFor(query)
  return rows.flatMap(r => {
    const text = r.title + ' ' + r.slug
    const matched = matches(text, terms)
    const coverage = matched.reduce((n, u) => n + u.token.length * u.weight, 0) / (terms.units.reduce((n, u) => n + u.token.length * u.weight, 0) || 1)
    if (!matched.some(u => u.weight === 1) || coverage < (terms.units.length === 2 ? 0.95 : 0.65)) return []
    return [{ kind: 'source', ...r, score: scoreText(text, terms), coverage }]
  }).sort((a, b) => b.score - a.score).slice(0, limit)
}
const HELP = `用法: node lookup.mjs [关键词] [--limit 1..20] [--json] [--references] [--in-scope]
  --url SLUG / --check SLUG   唯一后缀解析与原文地址
  --read SLUG                标题与原文链接（不读取 corpus/core，不联网）
  --audit                    校验 references、agents、SKILL.md 引用
  --topics / --topic ID       主题树 / 主题来源页
中文关键词自动搜 references 段落；--references 仅搜中文模块。
搜索是词面匹配，不是医学证据验证；无引用段落的 sourceSlugs 为空。`
export function main(argv = process.argv.slice(2)) {
  const { values: v, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    url: { type: 'string' }, check: { type: 'string' }, read: { type: 'string' }, audit: { type: 'boolean' }, topics: { type: 'boolean' }, topic: { type: 'string' }, references: { type: 'boolean' }, json: { type: 'boolean' }, 'in-scope': { type: 'boolean' }, limit: { type: 'string', default: '8' }, help: { type: 'boolean', short: 'h' }
  } })
  if (v.help) { console.log(HELP); return 0 }
  const modes = ['url', 'check', 'read', 'audit', 'topics', 'topic'].filter(k => v[k] !== undefined)
  if (modes.length > 1 || (modes.length && (positionals.length || v.references || v['in-scope']))) throw new Error('操作参数互斥；关键词不能与 --url/--check/--read/--audit/--topic(s) 混用')
  const limit = Number(v.limit); checkLimit(limit)
  if (!modes.length && !positionals.length) { console.log(HELP); return 2 }
  const rows = loadIndex()
  const emit = result => console.log(JSON.stringify(result, null, 2))
  if (v.audit) { const report = audit(SKILL_DIR, rows); emit(report); return report.problemCount ? 1 : 0 }
  if (v.topics || v.topic) {
    const data = JSON.parse(readBounded(join(SKILL_DIR, 'sources/topics.json'), 2 * 1024 * 1024))
    const topics = Array.isArray(data) ? data : data.topics
    if (v.topics) emit(topics.map(t => ({ id: t.id, title_zh: t.title_zh, summary_zh: t.summary_zh, pageCount: t.page_ids.length })))
    else { const t = topics.find(t => t.id === v.topic); if (!t) throw new Error(`没有这个主题: ${v.topic}`); emit({ ...t, pages: t.page_ids.map(id => rows.find(r => r.id === id) || { id, missing: true }) }) }
    return 0
  }
  if (modes.length) {
    const row = resolveSlug(v[modes[0]], rows)
    if (v.json) emit({ ...row, ...(v.read ? { note: '仅索引元数据。请用宿主网页工具打开原文核对；不读取本地原文或机翻缓存。' } : {}) })
    else if (v.url) console.log(row.url)
    else if (v.check) console.log(`${row.slug}\n  ${row.url}`)
    else console.log(`# ${row.title}\nslug: ${row.slug}\n原文: ${row.url}\n仅索引元数据，不是原文正文。用宿主网页工具打开原文核对；不自动读取 corpus/core。`)
    return 0
  }
  const query = positionals.join(' ')
  const selected = v['in-scope'] ? rows.filter(r => r.in_scope !== false) : rows
  const refs = searchReferences(query, { rows, limit }).filter(r => !v['in-scope'] || r.sourceSlugs.some(s => selected.some(row => row.slug === s)))
  const results = (v.references ? refs : [...refs, ...searchIndex(query, selected, limit)]).sort((a, b) => b.score - a.score).slice(0, limit)
  if (v.json) emit(results)
  else for (const r of results) {
    if (r.kind === 'reference') console.log(`${r.path}:${r.lineStart}-${r.lineEnd}\n小节: ${r.section}\n${r.snippet}\n段落引用（仅解析 slug，未经逐断言验证；范围 ${r.lineStart}-${r.lineEnd}，片段${r.snippetRange.truncated ? '已截断' : '完整'}）: ${r.sourceSlugs.join(', ') || '（本段无引用；不可归为 AAD 原文）'}${r.unresolvedCitations.length ? '\n未解析引用: ' + r.unresolvedCitations.join(', ') : ''}\n`)
    else console.log(`${r.slug}\n${r.title}\n${r.url}\n`)
  }
  if (!results.length) {
    const known = [...new Set(termsFor(query).units.filter(u => ALIASES.some(g => g.includes(u.token)) || /^\d/.test(u.token)).map(u => u.alternatives[0]))].slice(0, 4)
    console.error(`没有命中: ${query}；没有单段或来源覆盖主要查询词。可拆成短关键词分别查找${known.length ? '（如 ' + known.join('、') + '）' : ''}，或用 --topics 导航。部分词命中不代表完整宣称有依据；数字条件应回到相应段落核对。`)
    return 1
  }
  return 0
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = main() } catch (e) { console.error(`lookup: ${e.message}`); process.exitCode = 1 }
}
