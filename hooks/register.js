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
// Shown in a pane with seven tabs (/radar), as a live summary beside the spinner, and, on request
// (/radar-web), as a page in the browser served from this machine's loopback by web/server.mjs.
// Nothing leaves the machine: no remote network, no model calls. The only writes are /radar-export
// and, in the mod's own store, the language, the settings and, when insights are on, per-project
// counts. Notifications, when turned on, go to the person's own notification channel.

import { analyze, summarize as sessionRecord, upsertHistory, compareApplied, TTL_MS } from './insights.js'

const PANE = 'session-radar'
const MAX_SPANS = 500
const MAX_TURNS = 200
const MAX_LABEL = 120
const GENERATOR = 'session-radar by Neural Seam (https://github.com/NeuralSeam/ns-session-radar)'
const LANGS = ['auto', 'pt', 'en']
const WEB_PUSH_MS = 500
const WEB_BEAT_MS = 5000
const WEB_START_MS = 10_000
const AI_REVIEW = '/session-radar:radar-review'

// Settings, kept in the store under `config`. Everything that notifies or keeps more data starts off.
const DEFAULTS = { notifyDone: false, notifyDoneMin: 30, notifyCache: false, notifyCacheLead: 60, insights: false, aiHint: false, badge: false }

// Each session's badge: a mark and a four-letter code, the same under the terminal's prompt, in the
// pane and in the browser tab, so parallel sessions are told apart. No 0/O, 1/I/L or U.
const BADGE_CHARS = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
const BADGE_MARKS = ['●', '■', '▲', '★']
const BADGE_COLORS = ['cyan', 'magenta', 'blue', 'green']
const CHOICES = { notifyDoneMin: [15, 30, 60, 120], notifyCacheLead: [30, 60, 120, 300] }

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
    credit: 'Session Radar · by Neural Seam · neuralseam.cloud',
    web: 'Browser',
    cmdWeb: 'Open the radar in the browser, served from this machine only; /radar-web stop ends it',
    webOpened: (url, b) => `Radar web view ${b}: ${url}`,
    webStopped: 'Radar web view stopped.',
    webIdle: 'The radar web view is not running.',
    webFailed: 'Could not start the radar web view. It needs Node.js 20 or later on the PATH (`node`).',
    webUsage: 'Use /radar-web to open it or /radar-web stop to end it.',
    tabInsights: 'Insights', tabConfig: 'Config',
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
    cfgBadge: (b) => `Always show this session's badge (${b}) under the prompt`,
    cfgBadgeNote: 'It also shows there while the browser view runs, to tell its tab apart.',
    cfgHistoryCleared: 'History deleted.',
    cfgNotifyNote: 'Notifications use your Claude Code notification channel and never include a prompt.',
    cfgInsightsNote: 'History keeps counts per project between sessions: no prompts, no arguments.',
    insightsOff: 'Insights are off. Turn them on in Config (7): they read this session and keep per-project counts.',
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
    credit: 'Session Radar · por Neural Seam · neuralseam.cloud',
    web: 'Navegador',
    cmdWeb: 'Abre o radar no navegador, servido só nesta máquina; /radar-web stop encerra',
    webOpened: (url, b) => `Radar no navegador ${b}: ${url}`,
    webStopped: 'Radar no navegador encerrado.',
    webIdle: 'O radar no navegador não está rodando.',
    webFailed: 'Não foi possível iniciar o radar no navegador. Ele precisa do Node.js 20 ou mais novo no PATH (`node`).',
    webUsage: 'Use /radar-web para abrir ou /radar-web stop para encerrar.',
    tabInsights: 'Insights', tabConfig: 'Config',
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
    cfgBadge: (b) => `Sempre mostrar o crachá desta sessão (${b}) abaixo do prompt`,
    cfgBadgeNote: 'Ele também aparece ali enquanto o radar no navegador roda, para achar a aba certa.',
    cfgHistoryCleared: 'Histórico apagado.',
    cfgNotifyNote: 'As notificações usam o canal de notificação do Claude Code e nunca trazem um prompt.',
    cfgInsightsNote: 'O histórico guarda contagens por projeto entre sessões: sem prompts, sem argumentos.',
    insightsOff: 'Os insights estão desligados. Ligue em Config (7): eles leem esta sessão e guardam contagens por projeto.',
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
    if (typeof v === 'number' && CHOICES[k]?.includes(got)) out[k] = got
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
  ['insights', 'tabInsights', '6'],
  ['config', 'tabConfig', '7'],
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
// The project the session runs in, which names its history; the history as stored; the MCP servers
// the project's .mcp.json lists. The last two are read only while insights are on.
let cwd = null
let hist = null
let mcpConfigured = []
let histWrite = Promise.resolve()
let badge = makeBadge(null)

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
  $.ui.invalidate('ui.render')
}
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

function notify($, text) {
  try {
    Promise.resolve($.ui.notify(text, { title: 'Session Radar' })).catch(() => {})
  } catch {
    // No notification channel here
  }
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
  notify($, L.notifyDone(turn.n, fmtDur(turn.end - turn.start), turn.calls, turn.fails, until))
}

// Once per cache entry, while nothing runs: a running activity keeps the cache alive by itself
function checkCache($) {
  if (!cfg.notifyCache) return
  const a = S.agents.get('main')
  if (!a?.cacheAt || a.cacheWarned === a.cacheAt || S.turns.some((t) => !t.end)) return
  const left = cacheRemaining(a)
  if (left <= 0 || left > cfg.notifyCacheLead * 1000) return
  a.cacheWarned = a.cacheAt
  notify($, L.notifyCache(fmtDur(Math.round(left / 1000) * 1000), fmtTok(a.cachePrompt), !a.ttl))
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

async function trackUsage($) {
  try {
    const u = await $.session.usage()
    const pct = u?.context ? (u.context.percent ?? (u.context.tokens / u.context.window) * 100) || 0 : 0
    S.maxCtxPct = Math.max(S.maxCtxPct, pct)
  } catch {
    // usage() is not available here
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
  const cost = typeof u.cost === 'number' ? u.cost : u.cost?.usd ?? u.cost?.total
  return clean({
    context: u.context ? clean({ tokens: u.context.tokens, window: u.context.window, percent: u.context.percent }) : null,
    costUsd: typeof cost === 'number' ? cost : null,
    rateLimits: (u.rateLimits ?? []).map((r) => clean({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })),
  })
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
    const body = JSON.stringify({
      ...snapshot(),
      now: Date.now(),
      lang: L === STRINGS.pt ? 'pt' : 'en',
      ttlSeen: S.ttlSeen,
      usage,
      session: { ...badge, cwd, model },
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
      const remaining = cacheRemaining(a, now)
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
      S.maxCtxPct = Math.max(S.maxCtxPct, pct)
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

const SEVERITY_MARK = { high: ['●', 'red'], medium: ['●', 'yellow'], low: ['○', undefined] }

function fmtMetric(v, unit) {
  if (v == null) return null
  if (unit === 'tokTurn' || unit === 'tok') return `${fmtTok(Math.round(v))} ${L.unit[unit]}`
  if (unit === 'msTurn') return `${fmtDur(Math.round(v))}${L.unit[unit]}`
  if (unit === 'pct') return `${Math.round(v)}${L.unit[unit]}`
  return `${v.toFixed(2)}${L.unit[unit]}`
}

// One finding is two lines: what was seen, with a button to mark the change as applied, and what to do
function insightsBody(ui, $, width, maxRows) {
  const { Box, Text, Button } = ui
  if (!cfg.insights) return [T(Text, L.insightsOff, { dimColor: true })]

  const out = []
  const past = pastSessions().length
  if (past) out.push(T(Text, trunc(L.historyLine(past), width), { dimColor: true }))

  const trends = compareApplied(projectSessions(), appliedMarks())
  const tail = (trends.length ? trends.length + 2 : 0) + (cfg.aiHint ? 2 : 0)
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
    out.push(T(Text, ' '), T(Text, L.trends, { bold: true }))
    for (const t of trends) {
      const line = L.trendLine(L.ruleName[t.rule], fmtMetric(t.before, t.unit) ?? '—', fmtMetric(t.after, t.unit), t.nBefore, t.nAfter)
      const better = t.after != null && t.before != null && t.after < t.before
      out.push(T(Text, trunc('  ' + line, width), better ? { color: 'green' } : { dimColor: true }))
    }
  }
  if (cfg.aiHint) out.push(T(Text, ' '), T(Text, trunc(L.aiHint, width), { color: 'cyan' }))
  return out
}

function configBody(ui, $, width) {
  const { Text, Button } = ui
  const check = (on) => (on ? '[x] ' : '[ ] ')
  const next = (k) => CHOICES[k][(CHOICES[k].indexOf(cfg[k]) + 1) % CHOICES[k].length]
  const row = (key, label, onPress, dim = false) =>
    Button({ key: 'cfg-' + key, label: trunc(label, width), plain: true, dimColor: dim, onPress: async () => {
      await onPress()
      redraw($)
    } })

  const out = [T(Text, trunc(L.cfgTitle, width), { dimColor: true }), T(Text, ' ')]
  out.push(row('notifyDone', check(cfg.notifyDone) + L.cfgNotifyDone, () => saveConfig($, { notifyDone: !cfg.notifyDone })))
  out.push(row('notifyDoneMin', '    ' + L.cfgNotifyDoneMin(cfg.notifyDoneMin),
    () => saveConfig($, { notifyDoneMin: next('notifyDoneMin') }), !cfg.notifyDone))
  out.push(row('notifyCache', check(cfg.notifyCache) + L.cfgNotifyCache, () => saveConfig($, { notifyCache: !cfg.notifyCache })))
  out.push(row('notifyCacheLead', '    ' + L.cfgNotifyCacheLead(cfg.notifyCacheLead),
    () => saveConfig($, { notifyCacheLead: next('notifyCacheLead') }), !cfg.notifyCache))
  out.push(T(Text, trunc('    ' + L.cfgNotifyNote, width), { dimColor: true }))
  out.push(T(Text, ' '))
  out.push(row('insights', check(cfg.insights) + L.cfgInsights, async () => {
    await saveConfig($, { insights: !cfg.insights })
    if (cfg.insights) await loadInsights($)
  }))
  out.push(row('aiHint', check(cfg.aiHint) + L.cfgAiHint, () => saveConfig($, { aiHint: !cfg.aiHint })))
  out.push(T(Text, trunc('    ' + L.cfgInsightsNote, width), { dimColor: true }))
  out.push(row('clearHistory', '    ' + L.cfgClearHistory, () => clearHistory($), true))
  out.push(T(Text, ' '))
  out.push(row('badge', check(cfg.badge) + L.cfgBadge(badgeText()), async () => {
    await saveConfig($, { badge: !cfg.badge })
    showBadge($)
  }))
  out.push(T(Text, trunc('    ' + L.cfgBadgeNote, width), { dimColor: true }))
  out.push(T(Text, ' '))
  out.push(row('language', `${L.language}: ${langPref === 'auto' ? L.langAuto : langPref.toUpperCase()}`,
    () => saveLanguage($, LANGS[(LANGS.indexOf(langPref) + 1) % LANGS.length])))
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
    try {
      cfg = readConfig(await $.store.get('config'))
    } catch {
      cfg = { ...DEFAULTS }
    }
    cwd = e.cwd ?? cwd
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
    // and warn before the cache expires, when the person asked for it
    $.clock.every(1000, () => {
      checkCache($)
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

  on('command.run', { command: 'radar-config' }, async ($) => {
    tab = 'config'
    if (!paneOpen) {
      await $.ui.open({ id: PANE, title: 'Session Radar', focus: true, closeOnEscape: true, rows: 22, columns: 84 })
      paneOpen = true
    }
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
      // In the background, so the turn's completion is never held up
      if (cfg.insights) trackUsage($).then(() => saveSession($))
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
    const { Box, Text, Button, Link } = ui
    // Two cells narrower than the body: the pane's close mark is drawn over the first row's last cell
    const width = Math.max(40, (e.props.bodyColumns ?? 84) - 2)
    const bodyRows = e.props.scroll?.bodyRows ?? 22

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
          key: 'web',
          label: L.web,
          hotkey: 'w',
          plain: true,
          dimColor: !web?.url,
          onPress: async () => {
            if (!(await openWeb($))) $.ui.toast(L.webFailed)
          },
        }),
        ...(web?.url && Link ? [Text({ wrap: 'truncate', children: [Link({ href: web.url, label: web.base.replace('http://', '') })] })] : []),
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
        T(Text, badgeText() + ' ', { color: badge.color, bold: true }),
        T(Text, trunc(`⏱ ${fmtDur(Date.now() - S.startedAt)} · ${plural(S.turns.length, L.turn, L.turns)} · ` +
          `${t.calls} ${L.statusTools} · ${t.mcp} ${L.statusMcp} · ${t.web} ${L.statusWeb} · ` +
          `${t.agents} ${L.statusAgents} · ${t.api} ${L.statusApi}`, width - 21), { dimColor: true }),
        ...(fails ? [T(Text, ` · ${plural(fails, L.fail, L.fails)}`, { color: 'red' })] : []),
      ],
    })

    // Two rows fewer for the body, so the credit footer stays on screen
    const room = Math.max(6, bodyRows - 9)
    let body
    if (tab === 'timeline') body = timelineBody(ui, width, room - 3)
    else if (tab === 'activities') body = activitiesBody(ui, $, width, room)
    else if (tab === 'agents') body = agentsBody(ui, width)
    else if (tab === 'api') body = await apiBody(ui, $, width, room)
    else if (tab === 'insights') body = insightsBody(ui, $, width, room)
    else if (tab === 'config') body = configBody(ui, $, width)
    else body = summaryBody(ui, width)

    const credit = T(Text, trunc(L.credit, width), { dimColor: true })
    return Box({ flexDirection: 'column', children: [tabs, actions, status, T(Text, ' '), ...body, T(Text, ' '), credit] })
  })
}
