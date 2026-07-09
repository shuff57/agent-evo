---
name: evolution
description: Evolution protocol for the evolver agent. Covers divergence classification, hypothesis generation, surgical edit protocol, safety rules, and rollback awareness. Load this skill whenever running agent/skill/routing/config evolution.
---

# Evolution Skill

This skill defines the full protocol the evolver agent follows when analyzing session metrics and proposing improvements to the agent system. It is also the reference for any human operator reviewing or auditing evolution activity.

## When to Trigger

Load this skill when:
- The user says "evolve", "improve agents", "self-improve", "optimize", or "run evolution"
- A session-end hook invokes the evolver agent
- A human operator asks "what would the evolver change?"
- Reviewing or auditing `_workspace/_evolution_log.jsonl`

Do not trigger for:
- General code improvements (use simplify or code-engineer)
- Feature planning (use planner or oracle)
- Debugging individual agent failures (use debugger)

---

## Phase 0 — Data Collection

Before any analysis, load:

1. `~/.claude/skills/evolution/references/calibration.md` — AUTHORITATIVE tunables and learned heuristics (evolver-meta owned). Values there override the inline defaults quoted in this skill (e.g. the 0.25 flag threshold, the confidence rubric session counts).
2. `_workspace/_metrics/summary.jsonl` — read last 5 entries (JSONL, one object per line, sorted by timestamp ascending; take tail 5)
3. `_workspace/_evolution_log.jsonl` — full history
4. `_workspace/_metrics/events.jsonl` — live correction/rephrase/friction events (hook-written; may not exist). Corroborates self-reported counts.

**Path pinning (required):** every `_workspace/...` path above resolves relative to the current session's working directory — the project checkout or worktree the invoking session was started in — never a cached, user-global, or other-repo location. This applies even when that working directory is a git worktree rather than the project's primary clone. If a mutated agent/skill/config's home repo differs from the data-source project, state both paths explicitly in the report rather than silently assuming one root. Confirmed failure mode (2026-07-04): a pass resolved `_workspace/` to the user-global agent-evo checkout instead of the invoking bookSHelf worktree and incorrectly reported "insufficient data."

Key metric fields to extract per session entry:
- `agent_id` — which agent handled the task
- `task_success` — boolean or score
- `rephrase_count` — how many times user reworded the same request
- `correction_count` — how many times user corrected the output
- `agent_switches` — list of agents the user manually switched to mid-task
- `skill_loads` — which skills were loaded, in order
- `manual_repetitions` — patterns the user performed manually 3+ times

If `summary.jsonl` does not exist or has fewer than 2 entries, output:

```
Insufficient data for evolution. Need at least 2 sessions in _workspace/_metrics/summary.jsonl.
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

Threshold for flagging: any signal >= 0.25 across 3+ sessions triggers classification.

---

## Phase 2 — Divergence Classification

For each flagged agent or skill, assign exactly one divergence type. When multiple types fit, prefer the most specific.

| Code | Signal Pattern |
|------|---------------|
| STALE | High rephrase_rate — user words don't match description triggers |
| INCOMPLETE | Correct agent selected but task partially fails or requires a second pass |
| MISLEADING | Wrong agent selected initially, user switches to correct one |
| INEFFICIENT | Task succeeds but agent_switches > 0 before final success, or extra hops |
| STRUCTURAL | Agent succeeds at task but always must delegate what it could own |
| SKILL_GAP | Repeated manual pattern with no matching skill; 3+ sessions |
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

Confidence rubric:
- HIGH: signal present in 5/5 sessions, same divergence type each time
- MEDIUM: signal present in 3-4/5 sessions, same divergence type
- LOW: signal present in 1-2 sessions, or divergence type varies

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
| SKILL_GAP | create new SKILL.md stub |
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
- New skill stubs: SKILL.md with frontmatter + "When to Trigger" section only — leave body as `[TODO: flesh out]`

### Step 3 — Model-Agnostic Check

Before finalizing any proposed edit, verify:
- The new prompt language contains no model-specific assumptions (no "as Claude", no "use your extended context", no capability-specific instructions)
- The same instruction would work correctly on a low-cost model (e.g., gemini-3-flash)
- If the edit only works on a high-capability model, flag it for human review instead of applying

### Step 4 — Write Atomically

```
1. Read target file to string
2. Apply edit in memory
3. Write to <target>.tmp
4. Rename <target>.tmp to <target>
5. Append log entry to _workspace/_evolution_log.jsonl
```

Never write directly to the target file in one step — always use the tmp-then-rename pattern to avoid partial writes.

---

## Phase 5 — Prior Evolution Reconciliation

For each entry in `_evolution_log.jsonl` with `status: "PENDING"`:

1. Check if enough sessions have passed to observe the predicted outcome (minimum 2 sessions post-mutation)
2. Compare predicted_outcome to current signals for the mutated agent/skill
3. Update the log entry:
   - `status: "VALIDATED"` if signal improved as predicted
   - `status: "MISSED"` if signal did not improve or worsened
   - `status: "INSUFFICIENT_DATA"` if fewer than 2 sessions post-mutation
4. For MISSED entries: classify the prediction failure and generate a revised hypothesis

---

## Safety Rules

| Rule | Detail |
|------|--------|
| No self-modification | Never edit `roster/evolver.md` |
| No meta-domain edits | Never edit `evolver-meta.md` or `skills/evolution/references/calibration.md` — calibration is written only by evolver-meta |
| No plugin edits | Never edit `.ts` or `.js` files |
| No pinned edits | Never edit files with `pinned: true` in frontmatter |
| No Tier-3 edits | Never edit files with `tier: 3` in frontmatter |
| Mutation caps | Max 3 agent mutations + 2 skill mutations per session |
| Model-agnostic | All edits must work on cheap models, not just Claude |
| LOW confidence | Propose but do not apply — flag for human review |
| SKILL_EXTERNAL | Flag only — do not mutate |
| Atomic writes | Always write to .tmp then rename |
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
3. Wait for the next session to validate the revised hypothesis has LOW confidence before proposing a new mutation
