# Skill Evolution Protocol

This document defines the 4 skill evolution capabilities: improvement, suggestion, audit, and adoption. Each capability has defined trigger conditions, approval requirements, and output format.

---

## Capability 1 — Skill Improvement

**Definition:** Modifying an existing skill's SKILL.md to fix a documented divergence (SKILL_STALE or SKILL_WEAK). The skill exists and is structurally correct; specific sections need updating.

### Trigger Conditions

Apply skill improvement when ALL of the following are true:
- Divergence type is SKILL_STALE or SKILL_WEAK
- Confidence is MEDIUM or HIGH
- Signal is present in 3+ of the last 5 sessions
- The skill is not marked `pinned: true` in its frontmatter
- The proposed edit touches only one section (trigger phrases OR body instructions, not both in the same mutation)

Do NOT apply skill improvement when:
- Divergence type is SKILL_EXTERNAL (flag for human review instead)
- The skill has `pinned: true` in frontmatter
- The proposed change would rewrite more than one paragraph or one list
- Confidence is LOW

### Approval Requirements

| Confidence | Action |
|-----------|--------|
| HIGH | Apply automatically, log to evolution_log.jsonl |
| MEDIUM | Apply automatically, log, flag in report as "applied with medium confidence" |
| LOW | Propose only — do not apply. Add to "Flagged for Human Review" section of evolution report |

### Output Format

```
SKILL IMPROVEMENT APPLIED
Target: skills/[skill-name]/SKILL.md
Section: [section name or frontmatter field]
Divergence: [SKILL_STALE | SKILL_WEAK]
Change summary: [one sentence]
Predicted outcome: [measurable improvement]
Confidence: [MEDIUM | HIGH]
Log entry: _workspace/_evolution_log.jsonl @ [timestamp]
```

### Atomic Write Procedure

1. Read `skills/[skill]/SKILL.md` into memory
2. Apply the minimal edit in memory
3. Write to `skills/[skill]/SKILL.md.tmp`
4. Rename `skills/[skill]/SKILL.md.tmp` to `skills/[skill]/SKILL.md`
5. Append log entry with `status: "PENDING"`

---

## Capability 2 — Skill Suggestion

**Definition:** Proposing a new skill stub when a SKILL_GAP divergence is detected. The suggestion is always subject to human approval before the stub body is completed and the skill is used in production.

### Trigger Conditions

Propose a new skill when ALL of the following are true:
- Divergence type is SKILL_GAP
- The manual pattern repeats in 3+ of the last 5 sessions
- The pattern involves 3 or more sequential steps
- No existing skill covers the pattern (verified by checking all skill descriptions)
- The pattern is stable (same steps across sessions, not just coincidentally similar)

Do NOT propose a new skill when:
- The pattern is present in fewer than 3 sessions
- An existing skill covers the pattern but is not triggering (use improvement instead)
- The pattern involves external services that may be unavailable (SKILL_EXTERNAL)

### Approval Requirements

New skill stubs are ALWAYS flagged for human review before use. The evolver creates the stub file, but the stub body is marked `[TODO: flesh out]` and the skill is not activated until a human or the skill-author agent completes it.

The evolution report must include:

```
NEW SKILL STUB CREATED — REQUIRES HUMAN REVIEW
Skill: skills/[proposed-name]/SKILL.md
Reason: SKILL_GAP — manual pattern repeated [K] sessions
Pattern steps:
  1. [Step 1]
  2. [Step 2]
  3. [Step 3]
Action required: Review the stub, complete the body instructions, and activate.
```

### Stub SKILL.md Template

The evolver creates stubs with this structure:

```
---
name: [skill-name]
description: [1-2 sentences covering the task domain and key trigger phrases]
status: stub
---

# [Skill Name]

> This skill was auto-generated as a stub by the evolver. The body requires human review
> and completion before use.

## When to Trigger

[Trigger phrases observed in sessions — list the actual phrases users used]

## Observed Manual Pattern

The following steps were performed manually across [K] sessions. Use these as a starting
checklist:

1. [Step 1]
2. [Step 2]
3. [Step 3]

## Body Instructions

[TODO: flesh out — document the full workflow, constraints, and edge cases]
```

---

## Capability 3 — Skill Audit

**Definition:** A read-only review of all skills to identify divergences without applying any changes. The audit produces a report but makes no mutations. Used when the operator wants a survey of current skill health before approving improvements.

### Trigger Conditions

Run a skill audit when:
- The operator explicitly requests: "audit skills", "skill health check", "what skills need updating"
- Before the first full evolution pass in a new environment (no prior evolution log)
- After a large batch of skill imports (to check for redundancy or gaps)

### Approval Requirements

Audit is read-only — no approval needed to run. The audit report is output only; no files are modified.

### Output Format

```
## Skill Audit Report — [date]

### Summary
- Total skills examined: N
- Skills with no signal data: N (cannot evaluate)
- Skills flagged: N

### Flagged Skills

| Skill | Divergence Type | Confidence | Recommendation |
|-------|----------------|-----------|---------------|
| [name] | SKILL_STALE | MEDIUM | Update trigger phrases |
| [name] | SKILL_WEAK | HIGH | Add constraint to body |
| [name] | SKILL_EXTERNAL | N/A | Human review — external dependency |
| [name] | — | — | No signal — insufficient data |

### Healthy Skills (no divergence detected)
[List of skill names with 0 divergences across 5 sessions]

### Recommended Next Step
Run full evolution pass to apply [N] HIGH-confidence improvements.
Or: Review and approve [N] MEDIUM-confidence improvements.
```

---

## Capability 4 — Skill Adoption

**Definition:** Tracking whether newly created skill stubs (from Capability 2) are completed by humans and adopted into active use. The evolver monitors stub status across sessions and escalates if stubs remain incomplete.

### Trigger Conditions

Check skill adoption status:
- At the start of every evolution pass (before running the 4 main passes)
- When a stub has been present for 3+ sessions without being activated

### Adoption States

| State | Meaning |
|-------|---------|
| `stub` | Created by evolver, body not yet completed |
| `pending_review` | Human is reviewing — do not mutate |
| `active` | Body completed, skill is in use |
| `rejected` | Human decided not to activate — archive the stub |
| `deprecated` | Skill was active but is no longer needed |

The `status` field in the skill's frontmatter tracks this state.

### Escalation Rules

| Condition | Action |
|-----------|--------|
| Stub is 1-2 sessions old | Note in adoption section of evolution report |
| Stub is 3+ sessions old | Escalate in evolution report: "ACTION REQUIRED — stub has been pending [N] sessions" |
| Stub is 5+ sessions old | Mark as `status: stale_stub` in frontmatter and flag for human decision: activate or reject |
| Stub is rejected | Move file to `skills/_archived/[skill-name]/SKILL.md`, log the rejection |

### Output Format

```
## Skill Adoption Status — [date]

### Active (recently activated)
- [skill-name]: activated [N] sessions ago, first signal data available next session

### Pending Stubs
- [skill-name]: stub created [K] sessions ago — ACTION REQUIRED if K >= 3

### Rejected / Archived
- [skill-name]: rejected on [date], archived at skills/_archived/[skill-name]/

### Adoption Metrics (for skills activated 3+ sessions ago)
- [skill-name]: load_rate [N], abandonment_rate [N] — [HEALTHY | needs improvement]
```

---

## Mutation Cap Enforcement

Skill evolution capabilities share the session mutation cap with agent evolution:

- Maximum 2 skill mutations per session (Capability 1 — improvements only)
- New skill stubs (Capability 2) do NOT count against the mutation cap (they are proposals, not mutations, until a human activates them)
- Skill audit (Capability 3) never counts against the cap (read-only)
- Skill adoption state changes (Capability 4) count as 1 mutation each (they modify frontmatter)

If the cap is reached mid-session:
- Stop applying mutations
- Continue generating proposals for all remaining divergences
- Add all remaining proposals to the "Flagged for Human Review" section of the evolution report

---

## Interaction with Agent Evolution Cap

The combined session cap is:
- 3 agent mutations (agent .md files in roster/)
- 2 skill mutations (SKILL.md files in skills/)

These caps are independent. Using all 3 agent mutations does not reduce the 2 skill mutation slots, and vice versa. Adoption state changes in Capability 4 count against the skill mutation cap.
