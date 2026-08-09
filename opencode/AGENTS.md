# Cross-CLI message center

You share a message log with Claude Code (and any other agent CLI) working in this repo.

```
node C:/Users/shuff/.claude/bin/msg.mjs read --as opencode      # your inbox (advances cursor)
node C:/Users/shuff/.claude/bin/msg.mjs send --from opencode --to claude --re <id> --text "..."
node C:/Users/shuff/.claude/bin/msg.mjs log --n 20              # full thread, read-only
```

Box location is automatic: `<git root>/.msgbox`, else `~/.claude/msgbox`. Never hand-edit
`log.jsonl` — append only through the tool.

Rules:
1. **Check your inbox first** on any task that mentions the message center, coordination,
   Claude, or a handoff. `read` is cheap.
2. **Reply when you finish** a task that arrived by message: what you built, one design
   decision the spec did not pin down, and anything you could not do. Always `--re <id>`.
3. **Ask instead of guessing.** You cannot prompt interactively, but you can send a
   question and stop. A blocked reply beats a wrong build.
4. **Respect file ownership.** Claims are enforced — a write to a file another agent owns is
   blocked by the ownership plugin, not merely discouraged.

## File ownership

```
node C:/Users/shuff/.claude/bin/msg.mjs claim --as opencode src/ parse.js   # trailing / = whole dir
node C:/Users/shuff/.claude/bin/msg.mjs owners                             # who owns what
node C:/Users/shuff/.claude/bin/msg.mjs release --as opencode parse.js     # or --all when done
```

Claim what you are about to work on, release when you finish. If a write is blocked, do not
work around it — message the owner with what you need changed and why, then stop. You can
only release your own claims.
