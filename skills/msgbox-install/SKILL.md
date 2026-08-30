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

`bin/` and `opencode/` live in this repo; symlink them into place (as `sync.sh` does for
`roster`), then add the Claude-side hook by hand.

`settings.json` **is** symlinked from this repo, despite what this line used to say. That
means it carries absolute paths between machines: the guard command, the statusline, and
anything else pointing at a home directory are all one username away from being wrong on
the next box. The guard's version of wrong is silent — see the check below.

```bash
ln -sfn "$PWD/bin"             ~/.claude/bin
ln -sfn "$PWD/opencode/plugin" ~/.config/opencode/plugin
ln -sf  "$PWD/opencode/AGENTS.md" ~/.config/opencode/AGENTS.md
```

```jsonc
// ~/.claude/settings.json -> hooks.PreToolUse[]
{ "matcher": "Edit|Write|NotebookEdit",
  "hooks": [{"type": "command", "command": "node <YOUR-HOME>/.claude/bin/msg.mjs guard --as claude --hook"}] }
```

**Do not paste an absolute path out of this file.** JSON cannot expand `~`, and
`~/.claude/settings.json` is a symlink into this repo — so it travels to every box, carrying
whichever machine's home directory was written into it. Generate the line for the box you are
actually on:

```bash
node -e "console.log('node ' + require('os').homedir().split(String.fromCharCode(92)).join('/') + '/.claude/bin/msg.mjs guard --as claude --hook')"
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
printf '{"tool_name":"Write","tool_input":{"file_path":"'"$PWD"'/tmp/probe.txt"}}' \
  | node ~/.claude/bin/msg.mjs guard --as claude --hook; echo "exit $?   # must be 2"
node ~/.claude/bin/msg.mjs release --as someone-else --all
```

Exit 2 with a BLOCKED line means it works. Exit 0 or 1 means it does not, whatever the config
looks like. The claim path and the probe path must resolve to the same file — the guard
normalises against the repo root, so claiming `/tmp/x` and probing `<repo>/tmp/x` silently
matches nothing and looks like a working guard allowing a write.
