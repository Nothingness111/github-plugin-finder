/**
 * github-plugin-finder — host half.
 *
 * The panel (client.js) is the visible part; this module gives it a local
 * engine: a persistent index, budgeted GitHub discovery and a cached,
 * multi-provider translator. Routes are registered on the DSH web server, so
 * the panel talks to `/github-plugin-finder/*` on its own origin and never
 * needs CORS, a browser-side cache or a different network path.
 *
 * If the web server service is absent (CLI profile) this stays inert; the
 * panel's direct-mode fallback keeps working.
 */

import { createHandlers, ROUTE_PATHS } from './lib/routes.mjs'
import { hostProviders } from './lib/translate.mjs'

export const name = 'github-plugin-finder'

export function apply(root) {
  root.inject(['webServer'], (ctx) => {
    // Host services are resolved lazily: `llm`, `translator` and
    // `agentDefaultModel` are optional, and a profile without them must still
    // serve search (translation then falls back to the public endpoints).
    const service = (name) => {
      try {
        return typeof ctx.get === 'function' ? ctx.get(name) : undefined
      } catch {
        return undefined
      }
    }
    const { providers, order } = hostProviders({
      llm: () => service('llm'),
      translator: () => service('translator'),
      selection: () => {
        try {
          const models = service('agentDefaultModel')
          const selection = models && models.currentSelection()
          return selection && selection.provider && selection.model ? selection : null
        } catch {
          return null
        }
      },
    })
    const handlers = createHandlers({ providers, order })
    const disposers = []
    for (const path of ROUTE_PATHS) {
      try {
        disposers.push(ctx.webServer.register({
          kind: 'exact',
          path,
          handler: async (req, res) => {
            // One entry point for every route: cap methods so a stray crawler
            // cannot spend the GitHub quota or the translation cache.
            if (req.method && req.method !== 'POST' && req.method !== 'GET') {
              res.writeHead(405, { Allow: 'GET, POST' })
              res.end('method not allowed')
              return
            }
            await handlers[path](req, res)
          },
        }))
      } catch (error) {
        try { console.warn(`[github-plugin-finder] route ${path} not registered: ${(error && error.message) || error}`) } catch { /* no console */ }
      }
    }
    ctx.effect(() => () => {
      for (const dispose of disposers) {
        try { dispose() } catch { /* already disposed */ }
      }
    }, 'github-plugin-finder-routes')
  })
}
