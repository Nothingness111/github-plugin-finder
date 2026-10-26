/**
 * Local HTTP endpoints that back the Discover panel.
 *
 * The panel could talk to GitHub directly, but a browser cannot: CORS blocks
 * translation providers, localStorage is too small for a useful cache, and a
 * page reload throws away everything the search learned. These routes run in
 * the DSH host process, so the same origin the GUI is served from can run a
 * persistent index, a real request budget and a multi-provider translator.
 *
 * The panel treats them as optional: if the routes are missing (old install,
 * host not reloaded), it falls back to direct browser calls.
 */

import { runSearch } from './search.mjs'
import { Translator } from './translate.mjs'
import { getStore } from './store.mjs'
import { rateSnapshot } from './github.mjs'
import { scanMany } from './security.mjs'

const MAX_BODY_BYTES = 512 * 1024
const MAX_TRANSLATE_ITEMS = 300
const MAX_TEXT_LENGTH = 1600

export const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

export function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { ...JSON_HEADERS, 'Content-Length': String(Buffer.byteLength(body)) })
  res.end(body)
}

/** Collect a small JSON request body. Rejects oversized payloads. */
export function readJsonBody(req, { limit = MAX_BODY_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      reject(error)
    }
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > limit) {
        fail(new Error('request body too large'))
        try { req.destroy() } catch { /* already gone */ }
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) return resolve({})
      try { resolve(JSON.parse(raw)) } catch { reject(new Error('body is not valid JSON')) }
    })
    req.on('error', fail)
    req.on('aborted', () => fail(new Error('request aborted')))
  })
}

function sanitizeTexts(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value.slice(0, MAX_TRANSLATE_ITEMS)) {
    const text = typeof item === 'string' ? item : (item && typeof item.text === 'string' ? item.text : '')
    if (text && text.length >= 4) out.push(text.slice(0, MAX_TEXT_LENGTH))
  }
  return out
}

/**
 * Build the route table. `deps.translator` is injectable so the offline tests
 * can run without touching the network; `deps.providers`/`order` install the
 * Host-native ladder (model first, then the DSH translator service).
 */
export function createHandlers({ translator, providers, order } = {}) {
  const translatorRef = () => translator || (translator = providers ? new Translator({ providers, order }) : new Translator())

  return {
    '/github-plugin-finder/health': async (req, res) => {
      const store = getStore()
      const health = translatorRef().healthSnapshot()
      jsonResponse(res, 200, {
        ok: true,
        host: true,
        version: 4,
        index: store.stats(),
        rate: rateSnapshot(),
        translate: health,
        translateOrder: translatorRef().order,
      })
    },

    '/github-plugin-finder/search': async (req, res) => {
      let body
      try {
        body = await readJsonBody(req)
      } catch (error) {
        jsonResponse(res, 400, { ok: false, error: String((error && error.message) || error) })
        return
      }
      try {
        const payload = await runSearch({
          query: typeof body.query === 'string' ? body.query : '',
          mode: typeof body.mode === 'string' ? body.mode : 'auto',
          depth: Number(body.depth) || 1,
          token: typeof body.token === 'string' ? body.token : '',
          seed: body.seed !== false,
          sort: typeof body.sort === 'string' ? body.sort : 'relevance',
          limit: Number(body.limit) || undefined,
        })
        jsonResponse(res, 200, payload)
      } catch (error) {
        jsonResponse(res, 500, {
          ok: false,
          error: String((error && error.message) || error).slice(0, 300),
          stack: process.env.GH_PLUGIN_FINDER_DEBUG ? String(error && error.stack) : undefined,
        })
      }
    },

    '/github-plugin-finder/translate': async (req, res) => {
      let body
      try {
        body = await readJsonBody(req)
      } catch (error) {
        jsonResponse(res, 400, { ok: false, error: String((error && error.message) || error) })
        return
      }
      const texts = sanitizeTexts(body.texts)
      try {
        const result = await translatorRef().translate(texts, {
          force: Boolean(body.force),
          email: typeof body.email === 'string' ? body.email.slice(0, 120) : '',
          deadlineMs: Math.min(60000, Math.max(4000, Number(body.deadlineMs) || 45000)),
        })
        jsonResponse(res, 200, { ok: true, ...result })
      } catch (error) {
        // Translation is optional: report, never fail the panel.
        jsonResponse(res, 200, {
          ok: false,
          error: String((error && error.message) || error).slice(0, 200),
          entries: {},
          missing: texts,
          providers: translatorRef().healthSnapshot(),
        })
      }
    },

    '/github-plugin-finder/refresh': async (req, res) => {
      let body = {}
      try { body = await readJsonBody(req) } catch { body = {} }
      const store = getStore()
      try {
        if (body.scope === 'translations') {
          translatorRef().cache = new Map()
          translatorRef().scheduleSave()
        }
        const seed = await store.ensureSeed({ token: typeof body.token === 'string' ? body.token : '', force: true })
        jsonResponse(res, 200, { ok: true, index: store.stats(), catalog: seed })
      } catch (error) {
        jsonResponse(res, 200, { ok: false, error: String((error && error.message) || error).slice(0, 200) })
      }
    },

    /**
     * Repositories whose star count grew fastest inside the window (default one
     * week, threshold 50). Growth comes from the local index's own snapshots,
     * so the panel is honest about rows it cannot measure yet (`estimated`).
     */
    '/github-plugin-finder/hot': async (req, res) => {
      let body = {}
      try { body = await readJsonBody(req) } catch { body = {} }
      try {
        const store = getStore()
        const payload = store.hotThisWeek({
          minGrowth: Number(body.minGrowth) || 50,
          windowDays: Number(body.windowDays) || 7,
          limit: Math.min(300, Math.max(1, Number(body.limit) || 200)),
        })
        jsonResponse(res, 200, { ok: true, ...payload, index: store.stats() })
      } catch (error) {
        jsonResponse(res, 500, { ok: false, error: String((error && error.message) || error).slice(0, 300) })
      }
    },

    /**
     * Heuristic privacy scan for a batch of repositories. The panel calls this
     * for the cards it is about to render; verdicts are cached for a week.
     */
    '/github-plugin-finder/scan': async (req, res) => {
      let body = {}
      try { body = await readJsonBody(req) } catch { body = {} }
      const repos = Array.isArray(body.repos) ? body.repos.slice(0, 20) : []
      try {
        const { results, scanned, aborted } = await scanMany(repos, {
          force: Boolean(body.force),
          token: typeof body.token === 'string' ? body.token : '',
        })
        jsonResponse(res, 200, { ok: true, scanned, results, aborted })
      } catch (error) {
        jsonResponse(res, 500, { ok: false, error: String((error && error.message) || error).slice(0, 300) })
      }
    },
  }
}

export const ROUTE_PATHS = [
  '/github-plugin-finder/health',
  '/github-plugin-finder/search',
  '/github-plugin-finder/translate',
  '/github-plugin-finder/refresh',
  '/github-plugin-finder/hot',
  '/github-plugin-finder/scan',
]
