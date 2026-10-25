/**
 * Ranking and classification.
 *
 * The panel's job is "which of these repositories is the plugin I mean", so
 * ranking is name-first: an exact name match outranks every description hit,
 * which is exactly what keyword-only search could not express.
 */

export const CATEGORIES = [
  {
    key: 'ui',
    re: /\b(ui|ux|theme|themes|interface|sidebar|panel|widget|decor\w*|badge|icon|icons|window|layout|composer|appearance|dark.?mode|css|typography|emoji|gif|avatar)\b|界面|主题|窗口|图标|表情|美化/i,
  },
  { key: 'mcp', re: /\bmcp\b|模型上下文|上下文协议/i },
  {
    key: 'automation',
    re: /\b(automat\w*|schedule[rd]?|cron|remind\w*|notif\w*|pipeline|routine|daily|watch\w*|trigger|workflow|hook|hooks)\b|自动|提醒|定时|工作流|定时任务/i,
  },
  {
    key: 'dev',
    re: /\b(develop\w*|debug\w*|test\w*|lint\w*|build\w*|git\b|code|terminal|shell\b|cli\b|log\w*|sdk|typescript|javascript|npm|package|editor|diagnos\w*)\b|开发|调试|终端|编辑器|诊断/i,
  },
  {
    key: 'ai',
    re: /\b(ai|llm|model|models|agent|agents|prompt\w*|memory|chat|reasoning|context|embedding|rag|knowledge|inference)\b|模型|智能|助手|记忆|提示|推理|知识库/i,
  },
  {
    key: 'tools',
    re: /\b(tool\w*|util\w*|helper|search|translat\w*|language|weather|calendar|note|notes|todo|clipboard|file|files|image|images|web|browser|fetch|rss|timer|pomodoro|download|export|import|audit|catalog)\b|工具|翻译|笔记|剪贴板|日历|下载|审计/i,
  },
]

export const CATEGORY_KEYS = [...CATEGORIES.map((c) => c.key), 'other']

/** Is this repository plausibly a DSH plugin at all? */
export function pluginSignal(record) {
  const text = `${record.full_name} ${record.desc} ${(record.topics || []).join(' ')}`.toLowerCase()
  return /dsh|cordis|deepseek|harness|plugin|skill|mcp|widget|toolkit|extension|theme|balance/.test(text)
}

export function classify(record) {
  const text = `${record.full_name} ${record.desc} ${(record.topics || []).join(' ')}`.toLowerCase()
  for (const cat of CATEGORIES) {
    if (cat.re.test(text)) return cat.key
  }
  return 'other'
}

function nameOf(record) {
  return String(record.full_name || '').split('/')[1] || ''
}

/**
 * Score a record against an intent.
 *
 * `exactName` matches are separated out by the caller; the score below is used
 * to order the rest (related results).
 */
export function scoreRecord(record, intent, { seed = false } = {}) {
  let score = 0
  const name = nameOf(record).toLowerCase()
  const full = String(record.full_name || '').toLowerCase()
  const desc = String(record.desc || '').toLowerCase()
  const topics = (record.topics || []).map((t) => String(t).toLowerCase())

  const terms = (intent.terms && intent.terms.length ? intent.terms : []).map((t) => String(t).toLowerCase()).filter(Boolean)

  if (intent.exact && intent.exact.name) {
    const want = String(intent.exact.name).toLowerCase()
    if (name === want || full === want) score += 1200
    else if (name.startsWith(want) || name.endsWith(want)) score += 320
    else if (name.includes(want)) score += 180
  }

  for (const term of terms) {
    if (name === term) score += 500
    else if (name.startsWith(term)) score += 220
    else if (name.includes(term)) score += 140
    if (desc.includes(term)) score += 55
    if (topics.some((t) => t.includes(term))) score += 45
  }

  if (terms.length > 1) {
    const hits = terms.filter((t) => name.includes(t) || desc.includes(t) || topics.some((x) => x.includes(t))).length
    score += hits * 25
  }

  if (intent.owner && full.startsWith(`${String(intent.owner).toLowerCase()}/`)) score += 260
  if (intent.topics && intent.topics.length) {
    for (const topic of intent.topics) if (topics.includes(topic.toLowerCase())) score += 120
  }
  if (seed) score += 15
  if (!pluginSignal(record)) score -= 70
  if (record.archived) score -= 45
  if (record.fork) score -= 10

  const stars = Number(record.stars) || 0
  score += Math.log10(1 + stars) * 12

  const updated = record.updated ? Date.parse(record.updated) : 0
  if (updated) {
    const ageDays = (Date.now() - updated) / 86400000
    if (ageDays <= 14) score += 26
    else if (ageDays <= 45) score += 16
    else if (ageDays <= 120) score += 8
    else if (ageDays > 540) score -= 12
  }
  if (record.newlyCreated) score += 20
  return score
}

/** Merge duplicates that arrived from different channels. */
export function dedupe(records) {
  const byKey = new Map()
  for (const record of records) {
    if (!record || !record.full_name) continue
    const key = String(record.full_name).toLowerCase()
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, { ...record, sources: [...new Set(record.sources || [])] })
      continue
    }
    existing.stars = Math.max(Number(existing.stars) || 0, Number(record.stars) || 0)
    existing.desc = existing.desc || record.desc || ''
    existing.updated = [existing.updated, record.updated].filter(Boolean).sort().pop() || existing.updated
    existing.language = existing.language || record.language
    existing.archived = existing.archived ?? record.archived
    existing.fork = existing.fork ?? record.fork
    existing.topics = [...new Set([...(existing.topics || []), ...(record.topics || [])])].slice(0, 12)
    existing.sources = [...new Set([...(existing.sources || []), ...(record.sources || [])])]
    existing.seedOnly = Boolean(existing.seedOnly && record.seedOnly)
    existing.newlyCreated = Boolean(existing.newlyCreated || record.newlyCreated)
  }
  return [...byKey.values()]
}

export const SORT_MODES = ['relevance', 'stars', 'updated']

function timeOf(record) {
  if (!record.updated) return 0
  const value = Date.parse(record.updated)
  return Number.isFinite(value) ? value : 0
}

/**
 * Sort with exact-name hits first, then relevance, then stars.
 *
 * `options.sort` switches the primary key: `stars` ranks strictly by star count
 * (high to low) and `updated` by last push, with relevance as the tie-break so
 * the order stays deterministic.
 */
export function sortRanked(records, intent, options = {}) {
  const { sort = 'relevance', ...scoreOptions } = options || {}
  const mode = SORT_MODES.includes(sort) ? sort : 'relevance'
  const scored = records.map((record) => ({ ...record, score: scoreRecord(record, intent, scoreOptions), category: record.category || classify(record) }))
  const byName = (a, b) => String(a.full_name).localeCompare(String(b.full_name))
  if (mode === 'stars') {
    scored.sort((a, b) => (Number(b.stars) || 0) - (Number(a.stars) || 0) || b.score - a.score || byName(a, b))
  } else if (mode === 'updated') {
    scored.sort((a, b) => timeOf(b) - timeOf(a) || b.score - a.score || byName(a, b))
  } else {
    scored.sort((a, b) => b.score - a.score || (Number(b.stars) || 0) - (Number(a.stars) || 0) || byName(a, b))
  }
  return scored
}
