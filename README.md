# Session Radar

A mod for **Claude Code** that shows what the agent is doing while it does it: every tool call,
every subagent, every MCP and web call, and every request to the model, with tokens, cache and
time.

It opens as a pane beside the transcript, as a full page in your browser (`w` in the pane, or
`/radar-web`), and adds a one-line summary to the spinner even when the pane is closed:

```
Thinking · ⚙ Bash 4.2s · 12 tools · 7 req. · 2 agents…
```

> **This is a mod, which means it is code.** It runs inside Claude Code with your permissions and
> sees every prompt and tool call in the session. It sends nothing off your machine and calls no
> model; the only file it writes is the one you ask for with `/radar-export`, and the only thing it
> keeps between sessions is your language choice. The browser view, when you open it, is served
> from `127.0.0.1` alone, behind a random token. [SECURITY.md](./SECURITY.md) lists
> exactly what it calls, and `claude plugin validate .` prints the same list from the code.

- **Portuguese:** [README.pt-BR.md](./README.pt-BR.md) (short guide; this file is canonical)
- **From the makers of:** [Neural Seam](https://neuralseam.cloud). Session Radar does not need Neural
  Seam, an account, or anything else installed.

## What it shows

**1 · Timeline.** A Gantt-style view: each row is one thing Claude did, placed where it started and
as wide as it took. A subagent's own calls sit indented under the call that started it. Yellow `▓`
is still running; red failed or was denied.

```
✦ sonnet-5-5     main                     █·······································    2.1s
⚙ Bash           npm test                 ··█████████████·························   11.4s
◆ Agent          map the auth module      ·················███████████████████████   38.0s
 ↳⚙ Grep         login                    ··················█·····················    0.3s
 ↳⇄ github·sear… auth bug                 ····················████················    4.9s
◎ WebFetch       https://example.com/docs ·······································▓  running
```

**2 · Activities.** One line per prompt you sent: its first 120 characters, how long it took, how
many tools it called and how many failed. The newest is open; Tab or the arrows move between them
and Enter opens another. An open activity lists how many times it called each tool, its model
requests and tokens, and every call in order, its subagents' calls indented, each with when it
started (counted from the prompt), its argument, how long it took and whether it failed.

```
▾ ✓ #1 fix the login bug                                       38.2s · 6 tools · 1 failure
    Bash ×2 · Agent ×1 · Grep ×1 · github·search_issues ×1 · WebFetch ×1
    ✦ 4 req. · 20.5k in / 1.2k out
      +2.1s ⚙ Bash             npm test                                          11.4s
     +13.6s ◆ Agent            map the auth module                               38.0s
     +13.9s  ↳⚙ Grep           login                                              0.3s
```

**3 · Agents.** The tree of the main session and its subagents: status, duration, tool calls,
model requests, tokens in and out, and the last three things each one did.

**4 · API.** How full the context is, cost, plan limits, how much input came from the prompt cache,
how long the cache has left, a sparkline of output tokens per request, and a table of every request.
Press `h` in this tab for the meaning of each column:

| Column | What it is |
| --- | --- |
| `new` | Input tokens the cache did not serve, billed at the full input price. Small on a healthy request: only what changed since the last one. |
| `cache↓` | Input tokens read from the prompt cache, far cheaper than new input. Most of a long conversation should land here. |
| `cache↑` | Input tokens written to the cache. They cost more than new input once, then the next request reads them cheaply. |
| `prompt` | `new + cache↓ + cache↑`: everything the request sent. It grows with the conversation. |
| `hit%` | `cache↓ ÷ prompt`. A **yellow** row sent most of a large prompt uncached after the loop's first request: the cache was probably lost, because it expired, the model changed, or the start of the prompt changed. |

**Cache lifetime.** For the main session and the most recent subagent: the TTL of what was cached,
when the cache was last used, how long it has left, and how many tokens the next request rewrites
if it expires. The API restarts an entry's lifetime every time a request reads it, so the countdown
runs from the last request. The TTL comes from the request itself, which says how much it wrote for
5 minutes and how much for 1 hour. When your Claude Code build does not pass that on to mods, the
radar shows the time left under both.

**5 · Summary.** How much of each kind of activity there was, and which tools the time went to,
with their failures.

The interface is in English or Brazilian Portuguese. Pick one with `/radar-lang pt`,
`/radar-lang en` or `/radar-lang auto`, or press `l` in the pane to cycle through them. `auto`, the
default, follows your system language. The choice is kept for your next sessions.

## Requirements

| You need | Check |
| --- | --- |
| Claude Code **2.1.287 or later**, where mods exist | `claude --version` |
| A terminal, or the Code tab of the Desktop app, to see the pane | see [Where it draws](#where-it-draws) |
| For the browser view only: **Node.js 20 or later** on the `PATH` | `node --version` |

## Install

This repository is its own marketplace. Two steps, in this order, because the install resolves the
plugin against marketplaces you have already added:

```
/plugin marketplace add NeuralSeam/ns-session-radar
/plugin install session-radar@ns-session-radar
```

If the install says `Run /reload-plugins to activate.`, do that. Then check:

1. `/plugin` shows a line such as `1 mod active · session-radar`. A mod that is installed but not in
   that line is not running; [Troubleshooting](#troubleshooting) says why.
2. `/radar` opens the pane.

To try it without installing, clone this repository and start Claude Code with
`claude --plugin-dir ./ns-session-radar`.

## Use

| Command | What it does |
| --- | --- |
| `/radar` | Opens or closes the pane. Works while Claude is working. |
| `/radar-export` | Writes everything recorded so far to `session-radar-<time>.json` in the current folder |
| `/radar-lang pt\|en\|auto` | Sets the language and keeps it for your next sessions; with no argument, says which is set |
| `/radar-web` | Opens the radar in your browser (see [Browser view](#browser-view)); `/radar-web stop` ends it |

Inside the pane:

| Key | What it does |
| --- | --- |
| `1` to `5` | Switch tab: Timeline, Activities, Agents, API, Summary |
| Tab, `↑` `↓`, Enter | In Activities, move between activities and open one |
| `h` | In API, show or hide what each column means |
| `l` | Cycle the language: auto, Portuguese, English |
| `w` | Open the browser view, same as `/radar-web` |
| `e` | Export, same as `/radar-export` |
| `x` | Clear what has been recorded |
| `Esc` | Close the pane |

The radar starts over on `/clear`, `/resume` and `/branch`, because those start a different
conversation. Nothing is kept between sessions unless you export it.

## Browser view

Claude Code cannot draw a web page inside the terminal: a mod draws with the terminal's own
elements (boxes, text, buttons, links). So the richer view opens in your browser, fed by the same
data the pane shows.

Press `w` in the pane (`/radar` opens it with the focus), or run `/radar-web`. The mod starts a
small server, `web/server.mjs` (Node, no dependencies), and your default browser opens on it. The
reply and the pane also show the address as a link, for when no browser can be opened.

The page has the same five areas, Timeline, Activities, Agents, API and Summary, plus a search box,
filters by kind, status, agent and time window, sortable tables, charts of the prompt per request
(cache read, cache written, new) and of each activity's duration, and a panel with every detail of
a call or subagent. Keys: `1` to `5` switch area, `/` searches, `Esc` closes the panel.

How it is kept local:

- It listens on `127.0.0.1` only, on a port the system picks, and refuses any request whose `Host`
  or `Origin` is not that address.
- The data needs a random token that only the URL you were given carries; sending data needs a
  second token only the mod knows. The page loads nothing from elsewhere (a `Content-Security-Policy`
  of `'self'`).
- It holds only the last snapshot, in memory. It ends with `/radar-web stop`, when Claude Code
  exits or reloads the mod, and by itself 30 seconds after the mod stops sending.

The `w` key works while the pane has the focus, not while you type at the prompt: a mod cannot take
a plain letter from the prompt. If Node is missing, `/radar-web` says so and everything else keeps
working.

## Where it draws

| Where you run Claude Code | Recording | Pane and spinner |
| --- | --- | --- |
| `claude` in a terminal | yes | yes |
| Code tab of the Desktop app | yes | yes |
| VS Code extension's chat panel | yes | no |
| `claude -p` and the Agent SDK | yes | no |
| Cloud sessions | only if the plugin reaches the session | no |

Where nothing draws, `/radar-export` still gives you the data.

In a narrow terminal the pane sits above the prompt instead of beside the transcript.

## How it knows

| Claude Code event | What the radar takes from it |
| --- | --- |
| `tool.call` | Tool name, its main argument (one line, at most 120 characters), duration, failed or denied. `Agent`/`Task` count as subagents, `mcp__*` as MCP, `WebFetch`/`WebSearch` as web. |
| `agent.spawn` | That a subagent started, and its type |
| `turn.step` | One request to the model: model, input and output tokens, cache read and written, and how much was written for 5 minutes and for 1 hour when the build passes it on |
| `turn.start`, `turn.complete` | Where each turn starts and ends, the first 120 characters of its prompt (one line), and when a subagent finishes |
| `$.session.usage()` | Context, cost and plan limits |

Some fields on `agent.spawn`, and the `agentId` on tool events, are not fully described in the
public documentation. The mod reads the likely names and, when none is there, links a subagent to
the `Agent` call that is open at the time. If your build names them differently, a subagent's calls
show at the top level instead of indented; nothing else breaks. The exact names for your version are
in `.claude-plugin/types/claude-code/index.d.ts`, which Claude Code writes when you load the mod
with `--plugin-dir`.

## Update and uninstall

```
/plugin marketplace update
/reload-plugins
```

```
/plugin uninstall session-radar@ns-session-radar
```

To keep it installed but stop it, `/plugin disable session-radar@ns-session-radar`. Starting Claude Code
with `--safe-mode`, or setting `"disableAllHooks": true`, also stops it.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `/radar` is not a command | Claude Code older than 2.1.287, or the plugin is not loaded | `claude --version`; then `/reload-plugins` |
| `/plugin` lists it but no `mod active` line | The plugin is disabled, mods are off (`disableAllHooks`, `--safe-mode`), or your organization allows only its own mods | `/plugin` to enable it; check your settings, or ask your administrator |
| The pane opens empty | Nothing has happened in this conversation yet | Send a prompt |
| A transcript line says `ui.render (Pane) refused` | Your build rejected part of the drawing | [Open an issue](https://github.com/NeuralSeam/ns-session-radar/issues) with that line and `claude --version` |
| Subagent calls are not indented | Your build names the subagent fields differently | See [How it knows](#how-it-knows), and open an issue with the field names from your `index.d.ts` |

## Compatibility

What this has actually been run against is in [COMPATIBILITY.md](./COMPATIBILITY.md). A combination
that is not listed there has not been tested, which is a different statement from saying it does
not work.

## Support, contributing and licence

- Questions and bugs: [issues](https://github.com/NeuralSeam/ns-session-radar/issues)
- Vulnerability reports: [SECURITY.md](./SECURITY.md), please do not open a public issue
- What it does with your data: [PRIVACY.md](./PRIVACY.md)
- Changes: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Release history: [CHANGELOG.md](./CHANGELOG.md)

**Licence:** Apache-2.0, see [LICENSE](./LICENSE) and [NOTICE](./NOTICE). Version 0.2.0, as
[published in this repository](https://github.com/NeuralSeam/ns-session-radar/tree/e6d2d1cb3c06110318a949bdae909489040e8d51)
before the change, remains available under MIT. The licence grants no rights to the Neural Seam
name or logo; see [TRADEMARKS.md](./TRADEMARKS.md).

Session Radar is an independent extension for Claude Code. It is not made or endorsed by Anthropic.

## Credits and forks

You are welcome to redistribute Session Radar or build on it. If you do:

- Keep the [LICENSE](./LICENSE) and [NOTICE](./NOTICE) files, and preserve the credit to Neural
  Seam.
- Give your derivative a name of its own; [TRADEMARKS.md](./TRADEMARKS.md) says what you can and
  cannot call it.
- [Open an issue](https://github.com/NeuralSeam/ns-session-radar/issues) to have your project listed
  here as a derivative.
