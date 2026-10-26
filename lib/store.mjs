/**
 * On-disk memory for the finder.
 *
 * Two kinds of state, both under `$DSH_HOME/github-plugin-finder/`:
 *
 *   index.json    every repository this plugin has ever seen, with the fields
 *                 needed to render a card. Searches merge live results into it,
 *                 so the "everything" view gets more complete with every run
 *                 instead of forgetting yesterday's finds.
 *   seed.json     names collected from a public community catalog, used as a
 *                 coverage floor for repositories GitHub's keyword search does
 *                 not surface. Names only; metadata is filled in the first time
 *                 a live channel touches the same repository.
 *
 * Both files are caches: a corrupt or missing file degrades coverage, never
 * correctness.
 */

import fs from 'node:fs'
import { decodeContentsPayload, formatBytes, readJsonSync, shortHash, writeJsonSync, dataFile, clip } from './util.mjs'

const INDEX_VERSION = 2
const MAX_RECORDS = 8000
const SAVE_DEBOUNCE_MS = 1200
const HISTORY_TTL_MS = 120 * 24 * 60 * 60 * 1000
const HISTORY_MAX_POINTS = 90
const HISTORY_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const SECURITY_TTL_MS = 7 * 24 * 60 * 60 * 1000

const SEED_REPO = 'leenkcool/Blue-Whale-Harness'
const SEED_PATH = 'repos.txt'
const SEED_TTL_MS = 24 * 60 * 60 * 1000
const SEED_MAX = 6000

function toRecord(card) {
  return {
    n: card.full_name,
    d: clip(card.desc || '', 400),
    s: Number(card.stars) || 0,
    u: card.updated || null,
    c: card.created || null,
    t: Array.isArray(card.topics) ? card.topics.slice(0, 12) : [],
    l: card.language || '',
    a: card.archived ? 1 : 0,
    f: card.fork ? 1 : 0,
    src: Array.isArray(card.sources) ? card.sources.slice(0, 6) : [],
    at: Date.now(),
  }
}

function toCard(record) {
  return {
    full_name: record.n,
    url: String(record.n || '').startsWith('npm:')
      ? `https://www.npmjs.com/package/${String(record.n).slice(4)}`
      : `https://github.com/${record.n}`,
    desc: record.d || '',
    stars: Number(record.s) || 0,
    updated: record.u || null,
    created: record.c || null,
    topics: Array.isArray(record.t) ? record.t : [],
    language: record.l || '',
    archived: Boolean(record.a),
    fork: Boolean(record.f),
    sources: Array.isArray(record.src) ? record.src : [],
    score: 0,
    seedOnly: false,
  }
}

/** Trim a star history to the points worth keeping (recent, bounded). */
function trimHistory(points, now = Date.now()) {
  return points
    .filter((point) => point && Number.isFinite(point.t) && Number.isFinite(point.s))
    .filter((point) => now - point.t <= HISTORY_TTL_MS)
    .sort((a, b) => a.t - b.t)
    .slice(-HISTORY_MAX_POINTS)
}

/**
 * Star growth over a rolling window (default: one week).
 *
 * The index learned this repository's star count at the times in `sh`. Growth
 * is `current - baseline`, where the baseline is the newest snapshot at least
 * `windowMs` old. A repository whose history is younger than the window (or
 * was created inside it) gets `estimated: true`; callers must label that.
 *
 * @returns {{delta:number, since:number|null, samples:number, estimated:boolean, windowMs:number}|null}
 */
export function growth7d(record, now = Date.now(), windowMs = WEEK_MS) {
  if (!record) return null
  const points = trimHistory(Array.isArray(record.sh) ? record.sh : [], now)
  const current = Number(record.s) || 0
  const cutoff = now - windowMs
  let baseline = null
  let since = null
  let windowComplete = false
  for (const point of points) {
    if (point.t <= cutoff) { baseline = point.s; since = point.t; windowComplete = true }
  }
  if (baseline === null) {
    if (points.length) { baseline = points[0].s; since = points[0].t }
    else {
      const created = record.c ? Date.parse(record.c) : NaN
      if (!(created >= cutoff)) return null
      baseline = 0
      since = created
    }
  }
  return {
    delta: Math.max(-current, current - baseline),
    since,
    samples: points.length,
    estimated: !windowComplete,
    windowMs,
  }
}

export class Store {  constructor() {
    this.indexFile = dataFile('index.json')
    this.seedFile = dataFile('seed.json')
    this.records = new Map()
    this.updatedAt = 0
    this.dirty = false
    this.timer = null
    this.seed = { names: [], fetchedAt: 0, source: SEED_REPO }
    this.load()
  }

  load() {
    const raw = readJsonSync(this.indexFile, null)
    if (raw && raw.version === INDEX_VERSION && raw.repos && typeof raw.repos === 'object') {
      for (const [name, record] of Object.entries(raw.repos)) {
        if (record && record.n) this.records.set(name, record)
      }
      this.updatedAt = Number(raw.updatedAt) || 0
    }
    const seed = readJsonSync(this.seedFile, null)
    if (seed && Array.isArray(seed.names)) {
      this.seed = {
        names: seed.names.filter((n) => typeof n === 'string' && n.includes('/')).slice(0, SEED_MAX),
        fetchedAt: Number(seed.fetchedAt) || 0,
        source: seed.source || SEED_REPO,
      }
    }
  }

  stats() {
    let bytes = 0
    for (const file of [this.indexFile, this.seedFile]) {
      try { bytes += fs.statSync(file).size } catch { /* not written yet */ }
    }
    return {
      size: this.records.size,
      updatedAt: this.updatedAt || null,
      bytes,
      bytesLabel: formatBytes(bytes),
      seed: {
        count: this.seed.names.length,
        fetchedAt: this.seed.fetchedAt || null,
        stale: Boolean(this.seed.fetchedAt && Date.now() - this.seed.fetchedAt > SEED_TTL_MS),
        source: this.seed.source,
      },
    }
  }

  all() {
    return [...this.records.values()].map(toCard)
  }

  lookup(fullName) {
    return this.records.get(fullName) || null
  }

  /** Weekly star growth for one repository, or null when it never appeared. */
  growthOf(fullName) {
    return growth7d(this.records.get(fullName))
  }

  /**
   * Repositories whose star count grew by at least `minGrowth` inside the
   * window, newest observation first. `estimated` rows lack a full-window
   * baseline (fresh index, or the repository is younger than the window).
   */
  hotThisWeek({ minGrowth = 50, windowDays = 7, limit = 200 } = {}) {
    const windowMs = Math.max(1, Number(windowDays) || 7) * 24 * 60 * 60 * 1000
    const threshold = Number(minGrowth) || 0
    const now = Date.now()
    const items = []
    for (const [name, record] of this.records) {
      const growth = growth7d(record, now, windowMs)
      if (!growth || growth.delta < threshold) continue
      const card = toCard(record)
      card.growth = growth
      items.push({ name, card })
    }
    items.sort((a, b) => b.card.growth.delta - a.card.growth.delta || String(a.name).localeCompare(String(b.name)))
    return {
      minGrowth: threshold,
      windowDays,
      cutoff: now - windowMs,
      scanned: this.records.size,
      items: items.slice(0, limit).map((entry) => entry.card),
    }
  }

  /** Cache a security verdict on the record (used by the scan route). */
  setSecurity(fullName, verdict) {
    const record = this.records.get(fullName)
    if (!record) return false
    record.sec = verdict && verdict.level ? verdict : undefined
    if (!record.sec) delete record.sec
    this.markDirty()
    return true
  }

  securityOf(fullName) {
    const record = this.records.get(fullName)
    if (!record || !record.sec) return null
    if (Date.now() - (record.sec.at || 0) > SECURITY_TTL_MS) return null
    return record.sec
  }

  /** Merge fresh cards into the index; returns how many were new. */
  upsert(cards) {
    let added = 0
    const now = Date.now()
    for (const card of cards || []) {
      if (!card || !card.full_name) continue
      const existing = this.records.get(card.full_name)
      if (!existing) added += 1
      const merged = { ...(existing || {}), ...toRecord(card) }
      merged.at = now
      const history = trimHistory(Array.isArray(existing && existing.sh) ? existing.sh.slice() : [], now)
      const last = history[history.length - 1]
      if (!last || last.s !== merged.s || now - last.t >= HISTORY_MIN_INTERVAL_MS) history.push({ t: now, s: merged.s })
      merged.sh = trimHistory(history, now)
      this.records.set(card.full_name, merged)
    }
    if (cards && cards.length) this.markDirty()
    if (this.records.size > MAX_RECORDS) this.prune()
    return added
  }

  prune() {
    const sorted = [...this.records.entries()].sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, MAX_RECORDS)
    this.records = new Map(sorted)
  }

  markDirty() {
    this.dirty = true
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush()
    }, SAVE_DEBOUNCE_MS)
    this.timer.unref?.()
  }

  flush() {
    if (!this.dirty) return true
    const repos = {}
    for (const [name, record] of this.records) repos[name] = record
    this.updatedAt = Date.now()
    const ok = writeJsonSync(this.indexFile, { version: INDEX_VERSION, updatedAt: this.updatedAt, repos })
    if (ok) this.dirty = false
    return ok
  }

  /** Seed names, refreshed at most once a day. Never throws. */
  async ensureSeed({ token, force = false, enabled = true, timeoutMs = 15000 } = {}) {
    if (!enabled) return { ...this.stats().seed, disabled: true }
    const fresh = this.seed.fetchedAt && Date.now() - this.seed.fetchedAt < SEED_TTL_MS
    if (!force && fresh && this.seed.names.length) return this.stats().seed
    if (this.pendingSeed) return this.pendingSeed

    this.pendingSeed = (async () => {
      try {
        const url = `https://api.github.com/repos/${SEED_REPO}/contents/${SEED_PATH}?ref=main`
        const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
        if (token) headers.Authorization = `Bearer ${token}`
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const payload = await res.json()
        const text = decodeContentsPayload(payload)
        if (!text) throw new Error('catalog payload was empty (file may exceed the contents API limit)')
        const names = [...new Set(text.split('\n').map((line) => line.trim()).filter((line) => /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9._-]+$/.test(line)))]
          .slice(0, SEED_MAX)
        if (!names.length) throw new Error('catalog contained no repository names')
        this.seed = { names, fetchedAt: Date.now(), source: SEED_REPO }
        writeJsonSync(this.seedFile, this.seed)
        return this.stats().seed
      } catch (error) {
        const seed = this.stats().seed
        return { ...seed, stale: true, error: String((error && error.message) || error) }
      } finally {
        this.pendingSeed = null
      }
    })()
    return this.pendingSeed
  }

  /** Seed names that look relevant to `intent`, as metadata-free cards. */
  seedCards(intent, limit = 60) {
    const wanted = [
      ...(intent.terms || []),
      ...(intent.exact && intent.exact.name ? [intent.exact.name] : []),
    ].map((t) => String(t).toLowerCase()).filter(Boolean)
    if (!wanted.length && !intent.owner) return []
    const out = []
    for (const name of this.seed.names) {
      const lower = name.toLowerCase()
      if (intent.owner && !lower.startsWith(`${String(intent.owner).toLowerCase()}/`)) continue
      if (wanted.length && !wanted.some((term) => lower.includes(term))) continue
      out.push({
        full_name: name,
        url: `https://github.com/${name}`,
        desc: '',
        stars: 0,
        updated: null,
        created: null,
        topics: [],
        language: '',
        archived: false,
        fork: false,
        sources: ['catalog'],
        score: 0,
        seedOnly: true,
      })
      if (out.length >= limit) break
    }
    return out
  }
}

let singleton = null

/** One store per process: the host route and the tool share the index. */
export function getStore() {
  if (!singleton) singleton = new Store()
  return singleton
}

export function resetStoreForTests() {
  singleton = null
  // A new singleton would otherwise re-read whatever the previous test wrote,
  // which makes ordering assertions depend on test order.
  try {
    fs.rmSync(dataFile('index.json'), { force: true })
  } catch { /* nothing to remove */ }
}

export const __test__ = { toRecord, toCard, shortHash, MAX_RECORDS }
