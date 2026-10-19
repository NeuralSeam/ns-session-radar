// Copyright 2026 Neural Seam
// SPDX-License-Identifier: Apache-2.0

// The web view, end to end against a fake Claude Code: the mod starts web/server.mjs as a real child
// process, sends it snapshots over loopback, and stops it. Then the server's own guards, and the
// mod without Node on the PATH.
//
//   node tests/web.mjs

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import http from 'node:http'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { register } from '../hooks/register.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER = path.join(ROOT, 'web', 'server.mjs')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// A Windows working directory, with its trailing separator
const WIN_CWD = ['C:', 'work', 'my-app', ''].join(String.fromCharCode(92))
// The hub file every session reads, in a folder of the test's own
const HUB_DIR = mkdtempSync(path.join(os.tmpdir(), 'radar-hub-'))
const HUB = path.join(HUB_DIR, 'hub.json')
const readHubFile = () => JSON.parse(readFileSync(HUB, 'utf8'))

const hooks = []
register((name, a, b) => hooks.push({ name, matcher: b ? a : null, fn: b ?? a }))

// $.process.spawn as the engine describes it: the loop is the child's life, return() kills it
const children = []
function spawnStream({ argv, cwd, env }) {
  const child = spawn(argv[0], argv.slice(1), { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  const queue = []
  let wake = null
  let done = null
  const push = (item) => {
    queue.push(item)
    wake?.()
  }
  child.stdout.on('data', (b) => push({ stream: 'stdout', text: b.toString() }))
  child.stderr.on('data', (b) => push({ stream: 'stderr', text: b.toString() }))
  child.on('error', (err) => push({ error: err }))
  child.on('exit', (code, signal) => {
    done = { code, signal }
    wake?.()
  })
  return (async function* () {
    try {
      while (true) {
        if (queue.length) {
          const item = queue.shift()
          if (item.error) throw item.error
          yield item
        } else if (done) {
          return done
        } else {
          await new Promise((r) => (wake = r))
          wake = null
        }
      }
    } finally {
      if (!done) child.kill()
    }
  })()
}

const opened = []
const toasts = []
const statuses = []
const timers = []
let spawnImpl = spawnStream
const $ = {
  plugin: { name: 'session-radar', root: ROOT },
  ui: {
    invalidate() {},
    resolve: () => ({ Box: (p) => ({ type: 'Box', ...p }), Text: (p) => ({ type: 'Text', ...p }), Button: (p) => ({ type: 'Button', ...p }), Link: (p) => ({ type: 'Link', ...p }) }),
    toast: (m) => toasts.push(m),
    status: (text) => statuses.push(text),
    open: async () => ({ isPlaced: true }),
    close: async () => {},
  },
  command: { register: async () => {} },
  store: { get: async () => 'en', set: async () => {} },
  clock: {
    every(ms, fn) {
      const id = setInterval(fn, ms)
      timers.push(id)
      return { cancel: () => clearInterval(id) }
    },
    after(ms, fn) {
      const id = setTimeout(fn, ms)
      return { cancel: () => clearTimeout(id) }
    },
  },
  session: {
    id: async () => 'b1f4c2d0-session-under-test',
    model: async () => 'claude-sonnet-5-5',
    usage: async () => ({ context: { tokens: 50000, window: 200000, percent: 25 }, cost: { usd: 0.12 }, rateLimits: [] }),
  },
  config: { list: async () => [{ key: 'effortLevel', value: 'medium' }] },
  env: { get: async (name) => (name === 'SESSION_RADAR_HUB' ? HUB : process.env[name]) },
  fs: { read: (p) => readFile(p, 'utf8') },
  process: {
    spawn: (req) => spawnImpl(req),
    run: async (argv) => {
      opened.push(argv)
      return { exitCode: 0, stdout: '', stderr: '' }
    },
  },
  http: {
    fetch: async (url, init = {}) => {
      const res = await fetch(url, { method: init.method, headers: init.headers, body: init.body })
      return { status: res.status, ok: res.ok, headers: Object.fromEntries(res.headers), text: await res.text() }
    },
  },
}

const matches = (h, ev) => !h.matcher || Object.entries(h.matcher).every(([k, v]) => ev[k] === v)
const fire = (name, ev, next = async (e) => e) => {
  const h = hooks.find((x) => x.name === name && matches(x, ev))
  assert.ok(h, `no hook for ${name}`)
  return h.fn($, ev, next)
}
const drawPane = () => fire('ui.render', { component: 'Pane', requestId: 'session-radar', props: { bodyColumns: 96, scroll: { bodyRows: 24 } } }, async () => null)
const findKey = (n, key) => (n?.key === key ? n : (n?.children ?? []).map((c) => findKey(c, key)).find(Boolean))
const findType = (n, type) => (n?.type === type ? n : (n?.children ?? []).map((c) => (typeof c === 'object' ? findType(c, type) : null)).find(Boolean))

// A raw request, so Host and Origin can be set to what a browser on another site would send
function raw(port, { method = 'GET', path: p = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      let text = ''
      res.on('data', (c) => (text += c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function waitFor(check, ms = 5000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (await check()) return true
    await sleep(50)
  }
  return false
}

const exited = (child) => child.exitCode !== null || child.signalCode !== null

// Reads the page's event stream until `enough(frames)` holds, or 6 seconds pass
function events(port, token, enough) {
  return new Promise((resolve) => {
    const frames = []
    const req = http.request({ host: '127.0.0.1', port, path: `/api/events?t=${token}`, headers: { host: `127.0.0.1:${port}` } }, (res) => {
      let buf = ''
      res.on('data', (chunk) => {
        buf += chunk
        let i
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i)
          buf = buf.slice(i + 2)
          const ev = /^event: (\w+)$/m.exec(block)?.[1]
          if (ev) frames.push({ ev, data: JSON.parse(/^data: (.*)$/m.exec(block)[1]) })
        }
        if (enough(frames)) {
          req.destroy()
          resolve(frames)
        }
      })
    })
    req.on('error', () => resolve(frames))
    req.end()
    setTimeout(() => {
      req.destroy()
      resolve(frames)
    }, 6000)
  })
}

// ---------------------------------------------------------------------------
// The mod: /radar-web starts the server, sends what it collected, /radar-web stop ends it
// ---------------------------------------------------------------------------

await fire('session.start', { cwd: WIN_CWD })
assert.equal(statuses.at(-1), undefined, 'no badge under the prompt until the browser view runs')
await fire('turn.start', { turnId: 't1', text: 'check the web view' })
await fire('tool.call', { tool: 'Bash', command: 'npm test' }, async () => ({}))
await fire('tool.call', { tool: 'mcp__github__search_issues', query: 'radar' }, async () => ({ isError: true }))
await fire('turn.complete', { turnId: 't1', durationMs: 50 })

const reply = await fire('command.run', { command: 'radar-web', args: '' })
const url = /http:\/\/127\.0\.0\.1:(\d+)\/\?t=([\w-]+)/.exec(reply.text)
assert.ok(url, `the reply names the page: ${reply.text}`)
const port = Number(url[1])
const viewToken = url[2]
assert.equal(opened.length, 1, 'the browser is asked to open the page')
assert.equal(opened[0].at(-1), url[0])

// The pane offers the link once the server is up
const link = findType(await drawPane(), 'Link')
assert.equal(link?.href, url[0])
assert.ok(findKey(await drawPane(), 'web'), 'the pane has the Web button')

// Below the transcript the band keeps the Web button but not the address, which takes too much room
await findKey(await drawPane(), 'dock').onPress()
await fire('command.run', { command: 'radar', args: '' })
const drawBand = () => fire('ui.render', { component: 'AbovePrompt', props: { bodyColumns: 160, maxRows: 12, hasSurvey: false } }, async () => null)
assert.ok(findKey(await drawBand(), 'web'), 'the band has the Web button')
assert.equal(findType(await drawBand(), 'Link'), undefined, 'no address in the band')
await findKey(await drawBand(), 'dock').onPress()
assert.equal(findType(await drawPane(), 'Link')?.href, url[0], 'the pane has it again')

// The snapshot arrives with the session's numbers and the usage
// One entry per session that sends: this one alone so far
const sessionsAt = async (p = port) => JSON.parse((await raw(p, { path: `/api/state?t=${viewToken}`, headers: { host: `127.0.0.1:${p}` } })).text).sessions
const readState = async () => (await sessionsAt()).find((s) => s.key === 'b1f4c2d0-session-under-test')?.snapshot
assert.ok(await waitFor(async () => (await sessionsAt()).length === 1))
let state = await readState()
assert.equal((await sessionsAt())[0].alive, true)
assert.equal(state.totals.calls, 2)
assert.equal(state.totals.mcp, 1)
assert.equal(state.totals.errors, 1)
assert.equal(state.turns[0].prompt, 'check the web view')
assert.equal(state.usage.context.percent, 25)
assert.equal(state.usage.costUsd, 0.12)
assert.equal(state.lang, 'en')
assert.ok(typeof state.now === 'number')

// The session's badge: the same code in the reply, under the prompt, in the pane and on the page
const badge = state.session
assert.match(badge.code, /^[2-9A-HJKMNP-TV-Z]{4}$/)
assert.ok(['●', '■', '▲', '★'].includes(badge.mark))
assert.ok(['cyan', 'magenta', 'blue', 'green'].includes(badge.color))
assert.equal(badge.project, 'my-app', 'the folder name, from a Windows path')
assert.equal(badge.cwd, WIN_CWD)
assert.equal(badge.model, 'sonnet-5-5')
// Only the effort's value from the /config rows; insights are off, so the page gets none of them
assert.equal(badge.effort, 'medium')
assert.equal(badge.key, 'b1f4c2d0-session-under-test', 'the session id names it on the shared page')
// Where it listens and its tokens are in the hub file, for the other sessions
const hub = readHubFile()
assert.deepEqual([hub.port, hub.viewToken, hub.stopped], [port, viewToken, undefined])
assert.ok(/^[\w-]{32}$/.test(hub.ingestToken) && hub.ingestToken !== viewToken)
assert.equal(state.insightsView, null)
assert.deepEqual(state.notices, [], 'no notifications while they are off')
// The release, for the page's footer
const { version } = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')))
assert.equal(state.version, version)
assert.ok(reply.text.includes(`${badge.mark} ${badge.code}`), 'the reply names the badge')
assert.equal(statuses.at(-1), `${badge.mark} radar ${badge.code}`, 'the badge shows under the prompt while the view runs')
const flatText = (n) => (n == null ? '' : typeof n === 'string' ? n : n.type === 'Text' ? n.children.join('') : (n.children ?? []).map(flatText).join(' '))
assert.ok(flatText(findKey(await drawPane(), 'status')).startsWith(`${badge.mark} ${badge.code}`), 'the pane leads with the badge')
// The same session id always gives the same badge; another session gets another
await fire('session.start', { cwd: WIN_CWD })
assert.equal(statuses.at(-1), `${badge.mark} radar ${badge.code}`, 'stable across a reload')
assert.deepEqual(Object.keys(state).slice(0, 8), ['tool', 'generator', 'exportedAt', 'startedAt', 'totals', 'turns', 'agents', 'spans'])

// A new call reaches the page within a push or two
await fire('tool.call', { tool: 'Read', file_path: 'README.md' }, async () => ({}))
assert.ok(await waitFor(async () => {
  state = await readState()
  return state.totals.calls === 3
}, 3000), 'live update')

// The machine's memory: the samples so far on connecting, then a new one every couple of seconds
const systemFrames = (frames) => frames.filter((f) => f.ev === 'system')
const frames = await events(port, viewToken, (fs) => systemFrames(fs).length >= 2)
const [first, next] = systemFrames(frames)
assert.ok(first?.data.memory.length >= 1, 'the history comes on connecting')
assert.ok(next?.data.memory.length === 1, 'then one sample at a time')
for (const m of [...first.data.memory, ...next.data.memory]) {
  assert.ok(m.total > 0 && m.free >= 0 && m.free <= m.total, `a sane sample: ${JSON.stringify(m)}`)
}
assert.ok(next.data.memory[0].at > first.data.memory.at(-1).at, 'samples move forward')
assert.ok(frames.findIndex((f) => f.ev === 'state') < frames.findIndex((f) => f.ev === 'system'), 'the snapshot comes first')

// With insights on, the page gets them read-only, with the texts already in the pane's language
for (let i = 0; i < 2; i++) await fire('tool.call', { tool: 'Bash', command: 'git push --force' }, async () => ({ deny: 'no' }))
findKey(await drawPane(), 'tab-config').onPress()
await findKey(await drawPane(), 'cfg-insights').onPress()
assert.ok(await waitFor(async () => {
  state = await readState()
  return state.insightsView?.findings?.length > 0
}, 3000), 'the findings reach the page')
const denial = state.insightsView.findings.find((f) => f.rule === 'denied-repeated')
assert.match(denial.title, /denied 2×/)
assert.match(denial.hint, /permissions\.deny/)
assert.equal(denial.applied, false)
assert.deepEqual(state.insightsView.trends, [])
assert.equal(state.insightsView.aiHint, null)

// A notification reaches the page too, numbers only, for it to show as a toast or the browser's own.
// This Claude Code has no notification channel, so the terminal gets a toast
await findKey(await drawPane(), 'cfg-notifyDone').onPress()
await fire('turn.start', { turnId: 't2', text: 'secret prompt' })
await fire('turn.complete', { turnId: 't2', durationMs: 45_000 })
assert.ok(await waitFor(async () => {
  state = await readState()
  return state.notices?.length === 1
}, 3000), 'the notification reaches the page')
const [notice] = state.notices
assert.equal(notice.kind, 'done')
assert.ok(notice.id > 0 && typeof notice.at === 'number')
assert.match(notice.text, /^#2 done · 45\.0s/)
assert.ok(!notice.text.includes('secret'), 'never the prompt')
assert.ok(toasts.includes(notice.text), 'and the terminal shows it as a toast')
await findKey(await drawPane(), 'cfg-notifyDone').onPress()

// The page: served without data, with a policy that loads nothing from elsewhere
const page = await raw(port, { headers: { host: `127.0.0.1:${port}` } })
assert.equal(page.status, 200)
assert.match(page.headers['content-security-policy'], /default-src 'none'/)
assert.match(page.headers['content-security-policy'], /script-src 'self'/)
assert.ok(!/https?:\/\//.test(page.text.replace(/http:\/\/www\.w3\.org/g, '')), 'no remote URL in the page')
// The ad is embedded: its one remote URL is where its link goes, which loads nothing
const AD_HREF = "href: 'https://neuralseam.cloud/premium'"
assert.match(page.text, /<aside class="promo" id="promo"><\/aside>/, 'the page keeps a place for the ad')
for (const file of ['/app.js', '/app.css']) {
  const r = await raw(port, { path: file, headers: { host: `localhost:${port}` } })
  assert.equal(r.status, 200, file)
  if (file === '/app.js') assert.ok(r.text.includes(AD_HREF), 'the house ad links to Neural Seam Premium')
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(r.text.replace(AD_HREF, '')), `no other remote URL in ${file}`)
}
assert.match(page.headers['content-security-policy'], /connect-src 'self'; img-src 'self' data:/, 'the policy did not widen for the ad')

// The guards
const H = { host: `127.0.0.1:${port}` }
assert.equal((await raw(port, { path: '/api/state', headers: H })).status, 401, 'no token')
assert.equal((await raw(port, { path: '/api/state?t=wrong', headers: H })).status, 401, 'wrong token')
assert.equal((await raw(port, { path: `/api/state?t=${viewToken}`, headers: { host: 'evil.example:80' } })).status, 421, 'rebinding host')
assert.equal((await raw(port, { path: `/api/state?t=${viewToken}`, headers: { ...H, origin: 'http://evil.example' } })).status, 403, 'foreign origin')
assert.equal((await raw(port, { method: 'POST', path: '/api/ingest', headers: { ...H, 'x-radar-token': viewToken }, body: '{}' })).status, 401, 'the view token cannot send')
assert.equal((await raw(port, { method: 'POST', path: '/api/shutdown', headers: H })).status, 401, 'nobody else can stop it')
assert.equal((await raw(port, { path: '/etc/passwd', headers: H })).status, 404)
assert.equal((await raw(port, { path: '/../hooks/register.js', headers: H })).status, 404)

// Opening again reuses the running server
const again = await fire('command.run', { command: 'radar-web', args: '' })
assert.ok(again.text.includes(url[0]), 'the same server answers')
assert.equal(children.length, 1)

// ---------------------------------------------------------------------------
// A second session of the same person joins the same page, without /radar-web of its own
// ---------------------------------------------------------------------------

const second = []
;(await import('../hooks/register.js?second')).register((name, a, b) => second.push({ name, matcher: b ? a : null, fn: b ?? a }))
const statuses2 = []
const $2 = { ...$, ui: { ...$.ui, status: (text) => statuses2.push(text) }, session: { ...$.session, id: async () => 'c7e9a1f3-second-session' } }
const fire2 = (name, ev, next = async (e) => e) => second.find((x) => x.name === name && matches(x, ev)).fn($2, ev, next)
await fire2('session.start', { cwd: '/work/other-app' })
await fire2('turn.start', { turnId: 's1', text: 'in another terminal' })
await fire2('tool.call', { tool: 'Glob', pattern: '*.ts' }, async () => ({}))
await fire2('classic.*', { hook_event_name: 'Stop', session_title: 'Port the parser' }, Object.assign(async () => ({}), { event: 'classic.Stop' }))
assert.ok(await waitFor(async () => (await sessionsAt()).length === 2, 4000), 'the second session joins on its own')
let both = await sessionsAt()
const other = both.find((s) => s.key === 'c7e9a1f3-second-session')
assert.ok(other.alive)
assert.equal(other.snapshot.session.title, 'Port the parser', 'named by the title Claude Code gave it')
assert.equal(other.snapshot.session.project, 'other-app')
assert.equal(other.snapshot.hooks[0].event, 'Stop')
assert.notEqual(other.snapshot.session.code, badge.code, 'each session its own badge')
assert.equal(children.length, 1, 'joining starts no server')
assert.ok(statuses2.at(-1)?.includes('radar'), 'its badge shows under its prompt too')
// The page's stream names both, then each one's snapshot
const roster = await events(port, viewToken, (fs) => fs.filter((x) => x.ev === 'state').length >= 2)
assert.equal(roster[0].ev, 'sessions')
assert.deepEqual(roster[0].data.sessions.map((s) => s.key).sort(), ['b1f4c2d0-session-under-test', 'c7e9a1f3-second-session'])
assert.ok(roster.filter((x) => x.ev === 'state').every((x) => typeof x.data.key === 'string' && x.data.snapshot.tool === 'session-radar'))

// The session that started the server goes away: another starts it again on the same port with the
// same tokens, so the page's address keeps working
children[0].kill()
assert.ok(await waitFor(() => exited(children[0])))
assert.ok(await waitFor(async () => {
  try {
    return (await sessionsAt()).length === 2
  } catch {
    return false
  }
}, 15000), 'the hub comes back on the same address')
assert.equal(readHubFile().port, port)
assert.equal(readHubFile().viewToken, viewToken)
assert.ok(children.length >= 2, 'a new server was started')

// A session that ends leaves the page, shown as ended, the others stay
await fire2('session.end', { reason: 'prompt_input_exit' })
both = await sessionsAt()
assert.equal(both.find((s) => s.key === 'c7e9a1f3-second-session').alive, false)
assert.equal(both.find((s) => s.key === 'b1f4c2d0-session-under-test').alive, true)

// Stop: the server exits for every session, the hub says so, nothing is left listening, the pane
// drops the link
const stopped = await fire('command.run', { command: 'radar-web', args: 'stop' })
assert.match(stopped.text, /stopped/)
assert.equal(statuses.at(-1), undefined, 'the badge leaves the prompt with the view')
assert.ok(await waitFor(() => children.every(exited)), 'the server process exited')
assert.equal(readHubFile().stopped, true, 'the hub is marked stopped, so no session starts it again')
await assert.rejects(raw(port, { headers: H }), 'nothing listens on the port any more')
assert.equal(findType(await drawPane(), 'Link'), undefined)
assert.match((await fire('command.run', { command: 'radar-web', args: 'stop' })).text, /not running/)
assert.match((await fire('command.run', { command: 'radar-web', args: 'what' })).text, /\/radar-web stop/)

// ---------------------------------------------------------------------------
// The server ends on its own once the mod stops sending (Claude Code killed without a word)
// ---------------------------------------------------------------------------

const orphan = spawn(process.execPath, [SERVER], { env: { ...process.env, RADAR_WEB_IDLE_MS: '1500' }, stdio: ['ignore', 'pipe', 'ignore'] })
const ready = await new Promise((resolve) => orphan.stdout.once('data', (b) => resolve(JSON.parse(b.toString().replace('RADAR_READY ', '')))))
assert.ok(ready.port > 0 && ready.viewToken !== ready.ingestToken, 'two distinct tokens')
// It listens on loopback only
assert.ok(await waitFor(() => exited(orphan), 5000), 'an unfed server exits by itself')

// ---------------------------------------------------------------------------
// Without Node on the PATH: the command explains, the radar goes on
// ---------------------------------------------------------------------------

spawnImpl = () => (async function* () {
  throw Object.assign(new Error('spawn node ENOENT'), { code: 'ENOENT' })
})()
const failed = await fire('command.run', { command: 'radar-web', args: '' })
assert.match(failed.text, /Node\.js/)
await fire('tool.call', { tool: 'Grep', pattern: 'x' }, async () => ({}))
assert.ok(findKey(await drawPane(), 'tab-home'), 'the pane still draws')

// The second session, which had used the view, does not start it again after the stop, however long
// it keeps looking
await fire2('session.start', { cwd: '/work/other-app' })
await sleep(6500)
await assert.rejects(raw(port, { headers: { host: `127.0.0.1:${port}` } }), 'still nothing listens')

for (const id of timers) clearInterval(id)
for (const c of children) if (!exited(c)) c.kill()
rmSync(HUB_DIR, { recursive: true, force: true })
console.log('session-radar web view: all checks passed')
