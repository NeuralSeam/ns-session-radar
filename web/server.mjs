// Copyright 2026 Neural Seam
// SPDX-License-Identifier: Apache-2.0

// The web view's server: started by the mod with /radar-web, never on its own.
//
// It listens on 127.0.0.1 alone and holds nothing but the last snapshot of each session that sends
// one: every Claude Code session of this person on this machine shares one server, and the page
// shows them one at a time or all together. Two random tokens, told only to the mods:
//   ingest  the mods send snapshots with it (POST /api/ingest), say they leave (POST /api/leave),
//           check the server is theirs (POST /api/hello) and end it (POST /api/shutdown)
//   view    the browser reads the snapshots with it (GET /api/state, GET /api/events)
// The page itself (/, /app.js, /app.css) carries no data and is served without a token.
//
// Where it listens and the two tokens go to the file RADAR_HUB_FILE names, readable by this user
// alone, which is how the other sessions find it. A server started later with the same port and
// tokens (RADAR_WEB_PORT, RADAR_VIEW_TOKEN, RADAR_INGEST_TOKEN) takes over where this one left, so
// an open page carries on when the session that started it closes. When the port is taken it prints
// RADAR_BUSY and exits: another session got there first.
//
// It ends on its own when no session sends for IDLE_MS, so a Claude Code that went away without a
// word leaves no process behind. No dependencies, no remote resources.
//
// While it runs it also samples the machine's memory, total and free, every MEM_MS and keeps the
// last MEM_KEEP samples, for the page's memory card. Only those two numbers, from node:os: no
// process list, no command.

import http from 'node:http'
import os from 'node:os'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const IDLE_MS = Number(process.env.RADAR_WEB_IDLE_MS) || 30_000
const MAX_BODY = 8 * 1024 * 1024
const KEEPALIVE_MS = 15_000
const MEM_MS = Number(process.env.RADAR_WEB_MEM_MS) || 2000
const MEM_KEEP = 300
// A session that has not sent for this long is shown as ended; one ended this long ago is dropped
const SESSION_STALE_MS = Number(process.env.RADAR_WEB_STALE_MS) || 20_000
const SESSION_KEEP_MS = 30 * 60_000
const MAX_SESSIONS = 32
const TOKEN = /^[\w-]{32}$/
const KEY = /^[\w.-]{1,100}$/

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
}

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; " +
    "img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-store',
}

// The hub's port and tokens, when the mod hands them over well formed, else new ones
const HUB_FILE = process.env.RADAR_HUB_FILE || null
const given = [process.env.RADAR_VIEW_TOKEN, process.env.RADAR_INGEST_TOKEN]
const reuse = given.every((t) => TOKEN.test(t ?? '')) && given[0] !== given[1] && Number(process.env.RADAR_WEB_PORT) > 0
const PORT = reuse ? Number(process.env.RADAR_WEB_PORT) : 0
const viewToken = reuse ? given[0] : randomBytes(24).toString('base64url')
const ingestToken = reuse ? given[1] : randomBytes(24).toString('base64url')

// key -> { key, text, beat, left }
const sessions = new Map()
let lastBeat = Date.now()
let closing = false
const clients = new Set()
const memory = []

const sameToken = (given, expected) => {
  if (typeof given !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function send(res, status, body = '', type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const parts = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('too large'))
        req.destroy()
      } else {
        parts.push(chunk)
      }
    })
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')))
    req.on('error', reject)
  })
}

const alive = (s, at = Date.now()) => !s.left && at - s.beat < SESSION_STALE_MS
// The snapshot goes as the mod sent it, never parsed and written again
const stateFrame = (s) => `event: state\ndata: {"key":${JSON.stringify(s.key)},"alive":${alive(s)},"snapshot":${s.text}}\n\n`
const roster = () => [...sessions.values()].map((s) => ({ key: s.key, alive: alive(s), beat: s.beat }))
const sessionsFrame = () => `event: sessions\ndata: ${JSON.stringify({ sessions: roster() })}\n\n`

function broadcast(frame) {
  for (const res of clients) res.write(frame)
}

const memoryFrame = (samples) => `event: system\ndata: ${JSON.stringify({ memory: samples })}\n\n`

function sampleMemory() {
  const sample = { at: Date.now(), total: os.totalmem(), free: os.freemem() }
  memory.push(sample)
  if (memory.length > MEM_KEEP) memory.shift()
  broadcast(memoryFrame([sample]))
}

// Where the other sessions look for this server. Written whole, readable by this user alone
async function writeHub(extra = {}) {
  if (!HUB_FILE) return
  try {
    await mkdir(path.dirname(HUB_FILE), { recursive: true })
    const { port } = server.address()
    const hub = { v: 1, port, viewToken, ingestToken, pid: process.pid, at: Date.now(), ...extra }
    await writeFile(HUB_FILE, JSON.stringify(hub) + '\n', { mode: 0o600 })
  } catch {
    // Nowhere to write: the sessions that started it still reach it, the others start their own
  }
}

// `stopped` when the person ended the view: the other sessions then leave it ended
async function shutdown(stopped = false) {
  if (closing) return
  closing = true
  if (stopped) await writeHub({ stopped: true })
  for (const res of clients) {
    res.write('event: bye\ndata: {}\n\n')
    res.end()
  }
  clients.clear()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1000).unref()
}

function ingest(text) {
  const json = JSON.parse(text)
  if (!json || typeof json !== 'object') throw new Error('not a snapshot')
  const key = KEY.test(json.session?.key ?? '') ? json.session.key : 'default'
  let s = sessions.get(key)
  const joined = !s || !alive(s)
  if (!s) {
    // The oldest ended session gives its place to a new one
    if (sessions.size >= MAX_SESSIONS) {
      const ended = [...sessions.values()].filter((x) => !alive(x)).sort((a, b) => a.beat - b.beat)[0]
      if (!ended) throw new Error('too many sessions')
      sessions.delete(ended.key)
    }
    s = { key, text: '', beat: 0, left: false }
    sessions.set(key, s)
  }
  s.text = text
  s.beat = Date.now()
  s.left = false
  if (joined) broadcast(sessionsFrame())
  broadcast(stateFrame(s))
}

const server = http.createServer(async (req, res) => {
  const port = server.address().port
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`]
  // A page on another site that resolves its own name to 127.0.0.1 still sends its own Host
  if (!hosts.includes(req.headers.host)) return send(res, 421, 'wrong host')
  const origin = req.headers.origin
  if (origin && !hosts.some((h) => origin === `http://${h}`)) return send(res, 403, 'wrong origin')

  const url = new URL(req.url, `http://${req.headers.host}`)

  if (req.method === 'GET' && STATIC[url.pathname]) {
    const [file, type] = STATIC[url.pathname]
    try {
      return send(res, 200, await readFile(path.join(ROOT, file)), type)
    } catch {
      return send(res, 500, 'missing file')
    }
  }

  if (['/api/ingest', '/api/leave', '/api/hello', '/api/shutdown'].includes(url.pathname)) {
    if (req.method !== 'POST') return send(res, 405, 'method not allowed')
    if (origin || !sameToken(req.headers['x-radar-token'], ingestToken)) return send(res, 401, 'unauthorized')
    lastBeat = Date.now()
    if (url.pathname === '/api/hello') return send(res, 204)
    if (url.pathname === '/api/shutdown') {
      send(res, 204)
      return shutdown(true)
    }
    try {
      const text = await readBody(req)
      if (url.pathname === '/api/leave') {
        const s = sessions.get(JSON.parse(text)?.key)
        if (s) {
          s.left = true
          broadcast(sessionsFrame())
        }
      } else {
        ingest(text)
      }
      return send(res, 204)
    } catch {
      return send(res, 400, 'bad snapshot')
    }
  }

  if (url.pathname === '/api/state' || url.pathname === '/api/events') {
    if (req.method !== 'GET') return send(res, 405, 'method not allowed')
    if (!sameToken(url.searchParams.get('t'), viewToken)) return send(res, 401, 'unauthorized')
    if (url.pathname === '/api/state') {
      const list = [...sessions.values()].map((s) => `{"key":${JSON.stringify(s.key)},"alive":${alive(s)},"snapshot":${s.text}}`)
      return send(res, 200, `{"sessions":[${list.join(',')}]}`, 'application/json; charset=utf-8')
    }
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive' })
    res.write('retry: 2000\n\n')
    res.write(sessionsFrame())
    for (const s of sessions.values()) res.write(stateFrame(s))
    // The samples so far, so a page opened late still draws the last minutes
    if (memory.length) res.write(memoryFrame(memory))
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }

  send(res, 404, 'not found')
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && PORT) {
    process.stdout.write('RADAR_BUSY\n')
    process.exit(3)
  }
  throw err
})

server.listen(PORT, '127.0.0.1', async () => {
  await writeHub()
  const { port } = server.address()
  process.stdout.write(`RADAR_READY ${JSON.stringify({ port, viewToken, ingestToken })}\n`)
})

setInterval(() => {
  for (const res of clients) res.write(': keepalive\n\n')
}, KEEPALIVE_MS).unref()

sampleMemory()
setInterval(sampleMemory, MEM_MS).unref()

// Once a second: a session that went quiet is shown as ended, one ended long ago is dropped, and the
// server ends when nobody sends any more
const wasAlive = new Map()
setInterval(() => {
  const at = Date.now()
  let changed = false
  for (const s of sessions.values()) {
    if (!alive(s, at) && at - s.beat > SESSION_KEEP_MS) {
      sessions.delete(s.key)
      wasAlive.delete(s.key)
      changed = true
      continue
    }
    const now = alive(s, at)
    if (wasAlive.get(s.key) !== now) {
      wasAlive.set(s.key, now)
      changed = true
    }
  }
  if (changed) broadcast(sessionsFrame())
  if (at - lastBeat > IDLE_MS) shutdown()
}, 1000)

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => shutdown())
