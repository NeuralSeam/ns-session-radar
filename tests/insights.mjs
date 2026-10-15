// Copyright 2026 Neural Seam
// SPDX-License-Identifier: Apache-2.0

// The insight rules on their own: for each, a session that should make a finding and one that
// should not. No Claude Code needed; the rules are pure functions.

import assert from 'node:assert/strict'
import {
  analyze, summarize, upsertHistory, compareApplied, commandPrefix, cacheLosses,
  HISTORY_PER_PROJECT, HISTORY_PROJECTS,
} from '../hooks/insights.js'

let id = 0
const MIN = 60_000
const call = (name, label, o = {}) => {
  const start = o.start ?? 0
  return {
    id: ++id, kind: o.kind ?? (name.includes('·') ? 'mcp' : name === 'WebFetch' ? 'web' : 'tool'), name, label,
    agent: o.agent ?? 'main', turn: 't1', start, end: start + (o.ms ?? 100), status: o.status ?? 'ok', meta: {},
  }
}
const req = (start, meta, o = {}) => ({
  id: ++id, kind: 'api', name: o.model ?? 'sonnet-5-5', label: '', agent: o.agent ?? 'main', turn: 't1',
  start, end: start + 1000, status: 'ok', meta: { tin: 0, tout: 100, cr: 0, cw: 0, first: false, ...meta },
})
const session = (spans, o = {}) => ({
  id: 's', startedAt: 0, maxCtxPct: o.maxCtxPct ?? 0, spans,
  turns: o.turns ?? [{ id: 't1' }],
  agents: o.agents ?? [{ id: 'main', ttl: o.ttl ?? null, tokIn: 0 }],
  totals: o.totals ?? { calls: spans.length, errors: 0, denied: 0, api: 0, tokIn: 0, tokOut: 0, cacheRead: 0, cacheWrite: 0 },
})
const rules = (s, history, mcp) => analyze(s, history, mcp).map((f) => f.rule)
const only = (s, rule, history, mcp) => analyze(s, history, mcp).find((f) => f.rule === rule)

// commandPrefix: two words, or one when the second is a flag or a path
assert.equal(commandPrefix('npm run build'), 'npm run')
assert.equal(commandPrefix('ls -la src'), 'ls')
assert.equal(commandPrefix('cat ./README.md'), 'cat')
assert.equal(commandPrefix(''), '')

// cache-expired: a pause longer than the TTL, then most of the prompt sent uncached
{
  const hit = session([
    req(0, { cw: 20_000, first: true }),
    req(10 * MIN, { tin: 500, cw: 20_000 }),
  ], { ttl: null })
  const f = only(hit, 'cache-expired')
  assert.ok(f, 'cache-expired found')
  assert.equal(f.data.count, 1)
  assert.equal(f.data.rewritten, 20_500)
  assert.equal(f.data.ttl, '5m')
  assert.equal(typeof f.data.oneHourNet, 'number')
  const quick = session([req(0, { cw: 20_000, first: true }), req(MIN, { cr: 20_000, tin: 200 })])
  assert.ok(!rules(quick).includes('cache-expired'), 'a cache read is no loss')
  const longTtl = session([req(0, { cw: 20_000, first: true }), req(10 * MIN, { tin: 500, cw: 20_000 })], { ttl: '1h' })
  assert.ok(!rules(longTtl).includes('cache-expired'), 'a 10 minute pause is within a 1 hour TTL')
}

// cache-model-switch: the same loop changes model and resends the prompt
{
  const s = session([req(0, { cw: 20_000, first: true }), req(MIN, { cw: 20_000 }, { model: 'opus-5-5' })])
  const f = only(s, 'cache-model-switch')
  assert.ok(f)
  assert.equal(f.data.to, 'opus-5-5')
  assert.ok(!rules(s).includes('cache-expired'), 'a switch is not counted as an expiry too')
  const { expired, switched } = cacheLosses(s)
  assert.equal(expired.length + switched.length, 1)
}

// denied-repeated: safe, review and never
{
  const safe = only(session([call('Bash', 'git status', { status: 'denied' }), call('Bash', 'git status -s', { status: 'denied' })]), 'denied-repeated')
  assert.equal(safe.data.safety, 'safe')
  assert.equal(safe.data.permission, 'Bash(git status:*)')
  const review = only(session([call('Bash', 'npm run build', { status: 'denied' }), call('Bash', 'npm run lint', { status: 'denied' })]), 'denied-repeated')
  assert.equal(review.data.safety, 'review')
  const never = only(session([call('Bash', 'rm -rf dist', { status: 'denied' }), call('Bash', 'rm -rf build', { status: 'denied' })]), 'denied-repeated')
  assert.equal(never.data.safety, 'never', 'a destructive command is never offered for allow')
  const force = only(session([call('Bash', 'git push --force', { status: 'denied' }), call('Bash', 'git push --force', { status: 'denied' })]), 'denied-repeated')
  assert.equal(force.data.safety, 'never')
  assert.ok(!rules(session([call('Bash', 'git status', { status: 'denied' })])).includes('denied-repeated'), 'one denial is not a pattern')
}

// failing-repeated: three failures, counting earlier sessions
{
  const fails = [1, 2, 3].map(() => call('Bash', 'npm test --watch', { status: 'error' }))
  assert.equal(only(session(fails), 'failing-repeated').data.key, 'Bash npm test')
  const one = session([call('Bash', 'npm test', { status: 'error' })])
  assert.ok(!rules(one).includes('failing-repeated'))
  const f = only(one, 'failing-repeated', [{ failKeys: { 'Bash npm test': 2 } }])
  assert.equal(f.data.count, 3)
  assert.equal(f.data.sessions, 2)
  assert.ok(!rules(session([]), [{ failKeys: { 'Bash npm test': 9 } }]).includes('failing-repeated'),
    'past failures alone, with none now, make no finding')
}

// repeated-command and web-repeat
{
  const five = [1, 2, 3, 4, 5].map(() => call('Bash', 'npm run build'))
  assert.equal(only(session(five), 'repeated-command').data.count, 5)
  assert.ok(!rules(session(five.slice(1))).includes('repeated-command'))
  const web = [1, 2, 3].map(() => call('WebFetch', 'https://docs.example.com/api'))
  assert.ok(rules(session(web)).includes('web-repeat'))
  assert.ok(!rules(session(web.slice(1))).includes('web-repeat'))
}

// slow-tool: p95 over a minute across at least three calls
{
  const slow = [1, 2, 3].map(() => call('Bash', 'make', { ms: 90_000 }))
  assert.ok(rules(session(slow)).includes('slow-tool'))
  const fast = [1, 2, 3].map(() => call('Bash', 'make', { ms: 5_000 }))
  assert.ok(!rules(session(fast)).includes('slow-tool'))
}

// subagent-model: a read-only subagent on a model that is not haiku
{
  const spans = [call('Read', 'a.js', { agent: 'ag1' }), call('Grep', 'x', { agent: 'ag1' }), req(0, { tin: 30_000 }, { agent: 'ag1' })]
  const agents = [{ id: 'main', tokIn: 0 }, { id: 'ag1', label: 'find usages', type: 'general-purpose', tokIn: 30_000 }]
  assert.equal(only(session(spans, { agents }), 'subagent-model').data.model, 'sonnet-5-5')
  const haiku = [spans[0], spans[1], req(0, { tin: 30_000 }, { agent: 'ag1', model: 'haiku-5-5' })]
  assert.ok(!rules(session(haiku, { agents })).includes('subagent-model'))
  const writes = [...spans, call('Edit', 'a.js', { agent: 'ag1' })]
  assert.ok(!rules(session(writes, { agents })).includes('subagent-model'), 'a subagent that edits is not a search')
}

// context-pressure and fixed-overhead
{
  assert.ok(rules(session([], { maxCtxPct: 85 })).includes('context-pressure'))
  assert.ok(!rules(session([], { maxCtxPct: 60 })).includes('context-pressure'))
  assert.ok(rules(session([req(0, { cw: 40_000, first: true })])).includes('fixed-overhead'))
  const small = session([req(0, { cw: 12_000, first: true })])
  assert.ok(!rules(small).includes('fixed-overhead'))
  const past = [8_000, 7_000, 7_500].map((firstPrompt) => ({ firstPrompt }))
  assert.equal(only(small, 'fixed-overhead', past).data.median, 7_500, 'well over this project\'s median')
}

// mcp-unused: needs five sessions; mcp-unreliable: failures or slowness
{
  const used = session([call('github·search', 'q')])
  const four = [1, 2, 3].map(() => ({ mcpUsed: [] }))
  assert.ok(!rules(used, four, ['github', 'jira']).includes('mcp-unused'), 'four sessions are not enough')
  const five = [...four, { mcpUsed: [] }]
  assert.deepEqual(only(used, 'mcp-unused', five, ['github', 'jira']).data.servers, ['jira'])
  const flaky = [1, 2, 3].map((i) => call('jira·get', 'x', { status: i < 3 ? 'error' : 'ok' }))
  assert.equal(only(session(flaky), 'mcp-unreliable').data.server, 'jira')
  assert.ok(!rules(session([1, 2, 3].map(() => call('jira·get', 'x')))).includes('mcp-unreliable'))
}

// Most severe first
{
  const s = session([req(0, { cw: 200_000, first: true }), req(10 * MIN, { tin: 1000, cw: 200_000 })], { maxCtxPct: 85 })
  const list = analyze(s)
  assert.equal(list[0].rule, 'cache-expired')
  assert.equal(list[0].severity, 'high')
}

// The history: counts only, capped per project and in projects, upserted by session id
{
  const s = session([call('Bash', 'curl https://x.test/?token=abc123 --silent', { status: 'error' }), req(0, { cw: 9_000, first: true })])
  const rec = summarize(s, 's1')
  assert.equal(rec.firstPrompt, 9_000)
  assert.deepEqual(Object.keys(rec.failKeys), ['Bash curl'], 'a failure keeps only the first words')
  assert.ok(!JSON.stringify(rec).includes('abc123'))

  let h = null
  for (let i = 0; i < HISTORY_PER_PROJECT + 5; i++) h = upsertHistory(h, '/p', { ...rec, id: 's' + i, at: i })
  assert.equal(h.projects['/p'].sessions.length, HISTORY_PER_PROJECT)
  assert.equal(h.projects['/p'].sessions[0].id, 's5', 'the oldest sessions leave first')
  h = upsertHistory(h, '/p', { ...rec, id: 's34', at: 34, turns: 9 })
  assert.equal(h.projects['/p'].sessions.length, HISTORY_PER_PROJECT, 'the same session is replaced, not added')
  for (let i = 0; i < HISTORY_PROJECTS + 3; i++) h = upsertHistory(h, '/other' + i, { ...rec, id: 'x', at: 0 })
  assert.equal(Object.keys(h.projects).length, HISTORY_PROJECTS)
  assert.ok(!h.projects['/p'], 'the project used least recently leaves first')
}

// Before and after a change marked as applied
{
  const sessions = [
    { at: 1, turns: 2, denied: 4 },
    { at: 2, turns: 2, denied: 2 },
    { at: 5, turns: 2, denied: 0 },
  ]
  const [cmp] = compareApplied(sessions, [{ rule: 'denied-repeated', at: 3 }])
  assert.equal(cmp.before, 1.5)
  assert.equal(cmp.after, 0)
  assert.equal(cmp.nBefore, 2)
  assert.equal(cmp.nAfter, 1)
  const [waiting] = compareApplied(sessions, [{ rule: 'denied-repeated', at: 9 }])
  assert.equal(waiting.after, null)
}

console.log('session-radar insights: all checks passed')
