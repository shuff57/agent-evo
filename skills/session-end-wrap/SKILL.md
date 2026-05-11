---
name: session-end-wrap
description: >
  End-of-session wrap-up orchestrator (project-agnostic). The user manually
  runs this skill to invoke memory-hygiene, session-reflector, the
  user-global evolver (modify-mode), and any project-local create-mode
  evolver in sequence — prune active memory, capture session learnings,
  propose surgical edits to existing agents/skills, and propose new
  agents/skills/teams where a capability gap was hit. Failures isolate
  (one phase failing does not block the next). This skill is NEVER
  auto-invoked by hooks; the Stop-hook nudge only reminds the user to type
  `/session-end-wrap` themselves.
  Triggers: "end session", "wrap up", "session done", "/session-end", "consolidate session".
license: MIT
---

# session-end-wrap

End-of-session orchestrator. Four phases run in sequence; each one is
independent so a failure in any single phase does not block the others.

This is the **user-global** copy and is project-agnostic. It discovers
project-local create-mode evolvers by convention (`.claude/agents/*-evolver.md`
in CWD) so it works across any repo that follows the pattern. If a project
ships its own `.claude/skills/session-end-wrap/SKILL.md`, that copy shadows
this one — useful when a repo needs custom phase behavior.

## Why this skill exists

Three skills + one agent cover the four end-of-session concerns separately
(`memory-hygiene`, `session-reflector`, the modify-mode `evolver` agent, and
the project-local create-mode evolver). Running them manually one at a time
is friction. This skill is a thin orchestrator so the user can fire all four
with one command. The Stop-hook only nudges the user to type that command —
it never invokes this skill directly.

## Prerequisites

The orchestrator invokes up to four sub-skills/agents. Each one is optional
in the failure-isolation sense: a missing prerequisite skips its phase but
does not block the others.

- `memory-hygiene` skill — project-local at `.claude/skills/memory-hygiene/SKILL.md` is preferred and resolves first; user-global at `~/.claude/skills/memory-hygiene/SKILL.md` is the cross-project fallback.
- `session-reflector` skill — typically at `~/.claude/skills/session-reflector/SKILL.md` (user-global).
- `evolver` agent (loads the `evolution` skill) — at `~/.claude/agents/evolver.md` (user-global). Modify-mode only.
- Project-local create-mode evolver — any agent in `<repo>/.claude/agents/` whose filename matches `*-evolver.md` (e.g. `bookshelf-evolver.md`, `infra-evolver.md`). Each such agent is invoked once in phase 4. Repos without one simply skip phase 4 with a clean log line.

## Order matters

1. **`memory-hygiene` first** — prune `.agents/memory/active/`, archive cold
   entries to `long-term/`, update `MEMORY.md`. This must run before reflector
   so the active tier has room for the new entry the reflector is about to add.
2. **`session-reflector` second** — capture this session's learnings as a new
   entry in `.agents/memory/active/`. Adds to the just-pruned active tier.
3. **`evolver` third (modify-mode)** — user-global agent. Analyze session
   friction and propose surgical edits to existing agents/skills/prompts.
   Reads the freshly-written reflector entry as one of its signals. Never
   creates new artefacts — that's phase 4's job.
4. **Project-local create-mode evolvers fourth** — each agent matching
   `.claude/agents/*-evolver.md` in CWD. Scans `.agents/memory/active/` for
   friction signals where no existing agent/skill/team fit (capability gap
   hit ≥2 times). Drafts at most ONE new artefact per evolver to
   `.claude/`, logs to `.agents/_evolution_log.jsonl`. Never auto-commits.
   Modify-mode signals are deferred back to phase 3's evolver.

## Execution protocol

**Failure-isolation guarantee — read this carefully.** Treat each phase as
fully independent. After invoking phase N, do NOT branch on its success or
failure. UNCONDITIONALLY proceed to phase N+1 regardless of what phase N
reported. An exception, a missing skill, a non-zero return, an empty result —
none of these may abort the next phase. Capture the outcome of each phase
and present them all in the final summary.

For each phase, in order:

1. Invoke the phase:
   - Phase 1 (`memory-hygiene`) and phase 2 (`session-reflector`): use the
     `Skill` tool.
   - Phase 3 (modify-mode evolution): use the `Agent` tool with
     `subagent_type: "evolver"` (user-global).
   - Phase 4 (create-mode evolution): before invoking, use the `Glob` tool
     with pattern `.claude/agents/*-evolver.md` (CWD-relative) to discover
     project-local create-mode evolvers. For each match, derive the agent
     name from the filename stem (e.g. `bookshelf-evolver.md` → agent name
     `bookshelf-evolver`) and invoke it via the `Agent` tool with that name
     as `subagent_type`. Brief each one that phase 3 already ran, so it
     should classify signals only as create-new vs. noise; modify-fix has
     already been handled. If the glob returns zero matches, skip phase 4
     cleanly with `"no project-local create-mode evolver detected"` in the
     summary — this is the expected state for repos that don't yet use the
     create-mode pattern.
2. Capture the outcome (success summary or error message). Continue
   regardless.
3. After all four phases have been attempted, present a consolidated
   summary to the user:
   - What `memory-hygiene` archived (`N moved to long-term/`) — or the error.
   - What `session-reflector` wrote (`active/<filename>.md`) — or the error.
   - What `evolver` proposed (modify diffs, or "no friction detected") — or
     the error.
   - What each project-local create-mode evolver proposed (new draft path +
     rationale, or "no capability gap detected") — or the error / "phase
     skipped, no project-local evolver found".
4. Do NOT auto-commit. The user reviews each phase's diff and stages manually.

## What this skill does NOT do

- Does not auto-commit any changes.
- Does not run mid-session — only at end-of-session boundary.
- Does not consolidate user-global memory; only project-local
  `.agents/memory/`.
- Does not bypass any individual skill's safety guardrails (e.g. create-mode
  evolver's 1-new-artefact-per-run cap, mutation atomicity).
- Does not create a project-local create-mode evolver where none exists —
  that's a manual one-time setup per repo. See any repo with a
  `.claude/agents/*-evolver.md` for a reference template.

## When NOT to invoke

- Inside a tight iteration loop where you'll be back in the session in a few
  minutes — wait for an actual end-of-day boundary.
- When you've made no substantive changes — there's nothing to consolidate.
- When the assistant is mid-task — let the task complete first.
