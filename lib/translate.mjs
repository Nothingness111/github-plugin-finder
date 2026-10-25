/**
 * Network translation with a cache and a provider ladder.
 *
 * The old implementation asked Google's free endpoint first for every single
 * description. On networks where that endpoint is unreachable, each request
 * burned its timeout before falling through to MyMemory, and the loop stopped
 * after 80 items - so a normal result set ended up half English. This module
 * fixes the shape of the problem instead of the timeout:
 *
 *   - three independent providers, each with its own batch size and health
 *     state; a provider that fails twice is benched for 30 minutes and the
 *     next one takes over,
 *   - batch-first (Bing accepts up to 10 short strings per request), so 100
 *     descriptions cost ~10 requests rather than 100,
 *   - every successful sentence is cached in memory *and* on disk, keyed by a
 *     hash of the source text, so a second visit is free and offline,
 *   - long descriptions are sentence-chunked to respect provider limits,
 *   - a deadline returns partial results plus the list still missing, which is
 *     what lets the UI show "42/100 translated - continue" instead of hanging,
 *   - a small glossary corrects the domain terms machine translators reliably
 *     ruin ("DeepSeek 线束" -> "DeepSeek Harness").
 *
 * Nothing here throws to the caller: an unreachable network yields
 * `missing: [...]`, never a broken panel.
 */

import { cleanText, clip, hasCJK, readJsonSync, shortHash, sleep, writeJsonSync, dataFile } from './util.mjs'

const CACHE_VERSION = 1
const CACHE_MAX = 20000
const BENCH_MS = 30 * 60 * 1000
const FAILS_BEFORE_BENCH = 2
const MAX_CHUNK = 460

const BING_AUTH_URL = 'https://edge.microsoft.com/translate/auth'
const BING_TRANSLATE_URL = 'https://api-edge.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=zh-Hans&textType=plain'
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get'
const GOOGLE_URL = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q='

/** Machine translators mangle these consistently; fix them after the fact. */
const GLOSSARY = [
  [/DeepSeek\s*的?\s*线束/gi, 'DeepSeek Harness'],
  [/线束/g, 'Harness'],
  [/哈内斯/gi, 'Harness'],
  [/深寻/gi, 'DeepSeek'],
  [/\bCordis\b/g, 'Cordis'],
  [/\bMCP\b/g, 'MCP'],
  [/\bDSH\b/g, 'DSH'],
  [/模型上下文协议/g, 'MCP（模型上下文协议）'],
]

export function chunkText(text, limit = MAX_CHUNK) {
  const clean = cleanText(text)
  if (clean.length <= limit) return clean ? [clean] : []
  const parts = clean.split(/(?<=[.!?;:])\s+/)
  const chunks = []
  let current = ''
  for (const part of parts) {
    if (!part) continue
    if ((current + ' ' + part).trim().length > limit && current) {
      chunks.push(current.trim())
      current = part
    } else {
      current = `${current} ${part}`.trim()
    }
    while (current.length > limit) {
      chunks.push(current.slice(0, limit))
      current = current.slice(limit)
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.slice(0, 6)
}

export function polishTranslation(zh, source) {
  let out = String(zh || '').trim()
  if (!out) return ''
  for (const [re, value] of GLOSSARY) out = out.replace(re, value)
  out = out
    .replace(/\s+([，。！？；：、])/g, '$1')
    .replace(/([，。！？；：、])\s+/g, '$1')
    .replace(/[，,]{2,}/g, '，')
    .replace(/[。.]{2,}/g, '。')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (!hasCJK(out)) return ''
  if (out === String(source || '').trim()) return ''
  return clip(out, 500)
}

function withTimeout(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms).unref?.()
  return controller.signal
}

async function getJson(url, { timeoutMs = 9000, headers } = {}) {
  const res = await fetch(url, { headers: headers || {}, signal: withTimeout(timeoutMs) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/**
 * The three providers. Each exposes `translate(texts, ctx)` where `texts` are
 * already-cleaned strings; it must return one translation per input, or throw.
 */
export const PROVIDERS = {
  bing: {
    name: 'bing',
    label: 'Bing',
    batchSize: 10,
    async translate(texts, ctx) {
      const token = await ctx.bingToken()
      const res = await fetch(BING_TRANSLATE_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(texts.map((text) => ({ Text: text }))),
        signal: withTimeout(12000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!Array.isArray(data) || data.length !== texts.length) throw new Error('unexpected batch response')
      return data.map((entry) => {
        const t = entry && entry.translations && entry.translations[0] && entry.translations[0].text
        return String(t || '')
      })
    },
  },

  mymemory: {
    name: 'mymemory',
    label: 'MyMemory',
    batchSize: 1,
    async translate(texts, ctx) {
      const out = []
      for (const text of texts) {
        const params = new URLSearchParams({ q: text.slice(0, MAX_CHUNK), langpair: 'en|zh-CN' })
        if (ctx.email) params.set('de', ctx.email)
        const data = await getJson(`${MYMEMORY_URL}?${params.toString()}`, { timeoutMs: 9000 })
        const status = Number(data && data.responseStatus)
        if (status && status !== 200) throw new Error(`provider status ${status}`)
        const translated = data && data.responseData && data.responseData.translatedText
        if (!translated || /MYMEMORY WARNING/i.test(translated)) throw new Error('empty translation')
        out.push(String(translated))
      }
      return out
    },
  },

  google: {
    name: 'google',
    label: 'Google',
    batchSize: 1,
    async translate(texts, ctx) {
      const out = []
      for (const text of texts) {
        const data = await getJson(`${GOOGLE_URL}${encodeURIComponent(text.slice(0, 1800))}`, { timeoutMs: 7000 })
        const joined = ((data && data[0]) || []).map((seg) => (seg && seg[0]) || '').join('')
        if (!joined) throw new Error('empty translation')
        out.push(joined)
      }
      return out
    },
  },
}

const PROVIDER_ORDER = ['bing', 'mymemory', 'google']

/**
 * Read a translation array out of whatever a chat model returned.
 *
 * Models wrap JSON in prose or fences often enough that a strict `JSON.parse`
 * would throw away good work. The parser accepts a fenced block, a bare array,
 * or a `{"translations": [...]}` envelope, and returns `null` when the shape or
 * the count is wrong so the caller can fall through to the next provider.
 */
export function parseTranslationArray(raw, count) {
  let text = String(raw || '').trim()
  if (!text) return null
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start !== -1 && end > start) text = text.slice(start, end + 1)
  let value
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (value && !Array.isArray(value) && Array.isArray(value.translations)) value = value.translations
  if (!Array.isArray(value) || value.length !== count) return null
  const out = value.map((item) => (typeof item === 'string' ? item.trim() : ''))
  return out.some(Boolean) ? out : null
}

/**
 * Translate through the Host's own model (`llm` service).
 *
 * This is the reliable path: the model is the same channel the chat UI already
 * uses, so it works on networks where every public translate endpoint is
 * filtered. One call translates a batch of descriptions as a JSON array, which
 * keeps the cost roughly at "one prompt per screen".
 */
/**
 * Pick the provider/model route for one translation call.
 *
 * The saved default selection is the normal source. When it is missing (a
 * profile without a model picker) the first provider that can enumerate models
 * is used, so "translate with the model" does not depend on one config entry.
 */
async function resolveModelRoute(service, selection) {
  const pick = typeof selection === 'function' ? selection() : selection
  const provider = pick && (pick.provider || pick.providerId)
  const model = pick && (pick.model || pick.modelId || pick.modelKey)
  if (provider && model) return { provider, model }
  if (typeof service.listProviders !== 'function') return null
  let providers = []
  try {
    providers = service.listProviders() || []
  } catch {
    return null
  }
  for (const info of providers) {
    if (!info || !info.id) continue
    try {
      const models = await service.listModels(info.id)
      if (models && models.length && models[0].id) return { provider: info.id, model: models[0].id }
    } catch { /* this provider cannot enumerate; try the next */ }
  }
  return null
}

export function createLlmProvider({ llm, selection, batchSize = 16, maxTokens = 4000 } = {}) {
  return {
    name: 'llm',
    label: '模型翻译',
    batchSize,
    async translate(texts) {
      const service = typeof llm === 'function' ? llm() : llm
      if (!service || typeof service.stream !== 'function') throw new Error('llm service unavailable')
      const pick = await resolveModelRoute(service, selection)
      if (!pick) throw new Error('no model selected')
      const system = [
        'You translate GitHub repository descriptions into Simplified Chinese.',
        'Return ONLY a JSON array of strings, one translation per input, in the same order.',
        'Keep product and project names unchanged (DeepSeek, Harness, Cordis, MCP, DSH, npm package names, file names).',
        'Do not add notes, numbering or explanation. If an input is already Chinese, return it unchanged.',
      ].join(' ')
      const stream = service.stream({
        provider: pick.provider,
        model: pick.model,
        system,
        messages: [{ role: 'user', content: [{ type: 'text', text: JSON.stringify(texts) }] }],
        temperature: 0,
        maxTokens,
        // A stalled model call must not hold the route open until the browser
        // gives up: abort one batch, then the ladder moves on.
        signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(30000)
          : undefined,
      })
      let answer = ''
      for await (const chunk of stream) {
        if (!chunk) continue
        if (chunk.type === 'text-delta' && chunk.text) answer += chunk.text
        else if (chunk.type === 'finish' && chunk.reason === 'error') throw new Error('model stopped with an error')
      }
      const parsed = parseTranslationArray(answer, texts.length)
      if (!parsed) throw new Error('model did not return a translation array')
      return parsed
    },
  }
}

/**
 * A model answers a batch as JSON, and a bad answer should not cost the whole
 * screen: the provider halves the batch once before reporting failure, so a
 * single malformed item (or a truncated reply on a reasoning model) still
 * leaves most descriptions translated.
 */
function withSplitRetry(provider) {
  const run = provider.translate.bind(provider)
  provider.translate = async function translateWithSplit(texts, ctx) {
    try {
      return await run(texts, ctx)
    } catch (error) {
      if (texts.length <= 2) throw error
      const mid = Math.ceil(texts.length / 2)
      const left = await run(texts.slice(0, mid), ctx)
      const right = await run(texts.slice(mid), ctx)
      return [...left, ...right]
    }
  }
  return provider
}

/**
 * Translate through the Host's `translator` service (native Google/Bing routes).
 *
 * It is free and needs no key, so it sits between the model and the raw HTTP
 * providers: when the native route is eligible it is the cheapest correct
 * answer. Paid routes are ignored on purpose — they need a live session id
 * that a plugin should not borrow.
 */
export function createTranslatorServiceProvider({ translator, batchSize = 4 } = {}) {
  return {
    name: 'dsh',
    label: 'DSH 翻译',
    batchSize,
    async translate(texts) {
      const service = typeof translator === 'function' ? translator() : translator
      if (!service || typeof service.translate !== 'function') throw new Error('translator service unavailable')
      const providers = typeof service.availableProviders === 'function' ? await service.availableProviders() : []
      const route = ['google', 'bing'].find((name) => providers.includes(name))
      if (!route) throw new Error('no native translation route')
      const out = []
      for (const text of texts) {
        const spec = service.resolve({ text, targetLanguage: 'zh-CN', sourceLanguage: 'en', provider: route })
        out.push(await service.translate(spec))
      }
      return out
    },
  }
}

/**
 * The ladder used inside DSH: model first (always reachable where chat works),
 * then the native translator service, then the public endpoints.
 */
export function hostProviders({ llm, selection, translator } = {}) {
  const providers = { ...PROVIDERS }
  providers.llm = withSplitRetry(createLlmProvider({ llm, selection }))
  providers.dsh = createTranslatorServiceProvider({ translator })
  return { providers, order: ['llm', 'dsh', 'bing', 'mymemory', 'google'] }
}

export class Translator {
  /**
   * @param {{cacheFile?: string, email?: string, providers?: object, order?: string[], timeoutMs?: number}} options
   */
  constructor({ cacheFile = dataFile('translate-cache.json'), email = '', providers = PROVIDERS, order = PROVIDER_ORDER } = {}) {
    this.cacheFile = cacheFile
    this.email = email
    this.providers = providers
    this.order = order.filter((name) => providers[name])
    this.cache = new Map()
    this.health = {}
    for (const name of this.order) this.health[name] = { fails: 0, benchedUntil: 0, ok: null, calls: 0, items: 0, lastError: '' }
    this.pendingSave = null
    this.bing = { token: '', expiresAt: 0 }
    this.loadCache()
  }

  loadCache() {
    const raw = readJsonSync(this.cacheFile, null)
    if (!raw || raw.version !== CACHE_VERSION || !raw.entries) return
    for (const [key, value] of Object.entries(raw.entries)) {
      if (value && typeof value.zh === 'string' && value.zh) this.cache.set(key, value)
    }
  }

  scheduleSave() {
    if (this.pendingSave) return
    this.pendingSave = setTimeout(() => {
      this.pendingSave = null
      const entries = {}
      const sorted = [...this.cache.entries()].sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, CACHE_MAX).reverse()
      for (const [key, value] of sorted) entries[key] = value
      writeJsonSync(this.cacheFile, { version: CACHE_VERSION, entries })
    }, 2500)
    this.pendingSave.unref?.()
  }

  cacheGet(text) {
    const key = shortHash(text)
    const hit = this.cache.get(key)
    return hit ? { key, ...hit } : null
  }

  cacheSet(text, zh, provider) {
    if (!zh) return
    const key = shortHash(text)
    this.cache.set(key, { zh, p: provider, at: Date.now() })
    this.scheduleSave()
  }

  async bingToken() {
    if (this.bing.token && Date.now() < this.bing.expiresAt) return this.bing.token
    const res = await fetch(BING_AUTH_URL, { signal: withTimeout(8000) })
    if (!res.ok) throw new Error(`auth HTTP ${res.status}`)
    const token = (await res.text()).trim()
    if (!token || token.length < 100) throw new Error('auth token missing')
    this.bing = { token, expiresAt: Date.now() + 6 * 60 * 1000 }
    return token
  }

  healthSnapshot() {
    const out = {}
    for (const [name, state] of Object.entries(this.health)) {
      out[name] = {
        ok: state.ok,
        itemCount: state.items,
        benched: Date.now() < state.benchedUntil,
        lastError: state.lastError || '',
      }
    }
    return out
  }

  isAvailable(name) {
    const state = this.health[name]
    return Boolean(state) && Date.now() >= state.benchedUntil
  }

  noteSuccess(name) {
    const state = this.health[name]
    if (!state) return
    state.fails = 0
    state.ok = true
    state.lastError = ''
  }

  noteFailure(name, error) {
    const state = this.health[name]
    if (!state) return
    state.ok = false
    state.fails += 1
    state.lastError = clip(String((error && error.message) || error), 120)
    if (state.fails >= FAILS_BEFORE_BENCH) {
      state.benchedUntil = Date.now() + BENCH_MS
      state.fails = 0
    }
  }

  /**
   * Translate descriptions. Returns entries for everything that succeeded in
   * this call (cache hits included) and the list that is still missing.
   *
   * @param {string[]} texts
   * @param {{deadlineMs?: number, force?: boolean, email?: string}} options
   */
  async translate(texts, { deadlineMs = 22000, force = false, email } = {}) {
    const deadline = Date.now() + deadlineMs
    const ctx = { email: email || this.email, bingToken: () => this.bingToken() }
    const unique = []
    const cleanOf = new Map()
    for (const text of texts || []) {
      const clean = clip(cleanText(text), 1200)
      if (!clean || clean.length < 4 || hasCJK(clean)) continue
      if (cleanOf.has(clean)) continue
      cleanOf.set(clean, clean)
      unique.push(clean)
    }

    const result = new Map()
    const missing = []
    for (const text of unique) {
      const hit = force ? null : this.cacheGet(text)
      if (hit) {
        result.set(text, { zh: hit.zh, provider: hit.p, cached: true })
        continue
      }
      missing.push(text)
    }

    let leftover = [...missing]
    for (const name of this.order) {
      if (!leftover.length || Date.now() >= deadline) break
      if (!this.isAvailable(name)) continue
      const provider = this.providers[name]
      leftover = await this.runProvider(name, provider, leftover, ctx, { deadline, result })
    }

    for (const name of Object.keys(this.health)) {
      this.health[name].items = [...result.values()].filter((entry) => entry.provider === name).length
    }

    return {
      // Keyed by the source text the caller sent: the panel looks translations
      // up by description, not by hash, so the contract must stay human.
      entries: Object.fromEntries([...result.entries()]),
      missing,
      stillMissing: leftover,
      providers: this.healthSnapshot(),
      cached: [...result.values()].filter((value) => value.cached).length,
    }
  }

  /** One provider pass over the still-missing texts, respecting batch size. */
  async runProvider(name, provider, texts, ctx, { deadline, result }) {
    const still = []
    for (let index = 0; index < texts.length; index += provider.batchSize) {
      if (Date.now() >= deadline) {
        still.push(...texts.slice(index))
        break
      }
      const batch = texts.slice(index, index + provider.batchSize)
      // MyMemory/Google are one request per string: pace them a little so a
      // 100-item run does not look like an attack.
      if (provider.batchSize === 1 && index > 0) await sleep(120)
      let translated
      try {
        translated = await provider.translate(batch, ctx)
        if (!Array.isArray(translated) || translated.length !== batch.length) throw new Error('provider returned the wrong number of translations')
      } catch (error) {
        this.noteFailure(name, error)
        still.push(...batch, ...texts.slice(index + provider.batchSize))
        break
      }
      let accepted = 0
      batch.forEach((source, i) => {
        const zh = polishTranslation(translated[i], source)
        if (!zh) return
        accepted += 1
        result.set(source, { zh, provider: name, cached: false })
        this.cacheSet(source, zh, name)
      })
      if (!accepted) {
        // A provider that answers with the source text (or with something
        // that is not Chinese) is not working for this domain. Hand the rest
        // to the next provider, and bench this one if it keeps doing that.
        this.noteFailure(name, new Error('no usable translation'))
        still.push(...batch, ...texts.slice(index + provider.batchSize))
        break
      }
      this.noteSuccess(name)
      if (accepted < batch.length) still.push(...batch.filter((source) => !result.has(source)))
    }
    return still
  }
}

/** Seed the cache from a compiled list (used by tests and by importers). */
export function primeTranslations(translator, pairs) {
  for (const [source, zh] of Object.entries(pairs || {})) {
    if (source && zh) translator.cacheSet(source, zh, 'seed')
  }
}

export const __test__ = { chunkText, polishTranslation, PROVIDER_ORDER }
