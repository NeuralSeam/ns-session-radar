# Compatibility

What this mod was actually run against, and what follows from that.

Each row below records a test that happened, on the versions named, on the date named. It is **not**
a supported range. A combination that is absent has **not been tested**, which is a different
statement from saying it is incompatible.

## Tested combinations

| Mod | Claude Code | Surface | Operating system | Tested on |
| --- | --- | --- | --- | --- |
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

**What it does not cover:** a real Claude Code session. Until a row with a `claude --version` is
here, treat the drawing and the subagent links as unverified on your build. The checks in
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

The browser view also needs Node.js 20 or later on the `PATH`. Without it, `/radar-web` says so and
the rest of the mod is unaffected.

If one of these changes in a later build, the mod may draw Claude Code's own version of a site
instead of its own, and a transcript line in a `--plugin-dir` session says which.
