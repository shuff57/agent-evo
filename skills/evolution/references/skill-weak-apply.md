# SKILL_WEAK apply step

Adapted from skillsmith (HarshMehta112/skillsmith, MIT). Used when a SKILL_WEAK
mutation is MEDIUM/HIGH confidence and about to be applied.

1. **Attribute per skill.** List every skill active in the evidence sessions. Tie each
   correction to the specific skill active when it happened. If a correction cannot be
   tied to one skill with confidence, drop it. Never merge lessons across skills.
2. **Durable only.** Ignore one-off task details. A skill with no durable correction gets
   no edit; report "no change" instead of fabricating one.
3. **One diff, one yes per skill.** Show the exact old -> new text for that skill's SKILL.md.
   Ask for approval for that skill alone. One skill's answer never affects another's.
4. **Tighten before adding.** Prefer sharpening an existing rule over appending a new one.
   If a new rule contradicts an existing one, flag the conflict and ask which wins; do not stack.
5. **Reversible.** Remind the operator to commit separately so the edit is one revert.

Still bound by SKILL.md Phase 4 (one paragraph or one rule per body edit) and the Safety Rules.
