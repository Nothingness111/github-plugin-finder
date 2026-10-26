/**
 * Search orchestration: intent -> channels -> merge -> rank -> index.
 *
 * Two behaviours matter here and both were missing before:
 *
 *  1. Exact names short-circuit the whole plan. `dsh-lean` is resolved as that
 *     repository; the search engine may still return "related" repositories,
 *     but they are returned in a separate bucket and never presented as the
 *     answer.
 *  2. Coverage is accumulated, not re-bought. Live channels are merged into the
 *     local index every run, and the local index participates in the next
 *     ranking, so "everything" grows even when GitHub's quota is exhausted.
 */

import { GitHubClient, RateLimitError, BudgetExceededError, fromGitHubRepo, fromNpmObject, searchNpm } from './github.mjs'
import { parseIntent, describeIntent } from './intent.mjs'
import { buildPlan, orderSteps } from './plan.mjs'
import { dedupe, sortRanked, classify, pluginSignal } from './rank.mjs'
import { getStore } from './store.mjs'
import { cleanText, clip, hasCJK, requestJson } from './util.mjs'

const MAX_ITEMS = 1200
const EXACT_LOOKUP_TIMEOUT_MS = 9000

/**
 * How many live GitHub queries one round may spend. Rounds are cheap to repeat
 * (query pages are cached across runs), so a tight first round is fine as long
 * as the caller comes back for the deferred tail — the panel does.
 */
export function requestBudget(depth) {
  if (depth >= 3) return 20
  if (depth >= 2) return 14
  return 8
}

function cardFromRepo(repo, source) {
  const card = fromGitHubRepo(repo, source)
  if (!card) return null
  card.desc = cleanText(card.desc)
  return card
}

function localMatches(intent, limit = 400) {
  const store = getStore()
  if (intent.mode === 'browse') {
    return store.all().slice(0, limit).map((card) => ({ ...card, sources: ['index'], seedOnly: false }))
  }
  const terms = (intent.terms || []).map((t) => String(t).toLowerCase())
  const exactName = intent.exact && intent.exact.name ? String(intent.exact.name).toLowerCase() : ''
  const cards = []
  for (const card of store.all()) {
    const haystack = `${card.full_name} ${card.desc} ${(card.topics || []).join(' ')}`.toLowerCase()
    let hit = false
    if (exactName && haystack.includes(exactName)) hit = true
    else if (terms.length && terms.some((term) => haystack.includes(term))) hit = true
    else if (intent.owner && String(card.full_name).toLowerCase().startsWith(`${String(intent.owner).toLowerCase()}/`)) hit = true
    else if (intent.topics && intent.topics.length && (card.topics || []).some((t) => intent.topics.includes(String(t).toLowerCase()))) hit = true
    if (!hit) continue
    cards.push({ ...card, sources: ['index'], seedOnly: false })
    if (cards.length >= limit) break
  }
  return cards
}

async function resolveExact(intent, { client, token }) {
  const target = intent.exact
  if (!target) return { card: null, note: 'no-target' }

  if (target.kind === 'repo') {
    try {
      const repo = await client.getRepo(target.owner, target.name)
      const card = cardFromRepo(repo, 'exact')
      return { card, note: 'exact-hit' }
    } catch (error) {
      if (error && error.status === 404) return { card: null, note: 'repo-404' }
      if (error && (error.kind === 'network' || error.kind === 'timeout')) {
        const cached = getStore().all().find((card) => String(card.full_name).toLowerCase() === target.value.toLowerCase())
        if (cached) return { card: { ...cached, sources: ['index-exact'] }, note: 'exact-from-index' }
      }
      return { card: null, note: `lookup-failed:${clip((error && error.message) || error, 80)}` }
    }
  }

  // npm package name: registry gives us the repository, GitHub search is the
  // fallback when the package metadata has no repository field.
  const npmName = target.value
  try {
    const pkg = await requestJson(`https://registry.npmjs.org/${encodeURIComponent(npmName)}`, {
      headers: { Accept: 'application/json' },
      timeoutMs: EXACT_LOOKUP_TIMEOUT_MS,
    })
    if (pkg) {
      const repoField = pkg.repository
      const repoUrl = typeof repoField === 'string' ? repoField : (repoField && repoField.url) || ''
      const match = /github\.com[/:]([^/]+)\/([^/?#]+)/.exec(repoUrl)
      if (match) {
        const owner = match[1]
        const name = String(match[2]).replace(/\.git$/, '')
        try {
          const repo = await client.getRepo(owner, name)
          const card = cardFromRepo(repo, 'exact-npm')
          if (card) {
            card.npmName = pkg.name
            return { card, note: 'exact-hit' }
          }
        } catch { /* fall through to search */ }
      } else if (pkg && pkg.name) {
        return {
          card: {
            full_name: `npm:${pkg.name}`,
            url: `https://www.npmjs.com/package/${pkg.name}`,
            desc: cleanText(pkg.description || ''),
            stars: 0,
            updated: null,
            created: null,
            topics: Array.isArray(pkg.keywords) ? pkg.keywords.slice(0, 12) : [],
            language: 'npm',
            archived: false,
            fork: false,
            sources: ['exact-npm'],
            score: 0,
          },
          note: 'exact-npm-only',
        }
      }
    }
  } catch { /* registry unreachable: use GitHub search below */ }

  try {
    const { items } = await client.searchRepos(`${npmName} in:name`, { perPage: 30, pages: 1 })
    const exact = items.find((item) => String(item.name || '').toLowerCase() === npmName.toLowerCase())
    if (exact) return { card: cardFromRepo(exact, 'exact-search'), note: 'exact-hit' }
  } catch (error) {
    return { card: null, note: `lookup-failed:${clip((error && error.message) || error, 80)}` }
  }
  void token
  return { card: null, note: 'not-found' }
}

async function runChannels(intent, { client, depth, warnings, channels }) {
  const plan = buildPlan(intent, { token: client.token, depth })
  const steps = orderSteps(plan.steps)
  const collected = []
  const deferred = []
  let stopped = ''
  let index = 0
  for (const step of steps) {
    if (stopped) break
    index += 1
    try {
      if (step.kind === 'code-search') {
        const { items } = await client.searchCode(step.q, { perPage: step.perPage || 50, pages: step.pages || 1 })
        const cards = []
        for (const item of items) {
          const repo = item && item.repository
          const card = repo ? cardFromRepo(repo, `code:${step.id}`) : null
          if (card) cards.push(card)
        }
        channels.push({ id: step.id, label: step.label || step.id, count: cards.length, kind: 'code' })
        collected.push(...cards)
      } else {
        const { items, notes } = await client.searchRepos(step.q, {
          sort: step.sort,
          order: step.order,
          perPage: step.perPage || 100,
          pages: step.pages || 1,
        })
        const cards = []
        for (const item of items) {
          const card = cardFromRepo(item, step.id)
          if (card) cards.push(card)
        }
        channels.push({
          id: step.id,
          label: step.label || step.id,
          count: cards.length,
          kind: 'github',
          total: notes ? notes.total : undefined,
        })
        collected.push(...cards)
      }
    } catch (error) {
      if (error instanceof RateLimitError || error instanceof BudgetExceededError) {
        stopped = error instanceof BudgetExceededError ? 'budget' : 'rate'
        deferred.push(...steps.slice(index - 1))
        break
      }
      channels.push({ id: step.id, label: step.label || step.id, count: 0, error: clip(String((error && error.message) || error), 120) })
      warnings.push(`${step.id}: ${clip(String((error && error.message) || error), 120)}`)
    }
  }
  return { collected, deferred, stopped, planned: steps.length }
}

/**
 * @param {{query?: string, mode?: 'auto'|'exact'|'keyword'|'browse'|'topic', depth?: number, token?: string, seed?: boolean, limit?: number}} input
 */
export async function runSearch(input = {}) {
  const started = Date.now()
  const depth = Math.min(3, Math.max(1, Number(input.depth) || 1))
  const store = getStore()
  const warnings = []
  const channels = []

  let intent = parseIntent(input.query || '')
  const forcedMode = input.mode && input.mode !== 'auto' ? input.mode : null
  if (forcedMode === 'browse') {
    intent = { ...intent, mode: 'browse', exact: null, terms: [] }
  } else if (forcedMode === 'keyword' && intent.mode === 'exact') {
    const value = intent.exact ? intent.exact.value : String(input.query || '')
    intent = { ...parseIntent(value.replace(/[\/@]/g, ' ')), mode: 'keyword', exact: null }
    if (!intent.terms.length) intent.terms = [value]
  } else if (forcedMode === 'exact' && intent.mode !== 'exact') {
    intent = { ...intent, mode: 'exact', exact: { kind: 'npm', value: String(input.query || '').trim(), name: String(input.query || '').trim() } }
  }

  const client = new GitHubClient({ token: input.token, maxSearchRequests: requestBudget(depth) })
  const limit = Math.min(MAX_ITEMS, Math.max(20, Number(input.limit) || MAX_ITEMS))
  const sortMode = ['stars', 'updated', 'relevance'].includes(String(input.sort || '')) ? String(input.sort) : 'relevance'

  const result = {
    ok: true,
    mode: intent.mode,
    intent: { raw: intent.raw, mode: intent.mode, terms: intent.terms, topics: intent.topics, owner: intent.owner, exact: intent.exact },
    intentLabel: describeIntent(intent),
    exact: null,
    exactNote: '',
    items: [],
    meta: {
      channels,
      deferred: [],
      stopped: '',
      warnings,
      elapsedMs: 0,
      depth,
      sort: sortMode,
      rate: client.snapshot(),
      index: store.stats(),
    },
  }

  if (intent.mode === 'exact' && intent.exact) {
    const resolution = await resolveExact(intent, { client, token: input.token })
    result.exact = resolution.card
    result.exactNote = resolution.note
    if (resolution.card) channels.push({ id: 'exact', label: '精确匹配', count: 1, kind: 'exact' })
    else warnings.push(`精确匹配未命中：${intent.exact.value}`)
    // Related results: one narrow channel, clearly labelled as related.
    try {
      const { items } = await client.searchRepos(`${intent.exact.name || intent.exact.value} in:name,description`, { perPage: 30, pages: 1 })
      const related = items
        .map((item) => cardFromRepo(item, 'related'))
        .filter((card) => card && (!resolution.card || card.full_name.toLowerCase() !== resolution.card.full_name.toLowerCase()))
      channels.push({ id: 'related', label: '相关结果', count: related.length, kind: 'github' })
      result.items = sortRanked(dedupe(related), intent, { sort: sortMode }).slice(0, 30)
    } catch (error) {
      if (error instanceof RateLimitError) result.meta.stopped = 'rate'
      warnings.push(`相关结果: ${clip(String((error && error.message) || error), 100)}`)
    }
  } else {
    const { collected, deferred, stopped, planned } = await runChannels(intent, { client, depth, warnings, channels })
    result.meta.deferred = deferred.map((step) => step.label || step.id)
    result.meta.stopped = stopped
    result.meta.planned = planned

    // npm is cheap and independent of the GitHub search quota, so it runs on
    // every non-exact search instead of only on deep runs.
    {
      const npmQuery = intent.terms.length ? `keywords:dsh-plugin ${intent.terms.join(' ')}` : 'keywords:dsh-plugin'
      try {
        const objects = await searchNpm(npmQuery, { size: 50 })
        const cards = objects.map((obj) => fromNpmObject(obj, 'npm')).filter((card) => card && (pluginSignal(card)))
        channels.push({ id: 'npm', label: 'npm', count: cards.length, kind: 'npm' })
        collected.push(...cards)
      } catch (error) {
        warnings.push(`npm: ${clip(String((error && error.message) || error), 100)}`)
      }
    }

    // The local index participates in every mode, browse included: that is how
    // "everything" keeps growing between runs.
    const local = localMatches(intent)
    const seedEnabled = input.seed !== false
    let seedInfo = null
    if (seedEnabled && (intent.mode === 'keyword' || intent.mode === 'topic' || intent.mode === 'owner')) {
      seedInfo = await store.ensureSeed({ token: input.token, enabled: true })
      if (seedInfo && seedInfo.error) warnings.push(`社区目录: ${seedInfo.error}`)
      const seeds = store.seedCards(intent, 40)
      channels.push({ id: 'catalog', label: '社区目录', count: seeds.length, kind: 'seed' })
      collected.push(...seeds)
    }
    result.meta.catalog = seedInfo || store.stats().seed

    const merged = dedupe([...collected, ...local])
    const ranked = sortRanked(merged, intent, { sort: sortMode })
    if (sortMode === 'relevance') {
      // Seed-only rows carry no description; they are useful as a last page, not
      // as the answer, so they must not outrank real metadata. Star/updated
      // order is left untouched: the user asked for that order specifically.
      ranked.sort((a, b) => Number(Boolean(a.seedOnly)) - Number(Boolean(b.seedOnly)) || b.score - a.score)
    }
    result.items = ranked.slice(0, limit)
    result.meta.sort = sortMode
    result.meta.totalCandidates = merged.length
    result.meta.indexable = merged.length
  }

  // Everything we actually saw belongs in the index, exact hits included.
  const fresh = [result.exact, ...result.items].filter((card) => card && !card.seedOnly)
  result.meta.indexAdded = store.upsert(fresh)
  for (const card of [result.exact, ...result.items].filter(Boolean)) {
    const growth = store.growthOf(card.full_name)
    if (growth && growth.delta > 0) card.growth = growth
  }
  result.meta.index = store.stats()
  store.flush()

  for (const item of result.items) {
    item.category = item.category || classify(item)
    if (item.desc && hasCJK(item.desc)) item.descIsChinese = true
  }
  if (result.exact) result.exact.category = result.exact.category || classify(result.exact)
  result.meta.elapsedMs = Date.now() - started
  result.meta.rate = client.snapshot()
  result.meta.translateHints = {
    count: [result.exact, ...result.items].filter(Boolean).filter((card) => card.desc && !hasCJK(card.desc)).length,
  }
  return result
}
