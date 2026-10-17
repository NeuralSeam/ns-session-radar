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
// Shown in a pane with seven tabs, opening on Home (/radar), as a live summary beside the spinner,
// and, on request (/radar-web), as a page in the browser served from this machine's loopback by web/server.mjs.
// Nothing leaves the machine: no remote network, no model calls. The only writes are /radar-export,
// the same file saved after each activity when the person turns that on, and, in the mod's own
// store, the language, the settings and, when insights are on, per-project counts. Notifications,
// when turned on, go to the person's own notification channel.

import { analyze, summarize as sessionRecord, upsertHistory, compareApplied, TTL_MS } from './insights.js'

const PANE = 'session-radar'
const MAX_SPANS = 500
const MAX_TURNS = 200
const MAX_LABEL = 120
const GENERATOR = 'session-radar by Neural Seam (https://github.com/NeuralSeam/ns-session-radar)'
// The release, shown in the credit line and on the page. It must match .claude-plugin/plugin.json;
// npm test checks it
const VERSION = '0.7.1'
const LANGS = ['auto', 'pt', 'en']
const WEB_PUSH_MS = 500
const WEB_BEAT_MS = 5000
const WEB_START_MS = 10_000
const AI_REVIEW = '/session-radar:radar-review'
const EFFORT_MS = 5000
const CLEAR_CONFIRM_MS = 3000
const SAVE_MS = 2000
// The band below the transcript lays Home out in two columns from this width
const HOME_COLUMNS_MIN = 130
// Fewer rows than this and the band drops its frame, to keep them for the radar
const BAND_FRAME_MIN = 8

// Settings, kept in the store under `config`. Everything that notifies or keeps more data starts off.
const DEFAULTS = { notifyDone: false, notifyDoneMin: 30, notifyCache: false, notifyCacheLead: 60, insights: false, aiHint: false, autoExport: false, badge: false, position: 'side' }

// Each session's badge: a mark and a four-letter code, the same under the terminal's prompt, in the
// pane and in the browser tab, so parallel sessions are told apart. No 0/O, 1/I/L or U.
const BADGE_CHARS = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
const BADGE_MARKS = ['●', '■', '▲', '★']
const BADGE_COLORS = ['cyan', 'magenta', 'blue', 'green']
const CHOICES = { notifyDoneMin: [15, 30, 60, 120], notifyCacheLead: [30, 60, 120, 300], position: ['side', 'bottom'] }

// ---------------------------------------------------------------------------
// Strings. The language is the one picked with /radar-lang or the `l` key; on `auto`, Brazilian
// Portuguese when the system locale is pt and English otherwise.
// ---------------------------------------------------------------------------

const STRINGS = {
  en: {
    tabHome: 'Home', tabActivities: 'Activities',
    export: 'Export', clear: 'Clear', clearConfirm: 'x again to clear', help: 'Help', language: 'Language',
    running: 'running', denied: 'denied',
    emptyActivities: 'No activity yet. Each prompt you send becomes one activity here, with every tool it called.',
    activitiesHint: 'Tab or ↑↓ to move, Enter to open or close an activity',
    continuation: '(no prompt: Claude continued on its own)',
    noTools: 'No tools called in this activity.',
    earlier: (n) => `… ${n} earlier calls of this activity are no longer in memory`,
    more: (n) => `… ${n} more above`,
    tool: 'tool', tools: 'tools', req: 'req.', inTok: 'in', outTok: 'out',
    activity: 'activity', activities: 'activities',
    context: 'Context', of: 'of', cache: 'Cache',
    expiresIn: (d) => `expires in ${d}`,
    expired: (d) => `expired ${d} ago`,
    ifTtl: (a, b) => `${a} left if TTL 5m, ${b} if 1h`,
    recache: (n) => `if it expires: ~${n} tok rewritten`,
    fail: 'failure', fails: 'failures',
    spinTools: 'tools', spinReq: 'req.', spinAgent: 'agent', spinAgents: 'agents',
    cmdRadar: 'Open or close the session radar pane (tools, agents, model requests)',
    cmdExport: 'Write everything the radar recorded to a JSON file',
    cmdLang: 'Set the radar language: pt, en or auto (system language)',
    langNow: 'Radar language:',
    langAuto: 'auto (system language)',
    langUsage: 'Use /radar-lang pt, /radar-lang en or /radar-lang auto.',
    exported: 'Radar exported to', exportFailed: 'Could not export the radar:', exportNone: 'Could not export the radar.',
    credit: `Session Radar · by Neural Seam · neuralseam.cloud · v${VERSION}`,
    web: 'Browser',
    cmdWeb: 'Open the radar in the browser, served from this machine only; /radar-web stop ends it',
    webOpened: (url, b) => `Radar web view ${b}: ${url}`,
    webStopped: 'Radar web view stopped.',
    webIdle: 'The radar web view is not running.',
    webFailed: 'Could not start the radar web view. It needs Node.js 20 or later on the PATH (`node`).',
    webUsage: 'Use /radar-web to open it or /radar-web stop to end it.',
    tabInsights: 'Insights', tabConfig: 'Config',
    homeTitle: 'Session Radar · what Claude Code is doing in this session',
    homeModel: 'Model', homeEffort: 'effort', homeTokens: 'Tokens',
    homeTokensLine: (inp, hit, out) => `${inp} in (${hit}% from cache) · ${out} out`,
    noLimits: 'Plan limits: not reported for this account',
    limitName: { five_hour: '5h window', seven_day: 'Weekly', spend_limit: 'Spend limit' },
    resetsAt: (t) => `resets at ${t}`,
    resetsOn: (d, t) => `resets ${d} ${t}`,
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    whereToLook: 'Where to look',
    guide: {
      activities: (n) => (n ? `${plural(n, 'activity', 'activities')} · ` : '') + 'each prompt and the tools it called',
      insights: (on, n) => (on ? `${plural(n, 'suggestion', 'suggestions')} for this project's setup`
        : "suggestions for this project's setup · off: turn on in 4"),
      config: 'notifications, insights, auto export, badge, position, language',
      web: (calls, api) => (calls || api ? `${plural(calls, 'call', 'calls')}, ${plural(api, 'request', 'requests')} · ` : '') +
        'timeline, agents, tokens, memory',
    },
    helpText: {
      home: 'The session at a glance: model, context, tokens, plan limits and the cache, straight from Claude ' +
        'Code. Below, what each tab shows; w opens the browser view for the timeline, agents, tokens and ' +
        'memory. Switch tabs with 1 to 4; d moves the radar beside the transcript or below; h hides this help.',
      activities: 'Each prompt you send is one activity. Open one with Enter to see every tool it called, in ' +
        "order, its subagents' included, with when it started and how long it took.",
      insights: "Fixed rules read this session and the project's history and suggest setup changes. Once " +
        'you apply one, press mark applied: the tab compares the sessions before and after.',
      config: 'Enter or a click changes a line. Everything that notifies or keeps data starts off.',

    },
    cmdConfig: 'Open the radar settings: notifications, insights, language',
    notifyDone: (n, dur, calls, fails, until) => `#${n} done · ${dur} · ${calls} tools` +
      (fails ? ` · ${plural(fails, 'failure', 'failures')}` : '') + (until ? ` · cache until ${until}` : ''),
    notifyCache: (left, tok, assumed) => `Main session cache expires in ${left} · ~${tok} tok would be rewritten` +
      (assumed ? ' (TTL assumed 5m)' : ''),
    cfgTitle: 'Settings · Enter or click to change; kept for your next sessions',
    cfgNotifyDone: 'Notify when an activity ends',
    cfgNotifyDoneMin: (s) => `only if it took at least ${fmtDur(s * 1000)}`,
    cfgNotifyCache: 'Warn before the main session cache expires',
    cfgNotifyCacheLead: (s) => `this long before: ${fmtDur(s * 1000)}`,
    cfgInsights: 'Insights, with per-project history',
    cfgAiHint: `Suggest the AI review (${AI_REVIEW})`,
    cfgClearHistory: 'Delete the stored history',
    cfgAutoExport: 'Save the export automatically when an activity ends',
    cfgAutoExportNote: 'One file per session in this folder, for the AI review. Do not commit it.',
    cfgBadge: (b) => `Always show this session's badge (${b}) under the prompt`,
    cfgBadgeNote: 'It also shows there while the browser view runs, to tell its tab apart.',
    cfgPosition: 'Radar position',
    posSide: 'side (beside the transcript, in fullscreen)',
    posBottom: 'below (above the prompt, compact)',
    cfgPositionNote: 'd in the radar switches too. Under 110 columns Claude Code places the side pane below.',
    dockBottom: 'Dock below', dockSide: 'Dock to side', close: 'Close',
    bandKeys: 'ctrl+x tab for the keys',
    cfgHistoryCleared: 'History deleted.',
    cfgNotifyNote: 'Notifications use your Claude Code notification channel, a toast where it has none, and the browser view. Never a prompt.',
    cfgInsightsNote: 'History keeps counts per project between sessions: no prompts, no arguments.',
    insightsOff: 'Insights are off. Turn them on in Config (4): they read this session and keep per-project counts.',
    noFindings: 'Nothing to suggest for this session yet.',
    historyLine: (n) => `History: ${plural(n, 'earlier session', 'earlier sessions')} of this project`,
    markApplied: 'mark applied', markedApplied: 'applied ✓',
    moreInExport: (n) => `… ${n} more: the export (e) has them all`,
    trends: 'Since the changes you marked as applied',
    trendLine: (name, before, after, nb, na) => `${name}: ${before} → ${after ?? '…'} (${nb} → ${na} sessions)`,
    aiHint: `AI review: e to export, then ${AI_REVIEW} (uses this session's tokens)`,
    unit: { tokTurn: 'tok/turn', countTurn: '/turn', msTurn: '/turn', pct: '%', tok: 'tok' },
    ins: {
      'cache-expired': (d) => [
        `Cache expired ${d.count}× after a pause (longest ${fmtDur(d.longestGap)}): ~${fmtTok(d.rewritten)} tok resent, ~${fmtTok(d.waste)} tok-eq lost`,
        d.oneHourNet == null ? 'Turn on the cache warning in Config to resume before it expires'
          : d.oneHourNet > 0 ? `A 1h cache TTL would have saved ~${fmtTok(d.oneHourNet)} tok-eq here; or turn on the cache warning`
            : 'A 1h TTL would not pay off here (its writes cost 2×); turn on the cache warning instead',
      ],
      'cache-model-switch': (d) => [
        `A model switch lost the cache ${d.count}× (${d.from} → ${d.to}): ~${fmtTok(d.rewritten)} tok resent`,
        'Each model has its own cache: switch between activities, not in the middle of one',
      ],
      'denied-repeated': (d) => [
        `${d.permission} denied ${d.count}×`,
        d.safety === 'never' ? 'Claude keeps asking: add it to permissions.deny, or say in CLAUDE.md not to run it'
          : d.safety === 'safe' ? 'Read-only: a candidate for permissions.allow in .claude/settings.json'
            : 'If it is safe in this project, add it to permissions.allow; if not, to permissions.deny',
      ],
      'failing-repeated': (d) => [
        `${trunc(d.key, 50)} failed ${d.count}×` + (d.sessions > 1 ? ` in ${d.sessions} sessions` : ''),
        'Write the right command in CLAUDE.md, or check it with a hook',
      ],
      'repeated-command': (d) => [
        `"${trunc(d.label, 40)}" ran ${d.count}× (${fmtDur(d.ms)})`,
        'A script, skill or slash command could do it in one step',
      ],
      'web-repeat': (d) => [`${trunc(d.url, 50)} fetched ${d.count}×`, 'Keep a local copy of those docs, or use a docs MCP'],
      'slow-tool': (d) => [`${d.name}: p95 ${fmtDur(d.p95)} over ${d.count} calls`, 'Run long commands in the background, or make them faster'],
      'subagent-model': (d) => [
        `Subagent "${trunc(d.label, 30)}" only read files, on ${d.model} (${fmtTok(d.tokIn)} tok)`,
        'Read-only searches fit the Explore type or model: haiku',
      ],
      'context-pressure': (d) => [`Context reached ${d.pct}%`, 'Use /compact between activities, or trim what is always loaded'],
      'fixed-overhead': (d) => [
        `The first request already sends ${fmtTok(d.tokens)} tok` + (d.median ? ` (median ${fmtTok(d.median)})` : ''),
        'System prompt, tools, MCP and CLAUDE.md are paid every session: review what is loaded',
      ],
      'mcp-unused': (d) => [
        `MCP not used in ${d.sessions} sessions: ${d.servers.join(', ')}`,
        'Their tool definitions still take context: disable them in .mcp.json',
      ],
      'mcp-unreliable': (d) => [
        `MCP ${d.server}: ${d.fails} of ${d.count} calls failed, p95 ${fmtDur(d.p95)}`,
        'Check the server, or disable it if it does not help',
      ],
    },
    ruleName: {
      'cache-expired': 'Cache expired', 'cache-model-switch': 'Model switch', 'denied-repeated': 'Denials',
      'failing-repeated': 'Failures', 'repeated-command': 'Repeated command', 'web-repeat': 'Repeated fetch',
      'slow-tool': 'Slow tool', 'subagent-model': 'Subagent model', 'context-pressure': 'Context',
      'fixed-overhead': 'First request', 'mcp-unused': 'Unused MCP', 'mcp-unreliable': 'Unreliable MCP',
    },
  },
  pt: {
    tabHome: 'Início', tabActivities: 'Atividades',
    export: 'Exportar', clear: 'Limpar', clearConfirm: 'x de novo para limpar', help: 'Ajuda', language: 'Idioma',
    running: 'rodando', denied: 'negado',
    emptyActivities: 'Nenhuma atividade ainda. Cada prompt que você envia vira uma atividade aqui, com todas as ferramentas que ela chamou.',
    activitiesHint: 'Tab ou ↑↓ para navegar, Enter abre ou fecha uma atividade',
    continuation: '(sem prompt: o Claude continuou sozinho)',
    noTools: 'Nenhuma ferramenta chamada nesta atividade.',
    earlier: (n) => `… ${n} chamadas anteriores desta atividade já saíram da memória`,
    more: (n) => `… mais ${n} acima`,
    tool: 'ferramenta', tools: 'ferramentas', req: 'req.', inTok: 'entrada', outTok: 'saída',
    activity: 'atividade', activities: 'atividades',
    context: 'Contexto', of: 'de', cache: 'Cache',
    expiresIn: (d) => `expira em ${d}`,
    expired: (d) => `expirou há ${d}`,
    ifTtl: (a, b) => `restam ${a} se TTL 5m, ${b} se 1h`,
    recache: (n) => `se expirar: ~${n} tok regravados`,
    fail: 'falha', fails: 'falhas',
    spinTools: 'ferr.', spinReq: 'req.', spinAgent: 'agente', spinAgents: 'agentes',
    cmdRadar: 'Abre ou fecha o painel do radar (ferramentas, agentes, requisições ao modelo)',
    cmdExport: 'Grava tudo o que o radar registrou num arquivo JSON',
    cmdLang: 'Define o idioma do radar: pt, en ou auto (idioma do sistema)',
    langNow: 'Idioma do radar:',
    langAuto: 'auto (idioma do sistema)',
    langUsage: 'Use /radar-lang pt, /radar-lang en ou /radar-lang auto.',
    exported: 'Radar exportado para', exportFailed: 'Não foi possível exportar o radar:', exportNone: 'Não foi possível exportar o radar.',
    credit: `Session Radar · por Neural Seam · neuralseam.cloud · v${VERSION}`,
    web: 'Navegador',
    cmdWeb: 'Abre o radar no navegador, servido só nesta máquina; /radar-web stop encerra',
    webOpened: (url, b) => `Radar no navegador ${b}: ${url}`,
    webStopped: 'Radar no navegador encerrado.',
    webIdle: 'O radar no navegador não está rodando.',
    webFailed: 'Não foi possível iniciar o radar no navegador. Ele precisa do Node.js 20 ou mais novo no PATH (`node`).',
    webUsage: 'Use /radar-web para abrir ou /radar-web stop para encerrar.',
    tabInsights: 'Insights', tabConfig: 'Config',
    homeTitle: 'Session Radar · o que o Claude Code está fazendo nesta sessão',
    homeModel: 'Modelo', homeEffort: 'esforço', homeTokens: 'Tokens',
    homeTokensLine: (inp, hit, out) => `${inp} entrada (${hit}% do cache) · ${out} saída`,
    noLimits: 'Limites do plano: não informados nesta conta',
    limitName: { five_hour: 'Janela 5h', seven_day: 'Semanal', spend_limit: 'Limite de gasto' },
    resetsAt: (t) => `renova às ${t}`,
    resetsOn: (d, t) => `renova ${d} ${t}`,
    weekdays: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
    whereToLook: 'Onde olhar',
    guide: {
      activities: (n) => (n ? `${plural(n, 'atividade', 'atividades')} · ` : '') + 'cada prompt e as ferramentas que ele chamou',
      insights: (on, n) => (on ? `${plural(n, 'sugestão', 'sugestões')} para a configuração do projeto`
        : 'sugestões para a configuração do projeto · desligado: ligue em 4'),
      config: 'avisos, insights, export automático, crachá, posição, idioma',
      web: (calls, api) => (calls || api ? `${plural(calls, 'chamada', 'chamadas')}, ${api} req. · ` : '') +
        'linha do tempo, agentes, tokens, memória',
    },
    helpText: {
      home: 'A sessão num relance: modelo, contexto, tokens, limites do plano e o cache, direto do Claude ' +
        'Code. Abaixo, o que cada aba mostra; w abre o navegador com a linha do tempo, os agentes, os tokens ' +
        'e a memória. Troque de aba com 1 a 4; d move o radar para a lateral ou para baixo; h esconde esta ajuda.',
      activities: 'Cada prompt que você envia é uma atividade. Abra uma com Enter para ver, em ordem, cada ' +
        'ferramenta que ela chamou, inclusive as dos subagentes, com quando começou e quanto levou.',
      insights: 'Regras fixas leem esta sessão e o histórico do projeto e sugerem mudanças na configuração. ' +
        'Depois de aplicar uma, marque como aplicada: a aba compara as sessões antes e depois.',
      config: 'Enter ou um clique muda uma linha. Tudo o que notifica ou guarda dados começa desligado.',
    },
    cmdConfig: 'Abre as configurações do radar: notificações, insights, idioma',
    notifyDone: (n, dur, calls, fails, until) => `#${n} concluída · ${dur} · ${calls} ferramentas` +
      (fails ? ` · ${plural(fails, 'falha', 'falhas')}` : '') + (until ? ` · cache até ${until}` : ''),
    notifyCache: (left, tok, assumed) => `O cache da sessão principal expira em ${left} · ~${tok} tok seriam regravados` +
      (assumed ? ' (TTL presumida 5m)' : ''),
    cfgTitle: 'Configurações · Enter ou clique para mudar; valem para as próximas sessões',
    cfgNotifyDone: 'Avisar quando uma atividade terminar',
    cfgNotifyDoneMin: (s) => `só se levou pelo menos ${fmtDur(s * 1000)}`,
    cfgNotifyCache: 'Avisar antes de o cache da sessão principal expirar',
    cfgNotifyCacheLead: (s) => `com esta antecedência: ${fmtDur(s * 1000)}`,
    cfgInsights: 'Insights, com histórico por projeto',
    cfgAiHint: `Sugerir a análise com IA (${AI_REVIEW})`,
    cfgClearHistory: 'Apagar o histórico guardado',
    cfgAutoExport: 'Salvar o export automaticamente quando uma atividade terminar',
    cfgAutoExportNote: 'Um arquivo por sessão nesta pasta, para a análise com IA. Não o versione.',
    cfgBadge: (b) => `Sempre mostrar o crachá desta sessão (${b}) abaixo do prompt`,
    cfgBadgeNote: 'Ele também aparece ali enquanto o radar no navegador roda, para achar a aba certa.',
    cfgPosition: 'Posição do radar',
    posSide: 'lateral (ao lado do transcript, em tela cheia)',
    posBottom: 'abaixo (acima do prompt, compacto)',
    cfgPositionNote: 'd no radar também alterna. Com menos de 110 colunas o Claude Code põe o painel lateral embaixo.',
    dockBottom: 'Abaixo', dockSide: 'Na lateral', close: 'Fechar',
    bandKeys: 'ctrl+x tab p/ usar as teclas',
    cfgHistoryCleared: 'Histórico apagado.',
    cfgNotifyNote: 'As notificações usam o canal de notificação do Claude Code, um aviso no canto onde ele não existe, e o navegador. Nunca um prompt.',
    cfgInsightsNote: 'O histórico guarda contagens por projeto entre sessões: sem prompts, sem argumentos.',
    insightsOff: 'Os insights estão desligados. Ligue em Config (4): eles leem esta sessão e guardam contagens por projeto.',
    noFindings: 'Nada a sugerir para esta sessão por enquanto.',
    historyLine: (n) => `Histórico: ${plural(n, 'sessão anterior', 'sessões anteriores')} deste projeto`,
    markApplied: 'marcar aplicado', markedApplied: 'aplicado ✓',
    moreInExport: (n) => `… mais ${n}: o export (e) traz todos`,
    trends: 'Desde as mudanças marcadas como aplicadas',
    trendLine: (name, before, after, nb, na) => `${name}: ${before} → ${after ?? '…'} (${nb} → ${na} sessões)`,
    aiHint: `Análise com IA: e para exportar, depois ${AI_REVIEW} (usa tokens da sessão)`,
    unit: { tokTurn: 'tok/turno', countTurn: '/turno', msTurn: '/turno', pct: '%', tok: 'tok' },
    ins: {
      'cache-expired': (d) => [
        `O cache expirou ${d.count}× após uma pausa (maior ${fmtDur(d.longestGap)}): ~${fmtTok(d.rewritten)} tok reenviados, ~${fmtTok(d.waste)} tok-eq perdidos`,
        d.oneHourNet == null ? 'Ligue o aviso de cache em Config para retomar antes de expirar'
          : d.oneHourNet > 0 ? `Uma TTL de 1h teria economizado ~${fmtTok(d.oneHourNet)} tok-eq aqui; ou ligue o aviso de cache`
            : 'Uma TTL de 1h não compensaria aqui (a gravação custa 2×); ligue o aviso de cache',
      ],
      'cache-model-switch': (d) => [
        `Uma troca de modelo perdeu o cache ${d.count}× (${d.from} → ${d.to}): ~${fmtTok(d.rewritten)} tok reenviados`,
        'Cada modelo tem o próprio cache: troque entre atividades, não no meio de uma',
      ],
      'denied-repeated': (d) => [
        `${d.permission} negado ${d.count}×`,
        d.safety === 'never' ? 'O Claude insiste: ponha em permissions.deny, ou diga no CLAUDE.md para não rodar'
          : d.safety === 'safe' ? 'Só leitura: candidato a permissions.allow em .claude/settings.json'
            : 'Se for seguro neste projeto, ponha em permissions.allow; se não, em permissions.deny',
      ],
      'failing-repeated': (d) => [
        `${trunc(d.key, 50)} falhou ${d.count}×` + (d.sessions > 1 ? ` em ${d.sessions} sessões` : ''),
        'Escreva o comando certo no CLAUDE.md, ou confira com um hook',
      ],
      'repeated-command': (d) => [
        `"${trunc(d.label, 40)}" rodou ${d.count}× (${fmtDur(d.ms)})`,
        'Um script, skill ou slash command faria isso num passo',
      ],
      'web-repeat': (d) => [`${trunc(d.url, 50)} buscado ${d.count}×`, 'Guarde uma cópia local dessa documentação, ou use um MCP de docs'],
      'slow-tool': (d) => [`${d.name}: p95 de ${fmtDur(d.p95)} em ${d.count} chamadas`, 'Rode comandos longos em background, ou deixe-os mais rápidos'],
      'subagent-model': (d) => [
        `O subagente "${trunc(d.label, 30)}" só leu arquivos, em ${d.model} (${fmtTok(d.tokIn)} tok)`,
        'Buscas só de leitura cabem no tipo Explore ou em model: haiku',
      ],
      'context-pressure': (d) => [`O contexto chegou a ${d.pct}%`, 'Use /compact entre atividades, ou enxugue o que sempre é carregado'],
      'fixed-overhead': (d) => [
        `A primeira requisição já envia ${fmtTok(d.tokens)} tok` + (d.median ? ` (mediana ${fmtTok(d.median)})` : ''),
        'System prompt, ferramentas, MCP e CLAUDE.md são pagos em toda sessão: revise o que é carregado',
      ],
      'mcp-unused': (d) => [
        `MCP sem uso em ${d.sessions} sessões: ${d.servers.join(', ')}`,
        'As definições das ferramentas ainda ocupam contexto: desative-os no .mcp.json',
      ],
      'mcp-unreliable': (d) => [
        `MCP ${d.server}: ${d.fails} de ${d.count} chamadas falharam, p95 de ${fmtDur(d.p95)}`,
        'Verifique o servidor, ou desative-o se não estiver ajudando',
      ],
    },
    ruleName: {
      'cache-expired': 'Cache expirado', 'cache-model-switch': 'Troca de modelo', 'denied-repeated': 'Negações',
      'failing-repeated': 'Falhas', 'repeated-command': 'Comando repetido', 'web-repeat': 'Busca repetida',
      'slow-tool': 'Ferramenta lenta', 'subagent-model': 'Modelo do subagente', 'context-pressure': 'Contexto',
      'fixed-overhead': 'Primeira requisição', 'mcp-unused': 'MCP sem uso', 'mcp-unreliable': 'MCP instável',
    },
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

let cfg = { ...DEFAULTS }

// Only the known keys, each of its own type: a hand-edited store cannot turn on what it should not
function readConfig(saved) {
  const out = { ...DEFAULTS }
  for (const [k, v] of Object.entries(DEFAULTS)) {
    const got = saved?.[k]
    if (typeof v === 'boolean' && typeof got === 'boolean') out[k] = got
    if (typeof v !== 'boolean' && CHOICES[k]?.includes(got)) out[k] = got
  }
  return out
}

async function saveConfig($, patch) {
  cfg = { ...cfg, ...patch }
  try {
    await $.store.set('config', cfg)
  } catch {
    // The store is unavailable here; the settings still hold for this session
  }
}

const KIND = {
  tool: { icon: '⚙', color: 'cyan' },
  mcp: { icon: '⇄', color: 'magenta' },
  web: { icon: '◎', color: 'blue' },
  agent: { icon: '◆', color: 'yellow' },
  api: { icon: '✦', color: 'green' },
}

// What is looked at in a glance or acted on stays here; the timeline, the agents and the tokens,
// which need room to read, are in the browser view, whose first three views match these
const TABS = [
  ['home', 'tabHome', '1'],
  ['activities', 'tabActivities', '2'],
  ['insights', 'tabInsights', '3'],
  ['config', 'tabConfig', '4'],
]

// ---------------------------------------------------------------------------
// State: module variables shared by every hook
// ---------------------------------------------------------------------------

let S = fresh()
let tab = 'home'
let paneOpen = false
let showHelp = false
// When x was pressed once: a second press within CLEAR_CONFIRM_MS clears
let clearArmedAt = 0
// null follows the newest activity; 'none' keeps every activity closed
let openTurn = null
let seq = 0
// The project the session runs in, which names its history; the history as stored; the MCP servers
// the project's .mcp.json lists. The last two are read only while insights are on.
let cwd = null
let hist = null
let mcpConfigured = []
let histWrite = Promise.resolve()
let badge = makeBadge(null)

// What the radar recorded is also handed to Claude Code, which holds it for the session, so a reload
// of the mod (an update, /reload-plugins, a hot reload while developing it) carries on from it
// instead of starting over. It is written at most every SAVE_MS while something changed, and at
// once when an activity ends, which is when a reload comes. Only the first session.start of a copy
// of the module reads it back: that one is the reload, and a later one must not roll back to it.
const SAVED = { plugin: 'session-radar', key: 'session' }
let restoreDone = false
let saveDirty = false
let lastSave = 0
let saving = Promise.resolve()

function saveState($) {
  if (!restoreDone) return saving
  saveDirty = false
  lastSave = Date.now()
  const value = { v: 1, savedAt: lastSave, seq, exportRoot, S: { ...S, agents: [...S.agents.values()] } }
  saving = saving.then(() => $.state.set(SAVED, value)).catch(() => {
    saveDirty = true
  })
  return saving
}

async function restoreState($) {
  restoreDone = true
  let saved
  try {
    saved = (await $.state.get(SAVED)).value
  } catch {
    // No state here: the radar starts empty, as before
    return
  }
  if (saved?.v !== 1 || !Array.isArray(saved.S?.spans) || !Array.isArray(saved.S.agents)) return
  if (typeof saved.exportRoot === 'string') exportRoot = saved.exportRoot
  const base = fresh()
  S = {
    ...base,
    ...saved.S,
    totals: { ...base.totals, ...saved.S.totals },
    agents: new Map([...base.agents, ...saved.S.agents.map((a) => [a.id, a])]),
  }
  // The calls still running when the old copy went away end with it: their outcome never reaches
  // this one. Subagents stay open, since their end is reported to whichever copy is loaded.
  for (const s of S.spans) {
    if (s.end) continue
    s.end = saved.savedAt ?? Date.now()
    s.status = 'interrupted'
  }
  seq = Math.max(saved.seq ?? 0, ...S.spans.map((s) => s.id))
}

function fresh() {
  const startedAt = Date.now()
  return {
    id: `${startedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt,
    maxCtxPct: 0,
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
const redraw = ($) => {
  markWebDirty()
  saveDirty = true
  $.ui.invalidate('ui.render')
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

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
  const out = {
    tool: 'session-radar',
    generator: GENERATOR,
    exportedAt: new Date().toISOString(),
    startedAt: new Date(S.startedAt).toISOString(),
    totals: S.totals,
    turns: S.turns,
    agents: [...S.agents.values()],
    spans: S.spans,
  }
  // Added after the existing fields, and only when the person turned insights on
  if (cfg.insights) {
    out.insights = {
      findings: findings(),
      maxContextPercent: Math.round(S.maxCtxPct),
      mcpConfigured,
      history: pastSessions(),
      applied: compareApplied(projectSessions(), appliedMarks()),
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Notifications. Numbers only: never a prompt or a tool's argument, since a notification can show
// on a locked screen.
// ---------------------------------------------------------------------------

// The last ones, for the browser view to show as they come: kept in the module alone, never in the
// record or the export
const MAX_NOTICES = 20
let notices = []
let noticeSeq = 0

function notify($, text, kind) {
  notices.push({ id: ++noticeSeq, at: Date.now(), kind, text })
  if (notices.length > MAX_NOTICES) notices.shift()
  markWebDirty()
  void pushWeb($)
  void (async () => {
    let sent = null
    try {
      sent = await $.ui.notify(text, { title: 'Session Radar' })
    } catch {
      // No notification channel here, or the write failed
    }
    // A terminal with no channel (Windows Terminal, under auto) shows nothing, and the bell shows no
    // text: then a toast. Unless a Notification hook of the person's answered for it on purpose
    if (sent?.isSent && sent.channel !== 'terminal_bell') return
    if (sent?.reason === 'refused') return
    try {
      $.ui.toast(text, { timeoutMs: 8000 })
    } catch {
      // No toasts on this surface either
    }
  })()
}

// How long the loop's cache has left. An unknown TTL counts as 5 minutes, the shorter of the two.
function cacheRemaining(a, now = Date.now()) {
  if (!a?.cacheAt) return null
  return TTL_MS[a.ttl === '1h' ? '1h' : '5m'] - (now - a.cacheAt)
}

const clockTime = (ms) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// FNV-1a over the session id: the same session always gets the same badge, on every reload
function makeBadge(id, project = null) {
  let hash = 2166136261
  for (const ch of String(id ?? Math.random())) {
    hash ^= ch.codePointAt(0)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  let code = ''
  let x = hash
  for (let i = 0; i < 4; i++) {
    code += BADGE_CHARS[x % BADGE_CHARS.length]
    x = Math.floor(x / BADGE_CHARS.length)
  }
  return { code, mark: BADGE_MARKS[x % 4], color: BADGE_COLORS[Math.floor(x / 4) % 4], project }
}

const badgeText = () => `${badge.mark} ${badge.code}`
const baseName = (p) => (p ? String(p).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p : null)

// Under the prompt while the browser view runs, or always when the person asked for it
function showBadge($) {
  try {
    $.ui.status(cfg.badge || web?.base ? `${badge.mark} radar ${badge.code}` : undefined)
  } catch {
    // No status line on this surface
  }
}

function notifyTurnDone($, turn) {
  if (!cfg.notifyDone || !turn?.end || turn.end - turn.start < cfg.notifyDoneMin * 1000) return
  const main = S.agents.get('main')
  const left = main?.ttl ? cacheRemaining(main) : null
  const until = left > 0 ? clockTime(Date.now() + left) : null
  notify($, L.notifyDone(turn.n, fmtDur(turn.end - turn.start), turn.calls, turn.fails, until), 'done')
}

// Once per cache entry, while nothing runs: a running activity keeps the cache alive by itself
function checkCache($) {
  if (!cfg.notifyCache) return
  const a = S.agents.get('main')
  if (!a?.cacheAt || a.cacheWarned === a.cacheAt || S.turns.some((t) => !t.end)) return
  const left = cacheRemaining(a)
  if (left <= 0 || left > cfg.notifyCacheLead * 1000) return
  a.cacheWarned = a.cacheAt
  notify($, L.notifyCache(fmtDur(Math.round(left / 1000) * 1000), fmtTok(a.cachePrompt), !a.ttl), 'cache')
}

// ---------------------------------------------------------------------------
// Insights and the per-project history, both only while insights are on
// ---------------------------------------------------------------------------

const sessionView = () => ({ ...S, agents: [...S.agents.values()] })
const projectSessions = () => (cwd ? hist?.projects?.[cwd]?.sessions ?? [] : [])
const pastSessions = () => projectSessions().filter((r) => r.id !== S.id)
const appliedMarks = () => (cwd ? hist?.applied?.[cwd] ?? [] : [])
const findings = () => analyze(sessionView(), pastSessions(), mcpConfigured)

async function loadInsights($) {
  try {
    const saved = await $.store.get('history')
    hist = saved && typeof saved === 'object' ? saved : null
  } catch {
    hist = null
  }
  try {
    const json = JSON.parse(await $.fs.read('.mcp.json'))
    mcpConfigured = Object.keys(json?.mcpServers ?? {})
  } catch {
    // No .mcp.json in this project, or not JSON
    mcpConfigured = []
  }
}

function writeHistory($) {
  const value = hist
  histWrite = histWrite.then(() => $.store.set('history', value)).catch(() => {})
  return histWrite
}

// Puts this session's counts into the history; a session with nothing in it is left out
function saveSession($) {
  if (!cfg.insights || !cwd || (!S.turns.length && !S.totals.calls)) return histWrite
  hist = upsertHistory(hist, cwd, sessionRecord(sessionView(), S.id))
  return writeHistory($)
}

// A second press takes the mark off
function toggleApplied($, rule) {
  if (!cwd) return
  const marks = appliedMarks()
  const has = marks.some((m) => m.rule === rule)
  hist = {
    projects: hist?.projects ?? {},
    applied: { ...(hist?.applied ?? {}), [cwd]: has ? marks.filter((m) => m.rule !== rule) : [...marks, { rule, at: Date.now() }] },
  }
  writeHistory($)
}

async function clearHistory($) {
  hist = null
  try {
    await histWrite
    await $.store.delete('history')
  } catch {
    // The store is unavailable here
  }
  $.ui.toast(L.cfgHistoryCleared)
}

// The effort level, from the /config row that names it, when this build lists one; the session API
// does not report it. Only that row's value is kept, read at most every EFFORT_MS while Home is drawn.
let effortRead = { at: 0, value: null }

async function readEffort($) {
  if (Date.now() - effortRead.at < EFFORT_MS) return effortRead.value
  let value = null
  try {
    const row = (await $.config.list())?.find?.((r) => /effort/i.test(`${r?.key ?? ''} ${r?.label ?? ''}`))
    if (row && (typeof row.value === 'string' || typeof row.value === 'number')) value = trunc(String(row.value), 12)
  } catch {
    // No /config rows here: Home leaves the effort out
  }
  effortRead = { at: Date.now(), value }
  return value
}

async function trackUsage($) {
  try {
    const u = await $.session.usage()
    S.maxCtxPct = Math.max(S.maxCtxPct, contextPct(u?.context) ?? 0)
  } catch {
    // usage() is not available here
  }
}

const exportName = (at) => `session-radar-${new Date(at).toISOString().replace(/[:.]/g, '-')}.json`

// Exports go under the folder the session started in, kept across reloads, because a relative path
// follows the current folder and a cd during the session would scatter the auto-saved file. The
// folder ignores itself, so no project has to touch its own .gitignore.
const EXPORT_DIR = '.claude/session-radar'
let exportRoot = null
let ignoreWritten = false

async function exportPath($, name) {
  const dir = exportRoot ? `${exportRoot}/${EXPORT_DIR}` : EXPORT_DIR
  if (!ignoreWritten) {
    await $.fs.write(`${dir}/.gitignore`, '*\n')
    ignoreWritten = true
  }
  return `${dir}/${name}`
}

async function exportJson($) {
  const name = exportName(Date.now())
  const file = `${EXPORT_DIR}/${name}`
  try {
    await $.fs.write(await exportPath($, name), JSON.stringify(snapshot(), null, 2))
    $.ui.toast(`${L.exported} ${file}`)
    return file
  } catch (err) {
    $.ui.toast(`${L.exportFailed} ${err?.message ?? err}`)
    return null
  }
}

// With the setting on, one file per conversation, named after its start and rewritten after each
// activity, so it always holds the whole conversation so far. Quiet: a toast per activity would be
// noise, and a failed write only means the next activity tries again.
let autoWrite = Promise.resolve()

function autoExport($) {
  if (!cfg.autoExport) return autoWrite
  const name = exportName(S.startedAt)
  const text = JSON.stringify(snapshot(), null, 2)
  autoWrite = autoWrite.then(async () => $.fs.write(await exportPath($, name), text)).catch(() => {})
  return autoWrite
}

// ---------------------------------------------------------------------------
// Web view. The mod has no server of its own: it starts web/server.mjs as a child, which dies with
// the module, and sends it the same snapshot /radar-export writes, plus the session's usage. The
// page reads it from 127.0.0.1 with a token; nothing here depends on the server being up.
// ---------------------------------------------------------------------------

// null, or { stream, base, url, ingest, ready, timer, dirty, lastPush, pushing }
let web = null

function markWebDirty() {
  if (web) web.dirty = true
}

function usageSnapshot(u) {
  if (!u) return null
  const cost = usageCost(u)
  return clean({
    context: u.context ? clean({ tokens: u.context.tokens, window: u.context.window, percent: u.context.percent }) : null,
    costUsd: typeof cost === 'number' ? cost : null,
    rateLimits: (u.rateLimits ?? []).map((r) => clean({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })),
  })
}

// The Insights tab as the page shows it, read-only, with the texts already in the pane's language,
// so the rules' wording lives in one place. Marking a change as applied stays in the pane.
function insightsView() {
  if (!cfg.insights) return null
  const marked = new Set(appliedMarks().map((m) => m.rule))
  return {
    history: pastSessions().length,
    findings: findings().map((f) => {
      const [title, hint] = L.ins[f.rule](f.data)
      return { rule: f.rule, severity: f.severity, title, hint, applied: marked.has(f.rule) }
    }),
    trends: compareApplied(projectSessions(), appliedMarks()).map((t) => ({
      rule: t.rule,
      text: L.trendLine(L.ruleName[t.rule], fmtMetric(t.before, t.unit) ?? '—', fmtMetric(t.after, t.unit), t.nBefore, t.nAfter),
      better: t.after != null && t.before != null && t.after < t.before,
    })),
    aiHint: cfg.aiHint ? L.aiHint : null,
  }
}

async function pushWeb($) {
  const w = web
  if (!w?.base || w.pushing) return
  if (!w.dirty && Date.now() - w.lastPush < WEB_BEAT_MS) return
  w.pushing = true
  w.dirty = false
  try {
    let usage = null
    try {
      usage = usageSnapshot(await $.session.usage())
    } catch {
      // usage() is not available here; the page shows what the radar collected
    }
    let model = null
    try {
      model = shortModel(await $.session.model())
    } catch {
      // The model is not available here
    }
    const effort = await readEffort($)
    const body = JSON.stringify({
      ...snapshot(),
      now: Date.now(),
      lang: L === STRINGS.pt ? 'pt' : 'en',
      ttlSeen: S.ttlSeen,
      usage,
      session: clean({ ...badge, cwd, model, effort }),
      insightsView: insightsView(),
      // The page shows the ones newer than it has seen, as a toast and, when allowed, a notification
      notices,
      version: VERSION,
    })
    const res = await $.http.fetch(`${w.base}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-radar-token': w.ingest },
      body,
    })
    w.lastPush = Date.now()
    if (!res.ok) w.dirty = true
  } catch {
    w.dirty = true
  } finally {
    w.pushing = false
  }
}

// Resolves the page's URL once the server says where it listens, or null when it cannot start
function startWeb($) {
  if (web) return web.ready
  const w = { stream: null, base: null, url: null, ingest: null, timer: null, dirty: true, lastPush: 0, pushing: false }
  web = w
  w.ready = new Promise((resolve) => {
    let settled = false
    const settle = (url) => {
      if (settled) return
      settled = true
      resolve(url)
    }
    const end = () => {
      w.timer?.cancel()
      if (web === w) web = null
      settle(null)
      showBadge($)
      $.ui.invalidate('ui.render')
    }
    try {
      w.stream = $.process.spawn({ argv: ['node', `${$.plugin.root}/web/server.mjs`], cwd: $.plugin.root })
    } catch {
      end()
      return
    }
    // The loop is the child's life: it reads until the server exits, then forgets it
    void (async () => {
      let buf = ''
      try {
        for await (const { stream, text } of w.stream) {
          if (stream !== 'stdout' || w.base) continue
          buf += text
          const m = /RADAR_READY (\{.*\})/.exec(buf)
          if (!m) continue
          const info = JSON.parse(m[1])
          w.base = `http://127.0.0.1:${info.port}`
          w.url = `${w.base}/?t=${info.viewToken}`
          w.ingest = info.ingestToken
          w.timer = $.clock.every(WEB_PUSH_MS, () => pushWeb($))
          void pushWeb($)
          settle(w.url)
          showBadge($)
          $.ui.invalidate('ui.render')
        }
      } catch {
        // node is missing or the server failed: the radar goes on without it
      }
      end()
    })()
    $.clock.after(WEB_START_MS, () => {
      if (!w.base && web === w) stopWeb($)
    })
  })
  return w.ready
}

async function stopWeb($) {
  const w = web
  if (!w) return false
  web = null
  w.timer?.cancel()
  if (w.base) {
    try {
      await $.http.fetch(`${w.base}/api/shutdown`, { method: 'POST', headers: { 'x-radar-token': w.ingest } })
    } catch {
      // Already gone; without heartbeats it would end on its own anyway
    }
  }
  showBadge($)
  // Not awaited: it settles only once the child has gone, which the shutdown above already asked for
  try {
    w.stream?.return?.()?.catch?.(() => {})
  } catch {
    // The stream had already ended
  }
  $.ui.invalidate('ui.render')
  return true
}

// Hands the URL to the system's browser. The pane and the command's reply show it too, as a link,
// for when no opener is present (a remote shell, a container).
async function openBrowser($, url) {
  const isWindows = (await $.env.get('OS')) === 'Windows_NT'
  const openers = isWindows ? [['rundll32', 'url.dll,FileProtocolHandler', url]] : [['xdg-open', url], ['open', url]]
  for (const argv of openers) {
    try {
      const { exitCode } = await $.process.run(argv, { timeoutMs: 10_000 })
      if (exitCode === 0) return true
    } catch {
      // Not on this system: try the next one
    }
  }
  return false
}

async function openWeb($) {
  const url = await startWeb($)
  if (url) await openBrowser($, url)
  return url
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

// A Text without undefined props, because the validator refuses props it does not know
const T = (Text, text, style = {}) => Text({ wrap: 'truncate', ...clean(style), children: [String(text)] })

// Words into lines of at most `width` cells, for the help text
function wrapText(text, width) {
  const lines = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines
}

const meterColor = (pct) => (pct > 80 ? 'red' : pct > 60 ? 'yellow' : 'green')
const limitName = (kind) => L.limitName[kind] ?? kind

// When a plan limit's window starts over: the time today, or the weekday and time further out
function resetText(iso, now = Date.now()) {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return ''
  return at - now < 20 * 3600_000 ? L.resetsAt(clockTime(at)) : L.resetsOn(L.weekdays[new Date(at).getDay()], clockTime(at))
}

// A label, a bar and what it stands for: context and plan limits, on Home and in Tokens
function meterRow(ui, key, label, pct, note) {
  const { Box, Text } = ui
  return Box({
    key,
    flexDirection: 'row',
    children: [
      T(Text, pad(label, 12)),
      T(Text, bar(pct / 100, 24), { color: meterColor(pct) }),
      T(Text, ` ${Math.round(pct)}%` + (note ? `  ${note}` : ''), { dimColor: true }),
    ],
  })
}

const contextPct = (c) => (c ? (c.percent ?? ((c.tokens ?? 0) / (c.window || 1)) * 100) || 0 : null)
const usageCost = (u) => (typeof u?.cost === 'number' ? u.cost : u?.cost?.usd ?? u?.cost?.total)

function turnMark(t) {
  if (!t.end) return { mark: '●', color: 'yellow' }
  if (t.reason === 'aborted') return { mark: '✗', color: 'red' }
  if (t.reason === 'error' || t.reason === 'refusal') return { mark: '!', color: 'red' }
  return { mark: '✓', color: 'green' }
}

// One line per prompt; the open one lists, in order, every call it made, its subagents' included.
// Compact, below the transcript, without the hint line on top.
function activitiesBody(ui, $, width, maxRows, compact = false) {
  const { Box, Text, Button } = ui
  if (!S.turns.length) return [T(Text, L.emptyActivities, { dimColor: true })]

  const now = Date.now()
  const openId = openTurn === 'none' ? null : openTurn ?? S.turns.at(-1).id
  const newestFirst = [...S.turns].reverse()
  const listed = newestFirst.slice(0, Math.max(compact ? 1 : 3, Math.floor(maxRows / 3)))
  const open = turnById(openId)
  if (open && !listed.includes(open)) listed.push(open)

  const out = compact ? [] : [T(Text, L.activitiesHint, { dimColor: true })]
  let room = compact ? maxRows - listed.length : Math.max(4, maxRows - listed.length - out.length)

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
    // Compact, the open activity shows its calls only in the rows left after the list
    if (t.id !== openId || (compact && room < 2)) continue

    const ind = '    '
    const byTool = Object.entries(t.byTool).sort((a, b) => b[1] - a[1])
    if (!byTool.length) {
      out.push(T(Text, ind + L.noTools, { dimColor: true }))
      room--
      continue
    }
    out.push(T(Text, trunc(ind + byTool.map(([n, c]) => `${n} ×${c}`).join(' · '), width), { color: 'cyan' }))
    if (!compact) {
      out.push(T(Text, trunc(`${ind}✦ ${t.api} ${L.req} · ${fmtTok(t.tokIn)} ${L.inTok} / ${fmtTok(t.tokOut)} ${L.outTok}`, width),
        { dimColor: true }))
    }
    room -= compact ? 1 : 2

    const calls = S.spans.filter((s) => s.turn === t.id && s.kind !== 'api')
    const evicted = t.calls - calls.length
    const shown = compact
      ? calls.slice(calls.length - (calls.length <= room ? calls.length : Math.max(0, room - 1)))
      : calls.slice(-Math.max(1, room - (evicted > 0 ? 1 : 0) - 1))
    if (evicted > 0 && !compact) out.push(T(Text, ind + L.earlier(evicted), { dimColor: true }))
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

// The session at a glance, then what each tab answers, its numbers included, and what only the
// browser shows; with rows to spare, the session's title on top. Compact, below the transcript: the
// glance alone, in two columns when the band is wide enough, since the tab row already names the tabs
async function homeBody(ui, $, width, maxRows, compact = false) {
  const { Box, Text } = ui
  const colW = compact && width >= HOME_COLUMNS_MIN ? Math.floor((width - 3) / 2) : width
  const t = S.totals
  let u = null
  try {
    u = await $.session.usage()
  } catch {
    // usage() is not available here: Home shows what the radar collected
  }
  let model = null
  try {
    model = shortModel(await $.session.model())
  } catch {
    // Fall back on the model of the main loop's last request
  }
  model ??= S.spans.findLast((s) => s.kind === 'api' && s.agent === 'main' && s.name !== '?')?.name ?? null
  const effort = await readEffort($)

  const row = (key, label, text, style) =>
    Box({ key, flexDirection: 'row', children: [T(Text, pad(label, 12)), T(Text, trunc(text, Math.max(0, colW - 12)), style)] })
  const info = [row('h-model', L.homeModel, (model ?? '—') + (effort ? ` · ${L.homeEffort} ${effort}` : ''), { bold: true })]
  if (u?.context) {
    const pct = contextPct(u.context)
    S.maxCtxPct = Math.max(S.maxCtxPct, pct)
    info.push(meterRow(ui, 'h-ctx', L.context, pct, `${fmtTok(u.context.tokens ?? 0)} ${L.of} ${fmtTok(u.context.window ?? 0)}`))
  }
  const cost = usageCost(u)
  const hit = t.tokIn ? Math.round((t.cacheRead / t.tokIn) * 100) : 0
  info.push(row('h-tok', L.homeTokens, L.homeTokensLine(fmtTok(t.tokIn), hit, fmtTok(t.tokOut)) +
    (typeof cost === 'number' ? ` · US$ ${cost.toFixed(2)}` : ''), { dimColor: true }))
  const limits = u?.rateLimits ?? []
  for (const r of limits) {
    info.push(meterRow(ui, 'h-lim-' + r.kind, limitName(r.kind), r.percentUsed ?? 0, r.resetsAt ? resetText(r.resetsAt) : ''))
  }
  if (!limits.length) info.push(T(Text, trunc(L.noLimits, colW), { dimColor: true }))
  // The main session's cache, the one number here that asks for action before it runs out
  const main = S.agents.get('main')
  if (main?.cacheAt) {
    const since = Date.now() - main.cacheAt
    const left = cacheRemaining(main)
    const text = main.ttl
      ? (left > 0 ? L.expiresIn(fmtDur(left)) : L.expired(fmtDur(-left)))
      : L.ifTtl(fmtDur(Math.max(0, TTL_MS['5m'] - since)), fmtDur(Math.max(0, TTL_MS['1h'] - since)))
    const color = !main.ttl ? undefined : left <= 0 ? 'red' : left < 60_000 ? 'yellow' : 'green'
    info.push(row('h-cache', L.cache, `${text} · ${L.recache(fmtTok(main.cachePrompt))}`, color ? { color } : { dimColor: true }))
  }
  if (compact) {
    if (colW === width) return info.slice(0, Math.max(1, maxRows))
    const half = Math.ceil(info.length / 2)
    const column = (key, children) => Box({ key, flexDirection: 'column', width: colW, children })
    return [Box({
      key: 'h-cols',
      flexDirection: 'row',
      columnGap: 3,
      children: [column('h-left', info.slice(0, half)), column('h-right', info.slice(half))],
    })]
  }

  // The tabs here, then the views only the browser has
  const g = L.guide
  const guide = [
    ['2', L.tabActivities, g.activities(S.turns.length)],
    ['3', L.tabInsights, g.insights(cfg.insights, cfg.insights ? findings().length : 0)],
    ['4', L.tabConfig, g.config],
    ['w', L.web, g.web(t.calls, t.api)],
  ].map(([key, name, text]) => Box({
    key: 'guide-' + key,
    flexDirection: 'row',
    children: [
      T(Text, key + ' ', { bold: true }),
      T(Text, pad(name, 12)),
      T(Text, trunc(text, Math.max(0, width - 14)), { dimColor: true }),
    ],
  }))

  let spare = maxRows - info.length - 2
  const shown = guide.slice(0, Math.max(2, spare))
  spare -= shown.length
  const out = []
  if (spare >= 2) {
    out.push(T(Text, trunc(L.homeTitle, width), { bold: true }), T(Text, ' '))
    spare -= 2
  }
  out.push(...info, T(Text, ' '), T(Text, L.whereToLook, { bold: true }), ...shown)
  return out
}

const SEVERITY_MARK = { high: ['●', 'red'], medium: ['●', 'yellow'], low: ['○', undefined] }

function fmtMetric(v, unit) {
  if (v == null) return null
  if (unit === 'tokTurn' || unit === 'tok') return `${fmtTok(Math.round(v))} ${L.unit[unit]}`
  if (unit === 'msTurn') return `${fmtDur(Math.round(v))}${L.unit[unit]}`
  if (unit === 'pct') return `${Math.round(v)}${L.unit[unit]}`
  return `${v.toFixed(2)}${L.unit[unit]}`
}

// One finding is two lines: what was seen, with a button to mark the change as applied, and what to do.
// Compact, below the transcript, without the blank lines.
function insightsBody(ui, $, width, maxRows, compact = false) {
  const { Box, Text, Button } = ui
  if (!cfg.insights) return [T(Text, L.insightsOff, { dimColor: true })]

  const out = []
  const past = pastSessions().length
  if (past) out.push(T(Text, trunc(L.historyLine(past), width), { dimColor: true }))

  const trends = compareApplied(projectSessions(), appliedMarks())
  const gap = compact ? [] : [T(Text, ' ')]
  const tail = (trends.length ? trends.length + 1 + gap.length : 0) + (cfg.aiHint ? 1 + gap.length : 0)
  const list = findings()
  if (!list.length) out.push(T(Text, L.noFindings, { dimColor: true }))

  const marked = new Set(appliedMarks().map((m) => m.rule))
  const fit = Math.max(1, Math.floor((maxRows - out.length - tail) / 2))
  const btnW = Math.max(L.markApplied.length, L.markedApplied.length)
  list.slice(0, fit).forEach((f, i) => {
    const [title, hint] = L.ins[f.rule](f.data)
    const [mark, color] = SEVERITY_MARK[f.severity]
    out.push(Box({
      key: 'f-' + i,
      flexDirection: 'row',
      children: [
        T(Text, pad(`${mark} ${title}`, Math.max(10, width - btnW - 1)) + ' ', color ? { color } : {}),
        Button({
          key: 'apply-' + i,
          label: marked.has(f.rule) ? L.markedApplied : L.markApplied,
          plain: true,
          dimColor: !marked.has(f.rule),
          onPress: () => {
            toggleApplied($, f.rule)
            redraw($)
          },
        }),
      ],
    }))
    out.push(T(Text, trunc('  ' + hint, width), { dimColor: true }))
  })
  if (list.length > fit) out.push(T(Text, L.moreInExport(list.length - fit), { dimColor: true }))

  if (trends.length) {
    out.push(...gap, T(Text, L.trends, { bold: true }))
    for (const t of trends) {
      const line = L.trendLine(L.ruleName[t.rule], fmtMetric(t.before, t.unit) ?? '—', fmtMetric(t.after, t.unit), t.nBefore, t.nAfter)
      const better = t.after != null && t.before != null && t.after < t.before
      out.push(T(Text, trunc('  ' + line, width), better ? { color: 'green' } : { dimColor: true }))
    }
  }
  if (cfg.aiHint) out.push(...gap, T(Text, trunc(L.aiHint, width), { color: 'cyan' }))
  return out
}

// The settings in groups, each with its note. Compact, below the transcript: the settings alone,
// without the notes and the blank lines, in two columns when the band is wide enough.
function configBody(ui, $, width, compact = false) {
  const { Box, Text, Button } = ui
  const columns = compact && width >= HOME_COLUMNS_MIN
  const colW = columns ? Math.floor((width - 3) / 2) : width
  const check = (on) => (on ? '[x] ' : '[ ] ')
  const next = (k) => CHOICES[k][(CHOICES[k].indexOf(cfg[k]) + 1) % CHOICES[k].length]
  const row = (key, label, onPress, dim = false) =>
    Button({ key: 'cfg-' + key, label: trunc(label, colW), plain: true, dimColor: dim, onPress: async () => {
      await onPress()
      redraw($)
    } })

  const groups = [
    [L.cfgNotifyNote, [
      row('notifyDone', check(cfg.notifyDone) + L.cfgNotifyDone, () => saveConfig($, { notifyDone: !cfg.notifyDone })),
      row('notifyDoneMin', '    ' + L.cfgNotifyDoneMin(cfg.notifyDoneMin),
        () => saveConfig($, { notifyDoneMin: next('notifyDoneMin') }), !cfg.notifyDone),
      row('notifyCache', check(cfg.notifyCache) + L.cfgNotifyCache, () => saveConfig($, { notifyCache: !cfg.notifyCache })),
      row('notifyCacheLead', '    ' + L.cfgNotifyCacheLead(cfg.notifyCacheLead),
        () => saveConfig($, { notifyCacheLead: next('notifyCacheLead') }), !cfg.notifyCache),
    ]],
    // The note goes between the two settings and the button that deletes what they kept
    [L.cfgInsightsNote, [
      row('insights', check(cfg.insights) + L.cfgInsights, async () => {
        await saveConfig($, { insights: !cfg.insights })
        if (cfg.insights) await loadInsights($)
      }),
      row('aiHint', check(cfg.aiHint) + L.cfgAiHint, () => saveConfig($, { aiHint: !cfg.aiHint })),
    ], [row('clearHistory', '    ' + L.cfgClearHistory, () => clearHistory($), true)]],
    [L.cfgAutoExportNote, [
      row('autoExport', check(cfg.autoExport) + L.cfgAutoExport, () => saveConfig($, { autoExport: !cfg.autoExport })),
    ]],
    [L.cfgBadgeNote, [
      row('badge', check(cfg.badge) + L.cfgBadge(badgeText()), async () => {
        await saveConfig($, { badge: !cfg.badge })
        showBadge($)
      }),
    ]],
    [L.cfgPositionNote, [
      row('position', `${L.cfgPosition}: ${cfg.position === 'side' ? L.posSide : L.posBottom}`,
        () => setPosition($, next('position'))),
    ]],
    [null, [
      row('language', `${L.language}: ${langPref === 'auto' ? L.langAuto : langPref.toUpperCase()}`,
        () => saveLanguage($, LANGS[(LANGS.indexOf(langPref) + 1) % LANGS.length])),
    ]],
  ]

  if (compact) {
    const rows = groups.map(([, items, after = []]) => [...items, ...after])
    if (!columns) return rows.flat()
    // Notifications, export and badge on the left; insights, position and language on the right
    const column = (key, children) => Box({ key, flexDirection: 'column', width: colW, children })
    return [Box({
      key: 'cfg-cols',
      flexDirection: 'row',
      columnGap: 3,
      children: [column('cfg-left', [rows[0], rows[2], rows[3]].flat()), column('cfg-right', [rows[1], rows[4], rows[5]].flat())],
    })]
  }
  const out = [T(Text, trunc(L.cfgTitle, width), { dimColor: true }), T(Text, ' ')]
  groups.forEach(([note, items, after = []], i) => {
    out.push(...items)
    if (note) out.push(T(Text, trunc('    ' + note, width), { dimColor: true }))
    out.push(...after)
    if (i < groups.length - 1) out.push(T(Text, ' '))
  })
  return out
}

// ---------------------------------------------------------------------------
// Where the radar shows, as the Config tab or d chooses: a pane, which Claude Code docks beside the
// transcript in fullscreen from 110 columns and otherwise seats above the prompt; or the band above
// the prompt, compacted to the rows it has. A mod cannot place a pane itself, so below is the band.
// paneOpen says the radar is on screen, in either place.
// ---------------------------------------------------------------------------

const PANE_OPEN = { id: PANE, title: 'Session Radar', focus: true, closeOnEscape: true, rows: 22, columns: 84 }

async function openRadar($) {
  if (cfg.position === 'side') await $.ui.open(PANE_OPEN)
  paneOpen = true
  redraw($)
}

async function closeRadar($) {
  paneOpen = false
  if (cfg.position === 'side') await $.ui.close({ id: PANE })
  redraw($)
}

async function setPosition($, position) {
  if (position === cfg.position) return
  const wasOpen = paneOpen
  // Closing the pane raises ui.close, which marks the radar closed; it reopens in its new place
  if (wasOpen && cfg.position === 'side') await $.ui.close({ id: PANE })
  await saveConfig($, { position })
  if (wasOpen) await openRadar($)
  else redraw($)
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
    try {
      cfg = readConfig(await $.store.get('config'))
    } catch {
      cfg = { ...DEFAULTS }
    }
    cwd = e.cwd ?? cwd
    if (!restoreDone) await restoreState($)
    exportRoot ??= cwd
    let sessionId = null
    try {
      sessionId = await $.session.id()
    } catch {
      // No session id here: the radar's own id still tells this session apart
    }
    badge = makeBadge(sessionId ?? S.id, baseName(cwd))
    showBadge($)
    if (cfg.insights) await loadInsights($)
    await $.command.register({ name: 'radar', description: L.cmdRadar, immediate: true })
    await $.command.register({ name: 'radar-export', description: L.cmdExport, immediate: true })
    await $.command.register({ name: 'radar-lang', description: L.cmdLang, argumentHint: 'pt | en | auto', immediate: true })
    await $.command.register({ name: 'radar-web', description: L.cmdWeb, argumentHint: 'stop', immediate: true })
    await $.command.register({ name: 'radar-config', description: L.cmdConfig, immediate: true })
    // Keep the timers of running items moving, once a second, only when something is on screen;
    // and warn before the cache expires, when the person asked for it; and hand Claude Code what
    // changed, for a reload
    $.clock.every(1000, () => {
      checkCache($)
      if (saveDirty && Date.now() - lastSave >= SAVE_MS) void saveState($)
      if (paneOpen || S.spans.some((s) => !s.end)) $.ui.invalidate('ui.render')
    })
    return next(e)
  })

  // /clear, /resume and /branch start a new conversation, so the radar starts over. The session
  // that ends goes into the history first, when insights are on.
  on('session.end', async ($, e, next) => {
    await saveSession($)
    if (e.reason === 'clear' || e.reason === 'resume') {
      S = fresh()
      openTurn = null
      markWebDirty()
      await saveState($)
    }
    return next(e)
  })

  on('command.run', { command: 'radar' }, async ($) => {
    await (paneOpen ? closeRadar($) : openRadar($))
    return {}
  })

  on('command.run', { command: 'radar-config' }, async ($) => {
    tab = 'config'
    if (!paneOpen) await openRadar($)
    redraw($)
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

  on('command.run', { command: 'radar-web' }, async ($, e) => {
    const arg = String(e.args ?? '').trim().toLowerCase()
    if (arg === 'stop') return { text: (await stopWeb($)) ? L.webStopped : L.webIdle }
    if (arg && arg !== 'open') return { text: L.webUsage }
    const url = await openWeb($)
    return { text: url ? L.webOpened(url, badgeText()) : L.webFailed }
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
      saveDirty = true
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
      notifyTurnDone($, turn)
      // In the background, so the turn's completion is never held up. The usage first, so the
      // history and the saved export carry the highest context use
      void (cfg.insights ? trackUsage($) : Promise.resolve()).then(() => {
        saveSession($)
        autoExport($)
        saveDirty = true
      })
    }
    redraw($)
    // Awaited, unlike the rest: a reload comes as the turn ends, and the activity must be in it
    if (!e.agentId) await saveState($)
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
    // Two cells narrower than the body: the pane's close mark is drawn over the first row's last cell
    const width = Math.max(40, (e.props.bodyColumns ?? 84) - 2)
    return radarTree($, $.ui.resolve(e), width, e.props.scroll?.bodyRows ?? 22, false)
  })

  // Below the transcript: the band above the prompt, while the radar is open there; a survey has it first.
  // The band has no frame of its own, as the pane does, so the radar draws one in the badge's color to
  // set it apart from the transcript; it takes two rows and four columns, and is left out under BAND_FRAME_MIN rows.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!paneOpen || cfg.position !== 'bottom' || e.props.hasSurvey) return next(e)
    const ui = $.ui.resolve(e)
    const columns = e.props.bodyColumns ?? 80
    const rows = e.props.maxRows ?? 12
    if (rows < BAND_FRAME_MIN) return radarTree($, ui, Math.max(40, columns), Math.max(3, rows), true)
    const tree = await radarTree($, ui, Math.max(40, columns - 4), rows - 2, true)
    return ui.Box({ key: 'frame', flexDirection: 'column', borderStyle: 'round', borderColor: badge.color, paddingX: 1, children: [tree] })
  })
}

// The radar's drawing, in the pane or, compact, in the band: the tab and action rows, the status
// line, then the tab. Compact keeps the rows to what the band has: tabs and actions share a row when
// they fit, no blank rows, Home and Config without their notes, the credit only where there is room.
async function radarTree($, ui, width, bodyRows, compact) {
  const { Box, Text, Button, Link } = ui
  const tabs = Box({
    key: 'tabs',
    flexDirection: 'row',
    // Seven tabs fit a narrow pane only a cell apart
    columnGap: width >= 70 ? 2 : 1,
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
      // Clearing cannot be undone: the first press asks, a second within a few seconds clears
      Button({
        key: 'reset',
        label: Date.now() - clearArmedAt < CLEAR_CONFIRM_MS ? L.clearConfirm : L.clear,
        hotkey: 'x',
        plain: true,
        dimColor: Date.now() - clearArmedAt >= CLEAR_CONFIRM_MS,
        onPress: () => {
          if (Date.now() - clearArmedAt < CLEAR_CONFIRM_MS) {
            clearArmedAt = 0
            S = fresh()
            openTurn = null
            void saveState($)
          } else {
            clearArmedAt = Date.now()
          }
          redraw($)
        },
      }),
      Button({
        key: 'web',
        label: L.web,
        hotkey: 'w',
        plain: true,
        dimColor: !web?.url,
        onPress: async () => {
          if (!(await openWeb($))) $.ui.toast(L.webFailed)
        },
      }),
      // The address only in the pane: the band has no room for it, and /radar-web names it anyway
      ...(web?.url && Link && !compact ? [Text({ wrap: 'truncate', children: [Link({ href: web.url, label: web.base.replace('http://', '') })] })] : []),
      // As DevTools' dock button: the place it goes to, not the one it is in
      Button({
        key: 'dock',
        label: dockLabel(),
        hotkey: 'd',
        plain: true,
        dimColor: true,
        onPress: () => setPosition($, cfg.position === 'side' ? 'bottom' : 'side'),
      }),
      Button({
        key: 'help',
        label: L.help,
        hotkey: 'h',
        plain: true,
        dimColor: !showHelp,
        onPress: () => {
          showHelp = !showHelp
          redraw($)
        },
      }),
      // The band has no close mark of its own, as the pane does
      ...(compact ? [Button({ key: 'close', label: L.close, hotkey: 'q', plain: true, dimColor: true, onPress: () => closeRadar($) })] : []),
    ],
  })

  // The details went to Home: here only what tells at a glance how the session is going. In the band,
  // which takes the keys only after ctrl+x tab or a click, it says so, and the credit follows where it fits
  const t = S.totals
  const fails = t.errors + t.denied
  const summary = trunc(`⏱ ${fmtDur(Date.now() - S.startedAt)} · ${plural(S.turns.length, L.activity, L.activities)} · ` +
    `${plural(t.calls, L.tool, L.tools)}`, width - 21)
  const failText = fails ? ` · ${plural(fails, L.fail, L.fails)}` : ''
  let spare = width - badgeText().length - 1 - summary.length - failText.length
  const extra = []
  for (const text of compact ? [L.bandKeys, L.credit] : []) {
    if (spare < text.length + 3) break
    extra.push(T(Text, ` · ${text}`, { dimColor: true }))
    spare -= text.length + 3
  }
  const status = Box({
    key: 'status',
    flexDirection: 'row',
    children: [
      T(Text, badgeText() + ' ', { color: badge.color, bold: true }),
      T(Text, summary, { dimColor: true }),
      ...(fails ? [T(Text, failText, { color: 'red' })] : []),
      ...extra,
    ],
  })

  // h: a few lines on how to read the tab, above it
  const help = showHelp ? wrapText(L.helpText[tab], width).map((line) => T(Text, line, { color: 'cyan' })) : []
  let body
  if (compact) {
    // Tabs and actions share a row when both fit
    const header = buttonsWidth(TABS.map(([, k]) => L[k]), 2) + 2 + buttonsWidth(actionLabels(), 2) <= width
      ? [Box({ key: 'top', flexDirection: 'row', columnGap: 2, children: [tabs, actions] })]
      : [tabs, actions]
    const room = Math.max(1, bodyRows - header.length - 1 - help.length)
    if (tab === 'activities') body = activitiesBody(ui, $, width, room, true)
    else if (tab === 'insights') body = insightsBody(ui, $, width, room, true)
    else if (tab === 'config') body = configBody(ui, $, width, true)
    else body = await homeBody(ui, $, width, room, true)
    return Box({ flexDirection: 'column', children: [...header, status, ...help, ...body] })
  }

  // Two rows fewer for the body, so the credit footer stays on screen
  const room = Math.max(4, Math.max(6, bodyRows - 9) - help.length - (help.length ? 1 : 0))
  if (tab === 'activities') body = activitiesBody(ui, $, width, room)
  else if (tab === 'insights') body = insightsBody(ui, $, width, room)
  else if (tab === 'config') body = configBody(ui, $, width)
  else body = await homeBody(ui, $, width, room)

  const credit = T(Text, trunc(L.credit, width), { dimColor: true })
  const helpRows = help.length ? [...help, T(Text, ' ')] : []
  return Box({ flexDirection: 'column', children: [tabs, actions, status, T(Text, ' '), ...helpRows, ...body, T(Text, ' '), credit] })
}

const dockLabel = () => (cfg.position === 'side' ? L.dockBottom : L.dockSide)

// What the band's action row takes, for it to tell whether it fits beside the tabs
function actionLabels() {
  const clear = Date.now() - clearArmedAt < CLEAR_CONFIRM_MS ? L.clearConfirm : L.clear
  return [L.export, clear, L.web, dockLabel(), L.help, L.close]
}

// A plain Button is drawn as its hotkey, a separator and its label
const buttonsWidth = (labels, gap) => labels.reduce((n, label) => n + label.length + 3, 0) + gap * (labels.length - 1)
