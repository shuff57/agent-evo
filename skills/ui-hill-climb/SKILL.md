---
name: ui-hill-climb
description: Push a desktop or web UI toward the best, most polished interface it can be, measured by blind A/B grading against best-in-class references, one round at a time, against a bar written down before the first round (the bar is a floor, not the finish line). Use when asked to make an app look better than another app, to "push the UI score to X", to set up a design hill climb and its criteria, to run a design critic panel, to check whether a UI fix actually helped (before/after rounds), or when a UI change needs to be judged by something other than the person who made it.
---

# UI hill climb

A loop that turns "make it look better" into a number you can trust: screenshot the app, grade it
blind against the reference by independent critic models, read the one gap each critic names, fix
that, shoot again. The builder never scores its own work.

The goal is not "better than it was". It is the best, most polished UI we can make — work that a
Linear, Stripe or Vercel designer would ship without wincing. Climb hard, but only with numbers you can
trust: the loop is worth nothing without the honesty scaffolding. Most of this file is that scaffolding,
because every failure below actually happened and silently produced confident wrong numbers.

```
   capture (one build, every screen/view)
        │
        ▼
   make_blind.py  ──▶ blind/  +  key.json        controls: same image twice
        │                                       mirrors:  pair with sides swapped
        ▼
   verify_blind.py  ── must print OK ──▶ abort if not
        │
        ▼
   the council (2 critics: Claude Opus + GPT Sol, high) ──▶ one JSON line per item
        │            split pair? ──▶ tie-breaker: Kimi K3.1 (opencode, ollama, high)
        ▼
   analyze.py  ── control error FIRST, then votes, then means
        │
        ▼
   criteria_check.py  ── PASS/FAIL against the written bar (visual + task track)
        │
        ▼
   read the named gaps ──▶ fix the top one or two (or a system pass when the mean stalls) ──▶ capture again
```

## Ambition: the best UI we can make

Default to aggressive. Unless the owner says otherwise:

- **The bar is a floor.** Passing `criteria_check.py` is a checkpoint, not the end. Keep climbing while
  the panel still names concrete, located gaps. Stop only when the judges' named gaps turn into taste
  (single mentions, contradictory between judges, no locatable defect) for two rounds running, or when
  the owner says stop. Then report the remaining gaps instead of declaring victory.
- **Judge against the best, not the old build.** Before/after pairs prove direction; absolute scores
  against best-in-class anchors (Linear, Stripe, GitHub, Vercel, Replit, Khan Academy for teaching UIs)
  prove level. A screen that wins its pair but scores 6/10 is not finished.
- **Escalate scope when gains stall.** Single-gap rounds fix defects; they rarely lift the mean. After
  two flat rounds, run a spec-driven system pass (written type scale, spacing rhythm, colour roles,
  component and state rules applied everywhere, council-reviewed first). Measured: one system pass
  moved a mean +0.67 that four single-gap rounds had not moved at all.
- **Polish is the job, not a final coat.** Every round checks the details best-in-class apps get right:
  every interactive state (hover, focus-visible, active, selected, disabled, loading, empty, error,
  success); alignment to a shared grid and baseline; one type scale with no stray sizes; consistent
  radius, border and shadow; no orphaned words, ragged toolbars, clipped labels or off-grid edges;
  motion that is quick and purposeful (respect reduced motion); phone layouts designed, not shrunk.
- **Name the next three gaps, always.** End every round with the three biggest named gaps across the
  panel, located and specific, so the next round never starts from "what now".
- **Ambition never relaxes honesty.** A bigger change still gets the council review, the blind
  capture, controls, mirrors and tests. Never trade a passing test, a semantic colour or an action's
  affordance for a cleaner screenshot (rule 10, the monochrome trap). Never redefine the bar to claim it.
- **Ask before crossing a content line.** If the remaining gap lives in content, data or behaviour the
  climb is not cleared to touch (lesson text, copy owned by someone else, routes), say so with the
  measured cost of leaving it, and ask; do not quietly route around it or stop short.

## What "blind" has to mean

- **Absolute scores and A/B pairs.** Where the reference has the same screen, show the two images
  side by side and ask which is better plus a 0–10 score on four dimensions. Where it has no
  counterpart (a welcome page, a settings page, a dark mode the reference lacks), score ours alone.
- **Controls.** One or two items are the *same image in both slots*. Any judge that splits them is
  measuring itself. Publish the per-judge control error before any score; a judge over 1.0 is
  unusable, and identical pixels scoring differently means the harness is broken, not the panel.
- **Mirrors.** Show a few pairs a second time with A and B swapped. A judge that keeps preferring
  the left image is invisible without this. (Round 6: mistral agreed with itself 2/5 — its votes got
  discounted, and the mean moved 0.3 once they were.)
- **Before/after pairs when the question is "did the fix help".** The same machinery can point at
  your own previous build instead of the reference: `"ref_same_names": true` in the `UC_ROUND` file,
  `UC_REFS` set to the old shots. An absolute round answers "are we good yet"; a before/after round
  answers "did this change help". They are different rounds and must not be conflated — the pairs
  prove the direction, the full round proves the level.
- **Two independent things must be true:** the set must be assembled from the images the key says
  (verify byte for byte), and the judge must be consistent on duplicates. Check both, every round.

## The harness

`scripts/` holds a working implementation. It is not a package; copy it beside your screenshots and
edit the config block at the top of each file.

| file | what it does |
|---|---|
| `scripts/blindlib.py` | mask rectangles per screen/role, `build(path, screen, side, narrow)` → the blind image |
| `scripts/make_blind.py` | assembles pairs + singles + controls + mirrors into `<out>.tmp`, renames once, writes `key.json` (source path, screen, role, both hashes) |
| `scripts/verify_blind.py` | rebuilds every image from the key and compares hashes; exits 1 on any drift |
| `scripts/visual_diff.py` | creates side-by-side before/after comparison with numbered bounding boxes around changed pixel clusters for human spot-checks |
| `scripts/analyze.py` | parses verdicts, prints controls → mirrors → votes → per-screen means → dimensions |
| `scripts/critic.md` | the prompt; `OUTFILE` is substituted per judge |
| `scripts/council.md`, `scripts/run_council.sh` | the council step: the two critics review the plan + diff, read-only, advisory only; the tie-breaker settles a split (see Council) |
| `scripts/criteria_check.py` | turns a results file (and a task ledger) into PASS/FAIL against the written bar: per-screen means, weakest dimension, dark parity, pair win rate, tasks |

Run:

```bash
python3 make_blind.py <shots_dir> <blind_dir>
python3 verify_blind.py            # must print OK; do not grade otherwise
bash run_critics.sh                # one detached `t3 thread start` per model, one .jsonl each
python3 analyze.py > rN-analysis.txt
```

**The critics are the council: two of them.** At onboarding, suggest exactly two critics, both at
high effort, and confirm them with the user before the first round (one question, the suggestion as
the first option; never guess or substitute):

| critic | T3 provider | model | effort |
|---|---|---|---|
| Claude Opus | the Claude instance (`orchestrator_capabilities`, e.g. `claudeAgent_claude_proxy`) | `claude-opus-5-5` | `{effort: high}` |
| GPT Sol | `codex` | `gpt-6.1-sol` | `{reasoningEffort: high}` |

Then `UC_COUNCIL="<claude-instance>:claude-opus-5-5 codex:gpt-6.1-sol"`. In T3 Code use
`UC_CRITIC_MODE=prepare bash run_critics.sh`: it writes each critic's prompt and prints
`provider model prompt outfile`; start both with `delegate_task` (async, both in one turn) at high
effort with the prompt file's text as the task, then run `analyze.py`. Outside T3 Code the default
`run` mode starts them with `t3 thread start`, which cannot set effort (see Effort under Council).

**Tie-breaker: Kimi K3.1 on high.** Two judges can split. When `analyze.py` reports split pairs
(one vote each way, or ours/ref against a tie), spawn one tie-breaker instead of guessing:
opencode, model `ollama/kimi-k3.1-pro` (the ollama provider, not the `openrouter/` copy T3's model
search lists; do not fall back to it unasked), `{variant: high}`.
`UC_TIEBREAK=1 UC_CRITIC_MODE=prepare bash run_critics.sh` prepares it for `delegate_task`
(override with `UC_TIEBREAK_MEMBER`). It grades the *whole* pack, controls and mirrors included,
into `blind/tiebreak/`, so its honesty is measured like any judge's; if its control error is over
1.0 its votes are ignored and the splits stay ties. Probe it once for image reading before its first
use (Choosing judges). `analyze.py` uses it only to settle split pairs
("pairs won after tie-break"); it never enters a mean, because a judge that sits in only some rounds
would shift the scale (rule 3). No splits, no tie-breaker.

The cheap ollama panels (`UC_PANEL=steer|waterfall|full`) remain as extra judges between council
rounds. The two critics steer; to claim the bar add the cheap judges (rule 8).

## Choosing judges

The council is the primary panel; the rules below apply to every member, council or cheap.

Probe every candidate before it earns a seat: hand it one screenshot and ask for a detail only
visible in the image (a displayed name, the word inside a status tag). Reply `NO_IMAGE` or a guess →
rejected. Measured: `gemma4:31b` and `glm-5.3` cannot read images at all; `deepseek-v4-pro` cannot
run under the default token budget.

Use models from different labs — agreement across labs is evidence, agreement within one family is
not. Expect a scale spread of up to 2 points between judges on the same image (deepseek ~5.9,
mistral ~7.9 in one round); never compare means across a changed panel.

A provider instance only serves some models. The cheap `UC_PANEL` judges start with
`--provider opencode`; council critics and the tie-breaker use the provider named in their
`provider:model` pair.

## Criteria to meet

Write the bar down before the first round; a number without a gate is a mood. Set it from the
baseline and then aim past it: the bar says when the UI is acceptable, the Ambition section says when
it is done.

- **Visual**: every screen ≥ a stated mean, no dimension below a stated floor, a share of pairs won,
  dark within a delta of light.
- **Task**: fixed jobs (first bank, import → export, sign-up, wrong input, destructive undo,
  keyboard only, quit mid-edit, empty states), each recorded step by step and ruled from the
  recording. Unmeasured is not passed.

`criteria_check.py RESULTS.json [tasks.json]` prints PASS/FAIL against both.

## Rules that keep the number honest

1. **Builder never grades.** The agent that wrote the CSS is the worst possible judge of it.
2. **Controls first.** A round with a split control is void. Say so and re-run; do not average it in.
3. **Same panel across rounds.** A new judge resets the scale. If the panel must change, report both.
4. **Means are ±0.3–0.5.** Unchanged screens drift that much between rounds even with perfect
   controls. Quote a range and lean on the vote count for direction.
5. **One build per round.** Every frame from the same binary. A pool/feature build used for two
   screens and a plain build for the rest is a two-build round; rebuild and re-shoot.
6. **Fix what they name, not what you like.** Each judge names exactly one biggest gap, located and
   specific. Two rounds of gaps on one screen is a real defect; a single mention is taste.
7. **Never trade a passing test for a look.** Build, run the suite, then shoot.
8. **One judge cannot establish a delta.** Ten verdicts from one model are a hint, not a measurement;
   the two critics steer (Kimi K3.1 breaks their splits), and the bar is claimed only with the cheap
   judges added on a full-panel round.
9. **Mirrors decide near-ties.** When two images are close, a flipped mirror is the answer: the pair
   is a tie, whatever the scores say.
10. **Beware the monochrome trap.** Never sacrifice interactive affordances for flat minimalism.
 Models rewarded for "clean hierarchy" often strip out all semantic color, resulting in washed-out
 monochrome screens where primary buttons no longer look clickable. Maintain clear action affordances.

## Pitfalls, all measured

- **A member can die before it sees an image.** 2026-11-08: a claudeAgent judge started at the same
  moment as two other providers failed with "Claude timed out while registering its MCP tools"; the
  old one-shot retry fired at once, hit the same wall, and the council silently became two judges.
  `scripts/t3_run.sh` (sourced by `run_critics.sh` and `run_council.sh`) reads the thread's own
  `status`/`error`, retries startup and infra errors with backoff (`UC_BACKOFF`, default 45/120/300s),
  re-runs a short but completed judge once and merges only the missing ids, staggers launches
  (`UC_STAGGER`, default 20s), and on persistent failure writes `<member>.jsonl.unavailable` and
  says so. A round with an unavailable member is a two-judge round: report it, never substitute a
  model, never claim the bar on it.
- **Single-gap rounds plateau the absolute mean.** shCode 2026-11-08: four rounds each won their
  targeted pairs (3-0 most of the time) while the desktop mean stayed 5.94, because untouched screens
  drift ±0.5 and one fixed defect barely moves a screen judged against best-in-class. One
  spec-driven system pass (a written type scale, text floor, spacing rhythm, toolbar and CTA rules,
  applied by two builders on disjoint files, then council-reviewed) won 25 of 27 pairs and moved the
  mean +0.67 in one round. When two rounds of single-gap wins leave the mean flat, offer the owner a
  system pass; keep single gaps for regressions.
- **Give the council the round's own diff.** A council once reviewed two rounds combined because the
  tool that cut the previous round's tree matched nothing, and scored round-1 code as round-2 creep.
  Commit each round before the next builder runs, or cut the delta with `git apply --include`.
- **A judge can misread the second copy of a control.** codex `gpt-6.1-sol`, 2026-11-08, four times
  in one climb: the control's two byte-identical images got A ≈ 7 and B = 0 with "only a thin
  fragment is visible" (the B image failed to load for the judge, not a score). The control catches
  it; that judge's run on that pack is void even if its other verdicts look sane (its mirror flipped
  in the same run). Re-run that judge alone on the same pack; do not average the void run in.

- **The blind set can race itself.** Two runs of the old script: one rewrote the directory while the
  other rewrote the key. 6 of 21 pairs were graded against the wrong screen and the "same image
  twice" control was two different images (mean pixel diff 31.5). It read as judge bias. Hence the
  lock file, the temp-dir rename, and `verify_blind.py`.
- **A wrong key looks like a regression.** Check `verify_blind.py` before believing any score drop.
- **Wrapped JSON loses whole screens.** One model wrote 42 of 59 verdicts across two lines. Demand
  *one single-line JSON object per item*, and keep a glue parser that rejoins a wrapped object.
- **Screenshot capture competes with the test suite.** Six concurrent Xvfb runs plus `cargo test` =
  `TimeoutExpired` and missing frames. Capture alone, or wait for the suite.
- **Stale frames from a stale binary.** A pool-enabled build made minutes earlier silently grades an
  older UI. Rebuild the same binary for every screen and check mtimes.
- **The pointer sits at window centre in headless shots**, so whatever card is under it renders in
  its hover state. Fine, as long as every round is shot the same way.
- **Long lines and empty floors are what the critics actually penalise.** Cap prose at ~70
  characters, and anchor short pages with a footer rule: those two changes moved ten screens at once.
- **The monochrome / grayscale local minima.** Left unconstrained, models attempting to score high
 on "calm hierarchy" and "clean spacing" strip out color accents and borders until everything looks
 like a washed-out wireframe and buttons lose their affordance. Explicitly check that primary actions
 look clickable and light-mode text contrast remains sharp.

## Cutting the token cost

A full round is every frame times five critics, plus controls and mirrors. Two cuts keep what a
judge sees, and so the verdicts, unchanged:

- **Grade only frames that changed.** Capture is deterministic, so an untouched screen is
  byte-identical. `scripts/changed.py TEMPLATE_ROUND.json PREV_SHOTS NEW_SHOTS OUT.json` writes a
  `UC_ROUND` file with only the differing frames (controls and mirrors drawn from them) and exits 2
  when nothing changed. Carried screens keep last round's verdicts and are marked as carried. How
  much it saves depends on the builder: touching most screens saves little (measured 6 of 30
  frames identical), fixing two screens saves most of the round.
- **Waterfall gating (`UC_PANEL=waterfall`).** Run a fast, low-cost screener judge first (e.g.
 deepseek/kimi). If the screener fails or control errors spike, halt immediately before firing
 tokens on the rest of the multi-lab jury.
- **Steer with the two critics, claim with the full panel.** Run the cheap, ungated critics between builder
  runs (`UC_PANEL=steer` in the project's `run_critics.sh`). Only claim the bar on a full-panel
  round, and never compare a steer round's means with a full round's (rule 3).

Deliberately not cut: the critic prompt, the four scores on both sides of a pair, controls, mirrors
and `verify_blind.py`. The number's honesty rests on those.

## Worktree isolation for aggressive climbs

When pushing an already viable UI past a baseline (e.g. from 8.0 to 9.5+):
- **Fork into a separate git worktree** (`git worktree add ../ui-climb-push`). Keep the baseline
 PR clean and mergeable while the experimental climb runs in parallel.
- Generate a visual diff diagram (`python3 scripts/visual_diff.py old.png new.png diff.png`)
 at the end of each round to let human reviewers immediately inspect the exact pixel clusters
 and component changes without squinting across screens.

## Council (the critics, and the fix reviewers)

Specialization of the general `council` skill (`skills/council`, from tstack), with one difference:
here the council is two critics (Claude Opus + GPT Sol, high) plus a Kimi K3.1 tie-breaker, not three
members. The council is the panel that grades the blind set (see Run), and it has a second, advisory job: after the panel names
gaps it reviews the fix plan and diff before the next capture. In that second job it never
contributes to a mean.

- **When (review job).** After `analyze.py` and `criteria_check.py`, once the builder has a fix plan and a diff,
  before the next capture. Also once before claiming the bar on a full-panel round.
- **Who.** The same two critics confirmed at onboarding (see Run): Claude Opus and GPT Sol, both
  high, read-only, each from a different provider. Fewer than two distinct providers or an
  unavailable member: report it, do not substitute (`run_council.sh` exits 3).
- **Tie-breaker.** When the two disagree (one `satisfied`, one not), run the same round again with
  `UC_TIEBREAK=1` (opencode `ollama/kimi-k3.1-pro`, `{variant: high}`). It joins as member
  `tiebreak` and the summary takes the majority of three. Disagreement on whether a plan item is a
  real defect or taste: Kimi's vote settles that item too. Never use it to outvote two critics who
  agree.
- **What they get.** The analysis, the written bar, the plan, the git diff and any `visual_diff.py`
  composites. They sort the plan into real defects (two judges, or the same screen two rounds) and
  taste, check for the monochrome trap and scope creep, and give a /10 for plan-plus-diff.
  A void round (split control) stays void; the council cannot rescue it.
- **Loop.** If you agree, make the changes, then a fresh council pass is a new round (count passes
  as in tstack: one full pass = one round). Stop when both say `satisfied`, or two of three after a
  tie-break. Do not let repeated passes grow scope: fight to keep it to the top one or two gaps.
- **Report.** Add the council table to the round report and, when the work ends in a PR, to the PR
  description (edit it, do not comment), before the model/harness line. No score means `no score`.

```markdown
## Council review

Rounds: 2

| Delegate | Round 1 | Round 2 |
| --- | --- | --- |
| Claude Opus | 7/10 | 9/10 |
| GPT Sol | 8/10 | 10/10 |
| Kimi K3.1 (tie-break) | not run | 9/10 |
```

Run: `ROUND=3 UC_COUNCIL=... UC_ANALYSIS=r3-analysis.txt UC_CRITERIA=r3-criteria.txt UC_PLAN=plan.md
UC_DIFF=pending.diff bash run_council.sh`. In T3 Code, resolve member models with
`orchestrator_capabilities`.

**Effort.** `t3 thread start` cannot set reasoning effort, so the default `run` mode leaves each member
at its provider default (codex `gpt-6.1-sol` = low). In T3 Code use `UC_COUNCIL_MODE=prepare`: it
writes each member's prompt and prints `provider model prompt outfile`; start the members
yourself with `delegate_task` (role review, async, all in one turn) at high effort —
codex `{reasoningEffort: high}`, claudeAgent `{effort: high}`, opencode `{variant: high}` — with the
prompt file's text as the task; when all report, run `UC_COUNCIL_MODE=summary`. A member whose
task fails at startup is retried once after a pause, then reported unavailable (never substituted).
The blind critics follow the same pattern (`UC_CRITIC_MODE=prepare bash run_critics.sh`) and stay at
high for the whole climb, since a change of effort resets their scale like a change of judge (rule 3).
The tie-breaker is always started at `{variant: high}`.

## Report shape

Per round: the mean (as a range), the vote count, the per-judge control error, then a table of
per-screen means and the named gap on the weakest three. Keep a running per-screen table across
rounds — it is the only way to see which fix actually paid.
