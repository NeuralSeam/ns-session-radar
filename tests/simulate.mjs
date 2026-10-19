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
const ignores = []
const notes = []
// What $.ui.notify answers: the bell by default, as a terminal with no notification sequence
let notifyAnswer = () => ({ isSent: true, channel: 'terminal_bell' })
const statuses = []
const stored = new Map()
// The session's state, held by Claude Code across reloads of the mod; a round trip through JSON too
const state = new Map()
const commands = []
const panes = []
let tick = () => {}
const $ = {
  ui: {
    invalidate() {},
    resolve: () => ({ Box: el('Box'), Text: el('Text'), Button: el('Button') }),
    toast: (m) => toasts.push(m),
    status: (text) => statuses.push(text),
    notify: async (text, options) => {
      notes.push({ text, ...options })
      return notifyAnswer()
    },
    open: async (pane) => {
      panes.push(['open', pane.id])
      return { isPlaced: true }
    },
    // As Claude Code does, closing a pane raises ui.close
    close: async ({ id }) => {
      panes.push(['close', id])
      await fire('ui.close', { id, origin: { kind: 'plugin' } })
    },
  },
  command: { register: async (c) => commands.push(c) },
  // A round trip through JSON, as the real store does
  store: {
    get: async (k) => (stored.has(k) ? JSON.parse(stored.get(k)) : undefined),
    set: async (k, v) => stored.set(k, JSON.stringify(v)),
    delete: async (k) => stored.delete(k),
  },
  state: {
    get: async (ref) => {
      const key = `${ref.plugin}.${ref.key}`
      return state.has(key) ? { value: JSON.parse(state.get(key)), version: 1 } : { value: undefined, version: 0 }
    },
    set: async (ref, value) => {
      state.set(`${ref.plugin}.${ref.key}`, JSON.stringify(value))
      return { isSet: true, version: 1 }
    },
  },
  clock: { every: (_ms, fn) => (tick = fn) },
  session: {
    id: async () => 'sim-session-1',
    model: async () => 'claude-opus-5-5',
    usage: async () => ({
      context: { tokens: 84000, window: 200000, percent: 42 },
      cost: 0.42,
      rateLimits: [
        { kind: 'five_hour', percentUsed: 31, resetsAt: new Date(Date.now() + 2 * 3600_000).toISOString() },
        { kind: 'seven_day', percentUsed: 18, resetsAt: new Date(Date.now() + 3 * 86400_000).toISOString() },
      ],
    }),
  },
  // The /config rows; the radar keeps only the effort's value
  config: { list: async () => [{ key: 'theme', value: 'dark' }, { key: 'effortLevel', label: 'Effort', value: 'high' }] },
  fs: {
    write: async (path, text) => (path.endsWith('/.gitignore') ? ignores : writes).push({ path, text }),
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

const realNowEarly = Date.now

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
const TAB_IDS = ['home', 'activities', 'insights', 'config']
const drawPane = (cols = 96) =>
  fire('ui.render', { component: 'Pane', requestId: 'session-radar', props: { bodyColumns: cols, scroll: { bodyRows: 24 } } }, async () => null)

// Every tab draws, and nothing is wider than the pane
for (const id of TAB_IDS) {
  findKey(await drawPane(), 'tab-' + id).onPress()
  for (const cols of [96, 60]) {
    const text = flat(await drawPane(cols))
    const widest = Math.max(...text.split('\n').filter((l) => !l.includes(': ')).map((l) => [...l].length))
    assert.ok(text.length > 0, `${id} drew nothing`)
    if (id === 'home') assert.ok(widest <= cols - 2, `${id} at ${cols} columns is ${widest} wide`)
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
assert.match(writes[0].path, /^\/work\/app\/\.claude\/session-radar\/session-radar-[\dT-]+Z\.json$/,
  'under the folder the session started in, not the current one')
assert.deepEqual(ignores, [{ path: '/work/app/.claude/session-radar/.gitignore', text: '*\n' }],
  'the export folder ignores itself')
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
// Hooks came after the 0.7 fields, and only after them
assert.deepEqual(Object.keys(data), ['tool', 'generator', 'exportedAt', 'startedAt', 'totals', 'turns', 'agents', 'spans', 'hooks'])

// The credit sits on the last line of every tab, in the pane's language, and only in the pane
const lastLine = async () => flat(await drawPane()).split('\n').at(-1)
await fire('command.run', { command: 'radar-lang', args: 'en' })
for (const id of TAB_IDS) {
  findKey(await drawPane(), 'tab-' + id).onPress()
  assert.equal(await lastLine(), `Session Radar · by Neural Seam · neuralseam.cloud · v${VERSION}`, `credit on ${id}`)
}
await fire('command.run', { command: 'radar-lang', args: 'pt' })
assert.equal(await lastLine(), `Session Radar · por Neural Seam · neuralseam.cloud · v${VERSION}`)
findKey(await drawPane(), 'tab-home').onPress()
assert.ok(!spin.props.suffix.includes('Neural Seam'), 'the spinner summary carries no credit')

// The checks below read English text, whatever the machine's language
await fire('command.run', { command: 'radar-lang', args: 'en' })

// Home: the model and its effort, the context, the tokens, the plan limits, then what each tab shows
findKey(await drawPane(), 'tab-home').onPress()
const home = flat(await drawPane())
assert.match(home, /Model\s+opus-5-5 · effort high/)
assert.match(home, /Context\s+█+░+ 42%  84\.0k of 200\.0k/)
assert.match(home, /Tokens\s+20\.5k in \(88% from cache\) · 1\.2k out · US\$ 0\.42/)
assert.match(home, /5h window\s+█+░+ 31%  resets at \d\d:\d\d/)
assert.match(home, /Weekly\s+█+░+ 18%  resets (Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d\d:\d\d/)
assert.ok(!home.includes('five_hour'), 'a limit is named, not shown by its id')
assert.match(home, /Where to look/)
assert.match(home, /2 Activities\s+1 activity · each prompt/)
assert.match(home, /3 Insights\s+.*off: turn on in 4/)
assert.match(home, /4 Config\s+notifications/)
// What only the browser shows, with how much there is
assert.match(home, /w Browser\s+6 calls, 2 requests · timeline, agents, tokens, memory/)
// The main session's cache, from the 1 hour TTL the request reported
assert.match(home, /Cache\s+expires in 59m\d\ds · if it expires: ~19\.7k tok rewritten/)
for (const gone of ['Timeline', 'Agents', 'Tokens']) {
  assert.ok(!findKey(await drawPane(), 'tab-' + gone.toLowerCase()), `${gone} is in the browser view only`)
}
// The status row keeps what tells at a glance how it goes; the breakdown is on Home
const statusRow = flat(findKey(await drawPane(), 'status'))
assert.match(statusRow, /1 activity · 6 tools · 2 failures$/)
assert.ok(!statusRow.includes('MCP'))
// The effort is left out when /config lists no such row
const realList = $.config.list
$.config.list = async () => [{ key: 'theme', value: 'dark' }]
Date.now = ((n) => () => n)(Date.now() + 10_000)
assert.match(flat(await drawPane()), /Model\s+opus-5-5\n/)
Date.now = realNowEarly
$.config.list = realList

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

// h explains every tab, above it, in lines that fit
findKey(await drawPane(), 'help').onPress()
const HELP_START = {
  home: 'The session at a glance', activities: 'Each prompt you send is one activity',
  insights: 'Fixed rules read this session', config: 'Enter or a click changes a line',
}
for (const id of TAB_IDS) {
  findKey(await drawPane(), 'tab-' + id).onPress()
  for (const cols of [96, 60]) {
    const lines = flat(await drawPane(cols)).split('\n')
    assert.ok(lines[4].startsWith(HELP_START[id]), `help on ${id}: ${lines[4]}`)
    const helpLines = lines.slice(4, lines.indexOf(' ', 4))
    assert.ok(helpLines.every((l) => [...l].length <= cols - 2), `${id}'s help fits ${cols} columns`)
  }
}
findKey(await drawPane(), 'help').onPress()
assert.ok(!flat(await drawPane()).includes(HELP_START.config), 'h again hides it')
findKey(await drawPane(), 'tab-home').onPress()

// Language: /radar-lang switches and remembers, the l key cycles, a bad argument explains itself
assert.ok(commands.some((c) => c.name === 'radar-lang'))
const bad = await fire('command.run', { command: 'radar-lang', args: 'klingon' })
assert.match(bad.text, /\/radar-lang pt/)
await fire('command.run', { command: 'radar-lang', args: 'pt-BR' })
assert.equal(storedJson('language'), 'pt')
text = flat(await drawPane())
assert.match(text, /Atividades/)
assert.match(text, /Cache\s+expira em/)
findKey(await drawPane(), 'tab-config').onPress()
await findKey(await drawPane(), 'cfg-language').onPress()
assert.equal(storedJson('language'), 'en')
assert.ok(!findKey(await drawPane(), 'lang'), 'the language moved from the action row to Config')
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

// Where the channel shows no text, the same text comes as a toast; where it does, or a hook of the
// person's answered for it, no toast
const settle = () => new Promise((r) => setImmediate(r))
await settle()
assert.equal(toasts.at(-1), notes[0].text, 'the bell rings without the text, so a toast shows it')
let noticeTurn = 0
const toastsFor = async (answer) => {
  notifyAnswer = answer
  const before = toasts.length
  const turnId = `tn${++noticeTurn}`
  await fire('turn.start', { turnId, text: 'x' })
  await fire('turn.complete', { turnId, durationMs: 45_000 })
  await settle()
  return toasts.slice(before).filter((t) => t.startsWith('#'))
}
assert.equal((await toastsFor(() => ({ isSent: true, channel: 'iterm2' }))).length, 0, 'a channel that shows the text is enough')
assert.equal((await toastsFor(() => ({ isSent: false, reason: 'no-channel' }))).length, 1, 'no channel: a toast')
assert.equal((await toastsFor(() => ({ isSent: false, reason: 'no-surface' }))).length, 1, 'no terminal: a toast')
assert.equal((await toastsFor(() => ({ isSent: false, reason: 'refused' }))).length, 0, 'a hook answered for it')
assert.equal((await toastsFor(() => Promise.reject(new Error('denied')))).length, 1, 'a failed write: a toast')
notifyAnswer = () => ({ isSent: true, channel: 'terminal_bell' })
notes.splice(1)
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
const toastsBefore = toasts.length
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
assert.match(auto[0].path, /^\/work\/app\/\.claude\/session-radar\/session-radar-[\dT-]+Z\.json$/)
assert.equal(ignores.length, 1, 'the .gitignore is written once per copy of the module')
assert.equal(auto[0].path, auto[1].path, 'the same conversation keeps its file')
const autoData = JSON.parse(auto[1].text)
assert.equal(autoData.turns.at(-1).prompt, 'run the suite')
assert.ok(autoData.turns.at(-1).end, 'the activity that just ended is in it, finished')
assert.ok(autoData.insights, 'with insights on, the saved file carries them like the export does')
assert.equal(toasts.slice(toastsBefore).filter((t) => t.includes(auto[0].path)).length, 0, 'saving is quiet')
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

// x asks first: a second press within 3 seconds clears, a late one only asks again
let drawn = await drawPane()
const activitiesNow = () => /(\d+) activit/.exec(flat(findKey(drawn, 'status')))?.[1]
const had = activitiesNow()
assert.notEqual(had, '0')
findKey(drawn, 'reset').onPress()
drawn = await drawPane()
assert.match(flat(findKey(drawn, 'actions')), /x: x again to clear/)
assert.equal(activitiesNow(), had, 'one press clears nothing')
at(4000)
drawn = await drawPane()
assert.match(flat(findKey(drawn, 'actions')), /x: Clear/)
findKey(drawn, 'reset').onPress()
drawn = await drawPane()
assert.equal(activitiesNow(), had, 'a press after the wait only asks again')
findKey(drawn, 'reset').onPress()
drawn = await drawPane()
assert.equal(activitiesNow(), '0')
Date.now = realNow

// Where the radar shows, as in DevTools: beside the transcript (the pane) or below it (the band
// above the prompt), with d in the radar or the Config row, kept for the next sessions
await fire('turn.start', { turnId: 'b1', text: 'look at the band' })
await fire('tool.call', { tool: 'Read', file_path: 'band.js' }, async () => ({}))
await fire('turn.complete', { turnId: 'b1', durationMs: 10 })
await fire('command.run', { command: 'radar-lang', args: 'en' })
// Rows as the terminal lays them out: a column stacks its children, a row sets them side by side
// and a border adds a row above and below
const rowsOf = (n) => (n == null || typeof n === 'string' || n.type !== 'Box' ? 1
  : (n.borderStyle ? 2 : 0) + (n.flexDirection === 'column' ? (n.children ?? []).reduce((r, c) => r + rowsOf(c), 0)
    : Math.max(1, ...(n.children ?? []).map(rowsOf))))
const drawBand = (cols, maxRows, extra = {}) =>
  fire('ui.render', { component: 'AbovePrompt', props: { bodyColumns: cols, maxRows, hasSurvey: false, ...extra } }, async () => 'engine band')
assert.equal(await drawBand(160, 12), 'engine band', 'the band is left alone while the radar is a pane')
assert.equal(storedJson('config').position, 'side', 'beside the transcript by default')
let pane = await drawPane()
assert.match(flat(findKey(pane, 'actions')), /d: Dock below/)
assert.equal(findKey(pane, 'close'), undefined, 'the pane has its own close mark')
panes.length = 0
await findKey(pane, 'dock').onPress()
assert.equal(storedJson('config').position, 'bottom')
assert.deepEqual(panes, [['close', 'session-radar']], 'the pane closes and nothing opens in its place')
for (const id of TAB_IDS) {
  for (const [cols, maxRows] of [[200, 12], [160, 9], [90, 8], [60, 6]]) {
    const band = await drawBand(cols, maxRows)
    findKey(band, 'tab-' + id).onPress()
    const drawn = await drawBand(cols, maxRows)
    const rows = rowsOf(drawn)
    const text = flat(drawn)
    assert.ok(text.length > 0, `band ${id} drew nothing`)
    // Config fits in two columns on a wide band of 10 rows or more; otherwise the band scrolls it
    if (id !== 'config' || (cols >= 130 && maxRows >= 10)) assert.ok(rows <= maxRows, `band ${id} at ${cols}x${maxRows} takes ${rows} rows`)
    assert.ok(!text.includes('    It also shows'), 'no notes below the transcript')
    if (PRINT && cols === 160) console.log(`──── band ${id} ${cols}x${maxRows}
${text}
`)
  }
}
let band = await drawBand(200, 12)
findKey(band, 'tab-home').onPress()
band = await drawBand(200, 12)
assert.ok(findKey(band, 'top'), 'tabs and actions share a row when both fit')
assert.ok(findKey(band, 'h-cols'), 'Home takes two columns on a wide band')
assert.match(flat(findKey(band, 'status')), /ctrl\+x tab for the keys/)
assert.match(flat(band), /Context/)
assert.doesNotMatch(flat(band), /Where to look/, 'the tab row already names the tabs')
// A frame in the badge's color sets the band apart from the transcript, when the rows allow it
const frame = findKey(band, 'frame')
assert.equal(frame.borderStyle, 'round')
assert.match(frame.borderColor, /^(cyan|magenta|blue|green)$/)
assert.equal(findKey(await drawBand(60, 7), 'frame'), undefined, 'a band of 7 rows keeps them for the radar')
band = await drawBand(90, 8)
assert.ok(!findKey(band, 'top') && findKey(band, 'tabs'), 'a narrow band puts them on two rows')
assert.ok(!findKey(band, 'h-cols'), 'and Home in one column')
assert.equal(await drawBand(200, 12, { hasSurvey: true }), 'engine band', 'a survey has the band first')
findKey(band, 'tab-config').onPress()
assert.ok(findKey(await drawBand(200, 12), 'cfg-cols'), 'Config takes two columns on a wide band')
assert.match(flat(await drawPane()), /Radar position: below/)
findKey(band, 'tab-home').onPress()
// q closes it, /radar opens it again below, without a pane
await findKey(band, 'close').onPress()
assert.equal(await drawBand(200, 12), 'engine band')
panes.length = 0
await fire('command.run', { command: 'radar' })
assert.deepEqual(panes, [])
assert.notEqual(await drawBand(200, 12), 'engine band')
// The Config row switches back beside the transcript: the pane opens, the band is left alone
findKey(await drawBand(200, 12), 'tab-config').onPress()
await findKey(await drawBand(200, 12), 'cfg-position').onPress()
assert.equal(storedJson('config').position, 'side')
assert.deepEqual(panes, [['open', 'session-radar']])
assert.equal(await drawBand(200, 12), 'engine band')
assert.match(flat(await drawPane()), /Radar position: side/)
findKey(await drawPane(), 'tab-home').onPress()
await fire('command.run', { command: 'radar' })

// A reload of the mod (an update, /reload-plugins, a hot reload) carries on from what the session
// recorded: a fresh copy of the module reads it back from the session's state on its first start
await fire('turn.start', { turnId: 'r1', text: 'before the reload' })
await fire('tool.call', { tool: 'Read', file_path: 'a.js' }, async () => ({}))
await fire('turn.complete', { turnId: 'r1', durationMs: 10 })
assert.equal(JSON.parse(state.get('session-radar.session')).S.turns.at(-1).prompt, 'before the reload',
  'the activity is handed over as it ends')
// A call still running when the old copy goes away, written by the clock once SAVE_MS has passed
void fire('tool.call', { tool: 'Bash', command: 'sleep 99' }, () => new Promise(() => {}))
at(2500)
tick()
await sleep(5)
Date.now = realNow
await fire('command.run', { command: 'radar-export' })
const beforeReload = JSON.parse(writes.at(-1).text)

const reloaded = []
const copy = await import('../hooks/register.js?reload')
copy.register((name, a, b) => reloaded.push({ name, matcher: b ? a : null, fn: b ?? a }))
const fireCopy = (name, ev, next = async (e) => e) =>
  reloaded.find((x) => x.name === name && matches(x, ev)).fn($, ev, next)
await fireCopy('session.start', { cwd: '/work/app/src' })
const writesBefore = writes.length
await fireCopy('command.run', { command: 'radar-export' })
assert.equal(writes.length, writesBefore + 1)
assert.match(writes.at(-1).path, /^\/work\/app\/\.claude\/session-radar\//, 'a reload after a cd keeps the folder the session started in')
const afterReload = JSON.parse(writes.at(-1).text)
assert.equal(afterReload.startedAt, beforeReload.startedAt, 'the same conversation, not a new one')
assert.deepEqual(afterReload.totals, beforeReload.totals, 'nothing recorded is lost')
assert.deepEqual(afterReload.turns, beforeReload.turns)
assert.equal(afterReload.spans.length, beforeReload.spans.length)
const cut = afterReload.spans.find((s) => s.label === 'sleep 99')
assert.equal(cut.status, 'interrupted', 'a call the old copy never saw end is closed, not left running')
assert.ok(cut.end)
// New events go on from there, with ids that do not collide
await fireCopy('turn.start', { turnId: 'r2', text: 'after the reload' })
await fireCopy('tool.call', { tool: 'Grep', pattern: 'x' }, async () => ({}))
await fireCopy('turn.complete', { turnId: 'r2', durationMs: 10 })
await fireCopy('command.run', { command: 'radar-export' })
const carried = JSON.parse(writes.at(-1).text)
assert.equal(carried.turns.length, beforeReload.turns.length + 1)
assert.equal(carried.totals.calls, beforeReload.totals.calls + 1)
assert.equal(new Set(carried.spans.map((s) => s.id)).size, carried.spans.length, 'span ids stay unique')
// /clear starts over, and a reload after it does not bring the old conversation back
await fireCopy('session.end', { reason: 'clear' })
const third = []
;(await import('../hooks/register.js?reload2')).register((name, a, b) => third.push({ name, matcher: b ? a : null, fn: b ?? a }))
const fireThird = (name, ev, next = async (e) => e) => third.find((x) => x.name === name && matches(x, ev)).fn($, ev, next)
await fireThird('session.start', { cwd: '/work/app' })
await fireThird('command.run', { command: 'radar-export' })
assert.equal(JSON.parse(writes.at(-1).text).turns.length, 0)

// ---------------------------------------------------------------------------
// Hooks: every classic hook event, with how long the hooks beneath took and what they answered
// ---------------------------------------------------------------------------

const glob = third.find((x) => x.name === 'classic.*')
assert.ok(glob, 'one hook on every classic event')
// As the engine runs a glob hook: next.event names the event, next(e) runs the hooks beneath
const classic = (event, ev, answer = {}) => glob.fn($, ev, Object.assign(async () => {
  await sleep(2)
  if (answer instanceof Error) throw answer
  return answer
}, { event: `classic.${event}` }))
const ctx = { session_id: 'sim-session-1', transcript_path: '/home/u/.claude/projects/x/sim-session-1.jsonl', cwd: '/work/app' }

const started = await classic('SessionStart', { ...ctx, hook_event_name: 'SessionStart', source: 'startup', session_title: 'Fix the login' },
  { additionalContext: ['Open http://localhost:7777/setup', 'second note'] })
assert.deepEqual(started.additionalContext, ['Open http://localhost:7777/setup', 'second note'], 'the answer is handed on as it came')
// The prompt's hook runs before its activity starts, and joins it once it does
await classic('UserPromptSubmit', { ...ctx, hook_event_name: 'UserPromptSubmit', prompt: 'the secret prompt text', source: 'user', session_title: 'Fix the login' })
await fireThird('turn.start', { turnId: 'h1', text: 'the secret prompt text' })
const denied = await classic('PreToolUse', { tool: 'Bash', command: 'rm -rf /tmp/x', tool_use_id: 'tu1' }, { deny: 'blocked by policy' })
assert.equal(denied.deny, 'blocked by policy')
await classic('PostToolUse', { ...ctx, hook_event_name: 'PostToolUse', tool_name: 'mcp__github__search_issues', tool_input: { query: 'auth bug' }, tool_response: { huge: 'x'.repeat(5000) } })
for (let i = 0; i < 3; i++) await classic('MessageDisplay', { ...ctx, hook_event_name: 'MessageDisplay', turn_id: 'h1', message_id: 'm1', index: i, final: i === 2, delta: 'private words' })
await classic('Stop', { ...ctx, hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'private answer' }, { block: 'tests are failing' })
await assert.rejects(classic('PostToolBatch', { ...ctx, hook_event_name: 'PostToolBatch', tool_calls: [{}, {}] }, new Error('hook crashed')), /hook crashed/)
await fireThird('turn.complete', { turnId: 'h1', durationMs: 50 })
await classic('Notification', { ...ctx, hook_event_name: 'Notification', notification_type: 'idle_prompt', message: 'Claude is waiting for your input' })
await fireThird('command.run', { command: 'radar-export' })
const hooked = JSON.parse(writes.at(-1).text)
const byEvent = (ev) => hooked.hooks.filter((hk) => hk.event === ev)
assert.equal(hooked.totals.hooks, 8, 'one record per event, the message pieces in one')
assert.equal(hooked.totals.hookBlocks, 2)
const [ss] = byEvent('SessionStart')
assert.equal(ss.label, 'startup')
assert.equal(ss.turn, null, 'before any activity')
assert.deepEqual(ss.out.ctx, ['Open http://localhost:7777/setup', 'second note'])
assert.ok(ss.end >= ss.start && ss.status === 'ok')
const turn = hooked.turns.find((x) => x.id === 'h1')
const [ups] = byEvent('UserPromptSubmit')
assert.equal(ups.turn, 'h1', 'the prompt hook belongs to the activity it started')
assert.equal(ups.pending, undefined)
const [pre] = byEvent('PreToolUse')
assert.deepEqual([pre.tool, pre.label, pre.status, pre.out.decision, pre.out.reason], ['Bash', 'rm -rf /tmp/x', 'blocked', 'deny', 'blocked by policy'])
assert.equal(pre.turn, 'h1')
const [post] = byEvent('PostToolUse')
assert.deepEqual([post.tool, post.label, post.status], ['github·search_issues', 'auth bug', 'ok'])
const [shown] = byEvent('MessageDisplay')
assert.equal(shown.pieces, 3)
assert.equal(byEvent('Stop')[0].status, 'blocked')
assert.equal(byEvent('Stop')[0].out.block, 'tests are failing')
assert.equal(byEvent('PostToolBatch')[0].status, 'error', 'a hook that failed')
assert.equal(byEvent('PostToolBatch')[0].label, '2 calls')
assert.equal(byEvent('Notification')[0].turn, null, 'after the activity ended')
assert.equal(byEvent('Notification')[0].label, 'idle_prompt: Claude is waiting for your input')
assert.equal(turn.hooks, 6)
const kept2 = JSON.stringify(hooked.hooks)
for (const words of ['secret prompt', 'private words', 'private answer', 'xxxxxxxxxx']) {
  assert.ok(!kept2.includes(words), `the hooks keep no "${words}"`)
}
// The title Claude Code gave the session is kept for the browser view, and across a reload
assert.equal(JSON.parse(state.get('session-radar.session')).title, 'Fix the login')

console.log('session-radar: all checks passed')
