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
import { readFileSync } from 'node:fs'
import { register } from '../hooks/register.js'

// The release the credit line names, the one the manifests declare
const manifest = (name) => JSON.parse(readFileSync(new URL(`../.claude-plugin/${name}`, import.meta.url), 'utf8'))
const VERSION = manifest('plugin.json').version
assert.equal(manifest('marketplace.json').plugins[0].version, VERSION, 'plugin.json and marketplace.json agree')

const PRINT = process.argv.includes('--print')
const hooks = []
register((name, a, b) => hooks.push({ name, matcher: b ? a : null, fn: b ?? a }))

const el = (type) => (props) => ({ type, ...props })
const toasts = []
const writes = []
const notes = []
const statuses = []
const stored = new Map()
const commands = []
let tick = () => {}
const $ = {
  ui: {
    invalidate() {},
    resolve: () => ({ Box: el('Box'), Text: el('Text'), Button: el('Button') }),
    toast: (m) => toasts.push(m),
    status: (text) => statuses.push(text),
    notify: async (text, options) => {
      notes.push({ text, ...options })
      return { isSent: true, channel: 'terminal_bell' }
    },
    open: async () => ({ isPlaced: true }),
    close: async () => {},
  },
  command: { register: async (c) => commands.push(c) },
  // A round trip through JSON, as the real store does
  store: {
    get: async (k) => (stored.has(k) ? JSON.parse(stored.get(k)) : undefined),
    set: async (k, v) => stored.set(k, JSON.stringify(v)),
    delete: async (k) => stored.delete(k),
  },
  clock: { every: (_ms, fn) => (tick = fn) },
  session: {
    id: async () => 'sim-session-1',
    usage: async () => ({ context: { tokens: 84000, window: 200000, percent: 42 }, cost: 0.42, rateLimits: [] }),
  },
  fs: {
    write: async (path, text) => writes.push({ path, text }),
    read: async (path) => {
      if (path === '.mcp.json') return JSON.stringify({ mcpServers: { github: {}, jira: { env: { TOKEN: 'secret' } } } })
      throw new Error('ENOENT')
    },
  },
}
const storedJson = (k) => (stored.has(k) ? JSON.parse(stored.get(k)) : undefined)

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
await fire('session.start', { cwd: '/work/app' })
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
const TAB_IDS = ['timeline', 'activities', 'agents', 'api', 'summary', 'insights', 'config']
const drawPane = (cols = 96) =>
  fire('ui.render', { component: 'Pane', requestId: 'session-radar', props: { bodyColumns: cols, scroll: { bodyRows: 24 } } }, async () => null)

// Every tab draws, and nothing is wider than the pane
for (const id of TAB_IDS) {
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
for (const id of TAB_IDS) {
  findKey(await drawPane(), 'tab-' + id).onPress()
  assert.equal(await lastLine(), `Session Radar · by Neural Seam · neuralseam.cloud · v${VERSION}`, `credit on ${id}`)
}
await fire('command.run', { command: 'radar-lang', args: 'pt' })
assert.equal(await lastLine(), `Session Radar · por Neural Seam · neuralseam.cloud · v${VERSION}`)
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
assert.equal(storedJson('language'), 'pt')
text = flat(await drawPane())
assert.match(text, /Atividades/)
assert.match(text, /Vida do cache/)
await findKey(await drawPane(), 'lang').onPress()
assert.equal(storedJson('language'), 'en')
assert.match(flat(await drawPane()), /Activities/)
await fire('command.run', { command: 'radar-lang', args: 'auto' })
assert.equal(storedJson('language'), 'auto')

// A stored language applies when the session starts
stored.set('language', JSON.stringify('pt'))
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

// Settings: everything that notifies or keeps data starts off; /radar-config opens on the Config tab
assert.ok(commands.some((c) => c.name === 'radar-config'))
assert.equal(after.insights, undefined, 'no insights in the export while they are off')
await fire('command.run', { command: 'radar-config' })
text = flat(await drawPane())
assert.match(text, /\[ \] Notify when an activity ends/)
assert.match(text, /\[ \] Insights/)
const press = async (key) => findKey(await drawPane(), key).onPress()

// A long activity notifies, a short one does not, and neither says what the prompt was
await fire('turn.start', { turnId: 't3', text: 'deploy with password hunter2' })
await fire('turn.complete', { turnId: 't3', durationMs: 45_000 })
assert.equal(notes.length, 0, 'nothing notifies while the setting is off')
await press('cfg-notifyDone')
assert.equal(storedJson('config').notifyDone, true)
await fire('turn.start', { turnId: 't4', text: 'deploy with password hunter2' })
await fire('turn.complete', { turnId: 't4', durationMs: 45_000 })
await fire('turn.start', { turnId: 't5', text: 'quick one' })
await fire('turn.complete', { turnId: 't5', durationMs: 2_000 })
assert.equal(notes.length, 1, 'only the activity over the minimum notifies')
assert.match(notes[0].text, /^#4 done · 45\.0s · 0 tools/)
assert.ok(!notes.some((n) => /hunter2|deploy/.test(n.text)), 'a notification never carries the prompt')
await press('cfg-notifyDoneMin')
assert.equal(storedJson('config').notifyDoneMin, 60)
await press('cfg-notifyDone')

// The cache warning: once per cache entry, only while nothing runs, only when turned on
const realNow = Date.now
const at = (ms) => (Date.now = () => realNow() + ms)
const lastCacheUse = 60 * 60_000 - 50_000 // the main loop's TTL is 1 hour: 50 seconds left
at(lastCacheUse)
tick()
assert.equal(notes.length, 1, 'no cache warning while the setting is off')
await press('cfg-notifyCache')
await fire('turn.start', { turnId: 't6', text: 'still working' })
tick()
assert.equal(notes.length, 1, 'no cache warning while an activity runs')
await fire('turn.complete', { turnId: 't6', durationMs: 10 })
tick()
assert.equal(notes.length, 2)
assert.match(notes[1].text, /cache expires in 50\.0s/)
assert.ok(!notes[1].text.includes('assumed'), 'the TTL was reported, so it is not assumed')
tick()
assert.equal(notes.length, 2, 'one warning per cache entry')
Date.now = realNow
await press('cfg-notifyCache')

// Insights: off until turned on; then findings, the AI hint, and marks that are kept
findKey(await drawPane(), 'tab-insights').onPress()
assert.match(flat(await drawPane()), /Insights are off/)
for (let i = 0; i < 2; i++) {
  await fire('tool.call', { tool: 'Bash', command: 'git push --force origin main' }, async () => ({ deny: 'no' }))
}
findKey(await drawPane(), 'tab-config').onPress()
await press('cfg-insights')
await press('cfg-aiHint')
assert.equal(storedJson('config').insights, true)
findKey(await drawPane(), 'tab-insights').onPress()
text = flat(await drawPane())
assert.match(text, /Bash\(git push:\*\) denied 3×/)
assert.match(text, /permissions\.deny/)
assert.match(text, /\/session-radar:radar-review/)
for (const cols of [96, 60]) {
  const lines = flat(await drawPane(cols)).split('\n').filter((l) => !l.includes(': mark') && !/^\d: /.test(l))
  assert.ok(lines.every((l) => [...l].length <= cols), `insights fit ${cols} columns`)
}
await press('apply-0')
assert.equal(storedJson('history').applied['/work/app'][0].rule, 'denied-repeated')
assert.match(flat(await drawPane()), /applied ✓/)
if (PRINT) console.log(`──── insights\n${flat(await drawPane())}\n`)

// The export adds the insights after the existing fields, and the history keeps counts, no text
await fire('command.run', { command: 'radar-export' })
const withInsights = JSON.parse(writes.at(-1).text)
assert.deepEqual(Object.keys(withInsights).slice(0, 8), ['tool', 'generator', 'exportedAt', 'startedAt', 'totals', 'turns', 'agents', 'spans'])
assert.equal(Object.keys(withInsights).at(-1), 'insights')
assert.ok(withInsights.insights.findings.some((f) => f.rule === 'denied-repeated' && f.data.safety === 'never'))
assert.deepEqual(withInsights.insights.mcpConfigured, ['github', 'jira'])
assert.ok(!JSON.stringify(withInsights.insights).includes('secret'), 'only the server names are kept from .mcp.json')
await fire('session.end', { reason: 'clear' })
const history = storedJson('history')
assert.equal(history.projects['/work/app'].sessions.length, 1)
const kept = JSON.stringify(history)
for (const words of ['login', 'hunter2', 'example.com', 'origin main']) {
  assert.ok(!kept.includes(words), `the history does not keep "${words}"`)
}
assert.equal(history.projects['/work/app'].sessions[0].denied, 3)

// A later session sees the earlier one, and the comparison waits for a session after the mark
await fire('turn.start', { turnId: 'n1', text: 'next session' })
await fire('turn.complete', { turnId: 'n1', durationMs: 10 })
findKey(await drawPane(), 'tab-insights').onPress()
text = flat(await drawPane())
assert.match(text, /History: 1 earlier session of this project/)
assert.match(text, /Denials: /)
if (PRINT) console.log(`──── insights, next session\n${text}\n`)

// The badge: off the prompt by default, there when the setting is on, gone when it is off again
findKey(await drawPane(), 'tab-config').onPress()
const code = /([●■▲★] [2-9A-Z]{4})/.exec(flat(findKey(await drawPane(), 'status')))?.[1]
assert.ok(code, 'the pane status row leads with the badge')
assert.ok(flat(await drawPane()).includes(`[ ] Always show this session's badge (${code})`))
await press('cfg-badge')
assert.equal(storedJson('config').badge, true)
assert.equal(statuses.at(-1), code.replace(' ', ' radar '))
await fire('session.start', { cwd: '/work/app' })
assert.equal(statuses.at(-1), code.replace(' ', ' radar '), 'the same session keeps its badge')
await press('cfg-badge')
assert.equal(statuses.at(-1), undefined)

// Saving the export after each activity: off by default; on, one file per conversation, rewritten
// with the whole conversation each time, and in the background, so a turn never waits for it
const autoOf = (from) => writes.slice(from)
let before = writes.length
assert.match(flat(await drawPane()), /\[ \] Save the export automatically when an activity ends/)
await fire('turn.start', { turnId: 'x1', text: 'refactor the parser' })
await fire('turn.complete', { turnId: 'x1', durationMs: 10 })
await sleep(5)
assert.equal(writes.length, before, 'nothing is saved while the setting is off')
await press('cfg-autoExport')
assert.equal(storedJson('config').autoExport, true)
assert.match(flat(await drawPane()), /\[x\] Save the export automatically/)
await fire('turn.start', { turnId: 'x2', text: 'add a test for the parser' })
await fire('turn.complete', { turnId: 'x2', durationMs: 10 })
await sleep(5)
await fire('turn.start', { turnId: 'x3', text: 'run the suite' })
await fire('turn.complete', { turnId: 'x3', durationMs: 10 })
await sleep(5)
const auto = autoOf(before)
assert.equal(auto.length, 2, 'one write per activity')
assert.match(auto[0].path, /^session-radar-[\dT-]+Z\.json$/)
assert.equal(auto[0].path, auto[1].path, 'the same conversation keeps its file')
const autoData = JSON.parse(auto[1].text)
assert.equal(autoData.turns.at(-1).prompt, 'run the suite')
assert.ok(autoData.turns.at(-1).end, 'the activity that just ended is in it, finished')
assert.ok(autoData.insights, 'with insights on, the saved file carries them like the export does')
assert.equal(toasts.filter((t) => t.includes(auto[0].path)).length, 0, 'saving is quiet')
// A new conversation gets a new file
await sleep(5)
await fire('session.end', { reason: 'clear' })
await fire('turn.start', { turnId: 'y1', text: 'something else' })
await fire('turn.complete', { turnId: 'y1', durationMs: 10 })
await sleep(5)
assert.notEqual(writes.at(-1).path, auto[0].path)
assert.equal(JSON.parse(writes.at(-1).text).turns.length, 1)
await press('cfg-autoExport')
before = writes.length
await fire('turn.start', { turnId: 'y2', text: 'one more' })
await fire('turn.complete', { turnId: 'y2', durationMs: 10 })
await sleep(5)
assert.equal(writes.length, before, 'turned off, it stops saving')

// Deleting the history takes the key out of the store
findKey(await drawPane(), 'tab-config').onPress()
await press('cfg-clearHistory')
assert.equal(stored.has('history'), false)
assert.ok(toasts.includes('History deleted.'))
if (PRINT) console.log(`──── config\n${flat(await drawPane())}\n`)

console.log('session-radar: all checks passed')
