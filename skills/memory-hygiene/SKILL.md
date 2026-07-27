---
name: memory-hygiene
description: Prune and reconcile the user-global auto-memory (~/.claude/projects/<cwd-slug>/memory/). Reconciles MEMORY.md pointers against files, flags duplicates/stale/malformed entries. Use at session end (via session-end-wrap), when the user says "memory hygiene"/"prune memory", or when the memory dir feels cluttered. Distinct from the project-local memory-hygiene that targets .agents/memory/ tiers.
license: MIT
---

# memory-hygiene (user-global)

Operates on the **user-global auto-memory** — the flat `*.md` fact files plus
the `MEMORY.md` index loaded at session start. This is a DIFFERENT structure
from the project-local `.agents/memory/{active,long-term,pending}/` tiers; a
project may ship its own `.claude/skills/memory-hygiene/` that shadows this and
targets those tiers instead. When CWD is such a repo, the project copy wins and
this one does not run.

## Target directory

`~/.claude/projects/<cwd-slug>/memory/` — the dir holding the `MEMORY.md`
surfaced in this session's memory context. `<cwd-slug>` is the working
directory with path separators replaced by `-` (e.g. CWD `C:\Users\shuff` →
`C--Users-shuff`). If unsure, use the exact path named in the session's memory
system-reminder. Do not touch any other project's memory dir.

## Global memory shape (what you're maintaining)

- One fact per file. Frontmatter: `name` (kebab slug), `description` (one line,
  used for recall), `metadata.type` ∈ {user, feedback, project, reference}.
- Body: the fact. For `feedback`/`project`, a `**Why:**` and `**How to apply:**`
  line. Related facts linked with `[[other-name]]`.
- `MEMORY.md` is the index: one line per fact — `- [Title](file.md) — hook`.
- **Flat. No active/long-term/pending tiers, no cap, no `last_used_at`, no
  archival.** Hygiene here is reconcile-and-prune, not tier-rotation.

## Pass (run in order, report before any non-pointer change)

1. **Pointer reconciliation (auto-fixable — the main job).**
   - Every `*.md` except `MEMORY.md` must have exactly ONE pointer line in
     `MEMORY.md`. Add a pointer for any orphaned file (derive title + hook from
     its frontmatter `description`).
   - Every `MEMORY.md` pointer must resolve to an existing file. A pointer to a
     deleted file is **dangling** — remove that line.
   - De-duplicate pointer lines that point at the same file.
   Pointer edits are safe and regenerable — apply them directly.

2. **Duplicate / overlap sweep (report, don't auto-merge).** Flag files whose
   `description` or subject substantially overlap another's (same host, same
   app, same project thread). Recommend which to merge into which and why.
   Merging changes user-authored content — propose, let the user confirm.

3. **Staleness sweep (report).** Flag `project`-type memories describing work
   that is clearly complete/superseded (e.g. a migration marked DONE whose
   follow-up memory now exists). Global memory has no cold tier — the choice is
   keep or delete, and deletion needs user sign-off. Surface candidates with the
   reason; never delete unilaterally.

4. **Frontmatter validity (report + safe fixes).** Flag files missing `name`,
   `description`, or a valid `metadata.type`. Fix an obviously-missing `name`
   (derive from filename) directly; surface a missing `description`/`type` for
   the user since those encode intent.

## Safety properties

- **No deletion of fact files without explicit user confirmation.** Only
  `MEMORY.md` pointer lines and trivially-derivable frontmatter are auto-edited.
- **`*.md` only.** Never touch non-markdown artefacts.
- **Single dir.** Only the current session's memory dir; never another
  project's, never `.agents/memory/`.
- **Idempotent.** A second run with no new files makes no changes.

## Invocation

No script — use the Read / Grep / Edit tools directly against the target dir
(the volume is small, tens of files). Steps:
1. List `*.md` in the memory dir; read `MEMORY.md`.
2. Diff the file set against the pointer set → apply step-1 fixes.
3. Scan descriptions for overlap and stale `project` entries → report steps 2–4.
4. Print a summary: `N pointers fixed, M dangling removed, K merge candidates,
   J stale candidates` and the per-item detail for anything needing user sign-off.

## When NOT to invoke

- Mid-task — let the session finish.
- When CWD is a repo with its own `.agents/memory/` tiers and a shadowing
  project `memory-hygiene` — that one owns hygiene there.
- Immediately before the global `session-reflector` — `session-end-wrap` runs
  hygiene FIRST, then reflector, so the index is clean before the new entry lands.
