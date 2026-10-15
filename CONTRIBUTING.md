# Contributing

Issues and pull requests are welcome. Keep changes small and say what they change for someone using
the mod.

## Licence of contributions and sign-off

Session Radar is licensed under [Apache-2.0](./LICENSE). As section 5 of that licence says, anything
you submit for inclusion is contributed under the same licence, with no additional terms.

Every commit must carry a [Developer Certificate of Origin](https://developercertificate.org/)
sign-off: a line that says you wrote the change, or otherwise have the right to submit it under this
licence. Sign each commit with `-s`, which adds the line from your git `user.name` and `user.email`:

```bash
git commit -s -m "fix: keep the pane width under 84 columns"
# adds: Signed-off-by: Your Name <you@example.com>
```

Forgot it? `git commit --amend -s` fixes the last commit, and `git rebase --signoff main` fixes every
commit on your branch. Pull requests with unsigned commits are not merged.

## Develop

```bash
git clone https://github.com/NeuralSeam/ns-session-radar
cd ns-session-radar
npm test               # fake Claude Code, no session needed
npm run preview        # also prints every tab as text
claude --plugin-dir .  # the real thing; saving register.js reloads it
```

The mod is `hooks/register.js`, which hooks the events and draws the pane, and `hooks/insights.js`,
the insight rules as pure functions with no `$` and no text. `skills/radar-review/SKILL.md` is the
AI review, a skill Claude runs when asked. When you load the mod with `--plugin-dir`, Claude Code
writes the type declarations for your build to `.claude-plugin/types/claude-code/index.d.ts`; that
file, not memory, is the source for event and field names.

## Rules for changes

- **No new mods API calls without a reason in the pull request.** Anything added to the `calls:`
  list must also be added to [SECURITY.md](./SECURITY.md#what-it-does) in the same change. A pull
  request that adds `$.model` or `$.prompt` will not be merged: anything that needs a model belongs
  in the skill, which runs only when the person calls it. `$.process` and `$.http` are for the
  browser view alone: its loopback server, started only by `/radar-web` or `w`. A pull request
  that uses them for anything else, or reaches an address other than `127.0.0.1`, will not be
  merged.
- **Off by default.** A setting that notifies, keeps more data or reads more files starts off.
- **No text in the history.** It keeps counts, never a prompt or an argument.
- **A new insight rule** goes in `hooks/insights.js` with a named threshold, a case that finds it
  and one that does not in `tests/insights.mjs`, its two lines in both languages under `ins` in
  `STRINGS`, a metric in `METRIC`, and a line in the README's rules table and the skill's.
- **Every hook passes the event on.** The radar observes; it never denies, rewrites or answers.
- **Strings go in both languages** in the `STRINGS` table.
- **The drawing must fit.** `npm test` checks the widths; keep it passing.

## Before a release

1. `npm test` passes, in English and with `LC_ALL=pt_BR.UTF-8`.
2. `claude plugin validate . --strict` reports no errors, and its `hooks:` and `calls:` lines match
   [SECURITY.md](./SECURITY.md).
3. In a real session with `claude --plugin-dir .`, in a terminal at least 144 columns wide:
   run a prompt that uses Bash, Read, a subagent and, if one is connected, an MCP tool; check each
   tab, the spinner, `/radar-export`, `/clear`, and a narrow terminal. In `/radar-config`, turn on
   both notifications and insights: an activity over the minimum notifies, the cache warning comes
   once while idle, and the Insights tab and the export show the findings. Run
   `/session-radar:radar-review` on the export.
4. Repeat 3 in the Desktop app's Code tab.
5. Add a row to [COMPATIBILITY.md](./COMPATIBILITY.md) with `claude --version`, the surface and
   the date.
6. Bump `version` in `.claude-plugin/plugin.json`, in the entry in
   `.claude-plugin/marketplace.json` and in `VERSION` in `hooks/register.js`, which the credit line
   shows (`npm test` fails when they disagree), add a [CHANGELOG.md](./CHANGELOG.md) entry, and tag
   `vX.Y.Z` with a signed tag.
