---
name: ui-hill-climb
description: Raise a desktop or web UI's design score by blind A/B grading against a reference app, one measured round at a time. Use when asked to make an app look better than another app, to "push the UI score to X", to run a design critic panel, or when a UI change needs to be judged by something other than the person who made it.
---

# UI hill climb

A loop that turns "make it look better" into a number you can trust: screenshot the app, grade it
blind against the reference by independent critic models, read the one gap each critic names, fix
that, shoot again. The builder never scores its own work.

The loop is worth nothing without the honesty scaffolding. Most of this file is that scaffolding,
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
   N critics (multimodal, different labs) ──▶ one JSON line per item
        │
        ▼
   analyze.py  ── control error FIRST, then votes, then means
        │
        ▼
   read the named gaps ──▶ fix the top one or two ──▶ capture again
```

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
| `scripts/analyze.py` | parses verdicts, prints controls → mirrors → votes → per-screen means → dimensions |
| `scripts/critic.md` | the prompt; `OUTFILE` is substituted per judge |

Run:

```bash
python3 make_blind.py <shots_dir> <blind_dir>
python3 verify_blind.py            # must print OK; do not grade otherwise
bash run_critics.sh                # one detached `t3 thread start` per model, one .jsonl each
python3 analyze.py > rN-analysis.txt
```

Each critic starts a fresh thread with `--provider opencode --model ollama-cloud/<model> --wait
--json`, its prompt piped in, writing its verdicts to its own file. Five judges is enough; three is
too few to separate a real 0.3 from noise.

## Choosing judges

Probe every candidate before it earns a seat: hand it one screenshot and ask for a detail only
visible in the image (a displayed name, the word inside a status tag). Reply `NO_IMAGE` or a guess →
rejected. Measured: `gemma4:31b` and `glm-5.3` cannot read images at all; `deepseek-v4-pro` cannot
run under the default token budget.

Use models from different labs — agreement across labs is evidence, agreement within one family is
not. Expect a scale spread of up to 2 points between judges on the same image (deepseek ~5.9,
mistral ~7.9 in one round); never compare means across a changed panel.

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

## Pitfalls, all measured

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

## Report shape

Per round: the mean (as a range), the vote count, the per-judge control error, then a table of
per-screen means and the named gap on the weakest three. Keep a running per-screen table across
rounds — it is the only way to see which fix actually paid.
