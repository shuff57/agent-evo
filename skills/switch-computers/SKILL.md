---
name: switch-computers
description: "Park a session so it can be picked up on another machine, or resume one parked elsewhere. PARK writes a handoff note into the message-center box that actually travels between boxes, releases file claims, then commits every tracked/modified/untracked file and pushes. RESUME pulls and reads the note back. Use on 'switching computers', 'switch machines', 'moving to my laptop/desktop', 'park this', 'pack up', 'continuing on the other box', 'I'm on the other computer now', 'pick up where I left off on this machine'."
license: MIT
---

# switch-computers

Two halves of one bridge. **PARK** on the box you are leaving, **RESUME** on the
box you arrive at.

```
      MACHINE A  (park)                                MACHINE B  (resume)
 ┌───────────────────────┐                        ┌───────────────────────┐
 │ release claims        │                        │ pull agent-evo        │
 │ send note ─────────┐  │                        │  ┌──────────────────  │
 │ git add -A/commit  │  │                        │  │ read --as claude   │
 └────────────────────┼──┘                        └──┼───────────────────-┘
                      │        github.com            │
        agent-evo ────┼──push──▶ agent-evo ──pull────┘   <- the NOTE
        work repo  ───┴──push──▶ work repo  ──pull──▶        <- the CODE
```

Two pushes, not one. The **note** travels in `agent-evo` (which is `~/.claude`
itself, so it exists on every machine); the **code** travels in the work repo.
A note is not a handoff until it is on `origin` — no push, no handoff. That is the
whole mechanism and every rule below exists to protect it.

---

## PARK — leaving this machine

### 1. The note ALWAYS goes in the agent-evo box

`msg.mjs` resolves its box as `$MSGBOX` -> `<git root>/.msgbox` -> `~/.claude/msgbox`.
For a machine switch, **do not accept the default.** Two of those three do not
reach the other computer:

| Box | Reaches the other machine? |
|---|---|
| `~/.claude/msgbox` (non-repo fallback) | **No.** Not in any repo, never committed. Stranded. |
| `<work repo>/.msgbox` | **Only if** that repo has a remote, you push it, and it is cloned there. |
| `agent-evo/.msgbox` | **Yes.** It *is* `~/.claude` — present and synced on every box. |

So: agent-evo is the channel. Set it explicitly, resolving the root portably —
never a hardcoded home path, because the other machine's username may differ:

```bash
AE="$(cd "$(readlink -f ~/.claude/skills)/.." && pwd)"   # agent-evo root
export MSGBOX="$AE/.msgbox"
node ~/.claude/bin/msg.mjs where                          # confirm before sending
```

`agent-evo/.msgbox/log.jsonl` is the one path un-ignored by that repo's
`.gitignore`, and `.gitattributes` gives it `merge=union` so two machines
appending at once merge instead of conflicting.

If you are also parking work inside a project repo, you may send a *second*,
shorter note into that repo's box so it sits beside the code — but the agent-evo
one is not optional, and it is the one that gets read.

### 2. Release file claims — before the commit

Claims replay from the same log, and the log ships. A claim left held on machine A
travels to machine B and the write guard there blocks the very files you went to
go work on.

```bash
node ~/.claude/bin/msg.mjs owners
node ~/.claude/bin/msg.mjs release --as claude --all
```

### 3. Write the handoff note

**Send from `claude-<host>`, not from `claude`.** `read` filters out
`m.from === who`, so a note sent `--from claude --to claude` is invisible to the
next session's `read --as claude` — it lands in the log and is never delivered.
The hostname also labels which machine wrote it.

```bash
H="claude-$(hostname | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9-')"
node ~/.claude/bin/msg.mjs send --from "$H" --to claude --topic handoff --text '...'
```

Multi-line `--text` is safe (it is JSON-escaped into one physical log line). Use
**single quotes** in bash; a double-quoted string containing `" < > & | ^ %` gets
reinterpreted by the shell.

Content — write it for a session with **zero context**, not for yourself:

```
PARKED <ISO date> on <host>, repo <name> @ <branch> <short-sha>

DOING: <the one-sentence goal>
STATE: <what is finished and verified vs. merely written>
NEXT:  <the literal next action, as a command or file:line>
WATCH: <the trap — failing test, half-migration, uncommitted decision, blocked path>
RUN:   <exact commands to get the app/tests back up>
```

Send **one** note per repo you parked. If the state needs more than ~25 lines,
put the depth in `HANDOFF.md` via the `session-reflector` skill and let this note
point at it — the message center is a signal, not a document store.

### 4. Commit everything, then push

Work repo first — everything tracked, modified and untracked:

```bash
git status --short          # LOOK at this before staging
git add -A
git commit -m "wip: park for machine switch — <one-line what>"
git push
```

Rules that are not optional:

- **Read `git status --short` first and say what is being swept in.** `-A` takes
  untracked files too: keys, `.env`, dumps, stray multi-MB captures. Anything
  that should not enter history gets `.gitignore`d or moved out *before* staging,
  not force-pushed away afterwards.
- **The push is the handoff.** A local commit reaches nothing. If `push` fails
  (no remote, auth, non-fast-forward), say so plainly and loudly — a park that
  reports success while stranded is the worst outcome this skill has.
- **No remote at all** → say so, and that the *code* will not travel. The note in
  agent-evo still will; make it say where the work is sitting.
- **Committing a broken tree is fine and expected** — this is a `wip:` park, not
  a release. Do not "tidy up" or finish work to make the commit look good; the
  note's job is to say it is broken. Skip `caveman-commit` conventions here.

### 5. Sync the note itself — explicitly, never on trust

A note is only a handoff once it is on the remote. Push agent-evo yourself:

```bash
pwsh -File "$AE/sync-agent-evo.ps1"     # commit + pull --rebase --autostash + push
```

or, if pwsh is unavailable, by hand:

```bash
git -C "$AE" add -A
git -C "$AE" commit -m "msgbox: handoff from $(hostname)"
git -C "$AE" pull --rebase --autostash origin master
git -C "$AE" push origin master
```

**Do not rely on the `Agent-Evo Sync` scheduled task.** At best it is at-logon +
hourly — slower than walking to the other machine — and it can be off without
anything announcing it. (Measured 2026-08-29: the task was `Disabled`, having
last run on 2026-08-19, ten days earlier, while both this file and CLAUDE.md
described it as syncing hourly.) Check it if you like, but push regardless:

```bash
pwsh -c "Get-ScheduledTask -TaskName 'Agent-Evo Sync' | Select State"
```

### 6. Prove it landed, then report

```bash
git -C "$AE" log origin/master -1 --stat -- .msgbox/log.jsonl
```

If that does not show your note's commit on `origin/master`, **the handoff did
not happen** — keep working the push until it does. Then report, in this order:
the work-repo sha and whether its push succeeded, the agent-evo sha carrying the
note, and any repo left dirty. If more than one repo was touched this session,
repeat 2–4 per repo and list every one — a silently-skipped second repo is the
failure mode here.

---

## RESUME — arriving at this machine

**Pull before you read.** The note is a git object; until it is fetched it does
not exist on this box, and `read` will cheerfully report an empty inbox.

```bash
AE="$(cd "$(readlink -f ~/.claude/skills)/.." && pwd)"
pwsh -File "$AE/sync-agent-evo.ps1"        # or: git -C "$AE" pull --rebase --autostash origin master
export MSGBOX="$AE/.msgbox"

node ~/.claude/bin/msg.mjs read --as claude        # advances the cursor
node ~/.claude/bin/msg.mjs log --n 20              # belt and braces
node ~/.claude/bin/msg.mjs owners                  # should be empty
```

Then `cd` to the work repo, `git pull` it, and do the `NEXT:` line.

- Cursors are device-local (gitignored), so this machine has not seen the note
  even though its log line is days old. If `read` prints `(no new messages)` but
  a handoff clearly exists, `log --n 20` shows it anyway — read it from there and
  carry on.
- `owners` non-empty means the other machine parked without releasing. Release it
  (`release --as <that-name> --all`) and say that it happened.
- **Never answer a resume request with a question back.** The note plus the log
  is the answer.

---

## Failure modes this skill exists to prevent

Every one of these fails *silently* — the park looks like it worked.

| Trap | Symptom on the other machine | Guard |
|---|---|---|
| Note in `~/.claude/msgbox` | Nothing there; log looks fine on the origin box | Step 1 |
| Note in a work-repo box only | Nothing there, if that repo is not cloned/pushed | Step 1 |
| `--from claude --to claude` | Line is in the log, `read` never delivers it | Step 3 |
| Commit without push | "Parked ✓" here, stale tree there | Step 4 |
| Trusting the hourly sync task | Note sits local for hours, or forever if disabled | Step 5 |
| Never verifying `origin/master` | Push failed on auth; nobody looked | Step 6 |
| Claim left held | Writes blocked there, with no explanation | Step 2 |
| `git add -A` blind | Secrets or a 200MB capture in permanent history | Step 4 |
| Second repo forgotten | Half the session lands, half is stranded | Step 6 |
| Both machines appended | Merge conflict on the log tail — and `sync-agent-evo.ps1` answers a conflict by aborting the rebase and **skipping the push**, killing all sync | `merge=union` in agent-evo `.gitattributes` |
