# Brief: write the round-0 capability ledgers

Give this to a **fresh agent that will not implement anything** in the climb. It
writes the denominator; the builder must not. Paste it with the paths filled in.

---

You are classifying what teachers can do on four reference figure sites, so a
later climb can be scored against it. You are not changing any code and you will
not be the one implementing gaps. Being generous to verSHion makes the climb look
better and is the failure this step exists to prevent.

Inputs:
- `<SCRATCH>/scrape/text/<site>/<slug>.txt` — each reference page's controls and
  "What you can set" bullets (read the page text, not just the bullets).
- `<REPO>/docs/figures-parity/capabilities/<id>.json` — seed files: one entry per
  bullet, `class: "unclassified"`, plus `suggest` (our params that share words).
- `<REPO>/docs/figures-parity/ours.json` — our params and `handle_list` per figure.
- `<SKILL>/references/taxonomy.md` — classes, and what a capability is.
- `<SKILL>/assets/not-doing.md` — the only allowed reasons for `out-of-scope`.

For every seed file:

1. **Split** each bullet into separable teacher actions. "Color, black-and-white,
   or white bars to shade" is three. Give split entries ids `cap-03a`, `cap-03b`…
   Keep the reference's meaning; write `text` in your own words, one action each.
2. **Classify** each with exactly one class from the taxonomy. Class decides the
   weight; there is no weight field.
   - It is `editor` only when the reference page is an editor (points/rows/pieces
     added by clicking or dragging). Do not mark a generator's control `editor`.
3. **Evidence, only where it already exists.** Fill `evidence` for a capability
   only if verSHion clearly has it today, using the tokens in `scripts/probe.py`.
   A `core`/`control`/`version`/`editor` entry needs a behavioural token
   (`changes:<key>=<value>` that should alter the drawing, or a `handle:` /
   `handle-edit:` / `label-drag`); `interaction` needs a handle token. Leave it
   empty when unsure. The probe will reject what it cannot verify; do not guess
   param names, read `ours.json`.
4. **Out of scope** only with a matching `not-doing.md` line, quoted in `note`.
   If you think something should be refused and no line covers it, leave it in
   scope and list it in your report as a decision for the user.
5. Delete the `suggest` field when done.

Then run, from `<REPO>`:

```bash
python3 <SKILL>/scripts/probe.py --repo . --out docs/figures-parity
python3 <SKILL>/scripts/diff.py --spec <SCRATCH>/scrape/spec.json --repo . --out docs/figures-parity
```

Read every `FAIL` line. A failure is either a wrong token (fix the token) or a
capability we do not have (clear the evidence). Never edit Rust to make one pass.

Report: figures done, capability count per class, every out-of-scope entry with
its reason, every scope question for the user, and the probe's pass/fail counts.
Do not run `--freeze`; the user reviews the scope first.
