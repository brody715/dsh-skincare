import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { apply, inject, name } from '../lib/index.js'
import { registerPanel } from '../lib/panel.js'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const pkg = JSON.parse(read('../package.json'))

test('DSH skill works without Go or a profile', async () => {
  const registered = [], injected = []
  assert.equal(name, 'dsh-skincare')
  assert.deepEqual(inject, ['skills'])
  apply({ logger: { info() {}, warn() {} }, skills: { registerProvider: f => registered.push(f) }, inject: deps => injected.push(deps) })
  assert.equal(registered.length, 1)
  assert.deepEqual(injected, [['dshGo']])
  const provider = registered[0]()
  const [candidate] = await provider.list()
  assert.equal(candidate.name, 'dsh-skincare')
  assert.match(candidate.description, /AAD/)
  assert.match(candidate.whenToUse, /护肤/)
  assert.equal(candidate.source, 'bundled')
  assert.equal(candidate.resourceBase.kind, 'directory')
  assert.ok(candidate.resourceBase.path.endsWith('/skill'))
  const loaded = await provider.get(candidate.locator)
  assert.equal(loaded.invocation.modelInvocable, true)
  assert.match(loaded.content, /^---\n/)
})

test('Go is stateless, secondary, and only inserts drafts', () => {
  assert.doesNotMatch(read('../lib/panel.js'), /node:fs|child_process|python3|writeFile|readFile/)
  let panel
  registerPanel({ inject: (_deps, cb) => cb({ dshGo: {
    panel: (id, def) => { assert.equal(id, 'skin-care-panel'); panel = def },
    on: () => assert.fail('No shortcut handler should be registered'),
  } }) })
  assert.ok(panel)
  assert.deepEqual(Object.keys(panel.actions).sort(), ['explore', 'question', 'review'])
  for (const locale of ['zh', 'en']) {
    const view = panel.view({}, { locale })
    assert.ok(Buffer.byteLength(JSON.stringify(view)) < 8000)
    for (const action of Object.values(panel.actions)) {
      const effect = action({}, { locale })
      assert.deepEqual(Object.keys(effect), ['insert'])
      assert.ok(effect.insert.length > 0 && effect.insert.length < 2000)
    }
  }
  assert.equal(pkg.dshGo.contributes['composer.actions'], undefined)
  assert.deepEqual(pkg.dshGo.contributes.panels[0].placement, ['features'])
})

test('Published runtime stays read-only and has no command execution or network APIs', () => {
  // A small source regression check, not a sandbox or a security certification.
  const runtime = pkg.files.filter(path => /\.[cm]?js$/.test(path))
  assert.ok(runtime.length > 0)
  for (const path of runtime) {
    const source = read('../' + path)
    assert.doesNotMatch(source, /\b(?:child_process|execSync|execFile|spawnSync|spawn)\b|\b(?:exec|system|eval)\s*\(|new\s+Function\s*\(/, path)
    assert.doesNotMatch(source, /node:(?:vm|worker_threads|https?|http2|net|tls|dgram)|\b(?:fetch|WebSocket)\s*\(/, path)
    assert.doesNotMatch(source, /\b(?:writeFile(?:Sync)?|appendFile(?:Sync)?|createWriteStream|mkdir(?:Sync)?|rm(?:Sync)?|unlink(?:Sync)?|rename(?:Sync)?|copyFile(?:Sync)?)\s*\(/, path)
  }
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) assert.equal(pkg.scripts?.[hook], undefined)
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}), [])
  assert.deepEqual(Object.keys(pkg.optionalDependencies ?? {}), [])
})

test('Knowledge modules stay bounded and cited, not padded to a minimum', () => {
  const dir = new URL('../skill/references/', import.meta.url)
  const files = readdirSync(dir).filter(f => f.endsWith('.md'))
  assert.equal(files.length, 13)
  for (const file of files) {
    const text = readFileSync(new URL(file, dir), 'utf8')
    assert.ok(text.trim().length > 0, `${file}: empty`)
    assert.ok(text.length <= 9000, `${file}: exceeds reading budget`)
    assert.match(text, /\[s:/, `${file}: missing sources`)
    assert.doesNotMatch(text, /python3\s+scripts\//, `${file}: obsolete runtime command`)
  }
})

test('Publish allowlist excludes third-party bodies and Python runtime', () => {
  for (const bad of ['skill', 'skill/scripts', 'skill/sources', 'skill/sources/core', 'corpus']) {
    assert.ok(!pkg.files.includes(bad), `overbroad include: ${bad}`)
  }
  for (const path of ['skill/SKILL.md', 'skill/scripts/lookup.mjs', 'skill/scripts/legacy-profile.mjs', 'skill/sources/index.jsonl', 'skill/sources/topics.json']) {
    assert.ok(pkg.files.includes(path), `missing: ${path}`)
  }
  assert.ok(pkg.files.every(p => !p.endsWith('.py')))
  const row = JSON.parse(read('../skill/sources/index.jsonl').split('\n')[0])
  assert.deepEqual(Object.keys(row).sort(), ['id', 'in_scope', 'kind', 'section', 'slug', 'title', 'url', 'words'])
})
