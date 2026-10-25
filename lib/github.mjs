/**
 * GitHub REST client with an honest request budget.
 *
 * Unauthenticated GitHub allows 10 *search* requests per minute and 60 core
 * requests per hour; a token raises that to 30/min and 5000/h. The old panel
 * ignored both numbers, so a search that needed 12 queries lost the last two
 * (and therefore part of the ecosystem) to 403s. This client:
 *
 *   - hands out search requests from a token bucket (burst 5, then paced),
 *   - reads `x-ratelimit-remaining/reset` from every response and parks the
 *     bucket until the reset when it hits zero,
 *   - caches successful query pages for a few minutes, so re-running the same
 *     search is free,
 *   - reports `spent` / `rate` / `stopped` so the UI can say "deferred 4
 *     channels, add a token to continue" instead of silently truncating.
 */

import { HttpError, request, requestJson, clip, sleep } from './util.mjs'

export class RateLimitError extends Error {
  constructor(message, { resetAt, kind = 'rate' } = {}) {
    super(message)
    this.name = 'RateLimitError'
    this.kind = kind
    this.resetAt = resetAt
  }
}

export class BudgetExceededError extends Error {
  constructor(message) {
    super(message)
    this.name = 'BudgetExceededError'
    this.kind = 'budget'
  }
}

const QUERY_CACHE_TTL_MS = 8 * 60 * 1000

/**
 * Query-page cache shared by every client. A client is created per search
 * request, so an instance cache would be thrown away between clicks and every
 * run would re-buy (and re-lose) the same tail of channels. Sharing the cache
 * makes a second round over the same plan free, which is what lets the panel
 * finish the channels the first round could not afford.
 */
const QUERY_CACHE = new Map()

/** Test hook: drop cached pages so a mocked fetch is actually consulted. */
export function resetNetworkCacheForTests() {
  QUERY_CACHE.clear()
}

/**
 * Rate state shared by every client in this process. A search creates a fresh
 * client per request, so without this an exhausted quota would be discovered
 * again (and again) on every click.
 */
export const sharedRate = { remaining: null, limit: null, resetAt: null, pausedUntil: 0, stopped: '' }

export function rateSnapshot() {
  return { ...sharedRate, pausedMs: Math.max(0, sharedRate.pausedUntil - Date.now()) }
}

export class GitHubClient {
  /**
   * @param {{token?: string, timeoutMs?: number, maxSearchRequests?: number, minIntervalMs?: number}} options
   */
  constructor({ token = '', timeoutMs = 12000, maxSearchRequests = 0, minIntervalMs = 0 } = {}) {
    this.token = String(token || '').trim()
    this.timeoutMs = timeoutMs
    this.maxSearchRequests = maxSearchRequests > 0 ? maxSearchRequests : 0
    this.authed = Boolean(this.token)
    this.rate = { remaining: null, limit: null, reset: null, resource: 'search' }
    this.spent = { search: 0, core: 0 }
    this.lastSearchAt = 0
    this.pausedUntil = 0
    this.stopped = ''
    // 10/min unauth => one request per 6s after the burst; 30/min auth => 2s.
    this.minIntervalMs = minIntervalMs > 0 ? minIntervalMs : (this.authed ? 2000 : 6000)
    this.burst = 5
    if (sharedRate.pausedUntil > Date.now()) {
      this.pausedUntil = sharedRate.pausedUntil
      this.stopped = sharedRate.stopped || 'quota-exhausted'
    }
    if (sharedRate.remaining !== null) this.rate.remaining = sharedRate.remaining
    if (sharedRate.limit !== null) this.rate.limit = sharedRate.limit
    if (sharedRate.resetAt !== null) this.rate.reset = Math.floor(sharedRate.resetAt / 1000)
  }

  snapshot() {
    return {
      authed: this.authed,
      spent: { ...this.spent },
      remaining: this.rate.remaining,
      limit: this.rate.limit,
      resetAt: this.rate.reset ? Number(this.rate.reset) * 1000 : null,
      stopped: this.stopped,
      pausedMs: Math.max(0, this.pausedUntil - Date.now()),
    }
  }

  _headers(extra) {
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(extra || {}) }
    if (this.token) headers.Authorization = `Bearer ${this.token}`
    return headers
  }

  _updateRate(headers, resource) {
    if (!headers) return
    const remaining = headers['x-ratelimit-remaining']
    const limit = headers['x-ratelimit-limit']
    const reset = headers['x-ratelimit-reset']
    if (remaining !== undefined) this.rate.remaining = Number(remaining)
    if (limit !== undefined) this.rate.limit = Number(limit)
    if (reset !== undefined) this.rate.reset = Number(reset)
    if (resource) this.rate.resource = resource
    if (resource !== 'search') return
    sharedRate.remaining = this.rate.remaining
    sharedRate.limit = this.rate.limit
    sharedRate.resetAt = this.rate.reset ? this.rate.reset * 1000 : null
    if (this.rate.remaining === 0 && this.rate.reset) {
      this.pausedUntil = Math.max(this.pausedUntil, this.rate.reset * 1000 + 1500)
      this.stopped = this.stopped || 'quota-exhausted'
      sharedRate.pausedUntil = this.pausedUntil
      sharedRate.stopped = this.stopped
    }
  }

  /** Wait for a slot in the search bucket; throw when the budget cannot pay. */
  async _takeSearch() {
    if (this.maxSearchRequests && this.spent.search >= this.maxSearchRequests) {
      throw new BudgetExceededError('search budget for this run is used up')
    }
    if (this.stopped === 'quota-exhausted') {
      throw new RateLimitError('GitHub search quota is exhausted', { resetAt: this.rate.reset ? Number(this.rate.reset) * 1000 : null })
    }
    const now = Date.now()
    if (now < this.pausedUntil) {
      throw new RateLimitError('GitHub asked us to wait before searching again', { resetAt: this.pausedUntil })
    }
    if (this.spent.search >= this.burst) {
      const wait = this.minIntervalMs - (now - this.lastSearchAt)
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    }
    this.lastSearchAt = Date.now()
    this.spent.search += 1
  }

  _cacheGet(key) {
    const hit = QUERY_CACHE.get(key)
    if (!hit) return null
    if (Date.now() - hit.at > QUERY_CACHE_TTL_MS) {
      QUERY_CACHE.delete(key)
      return null
    }
    return hit.value
  }

  _cacheSet(key, value) {
    if (QUERY_CACHE.size > 900) QUERY_CACHE.clear()
    QUERY_CACHE.set(key, { at: Date.now(), value })
  }

  /** Raw fetch that keeps headers (search + repo lookups go through this). */
  async _fetchWithHeaders(url, resource) {
    const { headers, text } = await request(url, { headers: this._headers(), timeoutMs: this.timeoutMs })
    // Search requests are already counted when a budget slot is reserved in
    // `_takeSearch`; counting them again here would make the budget lie.
    if (resource !== 'search') this.spent[resource] = (this.spent[resource] || 0) + 1
    let data
    try {
      data = JSON.parse(text)
    } catch {
      throw new HttpError('GitHub returned a non-JSON body', { url, kind: 'parse', body: clip(text, 200) })
    }
    return { data, headers }
  }

  /**
   * One API call with rate-limit translation and short retries for 5xx.
   * 403/429 carrying a rate message becomes a RateLimitError, which the
   * orchestrator treats as "stop spending, report honestly".
   */
  async _call(url, resource, retries = 2) {
    let attempt = 0
    for (;;) {
      try {
        const { data, headers } = await this._fetchWithHeaders(url, resource)
        this._updateRate(headers, resource)
        return { data, headers }
      } catch (error) {
        if (error instanceof HttpError && (error.status === 403 || error.status === 429)) {
          const body = String(error.body || '')
          if (/rate limit|too many|secondary/i.test(body) || error.status === 429) {
            const resetAt = this.rate.reset ? Number(this.rate.reset) * 1000 : Date.now() + 60000
            this.pausedUntil = Math.max(this.pausedUntil, resetAt + 1000)
            this.stopped = 'quota-exhausted'
            sharedRate.pausedUntil = this.pausedUntil
            sharedRate.stopped = this.stopped
            sharedRate.resetAt = resetAt
            throw new RateLimitError('GitHub search rate limit reached', { resetAt })
          }
        }
        if (error instanceof HttpError && error.status >= 500 && attempt < retries) {
          attempt += 1
          await sleep(400 * attempt)
          continue
        }
        throw error
      }
    }
  }

  /**
   * Search repositories across pages. Returns collected items plus per-query
   * diagnostics; errors bubble up as Rate/Budget errors so the caller can stop
   * the whole plan instead of losing one silent channel.
   */
  async searchRepos(q, { sort, order = 'desc', perPage = 100, pages = 1, onPage } = {}) {
    const out = []
    let pageNotes = null
    for (let page = 1; page <= Math.max(1, pages); page++) {
      const key = `repos|${q}|${sort || ''}|${order}|${perPage}|${page}`
      const cached = this._cacheGet(key)
      if (cached) {
        out.push(...cached.items)
        pageNotes = cached.notes
        if (cached.items.length < perPage) break
        continue
      }
      await this._takeSearch()
      const params = { q, per_page: perPage, page }
      if (sort) {
        params.sort = sort
        params.order = order
      }
      const url = new URL('https://api.github.com/search/repositories')
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
      const { data } = await this._call(url.toString(), 'search')
      const items = Array.isArray(data.items) ? data.items : []
      pageNotes = { total: data.total_count, incomplete: Boolean(data.incomplete_results) }
      this._cacheSet(key, { items, notes: pageNotes })
      out.push(...items)
      if (onPage) onPage(items, page)
      if (items.length < perPage) break
      if (this.rate.remaining !== null && this.rate.remaining <= 0) break
    }
    return { items: out, notes: pageNotes }
  }

  async searchCode(q, { perPage = 50, pages = 1 } = {}) {
    const out = []
    for (let page = 1; page <= Math.max(1, pages); page++) {
      const key = `code|${q}|${perPage}|${page}`
      const cached = this._cacheGet(key)
      if (cached) {
        out.push(...cached.items)
        if (cached.items.length < perPage) break
        continue
      }
      await this._takeSearch()
      const url = new URL('https://api.github.com/search/code')
      url.searchParams.set('q', q)
      url.searchParams.set('per_page', String(perPage))
      url.searchParams.set('page', String(page))
      const { data } = await this._call(url.toString(), 'search')
      const items = Array.isArray(data.items) ? data.items : []
      this._cacheSet(key, { items })
      out.push(...items)
      if (items.length < perPage) break
    }
    return { items: out }
  }

  async getRepo(owner, name) {
    const key = `repo|${owner}/${name}`
    const cached = this._cacheGet(key)
    if (cached) return cached
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
    const { data } = await this._call(url, 'core')
    this._cacheSet(key, data)
    return data
  }
}

/** npm registry search — separate quota, useful when GitHub is throttled. */
export async function searchNpm(text, { size = 50, timeoutMs = 12000 } = {}) {
  const url = `https://registry.npmjs.org/-/v1/search?size=${size}&text=${encodeURIComponent(text)}`
  const data = await requestJson(url, { timeoutMs })
  return Array.isArray(data && data.objects) ? data.objects : []
}

/** Convert a GitHub search item into the record shape used everywhere else. */
export function fromGitHubRepo(item, source) {
  if (!item || !item.full_name) return null
  const created = item.created_at ? Date.parse(item.created_at) : 0
  return {
    full_name: item.full_name,
    url: item.html_url || `https://github.com/${item.full_name}`,
    desc: item.description || '',
    stars: Number(item.stargazers_count) || 0,
    updated: item.pushed_at || item.updated_at || null,
    created: item.created_at || null,
    topics: Array.isArray(item.topics) ? item.topics.slice(0, 12) : [],
    language: item.language || '',
    archived: Boolean(item.archived),
    fork: Boolean(item.fork),
    newlyCreated: created ? Date.now() - created < 21 * 86400000 : false,
    sources: source ? [source] : [],
    score: 0,
  }
}

/** Convert an npm search object into a record (for repos that only live there). */
export function fromNpmObject(obj, source = 'npm') {
  const pkg = (obj && obj.package) || {}
  const link = (pkg.links && (pkg.links.repository || pkg.links.npm)) || ''
  const match = /github\.com[/:]([^/]+)\/([^/?#]+)/.exec(link)
  const full = match ? `${match[1]}/${String(match[2]).replace(/\.git$/, '')}` : `npm:${pkg.name || ''}`
  const updated = pkg.date ? new Date(pkg.date).toISOString() : null
  return {
    full_name: full,
    url: match ? `https://github.com/${full}` : (link || `https://www.npmjs.com/package/${pkg.name || ''}`),
    desc: pkg.description || '',
    stars: 0,
    updated,
    created: null,
    topics: Array.isArray(pkg.keywords) ? pkg.keywords.slice(0, 12) : [],
    language: 'npm',
    archived: false,
    fork: false,
    newlyCreated: false,
    npmName: pkg.name || '',
    sources: [source],
    score: 0,
  }
}
