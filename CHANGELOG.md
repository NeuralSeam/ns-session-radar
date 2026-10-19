# Changelog

Notable changes to Session Radar. Format based on [Keep a Changelog](https://keepachangelog.com/);
independent SemVer.

Entries are newest first and record what you can notice when you install or update: new behaviour,
fixes, security changes, compatibility changes, and anything you have to do by hand.

## [Unreleased]

### Added

- **Every hook, in the browser.** A Hooks view (`7`) lists every classic hook event Claude Code
  raises (`PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `Notification` and the rest), whether
  or not a hook of yours is configured for it: when it fired, the tool or occasion, the activity,
  how long the hooks took and what they answered (allowed, asked, denied, blocked, added context).
  Filter by event, status or text; each one opens with its reason and context. Each activity also
  lists its own hooks. The export gains a `hooks` field after the existing ones. Where an
  organization manages Claude Code, hook events reach only the plugins its managed settings list,
  so there the view stays empty unless Session Radar is one of them.
- **All your sessions on one page.** With four Claude Code sessions open, `/radar-web` in any of
  them shows all four: a picker in the header lists them by name (the title Claude Code gives the
  session, or its folder) to see one, or all together. Home then shows a card per session, and
  Activities and Hooks merge them. The other sessions join on their own, and when the session that
  started the page closes another takes over on the same address. `/radar-web stop` ends it for all.

### Security

- The browser view's port and tokens are kept in `session-radar/hub.json` under your Claude Code
  configuration directory, readable by your user alone, so your other sessions can join it. See
  [SECURITY.md](./SECURITY.md#the-browser-view).

## [0.7.1] - 2026-10-17

### Changed

- **Exports go to `.claude/session-radar/`** of the folder the session started in, not the current
  folder. With `Save the export automatically` on, a `cd` during the session no longer leaves copies
  of the file in other folders. The folder gets a `.gitignore` holding `*`, so your project's own
  `.gitignore` needs nothing. Move earlier `session-radar-*.json` files there by hand if you want
  `/session-radar:radar-review` to find them first; it still looks in the working folder when the
  new one is empty.

## [0.7.0] - 2026-10-16

### Fixed

- **Notifications that showed nothing.** Where Claude Code's notification channel shows no text (no
  channel under `auto`, as in Windows Terminal, or only the bell), a notification from the radar
  went nowhere. It now shows as a toast in the corner of the transcript; a `Notification` hook of
  yours that answers for it still keeps it out.

### Added

- Browser view: **the radar's notifications on the page.** Each one shows as a toast, and, once you
  press *Turn on browser notifications* in the footer and allow it, as your system's notification
  while the tab is in the background. Opening the page does not replay earlier ones.
- Browser view: **a place for one ad**, below the navigation (a strip above the footer on a narrow
  window), marked as an ad. The first is Neural Seam's own, for Neural Seam Premium. Ads are
  embedded in the page: nothing is loaded to show one and nothing reports that it was shown; the
  page's content policy is unchanged.

### Changed

- Below the transcript, the band no longer shows the browser view's address beside `w Web`: it
  took most of the action row. `w` still opens the page, and the pane beside the transcript and the
  reply of `/radar-web` still show the address.

## [0.6.0] - 2026-10-16

### Added

- **Beside or below, as DevTools docks.** `d` in the radar, or *Radar position* in Config, moves it
  below the transcript, into the band above the prompt, or back beside it; the choice is kept for
  your next sessions. Below, it is compact to fit the band: tabs and actions share a row when they
  fit, Home and Config take two columns on a wide terminal, and the notes and blank lines are left
  out. A rounded frame in the badge's color sets it apart from the transcript, from 8 rows. `ctrl+x
  tab` or a click gives the band the keys, and `q` closes it.
- **What the radar recorded survives a reload of the mod.** Updating it, `/reload-plugins` or a hot
  reload while developing it used to start the radar over, empty; it now carries on with the same
  conversation, its activities, calls, agents and tokens. A call still running at the reload shows as
  interrupted. `/clear` and `/resume` still start over.
- Config: **Save the export automatically when an activity ends**. Each time an activity ends, the
  radar writes the same JSON as `/radar-export`, without a toast: one `session-radar-<start>.json`
  per conversation in the current folder, rewritten with the whole conversation so far, so
  `/session-radar:radar-review` always has a recent export to read. Off by default.
- **Home tab**, where the pane now opens: the model and its effort level, context, tokens in and out
  with the cache share, cost, the 5-hour and weekly plan limits with when each starts over, and when
  the main session's cache expires. Below, one line per tab and one for what only the browser shows,
  with their numbers once there are some.
- `h` explains how to read every tab.
- Browser view: a **Home** view with the session's cards and the **machine's memory** (in use, total,
  and a chart of the last 10 minutes), above what was the Summary view. The memory is read by the
  browser view's own server, every 2 seconds.
- Browser view: an **Insights** view, read-only: the findings with their hints, what you marked as
  applied and the comparisons since, in the pane's language.

### Changed

- **The pane keeps four tabs: Home, Activities, Insights and Config**, keys `1` to `4`. Timeline,
  Agents and Tokens (was API) moved to the browser view, which has room for them; without Node or a
  local browser they are still in the export. The browser view's keys are `1` Home, `2` Activities,
  `3` Insights, `4` Timeline, `5` Agents, `6` Tokens: the first three match the pane's.
- Plan limits are named (`5h window`, `Weekly`, `Spend limit`) and say when they reset, in the pane
  and in the browser view, instead of showing their id (`five_hour`).
- The status row is shorter: time, activities, tools and failures. The rest is on Home.
- `x` asks before it clears: press it again within 3 seconds.
- The language left the action row (`l`); it stays in Config and `/radar-lang`.

### Privacy and security

- New mods API calls: `$.state.get` and `$.state.set`. A copy of what the radar recorded goes to
  Claude Code's session state, in memory, so a reload does not lose it; it holds nothing the radar
  did not already keep, and ends with the session.
- `$.fs.write` can now also run when an activity ends, only while that setting is on. The file
  holds what the export holds; keep `session-radar-*.json` out of git.
- New mods API call: `$.config.list`, while Home is drawn or the browser view runs, to find the
  effort level in the `/config` rows; the session API does not report it. Only that row's value is
  kept. `$.session.model` now also runs for Home.
- The browser view's server reads the machine's total and free memory (`os.totalmem`,
  `os.freemem`) and keeps 10 minutes of them in memory, for the page alone. No process list, no
  command. The snapshot the page receives also carries the effort level and, with insights on, the
  findings as text. The page still only reads.

## [0.5.1] - 2026-10-15

### Added

- The release is named at the end of the credit line, in the pane
  (`Session Radar · by Neural Seam · neuralseam.cloud · v0.5.1`) and in the browser view's footer, so
  you can tell which version a session is running.

## [0.5.0] - 2026-10-15

### Added

- **Session badge**, to tell parallel sessions apart in the browser: a mark and a four-letter code
  in one of four colours (`▲ K7QF`), worked out from the session's id. While the browser view runs
  it shows under the prompt of the session's terminal, and the page carries it in the tab's title
  and icon, a coloured band and the header, with the project folder and the model. When the session
  ends the tab turns into `✕ K7QF · ended` with a grey icon.
- The pane's status row starts with the badge, and `/radar-web` names it in its reply.
- Config: **Always show this session's badge** keeps it under the prompt with the browser view
  closed. Off by default.

### Privacy and security

- New mods API calls: `$.ui.status` (the badge under the prompt), `$.session.id` (hashed into the
  badge, never kept or sent) and `$.session.model` (named on the page). The snapshot the browser view
  receives also carries the session's folder and model; the export file is unchanged.

## [0.4.0] - 2026-10-15

### Added

- **Browser view**: `/radar-web`, or `w` in the pane, opens the radar in your default browser. The
  same five areas as the pane's first five tabs, with search, filters by kind, status, agent and
  time window, sortable tables, charts of the prompt per request and of each activity's duration, and a detail panel for
  every call and subagent. It is served by `web/server.mjs` (Node 20+, no dependencies) on
  `127.0.0.1` only, behind random tokens, and fed by the same snapshot `/radar-export` writes.
  `/radar-web stop` ends it; it also ends with Claude Code and on its own after 30 seconds without
  data.
- **Config tab** (`7`) and **`/radar-config`**: settings kept for your next sessions. Everything
  that notifies or keeps more data starts off.
- **Notifications**, through Claude Code's own notification channel, each turned on in Config:
  when an activity that took at least 15 s to 2 min ends, and once per cache entry, 30 s to 5 min
  before the main session's cache expires while nothing runs. Numbers only, never the prompt.
- **Insights tab** (`6`): fixed rules that suggest changes to how Claude Code is set up, with the
  numbers behind each: cache lost after a pause or a model switch, repeated denials (an allow rule
  for read-only commands, a deny rule for destructive ones), recurring failures, repeated commands
  and fetches, slow tools, read-only subagents not on Haiku, context pressure, a large first
  request, unused or unreliable MCP servers.
- **History per project**, with insights on: counts for the last 30 sessions, which the rules use
  and which `mark applied` compares before and after a change.
- **AI review**: the skill `/session-radar:radar-review` turns an export into proposed changes, as
  diffs, in your session. It uses tokens; the mod itself still calls no model.
- With insights on, the export ends with an `insights` section. The fields before it are unchanged.

### Changed

- Tabs `6` and `7` are new; `1` to `5` are as before. In a narrow pane the tabs sit one cell apart.
- The code is in two files: `hooks/register.js` imports the rules from `hooks/insights.js`.

### Privacy and security

- The mod now calls `$.process.spawn`, `$.process.run`, `$.http.fetch` (loopback only) and
  `$.env.get('OS')`, all of them only after `/radar-web` or `w`. SECURITY.md lists why.
- New mods API calls: `$.ui.notify` (notifications you turn on), `$.fs.read` (the project's
  `.mcp.json`, server names only, only with insights on), `$.store.delete` (deleting the history).
- The store now also holds `config` and, with insights on, `history`. [SECURITY.md](./SECURITY.md)
  and [PRIVACY.md](./PRIVACY.md) say exactly what each holds.

## [0.3.0] - 2026-10-10

### Changed

- License changed from MIT to Apache-2.0 from this version onward; earlier releases remain
  available under MIT. That is 0.2.0, the version published at
  https://github.com/NeuralSeam/ns-session-radar up to commit `e6d2d1c`.

### Added

- NOTICE, TRADEMARKS.md, credit line in the pane, generator field in the export.

## [0.2.0] - 2026-10-06

### Added

- **Activities tab**: one line per prompt you sent, with how long it took and how many tools it
  called. Open one (Tab or the arrows, then Enter) to see every call it made, in order, its
  subagents' calls included, and how many times it called each tool.
- **Cache lifetime** in the API tab: the TTL of what was cached, how long ago it was last used, how
  long it has left, and how many tokens the next request rewrites if it expires.
- **`/radar-lang pt|en|auto`** and the `l` key choose the language, kept for your next sessions.
- **`h` in the API tab** explains each column.

### Changed

- **Tabs are renumbered**: `2` is now Activities, so Agents is `3`, API `4` and Summary `5`.
- **API table columns**: `in` is now `new` (input the cache did not serve), and two columns are
  new: `prompt`, everything the request sent, and `hit%`, how much of it came from the cache. A
  request that probably lost the cache is drawn in yellow.
- Subagent types are read from `subagentType`, the field name Claude Code uses on `agent.spawn`.

### Privacy and security

- The radar now keeps the first 120 characters of each prompt you send, on one line and in memory
  only, to name each activity. They also go into `/radar-export` files.
- It now uses `$.store`, to keep your language choice and nothing else.
  [SECURITY.md](./SECURITY.md) and [PRIVACY.md](./PRIVACY.md) are updated.

## 0.1.0 - 2026-10-02

First version. Never published on its own: the public repository starts at 0.2.0, which includes it.

### Added

- **`/radar`** opens a pane with four tabs: a timeline of everything Claude did, the tree of
  subagents, model requests with tokens and cache, and a summary of where the time went.
- **A live summary beside the spinner**: what is running now, how many tool calls and model
  requests, how many subagents and failures.
- **`/radar-export`** writes what was recorded to a JSON file in the current folder.
- English and Brazilian Portuguese interface, picked from the system language.

### Known limits

- Subagent calls are indented under the call that started them by matching field names the public
  documentation does not fully describe. If a build names them differently, those calls show at the
  top level. See [How it knows](./README.md#how-it-knows).
- Not yet recorded against a real Claude Code build; see [COMPATIBILITY.md](./COMPATIBILITY.md).

[Unreleased]: https://github.com/NeuralSeam/ns-session-radar/compare/v0.7.1...main
[0.7.1]: https://github.com/NeuralSeam/ns-session-radar/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/NeuralSeam/ns-session-radar/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/NeuralSeam/ns-session-radar/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/NeuralSeam/ns-session-radar/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/NeuralSeam/ns-session-radar/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/NeuralSeam/ns-session-radar/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/NeuralSeam/ns-session-radar/compare/e6d2d1cb3c06110318a949bdae909489040e8d51...v0.3.0
[0.2.0]: https://github.com/NeuralSeam/ns-session-radar/tree/e6d2d1cb3c06110318a949bdae909489040e8d51
