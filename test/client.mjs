/**
 * Browser-half smoke test: loads client.js in a VM with a tiny hook runner and
 * a mocked `fetch`, then drives a real search through the panel component.
 *
 * This is not a React reimplementation; it is just enough hook semantics
 * (useState/useRef/useEffect with re-render on set) to catch runtime errors in
 * the panel's render path, which otherwise only show up as a blank tab.
 *
 *   node test/client.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8')

let capturedModule = null
const storage = new Map()
const localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => { storage.set(key, String(value)) },
  removeItem: (key) => { storage.delete(key) },
}

// --------------------------------------------------------------- mini React
let hooks = []
let cursor = 0
let pendingRender = null
let effects = []

const React = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false) }
  },
  useState(initial) {
    const index = cursor++
    if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial
    const set = (value) => {
      hooks[index] = typeof value === 'function' ? value(hooks[index]) : value
      if (pendingRender) pendingRender()
    }
    return [hooks[index], set]
  },
  useRef(initial) {
    const index = cursor++
    if (!(index in hooks)) hooks[index] = { current: initial }
    return hooks[index]
  },
  useEffect(fn) {
    const index = cursor++
    if (!(index in hooks)) {
      hooks[index] = true
      const cleanup = fn()
      if (typeof cleanup === 'function') effects.push(cleanup)
    }
  },
}

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  URLSearchParams,
  AbortController,
  localStorage,
  navigator: { clipboard: { writeText: async () => {} } },
  window: {},
  document: {},
}
sandbox.window.__ModuleLoader__ = { load(definition) { capturedModule = definition } }
vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })

assert.ok(capturedModule, 'client.js must register itself with the module loader')
const plugin = capturedModule.factory((id) => {
  if (id === 'react') return React
  throw new Error(`unexpected require(${id})`)
})

// ------------------------------------------------------------- fake payloads
const REPO_A = {
  full_name: 'owner/dsh-lean',
  url: 'https://github.com/owner/dsh-lean',
  desc: 'A lean output contract for the harness',
  stars: 12,
  updated: new Date().toISOString(),
  topics: ['dsh-plugin'],
  language: 'TypeScript',
  category: 'dev',
  sources: ['topic:dsh-plugin'],
  score: 900,
}
const REPO_B = {
  full_name: 'owner/theme-pack',
  url: 'https://github.com/owner/theme-pack',
  desc: 'Dark themes for the chat UI',
  stars: 3,
  updated: new Date().toISOString(),
  topics: ['theme'],
  language: 'JavaScript',
  category: 'ui',
  sources: ['topic:dsh-plugin'],
  score: 10,
}

const calls = []
async function mockFetch(url, options) {
  const href = String(url)
  calls.push(href)
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  if (href.includes('/github-plugin-finder/health')) {
    return json({ ok: true, host: true, version: 2, index: { size: 42 }, translate: {} })
  }
  if (href.includes('/github-plugin-finder/search')) {
    const body = JSON.parse(options.body)
    if (body.mode === 'exact' && body.query === 'missing-plugin') {
      return json({
        ok: true,
        mode: 'exact',
        intent: { raw: body.query, mode: 'exact', exact: { value: 'missing-plugin' }, terms: [] },
        exact: null,
        exactNote: 'not-found',
        items: [REPO_A],
        meta: { channels: [{ id: 'related', label: 'related', count: 1 }], deferred: [], stopped: '', warnings: [], elapsedMs: 12, rate: { remaining: 8, limit: 10 }, index: { size: 42 } },
      })
    }
    return json({
      ok: true,
      mode: 'keyword',
      intent: { raw: body.query, mode: 'keyword', terms: [body.query], exact: null },
      exact: null,
      exactNote: '',
      items: [REPO_A, REPO_B],
      meta: {
        channels: [{ id: 'all-terms', label: 'all-terms', count: 2, kind: 'github' }],
        deferred: ['fresh'],
        stopped: 'budget',
        warnings: [],
        elapsedMs: 30,
        depth: 1,
        rate: { remaining: 7, limit: 10 },
        index: { size: 42 },
      },
    })
  }
  if (href.includes('/github-plugin-finder/translate')) {
    const body = JSON.parse(options.body)
    const entries = {}
    for (const text of body.texts || []) entries[text] = { zh: '中文：' + text.slice(0, 12), provider: 'bing', cached: false }
    return json({ ok: true, entries, missing: [], stillMissing: [], providers: {} })
  }
  return json({ message: 'not found' }, 404)
}
sandbox.fetch = mockFetch

// ------------------------------------------------------------------- render
function render() {
  cursor = 0
  return Component()
}

let Component = null
function mount() {
  const ctx = {
    slots: {
      inject(name, factory) { return factory() },
      register(definition, component) { Component = component; return () => {} },
    },
    locale: {
      register: () => () => {},
      subscribe: () => () => {},
      // An unbound key must fall back to the inline dictionary (zh here), which
      // is exactly what the real locale service does when a key is missing.
      bind: () => () => undefined,
      getLocale: () => ({ id: 'zh' }),
    },
    effect: (fn) => { fn(); return () => {} },
  }
  plugin.apply(ctx)
  assert.equal(typeof Component, 'function', 'the plugin must register a panel component')
}

function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  return [textOf(node.children), node.props && node.props.value ? String(node.props.value) : ''].join(' ')
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, predicate)
      if (hit) return hit
    }
    return null
  }
  if (predicate(node)) return node
  for (const child of node.children || []) {
    const hit = find(child, predicate)
    if (hit) return hit
  }
  return null
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 15))

async function settle(rounds = 8) {
  for (let index = 0; index < rounds; index++) {
    pendingRender = null
    render()
    await tick()
  }
  pendingRender = null
  return render()
}

/** Wait until the rendered text satisfies `predicate` (async state settles). */
async function waitFor(predicate, label, rounds = 80) {
  let tree = null
  for (let index = 0; index < rounds; index++) {
    tree = render()
    if (predicate(textOf(tree))) return tree
    await tick()
  }
  throw new Error(`timed out waiting for ${label}; text was: ${textOf(tree).slice(0, 300)}`)
}

async function main() {
  mount()
  let tree = await settle()
  const initialText = textOf(tree)
  assert.ok(initialText.includes('社区目录') || initialText.includes('community catalog'), 'panel renders its intro: ' + initialText.slice(0, 120))

  // Type into the search box, then submit the form.
  const input = find(tree, (node) => node.type === 'input' && node.props.type === 'search')
  assert.ok(input, 'search input exists')
  input.props.onChange({ target: { value: 'dsh lean' } })
  tree = await settle()
  const form = find(tree, (node) => node.type === 'form')
  form.props.onSubmit({ preventDefault() {} })
  tree = await waitFor((value) => value.includes('owner/dsh-lean') && value.includes('中文：A lean out'), 'search results + translation')
  const text = textOf(tree)
  assert.ok(text.includes('owner/dsh-lean'), 'search results render the first repository')
  assert.ok(text.includes('owner/theme-pack'), 'search results render the second repository')
  assert.ok(text.includes('中文：A lean out'), 'translated description is preferred')
  assert.ok(calls.some((href) => href.includes('/github-plugin-finder/search')), 'host search was used')
  assert.ok(calls.some((href) => href.includes('/github-plugin-finder/translate')), 'host translation was used')
  assert.ok(text.includes('本地引擎'), 'panel shows the local engine badge')

  // Category filter: clicking the UI chip hides the dev repository.
  const uiChip = find(tree, (node) => node.type === 'button' && node.children.some((child) => typeof child === 'string' && child.includes('界面与主题')))
  assert.ok(uiChip, 'category chip exists')
  uiChip.props.onClick()
  tree = await settle()
  const filtered = textOf(tree)
  assert.ok(filtered.includes('owner/theme-pack'))
  assert.ok(!filtered.includes('owner/dsh-lean'), 'category filter actually filters')

  // Star order: the chip re-renders as one ranked list and remembers the choice.
  const starChip = find(tree, (node) => node.type === 'button' && node.children.join('').includes('星标从多到少'))
  assert.ok(starChip, 'star-order chip exists')
  starChip.props.onClick()
  tree = await settle()
  const rankedText = textOf(tree)
  assert.ok(rankedText.includes('星标从多到少 ('), 'star ranking renders as a single ordered list')
  assert.equal(storage.get('ghpf.sort'), 'stars', 'sort choice is remembered')

  // Exact miss: the panel must say so instead of presenting fuzzy matches.
  const input2 = find(tree, (node) => node.type === 'input' && node.props.type === 'search')
  input2.props.onChange({ target: { value: 'missing-plugin' } })
  tree = await settle()
  const exactChip = find(tree, (node) => node.type === 'button' && node.children.join('').includes('精确名称'))
  exactChip.props.onClick()
  tree = await settle()
  const form2 = find(tree, (node) => node.type === 'form')
  form2.props.onSubmit({ preventDefault() {} })
  tree = await waitFor((value) => value.includes('未找到精确名称'), 'exact miss')
  const missText = textOf(tree)
  assert.ok(missText.includes('未找到精确名称'), 'exact miss is reported')

  // Copy button writes an install request.
  let copied = ''
  sandbox.navigator.clipboard.writeText = async (value) => { copied = value }
  const copyButton = find(tree, (node) => node.type === 'button' && node.children.join('').includes('复制安装指令'))
  await copyButton.props.onClick()
  await tick()
  assert.ok(copied.startsWith('请帮我从 GitHub 安装 DeepSeek Harness 插件：') || copied.startsWith('请帮我安装 DeepSeek Harness 插件（npm）：'), 'install request is copied')

  console.log('client panel: all checks passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
