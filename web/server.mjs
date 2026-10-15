// Copyright 2026 Neural Seam
// SPDX-License-Identifier: Apache-2.0

// The web view's server: started by the mod with /radar-web, never on its own.
//
// It listens on 127.0.0.1 alone, on a port the system picks, and holds nothing but the last
// snapshot the mod sent. Two random tokens, made here and told only to the mod on stdout:
//   ingest  the mod sends snapshots with it (POST /api/ingest) and ends the server with it
//   view    the browser reads the snapshot with it (GET /api/state, GET /api/events)
// The page itself (/, /app.js, /app.css) carries no data and is served without a token.
//
// It ends on its own when the mod stops sending for IDLE_MS, so a Claude Code that went away
// without a word leaves no process behind. No dependencies, no remote resources.

import http from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const IDLE_MS = Number(process.env.RADAR_WEB_IDLE_MS) || 30_000
const MAX_BODY = 8 * 1024 * 1024
const KEEPALIVE_MS = 15_000

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

const viewToken = randomBytes(24).toString('base64url')
const ingestToken = randomBytes(24).toString('base64url')

let snapshot = null
let lastBeat = Date.now()
let closing = false
const clients = new Set()

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

function broadcast() {
  const frame = `event: state\ndata: ${snapshot}\n\n`
  for (const res of clients) res.write(frame)
}

function shutdown() {
  if (closing) return
  closing = true
  for (const res of clients) {
    res.write('event: bye\ndata: {}\n\n')
    res.end()
  }
  clients.clear()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1000).unref()
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

  if (url.pathname === '/api/ingest' || url.pathname === '/api/shutdown') {
    if (req.method !== 'POST') return send(res, 405, 'method not allowed')
    if (origin || !sameToken(req.headers['x-radar-token'], ingestToken)) return send(res, 401, 'unauthorized')
    lastBeat = Date.now()
    if (url.pathname === '/api/shutdown') {
      send(res, 204)
      return shutdown()
    }
    try {
      const text = await readBody(req)
      JSON.parse(text)
      snapshot = text
      broadcast()
      return send(res, 204)
    } catch {
      return send(res, 400, 'bad snapshot')
    }
  }

  if (url.pathname === '/api/state' || url.pathname === '/api/events') {
    if (req.method !== 'GET') return send(res, 405, 'method not allowed')
    if (!sameToken(url.searchParams.get('t'), viewToken)) return send(res, 401, 'unauthorized')
    if (url.pathname === '/api/state') return send(res, 200, snapshot ?? 'null', 'application/json; charset=utf-8')
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive' })
    res.write('retry: 2000\n\n')
    if (snapshot) res.write(`event: state\ndata: ${snapshot}\n\n`)
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }

  send(res, 404, 'not found')
})

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address()
  process.stdout.write(`RADAR_READY ${JSON.stringify({ port, viewToken, ingestToken })}\n`)
})

setInterval(() => {
  for (const res of clients) res.write(': keepalive\n\n')
}, KEEPALIVE_MS).unref()

setInterval(() => {
  if (Date.now() - lastBeat > IDLE_MS) shutdown()
}, 1000)

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, shutdown)
