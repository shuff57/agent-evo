# Cross-CLI message center

You share a message log with Claude Code (and any other agent CLI) working in this repo.

```
node ~/.claude/bin/msg.mjs read --as opencode      # your inbox (advances cursor)
node ~/.claude/bin/msg.mjs send --from opencode --to claude --re <id> --text "..."
node ~/.claude/bin/msg.mjs log --n 20              # full thread, read-only
node ~/.claude/bin/msg.mjs prune --dry-run         # preview box trim (see Retention below)
```

Box location is automatic: `$MSGBOX` -> `<git root>/.msgbox` -> `~/.claude/msgbox`. The repo box is committed, so the thread ships between machines; the cursor files beside it are device-local. Never hand-edit
`log.jsonl` — append only through the tool.

**"What do we resume?"** — When a session is asked what to resume / pick up on / continue, or where
the work stands, run `read --as opencode` and `log --n 20` and answer from them; never reply with a
question back. A missing inbox is not a free pass: an empty `read` costs one command and settles it.

**Retention.** The box self-trims: after a `send`, when the log exceeds 400 lines it drops the
oldest lines every possible reader has consumed. Unread lines, the newest 30, and all claim/release
events survive (ownership replays from them); cursors recalibrate automatically. `prune --dry-run`
previews, `--max`/`--keep` tune. Ids are positional — thread with `--re last`.

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
1. **Check your inbox first** on any task that mentions your **inbox**, the message center,
   coordination, Claude, or a handoff. `read` is cheap. (Mid-run messages arrive on their own, but
   the ones waiting when you START are only delivered on your first tool call — so if your very
   first action depends on them, read explicitly.)

   **"Check your inbox" is never a question about email.** You have an inbox: it is the command
   above. Replying "I don't have an inbox — I'm a coding assistant, not an email client" and
   stopping is a *silent failure*. The run exits 0, the caller sees a completed task, and no work
   was done. Measured twice on 2026-08-10. If the phrase reaches you and you are unsure, run
   `msg.mjs read --as opencode` — an empty inbox costs one cheap command and answers the question.
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
node ~/.claude/bin/msg.mjs claim --as opencode src/ parse.js   # trailing / = whole dir
node ~/.claude/bin/msg.mjs owners                             # who owns what
node ~/.claude/bin/msg.mjs release --as opencode parse.js     # or --all when done
```

Claim what you are about to work on. **Replying releases your claims automatically** — a
reply is how you say you are finished, and a builder still holding claims after it has
finished blocks everyone else until a human notices. Pass `--keep` on the reply if you are
genuinely mid-task and need to hold them.

If a write is blocked, do not work around it — message the owner with what you need changed
and why, then stop. You can only release your own claims.
