---
name: session-end-wrap
description: 'End-of-session wrap-up orchestrator (project-agnostic). Runs memory-hygiene, session-reflector, the user-global evolver (modify-mode), and any project-local create-mode evolver in sequence; failures isolate, so one phase failing does not block the next. NEVER auto-invoked by hooks - the Stop-hook nudge only reminds the user to type it. Triggers: "end session", "wrap up", "session done", "/session-end", "consolidate session".'
license: MIT
---

# session-end-wrap

End-of-session orchestrator. Six phases run in sequence (phase 0 plus five);
each one is independent so a failure in any single phase does not block the
others.

This is the **user-global** copy and is project-agnostic. It discovers
project-local pieces by convention — create-mode evolvers via
`.claude/agents/*-evolver.md` and a pending-triage skill via
`.claude/skills/memory-pending-triage/SKILL.md`, both CWD-relative — so it
works across any repo that follows the pattern and skips cleanly in repos that
don't. If a project ships its own `.claude/skills/session-end-wrap/SKILL.md`,
that copy shadows this one — useful when a repo needs custom phase behavior.

## Why this skill exists

Four skills + two agents cover the end-of-session concerns separately
(`memory-pending-triage`, `memory-hygiene`, `session-reflector`, the
modify-mode `evolver` agent, the project-local create-mode evolver, and
`evolver-meta`). Running them manually one at a time is friction. This skill is
a thin orchestrator so the user can fire them all with one command. The Stop-hook only nudges the user to type that command —
it never invokes this skill directly.

## Prerequisites

The orchestrator invokes up to six sub-skills/agents. Each one is optional
in the failure-isolation sense: a missing prerequisite skips its phase but
does not block the others.

- `memory-pending-triage` skill — project-local only, at `.claude/skills/memory-pending-triage/SKILL.md`. Bridges `pending/` (what `session-reflector` writes) to `active/` (what `memory-hygiene` manages) — nothing else does, so without it `pending/` grows unbounded. Absent in most repos; phase 0 skips.
- `memory-hygiene` skill — project-local at `.claude/skills/memory-hygiene/SKILL.md` is preferred and resolves first; user-global at `~/.claude/skills/memory-hygiene/SKILL.md` is the cross-project fallback.
- `session-reflector` skill — project-local at `.claude/skills/session-reflector/SKILL.md` is preferred and resolves first when a repo ships one; user-global at `~/.claude/skills/session-reflector/SKILL.md` is the cross-project fallback (typical case).
- `evolver` agent (loads the `evolution` skill) — at `~/.claude/agents/evolver.md` (user-global). Modify-mode only.
- Project-local create-mode evolver — any agent in `<repo>/.claude/agents/` whose filename matches `*-evolver.md` (e.g. `bookshelf-evolver.md`, `infra-evolver.md`). Each such agent is invoked once in phase 4. Repos without one simply skip phase 4 with a clean log line.

## Worktree awareness

`.agents/memory/` is tracked per-branch, not shared globally. If CWD is a git
worktree (check `git rev-parse --show-toplevel` against `git worktree list`,
or just note a `.worktrees/` segment in the path) on a branch other than the
repo's default, phases 0-2 read and write that branch's own snapshot of
`.agents/memory/` — which can be behind (or diverged from) what hygiene/
reflector already did on the main branch in a different checkout. Confirmed
2026-08-07: a `feature/*` worktree's committed `MEMORY.md` differed from
`desktop`'s, and an uncommitted working-tree edit was already reconciling the
gap before this skill ran. Triaging `pending/` notes or pruning `active/`
entries here can redo work already done on the main branch, and a
`session-reflector` entry written here won't reach the main branch's memory
until this branch merges. Before running phases 0-2 in a worktree, diff
`.agents/memory/` against the default branch; if it's diverged, say so in the
summary rather than silently triaging/pruning/writing as if this were the
canonical copy.

## Order matters

0. **`memory-pending-triage`** (when the repo has it) — promote durable
   facts out of `.agents/memory/pending/` into `active/`, and move each read
   note to `pending/indexed/`. This runs BEFORE hygiene because triage is what
   puts entries INTO `active/`; hygiene is what caps and prunes it. Running
   hygiene first just means re-running it. Skip cleanly when the skill is
   absent — most repos have no `pending/` tier.

   Triage is a judgment pass, not a sweep: a note is only marked processed once
   it has actually been read. Do NOT bulk-move the backlog to clear a count —
   that reports work that did not happen. If the backlog is large, triage what
   you can, report the remainder honestly, and leave it in `pending/`.

1. **`memory-hygiene`** — prune `.agents/memory/active/`, archive cold
   entries to `long-term/`, update `MEMORY.md`. This must run before reflector
   so the active tier has room for the new entry the reflector is about to add.
2. **`session-reflector`** — capture this session's learnings as a new
   entry in `.agents/memory/active/`. Adds to the just-pruned active tier.
3. **`evolver` (modify-mode)** — user-global agent. Analyze session
   friction and propose surgical edits to existing agents/skills/prompts.
   Reads the freshly-written reflector entry as one of its signals. Never
   creates new artefacts — that's phase 4's job.
4. **Project-local create-mode evolvers** — each agent matching
   `.claude/agents/*-evolver.md` in CWD. Scans `.agents/memory/active/` for
   friction signals where no existing agent/skill/team fit (capability gap
   hit ≥2 times). Drafts at most ONE new artefact per evolver to
   `.claude/`, logs to `.agents/_evolution_log.jsonl`. Never auto-commits.
   Modify-mode signals are deferred back to phase 3's evolver.
5. **`evolver-meta`** (optional) — user-global agent at
   `~/.claude/agents/evolver-meta.md`. Scores the evolver's prediction
   accuracy from the evolution logs and applies at most one calibration
   edit to `~/.claude/skills/evolution/references/calibration.md` when its
   evidence gate is met (it self-no-ops otherwise). Invoke via the `Agent`
   tool with `subagent_type: "evolver-meta"`. If the agent is not
   installed, skip cleanly with "meta pass skipped".

## Execution protocol

**Failure-isolation guarantee — read this carefully.** Treat each phase as
fully independent. After invoking phase N, do NOT branch on its success or
failure. UNCONDITIONALLY proceed to phase N+1 regardless of what phase N
reported. An exception, a missing skill, a non-zero return, an empty result —
none of these may abort the next phase. Capture the outcome of each phase
and present them all in the final summary.

For each phase, in order:

1. Invoke the phase:
   - Phase 0 (`memory-pending-triage`): first check the skill exists with the
     `Glob` tool, pattern `.claude/skills/memory-pending-triage/SKILL.md`
     (CWD-relative). If it matches, Read that file directly and follow its
     instructions instead of invoking the `Skill` tool by bare name — the same
     shadowing risk phases 1-2 hit applies here too if a user-global
     `memory-pending-triage` skill is ever added (none exists today, but
     Read-direct costs nothing and closes the exposure before it can bite).
     If it does not match, record `"no pending-triage skill in this repo"`
     and move on — that is the expected state, not a failure.
   - Phase 1 (`memory-hygiene`) and phase 2 (`session-reflector`): first check
     for a project-local shadow with the `Glob` tool, pattern
     `.claude/skills/memory-hygiene/SKILL.md` (phase 1) or
     `.claude/skills/session-reflector/SKILL.md` (phase 2), CWD-relative. If
     it matches, Read that file directly and follow its instructions instead
     of invoking the `Skill` tool by bare name — bare-name resolution is not
     guaranteed to prefer a project-local copy over the user-global one even
     when a repo ships both (confirmed 2026-08-16, session
     `2026-08-16-flowchart-renderer-chapter-2`: both phase-1 and phase-2
     `Skill` invocations resolved to the user-global copy in a repo shadowing
     both skills; the workaround was reading the project `SKILL.md` directly
     — phase 0's step above now does the same proactively). If the Glob
     finds no project-local copy, invoke via the `Skill` tool as before.
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
   - **Phase 3 and Phase 4 must run sequentially, never concurrently** —
     both use the `Agent` tool, so it is possible to fire both calls in the
     same message the way independent tool calls normally get batched. Do
     not batch them. Invoke phase 3's `evolver` call, wait for its full
     response, THEN invoke phase 4's create-mode call. Confirmed failure (2026-07-29,
     session `2026-07-29-session-end-wrap-phase3-modify`): running them
     concurrently let phase 3 read phase 4's untracked, still-being-drafted
     skill file as pre-existing committed work and narrow its own proposed
     scope on that false premise.
2. Capture the outcome (success summary or error message). Continue
   regardless.
3. After all phases have been attempted, present a consolidated
   summary to the user:
   - What `memory-pending-triage` did (`N notes read, M facts promoted, N moved
     to pending/indexed/, K left untriaged`) — or the error / "phase skipped, no
     pending-triage skill". Report the leftover count explicitly; a backlog that
     goes unmentioned reads as cleared.
   - What `memory-hygiene` archived (`N moved to long-term/`) — or the error.
   - What `session-reflector` wrote (`active/<filename>.md`) — or the error.
   - What `evolver` proposed (modify diffs, or "no friction detected") — or
     the error.
   - What each project-local create-mode evolver proposed (new draft path +
     rationale, or "no capability gap detected") — or the error / "phase
     skipped, no project-local evolver found".
   - What `evolver-meta` did (calibration edit + predicted outcome, or
     "gate not met — no-op") — or "meta pass skipped".
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
