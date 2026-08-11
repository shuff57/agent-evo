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
| min_sessions_post_mutation | 2 | 1 - 4 | Sessions required before a PENDING mutation can be reconciled |
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

5. A summary.jsonl row carrying `"skeleton":true` (Stop-hook fallback
   autolog) must be treated as equivalent to heuristic #3's "no sessions
   logged" for reconciliation purposes regardless of row-count growth —
   skeleton rows hardcode rephrase_count/correction_count/skill_loads to
   0/empty and cannot produce a genuine VALIDATED or MISSED signal; do
   not let their mere presence count as the session-post-mutation window
   advancing. Track the skeleton streak (consecutive skeleton-only rows
   since the last non-skeleton entry). When that streak spans >= 5 evolve
   passes since the last non-skeleton session, this is a structural
   metrics-capture gap, not a threshold problem — lowering
   min_sessions_post_mutation cannot fix it, because zero real sessions
   means zero reconcilable data at any window length. In that state the
   evolver must (a) reconcile with a single compact one-line note per
   pass citing streak length and the last full session's id/date
   (mirroring heuristic #4's proportionality rule) instead of a full
   restatement, and (b) surface an explicit human-facing flag in its
   report giving the count of mutations now stuck behind the gap (e.g.
   "N mutations across M passes cannot be reconciled — no full
   session-reflection since <date>; check whether session-reflector /
   the Stop-hook capture path is firing") so the growing backlog doesn't
   get silently re-logged pass after pass. (added 2026-07-27; evidence:
   pass77-83 applied 18 mutations across 7 evolve runs since
   2026-07-22T22:40:00Z, the last non-skeleton summary.jsonl entry — all
   18 remain INSUFFICIENT_DATA behind 5 consecutive skeleton-only rows
   07-23 through 07-27)

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
