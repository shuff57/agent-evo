---
name: figures-parity-climb
description: Hill-climb verSHion's Figures tab toward the four teacher.dev reference sites (mathfigures.com, physicsfigures.com, chemistryfigures.com, biologyfigures.com) by scraping every figure page, diffing the reference's controls and direct manipulation against our parameters and drag handles, and implementing the highest-value missing capability one measured round at a time. Use whenever the user asks to scrape the figures sites, check them for new figures, compare our figures with theirs, find missing controls or interactions, "make the figures match the site", "what are we missing", "diff how they interact", or to continue a figures parity climb — even if they name only one site or one figure.
---

# Figures parity climb

A loop that turns "their figures can do more than ours" into a number and a
work queue: scrape the live reference, list what a teacher can do there, check
which of those verSHion does (against the built app, not our say-so), close the
highest-value gap, re-score. The goal is **interaction parity**: the controls,
student/key versions and direct manipulation a teacher uses. Not pixel parity.

The number is only worth something if the person building does not also decide
what counts and whether it passed. Most of this file keeps those apart.

```
 round 0 (once)                         every round
 ──────────────                         ───────────
 scrape ─▶ diff --init ─▶ seed ledgers  scrape --compare ─▶ (reference moved? new baseline)
                │                         │
   separate agent classifies              pick one gap ─▶ ledger start (hypothesis, score snapshot)
   (checklist-brief.md)                   │
                │                         task run on both sides, before (task-template.md)
   user reviews scope                     │
                │                         implement ─▶ tests + census + renders
   diff --freeze ─▶ baseline              │
                                          diff --refresh ─▶ probe ─▶ diff (score.json)
                                          │
                                          task run, after ─▶ independent checker (checker-brief.md)
                                          │
                                          ledger close (hit / miss, from score.json) ─▶ commit
```

## Who does what

| role | does | must not |
|---|---|---|
| **classifier** (fresh agent, round 0) | splits the reference bullets into capabilities, classes them, fills evidence that already exists | implement anything later in the climb |
| **builder** (you) | picks the gap, writes the code, adds evidence tokens to the one capability it closes | add, remove, split or re-class capabilities after the freeze |
| **probe** (`probe.py`) | passes evidence only if the render changes or the named handle exists | — |
| **checker** (fresh agent, each round) | looks at the diff and the renders, says pass or fail | see the builder's summary before looking |
| **user** | approves the scope at round 0 and every `out-of-scope` | — |

If no subagent is available, say so in the round report and do the checker step
last, from the PNGs and the diff only, in a separate pass. Name it as
self-checked. The score is then not independent.

## Ground rules

1. **The reference is live.** Every session starts with a scrape and
   `--compare` against the last spec. A new or removed figure, or a changed page,
   is reported before anything else. A changed page means a new baseline for that
   figure.
2. **A capability is a teacher action**, taken from the page. It counts only when
   the probe passes it, and the probe accepts only behavioural evidence (a render
   that changes, a named handle) for everything but `output`.
3. **The denominator is frozen at round 0.** After `--freeze`, any change to a
   figure's capability ids, classes or text shows as drift and the score says
   `comparable: false`. Change it only with the user, then re-freeze and record a
   new baseline in the ledger.
4. **One gap per round, one figure, one commit.** Write the hypothesis before
   editing (`ledger.py start`). A round that changes three figures cannot say what
   moved the score.
5. **Don't regress the rest.** Census hashes for untouched figures stay
   identical; a deliberate shared change lists the changed ids.
6. **Original work.** The reference supplies scope and the idea of a control;
   never its code, assets or copy. Screenshots of it are evidence only.
7. **Not-doing is written down** in `assets/not-doing.md`, approved by the user.

## Setup

Work in the verSHion checkout itself. Another session may be using it, so do not
switch branches or stash its files; stage only your own paths.

```bash
REPO=/home/shuff57/Documents/GitHub/verSHion
SKILL=/home/shuff57/Documents/GitHub/agent-evo/skills/figures-parity-climb
SCRATCH=$REPO/.figures-parity          # gitignored: raw HTML, renders, old specs
OUT=$REPO/docs/figures-parity          # committed: ledgers, frozen.json, score, diff, rounds, tasks
cd "$REPO"
```

Read `references/taxonomy.md` before touching a ledger and
`references/vershion-map.md` before touching Rust.

## Step 1: scrape and compare (every session)

```bash
[ -f "$SCRATCH/scrape/spec.json" ] && cp "$SCRATCH/scrape/spec.json" "$SCRATCH/spec-prev.json"
python3 "$SKILL/scripts/scrape.py" --out "$SCRATCH/scrape" \
  $( [ -f "$SCRATCH/spec-prev.json" ] && echo --compare "$SCRATCH/spec-prev.json" )
```

It writes `raw/`, `text/<site>/<slug>.txt` (for people), `spec.json` (bullets,
control text, `text_sha256` per page) and `compare.md`. It exits 1 if any page
failed to fetch. Treat a fetch error as "unknown", never as "removed".

Read `compare.md` first. A **new figure** goes to the user as news and into
`assets/map.json` (an id we have, or `null`). A **changed** page breaks that
figure's freeze; tell the user before scoring.

## Step 2: diff

```bash
python3 "$SKILL/scripts/diff.py" --spec "$SCRATCH/scrape/spec.json" --repo . --out "$OUT" --refresh
```

`--refresh` rebuilds `ours.json` from the app: params (`VERSHION_FIGURE_CATALOG`),
the handle list at the opening state (`VERSHION_FIGURE_HANDLES`) and the label-drag
list. Pass it after any change under `src/`; the probe refuses a stale snapshot.

`diff.md` lists, in order: pages **not in map.json** (a new reference figure or
a nav page; decide and fix the map), the per-site table with keyword hints, the
reference figures we do not have, and the score. The hints are keyword matches.
The ledger and the task run are what count.

## Step 3: round 0, once

1. `diff.py … --init` seeds `capabilities/<id>.json`: one unclassified entry per
   bullet, with `suggest` (our params sharing words with it). Cross-listed cards
   are seeded once, at home.
2. Hand `references/checklist-brief.md` to a **fresh agent** with the paths
   filled in. It splits, classes and fills existing evidence, runs probe + diff,
   and reports scope questions. It does not freeze.
3. Show the user the class counts, every `out-of-scope` with its reason, and the
   scope questions. Apply their answers, and only those, to the ledgers and
   `not-doing.md`.
4. Freeze and take the baseline:

```bash
python3 "$SKILL/scripts/probe.py" --repo . --out "$OUT"
python3 "$SKILL/scripts/diff.py" --spec "$SCRATCH/scrape/spec.json" --repo . --out "$OUT" --freeze
```

`--freeze` refuses while any page is unmapped, any ledger is missing or has an
unclassified entry, or an `out-of-scope` has no reason. Commit `docs/figures-parity/`
with the baseline pooled score in the message.

## Step 4: pick the gap

In this order:

1. The figure the user named.
2. A reference figure we do not have (`figures_missing` in `score.json`): a
   new-figure round via `docs/new-figure.md` (registry, FAQ, opening state, an
   example). It needs its own classified ledger, added with the user and
   re-frozen, before its capabilities count.
3. The editor figures' `editor` gaps (`transformations`, `circle`,
   `composite-shape`, `organic-structure`), since they are the biggest interaction gaps.
4. The highest-weight gap (top of `gaps` in `score.json`) in the lowest-scoring
   figure a teacher uses often. Not the cheapest one.

Open the round:

```bash
python3 "$SKILL/scripts/ledger.py" start --dir "$OUT" --round <n> --figure <id> --capability <cap id> \
  --hypothesis "Adding <capability> lets a teacher <task>; evidence <tokens>; expected <id> +<k>"
```

If it needs a new `Kind`, a handle or a shared change, say so in the hypothesis.
A dead control is worse than a missing one.

## Step 5: task run, before

Fill `references/task-template.md` into `$OUT/tasks/<id>/round-<n>/` with one
teacher task tied to the capability. Run it on the reference with `playwright-cli`
(throwaway session `parity`) and on our app with the QA hooks under Xvfb.
Record actions, whether it finished, and how the input differs. This is the
semantic diff: it often shows the real gap is *how* (click on the grid vs type a
spec), which the bullets never say. If the run shows the hypothesis is wrong,
fix the hypothesis before coding, not the ledger.

## Step 6: implement

`references/vershion-map.md` has where things land. In short: controls in
`params()`; drawing in `render()` (pure, `svg::Doc`); student copy via
`answers_param()`; Print via `svg::style_param()` + `Fills` (grey only); opening
state in `start.rs`; FAQ in `faq.rs`; handles in `interact.rs` + the subject's
`handles.rs` with a specific `tip`, and the id out of `NO_HANDLES`; data through
`Kind::Data`/`Kind::List` and the shared parsers. Every control must change the SVG.

Add the evidence tokens to the one capability you are closing. Edit nothing else
in the ledgers.

## Step 7: verify

```bash
cargo test --lib figures
VERSHION_CENSUS_BLESS=1 cargo test --release --lib census_baseline   # only for an intended render change
git diff --stat tests/fixtures/figure_census.txt                      # list every changed id
python3 "$SKILL/scripts/diff.py" --spec "$SCRATCH/scrape/spec.json" --repo . --out "$OUT" --refresh
python3 "$SKILL/scripts/probe.py" --repo . --out "$OUT" --renders "$SCRATCH/renders" --strict
python3 "$SKILL/scripts/diff.py" --spec "$SCRATCH/scrape/spec.json" --repo . --out "$OUT"
```

Render the student copy and Print yourself too:

```bash
target/debug/vershion  # with VERSHION_RENDER_FIG=<id> VERSHION_FIG_PARAMS='{"show_answers":false}' VERSHION_OUT=$SCRATCH/renders/<id>/student.png
```

Then run the task again (`ours-after/`), and hand `references/checker-brief.md`
to a **fresh agent** with the round's sha, capability and paths. Do not give it
your summary.

## Step 8: close and commit

```bash
python3 "$SKILL/scripts/ledger.py" close --dir "$OUT" --round <n> \
  --checker "<the checker's first line, verbatim>" \
  --evidence "<tests result; census ids changed; task: ref N actions, ours M→K>" --next "<id cap>"
```

`close` reads the score from `score.json`. It refuses a score or probe older
than the round, and writes **hit** only if the capability passes the probe, the
checker said pass, and the figure score rose. Otherwise it writes **miss**, and
the miss stays. Commit the code and `docs/figures-parity/` together, one round per commit.

## Stop rules

Stop and say which applies:

- the session's target is reached;
- two consecutive rounds are misses (no hit: the capability failed the probe or the checker,
  or its figure's score did not rise). A single-capability round moves the pooled score by
  0.1 or so, so the pooled gain is reported but is not a stop signal (owner decision 2026-11-08);
- the remaining gaps all need a design decision (ask, don't guess);
- the reference moved (`compare.md`) and the user has not agreed a new baseline;
- a test or census regression cannot be fixed inside the round.

One figure at 100 with the rest at 20 is not done; the pooled score and the
per-figure table are both reported.

## Report shape

```md
## Round <n>: <figure> <cap id> (<class>)
Hypothesis: …
Task: reference <N> actions · ours <M> → <K> (<finished?>)
Changed: <files>
Probe: <pass/fail + why> · checker: <verdict line> · tests: <commands, result> · census: <changed ids or none>
Score: <figure before → after> · pooled <before → after> · comparable <yes/no>
Next: <highest remaining gap>
Not checked: <e.g. no live drag test in the browser build; handles only at the opening state>
```

Final report: baseline → final pooled score, the ledger table, the top
remaining gaps, new reference figures seen, and the not-doing list.

## Failure modes

- **The page text is not the whole control.** Hidden gear menus show up in the
  task run, not the bullets. Add a capability from a task run only with the user
  and a re-freeze.
- **A passing probe can still be wrong.** `changes:` proves the drawing moved,
  not that it moved correctly. That is the checker's job: one value checked by hand.
- **Handles are read at the opening state.** A handle that only appears after a
  setting changes can't be evidenced yet. Note it; don't fake it with `symbol:`.
- **Denominator games.** Moving something out of scope, splitting a bullet
  differently, or re-classing it all show as drift. The freeze makes them visible,
  not impossible; the user approves each one.
- **Editor vs generator.** Don't mark a generator's control `editor` because the
  reference has a nicer UI; `editor` is for pages that are editors.
- **Census regressions are silent** without `census_baseline`. A changed hash for
  an untouched figure is a regression.
- **Shared checkout.** Another session (e.g. the UI hill climb) may have files in
  the tree. Stage by path; never `git add -A`, stash or switch branches.

## Files

- `scripts/scrape.py`: fetch, text, spec, `--compare` against an older spec.
- `scripts/diff.py`: `ours.json` (catalog + handles), map statuses, `--init` seeds, `--freeze`, `score.json`/`.md`.
- `scripts/probe.py`: behavioural evidence (`changes:` renders, named handles), class rules, renders kept for the checker.
- `scripts/ledger.py`: `start` and `close`, with numbers from `score.json`.
- `scripts/lib.py`: class weights, hashes, build helpers.
- `assets/map.json`: reference page → our figure id (`null` = we don't have it).
- `assets/not-doing.md`: approved scope refusals.
- `references/taxonomy.md`: classes, weights, evidence tokens, scoring.
- `references/vershion-map.md`: where a capability lands in `src/figures`, and the headless hooks.
- `references/checklist-brief.md`: round-0 brief for the classifier.
- `references/checker-brief.md`: per-round brief for the checker.
- `references/task-template.md`: the two-sided interaction task.
- `references/interaction-template.md`: a six-axis summary per figure (optional, for planning).
