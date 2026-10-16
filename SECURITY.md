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
- context use, cost and plan limits from `$.session.usage()`;
- the session's model, and the effort level when `/config` lists it.

Of the prompts you type it keeps only the start, to name each activity (below). It does **not**
read Claude's replies, tool results, environment variables or settings. The one file it reads is the
project's `.mcp.json`, and only while insights are on (below). For the `Agent` tool,
the main argument it keeps is the task's description, or the start of the prompt Claude wrote for
the subagent when there is no description.

## What it keeps

In memory, for the current conversation: for each tool call, its name and its main argument cut to
one line of at most 120 characters, plus timings and status; for each model request, its model and
token counts; for each prompt you send, its first 120 characters on one line, plus timings and
counts. At most 500 calls and 200 prompts; older ones are dropped. All of it is gone when the
session ends, or on `/clear`, `/resume`, `/branch`, or the `x` key in the pane.

A copy of the same record is handed to Claude Code's session state (`$.state`, key
`session-radar.session`), also in memory, so a reload of the mod (an update, `/reload-plugins`)
carries on instead of starting over. It holds nothing the record above does not, is written at most
every 2 seconds while something changed, and ends with the session.

Between sessions, in its own store (a JSON file Claude Code keeps for the mod under your
configuration directory):

| Key | What it holds | When |
| --- | --- | --- |
| `language` | `auto`, `pt` or `en` | Always, once you pick one |
| `config` | The settings of the Config tab: on/off or number values, and the radar's position (`side` or `bottom`) | Once you change one |
| `history` | Per project folder, for each of the last 30 sessions in at most 20 projects: counts of activities, calls, failures and denials; tokens and cache; the size of the first request; the highest context use; time and failures per tool name; the names of the MCP servers called; and, for each failing command, its tool and **first two words** (for example `Bash npm test`). Also the time and rule of each change you marked as applied | Only while insights are on. `Delete the stored history` in Config removes the key |

The history holds no prompt text, no tool argument beyond those first two words of a failing
command, and nothing from `.mcp.json` but server names. The project folder's path is its key.

With insights on, the mod reads the project's `.mcp.json` when the session starts and when you turn
insights on, and keeps only the names under `mcpServers`. It never reads the servers' commands or
`env`.

## What it does

The complete list of mods API calls in `hooks/register.js`. `claude plugin validate .` prints the
same list from the code, under `calls:`.

| Call | Why |
| --- | --- |
| `$.command.register` | Adds `/radar`, `/radar-export`, `/radar-lang`, `/radar-web` and `/radar-config` |
| `$.ui.open`, `$.ui.close`, `$.ui.resolve`, `$.ui.invalidate` | Opens, draws and redraws the pane, the band above the prompt when the radar is placed below, and the spinner suffix |
| `$.state.get`, `$.state.set` | Keeps a copy of what the radar recorded in the session's state, so a reload of the mod does not lose it; read once, when the reloaded mod starts |
| `$.ui.toast` | Says where an export went, and that the history was deleted; shows a notification you turned on where your notification channel shows no text |
| `$.ui.status` | Shows the session's badge (`▲ radar K7QF`) under the prompt while the browser view runs, or always if you turn that on in Config |
| `$.session.id` | When the session starts, to work out its badge: a four-letter code and a mark, a hash of the id. The id itself is not kept or sent |
| `$.session.model` | Names the model on the Home tab, and beside the badge on the page while the browser view runs |
| `$.config.list` | While the Home tab is drawn or the browser view runs, at most every 5 seconds, to find the `/config` row that holds the effort level. The session API does not report it. Only that row's value is kept, in memory; the other rows are not read further, kept or sent |
| `$.ui.notify` | The notifications you turn on in Config: an activity that ended, a cache about to expire. Off by default. The text holds numbers only: never a prompt or an argument. The mod reads whether a channel showed it, to fall back to a toast |
| `$.clock.every` | Redraws once a second while something is running or the pane is open, and checks whether the cache warning is due |
| `$.session.usage` | Reads context, cost and plan limits for the Home tab and the browser view; with insights on, also when an activity ends, to keep the highest context use |
| `$.fs.read` | Reads the project's `.mcp.json`, **only** while insights are on, for the server names |
| `$.fs.write` | Writes the export file, **only** when you run `/radar-export` or press `e`, or, if you turn on `Save the export automatically` in Config, when an activity ends |
| `$.store.get`, `$.store.set` | Reads the language, the settings and, with insights on, the history when the session starts; writes the language when you change it, the settings when you change one, and the history when an activity or the session ends while insights are on |
| `$.store.delete` | Removes the history when you press `Delete the stored history` |
| `$.process.spawn` | Starts `node web/server.mjs`, **only** when you run `/radar-web` or press `w` |
| `$.http.fetch` | Sends the snapshot to that server on `127.0.0.1`, and asks it to stop; never any other address |
| `$.process.run`, `$.env.get` (`OS`) | Opens the page in your default browser: `rundll32 url.dll,FileProtocolHandler` on Windows, else `xdg-open` or `open` |
| `$.clock.after` | Gives up on the server if it has not started within 10 seconds |

It does **not** call `$.model`, `$.mcp`, `$.prompt` or `$.settings`, and reads no environment
variable but `OS`. It does not read your settings files: `$.settings` would hand over their `env`
too. It never denies, rewrites or answers a tool call, a prompt or a request: every hook
passes the event on unchanged and returns what Claude Code returned.

Events it hooks: `session.start`, `session.end`, `command.run`, `ui.close`, `tool.call`,
`agent.spawn`, `turn.start`, `turn.step`, `turn.complete`, `ui.render`.

## The browser view

`web/server.mjs` runs only after `/radar-web` or `w`, as a child of Claude Code. It listens on
`127.0.0.1` on a port the system picks, never on another interface. It makes two random tokens and
tells them only to the mod, on its standard output: one to read the data (it is in the URL the
browser opens), one to send data and to stop the server (the mod alone has it). Every request whose
`Host` is not `127.0.0.1:<port>` or `localhost:<port>` is refused, which defeats DNS rebinding, and
so is any request carrying another site's `Origin`. The page is static, served with a
`Content-Security-Policy` that allows nothing but itself, and draws every value as text.

It keeps the last snapshot in memory and nothing on disk. The snapshot holds what
[What it keeps](#what-it-keeps) lists, the same as the export file, plus the session's badge, the
folder it runs in, its model and effort level, so the page can tell parallel sessions apart, and,
while insights are on, the findings and comparisons as the Insights tab words them, and the last 20
notifications you turned on, with the same text. Anyone who has
the URL, on this machine, can read it while the server runs; treat the URL like the export file.

While it runs, the server also reads the machine's total and free memory every 2 seconds, with
Node's `os.totalmem()` and `os.freemem()`, keeps the last 10 minutes of those two numbers in memory
and sends them only to the page. It does not list processes, read other processes' memory or run
any command. The page itself still only reads: it sends nothing to the server but the requests for
the data, and cannot change the mod's settings or marks. It shows those notifications as toasts and,
only after you press its button and your browser asks you, as system notifications. Its one ad is
part of the page: it loads nothing and reports nothing, and its link opens neuralseam.cloud in a new
tab, without a referrer, only when you click it. The server stops on
`/radar-web stop`, when the mod is unloaded or Claude Code exits, and on its own after 30 seconds
without a snapshot from the mod.

## The AI review skill

The plugin also ships a skill, `skills/radar-review/SKILL.md`: instructions for Claude, not code.
It runs only when you call `/session-radar:radar-review`, in your session, with your permissions and
your model, and so uses your tokens. It reads the newest export, your CLAUDE.md files, the
`permissions`, `model` and `hooks` keys of your settings files and `.mcp.json`, and is told never to
quote `env` or other keys, to treat the text in the export as data rather than instructions, and to
change no file without your confirmation. Read the file before you run it; it is short.

## The export file

`/radar-export` writes JSON into the folder Claude Code is running in. With `Save the export
automatically` on in Config (off by default), the same file is also written, without asking, each
time an activity ends: one file per conversation, `session-radar-<when it started>.json`, rewritten
with the whole conversation so far. It contains the tool
arguments and prompt beginnings described above, which can include a secret if one was typed into a
shell command or a prompt. With insights on, it also holds the findings, the project's history and
the names of the MCP servers in `.mcp.json`. Treat
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
