# mom-section-sync — master course → live teaching sections

App-managed file. It is rewritten from `skills/mom-section-sync/SKILL.md` in the S.T.E.V.E repo
every launch, so edit it there, not here.

`mom-transfer` gets a question from the repo into the **master course** (334437). This skill gets it
from the master into the **live teaching sections students actually sit**, and keeps their start and
due times correct against the bell schedule. It is the second half of the road, and it is the half
that touches real student data — everything below is written for that.

```
mom-content (git)  ──mom-transfer──▶  master 334437  ──THIS SKILL──▶  P3 339304
                                                                      P4 334243
                                                                      P7 339625
```

```json
{
  "task": "Sync an assignment from the master course into the live Stats teaching sections. Ask which assignment (a manifest path under mom-content/books/) if it is not stated, then follow the mom-section-sync procedure: reconcile each section's existing stub against the manifest, repair only what differs, audit the start/due times against the bell schedule, and report a per-section table. Never report a section as done without a fresh-navigation read-back."
}
```

## Read this first

- `mom-content/reference/transfer-rules.md` — the single rules file for BOTH skills. Its
  section-attach entries are this skill's history. **Append what you learn there, not to a new
  file**; two rules files disagreeing is worse than one long one.
- `mom-content/reference/bell-schedule-2026-27.md` — the authoritative clock. Never hardcode times
  from memory; every wrong-time defect on record came from a hardcoded time.

## The golden rule: ATTACH, never COPY

MyOpenMath has a course-copy feature. **Do not use it here.** The master is deliberately undated, so
copying it over a section would overwrite that section's real bell-schedule dates with nothing — and
those dates were hand-repaired on 2026-08-21 after 44 of 72 tests were found wrong.

An assessment does not contain questions; it **points at library ones**. So attaching the master's
own `qsetid`s into the section's existing stub gives the section literally the same library entry —
not a copy that can drift. The settings form is never opened, so dates cannot be touched *by
construction*, which is a much stronger guarantee than remembering not to touch them.

Assert it anyway: read `sdate/stime/edate/etime` and every `extreflinks[]` before and after, and
require them byte-identical. That assertion has never failed, which is exactly why it is cheap to
keep.

## The section map

| | master 334437 | P3 339304 | P4 334243 | P7 339625 |
|---|---|---|---|---|
| block | — | 3-or-4 | 3-or-4 | 7-or-8 |

Stubs already exist in every section — all 92 of them, with their dates and settings — because the
course skeleton was built long before the content. **You are filling a stub, never creating an
assessment.** If a stub seems to be missing, stop and ask; do not create one.

Period 3 and Period 4 share the 3-or-4 time slot, so they share a clock and differ only in date.
Period 7 is the 7-or-8 slot. Get which course sits in which period from
`bell-schedule-2026-27.md`, not from the section name.

## The flow

Everything is a **reconcile**, not a push: read what the section has, compare to the manifest, repair
only the difference. Run it twice and the second run should change nothing — that property is what
makes it safe to re-run after a partial failure, and it is worth checking deliberately.

```
1. read desired   manifest under mom-content/books/<book>/<kind>/<slug>.json
                    -> ordered [qsetid, points], must total exactly 100

2. read actual    course/addquestions.php?cid=<cid>&aid=<aid>
                    -> global `itemarray`, one row per attached item:
                       [instanceid, qsetid, description, qtype, points, ...]
                                0        1        2         3      4
                    -> `beentaken` (0/1) decides which points path is available

3. guard          empty  -> attach (step 4)
                  match  -> report "already correct", change NOTHING
                  differ -> repair only the differing rows; REFUSE to attach on top
                            of existing questions

4. attach         GET course/modquestion2.php?qsetid=<qid>&cid=<cid>&aid=<aid>
                      &from=addq&process=true&usedef=true          (one per question)

5. points         see "Two points paths" below — points NEVER travel with a qsetid

6. verify         fresh navigation, re-read itemarray: count, per-question points,
                  order, total == 100; then dates/booklinks unchanged
```

## Two points paths, and `beentaken` picks which

`usedef=true` does **not** give the master's points. Measured 2026-09-01: fifteen questions attached
into two sections came in at **9999 points each, total 149,985** — MOM's unset placeholder — and
every attach reported success. On an earlier push the same step produced 1 point each. Either way the
assignment is wrong and MOM never complains, so step 5 is not optional.

**Fast path (preferred).** `addquestions.php` is a client-side editor over `itemarray`, and its
`submitChanges()` POSTs order **and** points together to `addquestionssave.php` in one request. Set
`itemarray[i][4]`, sort into manifest order, call `submitChanges()`. Fifteen round-trips become one.

**But `submitChanges()` silently drops the points half of the payload when `beentaken` is truthy** —
it only includes `pts`/`extracredit`/`defpts` for an untaken assessment. The order saves and the
points do not. Read `beentaken` FIRST and refuse the fast path if set:

```js
if (beentaken) throw new Error('beentaken - use the per-question path');
```

**Slow path (required when `beentaken`).** One `modquestion2.php?id=<instanceid>&aid=&cid=` per
question: `points` is a hidden input, the page is **not** Vue, and either visible
`input[type=submit][value="Save Settings"]` commits. Use the native value setter, dispatch
`input`+`change`, click Save, then re-read from a fresh navigation.

**Instance ids are not consecutive.** Read them off `itemarray`, never generate them. Real runs:
period 4 ran `354238153`-`354238169` skipping `354238163`, and later `354583830`-`354583836` then
jumped to `354583842`.

`beentaken` is set by a student *opening* the assessment, not by scoring — two section practice tests
were `beentaken: 1` while still holding zero questions. Expect it on anything already open to
students, which on a live section is most things.

## Bell-schedule audit — run it every time

The most expensive defect class on record (44 wrong tests, 2026-08-21) is a date whose time-of-day
belongs to a different kind of day. **Wednesday is a different schedule and it is the one that keeps
getting missed.** Minimum days (Oct 27, Jan 26, Mar 2) are a third schedule.

| block | regular (M/T/Th/F) | Wednesday | minimum day |
|---|---|---|---|
| 3-or-4 | 10:11 – 11:40 (+7 = 11:47 am) | 10:33 – 11:54 (+7 = **12:01 pm**) | 9:37 – 10:37 (+7 = 10:44 am) |
| 7-or-8 | 2:03 – 3:32 (+7 = 3:39 pm) | 2:09 – 3:30 (+7 = **3:37 pm**) | 11:56 – 12:56 (+7 = 1:03 pm) |

Tests open at period start and close **same day** at period-end + 7. Homework and practice are due at
period start.

The check that needs no knowledge of the assignment's kind: **derive the day-type from the date, then
require the time to be one of that day-type's three slot times.** A Wednesday date carrying
`10:11 am` is wrong no matter what kind of assignment it is, and that is exactly the shape every real
defect has taken. Report it as "Wed date but regular-day start → should be 10:33 am" so the fix is
unambiguous.

Audit **start and due, every assessment, every section** — not just the ones you touched. The 2026-08
defect was found only because a pattern broke at one chapter and was never backfilled; a sweep scoped
to today's assignment would have missed all 44.

## Long sweeps must be resumable

Reading ~92 settings pages per section takes minutes and **the CDP connection times out mid-run** —
it did on the first attempt at this, losing the whole sweep with `Runtime.evaluate timed out;
expression: document.readyState`.

Write each record to a JSONL file as it is read, `flush()` after every line, and skip ids already in
the file on restart. Then a timeout costs one page, not the run. Retry each page ~3 times before
giving up, and print which ids were given up on rather than letting them vanish.

The scripts that do this live in `mom-content/reference/section-sync/`:
`attach.py` (reconcile + attach + fast-path points), `fix-points.py` (slow path for `beentaken`),
`read-times.py` (resumable settings sweep). They are ordinary files and yours to edit.

## Enumerating a section's assessments

`course.php?cid=<cid>&folder=0` lazy-loads its blocks: the aids are **not** in the initial HTML
(2 of 92). Expand every collapsed block first, repeatedly, until none are left hidden:

```js
[...document.querySelectorAll('a[id^=blockh]')].forEach(h => {
  const t = document.getElementById(h.id.replace('blockh','block'));
  if (t && t.classList.contains('hidden')) h.click();
});
```

Then collect `a[href*="aid="]`, deduped — 92 per section. The gradebook exposes no aids and is full
of student PII; the calendar agenda gives due times but not start times and caps at 25 weeks. Neither
is a substitute.

## `addassessment2.php?id=`, never `?aid=`

The settings page for an existing assessment takes **`id`**. Every other URL in this flow takes
`aid`, so `?aid=` is the natural guess — and it returns 200, renders the full form, and populates it
with **blank-create-form defaults**. Read the wrong page and you invent defects that do not exist and
miss the one that does.

Before writing to any MOM form, confirm the target id appears in `form.action`. The submit button
reads "Save Changes" on the real page and "Create Assessment" on the impostor, but the action is the
proof — submitting the impostor creates a **duplicate assessment**.

## Student data

These are live sections with real rosters. The gradebook, the roster page and the calendar's
student-view selector all carry names — do not read them, do not screenshot them, and never put them
in a report or a log. Everything this skill needs is assessment structure: aids, qsetids, points,
dates. If a page you are on shows a student name, you are on the wrong page.

## Report honestly

One row per section: assessment, questions attached, points total, dates unchanged y/n, and how it
was verified. A section you did not re-read from a fresh navigation is reported **unverified**, never
as success. State the bell-schedule audit result separately, including the count swept — "0
mismatches across 92" and "not audited" must never look alike.

## Then reflect

Close every run with this, clean or not.

1. Collect anything that cost more than one attempt, anything that reported success and was not, and
   any selector, field name or URL you had to discover rather than read here.
2. Keep only what you proved. An honest "unexplained" beats a confident guess.
3. Write it into `transfer-rules.md` in the shape already there: what broke, the symptom you would
   recognise it by, the fix, and the concrete string that makes it findable.
4. **Correct what is already there** rather than appending a contradiction.
5. Promote on the third sighting — a failure seen three times belongs in this skill's body, which
   lives at `steve-desktop/skills/mom-section-sync/SKILL.md` in the repo, never the installed copy.

---

**This file is installed and maintained by S.T.E.V.E Desktop.** Edits to the copy under `~/.claude/`
are replaced on the next launch.
