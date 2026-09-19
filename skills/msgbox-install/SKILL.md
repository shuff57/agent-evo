---
name: msgbox-install
description: >-
  Install the cross-CLI message center and its file-ownership guard on a new
  machine - symlink bin/ and opencode/ from the agent-evo repo, generate the
  PreToolUse hook line for THIS box, and run the probe that proves the guard
  blocks. Use on a new box, after a username or home-directory change, or when
  a file claim did not stop a write.
---

# Message center + ownership guard — install on a new box

`bin/` and `opencode/` live in this repo; symlink them into place, then add the Claude-side
hook by hand.

**Agents are NOT symlinked — they are generated.** `sync.sh` used to link
`~/.claude/agents -> roster/`; it no longer does, and restoring that link breaks routing.
`roster/` is the single source for both CLIs, and each consumer gets a *different* file
generated from it: Claude-lane agents are copied verbatim, ollama-lane agents become thin
forwarders that shell out to `opencode run --agent`. One symlink would serve the same file
to both, so every ollama-lane agent would quietly run on Claude instead of spawning
opencode. Run `./sync.sh` (which calls `bin/gen-agents.mjs`) on a new box **and after any
roster edit** — the generated copies are not live views.

`settings.json` **is** symlinked from this repo — `install.sh` links it and then verifies
the link. That is only safe because the repo copy contains **no absolute home directory**:
every hook command in it uses `$HOME`. Claude Code runs hook commands through a POSIX shell,
so `$HOME` expands. Measured 2026-09-09 by watching a `Glob|Grep` hook fire: its `[ -f ... ] && ... || true`
body is not valid cmd.exe or PowerShell, so a shell is running it. (That particular hook was
graphify's, removed 2026-09-19; the shell-expansion fact it established still holds.)

Keep it that way. A literal home directory written into that file travels to every box and is
one username away from being wrong on the next one, and the guard's version of wrong is
silent — see the check below. Measured 2026-09-09: the repo copy said `C:/Users/shuff` on a
`shuff57` box AND had lost its tier-gate entry, so running this repo's own `install.sh` here
would have disabled both guards while looking fully configured.

The shared copy deliberately ships only the hooks this repo also ships. `SessionStart` and
`Stop` run `memory-sync-*.py`, which exist only in `~/.claude/hooks`, so they stay out of the
symlinked file rather than pointing every new box at a script it does not have.

```bash
ln -sfn "$PWD/bin"             ~/.claude/bin
ln -sfn "$PWD/opencode/plugin" ~/.config/opencode/plugin
ln -sf  "$PWD/opencode/AGENTS.md" ~/.config/opencode/AGENTS.md
```

```jsonc
// ~/.claude/settings.json -> hooks.PreToolUse[]
{ "matcher": "Edit|Write|NotebookEdit",
  "hooks": [{"type": "command", "command": "node $HOME/.claude/bin/msg.mjs guard --as claude --hook"}] }
```

**Write `$HOME`, never an absolute path.** `~/.claude/settings.json` is a symlink into this
repo, so it travels to every box carrying whatever was written into it. JSON itself expands
nothing, but the shell that runs the hook does, and `$HOME` is what makes one file correct on
every machine. To see what it resolves to here:

```bash
node -e "console.log(require('os').homedir())"
```

The hook only takes effect on the next session start. `opencode` picks the plugin up on its
next run, no restart needed.

**Then prove it blocks, because a wrong path fails OPEN.** `PreToolUse` treats exit code **2**
as the block signal; every other non-zero exit is a non-blocking error that prints to stderr
and lets the write through. A bad path throws MODULE_NOT_FOUND, exits 1, and the guard passes
everything while looking configured.

Measured 2026-08-23: this file said `shuff57` where the home directory was `shuff`, and the
guard had therefore never blocked anything. Three sessions were working the same repo at the
time with nothing but a hand-negotiated file split between them. A second session read the bad
path, got MODULE_NOT_FOUND, and concluded the tool was not installed at all.

```bash
node ~/.claude/bin/msg.mjs claim --as someone-else tmp/probe.txt
printf '{"tool_name":"Write","tool_input":{"file_path":"tmp/probe.txt"}}' \
  | node ~/.claude/bin/msg.mjs guard --as claude --hook; echo "exit $?   # must be 2"
node ~/.claude/bin/msg.mjs release --as someone-else --all
```

Exit 2 with a BLOCKED line means it works. Exit 0 or 1 means it does not, whatever the config
looks like. The claim path and the probe path must resolve to the same file — the guard
normalises against the repo root, so claiming `/tmp/x` and probing `<repo>/tmp/x` silently
matches nothing and looks like a working guard allowing a write.

**Probe with a relative or `C:/`-style path, never a Git-Bash `/c/...` one.** Measured
2026-09-09 against one live claim: `tmp/probe.txt` blocks (exit 2), the `C:/Users/...` form
blocks, and the `/c/Users/...` form returns **exit 0**. An earlier version of this probe
interpolated `"$PWD"`, which in Git Bash is exactly that `/c/...` form — so the documented
check reported a fail-open guard that was in fact working correctly. The guard does not
normalise MSYS-style paths. Claude Code passes Windows-form paths, so this is a probe
artifact rather than a live hole, but anything handing the guard a POSIX-style absolute path
will slip straight through it.
