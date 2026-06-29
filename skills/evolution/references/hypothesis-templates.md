# Hypothesis Templates

Templates for generating evolution hypotheses. Each template maps an observed signal pattern to a structured hypothesis, proposed change, and predicted outcome. Select the template matching the divergence type.

---

## Template: STALE

**Use when:** rephrase_rate >= 0.25 across 3+ sessions; correct agent handles task but routing fails first.

```
OBSERVATION: [Agent X] has rephrase_rate [N] across [K] of 5 sessions. Users successfully
  complete tasks with this agent after rephrasing, but initial routing fails. Common failed
  phrases: [list 2-3 example phrases from session logs].

DIVERGENCE TYPE: STALE

HYPOTHESIS: The description currently says "[current description excerpt]". This no longer
  covers the primary use cases. Users are asking about [observed topic/phrasing] which is
  absent from the trigger phrase list. The agent handles these correctly — only the routing
  metadata is outdated.

PROPOSED EDIT:
  File: roster/[agent].md
  Section: frontmatter `description` field
  Change: Append to trigger phrase list: "[new phrase 1]", "[new phrase 2]"
  Or: Replace "[outdated phrase]" with "[updated phrase that covers observed usage]"

PREDICTED OUTCOME: rephrase_rate for [agent X] drops below 0.1 within 2 sessions.
  Users no longer need to manually invoke [agent X] by name.

CONFIDENCE: [HIGH if 5/5 sessions | MEDIUM if 3-4/5 | LOW if 1-2/5]
```

---

## Template: INCOMPLETE

**Use when:** Correct agent is selected for core case but fails on a specific variant; partial task completion pattern.

```
OBSERVATION: [Agent X] handles [core task type] with correction_rate [N1], but the variant
  "[specific variant]" has correction_rate [N2] across [K] sessions. The agent is selected
  correctly but produces incomplete output for this variant.

DIVERGENCE TYPE: INCOMPLETE

HYPOTHESIS: The agent's description lists [covered cases] but does not include [missing
  variant]. When invoked for this variant, the agent attempts it but lacks explicit
  instruction for [specific step or constraint]. This causes partial output requiring
  user correction.

PROPOSED EDIT:
  File: roster/[agent].md or skills/[skill]/SKILL.md
  Section: trigger phrase list OR body section "[relevant section name]"
  Change: Add trigger phrase "[new phrase]" to description.
  Add step: "[specific missing step or constraint]" to the relevant body section.

PREDICTED OUTCOME: correction_rate for [variant] drops to match core case rate ([N1])
  within 2 sessions.

CONFIDENCE: [HIGH | MEDIUM | LOW]
```

---

## Template: MISLEADING

**Use when:** Wrong agent is selected; user switches to a consistent destination agent.

```
OBSERVATION: Users are routed to [agent X] for "[task description]" tasks, then switch to
  [agent Y] in [K] of 5 sessions. Agent X is not wrong — it is simply not the right
  specialist. The switch destination is consistent: always [agent Y].

DIVERGENCE TYPE: MISLEADING

HYPOTHESIS: [Agent X]'s description contains the phrase "[overlapping phrase]" which
  matches "[task description]" queries. However, [agent Y] is the correct specialist
  because [specific reason — e.g., "it has step-by-step planning instructions that
  agent X lacks"]. The descriptions do not differentiate between these agents' scopes
  for this task type.

PROPOSED EDIT:
  File: roster/[agent X].md
  Section: frontmatter `description` field
  Change: Add differentiator sentence: "For [task description], use [agent Y] instead."

PREDICTED OUTCOME: switch_rate from [agent X] to [agent Y] for "[task description]" drops
  to 0 within 2 sessions. [Agent Y] is selected directly.

CONFIDENCE: [HIGH | MEDIUM | LOW]
```

---

## Template: INEFFICIENT

**Use when:** Task succeeds but agent_switches_before_success > 0, or extra hops are consistent.

```
OBSERVATION: "[Task type]" tasks succeed with [agent X] as final handler, but involve
  [N] intermediate agent hops in [K] of 5 sessions. The hop sequence is: [agent A] ->
  [agent B] -> [agent X]. No corrections are needed once [agent X] handles the task.

DIVERGENCE TYPE: INEFFICIENT

HYPOTHESIS: [Agent A] is selected first because "[routing reason — e.g., task is phrased
  as a question and agent A handles questions broadly]". Agent A then delegates to agent B,
  which delegates to agent X. The routing config or delegation rules do not short-circuit
  this chain. [Agent X] could be reached directly if the routing rule for "[trigger phrase]"
  pointed to it.

PROPOSED EDIT:
  File: roster/agent-chain.yaml (or roster/[agent A].md delegation rules)
  Section: routing rule for "[trigger phrase pattern]"
  Change: Add direct route from "[trigger phrase pattern]" to [agent X].
  Or: Add delegation shortcut in [agent A]: "For [specific subtask], delegate directly
    to [agent X] without passing through [agent B]."

PREDICTED OUTCOME: "[Task type]" tasks reach [agent X] in 1 hop instead of [N] hops.
  Session duration for this task type decreases by approximately [estimated time savings].

CONFIDENCE: [HIGH | MEDIUM | LOW]
```

---

## Template: STRUCTURAL

**Use when:** Agent attempts a task it should delegate; correction_rate elevated for adjacent task type.

```
OBSERVATION: [Agent X] has correction_rate [N1] for its core tasks, but correction_rate
  [N2] for "[adjacent task type]" tasks. When the user manually routes "[adjacent task type]"
  to [agent Y], correction_rate is [N3 << N2].

DIVERGENCE TYPE: STRUCTURAL

HYPOTHESIS: [Agent X] handles "[adjacent task type]" when it arises in context because
  the task is related to its domain. However, [agent Y] has specialized instructions for
  this task type that [agent X] lacks. [Agent X] needs a delegation rule to hand off
  "[adjacent task type]" to [agent Y].

PROPOSED EDIT:
  File: roster/[agent X].md
  Section: body — add "Delegation" or "When to Delegate" section
  Change: Add rule: "For [adjacent task type], delegate to [agent Y]."

PREDICTED OUTCOME: correction_rate for "[adjacent task type]" when originating from
  [agent X] drops to match [agent Y]'s rate ([N3]) within 2 sessions.

CONFIDENCE: [HIGH | MEDIUM | LOW]
```

---

## Template: SKILL_GAP

**Use when:** Manual pattern repeats 3+ sessions with no skill coverage.

```
OBSERVATION: Across [K] sessions, users perform the following manual sequence:
  1. [Step 1]
  2. [Step 2]
  3. [Step 3]
  [+ any additional steps]
  This sequence appears in sessions [list session IDs or dates]. No skill load event
  precedes this pattern.

DIVERGENCE TYPE: SKILL_GAP

HYPOTHESIS: This is a repeating workflow with no corresponding skill. Users execute
  it manually each time because no skill exists to guide or automate it. The pattern
  is stable enough ([K] sessions, same steps) to justify creating a skill stub.

PROPOSED EDIT:
  Action: Create new skill stub
  File: skills/[proposed-skill-name]/SKILL.md
  Content: frontmatter (name, description) + "When to Trigger" section.
  Body: [TODO: flesh out — document the observed manual steps as a starting checklist]
  NOTE: This is a stub only. A human should review and complete the skill body before
    it is used in production.

PREDICTED OUTCOME: manual_pattern_frequency for this sequence drops to 0 within 3 sessions
  as the skill auto-loads and guides the workflow.

CONFIDENCE: [HIGH if K >= 4 | MEDIUM if K = 3 | LOW if K < 3]
```

---

## Template: SKILL_STALE

**Use when:** Skill exists and works when loaded, but rephrase_rate is high for new invocation phrasings.

```
OBSERVATION: Skill [skill name] has skill_abandonment rate [N1] (low — it works when loaded)
  but users are not triggering it with newer phrasings. Observed unmatched phrases across
  [K] sessions: "[phrase 1]", "[phrase 2]", "[phrase 3]".

DIVERGENCE TYPE: SKILL_STALE

HYPOTHESIS: The skill's "When to Trigger" section lists older phrasings: "[current triggers]".
  Users have shifted to more natural-language variants that don't match these patterns.
  The skill works correctly — its trigger metadata is outdated.

PROPOSED EDIT:
  File: skills/[skill]/SKILL.md
  Section: frontmatter `description` or "When to Trigger" section
  Change: Append observed unmatched phrases to the trigger list.
  Do not remove existing triggers — only add.

PREDICTED OUTCOME: Auto-load rate for [skill name] increases. rephrase_rate for this
  skill's task domain drops below 0.1 within 2 sessions.

CONFIDENCE: [HIGH | MEDIUM | LOW]
```

---

## Template: SKILL_WEAK

**Use when:** Skill loads correctly but correction_count is elevated during skill-active windows.

```
OBSERVATION: Skill [skill name] loads correctly for its trigger conditions (no routing
  issues). However, correction_count during skill-active task windows is [N] across
  [K] sessions. Users consistently add: "[recurring correction phrase — e.g., 'don't
  forget to handle X']" after skill load.

DIVERGENCE TYPE: SKILL_WEAK

HYPOTHESIS: The skill's body instructions are missing [specific step or constraint].
  The agent executes the skill's instructions but then fails at [specific failure point]
  because the skill does not mention it. This is a systematic gap, not a one-time error.

PROPOSED EDIT:
  File: skills/[skill]/SKILL.md
  Section: body — [specific section name, or "Common Pitfalls" / "Critical Constraints"]
  Change: Add: "[specific missing step or constraint]"
  Keep the edit to one paragraph or one bullet point. Do not rewrite the section.

PREDICTED OUTCOME: correction_count during skill-active windows drops to below 0.1 per
  session within 2 sessions. Users no longer need to add "[recurring correction phrase]".

CONFIDENCE: [HIGH | MEDIUM | LOW]
```

---

## Confidence Calibration Reference

| Confidence | Criteria |
|-----------|---------|
| HIGH | Signal present in 5/5 analyzed sessions. Same divergence type each time. Pattern is identical or near-identical across sessions. |
| MEDIUM | Signal present in 3-4/5 sessions. Same divergence type. Minor variation in pattern (different phrasings of same underlying issue). |
| LOW | Signal present in 1-2 sessions. Or: divergence type varies across sessions. Or: signal is present but weak (rate < 0.15). |

LOW confidence: output the proposal, do not apply the mutation. Mark as "FLAGGED FOR HUMAN REVIEW."
