---
name: session-checkpoint
description: "Log this session's state into the local message-center box (not a file) so a brand-new session in the same repo can read it back and answer 'what were we working on'. Use on 'checkpoint this session', 'log session state', 'save where we are', 'save state to msgbox', or before a session might end abruptly mid-task. Same-machine only -- for moving to a different computer use switch-computers instead."
license: MIT
---

# session-checkpoint

A same-machine, same-repo "what was I doing" note written into the cross-CLI
message center (`msg.mjs`) instead of a file. A fresh session run later in this
repo recovers it just by reading its inbox — no HANDOFF.md to remember to open,
no path to hand the next session.

## Not the same as these two

| Skill | Where state goes | Scope |
|---|---|---|
| `session-reflector` (Mode 2) | `HANDOFF.md` file at repo root | Same or different machine, but you must know to open the file |
| `switch-computers` (PARK) | msgbox in `agent-evo`, forced there so it syncs, **plus** `git commit && push` of the work repo | Moving to a **different machine** — heavier, commits/pushes code |
| **`session-checkpoint`** (this) | msgbox at the default box for this repo | **Same machine**, next session just asks — no file, no commit, no push |

If the state is deep (architecture notes, long rationale), still write a
`HANDOFF.md` via `session-reflector` and have this note point at it — the
message center is a signal, not a document store. If the user is about to
switch physical machines, use `switch-computers` instead (it also handles code
and does the cross-machine box).

## WRITE — checkpoint the current session

1. **Resolve the box** — do NOT force `agent-evo` (that's `switch-computers`'
   job for cross-machine reach). Let it resolve normally:
   `$MSGBOX` → `<git root>/.msgbox` → `~/.claude/msgbox`.
   ```bash
   node ~/.claude/bin/msg.mjs where
   ```

2. **Send from `claude-checkpoint`, never bare `claude`.** `read --as claude`
   filters out messages where `m.from === 'claude'` — a note sent
   `--from claude --to claude` lands in the log but a future `read --as claude`
   will never surface it. This is the single most important rule here.

   ```bash
   node ~/.claude/bin/msg.mjs send --from claude-checkpoint --to claude --topic checkpoint --text '...'
   ```

3. **Content — write it for a session with zero context**, the same shape
   `switch-computers` uses (proven format, reuse it):

   ```
   CHECKPOINT <ISO date>, repo <name> @ <branch> <short-sha>

   DOING: <the one-sentence goal>
   STATE: <what is finished/verified vs merely in-progress or written-but-untested>
   NEXT:  <the literal next action — a command, a file:line, or "ask the user X">
   WATCH: <the trap — a blocker, credentials/login needed, a half-done write,
           an open browser tab in a specific state, anything that will bite
           a session that doesn't know it's there>
   RUN:   <exact commands to get back to where this session was, if applicable>
   ```

   Keep it under ~25 lines. `--text` is JSON-escaped into one log line, so
   multi-line content is safe — use single quotes in bash (a double-quoted
   string containing `" < > & | ^ %` gets reinterpreted by the shell).

4. **No commit, no push, no file write.** That is the entire point of this
   skill over `switch-computers` — it is cheap and safe to fire mid-task,
   including right before an interruption, because it touches nothing but the
   local msgbox log.

5. Confirm to the user: the box path, and that the note was sent (show the
   `#<id>` msg.mjs prints).

## READ — "what were we working on"

This is already the standing instruction in AGENTS.md's message-center
section — this skill doesn't change it, just names it:

```bash
node ~/.claude/bin/msg.mjs read --as claude     # advances the cursor
node ~/.claude/bin/msg.mjs log --n 20           # belt and braces if read shows nothing new
```

- If `read` prints `(no new messages)` but a checkpoint clearly exists, the
  cursor has already seen it (device-local cursor, not proof nothing is
  there) — check `log --n 20` before concluding there's nothing to resume.
- Surface the `CHECKPOINT` note's DOING/STATE/NEXT/WATCH directly. **Never
  answer a resume request with a question back** — the note is the answer.
- If `WATCH` names a blocker still unresolved (a login, an approval), lead
  with that before proposing to continue.

## Guardrails

- Never send from `--from claude` — see step 2. This is the one failure mode
  that makes the whole skill silently useless (message sent, never delivered).
- Don't reach for `agent-evo` or `git push` here — if the user actually wants
  cross-machine reach, that's `switch-computers`, not this skill.
- Don't duplicate a long-form `HANDOFF.md` inline in the checkpoint text; link
  to it instead once it exceeds ~25 lines.
