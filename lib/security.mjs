/**
 * Heuristic privacy-risk scan for discovered repositories.
 *
 * A plugin that asks for screen access, clipboard access or browser storage
 * should say so before installation, not after. This module reads the files a
 * user would read anyway (README, package.json, the entry script) and looks
 * for those capabilities, so the panel can put a warning tag under the card.
 *
 * It is deliberately *heuristic* and honest about it: a match is evidence of
 * a capability, not proof of intent, and the scan is not a security audit. The
 * panel says exactly that, and the verdict is cached per repository for a week
 * so browsing is not punished with repeated downloads.
 */

import { request, clip } from './util.mjs'
import { getStore } from './store.mjs'

const API = 'https://api.github.com'
const RAW_ACCEPT = 'application/vnd.github.raw'
const MAX_BYTES = 200 * 1024
const MAX_REPOS = 12
const MAX_CONCURRENCY = 4
const SECURITY_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * File probes, each one API request. `readme` is the entry point most plugins
 * use to describe capabilities; `package.json` catches install-time scripts.
 * Raw GitHub is not used because it is exactly the host that interception
 * proxies break (and it resolves to an unroutable address on this machine).
 */
const FILES = [
  { path: 'readme', scope: 'readme' },
  { path: 'contents/package.json', scope: 'package' },
]

export const RISK_RULES = [
  {
    id: 'screen',
    severity: 'warn',
    label: { zh: '读取屏幕内容', en: 'reads the screen' },
    re: /识屏|截屏|屏幕截图|读取屏幕|getDisplayMedia|desktopCapturer|screen\s?capture/i,
    scopes: ['readme', 'code', 'package'],
  },
  {
    id: 'clipboard',
    severity: 'warn',
    label: { zh: '访问剪贴板', en: 'clipboard access' },
    re: /剪贴板|clipboard/i,
    scopes: ['readme', 'code', 'package'],
  },
  {
    id: 'browser-data',
    severity: 'high',
    label: { zh: '涉及浏览器数据 / Cookie', en: 'browser data or cookies' },
    re: /document\.cookie|browser[ _-]?(?:profile|cookies|history|passwords)|Local State|Login Data/i,
    scopes: ['readme', 'code'],
  },
  {
    id: 'credentials',
    severity: 'high',
    label: { zh: '涉及密码或私钥', en: 'password or private key' },
    re: /password|passwd|private[ _-]?key|id_rsa|ghp_[A-Za-z0-9]{20,}/i,
    scopes: ['readme', 'code'],
  },
  {
    id: 'install-script',
    severity: 'high',
    label: { zh: '安装脚本会执行命令', en: 'install script runs commands' },
    re: /"(?:pre|post)install"\s*:\s*"[^"]*(?:curl|wget|Invoke-WebRequest|powershell|node\s+-e)/i,
    scopes: ['package'],
  },
  {
    id: 'obfuscated',
    severity: 'warn',
    label: { zh: '含混淆或 eval', en: 'obfuscated code' },
    re: /eval\s*\(|new\s+Function\s*\(|atob\s*\(|Buffer\.from\([^)]*base64/i,
    scopes: ['code'],
  },
  {
    id: 'telemetry',
    severity: 'warn',
    label: { zh: '可能上报使用数据', en: 'telemetry' },
    re: /telemetry|analytics|埋点|usage\s?(?:stats|report)/i,
    scopes: ['readme', 'code'],
  },
  {
    id: 'upload',
    severity: 'high',
    label: { zh: '可能外传用户数据', en: 'data upload' },
    re: /(?:发送|上传|send|upload)[^\n]{0,60}(?:文件|数据|内容|data|file|content)[^\n]{0,60}(?:webhook|server|endpoint|https?:\/\/)/i,
    scopes: ['readme'],
  },
]

/** Scan one document; returns matches with a short evidence snippet. */
export function scanText(text, scope) {
  const source = String(text || '')
  if (!source) return []
  const findings = []
  for (const rule of RISK_RULES) {
    if (!rule.scopes.includes(scope)) continue
    const match = rule.re.exec(source)
    if (!match) continue
    const start = Math.max(0, match.index - 24)
    const snippet = source.slice(start, match.index + match[0].length + 24).replace(/\s+/g, ' ').trim()
    findings.push({
      id: rule.id,
      severity: rule.severity,
      label: rule.label,
      evidence: clip(snippet, 140),
    })
  }
  return findings
}

/** Collapse findings into the verdict shape the panel renders. */
export function summarize(findings, { scannedAt = Date.now(), sources = [] } = {}) {
  const byId = new Map()
  for (const finding of findings || []) {
    if (!finding || !finding.id) continue
    const existing = byId.get(finding.id)
    if (!existing || (existing.severity !== 'high' && finding.severity === 'high')) byId.set(finding.id, finding)
  }
  const unique = [...byId.values()]
  const level = unique.some((finding) => finding.severity === 'high') ? 'high' : unique.length ? 'warn' : 'clear'
  return { level, findings: unique.slice(0, 6), scannedAt, sources, heuristic: true }
}

/**
 * Scan one repository. Reads the cheapest public files; a missing file is not
 * an error, and a cached verdict younger than a week wins unless `force`.
 */
export async function scanRepo(fullName, { force = false, token = '', hint = '' } = {}) {
  const store = getStore()
  if (!force) {
    const cached = store.securityOf(fullName)
    if (cached) return cached
  }
  const headers = { Accept: RAW_ACCEPT, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  const findings = scanText(hint, 'readme')
  const sources = []
  let reachable = false
  for (const probe of FILES) {
    let text = ''
    try {
      const res = await request(`${API}/repos/${fullName}/${probe.path}`, { headers, timeoutMs: 8000 })
      text = res.text.slice(0, MAX_BYTES)
      sources.push(probe.path)
      reachable = true
    } catch (error) {
      if (error && error.status === 404) { reachable = true; continue }
      if (error && (error.status === 403 || error.status === 429)) throw error
      continue
    }
    findings.push(...scanText(text, probe.scope))
  }
  const verdict = summarize(findings, { sources })
  if (reachable) store.setSecurity(fullName, verdict)
  return verdict
}

/** Scan a bounded batch (the panel asks for the cards it is about to show). */
export async function scanMany(repos, { force = false, token = '' } = {}) {
  const unique = []
  for (const entry of repos || []) {
    const name = typeof entry === 'string' ? entry : (entry && entry.name)
    const hint = typeof entry === 'string' ? '' : (entry && entry.hint ? String(entry.hint).slice(0, 800) : '')
    if (typeof name !== 'string' || !name.includes('/')) continue
    if (unique.some((item) => item.name === name)) continue
    unique.push({ name, hint })
    if (unique.length >= MAX_REPOS) break
  }
  const results = {}
  let cursor = 0
  let aborted = ''
  async function worker() {
    while (cursor < unique.length && !aborted) {
      const item = unique[cursor]
      cursor += 1
      try {
        results[item.name] = await scanRepo(item.name, { force, token, hint: item.hint })
      } catch (error) {
        const status = error && error.status
        if (status === 403 || status === 429) {
          aborted = status === 429 ? 'rate-limit' : 'forbidden (add a token)'
          results[item.name] = { level: 'unknown', error: aborted, heuristic: true }
          break
        }
        results[item.name] = { level: 'unknown', error: clip(String((error && error.message) || error), 120), heuristic: true }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, unique.length || 1) }, worker))
  return { results, scanned: unique.length, aborted }
}

export const SECURITY_CACHE_TTL_MS = SECURITY_TTL_MS
export const __test__ = { FILES, MAX_REPOS }
