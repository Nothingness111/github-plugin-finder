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
import { createHash, randomBytes, X509Certificate } from 'node:crypto'
import dns from 'node:dns'
import * as tls from 'node:tls'
import https from 'node:https'
import http from 'node:http'

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
  constructor(message, { status, url, body, retryAfterMs, kind, cause } = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.url = url
    this.body = body
    this.retryAfterMs = retryAfterMs
    this.kind = kind || 'http'
    this.cause = cause
  }
}

const DEFAULT_UA = 'dsh-github-plugin-finder/2.2 (+https://github.com/Nothingness111/github-plugin-finder)'

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms).unref?.()
  return controller.signal
}

/**
 * TLS errors a local interception proxy (Steam++, Clash, corporate TLS
 * inspection) produces: the presented chain cannot be verified with the
 * bundled CA store. These are the only failures the trust fallback retries.
 */
const CERT_FAILURE = /UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_GET_ISSUER_CERT|CERT_HAS_EXPIRED|CERT_NOT_YET_VALID|ERR_TLS_CERT|certificate|unable to verify/i

/** Readable error chain: `fetch failed | UNABLE_TO_VERIFY_LEAF_SIGNATURE`. */
export function errorText(error) {
  const parts = []
  const push = (value) => { if (value && !parts.includes(String(value))) parts.push(String(value)) }
  if (error && error.message) push(error.message)
  if (error && error.code) push(error.code)
  const cause = error && error.cause
  if (cause) {
    if (cause.message) push(cause.message)
    if (cause.code) push(cause.code)
  }
  return parts.join(' | ')
}

export function isCertificateFailure(error) {
  return CERT_FAILURE.test(errorText(error))
}

/** Parse every X.509 certificate in a PEM blob; invalid blocks are dropped. */
export function parseCertificates(text) {
  const out = []
  const seen = new Set()
  const re = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g
  for (const match of String(text || '').matchAll(re)) {
    const pem = match[0].trim()
    if (seen.has(pem)) continue
    seen.add(pem)
    try { new X509Certificate(pem); out.push(pem) } catch { /* not a usable certificate */ }
  }
  return out
}

/**
 * PEM files this plugin may trust when the OS store cannot be used:
 *
 *  - `GH_PLUGIN_FINDER_CA_FILE` (explicit override)
 *  - `NODE_EXTRA_CA_CERTS` (standard variable; Electron refuses non-ASCII
 *    paths, but reading the file here still works)
 *  - `<data dir>/extra-ca.pem` (drop a local interception root there)
 *  - the PEM dsh-plugin-radar extracted from Steam++ on this machine
 */
export function caFileCandidates() {
  return [
    process.env.GH_PLUGIN_FINDER_CA_FILE,
    process.env.NODE_EXTRA_CA_CERTS,
    dataFile('extra-ca.pem'),
    path.join(dshHome(), 'plugin-radar', 'steamtools-root-ca.pem'),
    path.join(dshHome(), 'plugin-radar', 'extra-ca.pem'),
  ].filter((file) => typeof file === 'string' && file.trim()).map((file) => path.resolve(file.trim()))
}

let caFileCache = { at: 0, certificates: [], files: [] }

/** Certificates found in the local PEM files (cached for a minute). */
export function localExtraCertificates() {
  if (Date.now() - caFileCache.at < 60_000) return caFileCache.certificates
  const certificates = []
  const files = []
  for (const file of caFileCandidates()) {
    try {
      const parsed = parseCertificates(fs.readFileSync(file, 'utf8'))
      if (!parsed.length) continue
      files.push(file)
      for (const pem of parsed) if (!certificates.includes(pem)) certificates.push(pem)
    } catch { /* missing or unreadable: keep looking */ }
  }
  caFileCache = { at: Date.now(), certificates, files }
  return certificates
}

/** Hosts whose live chain we already learned (trust on first use). */
const TOFU = new Map()
const TOFU_TTL_MS = 12 * 60 * 60 * 1000

export function resetTrustCacheForTests() {
  caFileCache = { at: 0, certificates: [], files: [] }
  TOFU.clear()
}

/** Connect once without verification and keep the presented chain. */
export async function capturePeerCertificates(host, port = 443, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let done = false
    const finish = (certificates) => {
      if (done) return
      done = true
      try { socket.destroy() } catch { /* already closed */ }
      resolve(certificates)
    }
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: timeoutMs })
    socket.setTimeout(timeoutMs, () => finish([]))
    socket.once('error', () => finish([]))
    socket.once('secureConnect', () => {
      const certificates = []
      try {
        const seen = new Set()
        let cert = socket.getPeerCertificate(true)
        while (cert && cert.raw && cert.fingerprint256 && !seen.has(cert.fingerprint256)) {
          seen.add(cert.fingerprint256)
          try { certificates.push(new X509Certificate(cert.raw).toString()) } catch { /* skip odd node */ }
          if (!cert.issuerCertificate || cert.issuerCertificate === cert) break
          cert = cert.issuerCertificate
        }
      } catch { /* keep what we have */ }
      finish(certificates)
    })
  })
}

function flattenHeaders(headers) {
  const out = {}
  for (const [key, value] of Object.entries(headers || {})) {
    if (value === undefined) continue
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value)
  }
  return out
}

/** Minimal node:http(s) request used only by the trust fallback. */
function nodeRequest(urlObj, { method = 'GET', headers = {}, body, timeoutMs = 12000, ca, maxBytes = 4 * 1024 * 1024 }) {
  return new Promise((resolve, reject) => {
    const lib = urlObj.protocol === 'http:' ? http : https
    const options = { method, headers, timeout: timeoutMs }
    if (urlObj.protocol === 'https:') {
      options.ca = ca
      options.servername = urlObj.hostname
    }
    let settled = false
    const fail = (error) => { if (!settled) { settled = true; reject(error) } }
    const req = lib.request(urlObj, options, (res) => {
      const chunks = []
      let size = 0
      res.on('data', (chunk) => {
        size += chunk.length
        if (size > maxBytes) { fail(new Error(`response body exceeded ${maxBytes} bytes`)); try { req.destroy() } catch { /* gone */ } return }
        chunks.push(chunk)
      })
      res.on('end', () => {
        if (settled) return
        settled = true
        resolve({ status: res.statusCode || 0, statusText: res.statusMessage || '', headers: flattenHeaders(res.headers), text: Buffer.concat(chunks).toString('utf8') })
      })
      res.on('error', fail)
    })
    req.on('error', fail)
    req.setTimeout(timeoutMs, () => fail(new Error(`timeout after ${timeoutMs}ms`)))
    if (body !== undefined && body !== null) {
      try { req.write(body) } catch (error) { fail(error) }
    }
    req.end()
  })
}

/**
 * Retry a request with an explicit CA list: local PEM files first, then the
 * certificate chain the server actually presents. This is a deliberate last
 * resort for local TLS interception; the normal fetch path stays strict.
 */
export async function requestWithTrustFallback(url, options = {}) {
  const { method = 'GET', headers, body, timeoutMs = 12000, maxRedirects = 4 } = options
  let target = new URL(url)
  const files = localExtraCertificates()
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const known = TOFU.get(target.hostname)
    const extra = known && Date.now() - known.at < TOFU_TTL_MS ? known.certificates : []
    let response
    try {
      response = await nodeRequest(target, { method, headers, body, timeoutMs, ca: [...tls.rootCertificates, ...files, ...extra] })
    } catch (error) {
      if (target.protocol !== 'https:' || !isCertificateFailure(error)) throw error
      const certificates = await capturePeerCertificates(target.hostname, Number(target.port || 443), timeoutMs)
      if (!certificates.length) throw error
      TOFU.set(target.hostname, { at: Date.now(), certificates })
      response = await nodeRequest(target, { method, headers, body, timeoutMs, ca: [...tls.rootCertificates, ...files, ...certificates] })
    }
    const location = response.headers.location
    if (response.status >= 300 && response.status < 400 && location && hop < maxRedirects) {
      target = new URL(location, target)
      continue
    }
    return { status: response.status, headers: response.headers, text: response.text }
  }
  throw new Error('too many redirects')
}

/**
 * fetch + timeout + bounded body read. Returns `{ status, headers, text }`
 * instead of a Response so callers never forget to release the body.
 *
 * When a local proxy intercepts TLS, `fetch` fails with a certificate error
 * that explains nothing to the user (Node reports only "fetch failed"). This
 * wrapper retries such failures through `requestWithTrustFallback` and keeps
 * the original cause in the message, so the panel can say what actually broke.
 */
export async function request(url, { method = 'GET', headers, body, timeoutMs = 12000 } = {}) {
  const requestHeaders = { 'User-Agent': DEFAULT_UA, ...(headers || {}) }
  let res
  try {
    res = await fetch(url, {
      method,
      headers: requestHeaders,
      body,
      signal: timeoutSignal(timeoutMs),
      redirect: 'follow',
    })
  } catch (error) {
    const aborted = error && (error.name === 'AbortError' || error.name === 'TimeoutError')
    if (!aborted && isCertificateFailure(error)) {
      try {
        return await requestWithTrustFallback(url, { method, headers: requestHeaders, body, timeoutMs })
      } catch (fallbackError) {
        throw new HttpError(`network error: ${errorText(error)}`, { url, kind: 'network', cause: fallbackError })
      }
    }
    throw new HttpError(
      aborted ? `timeout after ${timeoutMs}ms` : `network error: ${errorText(error) || 'fetch failed'}`,
      { url, kind: aborted ? 'timeout' : 'network', cause: error },
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
