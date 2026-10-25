/**
 * Turn one search box string into an explicit search intent.
 *
 * The old panel appended the raw text to every query, so typing a plugin name
 * returned every repository whose description merely *contained* that word.
 * Here a name-shaped input becomes `mode: 'exact'` and is resolved directly;
 * free text stays a keyword search but is tokenised and ranked instead of
 * AND-ed into the GitHub query.
 *
 * Modes:
 *   browse   - empty input: enumerate the ecosystem
 *   exact    - owner/repo, a GitHub URL, `@scope/pkg`, `exact:<name>`, or one
 *              package-shaped token such as `dsh-whale-widget`
 *   topic    - `topic:<name>` / `主题:<name>`
 *   owner    - `owner:<login>` / `user:<login>`
 *   keyword  - everything else
 */

const REPO_SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/
const GITHUB_URL_RE = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:[\/#?].*)?$/i
const NPM_SCOPED_RE = /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i
const NPM_PLAIN_RE = /^[a-z0-9][a-z0-9._-]{1,80}$/i
const PLUGIN_TOKEN_HINT_RE = /^(?:dsh|cordis|harness)[-_]|[-_](?:plugin|widget|extension|skill|tool|mcp|theme|panel|toolkit)$/i

const QUALIFIER_ALIASES = {
  lang: 'language',
  language: 'language',
  stars: 'stars',
  pushed: 'pushed',
  created: 'created',
  updated: 'updated',
  archived: 'archived',
  license: 'license',
  size: 'size',
  fork: 'fork',
  forks: 'fork',
  topic: 'topic',
  user: 'owner',
  org: 'owner',
  owner: 'owner',
}

/** Strip surrounding quotes/backticks a user may paste around a name. */
function unquote(text) {
  const s = String(text || '').trim()
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('`') && s.endsWith('`')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1).trim()
  }
  return s
}

/** `dsh-whale-widget` / `@scope/pkg` are names, not prose. */
export function looksLikePluginName(token) {
  const t = unquote(token)
  if (!t || /\s/.test(t)) return false
  if (REPO_SLUG_RE.test(t)) return true
  if (NPM_SCOPED_RE.test(t)) return true
  if (!NPM_PLAIN_RE.test(t)) return false
  if (PLUGIN_TOKEN_HINT_RE.test(t)) return true
  // A single lower-case token with two hyphens is package-shaped even without
  // an obvious dsh/cordis prefix (`github-plugin-finder`).
  return /^[a-z0-9]+(?:-[a-z0-9]+){2,}$/.test(t)
}

function tokenizeKeyword(text) {
  const terms = []
  const re = /"([^"]+)"|([^\s,，、;；]+)/g
  let m
  while ((m = re.exec(text))) {
    const raw = (m[1] || m[2] || '').trim()
    if (!raw) continue
    // Drop GitHub qualifier syntax from the free-text terms; it is parsed
    // separately and must not double as a keyword.
    if (/^[a-z]+:/i.test(raw) && !/^https?:/i.test(raw)) continue
    terms.push(raw)
  }
  return terms.slice(0, 12)
}

/**
 * @returns {{
 *   raw: string, mode: 'browse'|'exact'|'topic'|'owner'|'keyword',
 *   terms: string[], topics: string[], owner: string|null,
 *   exact: { kind: 'repo'|'npm', value: string, owner?: string, name?: string }|null,
 *   qualifiers: Record<string,string>, notes: string[]
 * }}
 */
export function parseIntent(input) {
  const raw = String(input == null ? '' : input).trim()
  const intent = {
    raw,
    mode: 'browse',
    terms: [],
    topics: [],
    owner: null,
    exact: null,
    qualifiers: {},
    notes: [],
  }
  if (!raw) return intent

  // `exact:` / `精确:` force a name lookup even for prose-looking input.
  const forced = /^(?:exact|精确|精准)\s*[:：]\s*(.+)$/i.exec(raw)
  if (forced) {
    const value = unquote(forced[1])
    intent.mode = 'exact'
    intent.exact = describeName(value)
    intent.notes.push('forced-exact')
    return intent
  }

  // `repo:owner/name` and raw owner/repo slugs / GitHub URLs.
  const repoQualified = /^(?:repo|仓库)\s*[:：]\s*(.+)$/i.exec(raw)
  const repoCandidate = unquote(repoQualified ? repoQualified[1] : raw)
  const url = GITHUB_URL_RE.exec(repoCandidate)
  if (url) {
    intent.mode = 'exact'
    intent.exact = { kind: 'repo', value: `${url[1]}/${url[2]}`, owner: url[1], name: url[2] }
    return intent
  }
  if (!/\s/.test(repoCandidate) && REPO_SLUG_RE.test(repoCandidate)) {
    const [owner, name] = repoCandidate.split('/')
    intent.mode = 'exact'
    intent.exact = { kind: 'repo', value: repoCandidate, owner, name }
    return intent
  }

  // `topic:` / `owner:` / `user:` / `lang:` ... qualifiers.
  const tokens = raw.match(/"[^"]+"|\S+/g) || []
  const leftovers = []
  for (const token of tokens) {
    const q = /^([a-z]+)\s*[:：]\s*(.+)$/i.exec(token)
    const alias = q ? QUALIFIER_ALIASES[q[1].toLowerCase()] : null
    if (q && alias) {
      const value = unquote(q[2])
      if (alias === 'topic') {
        intent.topics.push(value.toLowerCase())
      } else if (alias === 'owner') {
        intent.owner = value
      } else {
        intent.qualifiers[alias] = value
      }
      continue
    }
    leftovers.push(token)
  }

  if (intent.topics.length || intent.owner) {
    intent.mode = intent.topics.length ? 'topic' : 'owner'
    intent.terms = tokenizeKeyword(leftovers.join(' '))
    return intent
  }

  // A lone package-shaped token is an exact lookup, e.g. `dsh-lean` or
  // `@local/github-plugin-finder`. Two or more tokens is prose.
  const single = leftovers.length === 1 ? unquote(leftovers[0]) : ''
  if (single && !/\s/.test(single) && looksLikePluginName(single)) {
    intent.mode = 'exact'
    intent.exact = describeName(single)
    return intent
  }

  intent.mode = 'keyword'
  intent.terms = tokenizeKeyword(leftovers.join(' '))
  if (Object.keys(intent.qualifiers).length) intent.notes.push('has-qualifiers')
  return intent
}

/** Classify one name-shaped string as a repo slug or an npm package. */
export function describeName(value) {
  const v = unquote(value)
  if (REPO_SLUG_RE.test(v)) {
    const [owner, name] = v.split('/')
    return { kind: 'repo', value: v, owner, name }
  }
  if (NPM_SCOPED_RE.test(v)) return { kind: 'npm', value: v, name: v }
  return { kind: 'npm', value: v, name: v }
}

/** Human label for the UI ("精确：dsh-lean"). */
export function describeIntent(intent) {
  if (intent.mode === 'exact' && intent.exact) return `exact:${intent.exact.value}`
  if (intent.mode === 'topic') return `topic:${intent.topics.join(',')}`
  if (intent.mode === 'owner') return `owner:${intent.owner}`
  if (intent.mode === 'keyword') return `keywords:${intent.terms.join(' ')}`
  return 'browse'
}
