# Where a capability lands in verSHion

The climb edits `/home/shuff57/Documents/GitHub/verSHion` (the main checkout).
Never edit a `.claude/worktrees/...` copy; those belong to other sessions.

## The shape of a figure

A figure is one `FigureDef` in `src/figures/`:

```rust
FigureDef {
    id, subject, title, blurb,
    params: fn() -> Vec<ParamDef>,
    render: fn(&Params) -> String,   // pure, deterministic, one standalone SVG
}
```

`src/figures/mod.rs` holds `Value`, `Kind`, `ParamDef`, `Params`, `FigureDef`,
`registry()` and the shared `answers_param()` / `SHOW_ANSWERS` contract.
`docs/new-figure.md` is the short contract; `docs/figures-conventions.md` has
the drawing and Print rules. Read both before adding a figure or a new `Kind`.

## The files a capability usually touches

| Need | File / symbol |
|---|---|
| the controls | the figure module's `params()` — `ParamDef::float/int/bool/choice/text/long/list/data/color` |
| the drawing | the module's `render()` using `svg::Doc` |
| opening state | `src/figures/start.rs::overrides(id)` |
| named examples | the subject's `examples(id)` (and `classic_setups`) |
| FAQ | `src/figures/faq.rs` — an arm and 4–6 entries (test enforces this) |
| drag handles | `src/figures/interact.rs` (`handles_for`) and the subject's `handles.rs`; remove the id from `NO_HANDLES` when you add one. Give each handle a specific `tip` ("Drag vertex B"): the probe's `handle:` token matches on it |
| draggable labels | `src/figures/labels.rs` (`FIGURES`, `wrap`) |
| answer / student copy | `figures::answers_param()` and `p.b(SHOW_ANSWERS)` |
| colour vs Print | `svg::style_param()` + `svg::Fills` (Print must be grey-only) |
| numbers typed as data | `ParamDef::data` + `figures::data::{numbers,pairs}` |
| shared axes/grid | `chart::{Frame, AxesOpts, axes, ticks, nice_step}` |

A new figure also needs `pub mod <name>;` and `v.extend(<name>::defs());` in
the subject module, and an entry in `registry()` if it is a new top-level
module. The census fixture and the FAQ test will catch the rest.

## Existing figure ids for reference slugs

`assets/map.json` is authoritative. The surprising ones:

- `cumulative-frequency` → `ogive`
- `bar-graph` → `bar-chart`
- `length-reading` → `ruler-reading` on the Math tab, `length-reading` elsewhere
- `potential-energy-diagram` → `reaction-energy-diagram`
- `enzyme-activity` → `enzyme-kinetics`
- `photosynthesis-rate` → `photosynthesis`
- `structure-editor` → `organic-structure`
- `pie-chart`, `dna-protein-synthesis`, `osmosis` → **not built**

## Editor-style figures

Three reference figures are full editors, not generators. They need structural
work, not one more checkbox:

- `transformations` — vertices typed/clicked, a list of transformations, any
  line/centre, Student/Question/Answer key.
- `circle` — arbitrary points and lines, external tangents, per-line style.
- `composite-shape` — pieces added to a side and dragged. We have a spec
  language (`docs/composite-shape.md`) and `math_plot::handles`; reuse it.

`organic-structure` is the same situation on the Chemistry tab.

## Headless hooks the scripts use

| hook | what it gives |
|---|---|
| `VERSHION_FIGURE_CATALOG=1` | every figure's params, kinds, options and defaults (`ours.json`) |
| `VERSHION_FIGURE_HANDLES=1` | every handle at the opening state: `id`, actions (drag/click/scroll/label), inline-edit key, tip |
| `VERSHION_RENDER_FIG=<id> VERSHION_FIG_PARAMS=<json> VERSHION_OUT=<png>` | one render from the opening state plus overrides (`changes:` evidence) |
| `VERSHION_SCREEN=figures VERSHION_FIG=<id> VERSHION_SCRIPT=… VERSHION_SHOT=<png>` under `xvfb-run` | our side of the interaction task |

`VERSHION_FIG_PARAMS` sets values by JSON type (a float param needs `5.0`, not
`5`); the probe coerces from the param's kind.

## Verify a change

```bash
cd /home/shuff57/Documents/GitHub/verSHion
cargo test --lib figures
cargo test --lib figuresui
# one figure to PNG (default, student, Print):
VERSHION_RENDER_FIG=<id> VERSHION_OUT=/tmp/opencode/fig.png cargo run --quiet --bin vershion
VERSHION_RENDER_FIG=<id> VERSHION_FIG_PARAMS='{"show_answers":false}' VERSHION_OUT=/tmp/opencode/fig-student.png cargo run --quiet --bin vershion
VERSHION_RENDER_FIG=<id> VERSHION_FIG_PARAMS='{"style":"Print"}' VERSHION_OUT=/tmp/opencode/fig-print.png cargo run --quiet --bin vershion
```

Look at the PNGs. Then run the relevant tests, not only `cargo check`.

If the render of an existing figure changed on purpose, regenerate the census
with `VERSHION_CENSUS_BLESS=1 cargo test --release --lib census_baseline` and
review the changed ids. A deliberate new figure only adds lines; any changed
existing line is a regression to explain.

## Things not to do

- Don't change `src/figures/mod.rs` shared behaviour for one figure unless the
  census diff is explained.
- Don't add a handle without the `handle_coverage_report` test passing; don't
  leave a figure out of `NO_HANDLES` with no handles.
- Don't make `render` read time, randomness, the network or the filesystem.
  Randomness comes from a seed param.
- Don't copy the reference's code, assets or copy. Draw original art; the
  reference is for scope and the controls' *ideas*.
- Don't claim a capability from a `ParamDef` alone; render it and look.
