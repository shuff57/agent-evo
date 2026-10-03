---
name: evolution
description: This skill should be used when the evolver agent runs agent, skill, routing or config evolution, or when the user says "run evolution", "evolve", "improve agents" or "self-improve". It covers divergence classification, hypothesis templates, the surgical edit protocol, safety rules, calibration thresholds and rollback.
---

# Evolution Skill

This skill defines the protocol the evolver agent follows when analyzing session metrics and proposing improvements to the agent system.

Single-source rule: `SKILL.md` owns the procedure (write method, approval, caps, stub handling). `references/calibration.md` owns every tunable number (flag threshold, session counts, confidence bars). Reference files point back here or to a calibration key; they do not restate numbers.

## When to Trigger

Load this skill when:
- The user says "evolve", "improve agents", "self-improve", or "run evolution"
- A session-end hook invokes the evolver agent
- A human operator asks "what would the evolver change?"
- Reviewing or auditing `_workspace/_evolution_log.jsonl`

Do not trigger for:
- General code improvements (use simplify or `task(category="quick")`)
- Feature planning (use `prometheus` or `oracle`)
- Debugging a single agent failure (that is a debugging task, not an evolution pass)

---

## Phase 0 — Data Collection

Before any analysis, load:

1. `~/.claude/skills/evolution/references/calibration.md` — AUTHORITATIVE tunables and learned heuristics (evolver-meta owned). Its values win over anything stated elsewhere (flag threshold, session counts, confidence bars).
2. `_workspace/_metrics/summary.jsonl` — read last 5 entries (JSONL, one object per line, sorted by timestamp ascending; take tail 5)
3. `_workspace/_evolution_log.jsonl` — full history
4. `_workspace/_metrics/events.jsonl` — live correction/rephrase/friction events (hook-written; may not exist). Corroborates self-reported counts.

**Path pinning (required):** every `_workspace/...` path above resolves relative to the current session's working directory — the project checkout or worktree the invoking session was started in — never a cached, user-global, or other-repo location. This holds for git worktrees too. If a mutated agent/skill/config's home repo differs from the data-source project, state both paths explicitly in the report rather than silently assuming one root. (Seen once: a pass read the user-global agent-evo checkout instead of the invoking worktree and wrongly reported "insufficient data".)

Key metric fields to extract per session entry:
- `agent_id` — which agent handled the task
- `task_success` — boolean or score
- `rephrase_count` — how many times user reworded the same request
- `correction_count` — how many times user corrected the output
- `agent_switches` — list of agents the user manually switched to mid-task
- `skill_loads` — which skills were loaded, in order
- `manual_repetitions` — patterns the user performed manually 3+ times

If `summary.jsonl` does not exist or has fewer than `min_entries_for_run` entries (`calibration.md`), output:

```
Insufficient data for evolution. Need at least <min_entries_for_run> sessions in _workspace/_metrics/summary.jsonl.
```

And stop. Do not propose mutations based on a single session.

---

## Phase 1 — Signal Extraction

For each agent and skill referenced across the 5 sessions, compute:

| Signal | Definition |
|--------|-----------|
| rephrase_rate | rephrase_count / tasks_handled |
| correction_rate | correction_count / tasks_handled |
| switch_rate | agent_switches_away / tasks_handled |
| skill_abandonment | skill loaded but task still failed or switched |
| load_co_occurrence | pairs of skills always loaded together |
| manual_pattern_frequency | count of repeated manual actions matching a pattern |

Reference signal taxonomy: `skills/evolution/references/signal-taxonomy.md`

When counting `manual_pattern_frequency` or SKILL_GAP recurrences, group by intent, not wording: `skills/evolution/references/semantic-gap-grouping.md`.

Flag a signal when it meets `signal_flag_threshold` across `min_sessions_for_flag` sessions (both in `calibration.md`); that triggers classification.

---

## Phase 2 — Divergence Classification

For each flagged agent or skill, assign exactly one divergence type. When several fit, use the Classification Priority order in `skills/evolution/references/divergence-types.md`.

| Code | Signal Pattern |
|------|---------------|
| STALE | High rephrase_rate — user words don't match description triggers |
| INCOMPLETE | Correct agent selected but task partially fails or requires a second pass |
| MISLEADING | Wrong agent selected initially, user switches to correct one |
| INEFFICIENT | Task succeeds but agent_switches > 0 before final success, or extra hops |
| STRUCTURAL | Agent attempts work it should delegate (no delegation rule covers it) |
| SKILL_GAP | Repeated manual pattern with no matching skill |
| SKILL_STALE | Skill loads but trigger condition no longer matches actual invocations |
| SKILL_WEAK | Skill loads, task begins, but user corrects or abandons mid-skill |
| SKILL_EXTERNAL | Skill failure correlates with external service unavailability |

Full definitions with examples: `skills/evolution/references/divergence-types.md`

---

## Phase 3 — Hypothesis Generation

For each classified divergence, generate a hypothesis using the appropriate template.

General structure:

```
OBSERVATION: [quantified signal — e.g., "rephrase_rate 0.4 across 4 of 5 sessions for agent X"]
DIVERGENCE TYPE: [code]
HYPOTHESIS: [specific mechanism — e.g., "description says 'API docs' but users are asking about SDK usage, which is adjacent but not covered by current trigger phrases"]
PROPOSED EDIT: [section identifier + minimal diff]
PREDICTED OUTCOME: [measurable — e.g., "rephrase_rate drops below 0.1 within 2 sessions"]
CONFIDENCE: [LOW | MEDIUM | HIGH]
```

Confidence rubric (counts come from `calibration.md`: `confidence_high_sessions`, `confidence_medium_sessions`):
- HIGH: same-type signal in at least `confidence_high_sessions` of the last 5 sessions
- MEDIUM: same-type signal in at least `confidence_medium_sessions` of the last 5
- LOW: fewer than that, or the divergence type varies

A second, corroborating signal type for the same target may raise the level by one (see Signal Aggregation Rules in `signal-taxonomy.md`); a single signal never does.

Skill creation and edits to existing skills carry an extra gate on top of this rubric, stated in `skill-evolution-protocol.md`.

Templates: `skills/evolution/references/hypothesis-templates.md`

---

## Phase 4 — Surgical Edit Protocol

For each MEDIUM or HIGH confidence divergence:

### Step 1 — Identify Section

Map divergence type to the file section most likely responsible:

| Divergence | Target Section |
|-----------|---------------|
| STALE | frontmatter `description` field |
| INCOMPLETE | trigger phrase list in description or body |
| MISLEADING | description — differentiate from overlapping agents |
| INEFFICIENT | delegation rules or step ordering in body |
| STRUCTURAL | add delegation rule to body |
| SKILL_GAP | extend an existing skill first (add a `references/*.md` + pointer line) if one fits the gap; only create a new `skills/<name>/SKILL.md` when none does |
| SKILL_STALE | `description` or "When to Trigger" section of SKILL.md |
| SKILL_WEAK | body instructions of SKILL.md |
| SKILL_EXTERNAL | flag only — do not edit |

### Step 2 — Propose Minimal Change

Rules for minimal edits:
- Change only the identified section
- Never rewrite a full agent or skill from scratch
- Add trigger phrases by appending to the existing list — do not replace
- Remove trigger phrases only if they are demonstrably wrong
- Body edits: change one paragraph or add one rule at most
- Prefer extending an existing skill over a new top-level folder (see SKILL_GAP). Only mint a new skill when nothing fits.
- New skill stubs: use the stub template in `skill-evolution-protocol.md` (Capability 2). Its Capability 4 ladder governs how long a stub may sit unfinished.
- Consolidated skills (a `SKILL.md` + `references/`): edit the relevant reference file and update the pointer line — never add a parallel top-level folder for a sub-capability.
- SKILL_WEAK apply step: `skills/evolution/references/skill-weak-apply.md`.

### Step 3 — Model-Agnostic Check

Before finalizing any proposed edit, verify:
- The new prompt language contains no model-specific assumptions (no "as Claude", no "use your extended context", no capability-specific instructions)
- The same instruction would work correctly on a low-cost model (e.g., gemini-3-flash)
- If the edit only works on a high-capability model, flag it for human review instead of applying

### Step 4 — Write, Then Verify

```
1. Read the target file
2. Apply the change with the Edit tool (Write only to create a new file, e.g. a stub)
3. Re-read the changed region and confirm the text actually differs
4. Append log entry to _workspace/_evolution_log.jsonl
```

Item 3 (the re-read) is mandatory. A success message from the write step is not evidence the file changed; log rows have been reported as reconciled while still `PENDING` at the field level. Report counts from the re-read only.

Use `Edit` in place, never write-to-`.tmp`-then-rename. `Edit` fails loudly when `old_string` no longer matches, which catches a target that changed underneath you; a blind rename would clobber it.

---

## Phase 5 — Prior Evolution Reconciliation

For each entry in `_evolution_log.jsonl` with a `predicted_outcome`, no `actual_outcome`, and `status` of `PENDING`, `APPLIED` or `MONITORING` (in practice mutations are logged as `APPLIED`/`MONITORING`, so scanning only `PENDING` misses them):

1. Check whether enough domain-relevant sessions have passed (`min_sessions_post_mutation` in `calibration.md`; heuristics 3-6 there refine the window). Run `python ~/.claude/skills/evolution/scripts/prediction_status.py` to get the count for every PENDING row at once; it assigns no verdicts
2. Compare predicted_outcome to current signals for the mutated agent/skill
3. Update the log entry:
   - `status: "VALIDATED"` if signal improved as predicted
   - `status: "MISSED"` if signal did not improve or worsened
   - `status: "INSUFFICIENT_DATA"` if the window has not elapsed
4. For MISSED entries: classify the prediction failure and generate a revised hypothesis

---

## Safety Rules

| Rule | Detail |
|------|--------|
| No self-modification | Never edit `roster/evolver.md` |
| No meta-domain edits | Never edit `evolver-meta.md` or `skills/evolution/references/calibration.md` — calibration is written only by evolver-meta |
| No plugin edits | Never edit `.ts` or `.js` files |
| No pinned edits | Never edit files with `pinned: true` in frontmatter |
| Flat-only skills | Never create `<group>/<name>/SKILL.md` — the loader is flat; nested skills are NOT discovered. New skills → `skills/<name>/SKILL.md`; sub-capabilities → `skills/<name>/references/*.md` + a pointer line in that SKILL.md. Sole exception: `skills/_archived/<name>/` holds rejected stubs and is intentionally not discovered |
| Stub hygiene | A skill folder with no `SKILL.md`, or a stub body still `[TODO]`, follows the Capability 4 escalation ladder in `skill-evolution-protocol.md` (note, then ACTION REQUIRED, then `stale_stub`). A stub with no frontmatter to carry an age is flagged for removal directly. Don't let empty stubs accrete |
| No Tier-3 edits | Never edit files with `tier: 3` in frontmatter |
| Mutation caps | Max 3 agent mutations + 2 skill mutations per session. Skill improvements and adoption state changes count; new stubs and audits do not (see `skill-evolution-protocol.md`) |
| Model-agnostic | All edits must work on cheap models, not just Claude |
| LOW confidence | Propose but do not apply — flag for human review |
| SKILL_EXTERNAL | Flag only — do not mutate |
| Verify every write | Edit in place, then re-read and confirm the text changed. The write tool's success message is not evidence (Phase 4, Step 4) |
| Log everything | Every mutation (applied or proposed) goes in evolution_log.jsonl |

---

## Rollback Awareness

The evolution log is the rollback mechanism. To undo a mutation:

1. Find the log entry by timestamp and target path
2. The original content is not stored in the log — check git history
3. If the repo has git: `git show HEAD~N:<path>` to recover previous version
4. If no git: the operator must restore manually — log entries include `edit_summary` to guide reconstruction

For this reason: always commit or checkpoint before running evolution in a production environment.

When a MISSED outcome is detected, do not immediately apply a counter-mutation. Instead:
1. Log the miss
2. Generate a revised hypothesis
3. Treat the revised hypothesis as LOW confidence: propose it, and apply nothing until a later session lifts it past the Phase 3 rubric
