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
| signal_flag_threshold | 0.20 | 0.15 - 0.50 | Per-signal rate (rephrase/correction/switch) that triggers divergence classification |
| min_sessions_for_flag | 2 | 2 - 5 | Sessions with consistent signal required before classification |
| min_entries_for_run | 2 | 2 - 5 | summary.jsonl entries required before any mutation proposed |
| min_sessions_post_mutation | 2 | 1 - 4 | **Domain-relevant** sessions required before a PENDING mutation can be reconciled — a session only counts toward this window if it actually exercised the mutation's target domain/skill/agent. Raw elapsed session count does NOT by itself satisfy this: if N non-relevant sessions have passed and zero relevant ones, the window has not started, not closed. (See heuristic #4's relevance-gap sub-reason, which is the correct label while true, and heuristic #3's "no sessions logged" for when summary.jsonl itself hasn't grown — both are "window not yet open," not "window closed uninformatively.") |
| confidence_high_sessions | 5 | 4 - 5 | Sessions (of last 5) with same-type signal for HIGH confidence |
| confidence_medium_sessions | 2 | 2 - 4 | Sessions (of last 5) with same-type signal for MEDIUM confidence |

Values outside hard bounds are invalid — the evolver must treat an
out-of-bounds value as the nearest bound and flag it in its report.

NOT tunable (locked in evolver.md safety rules, never moved here):
mutation caps, pinned/tier-3 protections, no-plugin-edit rule,
atomic-write protocol, LOW-confidence-propose-only rule.

## Learned heuristics

Free-text guidance the evolver applies during hypothesis generation.
Appended by evolver-meta when a failure pattern repeats. Cap: 7 entries —
to add an 8th, evolver-meta must prune the least-validated one.

1. [PRUNED 2026-08-19 — prior heuristic 1 (require every `predicted_outcome`
   to name a specific summary.jsonl metric field) retired as the
   least-validated of the 7 slots: across all 357 rows of
   `_workspace/_evolution_log.jsonl` it was cited exactly once (line 81,
   2026-06-07, an APPLIED proposal, never a RECONCILIATION), carried zero
   VALIDATED credit, and was never invoked by any reconciliation pass again
   — versus 3-32 citations and direct RECONCILIATION/VALIDATED use for
   every other heuristic (2-7). Its content is not wrong; it is
   long-absorbed into default practice (every entry read this pass already
   carries a metric-anchored `predicted_outcome`), so it was the correct
   prune target per this file's own rule rather than any of 2-7, which are
   all still being actively cited in reconciliations.]
   SKILL_WEAK mutations that strengthen a VERIFICATION/CHECK instruction
   are, with a real sample, this log's highest-miss divergence type:
   reconciled MISSED=2/VALIDATED=2 (50%) vs INCOMPLETE 20% (n=10),
   STRUCTURAL 17% (n=6), SKILL_GAP 33% (n=3) — computed directly over all
   357 rows. Both SKILL_WEAK MISSES targeted a verification step and share
   a mechanism even though their surface descriptions differ: modify:320
   (visual-self-check/SKILL.md, 2026-08-16) added a NAMED TRIGGER PHRASE to
   a skill's description/When-to-use bullet; falsified because "a trigger
   phrase in a description is inert unless something makes the acting
   agent consult it mid-task" — the skill never even reached skill_loads
   in the next relevant session. modify:342 (deck-bookshelf/SKILL.md,
   2026-08-17) added a "measured, not sampled" check REQUIREMENT that the
   very next session followed to the letter, yet the prescribed comparison
   (an aggregate per-deck overflow count) was itself under-specified and
   let a single 0.3px->63.6px slide hide inside a passing aggregate — 32
   regressions shipped before a per-item re-check caught it (see
   `.agents/memory/active/feedback_compare_per_item_not_aggregate.md`).
   Common failure shape: a SKILL_WEAK fix that asks for "more/better
   checking" without pinning down BOTH (a) a structural trigger that
   forces the check to run at the point of use — not a description/
   trigger-phrase the agent must independently decide to consult — and
   (b) an exact, per-item (not aggregate) pass/fail computation naming the
   specific failure shape it must catch, is liable to be satisfied on
   paper while the targeted defect still ships. Before proposing a
   SKILL_WEAK edit that adds or strengthens verification, state in the
   hypothesis which of (a)/(b) the current gap is, and word the fix so the
   check either runs inside an already-loaded step (not a separately
   triggered skill/description) or is measured per-item against the actual
   observed failure shape, not an aggregate proxy for it. (added
   2026-08-19; evidence: SKILL_WEAK's 50% reconciled miss rate vs 17-33%
   for STRUCTURAL/SKILL_GAP/INCOMPLETE; modify:320 and modify:342 read in
   full, both independently confirmed MISSED)

   SCOPE BROADENED 2026-09-03: this (a)/(b) test is not SKILL_WEAK-specific
   -- the identical failure mechanism ("a documented pointer to the right
   check/tool survives on paper but an agent bypasses it anyway because
   nothing forces consultation at the point of use") now also accounts for
   both of STRUCTURAL's 2 reconciled MISSES, clearing this table's
   repeat-miss bar (>=2 MISSED) for a second divergence_type: (1)
   ~/.claude/agents/code-engineer.md (target 2026-07-22T23:10:00Z) added a
   prose "confirm the exit code directly, don't trust a piped/truncated
   read" bullet; reconciled MISSED 2026-09-03 after
   2026-08-30-toc-prose-restore-and-publish's own notes reported verbatim
   "a piped exit code masked a red suite" -- the exact shape, 5+ weeks
   later, with the bullet present and readable the whole time. (2)
   .claude/skills/deck-bookshelf/SKILL.md (target 2026-08-18T03:14:03Z)
   replaced a hand-rolled overflow check with a prose pointer to the
   existing scripts/workflows/visual_check.py; reconciled MISSED
   2026-08-19 after the very next deck-bookshelf session's
   manual_repetitions logged "hand-rolled a getBoundingClientRect overflow
   harness twice despite book-pipeline SKILL.md forbidding it." Both are
   case (a) failures under this heuristic's own vocabulary -- a pointer,
   not a forcing function. Going forward: before proposing ANY mutation
   (regardless of divergence_type label) whose fix is "point the agent at
   the correct existing check/tool/step via prose," apply this heuristic's
   (a)/(b) test, not just for SKILL_WEAK. If a future prose-pointer-only
   fix of any divergence_type reconciles MISSED with this same
   present-but-bypassed mechanism without this heuristic having been cited
   in its hypothesis, that is evidence the broadened scope itself isn't
   being consulted and a future meta pass should consider a dedicated
   STRUCTURAL-only heuristic instead of this cross-reference. (evidence:
   both rows read in full 2026-09-03; STRUCTURAL's absolute MISSED count
   independently confirmed at 2 of 25 reconciled STRUCTURAL rows via
   direct scan of the current 405-row _workspace/_evolution_log.jsonl)

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

5. [PRUNED 2026-09-08 — prior heuristic 5 (rewritten 2026-08-17: run
   `prediction_status.py` and trust its SCOREABLE/NOT YET output rather
   than hand-counting) retired as the least-validated of the 7 slots: a
   direct grep of the full 432-row `_workspace/_evolution_log.jsonl` for
   a literal "heuristic 5" citation finds zero hits after its 2026-08-17
   rewrite (every hit found predates the rewrite and refers to the old,
   already-superseded content). Its guidance is not stale or wrong — a
   separate grep for `prediction_status.py` itself finds 24 uses, most
   recently at row 428 (2026-09-06), so the underlying practice is alive
   — but its full actionable content is independently and completely
   duplicated by this file's own standalone "## Scoring a prediction: run
   the count, don't reconstruct it" section below (added the same day,
   2026-08-17), so retiring the numbered slot loses nothing: the
   guidance remains fully documented there. Same retirement rationale
   this file used for the original heuristics 1 and 7 — absorbed into
   practice / duplicated elsewhere, not wrong, just no longer earning a
   scarce numbered slot. No replacement content placed here: a
   concurrent evolver-meta run (racing this same edit, caught only by
   this file's own modified-since-read warning) independently reached
   the identical STRUCTURAL/TOCTOU diagnosis below and wrote it into
   heuristic 7's slot first; duplicating it here would leave two copies
   of the same guidance. This slot is retired with no successor content
   — 6 live numbered slots (1,2,3,4,6,7) remain under the cap of 7.]

6. During reconciliation, an APPLIED bug-fix mutation can land in a
   fourth INSUFFICIENT_DATA shape distinct from heuristics 2-5: the
   target domain IS active (the skill/file reloaded, or the same
   procedure re-run in a real, non-skeleton post-mutation session) but
   the specific narrow incident the fix targeted simply did not recur.
   Label this sub-reason "domain active, incident did not recur" --
   it is neither heuristic 3's "no sessions logged" nor heuristic 4's
   "domain dormant" (the domain is demonstrably NOT dormant here).
   Non-recurrence in an active domain is weak positive evidence, not a
   stuck/unmeasurable state, so it must not be left in INSUFFICIENT_DATA
   forever with no exit path: once the count of real, domain-active
   post-mutation sessions showing no recurrence reaches 2x
   min_sessions_post_mutation (currently 4), reconcile the entry to
   VALIDATED with an explicit "non-recurrence across N active sessions"
   basis instead of restating INSUFFICIENT_DATA again. Below that count,
   keep the sub-reason label and reconcile compactly per heuristic 4's
   proportionality rule. (added 2026-08-08; evidence: entries targeting
   .claude/skills/bump-cache-version/SKILL.md (static_page_template.html
   gap, APPLIED 2026-08-02), .claude/steps/whole-page-review.md
   (backfill-idempotency, APPLIED 2026-08-07T19:00), design_lint.py R0
   scoping and pipeline_run.py DEI-path selection (both PENDING
   2026-08-07T20:26) all had their min_sessions_post_mutation=2 window
   close with the target domain confirmed active in an intervening real
   session, yet all 4 remained INSUFFICIENT_DATA under the existing
   heuristics 3-5 vocabulary with no defined path to ever leave that
   state -- 4 of 4 (100%) of this specific shape stuck, well over the
   60% unmeasurable-predictions bar, and evolver reconciliation prose
   (_workspace/_evolution_log.jsonl lines 281, 289) was already
   independently coining the phrase "domain active, pattern did not
   recur" ad hoc without calibration backing before this heuristic
   codified it)

7. [PRUNED 2026-09-08 — prior heuristic 7 (the 2026-08-26 rule requiring a
   MONITORING entry that crosses its own self-stated promotion threshold
   to be converted to an APPLIED or FLAGGED_LOW_CONFIDENCE proposal in the
   SAME reconciliation pass) retired as the least-validated of the 7
   slots: cited only 5 times by name in `_workspace/_evolution_log.jsonl`
   since it was written, versus 19-87 for heuristics 2-6, and its own
   predicted_outcome sat INSUFFICIENT_DATA across every meta pass that
   checked it (idx100 through idx118, spanning 2026-08-27 to 2026-09-06)
   because zero MONITORING entries ever crossed their own stated
   threshold in that window — the rule was never wrong, it was simply
   never exercised, so it produced zero VALIDATED credit in two weeks.
   Its content is not being contradicted or discarded: apply it from
   memory if a MONITORING entry ever does cross its own threshold, even
   though it no longer occupies a written slot here. Retired under the
   same low-citation/zero-validation test this file used for the original
   heuristic 1 (2026-08-19) and this same slot's prior content
   (2026-08-26).]
   STRUCTURAL clears the repeat-miss bar a second time (3rd reconciled
   MISS): code-engineer.md and deck-bookshelf/SKILL.md were already folded
   into heuristic 1's 2026-09-03 scope-broadening as case-(a) "pointer not
   consulted" failures. The 3rd, modify:367 (`.claude/skills/
   memory-pending-triage/SKILL.md`, applied 2026-08-23, reconciled MISSED
   2026-09-08), is explicitly a DIFFERENT mechanism, per the reconciling
   pass's own actual_outcome text: "this is not heuristic 1's
   pointer-not-consulted failure mode ... it is a TOCTOU race that a
   pre-write-only check cannot fix by construction." The 2026-08-23
   mutation added a pre-write re-grep of `active/` immediately before the
   promotion Write, to stop two concurrent sessions double-promoting the
   same fact under different filenames. On 2026-09-08 the guard ran, was
   followed exactly as written, and a peer session still wrote duplicate
   promotions for 2 of 3 facts by the time this session's writes landed —
   grep-then-write is not atomic, so a check that only runs before the
   write narrows the race window but cannot close it, regardless of how
   faithfully it is consulted or how correctly it is computed. That is
   the opposite of heuristic 1's (a)/(b) test, which diagnoses a check
   being skipped or under-specified; here the check was present,
   consulted, and computed correctly, and still missed, because the
   target is a shared-mutable-state race and a single pre-write snapshot
   cannot observe writes that land after it runs. Rule: before proposing,
   or predicting the success of, a fix for a STRUCTURAL divergence whose
   target is a directory/file multiple sessions or agents can write
   concurrently (the class atomic-commit-guard rule 9 and this same
   memory-pending-triage skill already treat as shared-mutable-state),
   the hypothesis must state whether the fix is a pre-write check, a
   post-write reconciliation/verification (re-read the target AFTER
   writing and repair any collision found — the exact step the 2026-09-08
   mutation itself now adds to memory-pending-triage/SKILL.md step 3), or
   both. A pre-write-only fix for this class of target must word its
   predicted_outcome as narrowing the race window ("reduces collision
   frequency" / "catches N of M concurrent-write shapes"), never as "does
   not recur" — a predicted_outcome claiming full closure from a
   pre-write-only check is asking to be falsified by this same TOCTOU
   mechanism. (added 2026-09-08; evidence: modify:367 read in full across
   both its 2026-08-23 hypothesis/edit_summary and its 2026-09-08
   actual_outcome; the reconciling modify-mode pass's own text
   independently distinguishes this from heuristic 1 rather than folding
   it in, which is the finding this entry codifies)

## Scoring a prediction: run the count, don't reconstruct it

`scripts/prediction_status.py` (beside this file) answers the one question
every reconciliation turns on — **how many real, non-skeleton sessions have
landed since this mutation** — for every PENDING row in both logs at once:

    python ~/.claude/skills/evolution/scripts/prediction_status.py

It prints `NOT YET`, `SCOREABLE on the base window`, or `SCOREABLE on
non-recurrence` (heuristic #6's 2× window) per row. It assigns no verdicts;
VALIDATED vs MISSED stays a judgment call on evidence.

Run it BEFORE diagnosing "unmeasurable predictions". That pathology has been
diagnosed repeatedly while the underlying obstacle was cost, not
falsifiability: hand-counting the denominator across a 289-entry evolution
log, a 60-entry meta log and a 69-row session index is archaeology, so it gets
deferred and the row stays PENDING. On 2026-08-08 the script's first run found
**7 predictions already past their window** and sitting unreconciled, against
1 that genuinely could not be scored yet.

Read `skeleton` from the session row; never infer it. Skeleton rows carry a
`notes` string explaining that they are skeletons, so any "does it have notes"
heuristic counts all 69 rows as real when 41 are autolog placeholders — an
error that inflates every window and makes stuck predictions look satisfied.

## Change history

Meta edits are logged to `_workspace/_meta_evolution_log.jsonl` in the
project that ran the meta pass. This file carries no inline changelog.
