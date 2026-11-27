// Navigation integrity, not a medical evidence or search-ranking test.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../skill/', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')
const modules = readdirSync(resolve(root, 'references')).filter(x => /^\d\d-.+\.md$/.test(x))
  .sort().map(x => `references/${x}`)
const docs = ['SKILL.md', 'knowledge-map.md', ...modules]

// Small, explicit Markdown dialect: inline links (angle or bare destinations),
// optional Markdown link titles, ATX headings, and file links followed by「小节」.
// Fenced code is documentation, not navigation. No dependency or graph store.
function prose(text) {
  let fence = null
  return text.split('\n').map(line => {
    const mark = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence) {
      if (mark?.[0] === fence[0] && mark.length >= fence.length) fence = null
      return ''
    }
    if (mark) { fence = mark; return '' }
    return line
  }).join('\n')
}
function headings(text) {
  return [...prose(text).matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)].map(x => x[1])
}
function anchors(text) {
  const used = new Set(), result = new Set()
  for (const heading of headings(text)) {
    const base = heading.toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '').replace(/\s/g, '-')
    let name = base, suffix = 0
    while (used.has(name)) name = `${base}-${++suffix}`
    used.add(name); result.add(name)
  }
  return result
}
function quotedSections(tail) {
  let text = tail.trimStart()
  const sections = []
  while (text.startsWith('「')) {
    let depth = 0, end = -1
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '「') depth++
      if (text[i] === '」' && --depth === 0) { end = i; break }
    }
    if (end < 0) throw new Error('Unclosed named section')
    sections.push(text.slice(1, end))
    text = text.slice(end + 1).trimStart()
  }
  return sections
}
function links(text) {
  const source = prose(text)
  return [...source.matchAll(/(?<!!)\[([^\]\n]*)\]\(\s*(?:<([^>\n]*)>|([^\s)]*)(?:\s+"[^"\n]*")?)\s*\)/g)].map(m => ({
    label: m[1], target: (m[2] ?? m[3]).trim(),
    sections: quotedSections(source.slice(m.index + m[0].length)),
  }))
}
function destination(from, target) {
  const hash = target.indexOf('#')
  const path = decodeURIComponent(hash < 0 ? target : target.slice(0, hash))
  const fragment = hash < 0 ? null : decodeURIComponent(target.slice(hash + 1))
  const absolute = path ? resolve(root, dirname(from), path) : resolve(root, from)
  const local = relative(root, absolute).split(sep).join('/')
  assert.ok(local !== '..' && !local.startsWith('../'), `Outside skill: ${target}`)
  return { path: local, fragment }
}
function validate(from, text, load) {
  const checked = []
  for (const link of links(text)) {
    assert.ok(link.label.trim(), `${from}: empty link label`)
    assert.ok(link.target, `${from}: empty link target`)
    if (/^(?:https?:|mailto:)/i.test(link.target)) continue
    const dest = destination(from, link.target)
    let body
    try { body = load(dest.path) } catch { assert.fail(`${from}: missing file ${dest.path}`) }
    if (dest.fragment !== null) {
      assert.ok(dest.fragment, `${from}: empty section anchor`)
      assert.ok(anchors(body).has(dest.fragment), `${from}: missing anchor ${dest.path}#${dest.fragment}`)
    }
    for (const section of link.sections) {
      assert.ok(section.trim(), `${from}: empty named section`)
      assert.ok(headings(body).includes(section), `${from}: missing named section ${dest.path}「${section}」`)
    }
    checked.push({ ...link, ...dest })
  }
  return checked
}
function edge(graph, a, b) {
  if (!graph.has(a)) graph.set(a, new Set())
  graph.get(a).add(b)
}
function reachable(graph, start, excluded = new Set()) {
  const seen = new Set(), pending = excluded.has(start) ? [] : [start]
  while (pending.length) {
    const node = pending.pop()
    if (seen.has(node)) continue
    seen.add(node)
    for (const next of graph.get(node) ?? []) if (!excluded.has(next)) pending.push(next)
  }
  return seen
}
function relationEdges(text, load) {
  const edges = []
  for (const line of prose(text).split('\n').filter(line => /^- /.test(line) && line.includes(' ↔ '))) {
    const ends = validate('knowledge-map.md', line, load)
    assert.equal(ends.length, 2, `A relation needs two local endpoints: ${line}`)
    assert.ok(ends.every(e => e.sections.length), `A relation needs named sections: ${line}`)
    assert.notEqual(ends[0].path, ends[1].path, 'A cross-module relation needs distinct modules')
    assert.match(line, /」[。；：].+/, 'A relation needs an explanation after its endpoints')
    edges.push([ends[0].path, ends[1].path])
  }
  return edges
}
const fixture = files => path => {
  if (!Object.hasOwn(files, path)) throw new Error('missing')
  return files[path]
}

test('fixture links resolve relative files, named headings, nested quotes and Unicode anchors', () => {
  const load = fixture({
    'references/a.md': '# A\n## 机制与条件\n## 名称「例外」\n## 机制与条件\n',
    'sources/index.jsonl': '{}',
  })
  const result = validate('references/b.md', '[甲](<a.md>)「名称「例外」」\n[乙](a.md#机制与条件)\n[丙](<a.md#机制与条件-1>)\n[索引](<../sources/index.jsonl>)', load)
  assert.equal(result.length, 4)
  assert.deepEqual(result[0].sections, ['名称「例外」'])
  assert.equal(validate('references/a.md', '[本节](#机制与条件)', load).length, 1)
  assert.equal(validate('x.md', '```md\n[坏示例]()\n```\n[外部](https://example.org)', load).length, 0)
})

test('fixture validator explicitly rejects empty links, missing files and wrong section titles', () => {
  const load = fixture({ 'a.md': '# 正确标题\n\n正文提到错误标题不算小节。\n```\n## 假标题\n```' })
  for (const [text, message] of [
    ['[空]()', /empty link target/], ['[空](<>)', /empty link target/],
    ['[](<a.md>)', /empty link label/], ['[坏](<missing.md>)', /missing file/],
    ['[坏](<a.md>)「错误标题」', /missing named section/],
    ['[坏](<a.md>)「正确标题」「错误标题」', /missing named section/],
    ['[坏](<a.md>)「假标题」', /missing named section/],
    ['[坏](<a.md>)「」', /empty named section/],
    ['[坏](<a.md#错误标题>)', /missing anchor/],
    ['[坏](<a.md#>)', /empty section anchor/],
    ['[坏](<a.md>)「未闭合', /Unclosed named section/],
  ]) assert.throws(() => validate('map.md', text, load), message, text)
})

test('fixture traversal accepts alternate paths and cycles, rejects hub-only connectivity', () => {
  const graph = new Map()
  for (const [a, b] of [['a', 'hub'], ['hub', 'b'], ['b', 'c'], ['c', 'b']]) edge(graph, a, b)
  assert.ok(reachable(graph, 'a').has('c'))
  assert.ok(!reachable(graph, 'a', new Set(['hub'])).has('b'))
  edge(graph, 'a', 'd'); edge(graph, 'd', 'c')
  assert.ok(reachable(graph, 'a', new Set(['hub'])).has('b'), 'No fixed step count or shortest-path ranking')
  assert.ok(!reachable(graph, 'a').has('disconnected'))
})

test('fixture relation parser requires real endpoints, sections and explanatory prose', () => {
  const load = fixture({ 'a.md': '# 机制', 'b.md': '# 条件' })
  assert.deepEqual(relationEdges('- [A](<a.md>)「机制」 ↔ [B](<b.md>)「条件」。从条件反查机制。', load), [['a.md', 'b.md']])
  assert.throws(() => relationEdges('- [A](<a.md>)「机制」 ↔ [B](<b.md>)「错字」。说明。', load), /missing named section/)
  assert.throws(() => relationEdges('- [A](<a.md>) ↔ [B](<b.md>)。说明。', load), /named sections/)
  assert.throws(() => relationEdges('- [A](<a.md>)「机制」 ↔ [B](<b.md>)「条件」', load), /explanation/)
})

function actualLoad(path) {
  assert.ok(statSync(resolve(root, path)).isFile(), `${path}: not a file`)
  return read(path)
}
test('entry, map and all module links point to existing files and real named sections', () => {
  for (const path of docs) validate(path, read(path), actualLoad)
  assert.ok(relationEdges(read('knowledge-map.md'), actualLoad).length > 0)
})

test('all thirteen modules are reachable from both skill entry and concept map', () => {
  assert.deepEqual(modules.map(path => path.split('/')[1].slice(0, 2)), Array.from({ length: 13 }, (_, i) => String(i).padStart(2, '0')))
  const graph = new Map()
  for (const path of docs) for (const link of validate(path, read(path), actualLoad)) edge(graph, path, link.path)
  for (const entry of ['SKILL.md', 'knowledge-map.md']) {
    const seen = reachable(graph, entry)
    for (const module of modules) assert.ok(seen.has(module), `${entry} cannot reach ${module}`)
  }
})

test('key concepts have onward and reverse exploration without entry/map hubs', () => {
  const graph = new Map()
  // Check actual module hyperlinks only: conceptual pairs in the central map
  // must not fabricate a direct route that requires visiting that hub.
  for (const path of modules) for (const link of validate(path, read(path), actualLoad)) {
    if (modules.includes(link.path)) edge(graph, path, link.path)
  }
  const module = prefix => modules.find(path => path.startsWith(`references/${prefix}-`))
  const excluded = new Set(['SKILL.md', 'knowledge-map.md', module('00'), module('11')])
  // Topic coverage, not a required exact edge, path length, ordering or search hit.
  for (const [a, b] of [['01', '02'], ['02', '04'], ['02', '08'], ['05', '09'], ['06', '07'], ['06', '08'], ['07', '03'], ['03', '12'], ['12', '05'], ['08', '10']]) {
    for (const [from, to] of [[a, b], [b, a]]) {
      assert.ok(reachable(graph, module(from), excluded).has(module(to)), `${from} cannot continue to ${to} without a hub`)
    }
  }
})
