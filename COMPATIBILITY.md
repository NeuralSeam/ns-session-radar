# Compatibility

What this mod was actually run against, and what follows from that.

Each row below records a test that happened, on the versions named, on the date named. It is **not**
a supported range. A combination that is absent has **not been tested**, which is a different
statement from saying it is incompatible.

## Tested combinations

| Mod | Claude Code | Surface | Operating system | Tested on |
| --- | --- | --- | --- | --- |
| 0.9.0 | — (simulated, see below) | — | Windows 11, Node 22 | 2026-10-27 |
| 0.8.0 | — (simulated, see below) | — | Windows 11, Node 22, English and `pt_BR` | 2026-10-21 |
| 0.7.1 | 2.1.302 | Terminal | Windows 11, Node 22, English and `pt_BR` | 2026-10-17 |
| 0.7.0 | — (simulated, see below) | — | Windows 11, Node 22, English and `pt_BR` | 2026-10-16 |
| 0.6.0 | 2.1.301 | Terminal | Windows 11, Node 22 | 2026-10-16 |
| 0.5.1 | — (simulated, see below) | — | Windows 11, Node 22, English and `pt_BR` | 2026-10-15 |
| 0.5.0 | — (simulated, see below) | — | Windows 11, Node 22, English and `pt_BR` | 2026-10-15 |
| 0.4.0 | — (simulated, see below) | — | Windows 11, Node 22, English and `pt_BR` | 2026-10-15 |
| 0.3.0 | — (simulated, see below) | — | Windows 11, Node 22, English and `pt_BR` | 2026-10-10 |
| 0.2.0 | — (simulated, see below) | — | Windows 11, Node 22, English and `pt_BR` | 2026-10-06 |
| 0.1.0 | — (simulated, see below) | — | Linux, Node 22 | 2026-10-02 |

**What the 0.1.0 row covers:** `npm test`, which loads `hooks/register.js` against a fake Claude
Code and checks that every tab draws, fits the pane at 96 and 60 columns, leaves other mods' panes
alone, keeps the spinner's own props, and exports the counts the simulated session produced.

**What the 0.2.0 row adds:** the same run, plus the Activities tab (which calls each prompt lists,
opening one by pressing it), the cache lifetime drawn from a reported 1 hour TTL, the API legend,
and `/radar-lang` and the `l` key switching and storing the language.

**What the 0.3.0 row adds:** the same run, plus the credit line on the last row of every tab in
both languages, and the `generator` field added to the export beside the existing ones.

**What the 0.4.0 row adds:** the same run, plus `tests/web.mjs` for the browser view, the Config and Insights tabs at 96 and 60 columns,
each setting stored, the activity notification over and under its minimum, the cache warning (once,
not while an activity runs, not while off), the history keeping no prompt or argument and being
deleted, the export's `insights` section after the existing fields, and `tests/insights.mjs`, a
case that finds and one that does not for every rule. On Claude Code 2.1.300,
`claude plugin validate . --strict` passed, and a headless `claude -p --plugin-dir .` loaded the
hooks module (with `hooks/insights.js`) and the `radar-review` skill, with every hook settling. The
pane, the notifications and the skill's output were not seen in an interactive session for this
row.

**What the 0.5.0 row adds:** the same run, plus the session badge: the same code in the
`/radar-web` reply, under the prompt while the view runs and gone after `stop`, at the head of the
pane's status row, stable across a reload, the setting that keeps it under the prompt, and the
project folder taken from a Windows path. The page's badge, tab title and icon, live and ended, were
checked in headless Chrome against a sample snapshot. `claude plugin validate . --strict` passed on
Claude Code 2.1.300.

**What the 0.6.0 row adds:** the first run in a real session. On Claude Code 2.1.301, in a
terminal on Windows 11, the checks in [CONTRIBUTING.md](./CONTRIBUTING.md#before-a-release) step 3,
plus the radar moved below with `d`, drawn compact in the band with its frame, and a
`/reload-plugins` that kept what the radar had recorded. `npm test` passed in English and
`pt_BR`, and `claude plugin validate . --strict` passed. The Desktop app was not tested.

**What the 0.7.0 row adds:** the same run as 0.6.0, simulated: the band without the browser's
address, the toast for each answer of `$.ui.notify` (the bell, no channel, no terminal, a refusing
hook, a failed write), the notifications reaching the page's snapshot without the prompt, and the
ad's place, its one link and the unchanged content policy. The page's toasts and the ad were checked
in headless Chrome at 1440, 900 and 420 pixels against the real mod and server fed by a fake Claude
Code. `npm test` passed in English and `pt_BR`, and `claude plugin validate . --strict` passed on
Claude Code 2.1.301. Not yet seen in a real session for this row: the toast in Windows Terminal and
the browser's system notification.

**What the 0.7.1 row adds:** the export's new folder. In a real session in the terminal, after
`/reload-plugins` from 0.5.1, the saved export went on landing in `.claude/session-radar/` of the
folder the session started in, and nothing more was written in the project's root. In the
simulation, its `.gitignore` is written once per copy of the module and a reload after a `cd` keeps
that folder. `npm test` passed in English and `pt_BR`, and `claude plugin validate . --strict`
passed on Claude Code 2.1.302.

**What the 0.8.0 row adds:** the same run, simulated: a hook on every classic event recorded with
its timing and status and none of its words kept, a second session joining the browser view on its
own with its badge under its prompt, a new server started when the first one went away, and the
servers exiting at the end. `npm test` passed in English and `pt_BR`, and
`claude plugin validate . --strict` passed on Claude Code 2.1.306, its `hooks:` and `calls:` lines
matching [SECURITY.md](./SECURITY.md). A headless `claude -p --plugin-dir .` on 2.1.304 and 2.1.306
loaded the mod and the `radar-review` skill, but on that machine Claude Code skipped every classic
hook of the radar (`"cc-plugin-sec-default" runs first and sent the event on past it`), so the
Hooks view stays empty there. Not yet seen in a real session for this row: the Hooks view with
events, the page shared by two sessions, and the Q&A view.

**What the 0.9.0 row adds:** the same simulated suite, plus canary credentials proving that session
reload state and manual/automatic exports redact before persistence, benign paths surviving the
sanitizer, and the additive `errors` taxonomy containing only aggregate category, operation,
status and duration buckets. `npm test` and `npm run check` passed. Not yet seen in a real session:
the redacted export produced by Claude Code itself.

**What it does not cover:** the Desktop app, and builds other than 2.1.301. The checks in
[CONTRIBUTING.md](./CONTRIBUTING.md#before-a-release) are what fills in a row.

### How to read the columns

| Column | What it means |
| --- | --- |
| Mod | The version in `.claude-plugin/plugin.json` at the time of the test |
| Claude Code | The output of `claude --version`. Nothing older or newer is claimed. |
| Surface | Terminal, Desktop, or both |
| Operating system | Where it ran |
| Tested on | The date the checks were run |

## Host behaviour this depends on

| Behaviour | Since |
| --- | --- |
| Mods load from a plugin's `hooks/hooks.json` `modules` entry | Claude Code 2.1.287 |
| `tool.call`, `turn.step`, `turn.start`, `turn.complete`, `agent.spawn` events | Claude Code 2.1.287 |
| `Pane` and `Spinner` render sites | Claude Code 2.1.287 |
| `$.session.usage()` returns context, cost and rate limits | Claude Code 2.1.287 |
| `$.process.spawn`, `$.process.run` and `$.http.fetch`, for the browser view only | Claude Code 2.1.300 (the build it was run on) |
| `$.ui.status`, `$.session.id` and `$.session.model`, for the session badge | Claude Code 2.1.300 (the build it was validated on) |
| `$.ui.notify`, `$.fs.read` and `$.store.delete`, for notifications and insights | Claude Code 2.1.300 (the build it was validated and loaded on) |
| `$.state.get` and `$.state.set`, so a reload of the mod keeps what it recorded | Claude Code 2.1.301 (the build it was validated on) |
| `AbovePrompt` render site, for the radar below the transcript | Claude Code 2.1.301 (the build it was validated on) |

The browser view also needs Node.js 20 or later on the `PATH`. Without it, `/radar-web` says so and
the rest of the mod is unaffected.

If one of these changes in a later build, the mod may draw Claude Code's own version of a site
instead of its own, and a transcript line in a `--plugin-dir` session says which.
