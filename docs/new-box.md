# Setting up a new machine

`bash sync.sh` installs almost everything. This file is the almost.

Kept out of the always-on `AGENTS.md` because it is needed once per machine and never on
a normal turn.

## What `sync.sh` does for you

| Installs | Where | Shape |
|---|---|---|
| agents | `~/.config/opencode/agents/` | generated from `roster/*.md` by `bin/gen-agents.mjs` |
| skills | `~/.config/opencode/skill/` | symlinks, only the six `AGENTS.md` names; stale links pruned |
| team specs | `~/.omo/teams/<name>/` | **copies** — the team loader does not follow a symlinked directory |
| our plugins | `~/.config/opencode/plugin` | one symlink to `opencode/plugin/` |
| vendored plugins | `~/.config/opencode/plugins/` | copies from `opencode/vendor/*/`, currently chisle |
| global instructions | `~/.config/opencode/AGENTS.md` | symlink to `opencode/AGENTS.md`; an existing real file is backed up, not clobbered |

Re-run it after any edit to `roster/`, `skills/`, `omo/teams/` or `opencode/vendor/` —
none of those are live views.

## The three things you must add by hand

`~/.config/opencode/opencode.jsonc` is **deliberately not tracked**. It carries a literal
`/home/<user>/...` path plus an `apiKey` and a localhost `baseURL`, and an absolute home
directory written into a tracked config is wrong on the next box *silently* — this repo
has been bitten by exactly that before, on a `settings.json` that still said
`C:/Users/shuff` on a `shuff57` machine. Tracking it as a *project* `opencode.json` would
be worse than useless: project config applies only inside this repo, and these are global
settings.

So, into that file, on each new machine:

1. **`"@dietrichgebert/ponytail"`** in the `plugin` array. It injects its ruleset (~1.6k
   tokens) every turn at the active level; set the level with `PONYTAIL_DEFAULT_MODE` or
   `~/.config/ponytail/config.json`, default `full`.
2. **The Meridian plugin**, at whatever absolute path it occupies on that box — on this
   one, `~/.bun/install/global/node_modules/@rynfar/meridian/dist/meridian`.
3. **The `anthropic` provider block** pointing at the local proxy (`baseURL`
   `http://127.0.0.1:3456`, `apiKey` a placeholder), plus the model display names.

The plugin array does **not** need our own five plugins listed: `~/.config/opencode/plugin`
and `plugins` both auto-load, proven with a throwaway probe plugin on 2026-09-19.

## Do not run these installers

- **`npx chisle`** — it appends a ruleset to `~/.config/opencode/AGENTS.md`, which
  `sync.sh` symlinks into this repo, so it writes through into tracked files. The plugin
  half is vendored instead; see `../opencode/vendor/chisle/README.md`.
- **`install.sh`** — it targets Claude Code, symlinking into `~/.claude/` and copying
  `hooks/` there. Nothing on an opencode-only box loads any of that. It has **not been
  executed since 2026-09-19** and is the least-verified file in the repo: its graphify
  removal, its `gen-0` removal and its `AGENTS.md` rename are `bash -n` syntax-checked
  only. Read it before running it on a machine you care about.

## What never travels, by design

Derived or device-local, and every machine rebuilds its own: the codegraph index under
`~/.omo/codegraph/`, chisle's spill directory, the peer-bridge keys in `.msgbox/peer/`,
and the message-log read cursors. The message log itself (`.msgbox/log.jsonl`) *is*
committed — that is how a handoff note reaches another machine.
