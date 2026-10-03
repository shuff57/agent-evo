# SKILL_WEAK apply step

Adapted from skillsmith (HarshMehta112/skillsmith, MIT). Used when a SKILL_WEAK
mutation is MEDIUM/HIGH confidence and about to be applied. The evolver runs
unattended, so nothing here waits for a person: approval happens when the operator
reviews the report and the commit.

1. **Attribute per skill.** List every skill active in the evidence sessions. Tie each
   correction to the specific skill active when it happened. If a correction cannot be
   tied to one skill with confidence, drop it. Never merge lessons across skills.
2. **Durable only.** Ignore one-off task details. A skill with no durable correction gets
   no edit; report "no change" instead of fabricating one.
3. **Name the check.** The edit must state (a) a structural trigger and (b) an exact,
   per-item pass/fail check, per the (a)/(b) test in `calibration.md` heuristic 1.
   A prose pointer alone does not qualify.
4. **Tighten before adding.** Prefer sharpening an existing rule over appending a new one.
   If a new rule contradicts an existing one, flag the conflict in the report and do not
   apply that edit.
5. **Report the diff.** Put the exact old -> new text for each skill in the evolver report,
   one block per skill, and record an `edit_summary` in the evolution log so the edit is
   one revert.

Still bound by SKILL.md Phase 4 (one paragraph or one rule per body edit) and the Safety Rules.
