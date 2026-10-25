/**
 * Offline test suite: no network, no browser, no DSH.
 *
 *   node test/run.mjs
 *
 * Everything questionable about the upgrade lives in a pure function, so it
 * can be pinned down here: intent parsing (exact vs keyword), the request
 * budget, ranking, translation batching/caching, the on-disk index and the
 * two HTTP handlers the panel relies on.
 */

import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ghpf-test-'))
process.env.GH_PLUGIN_FINDER_DATA = tmp

const { parseIntent, looksLikePluginName } = await import('../lib/intent.mjs')
const { buildPlan, expandCjkTerms } = await import('../lib/plan.mjs')
const { classify, sortRanked, dedupe, SORT_MODES } = await import('../lib/rank.mjs')
const {
  chunkText, polishTranslation, Translator,
  parseTranslationArray, createLlmProvider, createTranslatorServiceProvider, hostProviders,
} = await import('../lib/translate.mjs')
const { Store, getStore, resetStoreForTests } = await import('../lib/store.mjs')
const { runSearch, requestBudget } = await import('../lib/search.mjs')
const { createHandlers } = await import('../lib/routes.mjs')
const { GitHubClient, resetNetworkCacheForTests } = await import('../lib/github.mjs')

/** A fresh index *and* a fresh query-page cache, so mocks are consulted. */
function resetAll() {
  resetStoreForTests()
  resetNetworkCacheForTests()
}

let passed = 0
const failures = []

function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    failures.push({ name, error })
    console.log(`  FAIL ${name}\n       ${(error && error.message) || error}`)
  }
}

async function testAsync(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    failures.push({ name, error })
    console.log(`  FAIL ${name}\n       ${(error && error.message) || error}`)
  }
}

console.log('intent parsing')

test('empty input browses', () => {
  const intent = parseIntent('')
  assert.equal(intent.mode, 'browse')
})

test('owner/repo is an exact repo target', () => {
  const intent = parseIntent('Nothingness111/github-plugin-finder')
  assert.equal(intent.mode, 'exact')
  assert.equal(intent.exact.kind, 'repo')
  assert.equal(intent.exact.owner, 'Nothingness111')
  assert.equal(intent.exact.name, 'github-plugin-finder')
})

test('GitHub URL is an exact repo target', () => {
  const intent = parseIntent('https://github.com/leenkcool/Blue-Whale-Harness')
  assert.equal(intent.mode, 'exact')
  assert.equal(intent.exact.value, 'leenkcool/Blue-Whale-Harness')
})

test('scoped npm name is exact', () => {
  const intent = parseIntent('@local/github-plugin-finder')
  assert.equal(intent.mode, 'exact')
  assert.equal(intent.exact.kind, 'npm')
})

test('dsh-* single token is exact, not keyword', () => {
  const intent = parseIntent('dsh-whale-widget')
  assert.equal(intent.mode, 'exact')
  assert.equal(intent.exact.value, 'dsh-whale-widget')
})

test('exact: forces a name lookup', () => {
  const intent = parseIntent('exact: dsh-lean')
  assert.equal(intent.mode, 'exact')
  assert.equal(intent.exact.name, 'dsh-lean')
})

test('topic: and user: become scoped modes', () => {
  const topic = parseIntent('topic:dsh-plugin 界面')
  assert.equal(topic.mode, 'topic')
  assert.deepEqual(topic.topics, ['dsh-plugin'])
  assert.deepEqual(topic.terms, ['界面'])
  const owner = parseIntent('user:MeteorNOX 余额')
  assert.equal(owner.mode, 'owner')
  assert.equal(owner.owner, 'MeteorNOX')
})

test('prose stays keyword and is tokenised', () => {
  const intent = parseIntent('界面 美化 主题')
  assert.equal(intent.mode, 'keyword')
  assert.deepEqual(intent.terms, ['界面', '美化', '主题'])
})

test('two plain words are not an exact name', () => {
  assert.equal(parseIntent('balance widget').mode, 'keyword')
  assert.equal(looksLikePluginName('balance widget'), false)
  assert.equal(looksLikePluginName('github-plugin-finder'), true)
})

test('quoted keywords stay together', () => {
  const intent = parseIntent('"deepseek harness" 主题')
  assert.equal(intent.mode, 'keyword')
  assert.deepEqual(intent.terms, ['deepseek harness', '主题'])
})

console.log('plan and budget')

test('browse plan sweeps topics then names then words then fresh', () => {
  const plan = buildPlan({ mode: 'browse', terms: [], topics: [], owner: null, qualifiers: {} }, { token: '', depth: 1 })
  const ids = plan.steps.map((step) => step.id)
  assert.ok(ids.includes('topic:dsh-plugin'))
  assert.ok(ids.includes('name:dsh-'))
  // Topic-only coverage is what made the second generation look smaller than
  // the first: repositories that never set a topic are only reachable through
  // the word channels below.
  assert.ok(ids.includes('text:dsh-plugin'))
  assert.ok(ids.includes('text:harness'))
  assert.ok(ids.includes('text:cordis'))
  assert.ok(ids.includes('fresh'))
  assert.ok(plan.steps.length >= 14, `expected a broad plan, got ${plan.steps.length}`)
})

test('budgets grow with depth and two rounds pay for a browse sweep', () => {
  assert.ok(requestBudget(1) < requestBudget(2))
  assert.ok(requestBudget(2) < requestBudget(3))
  const plan = buildPlan({ mode: 'browse', terms: [], topics: [], owner: null, qualifiers: {} }, { token: '', depth: 1 })
  assert.ok(requestBudget(1) * 2 >= plan.steps.length, `${requestBudget(1)}x2 < ${plan.steps.length} planned channels`)
  const deep = buildPlan({ mode: 'browse', terms: [], topics: [], owner: null, qualifiers: {} }, { token: '', depth: 2 })
  assert.ok(deep.steps.every((step) => (step.pages || 1) >= 2), 'a deeper round must page past the first 100 hits')
})

test('keyword plan asks per-term for recall', () => {
  const intent = parseIntent('memory 插件')
  const plan = buildPlan(intent, { token: '', depth: 1 })
  const queries = plan.steps.map((step) => step.q)
  assert.ok(queries.some((q) => q.includes('memory')))
  assert.ok(queries.some((q) => q.includes('in:name')))
  assert.ok(queries.every((q) => q.length < 256))
})

test('Chinese keywords also search their English counterparts', () => {
  assert.deepEqual(expandCjkTerms('界面 美化'), ['ui', 'theme'])
  const plan = buildPlan(parseIntent('界面 美化'), { token: '', depth: 1 })
  const queries = plan.steps.map((step) => step.q)
  assert.ok(queries.some((q) => q.startsWith('ui ')), 'an English hint query is planned')
  assert.ok(queries.some((q) => q.includes('界面')))
})

test('token unlocks the manifest code search', () => {
  const without = buildPlan(parseIntent('memory'), { token: '', depth: 2 })
  const withToken = buildPlan(parseIntent('memory'), { token: 'x', depth: 2 })
  assert.equal(without.steps.some((step) => step.kind === 'code-search'), false)
  assert.equal(withToken.steps.some((step) => step.kind === 'code-search'), true)
})

console.log('ranking and classification')

test('exact name outranks description hits', () => {
  const intent = parseIntent('dsh-lean')
  const records = [
    { full_name: 'someone/dsh-lean-themes', desc: 'themes for dsh-lean', stars: 900, topics: [] },
    { full_name: 'o/dsh-lean', desc: 'lean output contract', stars: 2, topics: [] },
  ]
  const ranked = sortRanked(dedupe(records), intent)
  assert.equal(ranked[0].full_name, 'o/dsh-lean')
})

test('categories are assigned', () => {
  assert.equal(classify({ full_name: 'a/b', desc: 'a dark theme for the chat UI', topics: [] }), 'ui')
  assert.equal(classify({ full_name: 'a/b', desc: 'cron reminder scheduler', topics: [] }), 'automation')
  assert.equal(classify({ full_name: 'a/b', desc: 'unrelated', topics: [] }), 'other')
})

test('dedupe merges channels', () => {
  const merged = dedupe([
    { full_name: 'a/b', desc: 'x', stars: 1, sources: ['topic'] },
    { full_name: 'a/b', desc: '', stars: 5, sources: ['name'] },
  ])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].stars, 5)
  assert.deepEqual(merged[0].sources.sort(), ['name', 'topic'])
})

console.log('translation')

test('chunkText respects the provider limit', () => {
  const long = 'The plugin adds a sidebar. '.repeat(60)
  const chunks = chunkText(long, 200)
  assert.ok(chunks.length > 1)
  assert.ok(chunks.every((chunk) => chunk.length <= 200))
})

test('polishTranslation repairs the harness mistranslation', () => {
  assert.equal(polishTranslation('DeepSeek 线束的插件', 'x'), 'DeepSeek Harness的插件')
  assert.equal(polishTranslation('hello world', 'hello world'), '')
  assert.equal(polishTranslation('纯英文没有翻译', 'src'), '纯英文没有翻译')
})

test('translator batches, caches and reports missing', async () => {
  const calls = []
  const providers = {
    fake: {
      name: 'fake',
      batchSize: 2,
      async translate(texts) {
        calls.push(texts.length)
        return texts.map((text) => `译文 ${text.length}`)
      },
    },
    broken: {
      name: 'broken',
      batchSize: 1,
      async translate() { throw new Error('blocked') },
    },
  }
  const translator = new Translator({ cacheFile: path.join(tmp, 'cache.json'), providers, order: ['broken', 'fake'] })
  const texts = ['alpha plugin', 'beta plugin', 'gamma plugin']
  const first = await translator.translate(texts)
  assert.equal(Object.keys(first.entries).length, 3)
  assert.ok(first.entries['alpha plugin'], 'entries are keyed by the source text')
  assert.equal(first.entries['alpha plugin'].provider, 'fake')
  assert.equal(first.stillMissing.length, 0)
  assert.equal(Object.values(first.entries)[0].provider, 'fake')
  assert.deepEqual(calls, [2, 1])
  const second = await translator.translate(texts)
  assert.equal(second.cached, 3)
  assert.deepEqual(calls, [2, 1], 'second run must come from cache')

  const brokenOnly = new Translator({ cacheFile: path.join(tmp, 'cache2.json'), providers, order: ['broken'] })
  const third = await brokenOnly.translate(['delta plugin'])
  assert.equal(Object.keys(third.entries).length, 0)
  assert.equal(third.stillMissing.length, 1)
  assert.equal(brokenOnly.health.broken.benched, undefined)
})

test('a provider that echoes the source is treated as failing', async () => {
  const echo = { name: 'echo', batchSize: 5, async translate(texts) { return texts } }
  const good = { name: 'good', batchSize: 5, async translate(texts) { return texts.map((text) => '译文' + text.length) } }
  const translator = new Translator({ cacheFile: path.join(tmp, 'cache-echo.json'), providers: { echo, good }, order: ['echo', 'good'] })
  const result = await translator.translate(['echoed plugin text'])
  assert.equal(result.entries['echoed plugin text'].provider, 'good')
  assert.equal(result.stillMissing.length, 0)
})

test('translator skips Chinese and short strings', async () => {
  const providers = { fake: { name: 'fake', batchSize: 5, async translate(t) { return t.map(() => '译文') } } }
  const translator = new Translator({ cacheFile: path.join(tmp, 'cache3.json'), providers, order: ['fake'] })
  const result = await translator.translate(['中文简介已经存在', 'ab', ''])
  assert.equal(Object.keys(result.entries).length, 0)
  assert.equal(result.missing.length, 0)
})

console.log('host-native translation')

test('model output is parsed through fences, envelopes and junk', () => {
  assert.deepEqual(parseTranslationArray('["甲","乙"]', 2), ['甲', '乙'])
  assert.deepEqual(parseTranslationArray('```json\n["甲","乙"]\n```', 2), ['甲', '乙'])
  assert.deepEqual(parseTranslationArray('Sure:\n{"translations":["甲","乙"]}', 2), ['甲', '乙'])
  assert.equal(parseTranslationArray('["甲"]', 2), null, 'wrong count must fall through')
  assert.equal(parseTranslationArray('只能翻译这一个', 1), null)
  assert.equal(parseTranslationArray('', 1), null)
})

await testAsync('the model provider streams a JSON array and refuses junk', async () => {
  async function* chunks(text) {
    for (const part of text.match(/[\s\S]{1,7}/g) || []) yield { type: 'text-delta', index: 0, text: part }
    yield { type: 'finish', reason: 'stop' }
  }
  const answer = JSON.stringify(['一个界面插件', '一个搜索工具'])
  const llm = {
    stream(options) {
      assert.equal(options.temperature, 0)
      assert.equal(options.messages[0].role, 'user')
      assert.deepEqual(JSON.parse(options.messages[0].content[0].text), ['a ui plugin', 'a search tool'])
      return chunks(answer)
    },
  }
  const provider = createLlmProvider({ llm, selection: () => ({ provider: 'deepseek', model: 'deepseek-chat' }) })
  const out = await provider.translate(['a ui plugin', 'a search tool'])
  assert.deepEqual(out, ['一个界面插件', '一个搜索工具'])

  const broken = createLlmProvider({ llm: { stream: () => chunks('sorry, I cannot') }, selection: () => ({ provider: 'x', model: 'y' }) })
  await assert.rejects(() => broken.translate(['a ui plugin']), /translation array/)

  const missing = createLlmProvider({ llm: null, selection: () => null })
  await assert.rejects(() => missing.translate(['a ui plugin']), /llm service unavailable/)
})

await testAsync('the native translator service provider uses an anonymous route', async () => {
  const service = {
    async availableProviders() { return ['bing', 'deepseek-official'] },
    resolve(request) {
      assert.equal(request.targetLanguage, 'zh-CN')
      assert.equal(request.provider, 'bing', 'paid routes must never be borrowed')
      return { text: request.text, provider: 'bing', targetLanguage: 'zh-CN' }
    },
    async translate(spec) { return `译文：${spec.text}` },
  }
  const provider = createTranslatorServiceProvider({ translator: service })
  assert.deepEqual(await provider.translate(['a', 'b']), ['译文：a', '译文：b'])
  const offline = createTranslatorServiceProvider({ translator: { async availableProviders() { return [] }, async translate() { return 'x' } } })
  await assert.rejects(() => offline.translate(['a']), /no native translation route/)
})

test('the host ladder puts the model first and keeps the public routes', () => {
  const { providers, order } = hostProviders({})
  assert.deepEqual(order, ['llm', 'dsh', 'bing', 'mymemory', 'google'])
  for (const name of order) assert.ok(providers[name], `provider ${name} exists`)
})

await testAsync('the model provider halves a bad batch instead of losing it', async () => {
  const llm = {
    stream(options) {
      const texts = JSON.parse(options.messages[0].content[0].text)
      const answer = texts.length > 2 ? 'too many, sorry' : JSON.stringify(texts.map((text) => `中${text}`))
      async function* gen() { yield { type: 'text-delta', index: 0, text: answer } }
      return gen()
    },
  }
  const { providers } = hostProviders({ llm, selection: () => ({ provider: 'p', model: 'm' }) })
  assert.deepEqual(await providers.llm.translate(['a', 'b', 'c', 'd']), ['中a', '中b', '中c', '中d'])
})

await testAsync('the model provider discovers a route when no selection is saved', async () => {
  const llm = {
    listProviders: () => [{ id: 'p1', name: 'p1' }, { id: 'p2', name: 'p2' }],
    async listModels(provider) {
      if (provider === 'p1') throw new Error('offline')
      return [{ id: 'm2', name: 'm2' }]
    },
    stream(options) {
      assert.equal(options.provider, 'p2')
      assert.equal(options.model, 'm2')
      async function* gen() { yield { type: 'text-delta', index: 0, text: '["中x"]' } }
      return gen()
    },
  }
  const provider = createLlmProvider({ llm, selection: () => null })
  assert.deepEqual(await provider.translate(['x']), ['中x'])
})

await testAsync('a translator built on the host ladder prefers the model', async () => {
  const { providers, order } = hostProviders({
    llm: {
      stream() {
        async function* gen() { yield { type: 'text-delta', index: 0, text: '["模型译文"]' } }
        return gen()
      },
    },
    selection: () => ({ provider: 'deepseek', model: 'deepseek-chat' }),
  })
  const translator = new Translator({ cacheFile: path.join(tmp, 'cache-host.json'), providers, order })
  const result = await translator.translate(['alpha plugin'])
  assert.equal(result.entries['alpha plugin'].provider, 'llm')
  assert.equal(result.entries['alpha plugin'].zh, '模型译文')
})

console.log('sorting')

test('star ordering is strict and stable', () => {
  assert.deepEqual(SORT_MODES, ['relevance', 'stars', 'updated'])
  const intent = parseIntent('plugin')
  const records = [
    { full_name: 'a/small', desc: 'plugin', stars: 2, topics: [], updated: '2026-01-01T00:00:00Z' },
    { full_name: 'b/big', desc: 'plugin', stars: 900, topics: [], updated: '2025-01-01T00:00:00Z' },
    { full_name: 'c/mid', desc: 'plugin', stars: 40, topics: [], updated: '2026-10-01T00:00:00Z' },
  ]
  const byStars = sortRanked(dedupe(records), intent, { sort: 'stars' })
  assert.deepEqual(byStars.map((r) => r.full_name), ['b/big', 'c/mid', 'a/small'])
  const byUpdated = sortRanked(dedupe(records), intent, { sort: 'updated' })
  assert.deepEqual(byUpdated.map((r) => r.full_name), ['c/mid', 'a/small', 'b/big'])
})

console.log('store')

test('store upserts and hydrates cards', () => {
  const store = new Store()
  const added = store.upsert([{ full_name: 'a/b', desc: 'hello', stars: 3, topics: ['dsh'], sources: ['test'] }])
  assert.equal(added, 1)
  const cards = store.all()
  assert.equal(cards.length, 1)
  assert.equal(cards[0].url, 'https://github.com/a/b')
  assert.equal(store.stats().size, 1)
})

test('seed cards match names only and stay marked', () => {
  const store = new Store()
  store.seed = { names: ['x/dsh-widget-a', 'y/unrelated'], fetchedAt: Date.now(), source: 'test' }
  const cards = store.seedCards(parseIntent('dsh-widget'), 10)
  assert.equal(cards.length, 1)
  assert.equal(cards[0].seedOnly, true)
  assert.equal(store.seedCards(parseIntent(''), 10).length, 0)
})

console.log('search orchestration (mocked network)')

const realFetch = globalThis.fetch
function installMockFetch(routes) {
  globalThis.fetch = async (url, options) => {
    const href = String(url)
    for (const [pattern, handler] of routes) {
      if (href.includes(pattern)) {
        const body = typeof handler === 'function' ? handler(href, options) : handler
        return new Response(body === undefined ? '{}' : JSON.stringify(body), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-ratelimit-remaining': '9',
            'x-ratelimit-limit': '10',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60),
          },
        })
      }
    }
    return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404, headers: { 'content-type': 'application/json' } })
  }
}
function uninstallMockFetch() { globalThis.fetch = realFetch }

function repoItem(full_name, extra) {
  return {
    full_name,
    name: full_name.split('/')[1],
    html_url: `https://github.com/${full_name}`,
    description: (extra && extra.description) || 'a dsh plugin',
    stargazers_count: (extra && extra.stars) || 1,
    pushed_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    topics: (extra && extra.topics) || ['dsh-plugin'],
    language: 'TypeScript',
    archived: false,
    fork: false,
  }
}

await testAsync('exact mode resolves the repository and separates related results', async () => {
  resetAll()
  installMockFetch([
    ['/repos/o/dsh-lean', { full_name: 'o/dsh-lean', name: 'dsh-lean', html_url: 'https://github.com/o/dsh-lean', description: 'lean contract', stargazers_count: 7, pushed_at: new Date().toISOString(), created_at: new Date().toISOString(), topics: [], language: 'TypeScript' }],
    ['/search/repositories', { total_count: 2, incomplete_results: false, items: [repoItem('o/dsh-lean-themes'), repoItem('o/dsh-lean')] }],
  ])
  try {
    const result = await runSearch({ query: 'o/dsh-lean', mode: 'auto', depth: 1 })
    assert.equal(result.mode, 'exact')
    assert.equal(result.exact.full_name, 'o/dsh-lean')
    assert.equal(result.exactNote, 'exact-hit')
    assert.ok(result.items.every((item) => item.full_name !== 'o/dsh-lean'))
    assert.ok(result.meta.channels.some((channel) => channel.id === 'exact'))
  } finally {
    uninstallMockFetch()
  }
})

await testAsync('keyword mode merges channels, ranks and indexes', async () => {
  resetAll()
  installMockFetch([
    ['/search/repositories', { total_count: 3, incomplete_results: false, items: [repoItem('a/memory-plugin', { stars: 10 }), repoItem('b/other-plugin', { description: 'memory search' })] }],
  ])
  try {
    const result = await runSearch({ query: 'memory', mode: 'keyword', depth: 1, seed: false })
    assert.equal(result.mode, 'keyword')
    assert.ok(result.items.length >= 2)
    assert.ok(result.items.some((item) => item.full_name === 'a/memory-plugin'))
    assert.ok(result.items.every((item) => item.category))
    assert.ok(result.meta.index.size >= 2)
    assert.ok(result.meta.channels.length >= 1)
  } finally {
    uninstallMockFetch()
  }
})

await testAsync('unknown exact name reports not-found instead of fuzzy matches as answer', async () => {
  resetAll()
  installMockFetch([
    ['/search/repositories', { total_count: 1, items: [repoItem('someone/nope-tools')] }],
  ])
  try {
    const result = await runSearch({ query: 'o/nope', mode: 'auto' })
    assert.equal(result.exact, null)
    assert.equal(result.exactNote, 'repo-404')
    assert.ok(result.items.length === 1)
  } finally {
    uninstallMockFetch()
  }
})

await testAsync('budget exhaustion is reported, not silently truncated', async () => {
  resetAll()
  installMockFetch([['/search/repositories', { total_count: 1, items: [repoItem('a/b')] }]])
  try {
    const result = await runSearch({ query: '', mode: 'auto', depth: 1, seed: false })
    assert.ok(result.meta.rate.spent.search <= requestBudget(1))
    assert.equal(result.meta.stopped, 'budget')
    assert.ok(result.meta.deferred.length > 0)
  } finally {
    uninstallMockFetch()
  }
})

await testAsync('a browse round keeps more than the old 240-item cap', async () => {
  resetAll()
  const items = []
  for (let index = 0; index < 300; index += 1) items.push(repoItem(`owner${index}/dsh-plugin-${index}`))
  installMockFetch([['/search/repositories', { total_count: 300, items }]])
  try {
    const result = await runSearch({ query: '', mode: 'browse', depth: 1, seed: false })
    assert.ok(result.items.length > 240, `expected >240 items, got ${result.items.length}`)
  } finally {
    uninstallMockFetch()
  }
})

await testAsync('search accepts a star order and reports it', async () => {
  resetAll()
  const items = [
    Object.assign(repoItem('owner/low-stars'), { stargazers_count: 1 }),
    Object.assign(repoItem('owner/high-stars'), { stargazers_count: 5000 }),
    Object.assign(repoItem('owner/mid-stars'), { stargazers_count: 300 }),
  ]
  installMockFetch([['/search/repositories', { total_count: 3, items }]])
  try {
    const result = await runSearch({ query: '', mode: 'browse', depth: 1, seed: false, sort: 'stars' })
    assert.equal(result.meta.sort, 'stars')
    assert.deepEqual(result.items.slice(0, 3).map((item) => item.stars), [5000, 300, 1])
    const relevance = await runSearch({ query: '', mode: 'browse', depth: 1, seed: false, sort: 'nonsense' })
    assert.equal(relevance.meta.sort, 'relevance')
  } finally {
    uninstallMockFetch()
  }
})

await testAsync('browse mode answers from the accumulated index when live channels find nothing', async () => {
  resetAll()
  const store = getStore()
  store.upsert([
    { full_name: 'seen/earlier-plugin', desc: 'a plugin indexed during an earlier run', stars: 4, topics: ['dsh-plugin'], sources: ['topic:dsh-plugin'] },
  ])
  installMockFetch([['/search/repositories', { total_count: 0, items: [] }]])
  try {
    const result = await runSearch({ query: '', mode: 'browse', depth: 1, seed: false })
    assert.ok(result.items.some((item) => item.full_name === 'seen/earlier-plugin'))
    assert.ok(result.items.some((item) => (item.sources || []).includes('index')))
  } finally {
    uninstallMockFetch()
  }
})

console.log('http handlers')

function fakeResponse() {
  const chunks = []
  return {
    status: 200,
    headers: {},
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers || {}) },
    end(body) { chunks.push(String(body || '')) },
    body() { const raw = chunks.join(''); try { return JSON.parse(raw) } catch { return raw } },
  }
}

function fakeRequest(body) {
  const listeners = {}
  const req = {
    method: 'POST',
    headers: { host: '127.0.0.1:1' },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); return req },
    destroy() {},
  }
  setTimeout(() => {
    if (body !== undefined) for (const fn of listeners.data || []) fn(Buffer.from(JSON.stringify(body)))
    for (const fn of listeners.end || []) fn()
  }, 0)
  return req
}

await testAsync('search handler answers with JSON', async () => {
  resetAll()
  installMockFetch([['/search/repositories', { total_count: 1, items: [repoItem('a/b')] }]])
  try {
    const handlers = createHandlers()
    const res = fakeResponse()
    await handlers['/github-plugin-finder/search'](fakeRequest({ query: 'dsh plugin', mode: 'keyword', seed: false }), res)
    const payload = res.body()
    assert.equal(res.status, 200)
    assert.equal(payload.ok, true)
    assert.ok(Array.isArray(payload.items))
  } finally {
    uninstallMockFetch()
  }
})

await testAsync('translate handler uses the injected translator', async () => {
  const providers = { fake: { name: 'fake', batchSize: 10, async translate(texts) { return texts.map(() => '中文译文') } } }
  const translator = new Translator({ cacheFile: path.join(tmp, 'route-cache.json'), providers, order: ['fake'] })
  const handlers = createHandlers({ translator })
  const res = fakeResponse()
  await handlers['/github-plugin-finder/translate'](fakeRequest({ texts: ['a nice plugin'] }), res)
  const payload = res.body()
  assert.equal(payload.ok, true)
  assert.equal(Object.keys(payload.entries).length, 1)
  assert.equal(payload.entries['a nice plugin'].zh, '中文译文')
})

await testAsync('translate handler rejects oversized bodies', async () => {
  const handlers = createHandlers({ translator: new Translator({ cacheFile: path.join(tmp, 'route-cache2.json') }) })
  const res = fakeResponse()
  await handlers['/github-plugin-finder/translate'](fakeRequest({ texts: 'x'.repeat(600 * 1024) }), res)
  assert.equal(res.status, 400)
})

await testAsync('host entry registers its routes on the web server', async () => {
  resetAll()
  const plugin = await import('../index.js')
  const routes = new Map()
  const ctx = {
    webServer: { register(route) { routes.set(route.path, route); return () => {} } },
    effect(fn) { fn() },
  }
  plugin.apply({
    inject(services, callback) {
      assert.deepEqual(services, ['webServer'])
      callback(ctx)
    },
    effect() {},
  })
  assert.equal(routes.size, 4)
  const health = routes.get('/github-plugin-finder/health')
  assert.ok(health, 'health route is registered')
  const res = fakeResponse()
  await health.handler({ method: 'GET', url: '/github-plugin-finder/health', headers: {} }, res)
  assert.equal(res.status, 200)
  assert.equal(res.body().ok, true)

  const wrongMethod = fakeResponse()
  await health.handler({ method: 'PUT', headers: {} }, wrongMethod)
  assert.equal(wrongMethod.status, 405)
})

console.log('github client')

await testAsync('rate headers are tracked and cached pages are reused', async () => {
  resetAll()
  const client = new GitHubClient({ token: '' })
  let calls = 0
  installMockFetch([['/search/repositories', () => { calls += 1; return { total_count: 1, items: [repoItem('a/b')] } }]])
  try {
    const first = await client.searchRepos('topic:dsh-plugin', { perPage: 100, pages: 1 })
    const second = await client.searchRepos('topic:dsh-plugin', { perPage: 100, pages: 1 })
    assert.equal(first.items.length, 1)
    assert.equal(second.items.length, 1)
    assert.equal(calls, 1, 'second call must hit the query cache')
    assert.equal(client.rate.remaining, 9)
  } finally {
    uninstallMockFetch()
  }
})

await testAsync('query pages are cached across client instances', async () => {
  resetAll()
  let calls = 0
  installMockFetch([['/search/repositories', () => { calls += 1; return { total_count: 1, items: [repoItem('a/b')] } }]])
  try {
    const first = new GitHubClient({ token: '' })
    const second = new GitHubClient({ token: '' })
    await first.searchRepos('topic:shared-cache', { perPage: 100, pages: 1 })
    await second.searchRepos('topic:shared-cache', { perPage: 100, pages: 1 })
    // A client is created per request, so a per-instance cache would make the
    // second round of a search pay for the same pages again.
    assert.equal(calls, 1, 'the cache must outlive the client instance')
  } finally {
    uninstallMockFetch()
  }
})

console.log('')
if (failures.length) {
  console.log(`FAILED ${failures.length} / ${passed + failures.length}`)
  for (const failure of failures) console.log(` - ${failure.name}: ${(failure.error && failure.error.stack) || failure.error}`)
  process.exitCode = 1
} else {
  console.log(`All ${passed} checks passed (state dir: ${tmp})`)
  fs.rmSync(tmp, { recursive: true, force: true })
}
