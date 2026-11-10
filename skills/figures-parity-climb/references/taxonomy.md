# Capability taxonomy

The diff is only useful if "missing" means the same thing every round. This file
defines the classes, the weights, and the evidence that can close a capability.

## What counts

A **capability** is one thing a teacher can do with the reference figure that
changes what the figure shows or how they set it. Take them from the page's
"What you can set" bullets; split a bullet when it lists separable things
("colour, black-and-white, or white sectors" is three capabilities, not one).

Do **not** make a capability out of:

- marketing copy, page chrome, breadcrumbs, the other sites' cards;
- "Save preset" stored in their browser (we have share links and saved figures);
- a control that changes only the reference's page layout;
- a different visual style with no interaction or teaching effect.

Put anything deliberately refused in `assets/not-doing.md` and mark the
capability `class: out-of-scope`. It then leaves the denominator. That is the
only honest way to keep the score from drifting toward taste.

## Classes and weights

The class sets the weight (`scripts/lib.py`); a ledger has no weight field.
Weight a capability by choosing its class honestly, not by editing numbers.

| class | weight | what it means | examples |
|---|---:|---|---|
| `core` | 5 | the measurement, data, or result that defines the figure | any three triangle measures; a data table; a typed equation; the five solvers |
| `editor` | 4 | a structural interaction that makes the figure an editor rather than a generator | click to add a point; drag a vertex; add a transformation; add a row/column |
| `control` | 3 | per-element or presentation control a teacher reaches for | per-series colour/hatch; per-axis range; unit; rounding; label mode; blank row |
| `version` | 3 | the student / question / answer-key model | separate Question version; blanks; answer key |
| `interaction` | 2 | direct manipulation that saves typing but has a param equivalent | drag a label; drag the object along the ruler; scroll the time span |
| `output` | 1 | transport, not teaching | share link; PNG/SVG; print just the figure |

A generator figure with every core capability but no editor gets a high score,
correctly: it does its job. The editors (`transformations`, `circle`,
`composite-shape`, `structure-editor`) are scored on `editor` capabilities
because that is what the reference is.

## Evidence

A capability is counted only when `probe.py` passes its evidence against the
built app. Tokens, joined with ` + ` (all must pass):

| token | passes when | behavioural |
|---|---|:---:|
| `changes:<key>=<value>` | rendering with that value differs from the opening state (PNG bytes) | yes |
| `changes:{"k":v,…}` | same, several params at once | yes |
| `handle:<drag\|click\|scroll\|label\|any>:<tip text>` | a handle at the opening state has that action and a tip containing the text | yes |
| `handle-edit:<key>` | a handle edits `<key>` inline | yes |
| `label-drag` | the figure is in `labels::FIGURES` | yes |
| `ui-test:<module::path::test>` | that Rust test exists in a file naming the figure id, and passes when run | yes |
| `param:<key>`, `param-choice:<key>=<opt>` | the control exists | no |
| `show-answers`, `style`, `label-size` | the standard switch exists | no |
| `symbol:<path>:<text>` | the text is in that file, and the file names the figure id | no |

Class rules: `core`, `control`, `version` and `editor` need at least one
behavioural token; `interaction` needs a handle token or `ui-test:`; `output` takes any.

`ui-test:` is for a figure the workspace edits with its own canvas editor instead
of figure handles (composite-shape): the probe cannot see that canvas, so the
evidence is a workspace test that drives the action through the canvas. Use it
only where the figure has no handle path the teacher sees; never add handles the
app does not show just to satisfy the probe. The round's checker reads the test
and judges that it performs exactly the action the capability names.
So a version capability is `changes:show_answers=false`, not `show-answers`, and a
"drag a vertex" capability names the handle, not merely "has handles".

`changes:` catches a dead control mechanically, but not a *wrong* one: the
round's independent checker (`checker-brief.md`) looks at the two PNGs the probe
compared and at the student and Print renders.

Handles are read at the figure's opening state (`VERSHION_FIGURE_HANDLES=1`). A
handle that appears only after the teacher changes a setting cannot be evidenced
yet; say so in `note`.

## Scoring

```
figure score = 100 × Σ weight(probe passes) / Σ weight(in scope)
```

Report the mean over scored figures and the per-figure table. `diff.py` reports both the
**pooled** score (Σ got / Σ total over the frozen figures, the number the climb
moves) and the per-figure mean, plus how many reference figures are built at all
(a missing figure is outside the weighted score, so coverage is reported beside it).

A score is comparable only with `frozen.json` in place and no drift: the same
figure set, the same capability ids and classes per figure, the same `map.json`
and `not-doing.md`, and the same extracted page text. `score.json` says
`comparable: false` and lists the reasons otherwise. A changed reference page
means a new baseline, recorded as such; never compare across it.

## The one-gap rule

Each round fixes **one capability on one figure**, or at most two small ones in
the same figure. A round that rewrites three figures cannot say which change
moved the score and is not a hill climb. Record the hypothesis before editing:

> Adding `<capability>` lets a teacher `<do the task>`; evidence will be
> `<param/handle>`, and the score should move by `<estimate>`.

If the score does not move, the round is a miss. Leave it in the ledger.
