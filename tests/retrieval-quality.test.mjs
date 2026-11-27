import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import { searchReferences, searchIndex, loadIndex, SKILL_DIR } from '../skill/scripts/lookup.mjs'

const inModule = (hit, prefix) => basename(hit.path).startsWith(prefix)
// Smoke-test usable entry points, not a complete answer or exact top-one ranking.
// Multi-step reachability and named relationships are covered by navigation.test.mjs;
// citations remain paragraph-level metadata, including uncited navigation results.
for (const query of ['洗后紧绷', '紧绷', '洗脸后发紧', '洗完脸紧绷怎么办', '洗脸后脸很紧怎么办']) {
  test(`${query}: cleansing context is accessible directly or through a named link`, () => {
    const hits = searchReferences(query, { limit: 5 })
    assert.ok(hits.some(h =>
      (inModule(h, '01-') && /洗过头|过度清洁/.test(h.section)) ||
      (h.snippet.includes('<01-清洁.md>') && h.snippet.includes('洗过头的信号和修复'))))
    assert.ok(new Set(hits.map(h => h.path)).size >= 2)
  })
}
test('补水 保湿 provides an entry into the moisturizing knowledge', () => {
  const hits = searchReferences('补水 保湿', { limit: 5 })
  assert.ok(hits.some(h => inModule(h, '02-')))
})
test('精华 results distinguish navigation or notes from verified evidence', () => {
  const hits = searchReferences('精华', { limit: 5 })
  assert.ok(hits.length)
  for (const hit of hits) {
    assert.equal(hit.evidence.scope, 'paragraph-citations')
    assert.equal(hit.evidence.verification, 'not-claim-verified')
    assert.match(hit.evidence.note, /不是逐断言验证/)
  }
})
for (const [query, module] of [
  ['补涂', '03-'], ['防晒', '03-'], ['游泳后如何补涂', '03-'],
  ['去角质', '01-'], ['痘痘', '06-'], ['痘印', '07-'], ['色素沉着', '07-'],
  ['屏障', '05-'], ['湿疹', '08-'], ['神经酰胺', '02-'], ['凡士林', '02-'],
  ['玻尿酸保湿', '02-'], ['无香精', '05-'],
]) {
  test(`${query}: relevant module appears without a fixed paragraph`, () => {
    assert.ok(searchReferences(query, { limit: 5 }).some(h => inModule(h, module)))
  })
}
for (const query of ['外泌体面霜 三天逆转皮肤年龄', '外泌体 保湿', '量子修复防晒霜', '不存在的xyz', 'xyzzy皮肤年龄', '的', '保', '皮肤', '.*']) {
  test(`${query}: unsupported/low-information query has no result`, () => {
    assert.deepEqual(searchReferences(query), [])
  })
}
test('natural concept question offers a moisturizing entry point', () => {
  const hits = searchReferences('补水和保湿有什么区别', { limit: 5 })
  assert.ok(hits.some(h => inModule(h, '02-')))
})
for (const [query, module] of [['我需要加精华吗', '09-'], ['A醇', '12-'], ['A 醇', '12-'], ['脸肿 嘴唇肿 喘', '10-']]) {
  test(`${query}: question words, mixed scripts and symptom aliases stay searchable`, () => {
    assert.ok(searchReferences(query, { limit: 5 }).some(h => inModule(h, module)))
  })
}
test('source index does not hide an unknown claim behind a familiar topic', () => {
  const index = loadIndex()
  assert.deepEqual(searchIndex('exosome sunscreen', index), [])
  assert.ok(searchIndex('sunscreen', index).length)
})
test('common concepts provide relevant starting modules without a top-one contract', () => {
  for (const [query, prefix] of [['保湿', '02-'], ['A醇', '12-'], ['我需要加精华吗', '09-']]) {
    assert.ok(searchReferences(query, { limit: 5 }).some(hit => inModule(hit, prefix)))
  }
})
test('short literal words and numeric spacing remain discoverable', () => {
  for (const query of ['微湿', '3分钟', '3 分钟', '5分钟']) assert.ok(searchReferences(query, { limit: 5 }).some(h => inModule(h, '02-')))
})
test('numeric search respects complete values and original snippet offsets', t => {
  const root = fixture(t, { 'time.md': '# 使用条件\n\n15 分钟。[s:care]\n\n2.5 分钟。[s:care]\n\n' + '背景。'.repeat(180) + '\n5 分钟内保湿。[s:care]\n' })
  const hits = searchReferences('5分钟', { root, rows })
  assert.equal(hits.length, 1)
  assert.match(hits[0].snippet, /5 分钟/)
  assert.ok(hits[0].snippetRange.startOffset > 0)
  assert.doesNotMatch(hits[0].snippet, /15|2\.5/)
})
function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'skincare-retrieval-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'references'))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, 'references', name), text)
  return root
}
const rows = [{ id: 'care', slug: 'public/care', title: 'Care', url: 'https://www.aad.org/public/care' }]
test('exact phrases beat scattered mentions; titles do not create body matches', t => {
  const root = fixture(t, {
    'a.md': '# 保湿\n\n## 洗脸后发紧\n\n完全无关文字。\n\n## 经验\n\n洗脸后发紧，检查清洁。\n',
    'b.md': '# 经验\n\n洗完后另有事情。之后感觉发紧。\n',
  })
  const hits = searchReferences('洗脸后发紧', { root, rows })
  assert.match(hits[0].snippet, /洗脸后发紧/)
  assert.ok(hits.every(h => !h.snippet.includes('完全无关')))
})
test('diversity reranks repeated modules and sections, not fixed filename priority', t => {
  const root = fixture(t, {
    '00.md': '# 概览\n\n## 摘要\n\n紧绷甲。\n\n紧绷乙。\n\n紧绷丙。\n\n紧绷丁。\n',
    '20.md': '# 清洁\n\n## 信号\n\n紧绷戊。\n',
    '30.md': '# 屏障\n\n## 表现\n\n紧绷己。\n',
  })
  const hits = searchReferences('紧绷', { root, rows, limit: 4 })
  assert.equal(new Set(hits.slice(0, 3).map(h => h.path)).size, 3)
  assert.ok(hits[3].ranking.diversityFactor < 1)
  assert.ok(hits.every(h => Number.isFinite(h.score) && h.score > 0))
})
test('snippet seeks strongest local match and exposes exact original paragraph offsets', t => {
  const text = `防晒只是开头。${'背景文字。'.repeat(110)}\n游泳后补涂防晒，这才是问题重点。${'后续背景。'.repeat(110)}\n本段来源标记。[s:care]`
  const root = fixture(t, { 'window.md': '# 防晒\n\n' + text + '\n' })
  const [hit] = searchReferences('游泳后补涂防晒', { root, rows })
  assert.match(hit.snippet, /游泳后补涂防晒/)
  const range = hit.snippetRange
  assert.ok(range.startOffset > 0)
  assert.equal(range.truncated, true)
  assert.equal(range.offsetUnit, 'UTF-16')
  assert.equal(hit.snippet, '…' + text.slice(range.startOffset, range.endOffset).replace(/\s+/g, ' ') + '…')
  assert.ok(range.lineStart >= hit.lineStart && range.lineEnd <= hit.lineEnd)
  assert.deepEqual(hit.sourceSlugs, ['public/care'])
  assert.doesNotMatch(hit.snippet, /\[s:care\]/)
  assert.match(hit.evidence.note, /截取片段可能不含对应支持句/)
  assert.equal(hit.evidence.lineEnd, hit.lineEnd)
})
test('list boundaries never borrow a following item citation; related terms alone do not qualify', t => {
  const root = fixture(t, { 'items.md': '# 保湿\n\n- 精华不是必需品。\n- 面霜选择。[s:care]\n\n## 作用机制\n\n没有查询词。\n' })
  const [hit] = searchReferences('精华', { root, rows })
  assert.deepEqual(hit.sourceSlugs, [])
  assert.equal(hit.evidence.citationCount, 0)
  assert.deepEqual(searchReferences('补水', { root, rows }), [])
})
test('table rows do not inherit citations from adjacent rows', t => {
  const root = fixture(t, { 'table.md': '# 产品\n\n| 类别 | 说明 |\n|---|---|\n| 精华 | 本项目整理 |\n| 面霜 | 来源说明 [s:care] |\n' })
  const [hit] = searchReferences('精华', { root, rows })
  assert.deepEqual(hit.sourceSlugs, [])
  assert.equal(hit.lineStart, hit.lineEnd)
})
test('CLI no-hit remains empty JSON with nonzero status outside skill directory', () => {
  const run = spawnSync(process.execPath, [join(SKILL_DIR, 'scripts/lookup.mjs'), '外泌体面霜 三天逆转皮肤年龄', '--references', '--json'], { cwd: tmpdir(), encoding: 'utf8' })
  assert.equal(run.status, 1)
  assert.deepEqual(JSON.parse(run.stdout), [])
  assert.match(run.stderr, /没有命中/)
})
