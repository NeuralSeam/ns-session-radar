// Copyright 2026 Neural Seam
// SPDX-License-Identifier: Apache-2.0

// Insights: deterministic rules over what the radar recorded, and over the per-project history of
// earlier sessions when the person turned it on. Pure functions: no `$`, no text. Each finding
// carries a rule id and plain data; register.js turns it into words, in the pane's language.

export const TTL_MS = { '5m': 5 * 60_000, '1h': 60 * 60_000 }

// What a token costs, as a multiple of one uncached input token
const PRICE = { read: 0.1, write5m: 1.25, write1h: 2 }

// Thresholds, each the smallest value that makes a finding
const MISS_MIN_PROMPT = 2000
const MISS_MAX_HIT = 0.5
const DENIED_MIN = 2
const FAILING_MIN = 3
const REPEATED_CMD_MIN = 5
const WEB_REPEAT_MIN = 3
const SLOW_MIN_CALLS = 3
const SLOW_P95_MS = 60_000
const SUBAGENT_MIN_TOKENS = 20_000
const CONTEXT_PCT = 80
const OVERHEAD_TOKENS = 30_000
const OVERHEAD_OVER_MEDIAN = 1.5
const MCP_UNUSED_MIN_SESSIONS = 5
const MCP_MIN_CALLS = 3
const MCP_FAIL_RATE = 0.3
const MCP_P95_MS = 30_000

export const HISTORY_PER_PROJECT = 30
export const HISTORY_PROJECTS = 20

const READ_ONLY_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS'])

// Bash prefixes that are safe to allow, and those never to allow: Claude asking for them again and
// again is better answered with a deny rule
const SAFE_PREFIX = /^(ls|cat|head|tail|pwd|echo|wc|grep|rg|find|which|type|tree|stat|du|df|git (status|diff|log|show|branch|remote|rev-parse|blame)|npm (ls|view|outdated)|node --version|python --version)\b/
const NEVER_PREFIX = /^(rm|sudo|su|dd|mkfs|chmod|chown|shutdown|reboot|curl|wget|git (push|reset|clean|checkout|rebase)|npm publish|docker (rm|rmi|system)|kubectl delete)\b|--force\b|\s-f\b/

const SEVERITY = { high: 0, medium: 1, low: 2 }

const isMiss = (m) => {
  const prompt = (m.tin ?? 0) + (m.cr ?? 0) + (m.cw ?? 0)
  return prompt > MISS_MIN_PROMPT && (m.cr ?? 0) / prompt < MISS_MAX_HIT
}

function p95(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
}

function median(values) {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// The command's first words, enough to name a permission rule: `npm run test` -> `npm run`
export function commandPrefix(label) {
  const words = String(label ?? '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  const second = words[1]
  if (!second || /^-|[/\\.=]/.test(second)) return words[0]
  return `${words[0]} ${second}`
}

export const mcpServer = (name) => (name.includes('·') ? name.split('·')[0] : null)

const doneCalls = (spans) => spans.filter((s) => s.kind !== 'api' && s.end)
const apiByAgent = (spans) => {
  const by = new Map()
  for (const s of spans) {
    if (s.kind !== 'api' || !s.end) continue
    if (!by.has(s.agent)) by.set(s.agent, [])
    by.get(s.agent).push(s)
  }
  for (const list of by.values()) list.sort((a, b) => a.start - b.start)
  return by
}

// Requests that sent their prompt uncached again: after the cache expired, or after a model switch
export function cacheLosses(session) {
  const ttlOf = new Map((session.agents ?? []).map((a) => [a.id, a.ttl]))
  const expired = []
  const switched = []
  for (const [agent, list] of apiByAgent(session.spans ?? [])) {
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]
      const s = list[i]
      if (s.meta?.first || !isMiss(s.meta ?? {})) continue
      const rewritten = (s.meta.tin ?? 0) + (s.meta.cw ?? 0)
      const gap = s.start - (prev.end ?? prev.start)
      const ttl = ttlOf.get(agent) === '1h' ? '1h' : '5m'
      if (prev.name !== s.name) switched.push({ id: s.id, agent, rewritten, from: prev.name, to: s.name })
      else if (gap > TTL_MS[ttl]) expired.push({ id: s.id, agent, rewritten, gap, ttl })
    }
  }
  return { expired, switched }
}

function cacheFindings(session) {
  const out = []
  const { expired, switched } = cacheLosses(session)
  if (expired.length) {
    const rewritten = expired.reduce((n, x) => n + x.rewritten, 0)
    const fiveMin = expired.filter((x) => x.ttl === '5m')
    const ttl = fiveMin.length ? '5m' : '1h'
    const waste = Math.round(rewritten * ((ttl === '5m' ? PRICE.write5m : PRICE.write1h) - PRICE.read))
    // With a 1 hour TTL the losses after a pause under an hour would have been reads, but every
    // write would cost 2x instead of 1.25x. Positive: the 1 hour TTL would have saved tokens.
    let oneHourNet = null
    if (fiveMin.length) {
      const saved = fiveMin.filter((x) => x.gap < TTL_MS['1h']).reduce((n, x) => n + x.rewritten, 0) *
        (PRICE.write5m - PRICE.read)
      const writes = (session.spans ?? []).filter((s) => s.kind === 'api').reduce((n, s) => n + (s.meta?.cw ?? 0), 0)
      oneHourNet = Math.round(saved - (writes - fiveMin.reduce((n, x) => n + x.rewritten, 0)) * (PRICE.write1h - PRICE.write5m))
    }
    out.push({
      rule: 'cache-expired',
      key: 'cache-expired',
      severity: waste > 100_000 ? 'high' : waste > 20_000 ? 'medium' : 'low',
      data: { count: expired.length, rewritten, waste, ttl, longestGap: Math.max(...expired.map((x) => x.gap)), oneHourNet },
      evidence: expired.map((x) => x.id),
    })
  }
  if (switched.length) {
    const rewritten = switched.reduce((n, x) => n + x.rewritten, 0)
    out.push({
      rule: 'cache-model-switch',
      key: 'cache-model-switch',
      severity: rewritten > 50_000 ? 'medium' : 'low',
      data: { count: switched.length, rewritten, from: switched[0].from, to: switched[0].to },
      evidence: switched.map((x) => x.id),
    })
  }
  return out
}

function groupBy(items, keyOf) {
  const m = new Map()
  for (const it of items) {
    const k = keyOf(it)
    if (k == null) continue
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(it)
  }
  return m
}

function deniedFindings(session) {
  const denied = doneCalls(session.spans ?? []).filter((s) => s.status === 'denied')
  const out = []
  for (const [key, list] of groupBy(denied, (s) => (s.name === 'Bash' ? `Bash ${commandPrefix(s.label)}` : s.name))) {
    if (list.length < DENIED_MIN) continue
    const tool = list[0].name
    const prefix = tool === 'Bash' ? commandPrefix(list[0].label) : ''
    const sample = list[0].label ?? ''
    const safety = tool !== 'Bash' ? 'review' : NEVER_PREFIX.test(sample) || NEVER_PREFIX.test(prefix) ? 'never'
      : SAFE_PREFIX.test(prefix) ? 'safe' : 'review'
    out.push({
      rule: 'denied-repeated',
      key: 'denied:' + key,
      severity: list.length >= 4 ? 'medium' : 'low',
      data: { tool, prefix, count: list.length, safety, permission: tool === 'Bash' ? `Bash(${prefix}:*)` : tool },
      evidence: list.map((s) => s.id),
    })
  }
  return out
}

// What a failure is keyed by: the command's prefix for Bash, the server tool for MCP, else the tool
// and its argument
export function failKey(span) {
  if (span.name === 'Bash') return `Bash ${commandPrefix(span.label)}`
  if (span.kind === 'mcp') return span.name
  return `${span.name} ${String(span.label ?? '').slice(0, 60)}`.trim()
}

function failingFindings(session, history) {
  const fails = doneCalls(session.spans ?? []).filter((s) => s.status === 'error' && s.kind !== 'agent')
  const now = groupBy(fails, failKey)
  const past = new Map()
  for (const rec of history) {
    for (const [k, n] of Object.entries(rec.failKeys ?? {})) {
      const cur = past.get(k) ?? { n: 0, sessions: 0 }
      cur.n += n
      cur.sessions++
      past.set(k, cur)
    }
  }
  const keys = new Set([...now.keys(), ...past.keys()])
  const out = []
  for (const k of keys) {
    const here = now.get(k)?.length ?? 0
    const before = past.get(k) ?? { n: 0, sessions: 0 }
    const count = here + before.n
    if (!here || count < FAILING_MIN) continue
    out.push({
      rule: 'failing-repeated',
      key: 'failing:' + k,
      severity: count >= 6 ? 'medium' : 'low',
      data: { key: k, count, here, sessions: before.sessions + 1 },
      evidence: (now.get(k) ?? []).map((s) => s.id),
    })
  }
  return out
}

function repeatFindings(session) {
  const calls = doneCalls(session.spans ?? [])
  const out = []
  for (const [label, list] of groupBy(calls.filter((s) => s.name === 'Bash'), (s) => s.label || null)) {
    if (list.length < REPEATED_CMD_MIN) continue
    const ms = list.reduce((n, s) => n + (s.end - s.start), 0)
    out.push({
      rule: 'repeated-command',
      key: 'repeated:' + label,
      severity: ms > 5 * 60_000 ? 'medium' : 'low',
      data: { label, count: list.length, ms },
      evidence: list.map((s) => s.id),
    })
  }
  for (const [url, list] of groupBy(calls.filter((s) => s.name === 'WebFetch'), (s) => s.label || null)) {
    if (list.length < WEB_REPEAT_MIN) continue
    out.push({
      rule: 'web-repeat',
      key: 'web:' + url,
      severity: 'low',
      data: { url, count: list.length },
      evidence: list.map((s) => s.id),
    })
  }
  return out
}

function slowFindings(session) {
  const calls = doneCalls(session.spans ?? []).filter((s) => s.kind === 'tool' || s.kind === 'web')
  const out = []
  for (const [name, list] of groupBy(calls, (s) => s.name)) {
    if (list.length < SLOW_MIN_CALLS) continue
    const durs = list.map((s) => s.end - s.start)
    const slow = p95(durs)
    if (slow <= SLOW_P95_MS) continue
    out.push({
      rule: 'slow-tool',
      key: 'slow:' + name,
      severity: 'low',
      data: { name, count: list.length, p95: slow, ms: durs.reduce((a, b) => a + b, 0) },
      evidence: list.map((s) => s.id),
    })
  }
  return out
}

function subagentFindings(session) {
  const out = []
  const api = apiByAgent(session.spans ?? [])
  for (const a of session.agents ?? []) {
    if (a.id === 'main' || (a.tokIn ?? 0) <= SUBAGENT_MIN_TOKENS) continue
    const calls = (session.spans ?? []).filter((s) => s.agent === a.id && s.kind !== 'api')
    if (!calls.length || !calls.every((s) => READ_ONLY_TOOLS.has(s.name))) continue
    const models = [...new Set((api.get(a.id) ?? []).map((s) => s.name))]
    const model = models.find((m) => !/haiku/i.test(m))
    if (!model) continue
    out.push({
      rule: 'subagent-model',
      key: 'subagent:' + (a.type ?? a.label),
      severity: a.tokIn > 200_000 ? 'medium' : 'low',
      data: { label: a.label, type: a.type ?? null, model, tokIn: a.tokIn, calls: calls.length },
      evidence: calls.map((s) => s.id),
    })
  }
  return out
}

// The first request of the main loop: system prompt, tools, CLAUDE.md and the first prompt
export function firstPromptTokens(spans) {
  const first = (spans ?? []).filter((s) => s.kind === 'api' && s.agent === 'main' && s.end)
    .sort((a, b) => a.start - b.start)[0]
  return first ? (first.meta?.tin ?? 0) + (first.meta?.cr ?? 0) + (first.meta?.cw ?? 0) : 0
}

function contextFindings(session, history) {
  const out = []
  if ((session.maxCtxPct ?? 0) > CONTEXT_PCT) {
    out.push({
      rule: 'context-pressure',
      key: 'context-pressure',
      severity: session.maxCtxPct > 90 ? 'medium' : 'low',
      data: { pct: Math.round(session.maxCtxPct) },
      evidence: [],
    })
  }
  const tokens = firstPromptTokens(session.spans)
  const past = history.map((r) => r.firstPrompt).filter((n) => n > 0)
  const med = past.length >= 3 ? median(past) : 0
  if (tokens > OVERHEAD_TOKENS || (med && tokens > med * OVERHEAD_OVER_MEDIAN)) {
    out.push({
      rule: 'fixed-overhead',
      key: 'fixed-overhead',
      severity: tokens > 2 * OVERHEAD_TOKENS ? 'medium' : 'low',
      data: { tokens, median: med || null },
      evidence: [],
    })
  }
  return out
}

function mcpFindings(session, history, mcpConfigured) {
  const out = []
  const calls = doneCalls(session.spans ?? []).filter((s) => s.kind === 'mcp')
  for (const [server, list] of groupBy(calls, (s) => mcpServer(s.name))) {
    if (list.length < MCP_MIN_CALLS) continue
    const fails = list.filter((s) => s.status === 'error').length
    const slow = p95(list.map((s) => s.end - s.start))
    if (fails / list.length < MCP_FAIL_RATE && slow <= MCP_P95_MS) continue
    out.push({
      rule: 'mcp-unreliable',
      key: 'mcp-unreliable:' + server,
      severity: fails / list.length >= 0.5 ? 'medium' : 'low',
      data: { server, count: list.length, fails, p95: slow },
      evidence: list.map((s) => s.id),
    })
  }
  const sessions = history.length + 1
  if (mcpConfigured?.length && sessions >= MCP_UNUSED_MIN_SESSIONS) {
    const used = new Set(calls.map((s) => mcpServer(s.name)))
    for (const rec of history) for (const srv of rec.mcpUsed ?? []) used.add(srv)
    const unused = mcpConfigured.filter((srv) => !used.has(srv))
    if (unused.length) {
      out.push({
        rule: 'mcp-unused',
        key: 'mcp-unused',
        severity: 'low',
        data: { servers: unused, sessions },
        evidence: [],
      })
    }
  }
  return out
}

/**
 * Every finding for this session, most severe first.
 * @param session {spans, turns, agents, totals, maxCtxPct}, as the radar holds them
 * @param history this project's earlier sessions, as `summarize` made them (the current one left out)
 * @param mcpConfigured the server names the project's .mcp.json lists
 */
export function analyze(session, history = [], mcpConfigured = []) {
  const findings = [
    ...cacheFindings(session),
    ...deniedFindings(session),
    ...failingFindings(session, history),
    ...repeatFindings(session),
    ...slowFindings(session),
    ...subagentFindings(session),
    ...contextFindings(session, history),
    ...mcpFindings(session, history, mcpConfigured),
  ]
  return findings.sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity])
}

/**
 * One session as the history keeps it: counts and sums, with no prompt and no argument beyond the
 * first words of a failing command.
 */
export function summarize(session, id) {
  const calls = doneCalls(session.spans ?? [])
  const byTool = {}
  for (const s of calls) {
    const t = (byTool[s.name] ??= { n: 0, ms: 0, fail: 0 })
    t.n++
    t.ms += s.end - s.start
    if (s.status !== 'ok') t.fail++
  }
  const failKeys = {}
  for (const s of calls) {
    if (s.status !== 'error' || s.kind === 'agent') continue
    const k = failKey(s)
    failKeys[k] = (failKeys[k] ?? 0) + 1
  }
  const { expired, switched } = cacheLosses(session)
  const t = session.totals ?? {}
  return {
    id,
    at: session.startedAt,
    durMs: Date.now() - session.startedAt,
    turns: (session.turns ?? []).length,
    calls: t.calls ?? 0,
    fails: t.errors ?? 0,
    denied: t.denied ?? 0,
    api: t.api ?? 0,
    tokIn: t.tokIn ?? 0,
    tokOut: t.tokOut ?? 0,
    cacheRead: t.cacheRead ?? 0,
    cacheWrite: t.cacheWrite ?? 0,
    rewritten: [...expired, ...switched].reduce((n, x) => n + x.rewritten, 0),
    firstPrompt: firstPromptTokens(session.spans),
    maxCtxPct: Math.round(session.maxCtxPct ?? 0),
    byTool,
    failKeys,
    mcpUsed: [...new Set(calls.filter((s) => s.kind === 'mcp').map((s) => mcpServer(s.name)))],
  }
}

// failKeys hold the first words of a command; keep them as short as the labels the radar shows
const capKeys = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.slice(0, 80), v]))

/**
 * The stored history with this session put in (or replaced), within the limits.
 * @param store `{ projects: { [cwd]: { at, sessions } }, applied: { [cwd]: [{ rule, at }] } }`
 */
export function upsertHistory(store, cwd, record) {
  const next = { projects: { ...(store?.projects ?? {}) }, applied: { ...(store?.applied ?? {}) } }
  const project = next.projects[cwd] ?? { at: 0, sessions: [] }
  const sessions = project.sessions.filter((r) => r.id !== record.id)
  sessions.push({ ...record, failKeys: capKeys(record.failKeys ?? {}) })
  sessions.sort((a, b) => a.at - b.at)
  next.projects[cwd] = { at: Date.now(), sessions: sessions.slice(-HISTORY_PER_PROJECT) }
  const names = Object.keys(next.projects)
  if (names.length > HISTORY_PROJECTS) {
    const oldest = names.sort((a, b) => next.projects[a].at - next.projects[b].at).slice(0, names.length - HISTORY_PROJECTS)
    for (const n of oldest) {
      delete next.projects[n]
      delete next.applied[n]
    }
  }
  return next
}

// The number each rule is meant to bring down, per session
const perTurn = (n, r) => n / Math.max(1, r.turns)
export const METRIC = {
  'cache-expired': (r) => perTurn(r.rewritten, r),
  'cache-model-switch': (r) => perTurn(r.rewritten, r),
  'denied-repeated': (r) => perTurn(r.denied, r),
  'failing-repeated': (r) => perTurn(r.fails, r),
  'repeated-command': (r) => perTurn(Object.values(r.byTool ?? {}).reduce((n, t) => n + t.ms, 0), r),
  'slow-tool': (r) => perTurn(Object.values(r.byTool ?? {}).reduce((n, t) => n + t.ms, 0), r),
  'web-repeat': (r) => perTurn(r.tokIn, r),
  'subagent-model': (r) => perTurn(r.tokIn, r),
  'mcp-unreliable': (r) => perTurn(r.tokIn, r),
  'context-pressure': (r) => r.maxCtxPct,
  'fixed-overhead': (r) => r.firstPrompt,
  'mcp-unused': (r) => r.firstPrompt,
}

export const METRIC_UNIT = {
  'cache-expired': 'tokTurn', 'cache-model-switch': 'tokTurn', 'denied-repeated': 'countTurn',
  'failing-repeated': 'countTurn', 'repeated-command': 'msTurn', 'slow-tool': 'msTurn', 'web-repeat': 'tokTurn',
  'subagent-model': 'tokTurn', 'mcp-unreliable': 'tokTurn', 'context-pressure': 'pct', 'fixed-overhead': 'tok',
  'mcp-unused': 'tok',
}

/**
 * For each change marked as applied, the rule's metric averaged over the sessions before and after
 * the mark. `after` is null until a session has ended after it.
 */
export function compareApplied(sessions, applied) {
  const avg = (list, f) => (list.length ? list.reduce((n, r) => n + f(r), 0) / list.length : null)
  return (applied ?? []).filter((a) => METRIC[a.rule]).map((a) => {
    const f = METRIC[a.rule]
    const before = sessions.filter((r) => r.at < a.at)
    const after = sessions.filter((r) => r.at >= a.at)
    return {
      rule: a.rule,
      at: a.at,
      unit: METRIC_UNIT[a.rule],
      before: avg(before, f),
      after: avg(after, f),
      nBefore: before.length,
      nAfter: after.length,
    }
  })
}
