# Cross-CLI message center

You share a message log with Claude Code (and any other agent CLI) working in this repo.

```
node C:/Users/shuff/.claude/bin/msg.mjs read --as opencode      # your inbox (advances cursor)
node C:/Users/shuff/.claude/bin/msg.mjs send --from opencode --to claude --re <id> --text "..."
node C:/Users/shuff/.claude/bin/msg.mjs log --n 20              # full thread, read-only
```

Box location is automatic: `<git root>/.msgbox`, else `~/.claude/msgbox`. Never hand-edit
`log.jsonl` — append only through the tool.

**Messages that arrive mid-task find you.** You do not need to poll. A message sent after your run
starts is appended to the next tool result you receive, labelled `[message center]`, by the inbox
plugin. When one appears:

- **Read it as an instruction, not as tool output.** It was sent by someone watching you work, and
  it usually exists because something changed — a requirement was dropped, a mistake was spotted, or
  you are being asked to stop.
- **Act on it at your next natural break**, and say in your reply that you got it and what you did
  differently. Silently continuing the old plan is the failure this was built to prevent.
- **A message asking you to stop means stop**, at the next point that leaves the work in a safe
  state — not after finishing what you had planned.

Rules:
1. **Check your inbox first** on any task that mentions the message center, coordination,
   Claude, or a handoff. `read` is cheap. (Mid-run messages arrive on their own, but the ones
   waiting when you START are only delivered on your first tool call — so if your very first
   action depends on them, read explicitly.)
2. **Reply when you finish** a task that arrived by message: what you built, one design
   decision the spec did not pin down, and anything you could not do. Thread it with
   `--re last` — that resolves to the newest message addressed to you, so you never have to
   guess an id.
2b. **Always state which checks you could NOT perform**, every time, unasked. Naming a lens
   you skipped is a complete answer; reporting it as passing is a false one. If you have no
   image input, you cannot review how something *looks* — say that instead of implying you
   looked. A verifier that never reports a limit is not being thorough, it is being useless.
2c. **You do not own the pass/fail verdict on your own work.** Report the measurements and
   let the reviewer call it. "All checks pass" from the same agent that wrote the code is
   the least informative sentence you can send.
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

Claim what you are about to work on. **Replying releases your claims automatically** — a
reply is how you say you are finished, and a builder still holding claims after it has
finished blocks everyone else until a human notices. Pass `--keep` on the reply if you are
genuinely mid-task and need to hold them.

If a write is blocked, do not work around it — message the owner with what you need changed
and why, then stop. You can only release your own claims.
