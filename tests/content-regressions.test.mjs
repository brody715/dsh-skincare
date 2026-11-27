// Regression guards for previously observed defects, NOT medical evidence validation.
import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const refs = new URL('../skill/references/', import.meta.url)
const files = readdirSync(refs).filter(name => name.endsWith('.md'))
const text = files.map(name => readFileSync(new URL(name, refs), 'utf8')).join('\n')

test('known unsafe inference and mandatory observation statements stay removed', () => {
  for (const phrase of [
    '就是清洁过度而非皮肤病',
    '三件事做满四周',
    '只用了三天产品就说没效，不算触发阈值',
    '3 分钟是目标，5 分钟是上限',
    '其余品类都在处理这三件事没做对留下的后果',
    '能对上单一变量的，属第二层，改那个变量就行',
    '干了再涂没什么可锁的',
  ]) assert.ok(!text.includes(phrase), `Previous unsupported rule returned: ${phrase}`)
})

test('knowledge does not contain executable legacy profile workflow commands', () => {
  assert.doesNotMatch(text, /(?:python3?|node)\s+(?:\S*\/)?profile\.(?:py|mjs|js)\s/)
  assert.doesNotMatch(text, /set-learning\s+L[0-3]\s+done|log-done\s+cleanse/)
})

test('all modules remain independently accessible from skill entry', () => {
  const skill = readFileSync(new URL('../skill/SKILL.md', import.meta.url), 'utf8')
  for (const name of files) assert.ok(skill.includes(`references/${name}`), `Missing direct navigation: ${name}`)
})
