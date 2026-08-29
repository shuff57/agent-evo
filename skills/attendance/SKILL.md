---
name: attendance
description: Cross-check a MyOpenMath section's login log against an Aeries attendance period to find students who were not working during class, and optionally mark them absent. Use when asked to take, check, or backfill attendance from MyOpenMath activity, or to find who was not logged in during a class period.
---

# Attendance from MyOpenMath activity

App-managed file. It is rewritten from `skills/attendance/SKILL.md` in the S.T.E.V.E repo every
launch, so edit it there, not here.

Both sites are already open as tabs in the app's embedded browser. This skill reads MyOpenMath's
per-student **login log**, compares each login against the **class period window Aeries itself
reports**, and lists who has no login inside it.

```
Aeries tab                          MyOpenMath tab
  ddlDate     8/25/2026               listusers.php?cid=<cid>
  PeriodList  4 (10:11 AM - 11:40 AM)   └─ one "Login Log" link per student
  chkA rows   22 students                    │
      │                                      ▼
      │                              viewloginlog.php?cid=&uid=
      │                              full timestamp history
      ▼                                      │
   match on name  ◀───────────────────────────┘
      │
      ├── ≥1 login inside the window ──▶ present
      ├── no login inside the window ──▶ candidate absent   (report, do not assume)
      └── no MOM account / two matches ▶ SKIP — a human decides
```

## Run it

```bash
node C:/Users/shuff57/Documents/steve-desktop/steve-desktop/scripts/attendance.mjs --cid <momCourseId> --port <cdpPort>
```

Dry run by default: it prints the table and writes nothing. `--apply` ticks the boxes; if the
period was already submitted it *also* needs `--amend`.

**The day and the period come off the Aeries page as loaded — the script never sets them.** Put
Aeries on the right date and period in the app window first. That way what is on screen is what
gets written, and there is no second place for the two to disagree.

Get the CDP port from the app's launch log (`CDP enabled on port <N>`); **it changes every
launch** — it was 9223 on one start and 9222 on the next that same hour.

## The course ids

Read them off `myopenmath.com/index.php` rather than this table; a section id changes each year.
As of 2026-08-25:

| Period | Course | cid |
|---|---|---|
| 3 | Intro to Stats | `339304` |
| 4 | Intro to Stats | `334243` |
| 6 | Integrated Math 1 | `340140` |
| 7 | Intro to Stats | `339625` |

Period 5 is Intro to Programming — it lives in the shCode app, **not** MyOpenMath, so this skill
cannot say anything about it. Period 8 is out of scope (Steve, 2026-08-21).

Block schedule: odd periods (3, 5, 7) one day, even (4, 6, 8) the next. Aeries' own `PeriodList`
only offers the periods that actually meet that day — trust it over any bell-schedule file, which
cannot know about an assembly or a minimum day.

## What will bite you

**Aeries has no Save button. The click IS the write.** Every `chkA` carries an inline
`onclick="...TeacherSetATT(...)"` that posts immediately over AJAX. There is no review step and no
undo. So a click must never be speculative, and `.checked = true` is *worse* than useless: it fires
no handler, saves nothing, and leaves the box looking ticked — a silent no-op that reads as success.
Click the element for real.

**Check whether it was already submitted.** The banner reads `Attendance submitted at
<date> <time>`. If it is there, the teacher already took attendance by hand, and ticking a box
amends a filed record rather than creating one — which usually means the human already decided
that student was present. The exact string matters: matching `Attendance for today` (which is what
it looks like it should say) reports "not submitted" for a period that was.

**"Last Access" on the roster is not enough.** It is only the *most recent* login. A student who
worked through the period and logged in again at lunch shows a post-class time and reads as absent.
Use the per-student login log, which lists every login.

**Names do not match across the two systems.** Aeries carries legal names, middle initials, and
nicknames in parentheses; MyOpenMath carries whatever the student typed, in whatever case.

| Aeries | MyOpenMath |
|---|---|
| `Gonzalez, Elizabeth G. (Ellie)` | `Gonzalez, Ellie` |
| `Ando, Benjamen M.` | `Ando, Ben` |
| `Guadiana, Chloe M.` | `guadiana, chloe` |
| `Ecklund, Logan D. NEW` | *(no account)* |

Match on last name plus first-name-or-nickname-or-prefix. When one Aeries row matches two MOM
students, **refuse** — guessing marks the wrong child absent.

**Filter the empty cells before indexing the row.** The Aeries roster row is
`[seat, studentId, name, grade]` only after dropping the spacer `<td>`s. Index the raw cells and
the student ID lands where the name goes, every name matches nothing, and the output claims the
whole class has no MOM account. It fails loudly rather than marking the wrong people, but it wastes
a run.

**The rosters genuinely differ.** A new student has no MOM account yet; a student who moved
sections is still in the MOM course but off the Aeries roster. Report both lists; never mark
someone the other system does not know about.

## The part that is not a technical problem

**A MyOpenMath login is a proxy for presence, not presence.** A student sitting in the room who
worked on paper, whose Chromebook died, who forgot their password, or who finished early and closed
the tab produces exactly the same empty log as one who never showed up. Marking a present student
absent means a truancy record and a call home about a child who was there.

So: this skill produces a **candidate list for a human**, not a verdict. Print the names and the
evidence, hand them to Steve, and let him say yes. He was in the room; the log was not.
