/**
 * The discovery plan: which GitHub/npm channels to ask, in which order, and
 * how many requests each may spend.
 *
 * This is the part the old panel got wrong. It fired 12 fixed queries in a
 * row at an unauthenticated quota of 10 search requests per minute, so the
 * tail of the list always failed with 403 and the result grid silently
 * stopped growing. The plan below is a *budgeted* list: the orchestrator may
 * spend a token bucket on it, skip steps that cannot fit, and report what was
 * deferred instead of pretending the ecosystem is small.
 *
 * The channel mix is our own. It is informed by how community catalogs
 * enumerate the ecosystem (topic pages, name patterns, manifest files, npm),
 * but every query here is built from the user's intent rather than copied from
 * another project's fixed list.
 */

/** Topics that the DSH/Cordis ecosystem actually uses for plugins. */
export const TOPIC_CHANNELS = [
  { topic: 'dsh-plugin', weight: 10 },
  { topic: 'deepseek-harness', weight: 9 },
  { topic: 'deepseek-harness-plugin', weight: 6 },
  { topic: 'dsh', weight: 7 },
  { topic: 'cordis-plugin', weight: 6 },
  { topic: 'dsh-plugins', weight: 6 },
  { topic: 'cordis', weight: 5 },
  { topic: 'harness-plugin', weight: 4 },
]

const DAY = 86400000

/**
 * Chinese queries are common and GitHub's repository index is mostly English.
 * Rather than translating the whole sentence (which needs a network round
 * trip before the first search can even start), map the domain words that
 * actually appear in this ecosystem to their English counterparts and search
 * both. Unknown Chinese words still go through as-is.
 */
const CJK_HINTS = [
  [/界面|外观|美化|主题|皮肤|图标/, ['ui', 'theme']],
  [/翻译/, ['translate']],
  [/提醒|定时|任务|计划/, ['reminder', 'schedule']],
  [/记忆|上下文/, ['memory', 'context']],
  [/模型|推理/, ['model', 'inference']],
  [/工具|实用/, ['tool', 'utility']],
  [/插件/, ['plugin']],
  [/对话|聊天/, ['chat']],
  [/文件|目录/, ['file']],
  [/搜索/, ['search']],
  [/图片|图像/, ['image']],
  [/语音|音频|声音/, ['audio', 'voice']],
  [/通知/, ['notification']],
  [/日志|监控/, ['log', 'monitor']],
  [/数据库/, ['database']],
  [/终端|命令行/, ['terminal', 'cli']],
  [/审计|安全/, ['audit', 'security']],
  [/目录|索引|市场/, ['catalog', 'index']],
  [/余额|计费|用量/, ['balance', 'usage']],
]

/** English search hints for Chinese terms (deduped, max `limit`). */
export function expandCjkTerms(text, limit = 3) {
  const source = String(text || '')
  const out = []
  for (const [re, hints] of CJK_HINTS) {
    if (!re.test(source)) continue
    for (const hint of hints) if (!out.includes(hint)) out.push(hint)
  }
  return out.slice(0, limit)
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * DAY).toISOString().slice(0, 10)
}

/** Put explicit `lang:` / `stars:>` qualifiers back into a generated query. */
function withQualifiers(query, qualifiers) {
  const parts = [query]
  for (const [key, value] of Object.entries(qualifiers || {})) {
    if (!value) continue
    if (key === 'language') parts.push(`language:${value}`)
    else if (key === 'stars' || key === 'size') parts.push(`${key}:${String(value).replace(/^([0-9])/, '>=$1')}`)
    else if (key === 'pushed' || key === 'created' || key === 'updated') parts.push(`${key}:>=${value}`)
    else if (key === 'archived' || key === 'fork') parts.push(`${key}:${value}`)
    else if (key === 'license') parts.push(`license:${value}`)
  }
  return parts.join(' ')
}

/**
 * @param {ReturnType<import('./intent.mjs').parseIntent>} intent
 * @param {{token?: string, depth?: 1|2|3}} options
 * @returns {{steps: Array<object>, deferred: Array<object>, notes: string[]}}
 */
export function buildPlan(intent, { token, depth = 1 } = {}) {
  const steps = []
  const notes = []
  const maxPages = depth >= 3 ? 3 : depth >= 2 ? 2 : 1
  // The fresh channel is sorted by creation date, so its first 60 days already
  // include the next 60 on page 2; keeping the window fixed means a deeper
  // round reuses the cached page 1 instead of paying for it twice.
  const freshSince = isoDaysAgo(60)

  const repo = (id, q, extra = {}) => {
    steps.push({
      id,
      channel: extra.kind === 'code-search' ? 'code' : 'github',
      kind: extra.kind || 'repo-search',
      q,
      perPage: extra.perPage || 100,
      pages: extra.pages || maxPages,
      sort: extra.sort,
      order: extra.order,
      weight: extra.weight || 5,
      label: extra.label || id,
    })
  }

  if (intent.mode === 'browse') {
    // Topics find repositories that opt in; the word channels below find the
    // ones that never set a topic. Topic-only coverage is what made the second
    // generation look smaller than the first, so both families run.
    for (const t of TOPIC_CHANNELS) {
      repo(`topic:${t.topic}`, `topic:${t.topic}`, { weight: t.weight, label: `topic:${t.topic}` })
    }
    repo('name:dsh-', 'dsh- in:name', { weight: 11 })
    repo('name:cordis-plugin', 'cordis-plugin in:name', { weight: 6 })
    repo('text:dsh-plugin', 'dsh plugin in:name,description', { weight: 10 })
    repo('text:harness', '"deepseek harness" plugin in:name,description,readme', { weight: 9 })
    repo('text:cordis', 'cordis plugin in:name,description,readme', { weight: 8 })
    repo('text:cordis-dsh', 'cordis dsh in:name,description,readme', { weight: 7 })
    repo('fresh', `dsh created:>=${freshSince}`, { sort: 'created', order: 'desc', weight: 8, label: '最新上传' })
    if (token) repo('code:manifest', '"dsh" "bundle" filename:package.json', { kind: 'code-search', weight: 5, pages: 1, perPage: 50 })
    return { steps, deferred: [], notes }
  }

  const terms = (intent.terms.length ? intent.terms : [intent.raw]).filter(Boolean)
  const primary = terms.slice(0, 3)
  const base = withQualifiers('', intent.qualifiers)

  if (intent.mode === 'topic' || intent.mode === 'owner') {
    for (const topic of intent.topics.slice(0, 3)) {
      repo(`topic:${topic}`, withQualifiers(`topic:${topic} ${primary.join(' ')}`.trim(), intent.qualifiers))
    }
    if (intent.owner) {
      repo('owner:all', withQualifiers(`user:${intent.owner}`, intent.qualifiers), { pages: Math.min(maxPages, 2) })
      repo('owner:plugins', withQualifiers(`user:${intent.owner} dsh`, intent.qualifiers))
    }
    if (!steps.length) repo('fallback', withQualifiers(primary.join(' '), intent.qualifiers))
    repo('fresh', withQualifiers(`${primary.join(' ')} created:>=${freshSince}`, intent.qualifiers), { sort: 'created', order: 'desc', weight: 3 })
    return { steps, deferred: [], notes }
  }

  // keyword mode: precision first, then recall per term.
  repo('all-terms', withQualifiers(`${primary.join(' ')} dsh`, intent.qualifiers), { weight: 9 })
  for (const term of primary) {
    repo(`term:${term}`, withQualifiers(`${term} plugin dsh`, intent.qualifiers), { weight: 7 })
  }
  repo('name-hits', withQualifiers(`${primary[0]} in:name`, intent.qualifiers), { weight: 8 })
  for (const hint of expandCjkTerms(primary.join(' '), 2)) {
    repo(`hint:${hint}`, withQualifiers(`${hint} plugin dsh`, intent.qualifiers), { weight: 6, label: `英文词：${hint}` })
  }
  repo('fresh', withQualifiers(`${primary[0]} created:>=${freshSince}`, intent.qualifiers), { sort: 'created', order: 'desc', weight: 3 })
  if (token) {
    repo('code:manifest', `${primary[0]} filename:cordis.patch.yml`, { kind: 'code-search', weight: 4, pages: 1, perPage: 50 })
  }
  void base
  if (!steps.length) repo('fallback', withQualifiers(primary.join(' '), intent.qualifiers))
  return { steps, deferred: [], notes }
}

/**
 * Priority order for a tight budget: an exact-name query beats topic sweeps,
 * but within one plan the declared order is already meaningful.
 */
export function orderSteps(steps) {
  return [...steps].sort((a, b) => (b.weight || 0) - (a.weight || 0))
}
