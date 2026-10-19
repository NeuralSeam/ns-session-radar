# Privacy

**Session Radar collects nothing and sends nothing off your machine.** It has no telemetry, no
account, and calls no model. Its only network traffic is to itself: when you open the browser view
(`/radar-web` or `w`), the mod sends what it recorded, with the session's folder, model, badge,
id and title, to a server it starts on `127.0.0.1`, which your browser then reads from. Your other
Claude Code sessions on the machine find that server through a file under your Claude Code
configuration directory and send theirs to it too, so one page shows them all.

What it records stays in memory, inside the Claude Code process, for the current conversation, and
is gone when that conversation ends. A copy is handed to Claude Code's session state, also in memory,
only so a reload of the mod does not lose it; it ends with the session too. [SECURITY.md](./SECURITY.md#what-it-keeps) says exactly what
that is.

The exceptions:

- **The file you ask for.** `/radar-export`, or `e` in the pane, writes what was recorded to a JSON
  file in the current folder.
- **The hub file**, `session-radar/hub.json` under your Claude Code configuration directory, while
  the browser view has run: the server's port and its two tokens, readable by your user alone.
- **Your language and settings**, kept in the mod's own store under your Claude Code configuration
  directory so the next session opens with them.
- **The history, only if you turn insights on.** Counts per project folder for the last 30
  sessions: activities, calls, failures, tokens, cache, time per tool, the MCP servers called and
  the first two words of each failing command. No prompt, no argument. `Delete the stored history`
  in the Config tab removes it. While insights are on, the mod also reads the server names from the
  project's `.mcp.json`.
- **Notifications, only if you turn them on**, go to your own notification channel, through Claude
  Code, or show as a toast where it has none. While the browser view is open they reach its page
  too, over the same loopback connection, and your browser shows them as a system notification
  only if you allowed it there. They hold numbers only, never your prompt.

Nothing else is written, and nothing is uploaded.

The browser view shows one ad, Neural Seam's own. It is embedded in the page: showing it loads
nothing and reports nothing. Only if you click it does your browser open neuralseam.cloud, in a new
tab, without a referrer.

The AI review (`/session-radar:radar-review`) is a skill that Claude runs in your session, when you
call it: what it reads goes to the model like anything else in that session. The mod itself never
calls a model.

Claude Code itself, and the model provider it uses, handle your session under their own terms; this
mod does not change that.
