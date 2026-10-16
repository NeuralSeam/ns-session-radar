# Changelog

Notable changes to Session Radar. Format based on [Keep a Changelog](https://keepachangelog.com/);
independent SemVer.

Entries are newest first and record what you can notice when you install or update: new behaviour,
fixes, security changes, compatibility changes, and anything you have to do by hand.

## [Unreleased]

### Added

- Config: **Save the export automatically when an activity ends**. Each time an activity ends, the
  radar writes the same JSON as `/radar-export`, without a toast: one `session-radar-<start>.json`
  per conversation in the current folder, rewritten with the whole conversation so far, so
  `/session-radar:radar-review` always has a recent export to read. Off by default.

### Privacy and security

- `$.fs.write` can now also run when an activity ends, only while that setting is on. The file
  holds what the export holds; keep `session-radar-*.json` out of git.

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

[Unreleased]: https://github.com/NeuralSeam/ns-session-radar/compare/v0.5.1...main
[0.5.1]: https://github.com/NeuralSeam/ns-session-radar/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/NeuralSeam/ns-session-radar/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/NeuralSeam/ns-session-radar/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/NeuralSeam/ns-session-radar/compare/e6d2d1cb3c06110318a949bdae909489040e8d51...v0.3.0
[0.2.0]: https://github.com/NeuralSeam/ns-session-radar/tree/e6d2d1cb3c06110318a949bdae909489040e8d51
