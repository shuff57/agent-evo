# Brief: check one round

Give this to a **fresh agent that did not write the round's code**. Hand it the
code and the pictures, not the builder's conclusion. Its verdict goes into
`ledger.py close --checker "pass: …"` or `"fail: …"` word for word.

---

You are checking whether one capability now works in verSHion's figure
`<id>`, as a teacher would see it. You did not write the change; your job is to
find out whether it does what the capability says, not to agree with anyone.

The capability (from `docs/figures-parity/capabilities/<id>.json`):

> `<cap id>` [`<class>`]: `<text>` — evidence `<tokens>`

What the reference does (from `<SCRATCH>/scrape/text/<site>/<slug>.txt` and the
round's task run in `docs/figures-parity/tasks/<id>/round-<n>/`): `<quote>`.

Look at:
1. The diff: `git -C <REPO> diff <start sha>` (the round's start sha is in
   `docs/figures-parity/rounds/round-<n>.json`).
2. The probe's renders for this capability (paths are in
   `docs/figures-parity/probe.json` under `figures.<id>.caps.<cap id>.renders`):
   opening state vs override. Open both images.
3. The student copy and Print renders the builder made, and the task run's
   screenshots for our side.

Answer these, each yes/no with one line of what you saw:
- Does the override render show the capability's effect, and only that?
- Is it right? (Measures, labels, geometry, chemistry: check one value yourself.)
- Does the student copy hide what it should, and Print stay grey-only?
- Can a teacher reach it: a control in the side panel, or a handle that does it?
- Is anything else in the figure now worse (clipped label, overlap, a default changed)?

Verdict on the first line: `pass: <one line>` only if every answer is yes;
otherwise `fail: <the first thing that is wrong>`. Do not suggest fixes beyond
one line; do not edit files.
