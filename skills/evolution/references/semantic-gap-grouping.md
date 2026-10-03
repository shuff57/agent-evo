# Semantic gap grouping (SKILL_GAP / create-mode)

Adapted from claude-reflect's /reflect-skills (BayramAnnakov/claude-reflect, MIT).
Used when counting recurrences for SKILL_GAP and by the global-evolver.

Count a gap by **intent, not wording**. These are one pattern, not three:
"run evolution" / "improve the agents" / "self-improve this session".

Recurrence comes in two kinds:
- **Workflow**: the same multi-step sequence requested repeatedly, however it is phrased.
- **Misunderstanding**: the same correction recurring. When a skill already covers the
  task, this is SKILL_WEAK on that skill, not SKILL_GAP (SKILL_GAP requires that no skill
  exists; see Classification Priority in `divergence-types.md`).

Rules:
- Reason about meaning; do not group by keyword or regex matching.
- Each grouped occurrence still needs its own evidence (session id + snippet). Grouping
  changes how occurrences are counted, not how many are required; `calibration.md`
  thresholds apply.
