# Privacy

**Session Radar collects nothing and sends nothing off your machine.** It has no telemetry, no
account, and calls no model. Its only network traffic is to itself: when you open the browser view
(`/radar-web` or `w`), the mod sends what it recorded to a server it starts on `127.0.0.1`, which
your browser then reads from.

What it records stays in memory, inside the Claude Code process, for the current conversation, and
is gone when that conversation ends. [SECURITY.md](./SECURITY.md#what-it-keeps) says exactly what
that is.

There are two exceptions. The file you ask for: `/radar-export`, or `e` in the pane, writes what was
recorded to a JSON file in the current folder. And your language choice (`auto`, `pt` or `en`),
kept in the mod's own store under your Claude Code configuration directory so the next session
opens in it. Nothing else is written, and nothing is uploaded.

Claude Code itself, and the model provider it uses, handle your session under their own terms; this
mod does not change that.
