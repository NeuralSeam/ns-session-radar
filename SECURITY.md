# Security

## What this mod is

Session Radar is a **mod**: JavaScript that Claude Code runs inside its own process, with your
permissions. That is different from a plugin made only of commands and settings. Read this before
you install it.

## What it can see

Every hook below receives the event as Claude Code raises it, so the mod sees:

- the name and arguments of every tool call, in the main session and in subagents, including shell
  commands and file paths;
- the token counts of every request to the model;
- when turns and subagents start and end, and the text each turn starts with;
- context use, cost and plan limits from `$.session.usage()`.

Of the prompts you type it keeps only the start, to name each activity (below). It does **not**
read Claude's replies, tool results, files, environment variables or settings. For the `Agent` tool,
the main argument it keeps is the task's description, or the start of the prompt Claude wrote for
the subagent when there is no description.

## What it keeps

In memory, for the current conversation: for each tool call, its name and its main argument cut to
one line of at most 120 characters, plus timings and status; for each model request, its model and
token counts; for each prompt you send, its first 120 characters on one line, plus timings and
counts. At most 500 calls and 200 prompts; older ones are dropped. All of it is gone when the
session ends, or on `/clear`, `/resume`, `/branch`, or the `x` key in the pane.

Between sessions, in its own store (a JSON file Claude Code keeps for the mod under your
configuration directory): your language choice, `auto`, `pt` or `en`, and nothing else.

## What it does

The complete list of mods API calls in `hooks/register.js`. `claude plugin validate .` prints the
same list from the code, under `calls:`.

| Call | Why |
| --- | --- |
| `$.command.register` | Adds `/radar`, `/radar-export` and `/radar-lang` |
| `$.ui.open`, `$.ui.close`, `$.ui.resolve`, `$.ui.invalidate` | Opens, draws and redraws the pane and the spinner suffix |
| `$.ui.toast` | Says where an export went |
| `$.clock.every` | Redraws once a second while something is running or the pane is open |
| `$.session.usage` | Reads context, cost and plan limits for the API tab |
| `$.fs.write` | Writes the export file, **only** when you run `/radar-export` or press `e` |
| `$.store.get`, `$.store.set` | Reads the language choice when the session starts; writes it when you run `/radar-lang` or press `l` |

It does **not** call `$.http`, `$.process`, `$.model`, `$.mcp`, `$.prompt`, `$.env` or
`$.settings`. It never denies, rewrites or answers a tool call, a prompt or a request: every hook
passes the event on unchanged and returns what Claude Code returned.

Events it hooks: `session.start`, `session.end`, `command.run`, `ui.close`, `tool.call`,
`agent.spawn`, `turn.start`, `turn.step`, `turn.complete`, `ui.render`.

## The export file

`/radar-export` writes JSON into the folder Claude Code is running in. It contains the tool
arguments and prompt beginnings described above, which can include a secret if one was typed into a
shell command or a prompt. Treat
the file like a shell history: read it before sharing it, and do not commit it. This repository's
`.gitignore` ignores `session-radar-*.json`, but your project's may not.

## Check it yourself

```bash
git clone https://github.com/NeuralSeam/ns-session-radar
claude plugin validate ./ns-session-radar
```

The `hooks:` and `calls:` lines must match the two lists above. If they do not, do not install that
version, and report it.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting on this repository
(**Security** tab, **Report a vulnerability**). Include the version from `.claude-plugin/plugin.json`
and `claude --version`.

## Release signing

Release tags are signed with the same SSH key as the Neural Seam plugin. The public key, fingerprint
and verification steps are in the
[Neural Seam plugin's SECURITY.md](https://github.com/NeuralSeam/neural-seam-claude/blob/main/SECURITY.md#release-signing).
