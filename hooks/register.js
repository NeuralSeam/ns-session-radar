// Copyright 2026 Neural Seam
// SPDX-License-Identifier: Apache-2.0

// session-radar: a live view of what Claude Code is doing.
//
// Collected while Claude works:
//   ⚙ tool calls (Bash, Read, Edit, Grep, ...)
//   ⇄ MCP tool calls (mcp__server__tool)
//   ◎ web access (WebFetch, WebSearch)
//   ◆ subagents (the Agent/Task tool plus the agent.spawn event)
//   ✦ requests to the model (turn.step), with tokens and cache
//
// Shown in a pane with five tabs (/radar) and as a live summary beside the spinner.
// Nothing leaves the session: no network, no model calls. The only writes are /radar-export and the
// language preference, kept in the mod's own store.

const PANE = 'session-radar'
const MAX_SPANS = 500
const MAX_TURNS = 200
const MAX_LABEL = 120
const LANGS = ['auto', 'pt', 'en']
const TTL_MS = { '5m': 5 * 60_000, '1h': 60 * 60_000 }

// ---------------------------------------------------------------------------
// Strings. The language is the one picked with /radar-lang or the `l` key; on `auto`, Brazilian
// Portuguese when the system locale is pt and English otherwise.
// ---------------------------------------------------------------------------

const STRINGS = {
  en: {
    tabTimeline: 'Timeline', tabActivities: 'Activities', tabAgents: 'Agents', tabApi: 'API', tabSummary: 'Summary',
    export: 'Export', clear: 'Clear', help: 'Help', language: 'Language',
    kindTool: 'Tools', kindMcp: 'MCP', kindWeb: 'Web', kindAgent: 'Subagents', kindApi: 'Model API',
    running: 'running', denied: 'denied', failedLegend: 'red = failed or denied',
    windowStart: 'window start', now: 'now',
    emptyTimeline: 'Nothing recorded yet. Send a prompt and each step Claude takes shows up here.',
    emptyActivities: 'No activity yet. Each prompt you send becomes one activity here, with every tool it called.',
    activitiesHint: 'Tab or ↑↓ to move, Enter to open or close an activity',
    continuation: '(no prompt: Claude continued on its own)',
    noTools: 'No tools called in this activity.',
    earlier: (n) => `… ${n} earlier calls of this activity are no longer in memory`,
    more: (n) => `… ${n} more above`,
    mainSession: 'Main session', main: 'main', subagent: 'subagent',
    done: 'done', interrupted: 'interrupted',
    tools: 'tools', req: 'req.', inTok: 'in', outTok: 'out', recent: 'recent',
    noSubagents: 'No subagents in this session yet. They appear here as soon as Claude delegates a task.',
    context: 'Context', of: 'of', cost: 'Cost', limit: 'Limit',
    cache: 'Cache', cacheNote: 'of input read from cache', outPerReq: 'Out/req',
    noRequests: 'No requests to the model yet.',
    colModel: 'model', colAgent: 'agent', colFresh: 'new', colPrompt: 'prompt', colOut: 'out', colTime: 'time',
    legend: [
      'new      input the cache did not serve: billed at the full input price',
      'cache↓   input read from the prompt cache: far cheaper than new input',
      'cache↑   input written to the cache: costs more once, then is read cheaply',
      'prompt   new + cache↓ + cache↑: the whole request; grows with the conversation',
      'hit%     cache↓ ÷ prompt. A yellow row probably lost the cache:',
      '         it expired, the model changed, or the start of the prompt changed',
    ],
    helpHint: 'h: what the columns mean',
    cacheLife: 'Cache lifetime',
    ago: (d) => `last used ${d} ago`,
    expiresIn: (d) => `expires in ${d}`,
    expired: (d) => `expired ${d} ago`,
    expiredShort: 'expired',
    ifTtl: (a, b) => `${a} left if TTL 5m, ${b} if 1h`,
    recache: (n) => `if it expires: ~${n} tok rewritten`,
    ttlUnknown: 'This Claude Code build does not report the cache TTL, so both are shown.',
    ttlNote: 'Each request that reads the cache restarts its lifetime.',
    turn: 'turn', turns: 'turns', avg: 'avg', inputTokens: 'input tokens', outputTokens: 'output',
    timeByTool: 'Time by tool', fail: 'failure', fails: 'failures',
    statusTools: 'tools', statusMcp: 'MCP', statusWeb: 'web', statusAgents: 'subagents', statusApi: 'model requests',
    spinTools: 'tools', spinReq: 'req.', spinAgent: 'agent', spinAgents: 'agents',
    cmdRadar: 'Open or close the session radar pane (tools, agents, model requests)',
    cmdExport: 'Write everything the radar recorded to a JSON file',
    cmdLang: 'Set the radar language: pt, en or auto (system language)',
    langNow: 'Radar language:',
    langAuto: 'auto (system language)',
    langUsage: 'Use /radar-lang pt, /radar-lang en or /radar-lang auto.',
    exported: 'Radar exported to', exportFailed: 'Could not export the radar:', exportNone: 'Could not export the radar.',
  },
  pt: {
    tabTimeline: 'Tempo', tabActivities: 'Atividades', tabAgents: 'Agentes', tabApi: 'API', tabSummary: 'Resumo',
    export: 'Exportar', clear: 'Limpar', help: 'Ajuda', language: 'Idioma',
    kindTool: 'Ferramentas', kindMcp: 'MCP', kindWeb: 'Web', kindAgent: 'Subagentes', kindApi: 'API do modelo',
    running: 'rodando', denied: 'negado', failedLegend: 'vermelho = erro ou negado',
    windowStart: 'início da janela', now: 'agora',
    emptyTimeline: 'Nada registrado ainda. Envie um prompt e cada passo do Claude aparece aqui.',
    emptyActivities: 'Nenhuma atividade ainda. Cada prompt que você envia vira uma atividade aqui, com todas as ferramentas que ela chamou.',
    activitiesHint: 'Tab ou ↑↓ para navegar, Enter abre ou fecha uma atividade',
    continuation: '(sem prompt: o Claude continuou sozinho)',
    noTools: 'Nenhuma ferramenta chamada nesta atividade.',
    earlier: (n) => `… ${n} chamadas anteriores desta atividade já saíram da memória`,
    more: (n) => `… mais ${n} acima`,
    mainSession: 'Sessão principal', main: 'principal', subagent: 'subagente',
    done: 'concluído', interrupted: 'interrompido',
    tools: 'ferramentas', req: 'req.', inTok: 'entrada', outTok: 'saída', recent: 'últimas',
    noSubagents: 'Nenhum subagente nesta sessão ainda. Eles aparecem aqui assim que o Claude delegar uma tarefa.',
    context: 'Contexto', of: 'de', cost: 'Custo', limit: 'Limite',
    cache: 'Cache', cacheNote: 'da entrada lida do cache', outPerReq: 'Saída/req',
    noRequests: 'Nenhuma requisição ao modelo ainda.',
    colModel: 'modelo', colAgent: 'agente', colFresh: 'novo', colPrompt: 'prompt', colOut: 'saída', colTime: 'tempo',
    legend: [
      'novo     entrada que o cache não serviu: cobrada pelo preço cheio',
      'cache↓   entrada lida do cache: bem mais barata que entrada nova',
      'cache↑   entrada gravada no cache: custa mais uma vez, depois é lida barato',
      'prompt   novo + cache↓ + cache↑: a requisição inteira; cresce com a conversa',
      'hit%     cache↓ ÷ prompt. Linha amarela provavelmente perdeu o cache:',
      '         expirou, o modelo mudou ou o início do prompt mudou',
    ],
    helpHint: 'h: o que significa cada coluna',
    cacheLife: 'Vida do cache',
    ago: (d) => `último uso há ${d}`,
    expiresIn: (d) => `expira em ${d}`,
    expired: (d) => `expirou há ${d}`,
    expiredShort: 'expirado',
    ifTtl: (a, b) => `restam ${a} se TTL 5m, ${b} se 1h`,
    recache: (n) => `se expirar: ~${n} tok regravados`,
    ttlUnknown: 'Esta versão do Claude Code não informa a TTL do cache, então as duas aparecem.',
    ttlNote: 'Cada requisição que lê o cache reinicia a contagem.',
    turn: 'turno', turns: 'turnos', avg: 'média', inputTokens: 'tokens de entrada', outputTokens: 'de saída',
    timeByTool: 'Tempo por ferramenta', fail: 'falha', fails: 'falhas',
    statusTools: 'ferramentas', statusMcp: 'MCP', statusWeb: 'web', statusAgents: 'subagentes', statusApi: 'req. ao modelo',
    spinTools: 'ferr.', spinReq: 'req.', spinAgent: 'agente', spinAgents: 'agentes',
    cmdRadar: 'Abre ou fecha o painel do radar (ferramentas, agentes, requisições ao modelo)',
    cmdExport: 'Grava tudo o que o radar registrou num arquivo JSON',
    cmdLang: 'Define o idioma do radar: pt, en ou auto (idioma do sistema)',
    langNow: 'Idioma do radar:',
    langAuto: 'auto (idioma do sistema)',
    langUsage: 'Use /radar-lang pt, /radar-lang en ou /radar-lang auto.',
    exported: 'Radar exportado para', exportFailed: 'Não foi possível exportar o radar:', exportNone: 'Não foi possível exportar o radar.',
  },
}

function detectLocale() {
  try {
    return /^pt\b/i.test(Intl.DateTimeFormat().resolvedOptions().locale) ? 'pt' : 'en'
  } catch {
    return 'en'
  }
}

let langPref = 'auto'
let L = STRINGS[detectLocale()]

function setLanguage(pref) {
  langPref = pref
  L = STRINGS[pref === 'auto' ? detectLocale() : pref]
}

// Accepts what a person is likely to type: pt, pt-BR, português, en, english, auto
function parseLanguage(text) {
  const v = String(text ?? '').trim().toLowerCase()
  if (/^pt|^port/.test(v)) return 'pt'
  if (/^en|^ing/.test(v)) return 'en'
  if (v === 'auto' || v === 'system' || v === 'sistema') return 'auto'
  return null
}

async function saveLanguage($, pref) {
  setLanguage(pref)
  try {
    await $.store.set('language', pref)
  } catch {
    // The store is unavailable here; the choice still holds for this session
  }
}

const KIND = {
  tool: { icon: '⚙', color: 'cyan', nameKey: 'kindTool' },
  mcp: { icon: '⇄', color: 'magenta', nameKey: 'kindMcp' },
  web: { icon: '◎', color: 'blue', nameKey: 'kindWeb' },
  agent: { icon: '◆', color: 'yellow', nameKey: 'kindAgent' },
  api: { icon: '✦', color: 'green', nameKey: 'kindApi' },
}

const TABS = [
  ['timeline', 'tabTimeline', '1'],
  ['activities', 'tabActivities', '2'],
  ['agents', 'tabAgents', '3'],
  ['api', 'tabApi', '4'],
  ['summary', 'tabSummary', '5'],
]

// ---------------------------------------------------------------------------
// State: module variables shared by every hook
// ---------------------------------------------------------------------------

let S = fresh()
let tab = 'timeline'
let paneOpen = false
let showHelp = false
// null follows the newest activity; 'none' keeps every activity closed
let openTurn = null
let seq = 0

function fresh() {
  return {
    startedAt: Date.now(),
    spans: [],
    agents: new Map([['main', newAgent('main', { type: 'main', label: 'main', parent: null })]]),
    turns: [],
    turnSeq: 0,
    ttlSeen: false,
    totals: {
      calls: 0, mcp: 0, web: 0, agents: 0, api: 0, errors: 0, denied: 0,
      tokIn: 0, tokOut: 0, cacheRead: 0, cacheWrite: 0,
    },
  }
}

function newAgent(id, info) {
  return {
    id,
    type: info.type ?? null,
    label: info.label ?? id,
    parent: info.parent === undefined ? 'main' : info.parent,
    turn: info.turn ?? null,
    start: Date.now(),
    end: null,
    status: 'running',
    calls: 0,
    api: 0,
    tokIn: 0,
    tokOut: 0,
    recent: [],
    cacheAt: null,
    cachePrompt: 0,
    ttl: null,
  }
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null))

// The activity a main-loop event belongs to: the one still running, else the latest
function currentTurn() {
  return [...S.turns].reverse().find((t) => !t.end) ?? S.turns.at(-1) ?? null
}

const turnById = (id) => (id == null ? null : S.turns.find((t) => t.id === id) ?? null)

// A subagent's calls belong to the activity that started it, even after that activity ended
function turnOfAgent(agentId) {
  if (agentId !== 'main') {
    const a = S.agents.get(agentId)
    if (a?.turn != null) return turnById(a.turn)
  }
  return currentTurn()
}

function ensureAgent(id, info = {}) {
  id = id || 'main'
  let a = S.agents.get(id)
  if (!a) {
    // Link a new subagent to the Agent/Task call that is still open and created it
    const origin = [...S.spans].reverse().find((s) => s.kind === 'agent' && !s.end && !s.child)
    if (origin) {
      origin.child = id
      info = { label: origin.label, parent: origin.agent, turn: origin.turn, ...clean(info) }
    }
    a = newAgent(id, { turn: currentTurn()?.id, ...info })
    S.agents.set(id, a)
    S.totals.agents++
  } else {
    Object.assign(a, clean(info))
  }
  return a
}

function openSpan(kind, name, label, agent) {
  const turn = turnOfAgent(agent)?.id ?? null
  const span = { id: ++seq, kind, name, label, agent, turn, start: Date.now(), end: null, status: 'running', meta: {} }
  S.spans.push(span)
  if (S.spans.length > MAX_SPANS) {
    const i = S.spans.findIndex((s) => s.end)
    if (i >= 0) S.spans.splice(i, 1)
  }
  return span
}

function closeSpan(span, status) {
  span.end = Date.now()
  span.status = status
  if (status === 'error') S.totals.errors++
  if (status === 'denied') S.totals.denied++
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const agentOf = (e) => e.agentId ?? 'main'
const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim()
const trunc = (s, n) => (s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s)
const pad = (s, n) => trunc(s, n).padEnd(n)
const redraw = ($) => $.ui.invalidate('ui.render')
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const kindName = (k) => L[KIND[k].nameKey]
const agentName = (id) => (id === 'main' ? L.main : S.agents.get(id)?.label ?? id)

function classify(tool) {
  if (tool === 'Agent' || tool === 'Task') return 'agent'
  if (/^mcp__/.test(tool)) return 'mcp'
  if (tool === 'WebFetch' || tool === 'WebSearch') return 'web'
  return 'tool'
}

function prettyName(tool) {
  const m = /^mcp__(.+?)__(.+)$/.exec(tool)
  return m ? `${m[1]}·${m[2]}` : tool
}

// The tool's main argument, on one line and capped, so the radar never holds a whole prompt
function summarize(e) {
  const v = e.command ?? e.file_path ?? e.path ?? e.pattern ?? e.url ?? e.query ??
    e.description ?? e.subagent_type ?? e.prompt
  if (typeof v === 'string') return trunc(oneLine(v), MAX_LABEL)
  const keys = Object.keys(e).filter((k) => !['tool', 'agentId'].includes(k))
  return keys.slice(0, 3).join(', ')
}

const shortModel = (m) => (m ? String(m).replace(/^claude-/, '').replace(/-\d{8}$/, '') : null)

function fmtDur(ms) {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  return `${m}m${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}s`
}

const fmtTok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n))

function bar(frac, w) {
  const f = Math.max(0, Math.min(1, frac || 0))
  const full = Math.round(f * w)
  return '█'.repeat(full) + '░'.repeat(w - full)
}

function sparkline(values) {
  const ticks = '▁▂▃▄▅▆▇█'
  const max = Math.max(1, ...values)
  return values.map((v) => ticks[Math.min(7, Math.floor((v / max) * 7))]).join('')
}

function depthOf(id) {
  let d = 0
  let a = S.agents.get(id)
  while (a && a.parent && d < 10) {
    d++
    a = S.agents.get(a.parent)
  }
  return d
}

function liveSuffix() {
  const running = S.spans.filter((s) => !s.end)
  const cur = running.filter((s) => s.kind !== 'api').at(-1) ?? running.at(-1)
  const t = S.totals
  const fails = t.errors + t.denied
  const parts = []
  if (cur) parts.push(`${KIND[cur.kind].icon} ${trunc(cur.name, 18)} ${fmtDur(Date.now() - cur.start)}`)
  parts.push(`${t.calls} ${L.spinTools}`, `${t.api} ${L.spinReq}`)
  if (t.agents) parts.push(plural(t.agents, L.spinAgent, L.spinAgents))
  if (fails) parts.push(plural(fails, L.fail, L.fails))
  return ' · ' + parts.join(' · ') + '…'
}

function snapshot() {
  return {
    tool: 'session-radar',
    exportedAt: new Date().toISOString(),
    startedAt: new Date(S.startedAt).toISOString(),
    totals: S.totals,
    turns: S.turns,
    agents: [...S.agents.values()],
    spans: S.spans,
  }
}

async function exportJson($) {
  const file = `session-radar-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  try {
    await $.fs.write(file, JSON.stringify(snapshot(), null, 2))
    $.ui.toast(`${L.exported} ${file}`)
    return file
  } catch (err) {
    $.ui.toast(`${L.exportFailed} ${err?.message ?? err}`)
    return null
  }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

// A Text without undefined props, because the validator refuses props it does not know
const T = (Text, text, style = {}) => Text({ wrap: 'truncate', ...clean(style), children: [String(text)] })

function timelineBody(ui, width, maxRows) {
  const { Box, Text } = ui
  const spans = S.spans.slice(-Math.max(4, maxRows))
  if (!spans.length) return [T(Text, L.emptyTimeline, { dimColor: true })]

  const now = Date.now()
  const t0 = Math.min(...spans.map((s) => s.start))
  const total = Math.max(1, now - t0)
  const nameW = 16
  const durW = 8
  const labelW = width >= 70 ? Math.floor(width * 0.26) : 0
  const barW = Math.max(8, width - nameW - labelW - durW - (labelW ? 2 : 1))

  const rows = spans.map((s) => {
    const a = Math.min(barW - 1, Math.floor(((s.start - t0) / total) * barW))
    const b = Math.min(barW, Math.max(a + 1, Math.ceil((((s.end ?? now) - t0) / total) * barW)))
    const depth = depthOf(s.agent)
    const indent = depth ? ' '.repeat(depth * 2 - 1) + '↳' : ''
    const k = KIND[s.kind]
    const failed = s.status === 'error' || s.status === 'denied'
    const color = failed ? 'red' : k.color
    const label = s.kind === 'api' ? agentName(s.agent) : s.label || ''
    const children = [T(Text, pad(`${indent}${k.icon} ${s.name}`, nameW), { color })]
    children.push(T(Text, labelW ? ' ' + pad(label, labelW) + ' ' : ' ', { dimColor: true }))
    children.push(T(Text, '·'.repeat(a), { dimColor: true }))
    children.push(T(Text, (s.end ? '█' : '▓').repeat(b - a), { color }))
    children.push(T(Text, '·'.repeat(barW - b), { dimColor: true }))
    const dur = s.status === 'denied' ? L.denied : fmtDur((s.end ?? now) - s.start)
    const durStyle = !s.end ? { color: 'yellow', bold: true } : failed ? { color: 'red' } : {}
    children.push(T(Text, (' ' + dur).padStart(durW), durStyle))
    return Box({ key: 's' + s.id, flexDirection: 'row', children })
  })

  const lead = nameW + (labelW ? labelW + 2 : 1)
  const right = `${L.now} ${('+' + fmtDur(total)).padStart(durW)}`
  const axis = T(Text, ' '.repeat(lead) + pad(L.windowStart, Math.max(0, barW + durW - right.length)) + right, { dimColor: true })

  const kinds = Object.keys(KIND).map((k) => T(Text, `${KIND[k].icon} ${kindName(k)}`, { color: KIND[k].color }))
  const states = [T(Text, `▓ ${L.running}`, { color: 'yellow' }), T(Text, L.failedLegend, { color: 'red' })]
  // One legend row on a wide pane, two on a narrow one
  const legend = width >= 100
    ? [Box({ key: 'legend', flexDirection: 'row', columnGap: 2, children: [...kinds, ...states] })]
    : [
        Box({ key: 'legend-kinds', flexDirection: 'row', columnGap: 2, children: kinds }),
        Box({ key: 'legend-states', flexDirection: 'row', columnGap: 2, children: states }),
      ]

  return [...rows, axis, T(Text, ' '), ...legend]
}

function turnMark(t) {
  if (!t.end) return { mark: '●', color: 'yellow' }
  if (t.reason === 'aborted') return { mark: '✗', color: 'red' }
  if (t.reason === 'error' || t.reason === 'refusal') return { mark: '!', color: 'red' }
  return { mark: '✓', color: 'green' }
}

// One line per prompt; the open one lists, in order, every call it made, its subagents' included
function activitiesBody(ui, $, width, maxRows) {
  const { Box, Text, Button } = ui
  if (!S.turns.length) return [T(Text, L.emptyActivities, { dimColor: true })]

  const now = Date.now()
  const openId = openTurn === 'none' ? null : openTurn ?? S.turns.at(-1).id
  const newestFirst = [...S.turns].reverse()
  const listed = newestFirst.slice(0, Math.max(3, Math.floor(maxRows / 3)))
  const open = turnById(openId)
  if (open && !listed.includes(open)) listed.push(open)

  const out = [T(Text, L.activitiesHint, { dimColor: true })]
  let room = Math.max(4, maxRows - listed.length - 1)

  for (const t of listed) {
    const { mark } = turnMark(t)
    const right = ` ${fmtDur((t.end ?? now) - t.start)} · ${t.calls} ${L.spinTools}` +
      (t.fails ? ` · ${plural(t.fails, L.fail, L.fails)}` : '')
    const left = `${t.id === openId ? '▾' : '▸'} ${mark} #${t.n} ${t.prompt || L.continuation}`
    out.push(Button({
      key: 'turn-' + t.id,
      label: pad(left, Math.max(10, width - right.length - 1)) + right,
      plain: true,
      dimColor: t.id !== openId,
      onPress: () => {
        openTurn = t.id === openId ? 'none' : t.id
        redraw($)
      },
    }))
    if (t.id !== openId) continue

    const ind = '    '
    const byTool = Object.entries(t.byTool).sort((a, b) => b[1] - a[1])
    if (!byTool.length) {
      out.push(T(Text, ind + L.noTools, { dimColor: true }))
      room--
      continue
    }
    out.push(T(Text, trunc(ind + byTool.map(([n, c]) => `${n} ×${c}`).join(' · '), width), { color: 'cyan' }))
    out.push(T(Text, trunc(`${ind}✦ ${t.api} ${L.req} · ${fmtTok(t.tokIn)} ${L.inTok} / ${fmtTok(t.tokOut)} ${L.outTok}`, width),
      { dimColor: true }))
    room -= 2

    const calls = S.spans.filter((s) => s.turn === t.id && s.kind !== 'api')
    const evicted = t.calls - calls.length
    const shown = calls.slice(-Math.max(1, room - (evicted > 0 ? 1 : 0) - 1))
    if (evicted > 0) out.push(T(Text, ind + L.earlier(evicted), { dimColor: true }))
    if (shown.length < calls.length) out.push(T(Text, ind + L.more(calls.length - shown.length), { dimColor: true }))

    const nameW = 18
    const durW = 9
    const labelW = Math.max(8, width - ind.length - 8 - nameW - durW - 1)
    for (const s of shown) {
      const depth = depthOf(s.agent)
      const indent = depth ? ' '.repeat(depth * 2 - 1) + '↳' : ''
      const failed = s.status === 'error' || s.status === 'denied'
      const color = failed ? 'red' : KIND[s.kind].color
      const dur = !s.end ? L.running : s.status === 'denied' ? L.denied : fmtDur(s.end - s.start)
      out.push(Box({
        key: 'call-' + s.id,
        flexDirection: 'row',
        children: [
          T(Text, ind + ('+' + fmtDur(Math.max(0, s.start - t.start))).padStart(7) + ' ', { dimColor: true }),
          T(Text, pad(`${indent}${KIND[s.kind].icon} ${s.name}`, nameW), { color }),
          T(Text, ' ' + pad(s.label || '', labelW), { dimColor: true }),
          T(Text, dur.padStart(durW), !s.end ? { color: 'yellow', bold: true } : failed ? { color: 'red' } : {}),
        ],
      }))
    }
  }
  return out
}

function agentsBody(ui, width) {
  const { Box, Text } = ui
  const out = []
  const all = [...S.agents.values()]

  const walk = (a, depth) => {
    const prefix = depth ? '  '.repeat(depth - 1) + '↳ ' : ''
    const isMain = a.id === 'main'
    const running = !a.end && !isMain
    const failText = a.status === 'interrupted' ? L.interrupted : a.status === 'denied' ? L.denied : a.status
    const status = isMain ? '' : running ? `● ${L.running}` : a.status === 'ok' ? `✓ ${L.done}` : `✗ ${failText}`
    const statusColor = running ? 'yellow' : a.status === 'ok' ? 'green' : 'red'
    const title = isMain ? L.mainSession : `${a.type ? a.type + ': ' : ''}${a.label}`

    out.push(Box({
      key: 'a-' + a.id,
      flexDirection: 'row',
      columnGap: 2,
      children: [
        T(Text, trunc(`${prefix}◆ ${title}`, Math.floor(width * 0.6)), isMain ? { bold: true } : { color: 'yellow' }),
        ...(status ? [T(Text, status, { color: statusColor })] : []),
      ],
    }))
    const ind = ' '.repeat(prefix.length + 2)
    const line = `${ind}${fmtDur((a.end ?? Date.now()) - a.start)} · ${a.calls} ${L.tools} · ${a.api} ${L.req} · ` +
      `${fmtTok(a.tokIn)} ${L.inTok} / ${fmtTok(a.tokOut)} ${L.outTok}`
    out.push(T(Text, trunc(line, width), { dimColor: true }))
    if (a.recent.length) out.push(T(Text, trunc(`${ind}${L.recent}: ${a.recent.join(' → ')}`, width), { dimColor: true }))

    all.filter((x) => x.parent === a.id).forEach((kid) => walk(kid, depth + 1))
  }

  walk(S.agents.get('main'), 0)
  if (all.length === 1) out.push(T(Text, ' '), T(Text, L.noSubagents, { dimColor: true }))
  return out
}

// How long each loop's cache entries live. The API restarts an entry's lifetime on every read, so
// the clock runs from the loop's last request that read or wrote the cache.
function cacheLifeLines(ui, width) {
  const { Text } = ui
  const now = Date.now()
  const loops = [...S.agents.values()]
    .filter((a) => a.cacheAt)
    .sort((a, b) => (a.id === 'main' ? -1 : b.id === 'main' ? 1 : b.cacheAt - a.cacheAt))
    .slice(0, 2)
  if (!loops.length) return []

  const out = [T(Text, ' '), T(Text, `${L.cacheLife} · ${L.ttlNote}`, { bold: true })]
  const left = (ms) => (ms > 0 ? fmtDur(ms) : L.expiredShort)
  for (const a of loops) {
    const since = now - a.cacheAt
    const parts = [pad(agentName(a.id), 12)]
    let color
    if (a.ttl) {
      // A mixed write expires in two steps; the 5 minute part, the end of the conversation, goes first
      const remaining = TTL_MS[a.ttl === '1h' ? '1h' : '5m'] - since
      parts.push(`TTL ${a.ttl === 'mixed' ? '5m+1h' : a.ttl}`, L.ago(fmtDur(since)),
        remaining > 0 ? L.expiresIn(fmtDur(remaining)) : L.expired(fmtDur(-remaining)))
      color = remaining <= 0 ? 'red' : remaining < 60_000 ? 'yellow' : 'green'
    } else {
      parts.push(L.ago(fmtDur(since)), L.ifTtl(left(TTL_MS['5m'] - since), left(TTL_MS['1h'] - since)))
    }
    out.push(T(Text, trunc(parts.join(' · '), width), color ? { color } : { dimColor: true }))
    out.push(T(Text, trunc(' '.repeat(15) + L.recache(fmtTok(a.cachePrompt)), width), { dimColor: true }))
  }
  if (!S.ttlSeen) out.push(T(Text, trunc(L.ttlUnknown, width), { dimColor: true }))
  return out
}

async function apiBody(ui, $, width, maxRows) {
  const { Box, Text } = ui
  const out = []
  const t = S.totals

  // Context, cost and plan limits, straight from the session
  try {
    const u = await $.session.usage()
    if (u?.context) {
      const pct = (u.context.percent ?? (u.context.tokens / u.context.window) * 100) || 0
      const color = pct > 80 ? 'red' : pct > 60 ? 'yellow' : 'green'
      out.push(Box({
        key: 'ctx',
        flexDirection: 'row',
        children: [
          T(Text, pad(L.context, 10)),
          T(Text, bar(pct / 100, 24), { color }),
          T(Text, ` ${pct.toFixed(0)}% (${fmtTok(u.context.tokens ?? 0)} ${L.of} ${fmtTok(u.context.window ?? 0)})`, { dimColor: true }),
        ],
      }))
    }
    const cost = typeof u?.cost === 'number' ? u.cost : u?.cost?.usd ?? u?.cost?.total
    if (typeof cost === 'number') out.push(T(Text, `${pad(L.cost, 10)}US$ ${cost.toFixed(2)}`, { dimColor: true }))
    for (const r of u?.rateLimits ?? []) {
      const p = r.percentUsed ?? 0
      out.push(T(Text, `${L.limit} ${r.kind}: ${bar(p / 100, 12)} ${Math.round(p)}%`, { dimColor: true }))
    }
  } catch {
    // usage() is not available here; carry on with what the radar collected
  }

  const inputSide = t.tokIn || 1
  out.push(Box({
    key: 'cache',
    flexDirection: 'row',
    children: [
      T(Text, pad(L.cache, 10)),
      T(Text, bar(t.cacheRead / inputSide, 24), { color: 'green' }),
      T(Text, ` ${Math.round((t.cacheRead / inputSide) * 100)}% ${L.cacheNote}`, { dimColor: true }),
    ],
  }))
  out.push(...cacheLifeLines(ui, width))

  const apiSpans = S.spans.filter((s) => s.kind === 'api')
  if (!apiSpans.length) {
    out.push(T(Text, ' '), T(Text, L.noRequests, { dimColor: true }))
    return out
  }

  const spark = apiSpans.slice(-Math.max(10, width - 12)).map((s) => s.meta.tout ?? 0)
  out.push(T(Text, ' '))
  out.push(Box({
    key: 'spark',
    flexDirection: 'row',
    children: [T(Text, pad(L.outPerReq, 10)), T(Text, sparkline(spark), { color: 'green' })],
  }))
  if (showHelp) {
    out.push(T(Text, ' '))
    for (const line of L.legend) out.push(T(Text, trunc(line, width), { dimColor: true }))
  } else {
    out.push(T(Text, L.helpHint, { dimColor: true }))
  }
  out.push(T(Text, ' '))
  out.push(T(Text, pad(L.colModel, 14) + pad(L.colAgent, 12) + L.colFresh.padStart(7) + 'cache↓'.padStart(8) +
    'cache↑'.padStart(8) + L.colPrompt.padStart(8) + 'hit%'.padStart(6) + L.colOut.padStart(7) + L.colTime.padStart(8),
  { dimColor: true }))

  for (const s of apiSpans.slice(-Math.max(3, maxRows - out.length - 1))) {
    const m = s.meta
    const running = !s.end
    const prompt = (m.tin ?? 0) + (m.cr ?? 0) + (m.cw ?? 0)
    const hit = prompt ? Math.round(((m.cr ?? 0) / prompt) * 100) : 0
    // A request after the loop's first that sent most of a large prompt uncached lost the cache
    const miss = !running && !m.first && prompt > 2000 && hit < 50
    const cell = (v, w) => (running ? '…' : v).padStart(w)
    out.push(T(Text,
      pad('✦ ' + s.name, 14) +
      pad(agentName(s.agent), 12) +
      cell(fmtTok(m.tin ?? 0), 7) +
      cell(fmtTok(m.cr ?? 0), 8) +
      cell(fmtTok(m.cw ?? 0), 8) +
      cell(fmtTok(prompt), 8) +
      cell(hit + '%', 6) +
      cell(fmtTok(m.tout ?? 0), 7) +
      fmtDur((s.end ?? Date.now()) - s.start).padStart(8),
      running ? { color: 'yellow' } : s.status === 'error' ? { color: 'red' } : miss ? { color: 'yellow' } : {}))
  }
  return out
}

function summaryBody(ui, width) {
  const { Box, Text } = ui
  const out = []
  const t = S.totals
  const doneTurns = S.turns.filter((x) => x.end)
  const avg = doneTurns.length ? doneTurns.reduce((n, x) => n + (x.end - x.start), 0) / doneTurns.length : 0

  out.push(T(Text, `${plural(S.turns.length, L.turn, L.turns)} · ${L.avg} ${fmtDur(Math.round(avg))} · ` +
    `${fmtTok(t.tokIn)} ${L.inputTokens} · ${fmtTok(t.tokOut)} ${L.outputTokens}`))
  out.push(T(Text, ' '))

  const byKind = Object.keys(KIND).map((k) => [k, S.spans.filter((s) => s.kind === k).length])
  const maxKind = Math.max(1, ...byKind.map(([, n]) => n))
  for (const [k, n] of byKind) {
    out.push(Box({
      key: 'k-' + k,
      flexDirection: 'row',
      children: [
        T(Text, pad(`${KIND[k].icon} ${kindName(k)}`, 18), { color: KIND[k].color }),
        T(Text, bar(n / maxKind, 20), { color: KIND[k].color }),
        T(Text, ` ${n}`),
      ],
    }))
  }

  const agg = new Map()
  for (const s of S.spans) {
    if (s.kind === 'api' || !s.end) continue
    const cur = agg.get(s.name) ?? { n: 0, ms: 0, fail: 0 }
    cur.n++
    cur.ms += s.end - s.start
    if (s.status !== 'ok') cur.fail++
    agg.set(s.name, cur)
  }
  const top = [...agg.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 8)
  if (top.length) {
    out.push(T(Text, ' '), T(Text, L.timeByTool, { bold: true }))
    const maxMs = Math.max(1, ...top.map(([, v]) => v.ms))
    const barW = Math.max(8, Math.min(30, width - 40))
    for (const [name, v] of top) {
      out.push(Box({
        key: 'top-' + name,
        flexDirection: 'row',
        children: [
          T(Text, pad(name, 17) + ' '),
          T(Text, bar(v.ms / maxMs, barW), { color: 'cyan' }),
          T(Text, ` ${v.n}x · ${fmtDur(v.ms)}`, { dimColor: true }),
          ...(v.fail ? [T(Text, ` · ${plural(v.fail, L.fail, L.fails)}`, { color: 'red' })] : []),
        ],
      }))
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      const saved = await $.store.get('language')
      if (LANGS.includes(saved)) setLanguage(saved)
    } catch {
      // No store here: keep the system language
    }
    await $.command.register({ name: 'radar', description: L.cmdRadar, immediate: true })
    await $.command.register({ name: 'radar-export', description: L.cmdExport, immediate: true })
    await $.command.register({ name: 'radar-lang', description: L.cmdLang, argumentHint: 'pt | en | auto', immediate: true })
    // Keep the timers of running items moving, once a second, only when something is on screen
    $.clock.every(1000, () => {
      if (paneOpen || S.spans.some((s) => !s.end)) $.ui.invalidate('ui.render')
    })
    return next(e)
  })

  // /clear, /resume and /branch start a new conversation, so the radar starts over
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      S = fresh()
      openTurn = null
    }
    return next(e)
  })

  on('command.run', { command: 'radar' }, async ($) => {
    if (paneOpen) {
      await $.ui.close({ id: PANE })
      paneOpen = false
      return {}
    }
    await $.ui.open({ id: PANE, title: 'Session Radar', focus: true, closeOnEscape: true, rows: 22, columns: 84 })
    paneOpen = true
    return {}
  })

  on('command.run', { command: 'radar-export' }, async ($) => {
    const file = await exportJson($)
    return { text: file ? `${L.exported} ${file}` : L.exportNone }
  })

  on('command.run', { command: 'radar-lang' }, async ($, e) => {
    const pref = parseLanguage(e.args)
    if (!pref) {
      const now = langPref === 'auto' ? L.langAuto : langPref
      return { text: `${L.langNow} ${now}. ${L.langUsage}` }
    }
    await saveLanguage($, pref)
    redraw($)
    return { text: `${L.langNow} ${pref === 'auto' ? L.langAuto : pref}` }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) paneOpen = false
    return next(e)
  })

  // Tool calls, including MCP, web, subagents, and the calls subagents make
  on('tool.call', async ($, e, next) => {
    const agent = ensureAgent(agentOf(e))
    const kind = classify(e.tool)
    const span = openSpan(kind, prettyName(e.tool), summarize(e), agent.id)
    const turn = turnById(span.turn)
    S.totals.calls++
    if (kind === 'mcp') S.totals.mcp++
    if (kind === 'web') S.totals.web++
    agent.calls++
    agent.recent = [...agent.recent, `${span.name} ${trunc(span.label, 22)}`].slice(-3)
    if (turn) {
      turn.calls++
      turn.byTool[span.name] = (turn.byTool[span.name] ?? 0) + 1
    }
    redraw($)

    let status = 'error'
    try {
      const result = await next(e)
      status = result?.deny ? 'denied' : result?.isError ? 'error' : 'ok'
      return result
    } finally {
      closeSpan(span, status)
      if (turn && status !== 'ok') turn.fails++
      if (span.child) {
        const a = S.agents.get(span.child)
        if (a && !a.end) {
          a.end = span.end
          a.status = status
        }
      }
      redraw($)
    }
  })

  // Subagents. Field names can differ between versions: check the index.d.ts for yours.
  on('agent.spawn', async ($, e, next) => {
    const id = e.agentId ?? e.id
    const info = { type: e.subagentType ?? e.agentType ?? e.subagent_type ?? e.type, parent: e.parentAgentId ?? undefined }
    if (id) ensureAgent(id, info)
    const result = await next(e)
    if (!id && result?.agentId && !result.deny) ensureAgent(result.agentId, info)
    redraw($)
    return result
  })

  // Each prompt on the main loop is one activity. Its text is kept as one line of at most 120
  // characters, the same cap as a tool's argument, so the Activities tab can name it.
  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      S.turns.push({
        id: e.turnId, n: ++S.turnSeq, prompt: trunc(oneLine(e.text ?? ''), MAX_LABEL),
        start: Date.now(), end: null, reason: null,
        calls: 0, fails: 0, api: 0, tokIn: 0, tokOut: 0, byTool: {},
      })
      if (S.turns.length > MAX_TURNS) S.turns.shift()
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) {
      const a = S.agents.get(e.agentId)
      if (a && !a.end) {
        a.end = Date.now()
        a.status = e.isAborted ? 'interrupted' : 'ok'
      }
    } else {
      const turn = turnById(e.turnId) ?? S.turns.at(-1)
      if (turn) {
        turn.end = Date.now()
        turn.reason = e.reason ?? (e.isAborted ? 'aborted' : 'answer')
        if (e.durationMs) turn.start = turn.end - e.durationMs
      }
    }
    redraw($)
    return next(e)
  })

  // One request to the model per step of a turn
  on('turn.step', async function* ($, e, next) {
    const agent = ensureAgent(agentOf(e))
    const span = openSpan('api', shortModel(e.model) ?? '?', '', agent.id)
    const turn = turnById(span.turn)
    S.totals.api++
    agent.api++
    if (turn) turn.api++
    const first = agent.api === 1
    redraw($)

    let status = 'error'
    try {
      const result = yield* next(e)
      const u = result?.usage
      if (u) {
        const tin = u.input_tokens ?? 0
        const tout = u.output_tokens ?? 0
        const cr = u.cache_read_input_tokens ?? 0
        const cw = u.cache_creation_input_tokens ?? 0
        // The API splits writes by lifetime; the mods API does not declare the field, so it is read
        // only when the build passes it through
        const w5 = u.cache_creation?.ephemeral_5m_input_tokens ?? 0
        const w1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0
        span.meta = { tin, tout, cr, cw, w5, w1h, first }
        if (u.model) span.name = shortModel(u.model)
        S.totals.tokIn += tin + cr + cw
        S.totals.tokOut += tout
        S.totals.cacheRead += cr
        S.totals.cacheWrite += cw
        agent.tokIn += tin + cr + cw
        agent.tokOut += tout
        if (turn) {
          turn.tokIn += tin + cr + cw
          turn.tokOut += tout
        }
        if (w5 || w1h) {
          agent.ttl = w5 && w1h ? 'mixed' : w1h ? '1h' : '5m'
          S.ttlSeen = true
        }
        if (cr || cw) {
          agent.cacheAt = Date.now()
          agent.cachePrompt = tin + cr + cw
        }
      }
      status = 'ok'
      return result
    } finally {
      closeSpan(span, status)
      redraw($)
    }
  })

  // Live summary beside the spinner
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!S.totals.calls && !S.totals.api) return next(e)
    return next({ ...e, props: { ...e.props, suffix: liveSuffix() } })
  })

  // The pane
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    // Two cells narrower than the body: the pane's close mark is drawn over the first row's last cell
    const width = Math.max(40, (e.props.bodyColumns ?? 84) - 2)
    const bodyRows = e.props.scroll?.bodyRows ?? 22

    const tabs = Box({
      key: 'tabs',
      flexDirection: 'row',
      columnGap: 2,
      children: TABS.map(([id, labelKey, hotkey]) => Button({
        key: 'tab-' + id,
        label: L[labelKey],
        hotkey,
        plain: true,
        dimColor: tab !== id,
        onPress: () => {
          tab = id
          redraw($)
        },
      })),
    })

    const actions = Box({
      key: 'actions',
      flexDirection: 'row',
      columnGap: 2,
      children: [
        Button({ key: 'export', label: L.export, hotkey: 'e', plain: true, dimColor: true, onPress: () => exportJson($) }),
        Button({
          key: 'reset',
          label: L.clear,
          hotkey: 'x',
          plain: true,
          dimColor: true,
          onPress: () => {
            S = fresh()
            openTurn = null
            redraw($)
          },
        }),
        Button({
          key: 'lang',
          label: `${L.language}: ${langPref === 'auto' ? 'auto' : langPref.toUpperCase()}`,
          hotkey: 'l',
          plain: true,
          dimColor: true,
          onPress: async () => {
            await saveLanguage($, LANGS[(LANGS.indexOf(langPref) + 1) % LANGS.length])
            redraw($)
          },
        }),
        ...(tab === 'api'
          ? [Button({
              key: 'help',
              label: L.help,
              hotkey: 'h',
              plain: true,
              dimColor: !showHelp,
              onPress: () => {
                showHelp = !showHelp
                redraw($)
              },
            })]
          : []),
      ],
    })

    const t = S.totals
    const fails = t.errors + t.denied
    const status = Box({
      key: 'status',
      flexDirection: 'row',
      children: [
        T(Text, trunc(`⏱ ${fmtDur(Date.now() - S.startedAt)} · ${plural(S.turns.length, L.turn, L.turns)} · ` +
          `${t.calls} ${L.statusTools} · ${t.mcp} ${L.statusMcp} · ${t.web} ${L.statusWeb} · ` +
          `${t.agents} ${L.statusAgents} · ${t.api} ${L.statusApi}`, width - 14), { dimColor: true }),
        ...(fails ? [T(Text, ` · ${plural(fails, L.fail, L.fails)}`, { color: 'red' })] : []),
      ],
    })

    const room = Math.max(6, bodyRows - 7)
    let body
    if (tab === 'timeline') body = timelineBody(ui, width, room - 3)
    else if (tab === 'activities') body = activitiesBody(ui, $, width, room)
    else if (tab === 'agents') body = agentsBody(ui, width)
    else if (tab === 'api') body = await apiBody(ui, $, width, room)
    else body = summaryBody(ui, width)

    return Box({ flexDirection: 'column', children: [tabs, actions, status, T(Text, ' '), ...body] })
  })
}
