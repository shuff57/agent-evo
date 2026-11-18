# Lessons: what the owner had to ask for

Read this before every run. Newest at the top. Each entry: the date, what the owner had to ask, why it was
missed, and the rule. When a rule is general it is also in SKILL.md; this file keeps the reasons.

## 2026-11-16: "show me with videos where possible"

- **Asked:** the owner wanted videos of each fix before choosing how to ship.
- **Missed because:** the run had only stills. Recording the /play clip found a real bug the stills
  and pass/fail checks had passed: after Full screen (pressed before Play) no key reached the game,
  because the new frame got element focus but its window never did.
- **Rule:** record a short clip of every visible fix before asking the owner to ship, and in it USE
  the feature (press keys in a game, not just open it). Scripts: before/after side by side for engine
  changes (old and new dev servers, runner iframe on a same-origin page), a walkthrough for page changes
  with a drawn cursor dot. Record full screen with `chromium.launch({ channel: 'chromium' })`: the
  default headless shell shrinks a full-screen page in the video. No libx264 here: encode with
  `-c:v libopenh264 -b:v 3000k`. Watch a contact sheet (`fps=1/2,tile=3x3`) of each clip.

## 2026-11-16: "there is no game fullscreen in sandbox"

- **Asked:** a triage question told the owner #119 was answered by the sandbox's game-only full screen.
  The owner said it did not exist. It did, but only after Run, as a faint corner square, so for a
  student (and the owner) it was effectively missing.
- **Missed because:** the claim came from reading the code and a commit message, not from looking at
  the page the way a student first meets it (before pressing anything).
- **Rule:** before telling the owner "that already exists", open the page fresh at 1366x768, screenshot
  it before any click, and say where the thing is on that screenshot. If it needs a click first or is
  hard to see, say so, and treat "hard to find" as part of the report.

- **Trap (no ask):** the main checkout (`~/Documents/GitHub/shCode`) can be on another session's
  unmerged branch, so worktrees or child agents made "from the parent commit" start from the wrong base.
  Make per-report worktrees from `origin/cs-3d` (`git worktree add -b fix/issue-N <dir> origin/cs-3d`,
  symlink `node_modules`, copy the git-ignored generated files and `public/reshape/kernel` from
  shCode-deploy, or the dev server will not start). `origin/cs-3d` and upstream moshion `main` both
  moved during this run: rebase every branch before the integration test, not after.
- **Trap (no ask):** engine changes go to upstream moshion first; the vendored copy must equal one
  upstream commit plus the textures line. With several engine reports, make one upstream branch per
  report plus an integration branch, and check the vendored file byte-for-byte against it.

## 2026-11-13 (evening): two more traps

- **/tmp is wiped on a reboot.** The machine rebooted mid-run and took the review page, the demo clips and
  every walk script with it. **Rule:** keep scratch work (walk scripts, clips, review pages, logs) in
  `~/.cache/claude-shcode-issues/`, never `/tmp`.
- **Another session's dev server can own your port.** `npm run dev` on a busy port fails quietly in its log,
  and the walk then tests someone else's checkout (it found old CSS that way). **Rule:** pick a free port,
  then confirm `readlink /proc/<pid>/cwd` of the listener is this repo before walking.
- **A student's note must follow later changes.** #115's note described a design the owner then replaced
  twice. **Rule:** when a fix is reworked after closing, rewrite that report's note to match what is live.

## 2026-11-13: two traps that cost a cycle (no owner ask; found by the run)

- **Deploying over a parallel push.** Another session pushed a lessons commit to `origin/cs-3d` while this
  run was testing. The run deployed from its own tree, so live briefly lacked that commit (or never had
  it), and the later `git push` was rejected.
  **Rule:** `git fetch && git status -sb` right before `npm run deploy`. If `origin/cs-3d` moved, rebase,
  run `npm test` again, and only then deploy and push. Deploy and push go together.
- **throwaway.mjs marked every cookie HttpOnly.** `shcode_owner` and `shcode_wk` are readable on purpose,
  so every throwaway page loaded as `guest` and the live site answered 409 owner-mismatch to uploads
  and saves. That looked like an app bug. Fixed in the script (it now keeps each cookie's own flag).
  **Rule:** a 409 owner-mismatch in a live walk means checking the state file's cookie flags before
  suspecting the app.
- **The two-row full-screen toolbar.** The walk found that the floating full-screen toggles covered
  toolbar buttons (Exit full screen unclickable) only on the LIVE account, whose toolbar is laid out
  differently from the dev one. The live walk is not a formality: run every click there, not only
  the screenshots.
- **`npm test` stops at the first failure.** `check-sketch-movers` reads the sibling `../reshape-cad`
  repo and fails on a clean cs-3d since reshape-cad 9093f994. When it fails, run the remaining commands
  of the `test` script yourself (split it on ` && `) so the rest is not silently skipped.

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
