# Interaction task — `<id>` round `<n>`

This is the actual "how do they interact vs how do we" diff. The scrape tells
you what a page says it can do; this runs one teacher task on both sides and
counts what it takes. Do it for the round's figure only, once before the change
(baseline) and once after.

Evidence folder: `docs/figures-parity/tasks/<id>/round-<n>/` with `ref/`,
`ours-before/`, `ours-after/` (one PNG per step, named `01-<verb>.png`) and this
file filled in. Keep PNGs small (one per step, no video).

## The task

One sentence a teacher would say, tied to the capability, e.g. *"Draw triangle
ABC, reflect it over y = x, then give me the student copy without the image."*

Steps are teacher actions: a click, a drag, a typed value, a menu choice. A
keystroke run typed into one box is one action.

## Reference side (`playwright-cli`)

```bash
playwright-cli -s=parity open https://www.mathfigures.com/<slug>
playwright-cli -s=parity snapshot            # find the controls
playwright-cli -s=parity click <ref>          # one line per action
playwright-cli -s=parity screenshot --filename=<dir>/ref/01-<verb>.png
playwright-cli -s=parity close                # throwaway session; never 'mom'
```

The reference is a public page: no login, no profile. Do not save its assets,
code or copy into the repo; screenshots stay as evidence of behaviour only.

## Our side (the app's QA hooks, under Xvfb)

```bash
cd <REPO> && cargo build --quiet --bin vershion
S=$(mktemp -d)
VERSHION_STORE_DIR=$S VERSHION_WINSIZE=1280x800 VERSHION_SCREEN=figures VERSHION_FIG=<id> \
VERSHION_SCRIPT='click:x,y;text:abc;key:Enter;wait' VERSHION_SHOT_FRAME=<60 + 10×steps + 30> \
VERSHION_SHOT=<dir>/ours-after/03-<verb>.png xvfb-run -a target/debug/vershion
```

egui draws to a canvas, so steps are coordinates in egui points; find them from
a first screenshot. One shot per process: re-run with the script cut at step k
for the k-th screenshot. `VERSHION_FIG_PARAMS` may seed a starting state, but
then say so: a seeded value is an action the teacher did not have to take.

## Result

| | reference | ours before | ours after |
|---|---:|---:|---:|
| actions to finish | | | |
| finished? (yes / no / only by typing a spec) | | | |
| dead ends (an action that did nothing or had to be undone) | | | |

What differs in *how* (one line each): input method, what is direct
manipulation vs a panel control, what the student copy shows.

Verdict for the round: `fewer-or-equal actions and finished` / `finished, more
actions: <why>` / `not finished: <where it stopped>`.
