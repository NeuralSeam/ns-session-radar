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
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { register } from '../hooks/register.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER = path.join(ROOT, 'web', 'server.mjs')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
const timers = []
let spawnImpl = spawnStream
const $ = {
  plugin: { name: 'session-radar', root: ROOT },
  ui: {
    invalidate() {},
    resolve: () => ({ Box: (p) => ({ type: 'Box', ...p }), Text: (p) => ({ type: 'Text', ...p }), Button: (p) => ({ type: 'Button', ...p }), Link: (p) => ({ type: 'Link', ...p }) }),
    toast: (m) => toasts.push(m),
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
  session: { usage: async () => ({ context: { tokens: 50000, window: 200000, percent: 25 }, cost: { usd: 0.12 }, rateLimits: [] }) },
  env: { get: async () => process.env.OS },
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

// ---------------------------------------------------------------------------
// The mod: /radar-web starts the server, sends what it collected, /radar-web stop ends it
// ---------------------------------------------------------------------------

await fire('session.start', {})
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

// The snapshot arrives with the session's numbers and the usage
assert.ok(await waitFor(async () => (await raw(port, { path: `/api/state?t=${viewToken}`, headers: { host: `127.0.0.1:${port}` } })).text !== 'null'))
let state = JSON.parse((await raw(port, { path: `/api/state?t=${viewToken}`, headers: { host: `127.0.0.1:${port}` } })).text)
assert.equal(state.totals.calls, 2)
assert.equal(state.totals.mcp, 1)
assert.equal(state.totals.errors, 1)
assert.equal(state.turns[0].prompt, 'check the web view')
assert.equal(state.usage.context.percent, 25)
assert.equal(state.usage.costUsd, 0.12)
assert.equal(state.lang, 'en')
assert.ok(typeof state.now === 'number')
assert.deepEqual(Object.keys(state).slice(0, 8), ['tool', 'generator', 'exportedAt', 'startedAt', 'totals', 'turns', 'agents', 'spans'])

// A new call reaches the page within a push or two
await fire('tool.call', { tool: 'Read', file_path: 'README.md' }, async () => ({}))
assert.ok(await waitFor(async () => {
  state = JSON.parse((await raw(port, { path: `/api/state?t=${viewToken}`, headers: { host: `127.0.0.1:${port}` } })).text)
  return state.totals.calls === 3
}, 3000), 'live update')

// The page: served without data, with a policy that loads nothing from elsewhere
const page = await raw(port, { headers: { host: `127.0.0.1:${port}` } })
assert.equal(page.status, 200)
assert.match(page.headers['content-security-policy'], /default-src 'none'/)
assert.match(page.headers['content-security-policy'], /script-src 'self'/)
assert.ok(!/https?:\/\//.test(page.text.replace(/http:\/\/www\.w3\.org/g, '')), 'no remote URL in the page')
for (const file of ['/app.js', '/app.css']) {
  const r = await raw(port, { path: file, headers: { host: `localhost:${port}` } })
  assert.equal(r.status, 200, file)
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(r.text), `no remote URL in ${file}`)
}

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

// Stop: the child exits, nothing is left listening, the pane drops the link
const stopped = await fire('command.run', { command: 'radar-web', args: 'stop' })
assert.match(stopped.text, /stopped/)
assert.ok(await waitFor(() => exited(children[0])), 'the server process exited')
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
assert.ok(findKey(await drawPane(), 'tab-timeline'), 'the pane still draws')

for (const id of timers) clearInterval(id)
for (const c of children) if (!exited(c)) c.kill()
console.log('session-radar web view: all checks passed')
