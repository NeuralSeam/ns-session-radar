// Copyright 2026 Neural Seam
// SPDX-License-Identifier: Apache-2.0

// The radar's web view. It reads the snapshot the mod sends to the local server and draws it; it
// collects nothing itself and sends nothing anywhere. Every value from the session is put on the
// page as text (textContent), never as markup.

'use strict'

;(() => {
  const I18N = {
    en: {
      views: { home: 'Home', activities: 'Activities', insights: 'Insights', timeline: 'Timeline', agents: 'Agents', tokens: 'Tokens' },
      kinds: { tool: 'Tools', mcp: 'MCP', web: 'Web', agent: 'Subagents', api: 'Model API' },
      model: 'Model', effort: (e) => `effort ${e}`, tokens: 'Tokens',
      tokensSub: (out, hit) => `${out} out · ${hit}% from cache`, tokIn: 'in',
      memory: 'Memory', memUsed: (used, total) => `${used} used of ${total}`, memFree: (free) => `${free} free`,
      memChart: (span) => `machine memory · last ${span}`, memWaiting: 'Waiting for the first memory sample.',
      memMac: 'macOS counts cached memory as used, so free memory looks lower than it is.',
      insightsOff: 'Insights are off. Turn them on in the terminal, in /radar-config: they read this session and keep per-project counts.',
      noFindings: 'Nothing to suggest for this session yet.',
      historyLine: (n) => `History: ${n} earlier ${n === 1 ? 'session' : 'sessions'} of this project`,
      severity: { high: 'high', medium: 'medium', low: 'low' }, applied: 'applied ✓',
      trends: 'Since the changes you marked as applied',
      markHint: 'Made one of these changes? Mark it applied in the terminal (/radar, then 3): later sessions show here whether it paid off.',
      status: { running: 'running', ok: 'done', error: 'failed', denied: 'denied', interrupted: 'interrupted', waiting: 'waiting' },
      statusFilter: { all: 'All', running: 'Running', failed: 'Failed' },
      windows: { all: 'All', '15m': '15 min', '5m': '5 min', '1m': '1 min' },
      allAgents: 'All agents',
      search: 'Search tools, arguments, prompts, agents',
      conn: {
        connecting: 'connecting', live: 'live', stale: 'no updates from Claude Code', reconnecting: 'reconnecting',
        ended: 'stopped: run /radar-web again', unauthorized: 'link expired: run /radar-web again', noToken: 'open this page with /radar-web',
      },
      metrics: { elapsed: 'session', turns: 'turns', calls: 'tools', mcp: 'MCP', web: 'web', agents: 'subagents', api: 'requests', fails: 'failures' },
      emptyWaiting: 'Waiting for the first snapshot from Claude Code.',
      emptyTimeline: 'Nothing recorded yet. Send a prompt and each step Claude takes shows up here.',
      emptyFiltered: 'Nothing matches the current filters.',
      emptyActivities: 'No activity yet. Each prompt you send becomes one activity here, with every tool it called.',
      continuation: '(no prompt: Claude continued on its own)',
      noTools: 'No tools called in this activity.',
      earlier: (n) => `${n} earlier calls of this activity are no longer in memory`,
      noSubagents: 'No subagents in this session yet. They appear here as soon as Claude delegates a task.',
      noRequests: 'No requests to the model yet.',
      mainSession: 'Main session', main: 'main',
      col: {
        call: 'Call', argument: 'Argument', agent: 'Agent', duration: 'Duration', status: 'Status', offset: 'Offset',
        tools: 'Tools', req: 'Req.', inTok: 'In', outTok: 'Out', recent: 'Recent', started: 'Started',
        model: 'Model', fresh: 'New', read: 'Cache↓', write: 'Cache↑', prompt: 'Prompt', hit: 'Hit', out: 'Out',
        tool: 'Tool', calls: 'Calls', total: 'Total time', avg: 'Average', fails: 'Failures', share: 'Share of time',
      },
      context: 'Context', of: 'of', cost: 'Cost', cache: 'Cache', cacheNote: 'of input read from cache',
      cacheSplit: (r, w) => `${r} read · ${w} written`, limit: 'Limit', resets: 'resets',
      limitName: { five_hour: '5h window', seven_day: 'Weekly', spend_limit: 'Spend limit' },
      cacheLife: 'Cache lifetime', ttlNote: 'Each request that reads the cache restarts its lifetime.',
      ago: (d) => `last used ${d} ago`, expiresIn: (d) => `expires in ${d}`, expired: (d) => `expired ${d} ago`,
      ifTtl: (a, b) => `${a} left if TTL 5m, ${b} if 1h`, expiredShort: 'expired',
      recache: (n) => `if it expires: ~${n} tok rewritten`,
      ttlUnknown: 'This Claude Code build does not report the cache TTL, so both are shown.',
      promptChart: 'Prompt per request', outChart: 'Output per request', lastN: (n) => `last ${n} requests`,
      missMark: 'probably lost the cache', requests: 'Requests', legendToggle: 'What the columns mean', missNote: 'Highlighted rows probably lost the cache.',
      legend: [
        ['New', 'input the cache did not serve: billed at the full input price'],
        ['Cache↓', 'input read from the prompt cache: far cheaper than new input'],
        ['Cache↑', 'input written to the cache: costs more once, then is read cheaply'],
        ['Prompt', 'New + Cache↓ + Cache↑: the whole request; grows with the conversation'],
        ['Hit', 'Cache↓ ÷ Prompt. A highlighted row probably lost the cache: it expired, the model changed, or the start of the prompt changed'],
      ],
      turnsLabel: 'Activities', avgTurn: 'Average activity', inputTokens: 'Input tokens', outputTokens: 'Output tokens',
      failures: 'Failures', sessionTime: 'Session time',
      byKind: 'Calls by kind', perActivity: 'Duration per activity', timeByTool: 'Time by tool',
      detail: {
        kind: 'Kind', name: 'Name', status: 'Status', agent: 'Agent', activity: 'Activity', start: 'Started', end: 'Ended',
        duration: 'Duration', offset: 'Offset in activity', argument: 'Argument', argumentNote: 'As the radar keeps it: one line, at most 120 characters.',
        model: 'Model', tokens: 'Tokens', first: 'First request of its loop', yes: 'yes', no: 'no',
        w5: 'written, 5m TTL', w1h: 'written, 1h TTL', type: 'Type', parent: 'Parent', calls: 'Calls', recent: 'Recent calls',
        ttl: 'Cache TTL', cacheAt: 'Cache last used', openAgent: 'Open subagent', inTimeline: 'Show in timeline', agentCalls: 'Calls in memory',
      },
      hint: '1–6 switch views · / search · Esc close',
      badgeTip: (code, cwd) => `Session ${code}${cwd ? ` in ${cwd}` : ''}. The same badge shows under the prompt of its terminal while this view is open.`,
      endedTitle: 'ended',
      credit: 'Session Radar · by Neural Seam · neuralseam.cloud',
    },
    pt: {
      views: { home: 'Início', activities: 'Atividades', insights: 'Insights', timeline: 'Tempo', agents: 'Agentes', tokens: 'Tokens' },
      kinds: { tool: 'Ferramentas', mcp: 'MCP', web: 'Web', agent: 'Subagentes', api: 'API do modelo' },
      model: 'Modelo', effort: (e) => `esforço ${e}`, tokens: 'Tokens',
      tokensSub: (out, hit) => `${out} saída · ${hit}% do cache`, tokIn: 'entrada',
      memory: 'Memória', memUsed: (used, total) => `${used} em uso de ${total}`, memFree: (free) => `${free} livres`,
      memChart: (span) => `memória da máquina · últimos ${span}`, memWaiting: 'Aguardando a primeira leitura de memória.',
      memMac: 'O macOS conta a memória em cache como usada, então a memória livre parece menor do que é.',
      insightsOff: 'Os insights estão desligados. Ligue no terminal, em /radar-config: eles leem esta sessão e guardam contagens por projeto.',
      noFindings: 'Nada a sugerir para esta sessão por enquanto.',
      historyLine: (n) => `Histórico: ${n} ${n === 1 ? 'sessão anterior' : 'sessões anteriores'} deste projeto`,
      severity: { high: 'alta', medium: 'média', low: 'baixa' }, applied: 'aplicado ✓',
      trends: 'Desde as mudanças marcadas como aplicadas',
      markHint: 'Fez uma dessas mudanças? Marque como aplicada no terminal (/radar, depois 3): as próximas sessões mostram aqui se compensou.',
      status: { running: 'rodando', ok: 'concluído', error: 'falhou', denied: 'negado', interrupted: 'interrompido', waiting: 'aguardando' },
      statusFilter: { all: 'Todos', running: 'Rodando', failed: 'Com falha' },
      windows: { all: 'Tudo', '15m': '15 min', '5m': '5 min', '1m': '1 min' },
      allAgents: 'Todos os agentes',
      search: 'Buscar ferramentas, argumentos, prompts, agentes',
      conn: {
        connecting: 'conectando', live: 'ao vivo', stale: 'sem atualizações do Claude Code', reconnecting: 'reconectando',
        ended: 'encerrado: rode /radar-web de novo', unauthorized: 'link expirado: rode /radar-web de novo', noToken: 'abra esta página com /radar-web',
      },
      metrics: { elapsed: 'sessão', turns: 'turnos', calls: 'ferramentas', mcp: 'MCP', web: 'web', agents: 'subagentes', api: 'requisições', fails: 'falhas' },
      emptyWaiting: 'Aguardando o primeiro envio do Claude Code.',
      emptyTimeline: 'Nada registrado ainda. Envie um prompt e cada passo do Claude aparece aqui.',
      emptyFiltered: 'Nada corresponde aos filtros atuais.',
      emptyActivities: 'Nenhuma atividade ainda. Cada prompt que você envia vira uma atividade aqui, com todas as ferramentas que ela chamou.',
      continuation: '(sem prompt: o Claude continuou sozinho)',
      noTools: 'Nenhuma ferramenta chamada nesta atividade.',
      earlier: (n) => `${n} chamadas anteriores desta atividade já saíram da memória`,
      noSubagents: 'Nenhum subagente nesta sessão ainda. Eles aparecem aqui assim que o Claude delegar uma tarefa.',
      noRequests: 'Nenhuma requisição ao modelo ainda.',
      mainSession: 'Sessão principal', main: 'principal',
      col: {
        call: 'Chamada', argument: 'Argumento', agent: 'Agente', duration: 'Duração', status: 'Estado', offset: 'Início',
        tools: 'Ferr.', req: 'Req.', inTok: 'Entrada', outTok: 'Saída', recent: 'Últimas', started: 'Início',
        model: 'Modelo', fresh: 'Novo', read: 'Cache↓', write: 'Cache↑', prompt: 'Prompt', hit: 'Acerto', out: 'Saída',
        tool: 'Ferramenta', calls: 'Chamadas', total: 'Tempo total', avg: 'Média', fails: 'Falhas', share: 'Parcela do tempo',
      },
      context: 'Contexto', of: 'de', cost: 'Custo', cache: 'Cache', cacheNote: 'da entrada lida do cache',
      cacheSplit: (r, w) => `${r} lidos · ${w} gravados`, limit: 'Limite', resets: 'renova',
      limitName: { five_hour: 'Janela 5h', seven_day: 'Semanal', spend_limit: 'Limite de gasto' },
      cacheLife: 'Vida do cache', ttlNote: 'Cada requisição que lê o cache reinicia a contagem.',
      ago: (d) => `último uso há ${d}`, expiresIn: (d) => `expira em ${d}`, expired: (d) => `expirou há ${d}`,
      ifTtl: (a, b) => `restam ${a} se TTL 5m, ${b} se 1h`, expiredShort: 'expirado',
      recache: (n) => `se expirar: ~${n} tok regravados`,
      ttlUnknown: 'Esta versão do Claude Code não informa a TTL do cache, então as duas aparecem.',
      promptChart: 'Prompt por requisição', outChart: 'Saída por requisição', lastN: (n) => `últimas ${n} requisições`,
      missMark: 'provável perda de cache', requests: 'Requisições', legendToggle: 'O que significa cada coluna', missNote: 'Linhas destacadas provavelmente perderam o cache.',
      legend: [
        ['Novo', 'entrada que o cache não serviu: cobrada pelo preço cheio'],
        ['Cache↓', 'entrada lida do cache: bem mais barata que entrada nova'],
        ['Cache↑', 'entrada gravada no cache: custa mais uma vez, depois é lida barato'],
        ['Prompt', 'Novo + Cache↓ + Cache↑: a requisição inteira; cresce com a conversa'],
        ['Acerto', 'Cache↓ ÷ Prompt. Linha destacada provavelmente perdeu o cache: expirou, o modelo mudou ou o início do prompt mudou'],
      ],
      turnsLabel: 'Atividades', avgTurn: 'Atividade média', inputTokens: 'Tokens de entrada', outputTokens: 'Tokens de saída',
      failures: 'Falhas', sessionTime: 'Tempo de sessão',
      byKind: 'Chamadas por tipo', perActivity: 'Duração por atividade', timeByTool: 'Tempo por ferramenta',
      detail: {
        kind: 'Tipo', name: 'Nome', status: 'Estado', agent: 'Agente', activity: 'Atividade', start: 'Início', end: 'Fim',
        duration: 'Duração', offset: 'Início na atividade', argument: 'Argumento', argumentNote: 'Como o radar guarda: uma linha, no máximo 120 caracteres.',
        model: 'Modelo', tokens: 'Tokens', first: 'Primeira requisição do loop', yes: 'sim', no: 'não',
        w5: 'gravados, TTL 5m', w1h: 'gravados, TTL 1h', type: 'Tipo', parent: 'Pai', calls: 'Chamadas', recent: 'Últimas chamadas',
        ttl: 'TTL do cache', cacheAt: 'Último uso do cache', openAgent: 'Abrir subagente', inTimeline: 'Ver no tempo', agentCalls: 'Chamadas na memória',
      },
      hint: '1–6 trocam a visão · / busca · Esc fecha',
      badgeTip: (code, cwd) => `Sessão ${code}${cwd ? ` em ${cwd}` : ''}. O mesmo crachá aparece abaixo do prompt do terminal dela enquanto esta visão está aberta.`,
      endedTitle: 'encerrada',
      credit: 'Session Radar · por Neural Seam · neuralseam.cloud',
    },
  }

  const KINDS = ['tool', 'mcp', 'web', 'agent', 'api']
  // The first three match the terminal pane's tabs 1 to 3
  const VIEWS = ['home', 'activities', 'insights', 'timeline', 'agents', 'tokens']
  const MEM_KEEP = 300
  const TTL_MS = { '5m': 5 * 60_000, '1h': 60 * 60_000 }
  const WINDOW_MS = { '15m': 15 * 60_000, '5m': 5 * 60_000, '1m': 60_000 }
  const STALE_MS = 15_000
  const CHART_MAX = 120

  const token = new URLSearchParams(location.search).get('t')
  const $ = (id) => document.getElementById(id)

  let T = /^pt\b/i.test(navigator.language) ? I18N.pt : I18N.en
  let data = null
  let offset = 0
  let receivedAt = 0
  let conn = token ? 'connecting' : 'noToken'
  let es = null
  let failures = 0
  let dirty = false
  let pointerDown = false
  let agentsSig = ''
  let shownView = null
  // The machine's memory, sampled by the local server: { at, total, free }, oldest first
  let memory = []

  const ui = {
    view: 'home',
    search: '',
    kinds: new Set(KINDS),
    status: 'all',
    agent: 'all',
    window: 'all',
    selected: null,
    openTurns: new Set(),
    turnsTouched: false,
    sort: { tokens: ['start', -1], tools: ['ms', -1] },
    legend: false,
  }

  try {
    const saved = JSON.parse(localStorage.getItem('session-radar.ui') || '{}')
    if (VIEWS.includes(saved.view)) ui.view = saved.view
    if (WINDOW_MS[saved.window] || saved.window === 'all') ui.window = saved.window
  } catch {
    // Storage is unavailable; the defaults stand
  }
  const remember = () => {
    try {
      localStorage.setItem('session-radar.ui', JSON.stringify({ view: ui.view, window: ui.window }))
    } catch {
      // Storage is unavailable; nothing to keep
    }
  }

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag)
    apply(el, attrs)
    append(el, children)
    return el
  }

  const SVG = 'http://www.w3.org/2000/svg'
  function s(tag, attrs, ...children) {
    const el = document.createElementNS(SVG, tag)
    apply(el, attrs)
    append(el, children)
    return el
  }

  function apply(el, attrs) {
    for (const [k, v] of Object.entries(attrs ?? {})) {
      if (v == null || v === false) continue
      if (k === 'class') el.setAttribute('class', v)
      else if (k === 'style') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val)
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
      else el.setAttribute(k, v === true ? '' : v)
    }
  }

  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue
      el.append(c instanceof Node ? c : document.createTextNode(String(c)))
    }
  }

  // ---------------------------------------------------------------------------
  // Formatting, the same as the terminal pane's
  // ---------------------------------------------------------------------------

  function fmtDur(ms) {
    ms = Math.max(0, Math.round(ms))
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    const m = Math.floor(ms / 60000)
    if (m < 60) return `${m}m${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}s`
    return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
  }
  const fmtTok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n ?? 0))
  const fmtInt = (n) => (n ?? 0).toLocaleString(T === I18N.pt ? 'pt-BR' : 'en-US')
  const fmtClock = (ms) => new Date(ms).toLocaleTimeString(T === I18N.pt ? 'pt-BR' : 'en-GB', { hour12: false })
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)

  // The mod's clock, which stamped every time in the snapshot
  const now = () => Date.now() - offset

  // ---------------------------------------------------------------------------
  // Reading the snapshot
  // ---------------------------------------------------------------------------

  const agentsById = () => new Map((data?.agents ?? []).map((a) => [a.id, a]))
  const spanState = (sp) => (!sp.end ? 'running' : sp.status)
  const isFailed = (st) => st === 'error' || st === 'denied' || st === 'interrupted'
  const turnById = (id) => data?.turns.find((t) => t.id === id) ?? null

  function depthOf(agents, id) {
    let d = 0
    let a = agents.get(id)
    while (a && a.parent && d < 10) {
      d++
      a = agents.get(a.parent)
    }
    return d
  }

  function agentName(agents, id) {
    if (id === 'main') return T.main
    const a = agents.get(id)
    return a ? a.label || id : id
  }

  function agentTitle(a) {
    if (a.id === 'main') return T.mainSession
    return `${a.type ? a.type + ': ' : ''}${a.label}`
  }

  function apiNumbers(sp) {
    const m = sp.meta ?? {}
    const prompt = (m.tin ?? 0) + (m.cr ?? 0) + (m.cw ?? 0)
    const hit = prompt ? Math.round(((m.cr ?? 0) / prompt) * 100) : 0
    // The pane's rule: a request after its loop's first that sent most of a large prompt uncached
    const miss = !!sp.end && !m.first && prompt > 2000 && hit < 50
    return { tin: m.tin ?? 0, cr: m.cr ?? 0, cw: m.cw ?? 0, tout: m.tout ?? 0, w5: m.w5 ?? 0, w1h: m.w1h ?? 0, prompt, hit, miss }
  }

  function matchesSearch(sp, agents) {
    const q = ui.search.trim().toLowerCase()
    if (!q) return true
    const hay = [sp.name, sp.label, agentName(agents, sp.agent), T.kinds[sp.kind]].join(' ').toLowerCase()
    return hay.includes(q)
  }

  function spanPasses(sp, agents, { kinds = true, status = true, agent = true } = {}) {
    if (kinds && !ui.kinds.has(sp.kind)) return false
    if (status && ui.status === 'running' && sp.end) return false
    if (status && ui.status === 'failed' && !isFailed(sp.status)) return false
    if (agent && ui.agent !== 'all' && sp.agent !== ui.agent) return false
    return matchesSearch(sp, agents)
  }

  // ---------------------------------------------------------------------------
  // Small view pieces
  // ---------------------------------------------------------------------------

  const kindEl = (kind, text) => h('span', { class: 'kind', style: { '--kc': `var(--k-${kind})` } }, h('span', null, text))
  const statusEl = (st) => h('span', { class: `status st-${st}` }, T.status[st] ?? st)

  function meter(frac, cls = '') {
    const f = Math.max(0, Math.min(1, frac || 0))
    return h('div', { class: 'meter-track' }, h('div', { class: `meter-fill ${cls}`, style: { width: `${(f * 100).toFixed(1)}%` } }))
  }

  function sectionTitle(text, aside) {
    return h('div', { class: 'section-title' }, h('span', null, text), aside ? h('span', { class: 'aside' }, aside) : null)
  }

  const empty = (text) => h('div', { class: 'empty' }, text)

  // Marks a running item's duration, which tickLive moves forward each second without a redraw
  const live = (item) => (item.end ? {} : { 'data-since': item.start })

  function select(sel) {
    ui.selected = sel
    render()
  }
  const isSelected = (type, id) => ui.selected?.type === type && ui.selected.id === id

  // A sortable table: cols are { key, label, cls, value(row) for sorting, cell(row) for drawing }
  // A data table. cols: { key, label, cls, width, hide ('sm': gone on a phone), value(row) to sort by,
  // cell(row) to draw }. With a name it sorts by a pressed header, kept in ui.sort[name]. Widths sit on
  // the header cells, so a column hidden on a phone takes its width with it.
  function dataTable({ name = null, cols, rows, rowAttrs, minWidth = '640px', fit = false }) {
    let sorted = rows
    let key = null
    let dir = 0
    if (name) {
      ;[key, dir] = ui.sort[name]
      const col = cols.find((c) => c.key === key) ?? cols[0]
      sorted = [...rows].sort((a, b) => {
        const x = col.value(a)
        const y = col.value(b)
        return (x < y ? -1 : x > y ? 1 : 0) * dir
      })
    }
    const cls = (c) => [c.cls, c.hide === 'sm' ? 'hide-sm' : null].filter(Boolean).join(' ') || null
    return h('div', { class: 'table-wrap' }, h('table', { class: `grid ${fit ? 'fit-sm' : ''}`, style: { 'min-width': minWidth } },
      h('thead', null, h('tr', null, cols.map((c) => h('th', {
        class: [cls(c), name ? 'sortable' : null].filter(Boolean).join(' ') || null,
        style: c.width ? { width: c.width } : null,
        'aria-sort': name && c.key === key ? (dir > 0 ? 'ascending' : 'descending') : null,
        onclick: name ? () => {
          ui.sort[name] = [c.key, c.key === key ? -dir : -1]
          render()
        } : null,
      }, c.label)))),
      h('tbody', null, sorted.map((r) => h('tr', rowAttrs(r), cols.map((c) => h('td', { class: cls(c) }, c.cell(r))))))))
  }

  const sortableTable = (name, cols, rows, rowAttrs, minWidth, fit) => dataTable({ name, cols, rows, rowAttrs, minWidth, fit })

  // ---------------------------------------------------------------------------
  // Tooltip
  // ---------------------------------------------------------------------------

  const tip = $('tip')
  function showTip(ev, title, rows) {
    tip.replaceChildren(
      h('strong', null, title),
      ...rows.map(([k, v]) => h('div', null, h('span', { class: 'dim' }, k), h('span', null, v))),
    )
    tip.hidden = false
    const pad = 14
    const { innerWidth: W, innerHeight: H } = window
    const r = tip.getBoundingClientRect()
    tip.style.left = `${Math.min(ev.clientX + pad, W - r.width - 8)}px`
    tip.style.top = `${Math.min(ev.clientY + pad, H - r.height - 8)}px`
  }
  const hideTip = () => {
    tip.hidden = true
  }

  // ---------------------------------------------------------------------------
  // Timeline
  // ---------------------------------------------------------------------------

  function niceStep(range) {
    const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200].map((x) => x * 1000)
    return steps.find((st) => range / st <= 8) ?? steps.at(-1)
  }

  function timelineView() {
    const agents = agentsById()
    const t1 = now()
    let spans = data.spans.filter((sp) => spanPasses(sp, agents))
    if (ui.window !== 'all') {
      const from = t1 - WINDOW_MS[ui.window]
      spans = spans.filter((sp) => (sp.end ?? t1) >= from)
    }
    if (!data.spans.length) return [empty(T.emptyTimeline)]
    if (!spans.length) return [empty(T.emptyFiltered)]

    const t0 = ui.window === 'all' ? Math.min(...spans.map((sp) => sp.start)) : t1 - WINDOW_MS[ui.window]
    const range = Math.max(1000, t1 - t0)
    const x = (t) => Math.max(0, Math.min(100, ((t - t0) / range) * 100))
    const step = niceStep(range)
    const ticks = []
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) ticks.push(t)

    const axis = h('div', { class: 'tl-axis' },
      h('div', null, T.col.call),
      h('div', null, T.col.argument),
      h('div', { class: 'tl-ticks' }, ticks.map((t) => h('div', { class: 'tl-tick', style: { left: `${x(t)}%` } }, fmtClock(t)))),
      h('div', { style: { 'text-align': 'right' } }, T.col.duration))

    const rows = spans.map((sp) => {
      const st = spanState(sp)
      const failed = isFailed(st)
      const depth = depthOf(agents, sp.agent)
      const left = x(sp.start)
      const width = Math.max(0.15, x(sp.end ?? t1) - left)
      let label = sp.label || ''
      if (sp.kind === 'api') {
        const n = apiNumbers(sp)
        label = `${agentName(agents, sp.agent)}${sp.end ? ` · ${fmtTok(n.prompt)} → ${fmtTok(n.tout)}` : ''}`
      }
      const dur = st === 'denied' ? T.status.denied : fmtDur((sp.end ?? t1) - sp.start)
      return h('div', {
        class: `tl-row ${isSelected('span', sp.id) ? 'selected' : ''}`,
        onclick: () => select({ type: 'span', id: sp.id }),
      },
      h('div', { class: 'tl-name', style: { '--depth': depth } },
        depth ? h('span', { class: 'tl-branch' }, '↳') : null,
        kindEl(sp.kind, sp.name)),
      h('div', { class: 'tl-label', title: label }, label),
      h('div', { class: 'tl-track' },
        ticks.map((t) => h('div', { class: 'tl-grid', style: { left: `${x(t)}%` } })),
        h('div', {
          class: `bar ${st === 'running' ? 'running' : ''} ${failed ? 'failed' : ''}`,
          style: { left: `${left}%`, width: `${width}%`, '--kc': `var(--k-${sp.kind})` },
        })),
      h('div', { class: `tl-dur ${st === 'running' ? 'running' : failed ? 'fail' : ''}`, ...live(sp) }, dur))
    })
    return [h('div', { class: 'tl' }, axis, rows)]
  }

  // ---------------------------------------------------------------------------
  // Activities
  // ---------------------------------------------------------------------------

  function activitiesView() {
    const agents = agentsById()
    if (!data.turns.length) return [empty(T.emptyActivities)]
    const latest = data.turns.at(-1).id
    const open = ui.turnsTouched ? ui.openTurns : new Set([latest])
    const q = ui.search.trim().toLowerCase()
    const t1 = now()

    const out = []
    for (const t of [...data.turns].reverse()) {
      const calls = data.spans.filter((sp) => sp.turn === t.id && sp.kind !== 'api')
      const shown = calls.filter((sp) => spanPasses(sp, agents, { agent: false }))
      const promptHit = q && (t.prompt || '').toLowerCase().includes(q)
      const filtering = q || ui.status !== 'all' || ui.kinds.size !== KINDS.length
      if (filtering && !promptHit && !shown.length) continue

      const isOpen = open.has(t.id)
      const st = !t.end ? 'running' : t.reason === 'aborted' ? 'interrupted' : t.reason === 'error' || t.reason === 'refusal' ? 'error' : 'ok'
      const toggle = () => {
        if (!ui.turnsTouched) {
          ui.turnsTouched = true
          ui.openTurns = new Set(open)
        }
        if (ui.openTurns.has(t.id)) ui.openTurns.delete(t.id)
        else ui.openTurns.add(t.id)
        render()
      }

      const head = h('button', { class: 'act-head', type: 'button', 'aria-expanded': String(isOpen), onclick: toggle },
        h('span', { class: 'act-caret' }),
        h('span', { class: 'act-n' }, `#${t.n}`),
        h('span', { class: 'act-main' },
          statusEl(st),
          h('span', { class: `act-prompt ${t.prompt ? '' : 'none'}`, title: t.prompt || '' }, t.prompt || T.continuation)),
        h('span', { class: 'act-stats' },
          h('span', live(t), fmtDur((t.end ?? t1) - t.start)),
          h('span', null, `${t.calls} ${T.col.tools.toLowerCase()}`),
          t.fails ? h('span', { class: 'tx-fail' }, `${t.fails} ${T.col.fails.toLowerCase()}`) : null,
          h('span', null, `${t.api} ${T.col.req.toLowerCase()}`),
          h('span', null, `${fmtTok(t.tokIn)} / ${fmtTok(t.tokOut)}`)))

      let body = null
      if (isOpen) {
        const byTool = Object.entries(t.byTool).sort((a, b) => b[1] - a[1])
        const evicted = t.calls - calls.length
        body = h('div', { class: 'act-body' },
          byTool.length
            ? h('div', { class: 'act-summary' },
              byTool.map(([n, c]) => h('span', { class: 'chip' }, h('b', null, n), `×${c}`)),
              h('span', { class: 'chip plain' }, `${t.api} ${T.col.req.toLowerCase()} · ${fmtTok(t.tokIn)} ${T.col.inTok.toLowerCase()} / ${fmtTok(t.tokOut)} ${T.col.outTok.toLowerCase()}`))
            : h('div', { class: 'note' }, T.noTools),
          evicted > 0 ? h('div', { class: 'note' }, T.earlier(evicted)) : null,
          shown.length ? callsTable(shown, agents, t) : null)
      }
      out.push(h('div', { class: `act ${isOpen ? 'open' : ''}` }, head, body))
    }
    return out.length ? out : [empty(T.emptyFiltered)]
  }

  function callsTable(calls, agents, turn) {
    const t1 = now()
    return dataTable({
      fit: true,
      minWidth: '720px',
      rows: calls,
      rowAttrs: (sp) => ({
        class: `${isSelected('span', sp.id) ? 'selected' : ''} ${isFailed(spanState(sp)) ? 'failed' : ''}`,
        onclick: () => select({ type: 'span', id: sp.id }),
      }),
      cols: [
        { label: T.col.offset, cls: 'r num faint', width: '68px', cell: (sp) => `+${fmtDur(Math.max(0, sp.start - turn.start))}` },
        {
          label: T.col.call,
          width: '38%',
          cell: (sp) => {
            const depth = depthOf(agents, sp.agent)
            return h('span', { class: 'agent-name', style: { '--depth': depth } },
              depth ? h('span', { class: 'tl-branch' }, '↳') : null, kindEl(sp.kind, sp.name))
          },
        },
        { label: T.col.argument, cls: 'mono dim', hide: 'sm', cell: (sp) => h('span', { title: sp.label || '' }, sp.label || '') },
        { label: T.col.agent, cls: 'dim', width: '130px', hide: 'sm', cell: (sp) => agentName(agents, sp.agent) },
        {
          label: T.col.duration,
          cls: 'r num',
          width: '78px',
          cell: (sp) => (spanState(sp) === 'denied' ? '—' : h('span', live(sp), fmtDur((sp.end ?? t1) - sp.start))),
        },
        { label: T.col.status, width: '112px', cell: (sp) => statusEl(spanState(sp)) },
      ],
    })
  }

  // ---------------------------------------------------------------------------
  // Agents
  // ---------------------------------------------------------------------------

  function agentsView() {
    const agents = agentsById()
    const all = [...agents.values()]
    const t1 = now()
    const q = ui.search.trim().toLowerCase()
    const ordered = []
    const walk = (a, depth) => {
      ordered.push([a, depth])
      all.filter((x) => x.parent === a.id).forEach((kid) => walk(kid, depth + 1))
    }
    const main = agents.get('main')
    if (main) walk(main, 0)
    const rows = ordered.filter(([a]) => !q || [agentTitle(a), a.recent.join(' ')].join(' ').toLowerCase().includes(q))

    const out = [dataTable({
      minWidth: '820px',
      rows,
      rowAttrs: ([a]) => {
        const st = a.id === 'main' ? null : !a.end ? 'running' : a.status
        return {
          class: `${isSelected('agent', a.id) ? 'selected' : ''} ${st && isFailed(st) ? 'failed' : ''}`,
          onclick: () => select({ type: 'agent', id: a.id }),
        }
      },
      cols: [
        {
          label: T.col.agent,
          cell: ([a, depth]) => h('span', { class: 'agent-name', style: { '--depth': depth } },
            depth ? h('span', { class: 'tl-branch' }, '↳') : null,
            a.id === 'main' ? h('strong', null, T.mainSession) : kindEl('agent', agentTitle(a))),
        },
        { label: T.col.status, width: '120px', cell: ([a]) => (a.id === 'main' ? '' : statusEl(!a.end ? 'running' : a.status)) },
        { label: T.col.duration, cls: 'r num', width: '84px', cell: ([a]) => h('span', live(a), fmtDur((a.end ?? t1) - a.start)) },
        { label: T.col.tools, cls: 'r num', width: '64px', cell: ([a]) => a.calls },
        { label: T.col.req, cls: 'r num', width: '64px', cell: ([a]) => a.api },
        { label: T.col.inTok, cls: 'r num', width: '76px', cell: ([a]) => fmtTok(a.tokIn) },
        { label: T.col.outTok, cls: 'r num', width: '76px', cell: ([a]) => fmtTok(a.tokOut) },
        { label: T.col.recent, cls: 'dim', width: '30%', cell: ([a]) => h('span', { title: a.recent.join(' → ') }, a.recent.join(' → ')) },
      ],
    })]
    if (all.length === 1) out.push(h('p', { class: 'note' }, T.noSubagents))
    return out
  }

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------

  // One card: a label, a value and, when given, a meter and a line under it
  function statCard(label, value, { frac = null, sub = null, cls = '' } = {}) {
    const meterCls = frac == null ? '' : frac > 0.8 ? 'fail' : frac > 0.6 ? 'warn' : ''
    return h('div', { class: 'stat' },
      h('div', { class: 'stat-label' }, label),
      h('div', { class: `stat-value ${cls}` }, value),
      frac == null ? null : h('div', { class: 'meter' }, meter(frac, meterCls)),
      sub ? h('div', { class: 'stat-sub' }, sub) : null)
  }

  const contextCard = (c) => {
    const p = (c.percent ?? ((c.tokens ?? 0) / (c.window || 1)) * 100) || 0
    return statCard(T.context, `${p.toFixed(0)}%`, { frac: p / 100, sub: `${fmtTok(c.tokens ?? 0)} ${T.of} ${fmtTok(c.window ?? 0)}` })
  }
  const limitCards = (u) => (u?.rateLimits ?? []).map((r) => statCard(T.limitName[r.kind] ?? `${T.limit} ${r.kind}`,
    `${Math.round(r.percentUsed ?? 0)}%`, { frac: (r.percentUsed ?? 0) / 100, sub: r.resetsAt ? `${T.resets} ${new Date(r.resetsAt).toLocaleString()}` : null }))
  const costCard = (u) => (typeof u?.costUsd === 'number' ? statCard(T.cost, `US$ ${u.costUsd.toFixed(2)}`) : null)

  function tokensView() {
    const agents = agentsById()
    const out = []
    const t = data.totals
    const u = data.usage

    const inputSide = t.tokIn || 1
    out.push(h('div', { class: 'stats-row' },
      u?.context ? contextCard(u.context) : null,
      costCard(u),
      // The cache's meter fills with good news, so it stays the accent colour
      h('div', { class: 'stat' },
        h('div', { class: 'stat-label' }, T.cache),
        h('div', { class: 'stat-value' }, `${pct(t.cacheRead, inputSide)}%`),
        h('div', { class: 'meter' }, meter(t.cacheRead / inputSide)),
        h('div', { class: 'stat-sub' }, `${T.cacheNote} · ${T.cacheSplit(fmtTok(t.cacheRead), fmtTok(t.cacheWrite))}`)),
      limitCards(u)))

    out.push(...cacheLife(agents))

    const all = data.spans.filter((sp) => sp.kind === 'api')
    if (!all.length) {
      out.push(empty(T.noRequests))
      return out
    }
    const apiSpans = all.filter((sp) => spanPasses(sp, agents, { kinds: false }))
    const recent = apiSpans.slice(-CHART_MAX)
    out.push(sectionTitle(T.promptChart, T.lastN(recent.length)))
    out.push(promptChart(recent, agents))

    out.push(sectionTitle(T.requests, h('button', { class: 'link-btn', type: 'button', onclick: () => { ui.legend = !ui.legend; render() } }, T.legendToggle)))
    if (ui.legend) out.push(h('div', { class: 'legend-text' }, T.legend.map(([k, v]) => h('div', null, h('b', null, k), h('span', null, v)))))
    if (apiSpans.some((sp) => apiNumbers(sp).miss)) out.push(h('p', { class: 'note' }, T.missNote))

    const t1 = now()
    const cols = [
      { key: 'start', label: T.col.started, width: '86px', value: (sp) => sp.start, cell: (sp) => h('span', { class: 'num faint' }, fmtClock(sp.start)) },
      { key: 'name', label: T.col.model, width: '150px', value: (sp) => sp.name, cell: (sp) => kindEl('api', sp.name) },
      { key: 'agent', label: T.col.agent, value: (sp) => agentName(agents, sp.agent), cell: (sp) => agentName(agents, sp.agent) },
      ...[['tin', T.col.fresh], ['cr', T.col.read], ['cw', T.col.write], ['prompt', T.col.prompt]].map(([k, label]) => ({
        key: k, label, cls: 'r num', width: '78px', value: (sp) => apiNumbers(sp)[k], cell: (sp) => (sp.end ? fmtTok(apiNumbers(sp)[k]) : '…'),
      })),
      { key: 'hit', label: T.col.hit, cls: 'r num', width: '64px', value: (sp) => apiNumbers(sp).hit, cell: (sp) => (sp.end ? `${apiNumbers(sp).hit}%` : '…') },
      { key: 'tout', label: T.col.out, cls: 'r num', width: '70px', value: (sp) => apiNumbers(sp).tout, cell: (sp) => (sp.end ? fmtTok(apiNumbers(sp).tout) : '…') },
      { key: 'dur', label: T.col.duration, cls: 'r num', width: '80px', value: (sp) => (sp.end ?? t1) - sp.start, cell: (sp) => h('span', live(sp), fmtDur((sp.end ?? t1) - sp.start)) },
      { key: 'status', label: T.col.status, width: '104px', value: (sp) => spanState(sp), cell: (sp) => statusEl(spanState(sp)) },
    ]
    out.push(sortableTable('tokens', cols, apiSpans, (sp) => ({
      class: `${isSelected('span', sp.id) ? 'selected' : ''} ${apiNumbers(sp).miss ? 'miss' : ''} ${isFailed(spanState(sp)) ? 'failed' : ''}`,
      onclick: () => select({ type: 'span', id: sp.id }),
    })))
    return out
  }

  // How long each loop's cache entries live; the clock runs from the loop's last request that read or
  // wrote the cache, since every read restarts an entry's lifetime
  function cacheLife(agents) {
    const t1 = now()
    const loops = [...agents.values()].filter((a) => a.cacheAt)
      .sort((a, b) => (a.id === 'main' ? -1 : b.id === 'main' ? 1 : b.cacheAt - a.cacheAt))
    if (!loops.length) return []
    const rows = []
    for (const a of loops) {
      const since = t1 - a.cacheAt
      let line
      let bar
      if (a.ttl) {
        const total = TTL_MS[a.ttl === '1h' ? '1h' : '5m']
        const remaining = total - since
        line = `TTL ${a.ttl === 'mixed' ? '5m+1h' : a.ttl} · ${T.ago(fmtDur(since))} · ${remaining > 0 ? T.expiresIn(fmtDur(remaining)) : T.expired(fmtDur(-remaining))}`
        bar = meter(remaining / total, remaining <= 0 ? 'fail' : remaining < 60_000 ? 'warn' : 'ok')
      } else {
        const left = (ms) => (ms > 0 ? fmtDur(ms) : T.expiredShort)
        line = `${T.ago(fmtDur(since))} · ${T.ifTtl(left(TTL_MS['5m'] - since), left(TTL_MS['1h'] - since))}`
        bar = meter((TTL_MS['5m'] - since) / TTL_MS['5m'])
      }
      rows.push(h('div', { class: 'cl-row' },
        h('div', { class: 'cl-name' }, a.id === 'main' ? T.mainSession : agentTitle(a)),
        bar,
        h('div', { class: 'cl-meta' }, line),
        h('div', { class: 'cl-foot' }, T.recache(fmtTok(a.cachePrompt)))))
    }
    return [
      sectionTitle(T.cacheLife, T.ttlNote),
      h('div', { class: 'cache-list' }, rows),
      data.ttlSeen ? null : h('p', { class: 'note' }, T.ttlUnknown),
    ]
  }

  function chartBox(svgEl, legend) {
    return h('div', { class: 'chart' }, svgEl, legend)
  }

  function chartWidth() {
    const view = $('view')
    const pad = parseFloat(getComputedStyle(view).paddingLeft) * 2 + 30
    return Math.max(260, view.clientWidth - pad)
  }

  // Stacked columns per request: the prompt split into cache read, cache write and new input, with the
  // output underneath on its own scale
  function promptChart(spans, agents) {
    const W = chartWidth()
    const H1 = 150
    const H2 = 54
    const gap = 18
    const left = 46
    const H = H1 + gap + H2 + 16
    const plotW = W - left
    const nums = spans.map((sp) => ({ sp, n: apiNumbers(sp) }))
    const maxP = Math.max(1, ...nums.map((x) => x.n.prompt))
    const maxO = Math.max(1, ...nums.map((x) => x.n.tout))
    const bw = plotW / Math.max(1, nums.length)
    const inner = Math.max(1, Math.min(28, bw * 0.7))

    const svgEl = s('svg', { viewBox: `0 0 ${W} ${H}`, height: H, role: 'img', 'aria-label': T.promptChart })
    const axis = s('g', { class: 'axis' })
    for (const f of [0, 0.5, 1]) {
      const y = H1 - f * H1
      axis.append(s('line', { x1: left, x2: W, y1: y, y2: y }), s('text', { x: left - 6, y: y + 3, 'text-anchor': 'end' }, fmtTok(Math.round(maxP * f))))
    }
    const yO = H1 + gap
    axis.append(
      s('line', { x1: left, x2: W, y1: yO + H2, y2: yO + H2 }),
      s('text', { x: left - 6, y: yO + 8, 'text-anchor': 'end' }, fmtTok(maxO)),
      s('text', { x: left - 6, y: yO + H2 + 3, 'text-anchor': 'end' }, '0'))
    svgEl.append(axis)

    nums.forEach(({ sp, n }, i) => {
      const cx = left + i * bw + (bw - inner) / 2
      let y = H1
      for (const [v, color] of [[n.cr, 'var(--c-read)'], [n.cw, 'var(--c-write)'], [n.tin, 'var(--c-new)']]) {
        const hgt = (v / maxP) * H1
        if (hgt > 0) svgEl.append(s('rect', { x: cx, y: y - hgt, width: inner, height: hgt, style: { fill: color } }))
        y -= hgt
      }
      if (n.miss) svgEl.append(s('rect', { x: cx, y: H1 + 3, width: inner, height: 3, style: { fill: 'var(--warn)' } }))
      const oh = (n.tout / maxO) * H2
      if (oh > 0) svgEl.append(s('rect', { x: cx, y: yO + H2 - oh, width: inner, height: oh, style: { fill: 'var(--k-api)', opacity: '0.8' } }))
      svgEl.append(s('rect', {
        class: 'hit', x: left + i * bw, y: 0, width: bw, height: H - 16,
        onmousemove: (ev) => showTip(ev, `${sp.name} · ${agentName(agents, sp.agent)} · ${fmtClock(sp.start)}`, [
          [T.col.read, fmtInt(n.cr)], [T.col.write, fmtInt(n.cw)], [T.col.fresh, fmtInt(n.tin)],
          [T.col.prompt, fmtInt(n.prompt)], [T.col.hit, `${n.hit}%`], [T.col.out, fmtInt(n.tout)],
          [T.col.duration, fmtDur((sp.end ?? now()) - sp.start)],
        ]),
        onmouseleave: hideTip,
        onclick: () => select({ type: 'span', id: sp.id }),
      }))
    })
    svgEl.append(s('text', { x: left, y: H - 2, class: 'axis-label' }, T.outChart))

    const legend = h('div', { class: 'legend' },
      [[T.col.read, '--c-read'], [T.col.write, '--c-write'], [T.col.fresh, '--c-new'], [T.col.out, '--k-api']].map(([label, v]) =>
        h('span', null, h('span', { class: 'swatch', style: { background: `var(${v})` } }), label)),
      h('span', null, h('span', { class: 'swatch', style: { background: 'var(--warn)', height: '3px' } }), T.missMark))
    return chartBox(svgEl, legend)
  }

  // ---------------------------------------------------------------------------
  // Home: the session at a glance, the machine's memory, then where the time went
  // ---------------------------------------------------------------------------

  const GB = 1024 ** 3
  const fmtBytes = (n) => (n >= GB ? `${(n / GB).toFixed(1)}G` : `${Math.round(n / 1024 ** 2)}M`)

  function homeView() {
    const out = []
    const t = data.totals
    const u = data.usage
    const b = data.session ?? {}
    const t1 = now()
    const doneTurns = data.turns.filter((x) => x.end)
    const avg = doneTurns.length ? doneTurns.reduce((n, x) => n + (x.end - x.start), 0) / doneTurns.length : 0
    const mem = memory.at(-1)

    out.push(h('div', { class: 'stats-row' },
      statCard(T.model, b.model ?? '—', { sub: b.effort ? T.effort(b.effort) : null, cls: 'stat-text' }),
      u?.context ? contextCard(u.context) : null,
      statCard(T.tokens, `${fmtTok(t.tokIn)} ${T.tokIn}`, { sub: T.tokensSub(fmtTok(t.tokOut), pct(t.cacheRead, t.tokIn || 1)) }),
      costCard(u),
      limitCards(u),
      mem ? statCard(T.memory, `${pct(mem.total - mem.free, mem.total)}%`, {
        frac: (mem.total - mem.free) / mem.total, sub: T.memUsed(fmtBytes(mem.total - mem.free), fmtBytes(mem.total)),
      }) : null))

    out.push(sectionTitle(T.memory, mem ? T.memFree(fmtBytes(mem.free)) : null))
    out.push(memory.length > 1 ? memChart() : empty(T.memWaiting))
    if (/Macintosh|Mac OS X/i.test(navigator.userAgent)) out.push(h('p', { class: 'note' }, T.memMac))

    const stat = (label, value, cls = '') => statCard(label, value, { cls })
    out.push(h('div', { class: 'stats-row spaced' },
      stat(T.sessionTime, fmtDur(t1 - Date.parse(data.startedAt))),
      stat(T.turnsLabel, fmtInt(data.turns.length)),
      stat(T.avgTurn, fmtDur(avg)),
      stat(T.failures, fmtInt(t.errors + t.denied), t.errors + t.denied ? 'tx-fail' : '')))

    out.push(sectionTitle(T.byKind))
    const byKind = KINDS.map((k) => [k, data.spans.filter((sp) => sp.kind === k).length])
    const maxKind = Math.max(1, ...byKind.map(([, n]) => n))
    out.push(h('div', { class: 'hbars' }, byKind.map(([k, n]) => h('div', { class: 'hbar' },
      kindEl(k, T.kinds[k]),
      h('div', { class: 'hbar-track' }, h('div', { class: 'hbar-fill', style: { width: `${(n / maxKind) * 100}%`, '--kc': `var(--k-${k})` } })),
      h('span', { class: 'num dim' }, fmtInt(n))))))

    if (data.turns.length) {
      out.push(sectionTitle(T.perActivity))
      out.push(activityChart())
    }

    const agg = new Map()
    for (const sp of data.spans) {
      if (sp.kind === 'api' || !sp.end) continue
      const cur = agg.get(sp.name) ?? { name: sp.name, kind: sp.kind, n: 0, ms: 0, fail: 0 }
      cur.n++
      cur.ms += sp.end - sp.start
      if (sp.status !== 'ok') cur.fail++
      agg.set(sp.name, cur)
    }
    const q = ui.search.trim().toLowerCase()
    const tools = [...agg.values()].filter((v) => !q || v.name.toLowerCase().includes(q))
    if (tools.length) {
      out.push(sectionTitle(T.timeByTool))
      const totalMs = Math.max(1, tools.reduce((n, v) => n + v.ms, 0))
      out.push(sortableTable('tools', [
        { key: 'name', label: T.col.tool, value: (v) => v.name, cell: (v) => kindEl(v.kind, v.name) },
        { key: 'n', label: T.col.calls, cls: 'r num', width: '84px', value: (v) => v.n, cell: (v) => fmtInt(v.n) },
        { key: 'ms', label: T.col.total, cls: 'r num', width: '100px', value: (v) => v.ms, cell: (v) => fmtDur(v.ms) },
        { key: 'avg', label: T.col.avg, cls: 'r num', width: '90px', hide: 'sm', value: (v) => v.ms / v.n, cell: (v) => fmtDur(v.ms / v.n) },
        { key: 'fail', label: T.col.fails, cls: 'r num', width: '84px', hide: 'sm', value: (v) => v.fail, cell: (v) => (v.fail ? h('span', { class: 'tx-fail' }, v.fail) : '0') },
        { key: 'share', label: T.col.share, width: '30%', hide: 'sm', value: (v) => v.ms, cell: (v) => h('div', { class: 'meter' }, meter(v.ms / totalMs), h('span', { class: 'num faint' }, `${pct(v.ms, totalMs)}%`)) },
      ], tools, () => ({ class: 'static' }), '560px', true))
    }
    return out
  }

  function activityChart() {
    const turns = data.turns.slice(-CHART_MAX)
    const t1 = now()
    const W = chartWidth()
    const H = 120
    const left = 46
    const plotW = W - left
    const durs = turns.map((t) => (t.end ?? t1) - t.start)
    const max = Math.max(1000, ...durs)
    const bw = plotW / Math.max(1, turns.length)
    const inner = Math.max(2, Math.min(32, bw * 0.7))
    const svgEl = s('svg', { viewBox: `0 0 ${W} ${H + 14}`, height: H + 14, role: 'img', 'aria-label': T.perActivity })
    const axis = s('g', { class: 'axis' })
    for (const f of [0, 0.5, 1]) {
      const y = H - f * H
      axis.append(s('line', { x1: left, x2: W, y1: y, y2: y }), s('text', { x: left - 6, y: y + 3, 'text-anchor': 'end' }, fmtDur(max * f)))
    }
    svgEl.append(axis)
    turns.forEach((t, i) => {
      const hgt = (durs[i] / max) * H
      const color = !t.end ? 'var(--accent)' : t.reason === 'aborted' || t.reason === 'error' || t.reason === 'refusal' ? 'var(--fail)' : 'var(--c-write)'
      const x = left + i * bw + (bw - inner) / 2
      svgEl.append(s('rect', { x, y: H - hgt, width: inner, height: Math.max(1, hgt), style: { fill: color } }))
      if (turns.length <= 40) svgEl.append(s('text', { x: x + inner / 2, y: H + 12, 'text-anchor': 'middle', class: 'axis-label' }, `#${t.n}`))
      svgEl.append(s('rect', {
        class: 'hit', x: left + i * bw, y: 0, width: bw, height: H,
        onmousemove: (ev) => showTip(ev, `#${t.n} ${t.prompt || T.continuation}`, [
          [T.col.duration, fmtDur(durs[i])], [T.col.tools, String(t.calls)], [T.col.req, String(t.api)],
          [T.col.inTok, fmtTok(t.tokIn)], [T.col.outTok, fmtTok(t.tokOut)], [T.col.fails, String(t.fails)],
        ]),
        onmouseleave: hideTip,
        onclick: () => {
          ui.view = 'activities'
          ui.turnsTouched = true
          ui.openTurns = new Set([t.id])
          render()
        },
      }))
    })
    return chartBox(svgEl, null)
  }

  // The share of the machine's memory in use over the samples kept, as an area from 0 to 100%
  function memChart() {
    const W = chartWidth()
    const H = 96
    const left = 46
    const plotW = W - left
    const pts = memory.map((m) => ({ at: m.at, used: (m.total - m.free) / m.total }))
    const t0 = pts[0].at
    const span = Math.max(1, pts.at(-1).at - t0)
    const x = (at) => left + ((at - t0) / span) * plotW
    const y = (f) => H - f * H
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.used).toFixed(1)}`).join('')
    const svgEl = s('svg', { viewBox: `0 0 ${W} ${H + 14}`, height: H + 14, role: 'img', 'aria-label': T.memory })
    const axis = s('g', { class: 'axis' })
    for (const f of [0, 0.5, 1]) {
      axis.append(s('line', { x1: left, x2: W, y1: y(f), y2: y(f) }), s('text', { x: left - 6, y: y(f) + 3, 'text-anchor': 'end' }, `${f * 100}%`))
    }
    svgEl.append(axis,
      s('path', { class: 'mem-area', d: `${line}L${x(pts.at(-1).at).toFixed(1)},${H}L${left},${H}Z` }),
      s('path', { class: 'mem-line', d: line }),
      s('text', { x: left, y: H + 12, class: 'axis-label' }, T.memChart(fmtDur(span))))
    // One target over the plot: the sample nearest the pointer goes in the tooltip
    svgEl.append(s('rect', {
      class: 'hit mem', x: left, y: 0, width: plotW, height: H,
      onmousemove: (ev) => {
        const r = ev.currentTarget.getBoundingClientRect()
        const at = t0 + ((ev.clientX - r.left) / r.width) * span
        const m = memory.reduce((best, s1) => (Math.abs(s1.at - at) < Math.abs(best.at - at) ? s1 : best))
        showTip(ev, fmtClock(m.at), [
          [T.memory, `${pct(m.total - m.free, m.total)}%`], ['', T.memUsed(fmtBytes(m.total - m.free), fmtBytes(m.total))],
        ])
      },
      onmouseleave: hideTip,
    }))
    return chartBox(svgEl, null)
  }

  // ---------------------------------------------------------------------------
  // Insights, read-only: the mod sends them with their texts; marking stays in the terminal
  // ---------------------------------------------------------------------------

  function insightsView() {
    const v = data.insightsView
    if (!v) return [empty(T.insightsOff)]
    const out = []
    if (v.history) out.push(h('p', { class: 'note' }, T.historyLine(v.history)))
    const q = ui.search.trim().toLowerCase()
    const list = v.findings.filter((f) => !q || `${f.title} ${f.hint}`.toLowerCase().includes(q))
    if (!v.findings.length) out.push(empty(T.noFindings))
    else if (!list.length) out.push(empty(T.emptyFiltered))
    else {
      out.push(h('div', { class: 'findings' }, list.map((f) => h('div', { class: `finding sev-${f.severity}` },
        h('div', { class: 'finding-head' },
          h('span', { class: 'sev' }, T.severity[f.severity] ?? f.severity),
          h('span', { class: 'finding-title' }, f.title),
          f.applied ? h('span', { class: 'applied' }, T.applied) : null),
        h('div', { class: 'finding-hint' }, f.hint)))))
    }
    if (v.trends.length) {
      out.push(sectionTitle(T.trends))
      out.push(h('ul', { class: 'trends' }, v.trends.map((t) => h('li', { class: t.better ? 'better' : null }, t.text))))
    }
    out.push(h('p', { class: 'note' }, T.markHint))
    if (v.aiHint) out.push(h('p', { class: 'note ai-hint' }, v.aiHint))
    return out
  }

  // ---------------------------------------------------------------------------
  // Detail drawer
  // ---------------------------------------------------------------------------

  const kv = (pairs) => h('dl', { class: 'kv' }, pairs.filter(Boolean).flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]))

  function spanDetail(sp) {
    const agents = agentsById()
    const D = T.detail
    const st = spanState(sp)
    const t1 = now()
    const turn = turnById(sp.turn)
    const body = [kv([
      [D.status, statusEl(st)],
      [D.kind, kindEl(sp.kind, T.kinds[sp.kind])],
      [D.agent, agentName(agents, sp.agent)],
      turn ? [D.activity, `#${turn.n} ${turn.prompt || T.continuation}`] : null,
      [D.start, fmtClock(sp.start)],
      sp.end ? [D.end, fmtClock(sp.end)] : null,
      [D.duration, h('span', { class: 'num', ...live(sp) }, fmtDur((sp.end ?? t1) - sp.start))],
      turn ? [D.offset, h('span', { class: 'num' }, `+${fmtDur(Math.max(0, sp.start - turn.start))}`)] : null,
    ])]
    if (sp.kind === 'api') {
      const n = apiNumbers(sp)
      body.push(h('h3', null, D.tokens), kv([
        [D.model, sp.name],
        [T.col.fresh, h('span', { class: 'num' }, fmtInt(n.tin))],
        [T.col.read, h('span', { class: 'num' }, fmtInt(n.cr))],
        [T.col.write, h('span', { class: 'num' }, fmtInt(n.cw))],
        n.w5 ? [D.w5, h('span', { class: 'num' }, fmtInt(n.w5))] : null,
        n.w1h ? [D.w1h, h('span', { class: 'num' }, fmtInt(n.w1h))] : null,
        [T.col.prompt, h('span', { class: 'num' }, fmtInt(n.prompt))],
        [T.col.hit, h('span', { class: n.miss ? 'num tx-warn' : 'num' }, `${n.hit}%`)],
        [T.col.out, h('span', { class: 'num' }, fmtInt(n.tout))],
        [D.first, sp.meta?.first ? D.yes : D.no],
      ]))
    } else {
      body.push(h('h3', null, D.argument), h('pre', null, sp.label || '—'), h('p', { class: 'note' }, D.argumentNote))
    }
    if (sp.child && agents.has(sp.child)) {
      body.push(h('button', { class: 'link-btn', type: 'button', onclick: () => select({ type: 'agent', id: sp.child }) }, D.openAgent))
    }
    return { title: `${T.kinds[sp.kind]} · ${sp.name}`, body }
  }

  function agentDetail(a) {
    const agents = agentsById()
    const D = T.detail
    const t1 = now()
    const isMain = a.id === 'main'
    const st = isMain ? null : !a.end ? 'running' : a.status
    const calls = data.spans.filter((sp) => sp.agent === a.id).slice(-30).reverse()
    const body = [kv([
      st ? [D.status, statusEl(st)] : null,
      a.type ? [D.type, a.type] : null,
      a.parent ? [D.parent, agentName(agents, a.parent)] : null,
      [D.start, fmtClock(a.start)],
      [D.duration, h('span', { class: 'num' }, fmtDur((a.end ?? t1) - a.start))],
      [D.calls, h('span', { class: 'num' }, `${a.calls} · ${a.api} ${T.col.req.toLowerCase()}`)],
      [D.tokens, h('span', { class: 'num' }, `${fmtTok(a.tokIn)} ${T.col.inTok.toLowerCase()} / ${fmtTok(a.tokOut)} ${T.col.outTok.toLowerCase()}`)],
      a.ttl ? [D.ttl, a.ttl === 'mixed' ? '5m+1h' : a.ttl] : null,
      a.cacheAt ? [D.cacheAt, `${fmtClock(a.cacheAt)} (${T.ago(fmtDur(t1 - a.cacheAt))})`] : null,
    ])]
    if (a.recent.length) body.push(h('h3', null, D.recent), h('pre', null, a.recent.join('\n')))
    body.push(h('button', {
      class: 'link-btn',
      type: 'button',
      onclick: () => {
        ui.agent = a.id
        ui.view = 'timeline'
        render()
      },
    }, D.inTimeline))
    if (calls.length) {
      body.push(h('h3', null, `${D.agentCalls} (${calls.length})`))
      body.push(h('table', { class: 'grid' }, h('tbody', null, calls.map((sp) => h('tr', { onclick: () => select({ type: 'span', id: sp.id }) },
        h('td', null, kindEl(sp.kind, sp.name)),
        h('td', { class: 'r num dim', style: { width: '76px' } }, fmtDur((sp.end ?? t1) - sp.start)),
        h('td', { style: { width: '30px' } }, h('span', { class: `status dot-only st-${spanState(sp)}`, title: T.status[spanState(sp)] })))))))
    }
    return { title: agentTitle(a), body }
  }

  function renderDetail() {
    const panel = $('detail')
    let content = null
    if (data && ui.selected?.type === 'span') {
      const sp = data.spans.find((x) => x.id === ui.selected.id)
      if (sp) content = spanDetail(sp)
    } else if (data && ui.selected?.type === 'agent') {
      const a = data.agents.find((x) => x.id === ui.selected.id)
      if (a) content = agentDetail(a)
    }
    $('scrim').hidden = !content
    if (!content) {
      panel.hidden = true
      return
    }
    panel.hidden = false
    $('detail-title').textContent = content.title
    const scroll = $('detail-body').scrollTop
    $('detail-body').replaceChildren(...content.body)
    $('detail-body').scrollTop = scroll
  }

  // ---------------------------------------------------------------------------
  // Chrome: header, navigation, toolbar
  // ---------------------------------------------------------------------------

  // The session's badge, as its terminal shows it: on the header, in the tab's title and as its icon
  const BADGE_HEX = { cyan: '#3fb8d0', magenta: '#d468b8', blue: '#5b8ff9', green: '#46b383' }
  const BADGE_SHAPES = {
    '●': '<circle cx="16" cy="16" r="13"/>',
    '■': '<rect x="4" y="4" width="24" height="24" rx="3"/>',
    '▲': '<polygon points="16,3 30,28 2,28"/>',
    '★': '<polygon points="16,2 20.2,11.6 30.6,12.4 22.6,19.2 25.2,29.4 16,24 6.8,29.4 9.4,19.2 1.4,12.4 11.8,11.6"/>',
  }
  let iconKey = ''
  function renderIdentity() {
    const b = data?.session
    const el = $('badge')
    if (!b || !BADGE_SHAPES[b.mark]) {
      el.hidden = true
      document.title = 'Session Radar'
      return
    }
    const ended = conn === 'ended' || conn === 'unauthorized'
    const color = BADGE_HEX[b.color] ? b.color : 'blue'
    el.hidden = false
    el.className = `badge b-${color}${ended ? ' ended' : ''}`
    el.title = T.badgeTip(b.code, b.cwd)
    el.replaceChildren(
      h('span', { class: 'badge-mark' }, b.mark),
      h('span', { class: 'badge-code' }, b.code),
      b.project ? h('span', { class: 'badge-project' }, b.project) : null,
      b.model ? h('span', { class: 'badge-model' }, b.model) : null,
    )
    $('top').className = `top b-${color}${ended ? ' ended' : ''}`
    document.title = ended
      ? `✕ ${b.code} · ${T.endedTitle} · Session Radar`
      : `${b.mark} ${b.code}${b.project ? ` · ${b.project}` : ''} · Session Radar`
    const key = `${b.mark}${color}${ended}`
    if (key !== iconKey) {
      iconKey = key
      const fill = ended ? '#687081' : BADGE_HEX[color]
      const svg = `<svg xmlns="${SVG}" viewBox="0 0 32 32" fill="${fill}">${BADGE_SHAPES[b.mark]}</svg>`
      $('favicon').href = `data:image/svg+xml,${encodeURIComponent(svg)}`
    }
  }

  function renderHeader() {
    renderIdentity()
    const c = $('conn')
    c.className = `conn ${conn === 'live' ? 'live' : conn === 'stale' || conn === 'reconnecting' ? 'stale' : conn === 'connecting' ? '' : 'down'}`
    $('conn-text').textContent = T.conn[conn]

    const m = $('metrics')
    if (!data) {
      m.replaceChildren()
      return
    }
    const t = data.totals
    const fails = t.errors + t.denied
    const items = [
      [T.metrics.elapsed, fmtDur(now() - Date.parse(data.startedAt)), '', Date.parse(data.startedAt)],
      [T.metrics.turns, data.turns.length],
      [T.metrics.calls, t.calls],
      [T.metrics.api, t.api],
      [T.metrics.agents, t.agents],
      [T.metrics.mcp, t.mcp],
      [T.metrics.web, t.web],
      [T.metrics.fails, fails, fails ? 'tx-fail' : ''],
    ]
    m.replaceChildren(...items.map(([k, v, cls, since]) => h('div', null, h('dt', null, k), h('dd', { class: cls || null, 'data-since': since }, v))))
  }

  function renderNav() {
    const counts = data ? {
      home: null,
      activities: data.turns.length,
      insights: data.insightsView ? data.insightsView.findings.length : null,
      timeline: data.spans.length,
      agents: data.agents.length - 1,
      tokens: data.totals.api,
    } : {}
    $('nav').replaceChildren(...VIEWS.map((v, i) => h('button', {
      type: 'button',
      'aria-current': ui.view === v ? 'page' : null,
      onclick: () => {
        ui.view = v
        remember()
        render()
      },
    },
    h('span', { class: 'nav-label' }, h('kbd', null, i + 1), T.views[v]),
    counts[v] != null ? h('span', { class: 'count' }, counts[v]) : null)))
  }

  function segButtons(id, entries, isOn, onPress) {
    $(id).replaceChildren(...entries.map(([key, label, swatch]) => h('button', {
      type: 'button',
      'aria-pressed': String(isOn(key)),
      onclick: () => {
        onPress(key)
        render()
      },
    }, swatch ? h('span', { class: 'swatch', style: { background: swatch } }) : null, label)))
  }

  function renderToolbar() {
    const v = ui.view
    const search = $('search')
    search.placeholder = T.search
    $('kinds').hidden = !(v === 'timeline' || v === 'activities')
    $('statuses').hidden = !(v === 'timeline' || v === 'activities' || v === 'tokens')
    $('agent-filter').hidden = !(v === 'timeline' || v === 'tokens')
    $('windows').hidden = v !== 'timeline'

    segButtons('kinds', KINDS.filter((k) => v !== 'activities' || k !== 'api').map((k) => [k, T.kinds[k], `var(--k-${k})`]),
      (k) => ui.kinds.has(k),
      (k) => {
        // The first press singles a kind out; later presses add or remove kinds
        if (ui.kinds.size === KINDS.length) ui.kinds = new Set([k])
        else if (ui.kinds.has(k)) ui.kinds.delete(k)
        else ui.kinds.add(k)
        if (!ui.kinds.size) ui.kinds = new Set(KINDS)
      })
    segButtons('statuses', Object.entries(T.statusFilter), (k) => ui.status === k, (k) => { ui.status = k })
    segButtons('windows', Object.entries(T.windows), (k) => ui.window === k, (k) => {
      ui.window = k
      remember()
    })

    const sel = $('agent-filter')
    const agents = data?.agents ?? []
    if (ui.agent !== 'all' && !agents.some((a) => a.id === ui.agent)) ui.agent = 'all'
    const sig = JSON.stringify([T.allAgents, agents.map((a) => [a.id, agentTitle(a)])])
    if (sig !== agentsSig) {
      agentsSig = sig
      sel.replaceChildren(
        h('option', { value: 'all' }, T.allAgents),
        ...agents.map((a) => h('option', { value: a.id }, a.id === 'main' ? T.mainSession : agentTitle(a))))
    }
    sel.value = ui.agent
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // A redraw replaces the rows, so one that is not asked for waits while a press is under way, text is
  // selected or a dropdown is open: the click, the selection and the dropdown would be lost
  function canRender() {
    const sel = window.getSelection()
    return !pointerDown && (!sel || sel.isCollapsed) && document.activeElement?.tagName !== 'SELECT'
  }

  function render() {
    dirty = false
    document.documentElement.lang = T === I18N.pt ? 'pt-BR' : 'en'
    const version = typeof data?.version === 'string' && /^\d+\.\d+\.\d+$/.test(data.version) ? data.version : ''
    $('credit').textContent = version ? `${T.credit} · v${version}` : T.credit
    $('hint').textContent = T.hint
    renderHeader()
    renderNav()
    renderToolbar()

    const view = $('view')
    // A view opens at its top, the timeline at its newest end
    const switched = ui.view !== shownView
    shownView = ui.view
    const atBottom = switched || view.scrollHeight - view.scrollTop - view.clientHeight < 8
    const top = switched ? 0 : view.scrollTop
    let content
    if (!data) content = [empty(conn === 'noToken' || conn === 'unauthorized' || conn === 'ended' ? T.conn[conn] : T.emptyWaiting)]
    else if (ui.view === 'timeline') content = timelineView()
    else if (ui.view === 'activities') content = activitiesView()
    else if (ui.view === 'insights') content = insightsView()
    else if (ui.view === 'agents') content = agentsView()
    else if (ui.view === 'tokens') content = tokensView()
    else content = homeView()
    view.replaceChildren(...content.filter(Boolean))
    // The timeline follows the newest call while the view sits at its end
    view.scrollTop = ui.view === 'timeline' && atBottom ? view.scrollHeight : top
    renderDetail()
  }

  // Running items and countdowns move on their own between snapshots
  let ticks = 0
  setInterval(() => {
    if (!data) return
    ticks++
    if (conn === 'live' && Date.now() - receivedAt > STALE_MS) {
      conn = 'stale'
      renderHeader()
    }
    tickLive()
    if (!canRender()) return
    const running = data.spans.some((sp) => !sp.end)
    const clockBound = (ui.view === 'timeline' && running) || ui.view === 'tokens'
    if (dirty || (clockBound && ticks % 5 === 0)) render()
  }, 1000)

  function tickLive() {
    const t1 = now()
    for (const el of document.querySelectorAll('[data-since]')) {
      el.textContent = fmtDur(t1 - Number(el.getAttribute('data-since')))
    }
  }

  // ---------------------------------------------------------------------------
  // Connection: server-sent events from the local server, with the view token
  // ---------------------------------------------------------------------------

  // A heartbeat carries the same session with a newer clock: the clock is taken, nothing is redrawn
  let lastSig = ''
  function receive(text) {
    const next = JSON.parse(text)
    if (!next) return
    const { now: _now, exportedAt: _at, ...rest } = next
    const sig = JSON.stringify(rest)
    const same = sig === lastSig && conn === 'live'
    lastSig = sig
    data = next
    receivedAt = Date.now()
    offset = Date.now() - (data.now ?? Date.now())
    T = I18N[data.lang] ?? T
    conn = 'live'
    failures = 0
    if (same) return
    dirty = true
    if (canRender()) render()
  }

  function connect() {
    if (!token) {
      render()
      return
    }
    es = new EventSource(`/api/events?t=${encodeURIComponent(token)}`)
    es.addEventListener('open', () => {
      failures = 0
      if (conn !== 'live') {
        conn = data ? 'live' : 'connecting'
        renderHeader()
      }
    })
    es.addEventListener('state', (ev) => {
      try {
        receive(ev.data)
      } catch {
        // A snapshot that does not parse is skipped; the next one replaces it
      }
    })
    // Memory samples from the server: the ones so far on connecting, then one at a time. Only newer
    // ones are kept, so a reconnect does not repeat them; Home redraws on the next tick.
    es.addEventListener('system', (ev) => {
      try {
        for (const m of JSON.parse(ev.data).memory ?? []) {
          if (m.total > 0 && (!memory.length || m.at > memory.at(-1).at)) memory.push(m)
        }
        if (memory.length > MEM_KEEP) memory = memory.slice(-MEM_KEEP)
        if (ui.view === 'home') dirty = true
      } catch {
        // A sample that does not parse is skipped
      }
    })
    es.addEventListener('bye', () => {
      es.close()
      conn = 'ended'
      render()
    })
    es.addEventListener('error', async () => {
      if (conn === 'ended') return
      if (es.readyState === EventSource.CLOSED) {
        // Closed for good: find out whether the token was refused or the server is gone
        try {
          const res = await fetch(`/api/state?t=${encodeURIComponent(token)}`, { cache: 'no-store' })
          conn = res.status === 401 ? 'unauthorized' : 'reconnecting'
        } catch {
          conn = 'ended'
        }
        render()
        if (conn === 'reconnecting') setTimeout(connect, 2000)
      } else if (++failures > 5) {
        // The server is gone without a goodbye (Claude Code closed or the mod reloaded)
        es.close()
        conn = 'ended'
        render()
      } else {
        conn = 'reconnecting'
        renderHeader()
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  $('search').addEventListener('input', (ev) => {
    ui.search = ev.target.value
    render()
  })
  $('agent-filter').addEventListener('change', (ev) => {
    ui.agent = ev.target.value
    render()
  })
  $('detail-close').addEventListener('click', () => select(null))
  $('scrim').addEventListener('click', () => select(null))

  document.addEventListener('pointerdown', () => {
    pointerDown = true
  })
  document.addEventListener('pointerup', () => {
    // After the click this press makes has run
    setTimeout(() => {
      pointerDown = false
      if (dirty && canRender()) render()
    }, 0)
  })
  document.addEventListener('mousemove', (ev) => {
    if (!tip.hidden && !ev.target.closest?.('.hit')) hideTip()
  })

  document.addEventListener('keydown', (ev) => {
    const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)
    if (ev.key === 'Escape') {
      if (typing) {
        document.activeElement.blur()
      } else if (ui.selected) {
        select(null)
      } else if (ui.search) {
        ui.search = ''
        $('search').value = ''
        render()
      }
      return
    }
    if (typing || ev.ctrlKey || ev.metaKey || ev.altKey) return
    if (ev.key === '/') {
      ev.preventDefault()
      $('search').focus()
    } else if (/^[1-6]$/.test(ev.key)) {
      ui.view = VIEWS[Number(ev.key) - 1]
      remember()
      render()
    }
  })

  // Charts are drawn to the view's width: draw again when it changes (window, drawer, rotation)
  let resizeTimer = null
  let lastWidth = 0
  new ResizeObserver(([entry]) => {
    const w = Math.round(entry.contentRect.width)
    if (Math.abs(w - lastWidth) < 4) return
    lastWidth = w
    if (ui.view !== 'tokens' && ui.view !== 'home') return
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(render, 100)
  }).observe($('view'))

  render()
  connect()
})()
