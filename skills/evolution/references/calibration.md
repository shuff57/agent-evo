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
