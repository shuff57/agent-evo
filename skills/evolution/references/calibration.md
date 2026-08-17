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

5. [REWRITTEN 2026-08-16, prior topic superseded — original text covered
   skeleton-session streak-tracking via a literal `skeleton:true` field;
   that field never appears in summary.jsonl (0/77 rows, confirmed by
   meta-pass idx71 2026-08-15) and prediction_status.py's is_real_session()
   fallback has since absorbed the real/skeleton distinction in code, so
   the prose instruction to track the streak by hand is retired as
   redundant with the script.] `prediction_status.py`'s scoreability
   report is NOT evidence of an empty backlog by itself: `collect_pending()`
   treats status=="PENDING" (exact string match) as its ONLY entry
   criterion. Field-level audit of the WHOLE `_workspace/_evolution_log.jsonl`
   history (333 rows; 201 carrying a `predicted_outcome`) found the evolver
   has NEVER, in this log's entire history, written a mutation-with-prediction
   row with the literal status "PENDING" that evolver.md's own write
   template (line 124) names — new mutations are logged directly as
   "APPLIED" or "MONITORING" instead (most recent example: line 325,
   2026-08-16, status APPLIED). Of the 201 predicted-outcome rows: 0
   PENDING, 76 APPLIED, 37 MONITORING (113 total, 56%) sitting outside the
   script's scan criterion regardless of how much time elapses, and only
   43 (21%) ever reach a terminal VALIDATED/MISSED/INSUFFICIENT_DATA
   status. Because the script's report is empty whenever there is no
   literal PENDING row, "prediction_status.py shows nothing to reconcile"
   must NEVER be read as "nothing needs reconciling": before accepting a
   clean run, separately count rows with status in {APPLIED, MONITORING}
   that carry a predicted_outcome and actual_outcome:null, and apply the
   SAME session-count window math the script already implements for
   PENDING to those rows by hand. This is a script-vocabulary drift, not
   a calibration tunable — flag it to whoever maintains evolver.md /
   prediction_status.py so the filter widens to
   status in {PENDING, APPLIED, MONITORING}; apply this heuristic manually
   every pass until that lands. Distinct from, and unaffected by, the
   separately-diagnosed and already-fixed write-back gap (evolver.md's
   2026-08-16 reconciliation-rewrite rule, heuristic #7's lineage): that
   gap was RECONCILIATION prose not rewriting a row's own status field
   after the fact; this gap is the INITIAL status string the evolver
   writes at mutation time never matching what the script scans for, so
   no amount of window-elapsing or reconciliation discipline fixes it on
   its own — only widening the script's filter (or having the evolver
   actually write "PENDING" as its own protocol names) closes it. (added
   2026-08-16; evidence: Counter over all 333 _evolution_log.jsonl rows /
   201 predicted-outcome rows — 0 PENDING / 76 APPLIED / 37 MONITORING /
   21 VALIDATED / 18 INSUFFICIENT_DATA / 4 MISSED / remainder non-mutation
   proposal statuses PROPOSED_HUMAN_REVIEW, EXTERNALLY_APPLIED,
   FLAGGED_LOW_CONFIDENCE, SKILL_CREATED, DEFERRED_TO_CREATE_MODE; raised
   by the calling modify-mode evolver session as an observation it could
   not act on itself)

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

7. When reconciling a PENDING mutation whose target is a code-level file
   outside skills/agents/roster (e.g. `scripts/workflows/*.py`) and whose
   edit_summary describes a specific diff, do not record a "discrepancy,
   diff not present" verdict from `git status --porcelain` / `git diff`
   alone. A clean working tree only means no UNCOMMITTED delta relative to
   HEAD — it is silent about whether the described change is present IN
   HEAD, because a fix proposed in one session is routinely committed in a
   LATER session, after which the tree is clean AND the feature is fully
   live. Clean status is consistent with three different states (never
   written, written then reverted, or written then committed) and cannot
   by itself distinguish them. Before flagging "not present," grep/read the
   file's CURRENT CONTENT for the described change and check `git log
   --since <mutation timestamp> -- <file>` / `git show <commit>` for a
   commit that landed it after the mutation was logged. If content-verified
   present and attributable to such a commit, reconcile directly to
   VALIDATED (or MISSED if the content contradicts the prediction) instead
   of leaving the entry PENDING with a discrepancy flag. This is the same
   root confusion in both directions: on 2026-08-07 (commit dbaf37a8f) an
   evolver reported two fixes "already fixed" while they were still only
   uncommitted working-tree drafts, and a fresh checkout of `desktop`
   still had both bugs; on 2026-08-10 the reconciliation pass logged at
   `_workspace/_evolution_log.jsonl` line 300 inverted the same confusion,
   flagging modify:266, 267, 275, 276, 277, 278, 279 (7 SCOREABLE entries)
   as diffs "never actually realized on disk" based on a clean
   `git status`/`git diff` read — but a meta-pass re-verification (reading
   current file content plus `git log`/`git show`) found all 7 fixes
   present in HEAD, landed via commits dbaf37a8f (2026-08-07) and
   4d3d20015 (2026-08-09), both dated after the entries were logged and
   before the reconciliation pass that called them absent. Two confirmed
   instances of the same mechanism, opposite directions, each costing a
   correct applied/not-applied verdict. (added 2026-08-10)

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
