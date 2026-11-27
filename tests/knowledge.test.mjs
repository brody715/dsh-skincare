import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { loadIndex, resolveSlug, searchReferences, searchIndex, audit, SKILL_DIR } from '../skill/scripts/lookup.mjs'
import { readLegacyProfile, MAX_PROFILE_BYTES } from '../skill/scripts/legacy-profile.mjs'
import { readBounded } from '../skill/scripts/read-bounded.mjs'

const lookup = fileURLToPath(new URL('../skill/scripts/lookup.mjs', import.meta.url))
const legacy = fileURLToPath(new URL('../skill/scripts/legacy-profile.mjs', import.meta.url))
const row = slug => ({ id: slug.replaceAll('/', '__'), slug, title: 'Sunscreen basics', url: `https://www.aad.org/${slug}`, in_scope: true })
const rows = [row('public/a/care'), row('public/b/care'), row('public/sunscreen')]
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'skincare-knowledge-'))
  // Cleanup is restricted to this exact mkdtemp directory, never user locations.
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const d of ['references', 'agents', 'sources']) mkdirSync(join(root, d))
  writeFileSync(join(root, 'sources/index.jsonl'), rows.map(JSON.stringify).join('\n'))
  return root
}
function cli(script, args, cwd = tmpdir(), env = {}) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env }, timeout: 15000 })
}
test('slug exact precedence, unique suffix, ambiguity, missing and empty', () => {
  assert.equal(resolveSlug(' /sunscreen/ ', rows).slug, 'public/sunscreen')
  assert.equal(resolveSlug('public/a/care', rows).slug, 'public/a/care')
  assert.equal(resolveSlug('care', [...rows, row('care')]).slug, 'care')
  assert.throws(() => resolveSlug('care', rows), /歧义/)
  assert.throws(() => resolveSlug('missing', rows), /不存在/)
  assert.throws(() => resolveSlug('///', rows), /不能为空/)
})
test('Chinese paragraph search has exact path, heading, line range, snippet and resolved citations', t => {
  const root = fixture(t)
  const path = join(root, 'references/test.md')
  writeFileSync(path, '# 防晒\n\n## 补涂\n\n游泳以后补涂防晒。[s:sunscreen]\n第二行。\n\n无关内容。\n\n执行口径：防晒不等于诊断。\n')
  const hits = searchReferences('游泳以后', { root, rows, limit: 2 })
  assert.equal(hits.length, 1)
  assert.deepEqual({ path: hits[0].path, section: hits[0].section, start: hits[0].lineStart, end: hits[0].lineEnd }, { path, section: '防晒 > 补涂', start: 5, end: 6 })
  assert.match(hits[0].snippet, /游泳以后/)
  assert.deepEqual(hits[0].sourceSlugs, ['public/sunscreen'])
  assert.ok(searchReferences('游泳后如何补涂', { root, rows }).length, 'Chinese lexical units should find partial phrases without arbitrary bigrams')
  assert.equal(hits[0].evidence.scope, 'paragraph-citations')
  assert.equal(hits[0].evidence.verification, 'not-claim-verified')
  assert.equal(hits[0].snippetRange.truncated, false)
  assert.ok(hits[0].ranking.matchedTerms.includes('游泳'))
  assert.deepEqual(searchReferences('不存在的xyz', { root, rows }), [])
  const uncited = searchReferences('诊断', { root, rows })[0]
  assert.deepEqual(uncited.sourceSlugs, [], 'never borrow another paragraph citation')
})
test('search bounds, literal metacharacters and unresolved citation reporting', t => {
  const root = fixture(t)
  writeFileSync(join(root, 'references/test.md'), '# 示例\n\n' + Array.from({ length: 30 }, (_, i) => `防晒 ${i} ${'字'.repeat(600)} [s:care]`).join('\n\n'))
  const hits = searchReferences('防晒', { root, rows, limit: 3 })
  assert.equal(hits.length, 3)
  assert.ok(hits.every(h => h.snippet.length <= 422))
  assert.deepEqual(hits[0].unresolvedCitations, ['care'])
  assert.deepEqual(searchReferences('.*', { root, rows }), [])
  for (const limit of [0, -1, 21, 1.2, NaN]) assert.throws(() => searchReferences('防晒', { root, rows, limit }), /limit/)
  assert.throws(() => searchIndex(' ', rows), /查询/)
  assert.throws(() => searchIndex('a'.repeat(257), rows), /查询/)
})
test('audit reports broken and ambiguous citations with file lines, ignores placeholders', t => {
  const root = fixture(t)
  writeFileSync(join(root, 'SKILL.md'), '[s:<slug片段>] [s:slug] [s:sunscreen]\n')
  writeFileSync(join(root, 'references/test.md'), '[s:care]\n[s:missing]\n')
  const report = audit(root)
  assert.equal(report.total, 3)
  assert.equal(report.problemCount, 2)
  assert.equal(report.problems[0].line, 1)
  assert.match(report.problems[0].error, /歧义/)
})
test('index rejects malformed JSON, missing fields, duplicate slug and non-AAD URLs', t => {
  const root = fixture(t); const path = join(root, 'sources/index.jsonl')
  assert.equal(loadIndex(root).length, 3)
  for (const content of ['{', '{}', [row('public/x'), row('public/x')].map(JSON.stringify).join('\n'), JSON.stringify({ ...rows[0], url: 'https://evil.example/aad.org' })]) {
    writeFileSync(path, content)
    assert.throws(() => loadIndex(root))
  }
})
test('actual index and references resolve offline; CLI works outside package cwd', () => {
  const index = loadIndex()
  assert.ok(index.length > 800)
  const report = audit(SKILL_DIR, index)
  assert.ok(report.total > 100)
  assert.equal(report.problemCount, 0, JSON.stringify(report.problems))
  const hits = searchReferences('补涂', { limit: 4 })
  assert.equal(hits.length, 4)
  assert.ok(hits.some(h => h.sourceSlugs.length))
  for (const args of [['--url', 'face-washing-101'], ['--check', 'face-washing-101'], ['--topics'], ['--topic', 'basics-cleansing'], ['--audit'], ['sunscreen', '--limit', '2'], ['补涂', '--references', '--json', '--limit', '2']]) {
    const result = cli(lookup, args)
    assert.equal(result.status, 0, result.stderr)
    assert.ok(result.stdout.trim())
  }
  const result = cli(lookup, ['--read', 'face-washing-101'], tmpdir(), { DSH_SKIN_CARE_CORPUS: '/does-not-exist/never-read', DSH_SKIN_PROFILE: '/does-not-exist/never-read' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /仅索引元数据/)
  assert.match(result.stdout, /https:\/\/www.aad.org\//)
})
test('CLI rejects invalid, conflicting and empty arguments without stacks', () => {
  for (const args of [[], ['--wat'], ['--limit', '0', '防晒'], ['--check', 'care', '--url', 'care'], ['--url', 'face-washing-101', 'extra'], ['--check', 'no-such-page']]) {
    const result = cli(lookup, args)
    assert.notEqual(result.status, 0)
    assert.doesNotMatch(result.stderr, /\n\s+at /)
  }
})
test('legacy reads only explicit synthetic file with consent, does not write or migrate', t => {
  const root = fixture(t); const path = join(root, 'profile.json')
  const text = JSON.stringify({ version: 1, stage: { knowledge: 'L1' }, concerns: ['dryness'], goals: [], routine: [], log: [], learning: {} })
  writeFileSync(path, text)
  assert.throws(() => readLegacyProfile(path), /明确/)
  assert.equal(readLegacyProfile(path, { confirmed: true }).profile.stage.knowledge, 'L1')
  const denied = cli(legacy, ['show', '--path', path])
  assert.notEqual(denied.status, 0)
  const allowed = cli(legacy, ['show', '--confirm-user-request', '--path', path, '--json'])
  assert.equal(allowed.status, 0, allowed.stderr)
  assert.equal(JSON.parse(allowed.stdout).mode, 'read-only-legacy')
  assert.equal(readFileSync(path, 'utf8'), text)
  assert.notEqual(cli(legacy, ['init', '--confirm-user-request', '--path', path]).status, 0)
  assert.throws(() => readLegacyProfile(join(root, 'absent'), { confirmed: true }), /不存在/)
  assert.throws(() => readLegacyProfile(root, { confirmed: true }), /普通文件/)
})
test('legacy rejects oversized, malformed, invalid UTF-8 and unsupported profiles', t => {
  const root = fixture(t); const path = join(root, 'profile.json')
  for (const content of ['x'.repeat(MAX_PROFILE_BYTES + 1), '{', 'null', '[]', '{"version":2}', '{"version":1,"goals":{}}', Buffer.from([0xff])]) {
    writeFileSync(path, content)
    assert.throws(() => readLegacyProfile(path, { confirmed: true }))
  }
  writeFileSync(path, '12345')
  assert.equal(readBounded(path, 5), '12345')
  assert.throws(() => readBounded(path, 4), /过大/)
})
