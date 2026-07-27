---
name: session-reflector
description: "Capture end-of-session learnings into user-global auto-memory, and write/read HANDOFF.md for cross-context resume. Use when a session ends with durable learnings, when starting a session that left a handoff, or on 'session end'/'save learnings'/'handoff'/'pick up where I left off'. Writes global memory files in the ~/.claude/projects/<slug>/memory/ format. Distinct from the project-local session-reflector that writes .agents/memory/pending/."
license: MIT
---

# session-reflector (user-global)

Persists a session's durable learnings into the **user-global auto-memory**, and
handles HANDOFF.md for resuming across context boundaries. A repo may ship a
`.claude/skills/session-reflector/` that shadows this and writes to
`.agents/memory/pending/` instead — that one wins inside its repo.

## Mode 1 — Reflection into global memory (default at session end)

The global memory is the flat fact-file store described in the user's CLAUDE.md
memory protocol. A reflection here is NOT a free-form journal entry — it becomes
one (or updates one) properly-formatted memory file.

### Steps

1. **Draft** (≤20 lines, show the user, then write without waiting): what was
   done, patterns/failure-modes worth remembering, corrections received,
   suggestions. Only the DURABLE, non-obvious parts survive to a file — skip
   anything the repo/git history already records or that only mattered this
   conversation.

2. **Classify each durable learning** into a `metadata.type`:
   - `user` — who the user is / a durable preference.
   - `feedback` — guidance on how to work (correction or confirmed approach).
   - `project` — ongoing work / goal / constraint not derivable from code.
   - `reference` — pointer to an external resource (URL, dashboard, ticket).

3. **Dedup first.** Read `MEMORY.md` and any file whose subject overlaps. If an
   existing file already covers this, UPDATE it rather than create a duplicate.
   Delete a memory that this session proved wrong.

4. **Write the file** at `~/.claude/projects/<cwd-slug>/memory/<slug>.md`
   (`<slug>` = short kebab-case; `<cwd-slug>` = CWD with separators → `-`, e.g.
   `C--Users-shuff`). Frontmatter + body:
   ```markdown
   ---
   name: <slug>
   description: <one line — used for recall relevance>
   metadata:
     type: user | feedback | project | reference
   ---

   <the fact. For feedback/project add **Why:** and **How to apply:** lines.
   Convert relative dates to absolute. Link related memories with [[their-name]].>
   ```

5. **Add a MEMORY.md pointer** — one line, no body content in the index:
   `- [Title](<slug>.md) — one-line hook`.

6. **Confirm** the written/updated path(s) to the user.

### Honesty

Save what was non-obvious and durable. If asked to remember something the repo
already records (code structure, a past fix, git history), ask what was
non-obvious about it and save that instead.

## Mode 2 — HANDOFF.md (cross-context resume)

Works in any directory (repo or not). `HANDOFF.md` at the working-dir root is a
single-slot message to the next session.

**Session end (write):**
- If the work is in a git repo, first `git diff HEAD -- <thread-source-files>`
  and downgrade any priority already implemented in the working tree (avoids the
  stale-handoff trap where priority-1 is already done but uncommitted).
- Write `HANDOFF.md` with: what was done, what's next / blockers, key context
  (paths, creds location, env, decisions), warnings/pitfalls. For cleanup
  sessions include the exact grep used for any "stale refs found" count and note
  it's a lower bound.

**Session start (read):** if `HANDOFF.md` exists, read it, absorb, then continue
or rotate it.

**Rotate when superseded:** before overwriting an existing `HANDOFF.md`, move the
old one aside — `HANDOFF-YYYY-MM-DD-<slug>.md` (old header's date, not today's).
In a repo, prefer `git mv`. If a durable learning came out of it, also capture
that via Mode 1.

## Optional — evolution metrics

If (and only if) an evolution metrics store exists for this setup
(`…/agent-evo/_workspace/_metrics/summary.jsonl`), append one JSONL line for the
session so the `evolver` has signal (schema: session_id, timestamp, agent_id,
tasks_handled, task_success, rephrase_count, correction_count, agent_switches,
skill_loads, manual_repetitions, notes). Append with `>>`, never `>`. If the
store doesn't exist, skip silently — don't create it.

## When NOT to invoke

- Transient notes not meant to be durable.
- Mid-task with no time to reflect.
- Inside a repo whose own `session-reflector` shadows this (that one writes the
  project's `.agents/memory/pending/`).
