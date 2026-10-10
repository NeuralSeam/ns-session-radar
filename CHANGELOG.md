# Changelog

Notable changes to Session Radar. Format based on [Keep a Changelog](https://keepachangelog.com/);
independent SemVer.

Entries are newest first and record what you can notice when you install or update: new behaviour,
fixes, security changes, compatibility changes, and anything you have to do by hand.

## [Unreleased]

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

[Unreleased]: https://github.com/NeuralSeam/ns-session-radar/compare/v0.3.0...main
[0.3.0]: https://github.com/NeuralSeam/ns-session-radar/compare/e6d2d1cb3c06110318a949bdae909489040e8d51...v0.3.0
[0.2.0]: https://github.com/NeuralSeam/ns-session-radar/tree/e6d2d1cb3c06110318a949bdae909489040e8d51
