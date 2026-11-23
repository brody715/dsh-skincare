/**
 * 冒烟测试：不装宿主，直接喂假的 ctx，验证两件事
 *   1. apply 会把包内 skill/ 注册成技能提供者，提供者返回的字段过得了注册表校验的形状；
 *   2. 没有 dshGo 服务时 apply 不抛错（Harness 网页版 / 桌面版的路径）。
 * 跑法：node --test tests/
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { apply, inject, name } from '../lib/index.js'

function fakeCtx() {
  const registered = []
  const injected = []
  return {
    registered,
    injected,
    logger: { info() {}, warn() {} },
    skills: { registerProvider: (factory) => registered.push(factory) },
    // 真实的 ctx.inject 只登记依赖，回调等 dshGo 出现才跑；没有 dshGo 就永远不跑。
    inject: (names) => injected.push(names),
  }
}

test('插件名与依赖', () => {
  assert.equal(name, 'dsh-skincare')
  assert.deepEqual(inject, ['skills'])
})

test('注册随包技能提供者', async () => {
  const ctx = fakeCtx()
  apply(ctx)

  assert.equal(ctx.registered.length, 1)
  assert.deepEqual(ctx.injected, [['dshGo']])
  const provider = ctx.registered[0]()

  const [candidate] = await provider.list()
  assert.equal(candidate.name, 'dsh-skincare')
  assert.ok(candidate.description.length > 0)
  assert.equal(candidate.source, 'bundled')
  assert.equal(typeof candidate.rank, 'number')
  assert.equal(candidate.resourceBase.kind, 'directory')
  assert.ok(candidate.resourceBase.path.endsWith('/skill'))

  const loaded = await provider.get(candidate.locator)
  assert.equal(loaded.name, 'dsh-skincare')
  assert.match(loaded.content, /^---\n/)
  assert.equal(loaded.invocation.modelInvocable, true)
})

test('frontmatter 解析', async () => {
  const provider = (await import('../lib/skill.js')).createSkillProvider({
    dir: new URL('../skill/', import.meta.url).pathname,
  })
  const [candidate] = await provider.list()
  assert.equal(candidate.name, 'dsh-skincare')
  assert.match(candidate.description, /AAD/)
  assert.match(candidate.whenToUse, /护肤/)
})

test('面板直接写档案，不起子进程', async () => {
  const panelSource = readFileSync(new URL('../lib/panel.js', import.meta.url), 'utf8')
  assert.doesNotMatch(panelSource, /child_process|python3|execFileSync/)
  assert.doesNotMatch(panelSource, /node:child_process/)

  const dir = mkdtempSync(join(tmpdir(), 'skincare-'))
  const profilePath = join(dir, 'profile.json')
  const previous = process.env.DSH_SKIN_PROFILE
  process.env.DSH_SKIN_PROFILE = profilePath
  try {
    writeFileSync(
      profilePath,
      `${JSON.stringify(
        {
          version: 1,
          updated_at: '2026-01-01T00:00:00Z',
          stage: { knowledge: 'L0', care_complexity: 'minimal', triage: 'self-care' },
          concerns: [],
          routine: [{ step: 'cleanse' }, { step: 'moisturize' }],
          goals: [],
          log: [],
          learning: { L0: 'todo', L1: 'todo', L2: 'todo', L3: 'todo' },
        },
        null,
        2,
      )}\n`,
    )

    const { registerPanel } = await import('../lib/panel.js')
    let panel = null
    registerPanel({
      inject: (deps, callback) =>
        callback({ dshGo: { panel: (id, definition) => (panel = definition), on() {} } }),
    })
    assert.ok(panel, '面板没有注册')

    const checked = await panel.actions['skin-care-done']({}, { locale: 'zh' })
    assert.equal(checked.refresh, true)

    const again = await panel.actions['skin-care-done']({}, { locale: 'zh' })
    assert.equal(again.refresh, undefined, '同一天不应重复写入')

    const learned = await panel.actions['learn-L1']({}, { locale: 'zh' })
    assert.equal(learned.refresh, true)

    const saved = JSON.parse(readFileSync(profilePath, 'utf8'))
    assert.deepEqual(saved.log.at(-1).done, ['cleanse', 'moisturize'])
    assert.equal(saved.learning.L1, 'done')
    assert.match(saved.updated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
  } finally {
    if (previous === undefined) delete process.env.DSH_SKIN_PROFILE
    else process.env.DSH_SKIN_PROFILE = previous
    rmSync(dir, { recursive: true, force: true })
  }
})

test('知识模块：13 篇，规模与骨架都在位', () => {
  const dir = new URL('../skill/references/', import.meta.url)
  const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
  assert.equal(files.length, 13)
  for (const f of files) {
    const text = readFileSync(new URL(f, dir), 'utf8')
    assert.ok(text.length >= 7000, `${f} 太短：${text.length}`)
    assert.ok(text.length <= 9000, `${f} 超长：${text.length}`)
    assert.match(text, /^## 这一节最该记住的三件事/m, `${f} 缺骨架`)
    assert.match(text, /\[s:/, `${f} 没有引用`)
  }
})

test('打包边界：原文副本、译文、内部脚本都不进 npm 包', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const files = pkg.files
  for (const bad of ['skill', 'skill/scripts', 'skill/sources', 'skill/sources/core', 'corpus']) {
    assert.ok(!files.includes(bad), `files 不应整目录包含 ${bad}`)
  }
  for (const required of ['skill/SKILL.md', 'skill/sources/index.jsonl', 'skill/sources/topics.json']) {
    assert.ok(files.includes(required), `files 缺 ${required}`)
  }
  const row = JSON.parse(
    readFileSync(new URL('../skill/sources/index.jsonl', import.meta.url), 'utf8').split('\n')[0],
  )
  assert.deepEqual(Object.keys(row).sort(), [
    'id',
    'in_scope',
    'kind',
    'section',
    'slug',
    'title',
    'url',
    'words',
  ])
})
