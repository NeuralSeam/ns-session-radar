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
> model; the only file it writes is the export: when you ask for it with `/radar-export`, or after
> each activity if you turn that on. Between sessions it
> keeps your language and settings and, only if you turn insights on, counts per project with no
> prompt or argument in them. Notifications are off until you turn them on. The browser view, when
> you open it, is served from `127.0.0.1` alone, behind a random token. [SECURITY.md](./SECURITY.md) lists
> exactly what it calls, and `claude plugin validate .` prints the same list from the code.

- **Portuguese:** [README.pt-BR.md](./README.pt-BR.md) (short guide; this file is canonical)
- **From the makers of:** [Neural Seam](https://neuralseam.cloud). Session Radar does not need Neural
  Seam, an account, or anything else installed.

## What it shows

The radar has two places. **The pane in the terminal** keeps what you read at a glance or act on
right away: the session's numbers, the activities, the suggestions and the settings. **The browser
view** adds what needs room to read: the timeline, the agents, every request with its cache, charts
and the machine's memory. Press `h` on any tab of the pane for a few lines on how to read it.

### In the terminal

**1 · Home**, where the pane opens. The session at a glance: the model and its effort level, how
full the context is, the tokens in and out with the share served from the cache, the cost, how much
of the 5-hour and weekly plan limits is used, with when each starts over, and when the main
session's cache expires. Below, one line per tab, with how much there is once there is something,
and what only the browser shows.

```
Model       opus-5-5 · effort high
Context     ██████████░░░░░░░░░░░░░░ 42%  84.0k of 200.0k
Tokens      1.2M in (88% from cache) · 41.0k out · US$ 3.10
5h window   ███████░░░░░░░░░░░░░░░░░ 31%  resets at 15:40
Weekly      ████░░░░░░░░░░░░░░░░░░░░ 18%  resets Mon 09:00
Cache       expires in 52m10s · if it expires: ~84.0k tok rewritten

Where to look
2 Activities  6 activities · each prompt and the tools it called
3 Insights    2 suggestions for this project's setup
4 Config      notifications, insights, auto export, badge, language
w Browser     38 calls, 24 requests · timeline, agents, tokens, memory
```

The effort level comes from the `/config` row that holds it; when your build lists none, the line
shows the model alone. Accounts without plan limits (an API key) see a line saying so. The cache
line counts from the main session's last request that read or wrote the cache, with the TTL the
request reported; when your build does not pass the TTL on to mods, it shows the time left under
both 5 minutes and 1 hour.

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

**3 · Insights.** Off until you turn it on in Config. Fixed rules read what the radar recorded and
suggest changes to how Claude Code is set up, most severe first, each with the numbers behind it:

| Rule | What it looks for | What it suggests |
| --- | --- | --- |
| Cache expired | A pause longer than the cache TTL, then the prompt sent again uncached | The cache warning; whether a 1 hour TTL would have paid off here |
| Model switch | The same loop changing model and losing its cache | Switching between activities instead |
| Denials | The same command denied twice or more | A `permissions.allow` rule for read-only commands, a `permissions.deny` rule for destructive ones (never `allow`) |
| Failures | The same command failing three times or more, this session and earlier ones | The right command in CLAUDE.md, or a hook |
| Repeated command, repeated fetch | The same command 5 times, the same URL 3 times | A script, skill or slash command; a local copy of the docs |
| Slow tool | A tool whose 95th percentile is over a minute | Running it in the background |
| Subagent model | A subagent that only read files, on a model other than Haiku | The `Explore` type or `model: haiku` |
| Context | Context over 80% | `/compact`, or loading less every session |
| First request | A first request over 30k tokens, or well over this project's median | Reviewing CLAUDE.md, MCP servers and skills |
| Unused MCP, unreliable MCP | A server in `.mcp.json` not called in 5 sessions; one that fails or is slow | Disabling or fixing it |

Each finding has a `mark applied` button. Press it once you have made the change, and the tab
compares the rule's number per session before and after, so you can see whether it paid off. The
browser view shows the same findings and comparisons, read-only: marking is done here.

**4 · Config.** Everything that notifies or keeps data starts off. Move with Tab or the arrows, and
press Enter to change a line:

| Setting | What it does |
| --- | --- |
| Notify when an activity ends | A notification when an activity that took at least 15 s, 30 s, 1 min or 2 min ends: its number, duration, tools, failures and when the cache expires. Never the prompt |
| Warn before the cache expires | One notification per cache entry, 30 s to 5 min before the main session's cache expires, while nothing is running: how long is left and how many tokens the next request would rewrite. An unknown TTL counts as 5 minutes, and the text says so |
| Insights, with per-project history | Turns on the Insights tab and keeps counts per project between sessions (below) |
| Suggest the AI review | Shows the [AI review](#ai-review) in the Insights tab |
| Save the export automatically when an activity ends | Writes the export after each activity, without asking: one `session-radar-<start>.json` per conversation in `.claude/session-radar/` of the folder the session started in, rewritten each time with the whole conversation, ready for the [AI review](#ai-review). That folder ignores itself in git |
| Always show this session's badge | Keeps the session's badge under the prompt even with the browser view closed. See [Browser view](#browser-view) |
| Delete the stored history | Deletes every project's history |
| Language | auto, Portuguese or English |

Notifications go through Claude Code's own notification channel, the one your
`preferredNotifChannel` setting names, and your `Notification` hooks see them. Where that channel
shows no text (no channel under `auto`, as in Windows Terminal, or only the bell), the same text
shows as a toast in the corner of the transcript instead; a `Notification` hook that answers for it
keeps it out. While the browser view is open, it shows them too, as a toast on the page, and as
your system's own notification while its tab is in the background, once you press *Turn on browser
notifications* in its footer and allow it.

**History.** With insights on, the radar keeps, per project folder, counts for each of the last 30
sessions in at most 20 projects: activities, calls, failures, denials, tokens, cache, the size of the
first request, time and failures per tool, which MCP servers were called, and the first two words of
each failing command. No prompt and no argument. It also reads the server names from the project's
`.mcp.json`, and nothing else from it. MCP servers you added for your user, not the project, are in
`~/.claude.json`, which a mod cannot read, so the unused-MCP rule does not see them.

The interface is in English or Brazilian Portuguese. Pick one with `/radar-lang pt`,
`/radar-lang en` or `/radar-lang auto`, or with the Language line in Config. `auto`, the default,
follows your system language. The choice is kept for your next sessions, and the browser view
follows it.

### In the browser

Press `w` in the pane or run `/radar-web` ([Browser view](#browser-view) says how it is kept local).
Keys `1` to `6` switch view; the first three match the pane's.

**1 · Home.** The session's cards (model and effort, context, tokens, cost, plan limits) and the
**machine's memory**: how much is in use, of how much, and a chart of the last 10 minutes. Below,
calls by kind, the duration of each activity (press a bar to open it in Activities) and the time
per tool. The memory is read by the browser view's own server, every 2 seconds, from the operating
system's totals: no process list and no command. macOS counts cached memory as used, so free memory
looks lower there than it is.

**2 · Activities** and **3 · Insights.** The same as in the pane, with room: filters, search and
every call of an activity; the findings with their hints, what you marked as applied and the
comparisons since.

**4 · Timeline.** A Gantt-style view: each row is one thing Claude did, placed where it started and
as wide as it took, on a time axis you can narrow to the last 15, 5 or 1 minute. A subagent's own
calls sit indented under the call that started it. A running call is marked at its edge; red failed
or was denied. Press a row for every detail of the call.

**5 · Agents.** The tree of the main session and its subagents: status, duration, tool calls,
model requests, tokens in and out, and the last things each one did. Press one for its calls.

**6 · Tokens.** How full the context is, cost, plan limits, how much input came from the prompt
cache, how long each loop's cache has left, a chart of the prompt per request split into cache
read, cache written and new input, with the output below, and a table of every request.
`What the columns mean` explains them:

| Column | What it is |
| --- | --- |
| `New` | Input tokens the cache did not serve, billed at the full input price. Small on a healthy request: only what changed since the last one. |
| `Cache↓` | Input tokens read from the prompt cache, far cheaper than new input. Most of a long conversation should land here. |
| `Cache↑` | Input tokens written to the cache. They cost more than new input once, then the next request reads them cheaply. |
| `Prompt` | `New + Cache↓ + Cache↑`: everything the request sent. It grows with the conversation. |
| `Hit` | `Cache↓ ÷ Prompt`. A **highlighted** row sent most of a large prompt uncached after the loop's first request: the cache was probably lost, because it expired, the model changed, or the start of the prompt changed. |

**Cache lifetime.** For each loop: the TTL of what was cached, when the cache was last used, how
long it has left, and how many tokens the next request rewrites if it expires. The API restarts an
entry's lifetime every time a request reads it, so the countdown runs from the last request. The
TTL comes from the request itself, which says how much it wrote for 5 minutes and how much for 1
hour.

Without Node, or without a browser on the same machine (a plain SSH session, some containers), the
timeline, the agents and the tokens are still in the export (`/radar-export`).

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
| `/radar-export` | Writes everything recorded so far to `.claude/session-radar/session-radar-<time>.json` in the folder the session started in |
| `/radar-lang pt\|en\|auto` | Sets the language and keeps it for your next sessions; with no argument, says which is set |
| `/radar-web` | Opens the radar in your browser (see [Browser view](#browser-view)); `/radar-web stop` ends it |
| `/radar-config` | Opens the pane on the Config tab |
| `/session-radar:radar-review` | The [AI review](#ai-review) of an export. Uses tokens |

Inside the pane:

| Key | What it does |
| --- | --- |
| `1` to `4` | Switch tab: Home, Activities, Insights, Config |
| Tab, `↑` `↓`, Enter | In Activities, move between activities and open one |
| `h` | Show or hide how to read the tab |
| `w` | Open the browser view, same as `/radar-web` |
| `e` | Export, same as `/radar-export` |
| `x` | Clear what has been recorded: press it twice within 3 seconds |
| `d` | Move the radar below the transcript, or back beside it |
| `Esc` | Close the pane |

**Beside or below**, as DevTools docks: `d`, or *Radar position* in Config, kept for your next
sessions. Beside, the radar is a pane, which Claude Code docks next to the transcript in fullscreen
from 110 columns, and seats above the prompt otherwise. Below, it takes the band above the prompt,
compact: tabs and actions on one row when they fit, Home and Config in two columns on a wide
terminal, no notes or blank lines and no browser address (`w` still opens it), in a rounded frame of the badge's color that sets it apart from
the transcript (from 8 rows; under that the rows go to the radar). The band takes the keys after `ctrl+x tab` or a click, `q` closes
it, and a survey from Claude Code has the band first. A mod cannot place a pane itself, so there is
no left side.

The radar starts over on `/clear`, `/resume` and `/branch`, because those start a different
conversation. What it recorded is not kept between sessions unless you export it, or, with insights
on, as the counts of the [history](#what-it-shows).

## AI review

The rules in the Insights tab find patterns and measure them; they do not write your CLAUDE.md. The
plugin also ships a skill for that, `/session-radar:radar-review`. Export first (`e`), or turn on
`Save the export automatically` in Config, then run it.
Claude, in your session and with your permissions, reads the newest `.claude/session-radar/session-radar-*.json`, your
CLAUDE.md, the `permissions`, `model` and `hooks` of your settings, and `.mcp.json`, and proposes
changes as diffs, each with the numbers behind it and the radar metric that should move. It also
does what fixed rules cannot: it groups your prompts into recurring tasks worth a skill, spots where
CLAUDE.md and what happened disagree, and gives its guess, with its confidence, of why a command
keeps failing. It applies nothing without asking, one change at a time.

The review **uses tokens**, in the current session. The mod itself still calls no model: the skill
is instructions for Claude, run only when you call it.

## Browser view

Claude Code cannot draw a web page inside the terminal: a mod draws with the terminal's own
elements (boxes, text, buttons, links). So the richer view opens in your browser, fed by the same
data the pane shows.

Press `w` in the pane (`/radar` opens it with the focus), or run `/radar-web`. The mod starts a
small server, `web/server.mjs` (Node, no dependencies), and your default browser opens on it. The
reply and the pane beside the transcript also show the address as a link, for when no browser can
be opened.

Below the navigation the page shows one ad, marked as such: today Neural Seam's own, for Neural
Seam Premium. It is part of the page, like the rest: nothing is loaded to show it and nobody is told
it was shown; only clicking it opens neuralseam.cloud in a new tab.

The page has six views, described under [In the browser](#in-the-browser): Home with the
machine's memory, Activities and Insights as in the pane, and Timeline, Agents and Tokens, which
only the browser shows. Config stays in the pane, and so does marking a finding as applied: the page
only reads. It adds a search box, filters by kind, status, agent and time window, sortable tables,
charts and a panel with every detail of a call or subagent. Keys: `1` to `6` switch view, `/`
searches, `Esc` closes the panel.

**Several sessions at once.** Each session has a badge: a mark and a four-letter code, such as
`▲ K7QF`, in one of four colours, worked out from the session's id, so it stays the same when the
mod reloads and differs from one session to the next. While the browser view runs, the badge shows
under the prompt of the session's terminal (`▲ radar K7QF`), and the same badge is on the page:

- the tab's title, `▲ K7QF · my-app · Session Radar`, and its icon, the mark in the session's colour;
- a band in that colour across the top, and the badge in the header with the project folder and the
  model; hover it for the full path;
- when the session or its server ends, the title turns into `✕ K7QF · ended` and the icon grey, so
  you know which tabs to close.

The pane's status row starts with the badge too. To keep it under the prompt even with the browser
view closed, turn on `Always show this session's badge` in Config.

How it is kept local:

- It listens on `127.0.0.1` only, on a port the system picks, and refuses any request whose `Host`
  or `Origin` is not that address.
- The data needs a random token that only the URL you were given carries; sending data needs a
  second token only the mod knows. The page loads nothing from elsewhere (a `Content-Security-Policy`
  of `'self'`).
- It holds only the last snapshot and the last 10 minutes of memory samples, in memory. It ends
  with `/radar-web stop`, when Claude Code exits or reloads the mod, and by itself 30 seconds after
  the mod stops sending.

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
| `$.session.usage()` | Context, cost and plan limits; with insights on, the highest context use of the session |
| `.mcp.json` | With insights on, the names of the project's MCP servers, and nothing else |

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
