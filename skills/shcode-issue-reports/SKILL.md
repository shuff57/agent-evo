---
name: shcode-issue-reports
description: Work through the student issue reports filed in shCode (the Report button, /teacher/issues): pull the queue, triage each report, mark it in progress, fix and verify it (tests, a real browser, the live site), deploy, then mark it fixed or deferred with a plain note the student can read. Use when asked to "address student issues", "work the issue reports", "what's left in the reports", "check the queue", "close out reports", or names a report number (#88). Also grows itself: every time the owner has to ask for a check the run should have done, it records the lesson here.
---

# shCode student issue reports

Students file reports from any page with the Report button. Each one is a row in the production D1 table
`issue_reports` (status `open | in-progress | fixed | deferred`, plus a `resolution_note` the reporting student
sees next to the status). This skill is the whole loop: queue -> triage -> mark in progress -> fix -> verify ->
deploy -> mark closed with a note -> report -> reflect.

The repo is `~/Documents/GitHub/shCode-deploy` (branch `cs-3d`). Read its `CLAUDE.md` before changing code: it is
long and it is right.

## 0. Before anything: read the lessons

Read `references/lessons.md` first, every run. Each entry is something the owner once had to ask for. Follow
every rule in it as if it were in this file. They are the reason this skill exists in its current shape.

## 1. Pull the queue

```bash
S=~/.claude/skills/shcode-issue-reports/scripts
node $S/issues.mjs counts                 # open / in-progress / fixed / deferred
node $S/issues.mjs list                   # open + in-progress (default); also: list deferred | all
node $S/issues.mjs show 88,89             # message, page, lesson, browser, screen, note, the code they had open
```

It reads production D1 through the repo's `npm run d1` wrapper (wrangler is already logged in; no password is
involved, never ask for one). `scripts/pull-issues.mjs` in the repo does the same over the API but needs a teacher
password in the environment; do not use it unless the owner sets that up.

Also re-check deferred reports whose reason may have changed (a feature now exists, a lesson was rewritten).

## 2. Triage each report

For each report, read the message AND the context (`show`): the page, lesson id, the student's own code at the
time, their screen size and browser. Reproduce it before deciding: the lesson on the dev server, or the live site
with a throwaway account (section 5). Then put it in one bucket:

| Bucket | What to do | Ends as |
| --- | --- | --- |
| Real bug | fix it | fixed |
| Grader refused a correct answer | loosen the check (grading here is lax by design: accept any phrasing of a correct idea) and pin it in `scripts/test-grader-tolerance.mjs` | fixed |
| Lesson text wrong or unclear | fix the words; never ask a student for something not taught on an earlier screen | fixed |
| Feature request (enhancement) | it is the OWNER's decision: ask with AskUserQuestion, 2-4 concrete options, recommended first | fixed / deferred |
| Already done by something that shipped | say where it is, in student words | fixed |
| Works as intended | explain kindly why, and what to do instead | deferred |
| Cannot tell what they meant | ask one specific question in the note | deferred |
| Noise ("never mind", a test) | short kind note | deferred |

The owner likes being asked with choices for anything that is a decision rather than a defect. Bundle several
such questions into one AskUserQuestion call.

## 3. Mark it in progress, with a note

As soon as work starts on a report, mark it, so the student and the teacher page show it is being handled:

```bash
node $S/issues.mjs set --ids 89 --status in-progress --note "We're working on this. Thanks for the idea!"
```

## 4. Fix

- Small fixes: do them directly. Bigger ones: a written spec (`codehs-review/*-SPEC.md`) and a builder agent,
  split by file ownership so two agents never edit one file. Nothing new is deployed until the owner says so when
  it adds a migration, a Worker, a binding, or a new feature; ordinary fixes to reported bugs ship in the normal loop.
- Repo rules that bite: inline styles with CSS variables (never `white` on `--brand`; use `--on-brand`); lesson
  voice is plain, for 14-year-old beginners; carried lesson starters change -> run `generate-lesson-starters`
  BEFORE `check-solution-leak`; docs examples must run (`test-moshion`); commit messages end with the
  Co-Authored-By line the session gives.

## 5. Verify (all of it, every time)

1. `npm test` in the background with a long timeout (it takes over 10 minutes; a 10-minute limit kills it).
   Restore `.gauntlet/occt-checks.json` afterwards (the run rewrites it). A known flake: `test-grader-tolerance-3x`'s
   3-8-23 runtime check under load; rerun it alone and say so.
2. A real browser on the dev server for anything a student sees: `PORT=3019 DEV_ROLE=student npm run dev`, a
   `dev_student=<name>` cookie per identity (`DEV_REAL_DB=1 DEV_ROLE=teacher` for a class with a teacher). Use
   `playwright-cli` with throwaway session names, at 1366x768 (a school laptop), and READ the screenshots.
   Never run `npm test` while that dev server runs. Never touch the `mom` browser session.
3. Deploy (section 6), then check the fix ON THE LIVE SITE as the student would meet it, with throwaway accounts:
   ```bash
   W=<scratchpad>/walk
   node $S/throwaway.mjs make $W --students 2 --teacher   # s1.json, s2.json, t.json + class ct-walk-class
   ...drive the browser with those storage states...
   node $S/throwaway.mjs cleanup $W                       # must print left_over 0
   ```
   Passwords are random and never leave that process; the state files hold only a session cookie. Delete them.
   Walk the awkward cases too, not just the happy path: close the tab without Leave, click before the page has
   loaded, two people at the same spot, long output, a wrapped line.
4. Anything multiplayer or real-time: also check between two machines (`ssh pc2` desktop, `ssh minisforum` NAS;
   the NAS needs `source ~/.nvm/nvm.sh` for node), and clean up the test files on them.
5. Leave proof: screenshots (and a short side-by-side video for anything two people do together) in the
   scratchpad, and show the key ones to the owner.

## 6. Deploy

From the repo: `TRIES_STAMP_ALLOW_OLD=1 npm run deploy` (never bare wrangler), only after `npm test` is green.
A new migration: `npm run d1:migrate` first. The live Worker (`workers/live/`) changes only when
`lib/live-protocol.ts`, `lib/live-doc-protocol.ts` or `workers/live/src/*` change: `cd workers/live && npx wrangler
deploy`, BEFORE the site. Then `git push` (branch `cs-3d`).

## 7. Close each report with a note

```bash
node $S/issues.mjs set --ids 89 --status fixed --note "Done! Publish a game from the moSHion sandbox with Publish game, and find classmates' games in Library > Games."
node $S/issues.mjs set --ids 64 --status deferred --note "Which lab was it? This page is a reading with no Submit button. Report again from the lab and we'll look."
```

Status words: the owner says "closed"; the app's word is `fixed` (the script accepts `closed`). `deferred` = not
changing now, with the reason. `open` = untouched.

The note is read by the STUDENT who filed it (and their teacher). Write it to a 14-year-old: what changed and where
to find it, or why not and what to do instead. No file names, no code internals, no blame ("you did it wrong").
Under 2000 characters; two sentences is usually right. Only mark `fixed` after the live check in section 5 passed.

## 8. Report to the owner

A short table: report, what it was, what changed, status set, how it was verified (tests / dev browser / live
site / other machines), with the proof screenshots. Say plainly what was NOT verified.

## 9. Reflect (this is how the skill grows)

The owner should never have to ask "did you check X?" or "what else needs checking?". When they do, the run
missed something. Every time the owner:

- asks you to check, test, verify, screenshot or look at something you had not already,
- finds a defect you reported as done,
- corrects a status or a note you set,
- or has to repeat an instruction from an earlier run,

then, before ending the turn:

1. Add an entry to `references/lessons.md`: the date, what the owner had to ask, why the loop missed it, and the
   rule that would have caught it (a concrete step, not "be careful").
2. If the rule belongs in the loop itself, also add it to the matching section above (keep this file the
   procedure; lessons.md is the history and the reasons).
3. Tell the owner in one line what you added to the skill.

At the end of every run, even a clean one, spend one minute asking: what did I check only because I happened to
think of it? If it should be standard, add it to section 5.

The skill's files live in `~/Documents/GitHub/agent-evo/skills/shcode-issue-reports/` (symlinked into
`~/.claude/skills/`). Edit them there. Do not commit agent-evo; the owner reviews and commits it.
