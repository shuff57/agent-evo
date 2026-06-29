# Signal Taxonomy — Implicit User Feedback

This reference defines how to detect and interpret implicit user feedback from session metrics. These signals are never explicit ("this agent was wrong") — they must be inferred from behavioral patterns. The evolver uses these signals to classify divergences and generate hypotheses.

---

## 1. Rephrase Detection

**What it is:** The user submits a request, receives a result that misses the intent (or routes to the wrong agent), and submits a reworded version of the same request.

**How to detect in metrics:**
- `rephrase_count > 0` in a session entry
- In transcript data: two consecutive user messages where the second starts with "I meant...", "Actually...", "No,", "Try again but...", or rephrases the same noun/verb pattern
- Agent is the same on both attempts, OR changes on the second attempt

**What it signals:**
- Same agent, same outcome: the agent is misunderstanding the task (INCOMPLETE or SKILL_WEAK)
- Same agent, better outcome: the description was STALE (routing description did not match; user had to find magic words)
- Different agent on second attempt: the first agent's description was MISLEADING

**Rephrase rate formula:**
```
rephrase_rate = rephrase_count / total_tasks_for_agent
```

**Threshold:** rephrase_rate >= 0.25 across 3+ sessions = classify divergence.

**False positive risk:** Single-session spikes may reflect user unfamiliarity rather than agent description problems. Require 3+ sessions before acting.

---

## 2. Correction Detection

**What it is:** The user receives output from an agent or skill, and then immediately submits a correction or supplement rather than continuing to a new task.

**How to detect:**
- `correction_count > 0` in session entry
- In transcript: user message immediately after agent output contains "actually", "not quite", "missing", "also add", "don't forget", "fix the", or explicit re-statement of a requirement
- The correction is substantive (not stylistic formatting)

**Types of corrections:**

| Type | Pattern | Signal |
|------|---------|--------|
| Replacement | "No, instead do Y" | MISLEADING or STALE — wrong approach |
| Addition | "Also do X" | INCOMPLETE or SKILL_WEAK — step was missing |
| Constraint | "Don't do X" | INCOMPLETE — agent is overstepping |
| Repeat | "I already said to do X" | SKILL_WEAK — agent ignored instruction |

**Correction rate formula:**
```
correction_rate = correction_count / tasks_completed_by_agent
```

**Threshold:** correction_rate >= 0.20 for a specific task type across 3+ sessions = classify divergence.

**Distinguish from normal iteration:** Some tasks are naturally iterative (creative writing, design). Corrections on those tasks are expected and do not indicate a divergence unless the correction is about a consistent omission.

---

## 3. Agent Switch Detection

**What it is:** The user starts a task with one agent and manually routes to a different agent mid-task. The second agent successfully completes what the first agent started or failed at.

**How to detect:**
- `agent_switches` array in session entry contains entries where `from` and `to` fields differ
- Switches where `task_completed = true` at the destination agent

**Switch patterns and their signals:**

| Pattern | Signal |
|---------|--------|
| A -> B, consistent across sessions | A's description is MISLEADING for the task type that triggers the switch |
| A -> B -> C, consistent chain | Routing is INEFFICIENT — A delegates to B which delegates to C; should route directly to C |
| A -> B, task fails at both | STRUCTURAL gap — neither agent has what's needed; possible SKILL_GAP |
| A -> A (re-invoke with different phrasing) | STALE — user had to rephrase to re-trigger the same agent |

**Switch rate formula:**
```
switch_rate = switches_away_from_agent / tasks_started_with_agent
```

**Threshold:** switch_rate >= 0.20 from a specific source agent across 3+ sessions = classify divergence.

**Important:** Track switch destination. If the destination varies randomly, the source agent may have a general quality problem (SKILL_WEAK). If the destination is consistent, the source agent is MISLEADING for that task type.

---

## 4. Skill Load Patterns

**What it is:** Which skills are loaded, in what order, how often, and whether they correlate with task success or abandonment.

**Key metrics to extract:**

| Metric | Formula | Signal |
|--------|---------|--------|
| skill_load_rate | times loaded / sessions where relevant task occurred | Low = skill not auto-triggering (SKILL_STALE) |
| skill_abandonment_rate | tasks that load skill then fail or switch / times skill loaded | High = skill body insufficient (SKILL_WEAK) |
| skill_co_load_rate | sessions where skill A and skill B both load / total sessions | High co-load = potential skill merge or dependency gap |
| manual_skill_invocation_rate | times user explicitly names skill / total skill loads | High = skill is not auto-triggering (SKILL_STALE) |

**Load co-occurrence patterns:**

When two skills are loaded together in 4+ of 5 sessions for the same task type, consider:
- Do the skills cover adjacent parts of the same workflow? Indicates a SKILL_GAP — the workflow needs a unifying skill.
- Is one skill a prerequisite for the other that is not documented? SKILL_WEAK — the dependent skill should mention the prerequisite.

**Skill abandonment definition:**
A skill is "abandoned" when: the skill is loaded, the agent begins executing skill instructions, and then either:
- The user manually interrupts and rephrases
- The user switches agents
- The task ends without the expected output

---

## 5. Repeated Manual Patterns

**What it is:** The user performs the same multi-step sequence manually, without using an agent or skill, across multiple sessions.

**How to detect:**
- `manual_repetitions` array in session entry contains a pattern description
- Same pattern entry (or structurally identical pattern) appears in 3+ session entries

**What constitutes a pattern:**
- 3 or more sequential steps
- Same logical order each time (minor variation in details is fine — e.g., different filenames in the same file-read-edit-save pattern)
- Not preceded by a skill load event for that workflow

**Pattern richness signals:**

| Pattern Richness | Signal |
|-----------------|--------|
| Simple (2 steps) | Too simple for a skill; likely intentional manual control |
| Medium (3-5 steps) | SKILL_GAP candidate if it repeats 3+ sessions |
| Complex (6+ steps) | Strong SKILL_GAP signal; prioritize for skill stub |
| Varies significantly between sessions | Not a stable pattern; do not act yet |

**Documenting a manual pattern for the hypothesis:**
List steps explicitly in the hypothesis template. The evolver uses these steps as the starting checklist for the new skill stub body.

---

## 6. Absence Signals

Signals from what does NOT happen are as valuable as signals from what does.

| Absence | Signal |
|---------|--------|
| A skill exists but is never loaded across 5 sessions | SKILL_STALE (trigger conditions do not match) or the skill domain is simply not needed — check if any related tasks occurred |
| An agent is never selected despite having a matching domain | MISLEADING or STALE — another agent's description is capturing all the traffic |
| A skill is always loaded but task success is unchanged vs. sessions without it | SKILL_WEAK — the skill is adding no value |
| No agent switches for a given agent across 5 sessions | Healthy signal — no divergence for that agent |

---

## Signal Aggregation Rules

When combining signals to determine confidence for a hypothesis:

1. **Weight by recency** — signals from the most recent session count 1.5x. Systems evolve; old signals may reflect old problems already fixed.

2. **Require consistency** — a signal that appears in 3 sessions but disappears in sessions 4 and 5 may indicate a self-corrected issue. Do not act on it; add a note that it may be recovering.

3. **Cross-reference multiple signals** — a single signal type (e.g., rephrase_rate alone) with HIGH rate is MEDIUM confidence. Two corroborating signal types (rephrase_rate + switch_rate) for the same agent is HIGH confidence.

4. **Separate task types** — do not average correction_rate across all tasks for an agent. Compute it per task type. An agent can be excellent at its core tasks and INCOMPLETE for a specific edge case.
