// Copyright 2026 Neural Seam
// SPDX-License-Identifier: Apache-2.0

// The radar's web view. It reads the snapshot the mod sends to the local server and draws it; it
// collects nothing itself and sends nothing anywhere. Every value from the session is put on the
// page as text (textContent), never as markup.

'use strict'

;(() => {
  const I18N = {
    en: {
      views: { home: 'Home', activities: 'Activities', insights: 'Insights', timeline: 'Timeline', agents: 'Agents', tokens: 'Tokens', hooks: 'Hooks', qa: 'Q&A' },
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
      metrics: { elapsed: 'session', turns: 'turns', calls: 'tools', mcp: 'MCP', web: 'web', agents: 'subagents', api: 'requests', fails: 'failures', hooks: 'hooks', sessions: 'live' },
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
      hint: '1–8 switch views · / search · Esc close',
      qaIntro: 'Questions about the radar and this page. Type in the search to find one.',
      allSessions: (n) => `All sessions (${n})`, nSessions: (n) => `${n} ${n === 1 ? 'session' : 'sessions'}`,
      sessionTip: 'Every Claude Code session on this machine that has the radar sends here. Pick one, or see all of them.',
      sessAlive: 'live', sessBusy: (p) => `working: ${p}`, sessIdle: 'waiting for a prompt',
      pickSession: 'This view shows one session at a time: pick one in the header, or below.',
      noHooks: 'No hook events yet. Every hook event Claude Code raises (PreToolUse, PostToolUse, Stop, SessionStart, Notification, …) shows up here, whether or not a hook of yours is configured for it.',
      hookNote: 'Time is what the hooks beneath the radar took; the result is what they answered. Events with no hook configured pass with no action.',
      allEvents: 'All events', hooksIn: (n) => `Hooks of this activity (${n})`,
      hooksCapped: (n, all) => `Showing the newest ${n} of ${all}.`, pieces: (n) => `${n} pieces`,
      hookOut: {
        allow: 'allowed', ask: 'asked', deny: 'denied', block: 'blocked', stop: 'stopped', ctx: (n) => `+${n} context`,
        rewrote: 'changed', retry: 'retry', title: 'titled', none: 'no action',
      },
      hookCol: { time: 'Time', session: 'Session', event: 'Event', target: 'Target', activity: 'Activity', result: 'Result' },
      hookDetail: { event: 'Event', session: 'Session', target: 'Target', result: 'Result', reason: 'Reason', context: 'Context added', title: 'Session title', pieces: 'Pieces shown' },
      badgeTip: (code, cwd) => `Session ${code}${cwd ? ` in ${cwd}` : ''}. The same badge shows under the prompt of its terminal while this view is open.`,
      endedTitle: 'ended',
      credit: 'Session Radar · by Neural Seam · neuralseam.cloud',
      notifyOn: 'Turn on browser notifications',
      notifyOnTip: 'The radar’s notifications, from your system, while this tab is in the background. Turn them on in /radar-config first.',
      noticeClose: 'Click to close',
      adTag: 'Ad', adLabel: 'Advertisement',
    },
    pt: {
      views: { home: 'Início', activities: 'Atividades', insights: 'Insights', timeline: 'Tempo', agents: 'Agentes', tokens: 'Tokens', hooks: 'Hooks', qa: 'Perguntas' },
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
      metrics: { elapsed: 'sessão', turns: 'turnos', calls: 'ferramentas', mcp: 'MCP', web: 'web', agents: 'subagentes', api: 'requisições', fails: 'falhas', hooks: 'hooks', sessions: 'ao vivo' },
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
      hint: '1–8 trocam a visão · / busca · Esc fecha',
      qaIntro: 'Perguntas sobre o radar e esta página. Digite na busca para achar uma.',
      allSessions: (n) => `Todas as sessões (${n})`, nSessions: (n) => `${n} ${n === 1 ? 'sessão' : 'sessões'}`,
      sessionTip: 'Toda sessão do Claude Code nesta máquina que tem o radar envia para cá. Escolha uma, ou veja todas.',
      sessAlive: 'ao vivo', sessBusy: (p) => `trabalhando: ${p}`, sessIdle: 'aguardando prompt',
      pickSession: 'Esta visão mostra uma sessão por vez: escolha uma no cabeçalho ou abaixo.',
      noHooks: 'Nenhum evento de hook ainda. Todo evento de hook do Claude Code (PreToolUse, PostToolUse, Stop, SessionStart, Notification, …) aparece aqui, tenha você um hook configurado para ele ou não.',
      hookNote: 'O tempo é o que os hooks abaixo do radar levaram; o resultado é o que eles responderam. Eventos sem hook configurado passam sem ação.',
      allEvents: 'Todos os eventos', hooksIn: (n) => `Hooks desta atividade (${n})`,
      hooksCapped: (n, all) => `Mostrando os ${n} mais recentes de ${all}.`, pieces: (n) => `${n} partes`,
      hookOut: {
        allow: 'permitiu', ask: 'perguntou', deny: 'negou', block: 'bloqueou', stop: 'parou', ctx: (n) => `+${n} contexto`,
        rewrote: 'alterou', retry: 'repetir', title: 'deu título', none: 'sem ação',
      },
      hookCol: { time: 'Hora', session: 'Sessão', event: 'Evento', target: 'Alvo', activity: 'Atividade', result: 'Resultado' },
      hookDetail: { event: 'Evento', session: 'Sessão', target: 'Alvo', result: 'Resultado', reason: 'Motivo', context: 'Contexto adicionado', title: 'Título da sessão', pieces: 'Partes exibidas' },
      badgeTip: (code, cwd) => `Sessão ${code}${cwd ? ` em ${cwd}` : ''}. O mesmo crachá aparece abaixo do prompt do terminal dela enquanto esta visão está aberta.`,
      endedTitle: 'encerrada',
      credit: 'Session Radar · por Neural Seam · neuralseam.cloud',
      notifyOn: 'Ativar notificações do navegador',
      notifyOnTip: 'As notificações do radar, pelo sistema, enquanto esta aba está em segundo plano. Ligue-as antes em /radar-config.',
      noticeClose: 'Clique para fechar',
      adTag: 'Anúncio', adLabel: 'Anúncio',
    },
  }

  const KINDS = ['tool', 'mcp', 'web', 'agent', 'api']
  // The first three match the terminal pane's tabs 1 to 3
  const VIEWS = ['home', 'activities', 'insights', 'timeline', 'agents', 'tokens', 'hooks', 'qa']
  // The views that show every session together when no single one is picked; Q&A needs none
  const MERGED = ['home', 'activities', 'hooks', 'qa']
  const HOOKS_SHOWN = 400
  const MEM_KEEP = 300
  const TTL_MS = { '5m': 5 * 60_000, '1h': 60 * 60_000 }
  const WINDOW_MS = { '15m': 15 * 60_000, '5m': 5 * 60_000, '1m': 60_000 }
  const STALE_MS = 15_000
  const NOTICE_MS = 8000
  // Ads, embedded in the page: nothing is loaded to show one, and nobody is told it was shown. The
  // first is the house ad; others join the list in a release
  const ADS = [{
    id: 'premium',
    href: 'https://neuralseam.cloud/premium',
    en: { title: 'Neural Seam Premium', body: 'Take your Claude Code projects further, from plan to delivery.', cta: 'See Premium →' },
    pt: { title: 'Neural Seam Premium', body: 'Leve seus projetos com o Claude Code mais longe, do plano à entrega.', cta: 'Conheça o Premium →' },
  }]
  // The Q&A view: questions about the radar itself, in the page's two languages. Text only, drawn as
  // text like everything else
  const QA = {
    en: [
      ['Getting started', [
        ['How do I open this page?', 'Run /radar-web in any Claude Code session that has the radar, or press w in the /radar pane. The terminal names the address, and the page opens in your default browser.'],
        ['It says it is waiting for the first snapshot.', 'The server is up but no session has sent anything yet. Send a prompt in a session with the radar; it shows up here within a second.'],
        ['What are the keyboard shortcuts?', '1 to 8 switch views, / goes to the search, Esc closes the detail panel or clears the search.'],
      ]],
      ['Sessions', [
        ['How do I see several sessions?', 'Run /radar-web in one of them. Every other session with the radar on this machine finds the page on its own within about 5 seconds, and shows its badge under the prompt. Pick one in the header, or All sessions to see them together.'],
        ['Where does a session\'s name come from?', 'From the title Claude Code gives the session: the one you set with /rename, or the one it made up. A new name shows after the session\'s next prompt. Without a title, the folder name is used.'],
        ['Which views show all sessions together?', 'Home shows one card per session; Activities and Hooks merge them, with a column naming each row\'s session. Timeline, Agents, Tokens and Insights show one session at a time: pick one in the header.'],
        ['What does "ended" mean?', 'The session closed, or sent nothing for 20 seconds. It stays on the page for 30 minutes, so you can still look at it, then the server drops it.'],
        ['I closed the terminal that opened the page.', 'Another session with the radar starts the server again on the same address within a few seconds, and the page carries on.'],
        ['How do I stop it?', '/radar-web stop, in any session, ends the page for every session. None starts it again until someone runs /radar-web.'],
      ]],
      ['Hooks', [
        ['What does the Hooks view list?', 'Every hook event Claude Code raises (PreToolUse, PostToolUse, Stop, SessionStart, Notification, and the rest), whether or not you configured a hook for it. Each activity also lists its own hooks.'],
        ['What do the results mean?', 'allowed, asked and denied are a PreToolUse hook\'s decision; blocked is a hook that blocked the event (exit code 2, or decision "block"); +N context is text a hook handed to the model; no action means no hook answered.'],
        ['What is the duration?', 'How long the hooks beneath the radar took to answer: your configured hooks, and Claude Code\'s own handling of the event.'],
        ['The Hooks view stays empty.', 'Where an organization manages Claude Code, hook events only reach the plugins its managed settings list. Otherwise, wait for the first event: SessionStart fires when a session starts, PreToolUse before every tool call.'],
      ]],
      ['The other views', [
        ['Activities', 'One row per prompt you sent, with every tool it called, its hooks, failures, requests and tokens. Click a row to open it.'],
        ['Timeline', 'Every call as a bar over time. Filter by kind, status, agent and time window; subagents\' calls are indented under them.'],
        ['Agents', 'The main session and every subagent, with their calls, requests and tokens.'],
        ['Tokens', 'Each request to the model: new input, cache read, cache written, output. A highlighted row probably lost the cache.'],
        ['Insights', 'Suggestions for your Claude Code setup, from this session and earlier ones of the project. Off by default: turn them on in /radar-config.'],
      ]],
      ['Privacy', [
        ['Does anything leave my machine?', 'No. The server listens on 127.0.0.1 only, the page loads nothing from elsewhere, and the radar calls no model and sends no telemetry.'],
        ['What does the radar keep?', 'For each call or hook, one line of at most 120 characters; for each prompt, its first 120 characters. Never Claude\'s replies, tool output, or the text of a message. It is gone when the session ends.'],
        ['Who can open this page?', 'Anyone on this machine who has its address, or who can read session-radar/hub.json in your Claude Code configuration directory. Treat the address like the export file.'],
      ]],
    ],
    pt: [
      ['Começando', [
        ['Como abro esta página?', 'Rode /radar-web em qualquer sessão do Claude Code que tenha o radar, ou aperte w no painel do /radar. O terminal mostra o endereço, e a página abre no seu navegador padrão.'],
        ['Aparece "aguardando o primeiro envio".', 'O servidor está no ar, mas nenhuma sessão enviou nada ainda. Mande um prompt numa sessão com o radar; ela aparece aqui em um segundo.'],
        ['Quais são os atalhos de teclado?', '1 a 8 trocam a visão, / vai para a busca, Esc fecha o painel de detalhe ou limpa a busca.'],
      ]],
      ['Sessões', [
        ['Como vejo várias sessões?', 'Rode /radar-web em uma delas. Toda outra sessão com o radar nesta máquina encontra a página sozinha em uns 5 segundos e mostra o crachá abaixo do prompt. Escolha uma no cabeçalho, ou Todas as sessões para ver juntas.'],
        ['De onde vem o nome de uma sessão?', 'Do título que o Claude Code dá à sessão: o que você definiu com /rename, ou o que ele criou. Um nome novo aparece depois do próximo prompt da sessão. Sem título, aparece o nome da pasta.'],
        ['Quais visões mostram todas as sessões juntas?', 'O Início mostra um card por sessão; Atividades e Hooks juntam todas, com uma coluna dizendo de qual sessão é cada linha. Tempo, Agentes, Tokens e Insights mostram uma sessão por vez: escolha no cabeçalho.'],
        ['O que significa "encerrada"?', 'A sessão foi fechada, ou passou 20 segundos sem enviar nada. Ela fica na página por 30 minutos, para você ainda consultar, e depois o servidor a remove.'],
        ['Fechei o terminal que abriu a página.', 'Outra sessão com o radar sobe o servidor de novo no mesmo endereço em alguns segundos, e a página continua.'],
        ['Como paro?', '/radar-web stop, em qualquer sessão, encerra a página para todas. Nenhuma a reabre até alguém rodar /radar-web.'],
      ]],
      ['Hooks', [
        ['O que a visão Hooks lista?', 'Todo evento de hook que o Claude Code dispara (PreToolUse, PostToolUse, Stop, SessionStart, Notification e os demais), tenha você configurado um hook para ele ou não. Cada atividade também lista os próprios hooks.'],
        ['O que significam os resultados?', 'permitiu, perguntou e negou são a decisão de um hook de PreToolUse; bloqueou é um hook que barrou o evento (exit code 2, ou decision "block"); +N contexto é texto que um hook entregou ao modelo; sem ação quer dizer que nenhum hook respondeu.'],
        ['O que é a duração?', 'Quanto tempo os hooks abaixo do radar levaram para responder: os hooks que você configurou e o tratamento do próprio Claude Code para o evento.'],
        ['A visão Hooks fica vazia.', 'Onde uma organização gerencia o Claude Code, os eventos de hook só chegam aos plugins listados nas configurações gerenciadas. Fora isso, espere o primeiro evento: SessionStart dispara quando uma sessão começa, PreToolUse antes de cada chamada de ferramenta.'],
      ]],
      ['As outras visões', [
        ['Atividades', 'Uma linha por prompt que você enviou, com cada ferramenta que ele chamou, seus hooks, falhas, requisições e tokens. Clique numa linha para abrir.'],
        ['Tempo', 'Cada chamada como uma barra no tempo. Filtre por tipo, estado, agente e janela de tempo; as chamadas dos subagentes aparecem recuadas abaixo deles.'],
        ['Agentes', 'A sessão principal e cada subagente, com suas chamadas, requisições e tokens.'],
        ['Tokens', 'Cada requisição ao modelo: entrada nova, lida do cache, gravada no cache e saída. Uma linha destacada provavelmente perdeu o cache.'],
        ['Insights', 'Sugestões para a sua configuração do Claude Code, a partir desta sessão e das anteriores do projeto. Desligados por padrão: ligue em /radar-config.'],
      ]],
      ['Privacidade', [
        ['Alguma coisa sai da minha máquina?', 'Não. O servidor escuta só em 127.0.0.1, a página não carrega nada de fora, e o radar não chama nenhum modelo nem envia telemetria.'],
        ['O que o radar guarda?', 'Para cada chamada ou hook, uma linha de no máximo 120 caracteres; para cada prompt, os primeiros 120 caracteres. Nunca as respostas do Claude, a saída das ferramentas ou o texto de uma mensagem. Tudo some quando a sessão termina.'],
        ['Quem pode abrir esta página?', 'Qualquer pessoa nesta máquina que tenha o endereço, ou que consiga ler session-radar/hub.json na sua pasta de configuração do Claude Code. Trate o endereço como o arquivo de exportação.'],
      ]],
    ],
  }
  const NOTICES_SHOWN = 4
  const CHART_MAX = 120

  const token = new URLSearchParams(location.search).get('t')
  const $ = (id) => document.getElementById(id)

  let T = /^pt\b/i.test(navigator.language) ? I18N.pt : I18N.en
  // Every session that sends to this server: key -> { key, alive, data, offset, receivedAt, sig }
  const sessions = new Map()
  // The session being drawn, its snapshot and the difference between its clock and the page's. A
  // view of all sessions draws each one in turn (withSession)
  let curKey = null
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
  let shownQa = null
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
    // 'all', or the key of the one session the views show
    session: 'all',
    hookEvent: 'all',
    // The Q&A answers left open, by their question
    qaOpen: new Set(),
  }

  try {
    const saved = JSON.parse(localStorage.getItem('session-radar.ui') || '{}')
    if (VIEWS.includes(saved.view)) ui.view = saved.view
    if (WINDOW_MS[saved.window] || saved.window === 'all') ui.window = saved.window
    if (typeof saved.session === 'string') ui.session = saved.session
  } catch {
    // Storage is unavailable; the defaults stand
  }
  const remember = () => {
    try {
      localStorage.setItem('session-radar.ui', JSON.stringify({ view: ui.view, window: ui.window, session: ui.session }))
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
  // Sessions: the live ones first, then the newest
  // ---------------------------------------------------------------------------

  const sessionList = () => [...sessions.values()].filter((s) => s.data)
    .sort((a, b) => (b.alive - a.alive) || Date.parse(b.data.startedAt) - Date.parse(a.data.startedAt))

  // The session the views draw: the one picked, or the only one there is; null with several and none
  // picked, when the views that can show them all do
  function focusedSession() {
    if (ui.session !== 'all') {
      const s = sessions.get(ui.session)
      if (s?.data) return s
      // A key from an earlier visit, or a session the server dropped: back to all of them
      if (sessions.size) ui.session = 'all'
    }
    const list = sessionList()
    return list.length === 1 ? list[0] : null
  }
  const showingAll = () => !focusedSession() && sessionList().length > 1

  function use(sess) {
    curKey = sess?.key ?? null
    data = sess?.data ?? null
    offset = sess?.offset ?? 0
  }

  // Draws with another session's snapshot and clock, then puts the drawn session back
  function withSession(sess, fn) {
    const saved = [curKey, data, offset]
    use(sess)
    try {
      return fn()
    } finally {
      ;[curKey, data, offset] = saved
    }
  }

  const sessionName = (s) => s.data.session?.title || s.data.session?.project || s.key.slice(0, 8)

  // The session's mark and code in its colour, and its name, for a row that could be any session's
  function sessionChip(s) {
    const b = s.data.session ?? {}
    const color = BADGE_HEX[b.color] ? b.color : 'blue'
    return h('span', { class: `sess-chip b-${color}${s.alive ? '' : ' ended'}`, title: sessionName(s) },
      h('span', { class: 'badge-mark' }, b.mark ?? '●'), h('span', { class: 'badge-code' }, b.code ?? ''), h('span', { class: 'sess-chip-name' }, sessionName(s)))
  }

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
  // A handler that selects an item of the session being drawn, whichever is drawn when it is pressed
  const selectNow = (sel) => {
    const key = curKey
    return () => select({ ...sel, key })
  }
  const isSelected = (type, id) => ui.selected?.type === type && ui.selected.id === id && ui.selected.key === curKey

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
        onclick: selectNow({ type: 'span', id: sp.id }),
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

  // The activities of the session shown, or of every session, newest first. An activity is known by
  // its session's key and its own id, so two sessions' activities never open together
  function activitiesView() {
    const all = showingAll()
    const list = all ? sessionList() : [focusedSession()].filter(Boolean)
    const entries = list.flatMap((sess) => sess.data.turns.map((t) => ({ sess, t }))).sort((a, b) => b.t.start - a.t.start)
    if (!entries.length) return [empty(T.emptyActivities)]
    const keyOf = (e) => `${e.sess.key}|${e.t.id}`
    const open = ui.turnsTouched ? ui.openTurns : new Set([keyOf(entries[0])])
    const out = entries.map((e) => withSession(e.sess, () => activityEl(e.t, keyOf(e), open, all ? e.sess : null))).filter(Boolean)
    return out.length ? out : [empty(T.emptyFiltered)]
  }

  function activityEl(t, key, open, sess) {
    const agents = agentsById()
    const q = ui.search.trim().toLowerCase()
    const t1 = now()
    const calls = data.spans.filter((sp) => sp.turn === t.id && sp.kind !== 'api')
    const shown = calls.filter((sp) => spanPasses(sp, agents, { agent: false }))
    const hooks = hooksOf(data).filter((hk) => hk.turn === t.id)
    const hooksShown = hooks.filter((hk) => hookPasses(hk, q, { event: false }))
    const promptHit = q && (t.prompt || '').toLowerCase().includes(q)
    const filtering = q || ui.status !== 'all' || ui.kinds.size !== KINDS.length
    if (filtering && !promptHit && !shown.length && !hooksShown.length) return null

    const isOpen = open.has(key)
    const st = !t.end ? 'running' : t.reason === 'aborted' ? 'interrupted' : t.reason === 'error' || t.reason === 'refusal' ? 'error' : 'ok'
    const toggle = () => {
      if (!ui.turnsTouched) {
        ui.turnsTouched = true
        ui.openTurns = new Set(open)
      }
      if (ui.openTurns.has(key)) ui.openTurns.delete(key)
      else ui.openTurns.add(key)
      render()
    }

    const head = h('button', { class: 'act-head', type: 'button', 'aria-expanded': String(isOpen), onclick: toggle },
      h('span', { class: 'act-caret' }),
      h('span', { class: 'act-n' }, `#${t.n}`),
      h('span', { class: 'act-main' },
        sess ? sessionChip(sess) : null,
        statusEl(st),
        h('span', { class: `act-prompt ${t.prompt ? '' : 'none'}`, title: t.prompt || '' }, t.prompt || T.continuation)),
      h('span', { class: 'act-stats' },
        h('span', live(t), fmtDur((t.end ?? t1) - t.start)),
        h('span', null, `${t.calls} ${T.col.tools.toLowerCase()}`),
        t.fails ? h('span', { class: 'tx-fail' }, `${t.fails} ${T.col.fails.toLowerCase()}`) : null,
        h('span', null, `${t.api} ${T.col.req.toLowerCase()}`),
        hooks.length ? h('span', null, `${hooks.length} ${T.metrics.hooks}`) : null,
        h('span', null, `${fmtTok(t.tokIn)} / ${fmtTok(t.tokOut)}`)))

    let body = null
    if (isOpen) {
      const byTool = Object.entries(t.byTool).sort((a, b) => b[1] - a[1])
      const evicted = t.calls - calls.length
      const own = sessions.get(curKey)
      body = h('div', { class: 'act-body' },
        byTool.length
          ? h('div', { class: 'act-summary' },
            byTool.map(([n, c]) => h('span', { class: 'chip' }, h('b', null, n), `×${c}`)),
            h('span', { class: 'chip plain' }, `${t.api} ${T.col.req.toLowerCase()} · ${fmtTok(t.tokIn)} ${T.col.inTok.toLowerCase()} / ${fmtTok(t.tokOut)} ${T.col.outTok.toLowerCase()}`))
          : h('div', { class: 'note' }, T.noTools),
        evicted > 0 ? h('div', { class: 'note' }, T.earlier(evicted)) : null,
        shown.length ? callsTable(shown, agents, t) : null,
        hooksShown.length ? h('div', { class: 'act-hooks-title' }, T.hooksIn(hooks.length)) : null,
        hooksShown.length ? hooksTable(hooksShown.map((hk) => ({ sess: own, hk })), { turn: t }) : null)
    }
    return h('div', { class: `act ${isOpen ? 'open' : ''}` }, head, body)
  }

  function callsTable(calls, agents, turn) {
    const t1 = now()
    return dataTable({
      fit: true,
      minWidth: '720px',
      rows: calls,
      rowAttrs: (sp) => ({
        class: `${isSelected('span', sp.id) ? 'selected' : ''} ${isFailed(spanState(sp)) ? 'failed' : ''}`,
        onclick: selectNow({ type: 'span', id: sp.id }),
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
  // Hooks: every classic hook event the mod saw, with what the hooks answered
  // ---------------------------------------------------------------------------

  // A colour per family of events, from the kinds' palette
  const HOOK_KIND = {
    PreToolUse: 'tool', PostToolUse: 'tool', PostToolUseFailure: 'tool', PostToolBatch: 'tool', PermissionRequest: 'tool', PermissionDenied: 'tool',
    UserPromptSubmit: 'api', UserPromptExpansion: 'api', MessageDisplay: 'api', Stop: 'api', StopFailure: 'api',
    SubagentStart: 'agent', SubagentStop: 'agent', TaskCreated: 'agent', TaskCompleted: 'agent', TeammateIdle: 'agent',
    Notification: 'mcp', Elicitation: 'mcp', ElicitationResult: 'mcp',
  }
  const hookKind = (ev) => HOOK_KIND[ev] ?? 'web'
  const hookEl = (ev) => kindEl(hookKind(ev), ev)
  const hookState = (hk) => (!hk.end ? 'running' : hk.status)
  const hookFailed = (hk) => ['blocked', 'error', 'interrupted'].includes(hookState(hk))
  const hooksOf = (d) => (Array.isArray(d?.hooks) ? d.hooks : [])

  // What the hooks answered, in a few words: the decision first, then what else they did
  function hookResult(hk) {
    const st = hookState(hk)
    if (st === 'running' || st === 'error' || st === 'interrupted') return statusEl(st)
    const o = hk.out ?? {}
    const O = T.hookOut
    const head = o.decision === 'deny' ? ['denied', O.deny] : o.block != null ? ['denied', O.block] : o.decision === 'ask' ? ['waiting', O.ask]
      : o.decision === 'allow' ? ['ok', O.allow] : o.stop ? ['interrupted', O.stop] : null
    const extra = [
      o.ctx ? O.ctx(o.ctxCount ?? o.ctx.length) : null, o.rewrote ? O.rewrote : null, o.retry ? O.retry : null, o.title ? O.title : null,
    ].filter(Boolean)
    if (!head && !extra.length) return h('span', { class: 'faint' }, O.none)
    return h('span', { class: 'hook-result' }, head ? h('span', { class: `status st-${head[0]}` }, head[1]) : null,
      extra.length ? h('span', { class: 'dim' }, extra.join(' · ')) : null)
  }

  const hookResultText = (hk) => {
    const o = hk.out ?? {}
    return [o.decision, o.block != null ? 'block' : null, o.reason, o.block, ...(o.ctx ?? []), o.title].filter(Boolean).join(' ')
  }

  function hookPasses(hk, q, { status = true, event = true } = {}) {
    if (event && ui.hookEvent !== 'all' && hk.event !== ui.hookEvent) return false
    if (status && ui.status === 'running' && hk.end) return false
    if (status && ui.status === 'failed' && !hookFailed(hk)) return false
    if (!q) return true
    return [hk.event, hk.tool, hk.label, hookResultText(hk)].join(' ').toLowerCase().includes(q)
  }

  const hookTarget = (hk) => [hk.tool, hk.label].filter(Boolean).join(' · ')
  const hookDur = (hk, t1) => (hk.pieces > 1 ? `${fmtDur((hk.end ?? t1) - hk.start)} · ×${hk.pieces}` : fmtDur((hk.end ?? t1) - hk.start))

  // rows: [{ sess, hk }], newest first. Each row is drawn with its own session, which a view of all of
  // them names in its own column; inside an activity the time is its offset in that activity
  function hooksTable(rows, { turn = null, all = false } = {}) {
    const C = T.hookCol
    const cell = (fn) => (r) => withSession(r.sess, () => fn(r.hk, r.sess))
    return dataTable({
      fit: true,
      minWidth: all ? '900px' : '760px',
      rows,
      rowAttrs: (r) => withSession(r.sess, () => ({
        class: `${isSelected('hook', r.hk.id) ? 'selected' : ''} ${hookFailed(r.hk) ? 'failed' : ''}`,
        onclick: selectNow({ type: 'hook', id: r.hk.id }),
      })),
      cols: [
        turn
          ? { label: T.col.offset, cls: 'r num faint', width: '68px', cell: cell((hk) => `+${fmtDur(Math.max(0, hk.start - turn.start))}`) }
          : { label: C.time, cls: 'num faint', width: '78px', cell: cell((hk) => fmtClock(hk.start)) },
        all ? { label: C.session, width: '180px', cell: cell((hk, s) => sessionChip(s)) } : null,
        { label: C.event, width: '170px', cell: cell((hk) => hookEl(hk.event)) },
        { label: C.target, cls: 'mono dim', cell: cell((hk) => h('span', { title: hookTarget(hk) }, hookTarget(hk))) },
        turn ? null : {
          label: C.activity, cls: 'num dim', width: '76px', hide: 'sm',
          cell: cell((hk) => {
            const tn = turnById(hk.turn)
            return tn ? `#${tn.n}` : '—'
          }),
        },
        { label: T.col.agent, cls: 'dim', width: '110px', hide: 'sm', cell: cell((hk) => agentName(agentsById(), hk.agent ?? 'main')) },
        { label: T.col.duration, cls: 'r num', width: '86px', cell: cell((hk) => h('span', hk.end || hk.pieces > 1 ? {} : live(hk), hookDur(hk, now()))) },
        { label: C.result, width: '170px', cell: cell((hk) => hookResult(hk)) },
      ].filter(Boolean),
    })
  }

  function hooksView() {
    const all = showingAll()
    const list = all ? sessionList() : [focusedSession()].filter(Boolean)
    const q = ui.search.trim().toLowerCase()
    const every = list.flatMap((sess) => hooksOf(sess.data).map((hk) => ({ sess, hk })))
    if (!every.length) return [empty(T.noHooks)]

    // The events seen, most frequent first, each a filter
    const byEvent = new Map()
    for (const { hk } of every) byEvent.set(hk.event, (byEvent.get(hk.event) ?? 0) + 1)
    const chips = h('div', { class: 'act-summary hook-chips' }, [...byEvent].sort((a, b) => b[1] - a[1]).map(([ev, n]) => h('button', {
      class: `chip hook-chip${ui.hookEvent === ev ? ' on' : ''}`,
      type: 'button',
      style: { '--kc': `var(--k-${hookKind(ev)})` },
      onclick: () => {
        ui.hookEvent = ui.hookEvent === ev ? 'all' : ev
        render()
      },
    }, h('b', null, ev), `×${n}`)))

    const rows = every.filter(({ hk }) => hookPasses(hk, q)).sort((a, b) => b.hk.start - a.hk.start)
    const out = [chips, h('p', { class: 'note' }, T.hookNote)]
    if (!rows.length) return [...out, empty(T.emptyFiltered)]
    if (rows.length > HOOKS_SHOWN) out.push(h('p', { class: 'note' }, T.hooksCapped(HOOKS_SHOWN, rows.length)))
    out.push(hooksTable(rows.slice(0, HOOKS_SHOWN), { all }))
    return out
  }

  function hookDetail(hk) {
    const D = T.detail
    const HD = T.hookDetail
    const o = hk.out ?? {}
    const turn = turnById(hk.turn)
    const sess = sessions.get(curKey)
    const body = [kv([
      [HD.result, hookResult(hk)],
      [HD.event, hookEl(hk.event)],
      sess && sessionList().length > 1 ? [HD.session, sessionChip(sess)] : null,
      [D.agent, agentName(agentsById(), hk.agent ?? 'main')],
      turn ? [D.activity, `#${turn.n} ${turn.prompt || T.continuation}`] : null,
      [D.start, fmtClock(hk.start)],
      hk.end ? [D.end, fmtClock(hk.end)] : null,
      [D.duration, h('span', { class: 'num', ...(hk.end ? {} : live(hk)) }, fmtDur((hk.end ?? now()) - hk.start))],
      hk.pieces ? [HD.pieces, h('span', { class: 'num' }, fmtInt(hk.pieces))] : null,
      o.title ? [HD.title, o.title] : null,
    ])]
    if (hookTarget(hk)) body.push(h('h3', null, HD.target), h('pre', null, hookTarget(hk)), h('p', { class: 'note' }, D.argumentNote))
    const reason = o.reason ?? o.block
    if (reason) body.push(h('h3', null, HD.reason), h('pre', null, reason))
    if (o.ctx?.length) body.push(h('h3', null, HD.context), h('pre', null, o.ctx.join('\n')))
    return { title: `Hook · ${hk.event}`, body }
  }

  // ---------------------------------------------------------------------------
  // Sessions, side by side: Home when no single one is picked
  // ---------------------------------------------------------------------------

  function sessionCard(s) {
    const d = s.data
    const b = d.session ?? {}
    const tt = d.totals
    const color = BADGE_HEX[b.color] ? b.color : 'blue'
    const cur = d.turns.findLast((x) => !x.end)
    const nums = [
      [T.metrics.turns, d.turns.length], [T.metrics.calls, tt.calls], [T.metrics.hooks, tt.hooks ?? hooksOf(d).length],
      [T.metrics.api, tt.api], [T.metrics.fails, tt.errors + tt.denied],
    ]
    return h('button', {
      class: `sess-card b-${color}${s.alive ? '' : ' ended'}`,
      type: 'button',
      onclick: () => {
        ui.session = s.key
        remember()
        render()
      },
    },
    h('span', { class: 'sess-head' },
      h('span', { class: 'badge-mark' }, b.mark ?? '●'), h('span', { class: 'badge-code' }, b.code ?? ''),
      h('span', { class: `sess-state${s.alive ? ' on' : ''}` }, s.alive ? T.sessAlive : T.endedTitle)),
    h('span', { class: 'sess-title' }, sessionName(s)),
    h('span', { class: 'sess-sub' }, [b.title ? b.project : null, b.model, d.usage?.context ? `${T.context} ${Math.round(d.usage.context.percent ?? 0)}%` : null].filter(Boolean).join(' · ')),
    h('span', { class: 'sess-now' }, cur ? T.sessBusy(cur.prompt || T.continuation) : T.sessIdle),
    h('span', { class: 'sess-nums' }, nums.map(([k, v]) => h('span', null, h('b', null, fmtInt(v)), ` ${k}`))))
  }

  const sessionCards = () => h('div', { class: 'sess-grid' }, sessionList().map(sessionCard))

  function sessionsHome() {
    const mem = memory.at(-1)
    return [
      sessionCards(),
      sectionTitle(T.memory, mem ? T.memFree(fmtBytes(mem.free)) : null),
      memory.length > 1 ? memChart() : empty(T.memWaiting),
    ]
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
          onclick: selectNow({ type: 'agent', id: a.id }),
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
      onclick: selectNow({ type: 'span', id: sp.id }),
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
        onclick: selectNow({ type: 'span', id: sp.id }),
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
    const key = curKey
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
          ui.openTurns = new Set([`${key}|${t.id}`])
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
  // Q&A: fixed questions and answers, in the page's language, filtered by the search
  // ---------------------------------------------------------------------------

  function qaView() {
    const q = ui.search.trim().toLowerCase()
    const sections = QA[T === I18N.pt ? 'pt' : 'en']
      .map(([title, items]) => [title, items.filter(([ask, answer]) => !q || `${title} ${ask} ${answer}`.toLowerCase().includes(q))])
      .filter(([, items]) => items.length)
    if (!sections.length) return [empty(T.emptyFiltered)]
    return [
      h('p', { class: 'note' }, T.qaIntro),
      ...sections.map(([title, items]) => h('section', { class: 'qa-section' },
        sectionTitle(title),
        h('div', { class: 'qa-list' }, items.map(([ask, answer]) => h('details', {
          class: 'qa',
          open: q || ui.qaOpen.has(ask) ? true : null,
          ontoggle: (ev) => {
            if (q) return
            if (ev.target.open) ui.qaOpen.add(ask)
            else ui.qaOpen.delete(ask)
          },
        },
          h('summary', null, ask),
          h('p', null, answer)))))),
    ]
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
      body.push(h('button', { class: 'link-btn', type: 'button', onclick: selectNow({ type: 'agent', id: sp.child }) }, D.openAgent))
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
      body.push(h('table', { class: 'grid' }, h('tbody', null, calls.map((sp) => h('tr', { onclick: selectNow({ type: 'span', id: sp.id }) },
        h('td', null, kindEl(sp.kind, sp.name)),
        h('td', { class: 'r num dim', style: { width: '76px' } }, fmtDur((sp.end ?? t1) - sp.start)),
        h('td', { style: { width: '30px' } }, h('span', { class: `status dot-only st-${spanState(sp)}`, title: T.status[spanState(sp)] })))))))
    }
    return { title: agentTitle(a), body }
  }

  function detailContent() {
    if (!data) return null
    if (ui.selected?.type === 'span') {
      const sp = data.spans.find((x) => x.id === ui.selected.id)
      return sp ? spanDetail(sp) : null
    }
    if (ui.selected?.type === 'agent') {
      const a = data.agents.find((x) => x.id === ui.selected.id)
      return a ? agentDetail(a) : null
    }
    if (ui.selected?.type === 'hook') {
      const hk = hooksOf(data).find((x) => x.id === ui.selected.id)
      return hk ? hookDetail(hk) : null
    }
    return null
  }

  function renderDetail() {
    const panel = $('detail')
    const sess = ui.selected ? sessions.get(ui.selected.key) : null
    const content = sess ? withSession(sess, detailContent) : null
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
      $('top').className = 'top'
      document.title = showingAll() ? `${T.nSessions(sessionList().length)} · Session Radar` : 'Session Radar'
      return
    }
    const own = sessions.get(curKey)
    const ended = conn === 'ended' || conn === 'unauthorized' || own?.alive === false
    const color = BADGE_HEX[b.color] ? b.color : 'blue'
    el.hidden = false
    el.className = `badge b-${color}${ended ? ' ended' : ''}`
    el.title = T.badgeTip(b.code, b.cwd)
    el.replaceChildren(
      h('span', { class: 'badge-mark' }, b.mark),
      h('span', { class: 'badge-code' }, b.code),
      b.title ? h('span', { class: 'badge-project badge-title' }, b.title) : null,
      b.project ? h('span', { class: 'badge-project' }, b.project) : null,
      b.model ? h('span', { class: 'badge-model' }, b.model) : null,
    )
    $('top').className = `top b-${color}${ended ? ' ended' : ''}`
    document.title = ended
      ? `✕ ${b.code} · ${T.endedTitle} · Session Radar`
      : `${b.mark} ${b.code}${b.title || b.project ? ` · ${b.title || b.project}` : ''} · Session Radar`
    const key = `${b.mark}${color}${ended}`
    if (key !== iconKey) {
      iconKey = key
      const fill = ended ? '#687081' : BADGE_HEX[color]
      const svg = `<svg xmlns="${SVG}" viewBox="0 0 32 32" fill="${fill}">${BADGE_SHAPES[b.mark]}</svg>`
      $('favicon').href = `data:image/svg+xml,${encodeURIComponent(svg)}`
    }
  }

  // Rebuilt only when the sessions or their names change, so an open dropdown is never replaced
  let sessionsSig = ''
  function renderSessionPicker() {
    const sel = $('session-filter')
    const list = sessionList()
    sel.hidden = !list.length
    const label = (s) => {
      const b = s.data.session ?? {}
      return `${b.mark ?? '●'} ${b.code ?? ''} · ${sessionName(s)}${s.alive ? '' : ` (${T.endedTitle})`}`
    }
    const sig = JSON.stringify([T.allSessions(list.length), list.map((s) => [s.key, label(s)])])
    if (sig !== sessionsSig) {
      sessionsSig = sig
      sel.title = T.sessionTip
      sel.replaceChildren(
        h('option', { value: 'all' }, T.allSessions(list.length)),
        ...list.map((s) => h('option', { value: s.key }, label(s))))
    }
    sel.value = ui.session !== 'all' && sessions.has(ui.session) ? ui.session : 'all'
  }

  function renderHeader() {
    renderSessionPicker()
    renderIdentity()
    const c = $('conn')
    c.className = `conn ${conn === 'live' ? 'live' : conn === 'stale' || conn === 'reconnecting' ? 'stale' : conn === 'connecting' ? '' : 'down'}`
    $('conn-text').textContent = T.conn[conn]

    const m = $('metrics')
    if (showingAll()) {
      const list = sessionList()
      const sum = (fn) => list.reduce((n, s) => n + (fn(s.data) ?? 0), 0)
      const fails = sum((d) => d.totals.errors + d.totals.denied)
      const items = [
        [T.metrics.sessions, `${list.filter((s) => s.alive).length}/${list.length}`],
        [T.metrics.turns, sum((d) => d.turns.length)],
        [T.metrics.calls, sum((d) => d.totals.calls)],
        [T.metrics.hooks, sum((d) => d.totals.hooks ?? hooksOf(d).length)],
        [T.metrics.api, sum((d) => d.totals.api)],
        [T.metrics.agents, sum((d) => d.totals.agents)],
        [T.metrics.fails, fails, fails ? 'tx-fail' : ''],
      ]
      m.replaceChildren(...items.map(([k, v, cls]) => h('div', null, h('dt', null, k), h('dd', { class: cls || null }, v))))
      return
    }
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
      [T.metrics.hooks, t.hooks ?? hooksOf(data).length],
      [T.metrics.agents, t.agents],
      [T.metrics.mcp, t.mcp],
      [T.metrics.web, t.web],
      [T.metrics.fails, fails, fails ? 'tx-fail' : ''],
    ]
    m.replaceChildren(...items.map(([k, v, cls, since]) => h('div', null, h('dt', null, k), h('dd', { class: cls || null, 'data-since': since }, v))))
  }

  function renderNav() {
    const list = sessionList()
    const counts = showingAll() ? {
      home: list.length,
      activities: list.reduce((n, s) => n + s.data.turns.length, 0),
      hooks: list.reduce((n, s) => n + hooksOf(s.data).length, 0),
    } : data ? {
      home: null,
      activities: data.turns.length,
      insights: data.insightsView ? data.insightsView.findings.length : null,
      timeline: data.spans.length,
      agents: data.agents.length - 1,
      tokens: data.totals.api,
      hooks: hooksOf(data).length,
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
    $('statuses').hidden = !(v === 'timeline' || v === 'activities' || v === 'tokens' || v === 'hooks')
    $('agent-filter').hidden = !(v === 'timeline' || v === 'tokens')
    $('hook-filter').hidden = v !== 'hooks'
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

    const hookSel = $('hook-filter')
    const shown = showingAll() ? sessionList() : [focusedSession()].filter(Boolean)
    const events = [...new Set(shown.flatMap((s) => hooksOf(s.data).map((hk) => hk.event)))].sort()
    if (ui.hookEvent !== 'all' && !events.includes(ui.hookEvent)) ui.hookEvent = 'all'
    const hookSig = JSON.stringify([T.allEvents, events])
    if (hookSig !== hooksSig) {
      hooksSig = hookSig
      hookSel.replaceChildren(h('option', { value: 'all' }, T.allEvents), ...events.map((ev) => h('option', { value: ev }, ev)))
    }
    hookSel.value = ui.hookEvent
  }
  let hooksSig = ''

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
    use(focusedSession())
    document.documentElement.lang = T === I18N.pt ? 'pt-BR' : 'en'
    const vdata = data ?? sessionList()[0]?.data
    const version = typeof vdata?.version === 'string' && /^\d+\.\d+\.\d+$/.test(vdata.version) ? vdata.version : ''
    $('credit').textContent = version ? `${T.credit} · v${version}` : T.credit
    $('hint').textContent = T.hint
    renderNotifyOn()
    renderPromo()
    renderHeader()
    renderNav()
    renderToolbar()

    const view = $('view')
    // A view opens at its top, the timeline at its newest end
    const switched = ui.view !== shownView
    shownView = ui.view
    const atBottom = switched || view.scrollHeight - view.scrollTop - view.clientHeight < 8
    const top = switched ? 0 : view.scrollTop
    // The questions change only with the language and the search: a snapshot leaves them as they
    // are, so an answer being read or clicked is not redrawn from under the reader
    const qaSig = ui.view === 'qa' ? `${T === I18N.pt ? 'pt' : 'en'}|${ui.search}` : null
    if (qaSig && qaSig === shownQa && !switched) {
      renderDetail()
      return
    }
    shownQa = qaSig
    let content
    if (ui.view === 'qa') content = qaView()
    else if (showingAll() && !MERGED.includes(ui.view)) content = [h('p', { class: 'note' }, T.pickSession), sessionCards()]
    else if (showingAll() && ui.view === 'home') content = sessionsHome()
    else if (showingAll() && ui.view === 'activities') content = activitiesView()
    else if (ui.view === 'hooks' && (data || showingAll())) content = hooksView()
    else if (!data) content = [empty(conn === 'noToken' || conn === 'unauthorized' || conn === 'ended' ? T.conn[conn] : T.emptyWaiting)]
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
    if (!sessions.size) return
    ticks++
    if (conn === 'live' && Date.now() - receivedAt > STALE_MS) {
      conn = 'stale'
      renderHeader()
    }
    use(focusedSession())
    tickLive()
    if (!canRender()) return
    const running = sessionList().some((s) => s.data.spans.some((sp) => !sp.end))
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

  // Drawn again only when the language changes, so a redraw never takes it from under the pointer
  let promoLang = null
  function renderPromo() {
    const lang = T === I18N.pt ? 'pt' : 'en'
    if (promoLang === lang) return
    promoLang = lang
    const ad = ADS[0]
    const text = ad[lang]
    $('promo').setAttribute('aria-label', T.adLabel)
    $('promo').replaceChildren(h('a', { class: 'promo-card', href: ad.href, target: '_blank', rel: 'noopener noreferrer', 'data-ad': ad.id },
      h('span', { class: 'promo-tag' }, T.adTag),
      h('strong', { class: 'promo-title' }, text.title),
      h('span', { class: 'promo-body' }, text.body),
      h('span', { class: 'promo-cta' }, text.cta)))
  }

  // ---------------------------------------------------------------------------
  // Notifications the mod raised, numbers only, as it sent them to the terminal: a toast on the page
  // and, while the tab is in the background and the person allowed it, the browser's own
  // ---------------------------------------------------------------------------

  const canNotify = () => 'Notification' in window && window.isSecureContext

  function renderNotifyOn() {
    const btn = $('notify-on')
    btn.hidden = !canNotify() || Notification.permission !== 'default'
    btn.textContent = T.notifyOn
    btn.title = T.notifyOnTip
  }

  $('notify-on').addEventListener('click', async () => {
    try {
      await Notification.requestPermission()
    } catch {
      // The browser would not ask
    }
    renderNotifyOn()
  })

  // The first snapshot of a session only says where to start, so opening the page does not replay
  // what came before. key -> the newest notice shown
  const lastNotice = new Map()
  function takeNotices(sess, list) {
    if (!Array.isArray(list)) return
    const ids = list.map((n) => n?.id).filter(Number.isFinite)
    const newest = ids.length ? Math.max(...ids) : 0
    const last = lastNotice.get(sess.key)
    // A mod that started over counts from 1 again
    if (last === undefined || newest < last) {
      lastNotice.set(sess.key, newest)
      return
    }
    for (const n of list) {
      if (!(n?.id > lastNotice.get(sess.key)) || typeof n.text !== 'string') continue
      lastNotice.set(sess.key, n.id)
      showNotice(n, sessions.size > 1 ? sess : null)
    }
  }

  function showNotice(n, sess) {
    const box = $('notices')
    const from = sess ? `${sess.data.session?.mark ?? ''} ${sess.data.session?.code ?? ''} · ${sessionName(sess)}`.trim() : null
    const el = h('div', { class: 'notice' + (n.kind === 'cache' ? ' notice-cache' : ''), role: 'status', title: T.noticeClose },
      h('b', null, from ? `Session Radar · ${from}` : 'Session Radar'), h('span', null, n.text))
    const close = () => el.remove()
    el.addEventListener('click', close)
    box.append(el)
    while (box.children.length > NOTICES_SHOWN) box.firstElementChild.remove()
    setTimeout(close, NOTICE_MS)
    if (!document.hidden || !canNotify() || Notification.permission !== 'granted') return
    try {
      const note = new Notification(from ? `Session Radar · ${from}` : 'Session Radar', { body: n.text, tag: `session-radar-${sess?.key ?? ''}-${n.id}` })
      note.onclick = () => {
        window.focus()
        note.close()
      }
    } catch {
      // Some browsers only notify from a service worker; the toast is there
    }
  }

  // A heartbeat carries the same session with a newer clock: the clock is taken, nothing is redrawn
  function receive(text) {
    const { key, alive, snapshot: next } = JSON.parse(text)
    if (!next || typeof key !== 'string') return
    const { now: _now, exportedAt: _at, ...rest } = next
    const sig = JSON.stringify(rest)
    let sess = sessions.get(key)
    if (!sess) {
      sess = { key }
      sessions.set(key, sess)
    }
    const same = sig === sess.sig && sess.alive === alive && conn === 'live'
    Object.assign(sess, { sig, data: next, alive, receivedAt: Date.now(), offset: Date.now() - (next.now ?? Date.now()) })
    receivedAt = Date.now()
    T = I18N[next.lang] ?? T
    conn = 'live'
    failures = 0
    takeNotices(sess, next.notices)
    if (same) return
    dirty = true
    if (canRender()) render()
  }

  // Which sessions the server holds and which still send: one that ended stays, marked so, until the
  // server drops it
  function receiveRoster(text) {
    const list = JSON.parse(text)?.sessions
    if (!Array.isArray(list)) return
    const keys = new Set(list.map((s) => s.key))
    for (const key of sessions.keys()) if (!keys.has(key)) sessions.delete(key)
    for (const s of list) {
      const sess = sessions.get(s.key)
      if (sess) sess.alive = !!s.alive
    }
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
        conn = sessions.size ? 'live' : 'connecting'
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
    es.addEventListener('sessions', (ev) => {
      try {
        receiveRoster(ev.data)
      } catch {
        // The next roster replaces it
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
      for (const sess of sessions.values()) sess.alive = false
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
      } else if (++failures > 15) {
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
  $('hook-filter').addEventListener('change', (ev) => {
    ui.hookEvent = ev.target.value
    render()
  })
  $('session-filter').addEventListener('change', (ev) => {
    ui.session = ev.target.value
    // What was picked and filtered belonged to the session shown before
    ui.selected = null
    ui.agent = 'all'
    ui.turnsTouched = false
    remember()
    ev.target.blur()
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
    } else if (/^[1-8]$/.test(ev.key)) {
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
