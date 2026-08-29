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

5. [REWRITTEN 2026-08-17, prior topic CLOSED — the 2026-08-16 text below
   demanded a manual hand-count workaround "until [the script] widens";
   that landed. `scripts/prediction_status.py`'s `collect_pending()` was
   rewritten (content-verified 2026-08-17, mtime 2026-08-17T16:16 local)
   to scan `status in {PENDING, APPLIED, MONITORING}` with
   `predicted_outcome` set and `actual_outcome is None` — its own
   docstring cites this heuristic by name. A live run
   (`python prediction_status.py --workspace <repo>/_workspace`) now
   surfaces 114 pending items (up from 2 under the old literal-PENDING-only
   scan): 108 SCOREABLE, 6 NOT YET. Do NOT hand-count APPLIED/MONITORING
   rows anymore — that was a stand-in for the fix, not a permanent
   practice, and continuing it now duplicates what the script already
   does.] **Current guidance:** run `prediction_status.py` and trust its
   SCOREABLE/NOT YET output directly; a report of "no PENDING predictions"
   now means the workspace argument was wrong (it takes the `_workspace`
   dir itself, e.g. `--workspace <repo>/_workspace`, NOT the repo root —
   passing the repo root silently reads `sessions_total: 0` and prints
   "no PENDING predictions", which looks identical to a genuinely empty
   backlog; this tripped up the very meta pass that wrote this entry). A
   large jump in SCOREABLE count when this fix first lands (2 -> 114 rows,
   observed 2026-08-17) is the fix working as intended, NOT itself a new
   "unmeasurable predictions" signal — most of that backlog is freshly
   *measurable*, not freshly *stuck*; only count rows toward that
   pathology's 60% bar once they are individually checked against their
   own window and found still open past it, not merely because the total
   population became visible. Distinct from, and unaffected by, the
   separately-diagnosed write-back gap (evolver.md's 2026-08-16
   reconciliation-rewrite rule): that gap was RECONCILIATION prose not
   rewriting a row's own status field after a verdict; this was the
   INITIAL status string never matching what the script scanned for.
   Both are now fixed by different mechanisms (evolver.md's rule for the
   former, this script edit for the latter) — if either regresses
   (a RECONCILIATION-target pass reports a status field that a direct
   read contradicts, or `collect_pending()`'s scan narrows back to a
   literal PENDING match), that is fresh stale-heuristic evidence, not a
   reason to restore the manual-count workaround. (rewritten 2026-08-17;
   evidence: prediction_status.py collect_pending() source read directly,
   citing "calibration.md heuristic #5, added 2026-08-16" in its own
   docstring; live script run showing 114 pending / 108 SCOREABLE / 6 NOT
   YET against 83 session rows (38 real); evolution-log lines 7/8/9
   independently content-verified as reconciled to INSUFFICIENT_DATA at
   2026-08-17T15:30:00Z citing this heuristic's sibling, heuristic 4's
   relevance-gap sub-reason — three rows the old scan could never have
   surfaced. Raised by the calling modify-mode evolver session; verified
   independently by evolver-meta idx80 rather than taken on the session's
   word, per this file's own precedent for content-verification over
   reconciliation prose.)

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

7. [PRUNED 2026-08-26 — prior heuristic 7 (before flagging a code-level
   PENDING mutation "diff not present," content-verify the file plus
   `git log`, don't trust `git status`/`git diff` alone) retired as the
   least-validated of the 7 slots: across all 377 rows of
   `_workspace/_evolution_log.jsonl` it was cited only 3 times (lines 301,
   306, 317, all mid-August RECONCILIATION rows), carried zero VALIDATED
   co-occurrence, and was not cited once in the most recent ~60 rows even
   though 20+ code-level PENDING mutations reconciled in that span — versus
   13-49 citations and live recent use (last cited within the final 15
   rows) for every other heuristic (1-6). Its content is not wrong; the
   git-status-vs-content confusion it targeted has not recurred since
   2026-08-10, and `prediction_status.py` (heuristic 5) now routes
   reconciliation through the file/session data directly rather than raw
   git status, so the guidance reads as absorbed into practice rather than
   needed as standalone prose — the same retirement rationale this file
   used for the original heuristic 1.]
   SKILL_GAP is the only divergence type besides SKILL_WEAK to clear the
   repeat-miss bar (>=2 MISSED): modify:225 and modify:346, both reconciled
   MISSED, 3 VALIDATED alongside them (40% miss rate). The two misses do
   NOT share one mechanism — modify:346 (section-author re-collection fix
   never consulted because the skill was absent from that session's
   skill_loads) is already heuristic 2's / heuristic 1's trigger-
   consultation gap, no new guidance needed. modify:225 is a distinct,
   previously uncovered failure: a MONITORING entry
   (deterministic-lint-blind-to-visual-defects) recurred past the exact
   promotion threshold ITS OWN edit_summary had set ("if this recurs in 2
   more sessions, propose one rule") — modify:225's own actual_outcome text
   flags this by name as "a reconciliation-pipeline miss" for evolver-meta
   to fix: the threshold was crossed by 2026-08-18 (deck-18px-type-floor)
   and again 2026-08-23 (TTS/read-aloud false positives), but no pass
   converted it to an APPLIED proposal at either crossing — the recurrence
   surfaced only as prose when the entry was finally reconciled to MISSED,
   sessions after the bar was met. Rule: during reconciliation, the moment
   a MONITORING entry's logged recurrence count reaches or exceeds the
   threshold its own edit_summary stated, that SAME reconciliation pass
   must either draft an APPLIED mutation proposal for it, or — if still
   genuinely ownerless across candidate files — explicitly propose
   FLAGGED_LOW_CONFIDENCE naming one candidate owner for human review.
   Leaving the crossing noted only in reconciliation prose while the row
   ages toward MISSED is this failure recurring; a MONITORING entry
   reconciled to MISSED whose own actual_outcome states its threshold was
   already crossed one or more passes earlier is the tell. This is not a
   call to over-promote: the 4 MONITORING entries checked this same pass
   (lines 230, 245, 246, 363 — css-partial-resync-tool-fragility,
   negative-grep-read-as-absence, destructive-git-discard-crosses-repos,
   documented-lesson-not-consulted-mid-task) all remain correctly held
   below their own stated thresholds and were left at MONITORING, exactly
   as they should be. (added 2026-08-26; evidence: modify:225's actual_outcome
   self-flags "a reconciliation-pipeline miss, not evidence the underlying
   gap doesn't exist... flagged for evolver-meta"; modify:346 read in full
   and confirmed to be heuristic-1/2 territory, not a new mechanism; the 4
   currently-open MONITORING rows checked and confirmed still under
   threshold as of this pass, 2026-08-26)

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
