# Contributing

Issues and pull requests are welcome. Keep changes small and say what they change for someone using
the mod.

## Develop

```bash
git clone https://github.com/NeuralSeam/ns-session-radar
cd ns-session-radar
npm test               # fake Claude Code, no session needed
npm run preview        # also prints every tab as text
claude --plugin-dir .  # the real thing; saving register.js reloads it
```

All the code is in `hooks/register.js`. When you load the mod with `--plugin-dir`, Claude Code
writes the type declarations for your build to `.claude-plugin/types/claude-code/index.d.ts`; that
file, not memory, is the source for event and field names.

## Rules for changes

- **No new mods API calls without a reason in the pull request.** Anything added to the `calls:`
  list must also be added to [SECURITY.md](./SECURITY.md#what-it-does) in the same change. A pull
  request that adds `$.http`, `$.process`, `$.model` or `$.prompt` will not be merged.
- **Every hook passes the event on.** The radar observes; it never denies, rewrites or answers.
- **Strings go in both languages** in the `STRINGS` table.
- **The drawing must fit.** `npm test` checks the widths; keep it passing.

## Before a release

1. `npm test` passes, in English and with `LC_ALL=pt_BR.UTF-8`.
2. `claude plugin validate . --strict` reports no errors, and its `hooks:` and `calls:` lines match
   [SECURITY.md](./SECURITY.md).
3. In a real session with `claude --plugin-dir .`, in a terminal at least 144 columns wide:
   run a prompt that uses Bash, Read, a subagent and, if one is connected, an MCP tool; check each
   tab, the spinner, `/radar-export`, `/clear`, and a narrow terminal.
4. Repeat 3 in the Desktop app's Code tab.
5. Add a row to [COMPATIBILITY.md](./COMPATIBILITY.md) with `claude --version`, the surface and
   the date.
6. Bump `version` in `.claude-plugin/plugin.json`, add a [CHANGELOG.md](./CHANGELOG.md) entry,
   tag `vX.Y.Z` with a signed tag, and update the entry in the
   [Neural Seam marketplace](https://github.com/NeuralSeam/neural-seam-claude/blob/main/.claude-plugin/marketplace.json).
