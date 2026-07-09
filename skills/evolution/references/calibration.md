# Evolution Calibration (meta-evolver owned)

This file is the AUTHORITATIVE source for the evolver's tunable thresholds
and learned heuristics. It overrides any inline default values stated in
`SKILL.md` or `evolver.md`.

**Ownership rule:** only the `evolver-meta` agent may edit this file
(max 1 surgical edit per meta run, within the hard bounds below). The
`evolver` agent READS this file at the start of every evolution pass and
never edits it. Humans may edit freely.

## Tunables

| Key | Current | Hard bounds | Meaning |
|-----|---------|-------------|---------|
| signal_flag_threshold | 0.25 | 0.15 - 0.50 | Per-signal rate (rephrase/correction/switch) that triggers divergence classification |
| min_sessions_for_flag | 3 | 2 - 5 | Sessions with consistent signal required before classification |
| min_entries_for_run | 2 | 2 - 5 | summary.jsonl entries required before any mutation proposed |
| min_sessions_post_mutation | 2 | 1 - 4 | Sessions required before a PENDING mutation can be reconciled |
| confidence_high_sessions | 5 | 4 - 5 | Sessions (of last 5) with same-type signal for HIGH confidence |
| confidence_medium_sessions | 3 | 2 - 4 | Sessions (of last 5) with same-type signal for MEDIUM confidence |

Values outside hard bounds are invalid — the evolver must treat an
out-of-bounds value as the nearest bound and flag it in its report.

NOT tunable (locked in evolver.md safety rules, never moved here):
mutation caps, pinned/tier-3 protections, no-plugin-edit rule,
atomic-write protocol, LOW-confidence-propose-only rule.

## Learned heuristics

Free-text guidance the evolver applies during hypothesis generation.
Appended by evolver-meta when a failure pattern repeats. Cap: 7 entries —
to add an 8th, evolver-meta must prune the least-validated one.

1. Every PROPOSED EDIT's `predicted_outcome` must reference a specific
   metric field in summary.jsonl (e.g. "correction_count for sessions
   loading skill X drops to 0") — predictions that cannot be reconciled
   against metrics rot as INSUFFICIENT_DATA forever. (seeded 2026-06-06)

2. Before proposing a mutation to a skill that was NOT present in
   `skill_loads` for any session in the current signal window, the evolver
   must note this in the hypothesis and downgrade confidence by one level
   (HIGH -> MEDIUM, MEDIUM -> LOW). A skill that never appears in
   skill_loads produces structurally unmeasurable predictions regardless
   of how metric-anchored the wording is. The preferred alternative is to
   first propose a trigger-phrase fix (SKILL_STALE routing mutation) and
   wait for the skill to appear in skill_loads before mutating its
   content. (added 2026-06-06)

3. During reconciliation, before marking a PENDING mutation as
   INSUFFICIENT_DATA, the evolver must first check whether summary.jsonl
   has grown since the mutation was applied (i.e., new session entries
   exist post-mutation). If no new sessions were logged — regardless of
   whether work occurred — the correct status is INSUFFICIENT_DATA with
   the sub-reason "no sessions logged post-mutation" (not "sessions
   occurred but skill not loaded"). This distinction matters: the former
   is a metrics-capture gap (addressed by session-reflector Phase 1.6),
   the latter is a SKILL_STALE routing gap (addressed by trigger-phrase
   expansion). Conflating them produces misdiagnosed pathologies. When
   the sub-reason is "no sessions logged," the evolver must also note the
   summary.jsonl entry count and the date of the most recent entry.
   (added 2026-06-09)

4. During reconciliation, when an APPLIED mutation's target domain (e.g.
   figure-animator, manim-textbook, section-video-pipeline, a per-figure
   cache-buster scope) has zero relevant sessions in the current data
   window while sessions logged are real (non-skeleton, summary.jsonl is
   growing) but belong to a different sustained domain (e.g. an extended
   run of bookshelf-studio/Electron work), the evolver must tag the
   INSUFFICIENT_DATA sub-reason as "relevance gap: <domain> dormant since
   <date/pass>" — a third sub-reason distinct from heuristic #3's
   "no sessions logged" and "skill not loaded". A relevance-gap mutation
   is not a calibration failure and needs no intervention; reconcile it
   with a single compact one-line note per pass (not a full restatement
   of the original mechanism) until the dormant domain reactivates, to
   keep reconciliation output proportional to new information. (added
   2026-07-03)

## Change history

Meta edits are logged to `_workspace/_meta_evolution_log.jsonl` in the
project that ran the meta pass. This file carries no inline changelog.
