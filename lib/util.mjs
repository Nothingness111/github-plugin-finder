/**
 * Small shared helpers: paths, JSON persistence, hashing, text normalisation
 * and a fetch wrapper with a hard timeout.
 *
 * Nothing in here talks to the UI directly, so every module below can be
 * exercised by the offline test suite without a browser or a live network.
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import dns from 'node:dns'

// Some providers publish AAAA records while this machine has no working IPv6.
// curl silently falls back, Node does not - force IPv4 first (same fix the
// whale-widget plugin needed for open.bigmodel.cn).
try { dns.setDefaultResultOrder('ipv4first') } catch { /* older runtime */ }

export const APP_DIR_NAME = 'github-plugin-finder'

/** `$DSH_HOME` is where every other DSH plugin keeps its state. */
export function dshHome() {
  const fromEnv = process.env.DSH_HOME
  if (fromEnv && fromEnv.trim()) return fromEnv.trim()
  return path.join(os.homedir(), '.dsh')
}

/** State directory; tests override it through `GH_PLUGIN_FINDER_DATA`. */
export function dataDir() {
  const override = process.env.GH_PLUGIN_FINDER_DATA
  return override && override.trim() ? override.trim() : path.join(dshHome(), APP_DIR_NAME)
}

export function dataFile(name) {
  return path.join(dataDir(), name)
}

export function ensureDataDir() {
  try { fs.mkdirSync(dataDir(), { recursive: true }) } catch { /* read-only home: callers stay memory-only */ }
}

export function readJsonSync(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const value = JSON.parse(raw)
    return value == null ? fallback : value
  } catch {
    return fallback
  }
}

export async function readJson(file, fallback) {
  try {
    const raw = await fsp.readFile(file, 'utf8')
    const value = JSON.parse(raw)
    return value == null ? fallback : value
  } catch {
    return fallback
  }
}

/**
 * Write via a sibling temp file + rename: a crash mid-write must never leave a
 * truncated cache that the next boot would treat as authoritative.
 */
export function writeJsonSync(file, value) {
  try {
    ensureDataDir()
    const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(value), 'utf8')
    fs.renameSync(tmp, file)
    return true
  } catch {
    return false
  }
}

export function sha1(text) {
  return createHash('sha1').update(String(text)).digest('hex')
}

export function shortHash(text) {
  return sha1(text).slice(0, 20)
}

export const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/

export function hasCJK(text) {
  return CJK_RE.test(String(text || ''))
}

export function clip(text, max) {
  const s = String(text == null ? '' : text)
  return s.length > max ? `${s.slice(0, Math.max(0, max - 1))}…` : s
}

/** Collapse whitespace/HTML noise; machine translators do better on clean text. */
export function cleanText(text) {
  return String(text == null ? '' : text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}

export class HttpError extends Error {
  constructor(message, { status, url, body, retryAfterMs, kind } = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.url = url
    this.body = body
    this.retryAfterMs = retryAfterMs
    this.kind = kind || 'http'
  }
}

const DEFAULT_UA = 'dsh-github-plugin-finder/2.0 (+https://github.com/Nothingness111/github-plugin-finder)'

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms).unref?.()
  return controller.signal
}

/**
 * fetch + timeout + bounded body read. Returns `{ status, headers, text }`
 * instead of a Response so callers never forget to release the body.
 */
export async function request(url, { method = 'GET', headers, body, timeoutMs = 12000 } = {}) {
  let res
  try {
    res = await fetch(url, {
      method,
      headers: { 'User-Agent': DEFAULT_UA, ...(headers || {}) },
      body,
      signal: timeoutSignal(timeoutMs),
      redirect: 'follow',
    })
  } catch (error) {
    const aborted = error && (error.name === 'AbortError' || error.name === 'TimeoutError')
    throw new HttpError(
      aborted ? `timeout after ${timeoutMs}ms` : `network error: ${(error && error.message) || error}`,
      { url, kind: aborted ? 'timeout' : 'network' },
    )
  }
  let text = ''
  try { text = await res.text() } catch { text = '' }
  if (!res.ok) {
    const retryAfter = Number(res.headers.get('retry-after') || 0)
    throw new HttpError(`HTTP ${res.status} ${res.statusText || ''}`.trim(), {
      status: res.status,
      url,
      body: clip(text, 400),
      retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
    })
  }
  const headersObj = {}
  try { res.headers.forEach((value, key) => { headersObj[key.toLowerCase()] = value }) } catch { /* ignore */ }
  return { status: res.status, headers: headersObj, text }
}

export async function requestJson(url, options) {
  const { text } = await request(url, options)
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError('response was not JSON', { url, kind: 'parse', body: clip(text, 200) })
  }
}

/** Convert a GitHub Contents API payload into its raw text. */
export function decodeContentsPayload(payload) {
  if (!payload || typeof payload !== 'object') return ''
  if (typeof payload.content === 'string' && payload.encoding === 'base64') {
    try { return Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf8') } catch { return '' }
  }
  if (typeof payload.download_url === 'string') return ''
  return ''
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '?'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
