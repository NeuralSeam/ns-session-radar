// Copyright 2026 Neural Seam
// SPDX-License-Identifier: Apache-2.0

// Runs the mod against a fake Claude Code, with no session and no network.
//
//   npm test            checks every tab draws and the numbers add up
//   npm run preview     also prints each tab as plain text
//
// This exercises the mod's own logic. It is not a substitute for loading the mod in a real
// session with `claude --plugin-dir .`, which is what COMPATIBILITY.md records.

import assert from 'node:assert/strict'
import { register } from '../hooks/register.js'

const PRINT = process.argv.includes('--print')
const hooks = []
register((name, a, b) => hooks.push({ name, matcher: b ? a : null, fn: b ?? a }))

const el = (type) => (props) => ({ type, ...props })
const toasts = []
const writes = []
const stored = new Map()
const commands = []
const $ = {
  ui: {
    invalidate() {},
    resolve: () => ({ Box: el('Box'), Text: el('Text'), Button: el('Button') }),
    toast: (m) => toasts.push(m),
    open: async () => ({ isPlaced: true }),
    close: async () => {},
  },
  command: { register: async (c) => commands.push(c) },
  store: { get: async (k) => stored.get(k), set: async (k, v) => stored.set(k, v) },
  clock: { every() {} },
  session: {
    usage: async () => ({ context: { tokens: 84000, window: 200000, percent: 42 }, cost: 0.42, rateLimits: [] }),
  },
  fs: { write: async (path, text) => writes.push({ path, text }) },
}

const matches = (h, ev) => !h.matcher || Object.entries(h.matcher).every(([k, v]) => ev[k] === v)
const find = (name, ev) => {
  const h = hooks.find((x) => x.name === name && matches(x, ev))
  assert.ok(h, `no hook for ${name}`)
  return h
}
const fire = (name, ev, next = async (e) => e) => find(name, ev).fn($, ev, next)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function step(ev, usage) {
  const gen = find('turn.step', ev).fn($, ev, async function* () {
    yield { type: 'text', text: '…' }
    return { usage }
  })
  while (!(await gen.next()).done);
}

// A short session: one turn, a failing Bash, a subagent with its own calls, a web fetch
await fire('session.start', {})
await fire('turn.start', { turnId: 't1', text: 'fix the   login\nbug' })
await step({ model: 'claude-sonnet-5-5' }, {
  input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 18000, cache_creation_input_tokens: 500,
  cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 500 },
})
await fire('tool.call', { tool: 'Bash', command: 'npm test' }, async () => { await sleep(30); return { isError: true } })
await fire('tool.call', { tool: 'Agent', description: 'map the auth module', subagent_type: 'Explore' }, async () => {
  await fire('tool.call', { tool: 'Grep', pattern: 'login', agentId: 'ag1' }, async () => ({}))
  await step({ agentId: 'ag1' }, { input_tokens: 800, output_tokens: 900, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })
  await fire('tool.call', { tool: 'mcp__github__search_issues', query: 'auth bug', agentId: 'ag1' }, async () => ({}))
  return {}
})
await fire('tool.call', { tool: 'Bash', command: 'git push --force' }, async () => ({ deny: 'nope' }))
await fire('tool.call', { tool: 'WebFetch', url: 'https://example.com/docs' }, async () => ({}))
await fire('turn.complete', { turnId: 't1', durationMs: 100 })

// Flatten an element tree into the text the terminal would show
const flat = (n) => {
  if (n == null) return ''
  if (typeof n === 'string') return n
  if (n.type === 'Text') return n.children.join('')
  if (n.type === 'Button') return `${n.hotkey}: ${n.label}`
  const sep = n.flexDirection === 'column' ? '\n' : ' '.repeat(n.columnGap ?? 0)
  return (n.children ?? []).map(flat).join(sep)
}
const findKey = (n, key) => (n?.key === key ? n : (n?.children ?? []).map((c) => findKey(c, key)).find(Boolean))
const drawPane = (cols = 96) =>
  fire('ui.render', { component: 'Pane', requestId: 'session-radar', props: { bodyColumns: cols, scroll: { bodyRows: 24 } } }, async () => null)

// Every tab draws, and nothing is wider than the pane
for (const id of ['timeline', 'activities', 'agents', 'api', 'summary']) {
  findKey(await drawPane(), 'tab-' + id).onPress()
  for (const cols of [96, 60]) {
    const text = flat(await drawPane(cols))
    const widest = Math.max(...text.split('\n').filter((l) => !l.includes(': ')).map((l) => [...l].length))
    assert.ok(text.length > 0, `${id} drew nothing`)
    if (id === 'timeline') assert.ok(widest <= cols - 2, `${id} at ${cols} columns is ${widest} wide`)
    if (PRINT && cols === 96) console.log(`──── ${id}\n${text}\n`)
  }
}

// Another mod's pane is left alone
const other = await fire('ui.render', { component: 'Pane', requestId: 'someone-else', props: {} }, async () => 'untouched')
assert.equal(other, 'untouched')

// The spinner gets a summary and keeps the rest of its props
const spin = await fire('ui.render', { component: 'Spinner', props: { word: 'Thinking' } })
assert.equal(spin.props.word, 'Thinking')
assert.match(spin.props.suffix, /6 /)
if (PRINT) console.log('spinner suffix:', spin.props.suffix)

// Export writes one JSON file with the counts the session produced
await fire('command.run', { command: 'radar-export' })
assert.equal(writes.length, 1)
const data = JSON.parse(writes[0].text)
assert.equal(data.totals.calls, 6)
assert.equal(data.totals.mcp, 1)
assert.equal(data.totals.web, 1)
assert.equal(data.totals.agents, 1)
assert.equal(data.totals.api, 2)
assert.equal(data.totals.errors, 1)
assert.equal(data.totals.denied, 1)
assert.equal(data.agents.find((a) => a.id === 'ag1').parent, 'main')
assert.ok(data.spans.every((s) => s.label.length <= 120), 'labels are capped')
// The credit is added beside the existing fields, never in place of one
assert.equal(data.generator, 'session-radar by Neural Seam (https://github.com/NeuralSeam/ns-session-radar)')
assert.equal(data.tool, 'session-radar')
assert.deepEqual(Object.keys(data), ['tool', 'generator', 'exportedAt', 'startedAt', 'totals', 'turns', 'agents', 'spans'])

// The credit sits on the last line of every tab, in the pane's language, and only in the pane
const lastLine = async () => flat(await drawPane()).split('\n').at(-1)
await fire('command.run', { command: 'radar-lang', args: 'en' })
for (const id of ['timeline', 'activities', 'agents', 'api', 'summary']) {
  findKey(await drawPane(), 'tab-' + id).onPress()
  assert.equal(await lastLine(), 'Session Radar · by Neural Seam · neuralseam.cloud', `credit on ${id}`)
}
await fire('command.run', { command: 'radar-lang', args: 'pt' })
assert.equal(await lastLine(), 'Session Radar · por Neural Seam · neuralseam.cloud')
findKey(await drawPane(), 'tab-timeline').onPress()
assert.ok(!spin.props.suffix.includes('Neural Seam'), 'the spinner summary carries no credit')

// The checks below read English text, whatever the machine's language
await fire('command.run', { command: 'radar-lang', args: 'en' })

// Activities: one per prompt, the newest open, listing every call it made, its subagent's included
findKey(await drawPane(), 'tab-activities').onPress()
let text = flat(await drawPane())
assert.match(text, /#1 fix the login bug/)
assert.match(text, /Bash ×2/)
for (const arg of ['npm test', 'map the auth module', 'login', 'auth bug', 'https://example.com/docs']) {
  assert.ok(text.includes(arg), `the activity lists ${arg}`)
}
// A second prompt opens on its own; the first opens again when pressed
await fire('turn.start', { turnId: 't2', text: '' })
await fire('tool.call', { tool: 'Read', file_path: 'README.md' }, async () => ({}))
await fire('turn.complete', { turnId: 't2', durationMs: 10 })
text = flat(await drawPane())
assert.match(text, /#2 \(no prompt/)
assert.ok(!text.includes('npm test'), 'only the open activity lists its calls')
findKey(await drawPane(), 'turn-t1').onPress()
assert.ok(flat(await drawPane()).includes('npm test'), 'pressing an activity opens it')
if (PRINT) console.log(`──── activities, first opened\n${flat(await drawPane())}\n`)

// API: the main loop's cache lifetime from the TTL the request reported, and the legend on h
findKey(await drawPane(), 'tab-api').onPress()
text = flat(await drawPane())
assert.match(text, /TTL 1h/)
assert.match(text, /expires in 59m/)
assert.ok(!text.includes('does not report the cache TTL'), 'no fallback note once a TTL was seen')
findKey(await drawPane(), 'help').onPress()
text = flat(await drawPane())
assert.match(text, /input the cache did not serve/)
if (PRINT) console.log(`──── api, with help\n${text}\n`)

// Language: /radar-lang switches and remembers, the l key cycles, a bad argument explains itself
assert.ok(commands.some((c) => c.name === 'radar-lang'))
const bad = await fire('command.run', { command: 'radar-lang', args: 'klingon' })
assert.match(bad.text, /\/radar-lang pt/)
await fire('command.run', { command: 'radar-lang', args: 'pt-BR' })
assert.equal(stored.get('language'), 'pt')
text = flat(await drawPane())
assert.match(text, /Atividades/)
assert.match(text, /Vida do cache/)
await findKey(await drawPane(), 'lang').onPress()
assert.equal(stored.get('language'), 'en')
assert.match(flat(await drawPane()), /Activities/)
await fire('command.run', { command: 'radar-lang', args: 'auto' })
assert.equal(stored.get('language'), 'auto')

// A stored language applies when the session starts
stored.set('language', 'pt')
await fire('session.start', {})
assert.match(flat(await drawPane()), /Atividades/)
await fire('command.run', { command: 'radar-lang', args: 'en' })

await fire('command.run', { command: 'radar-export' })
const after = JSON.parse(writes.at(-1).text)
assert.equal(after.turns[0].prompt, 'fix the login bug')
assert.equal(after.turns[0].calls, 6)
assert.equal(after.turns[0].fails, 2)
assert.equal(after.turns[1].calls, 1)
assert.ok(after.spans.filter((s) => s.kind !== 'api').every((s) => s.turn), 'every call has its activity')

console.log('session-radar: all checks passed')
