# Lessons: what the owner had to ask for

Read this before every run. Newest at the top. Each entry: the date, what the owner had to ask, why it was
missed, and the rule. When a rule is general it is also in SKILL.md; this file keeps the reasons.

## 2026-11-08: proof recordings found four bugs the tests and the walk had passed

- **Asked:** the owner asked for screenshots and videos of the fixes. Recording them turned up four more defects
  (JS timer output lost, a same-spot insert splitting a word, name tags covering code, output not scrolling).
- **Missed because:** the walk clicked the happy path once. A recording runs it slowly and is watched afterwards,
  so it catches what a pass/fail check does not.
- **Rule:** the live walk also covers closing a tab without pressing Leave, clicking before the page has loaded,
  two people typing at the same spot, long output, and a wrapped line. Watch every proof clip before reporting.

## 2026-11-08: "what else needs to be checked?"

- **Asked:** after a deploy that passed every test, the owner asked what was still unchecked.
- **Missed because:** the run treated green scripted tests as done. Nobody had clicked the new features in a real
  browser on the live site. The browser walk then found a real bug (a collaborator's cursor drawn 1-2 characters
  off) and a layout that was unusable at 1366x768.
- **Rule:** after every deploy, walk the change on the LIVE site with throwaway accounts at 1366x768 (SKILL.md
  section 5.3) before telling the owner it is done.

## 2026-11-08: "test on my other accessible machines"

- **Asked:** the owner asked for the real-time features to be tested from their other computers.
- **Missed because:** every check ran from one laptop, so two-computer behaviour was never seen.
- **Rule:** anything multiplayer or real-time is checked between two machines (`ssh pc2`, `ssh minisforum`).
  The `~/.ssh/config` aliases carry the keys; `ssh huffpalmer-nas` with no alias is refused. The NAS has node
  through nvm only.

## 2026-11-08: "can you get screenshots or videos showing and confirming the fixes"

- **Asked:** the owner wanted proof, not a description.
- **Missed because:** the report said "verified in the browser" with no evidence attached.
- **Rule:** leave screenshots for every visible fix and a short side-by-side video for anything two people do
  together, and show the key ones in the report (SKILL.md sections 5.5 and 8).

## 2026-11-08: a regression blamed on the wrong change

- **Asked:** the owner was told a timer bug was new; it had existed all along.
- **Missed because:** the browser tester's guess ("the Stop fix broke it") was repeated without reading the code.
- **Rule:** before calling something a regression, find the line that causes it and check whether that line
  changed (`git log -L`, `git show <old>:<file>`). Say "pre-existing" when it is.

## Traps that cost a cycle (not owner asks, but keep them)

- `pkill -f server.js` matches its own shell and kills the command (exit 144). Stop the dev server by its port's
  pid, node processes only.
- `npm test` takes over 10 minutes: background it with a long timeout, or it is killed half-way.
- This laptop sometimes cannot reach shcode.pages.dev over IPv6 for a few seconds ("could not resolve"). It is the
  laptop, not the site: retry, or check with `curl -4` or from the NAS.
- jsfxr sound presets are random: regenerating sounds overwrites the committed ones unless `--force` is meant.
- A carried lesson starter that contains the previous lesson's solution trips `check-solution-leak` at deploy
  even when `npm test` passed: run `generate-lesson-starters` first.
- A docs example that is only comments fails `test-moshion` (the loop never starts): examples must run.
