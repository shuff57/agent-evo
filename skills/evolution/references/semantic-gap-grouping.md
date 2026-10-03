# Semantic gap grouping (SKILL_GAP / create-mode)

Adapted from claude-reflect's /reflect-skills (BayramAnnakov/claude-reflect, MIT).
Used by SKILL_GAP detection and by the global-evolver when counting recurrences.

Count a gap by **intent, not wording**. These are one pattern, not three:
"search for X on linkedin" / "find X's linkedin profile" / "lookup X on linkedin".

Group three kinds of recurrence:
- **Workflow**: the same multi-step sequence requested repeatedly.
- **Misunderstanding**: the same correction recurring (candidate guardrail on an existing skill, not a new one).
- **Prompt sequence**: similar intents phrased differently.

Rules:
- Reason about meaning; do not rely on keyword or regex matching to group.
- Each grouped recurrence still needs its own evidence (session id + snippet). Grouping
  changes how occurrences are counted, not how many are required (calibration.md thresholds apply).
- A recurring misunderstanding maps to SKILL_WEAK on the active skill before SKILL_GAP.
