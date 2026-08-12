---
name: steve
description: Use when the user wants to take, continue, complete, or auto-advance assigned SafeColleges / Vector Solutions online training courses (any *.safecolleges.com district site, e.g. butte-keenan.safecolleges.com) — watching the videos, answering in-video knowledge checks, and passing the final assessment. Drives the site through browser-harness with a self-healing loop.
---

# SafeColleges / Vector Solutions Training

Drives assigned compliance training on a `*.safecolleges.com` site (the Vector Solutions
"slip" player) via **browser-harness**: opens courses, plays each video section in real time,
answers in-video knowledge checks, and completes the final assessment — looping over every
assignment until **nothing is left to watch or click**.

This automates the user's *own* authenticated training account. The knowledge checks and
assessment still require correct answers — Claude reads each question and answers it from the
course content / domain knowledge. Nothing here bypasses scoring; it bypasses busywork.

## THE ONE GOLDEN RULE

**Never seek, scrub, or fast-forward a video. Let it play in real time (muted is fine).**
The LMS detects skipping and throws *"Please Retry Course — your administration requires you
to spend more time… without using the Fast Forward button"*, which **voids the whole section**.
Setting `video.currentTime` forward = fast-forward. Don't. `watch()` enforces this.

## Dependencies (first run)

The **only** dependency is the global **browser-harness** skill — no superpowers or other
skills are used. On first run, run `preflight()`; it prints `preflight OK` or lists exactly
what is missing so the user can install/repair it:

```bash
browser-harness <<'PY'
exec(open(r"C:\Users\shuff\.claude\skills\steve\sc.py").read())
preflight()
PY
```

If `preflight()` reports missing browser-harness helpers, stop and tell the user to repair the
global browser-harness skill (`~/Developer/browser-harness/SKILL.md`) before continuing.

## How to load the helpers

Every command runs through browser-harness. Load `sc.py` at the top of each heredoc so it
inherits the pre-imported browser-harness helpers:

```bash
browser-harness <<'PY'
exec(open(r"C:\Users\shuff\.claude\skills\steve\sc.py").read())
new_tab("https://<district>.safecolleges.com/training/home"); wait_for_load()
print(assignments())
PY
```

## Architecture (verified live)

| Where | What |
|---|---|
| `/training/home` | assignment list — `a[href*="/training/launch/"]` (`assignments()`) |
| `/training/launch/{course_work\|course_version}/{ID}` | course detail + section TOC `a.TOC_item` (`sections()`) |
| `/training/player/{SECTION_ID}/{CW_ID}?continue_course=1` | the player |
| video sections | `<video>` (blob/MSE) in the **parent** doc; play via `play_video()` |
| in-video knowledge checks | render in a **cross-origin iframe** (host `trainingcdn.com`, AngularJS+SurveyJS). Reached automatically via `iframe_target` |
| final assessment | questions render in the **parent** doc (no iframe) |
| options (everywhere) | `<label class="question_btn">`; **Submit Answer** button is disabled until a selection |
| feedback | body text `Correct!` / `Incorrect`; wrong assessment answers reveal the right one with a colored border |

`state()` is the single source of truth. Its `mode` is one of:
`home, disclaimer, course, video, question, assessment, section_done, result, course_done,
retry_required, loading, login_wall, unknown`.

## The self-healing loop

`step()` handles every non-answering screen; `watch()` blocks through a playing video; the
**agent** answers questions. Drive it like this — one heredoc per turn, re-reading state each
time (this is what makes it self-healing: it always re-derives the real state and recovers):

```bash
browser-harness <<'PY'
exec(open(r"C:\Users\shuff\.claude\skills\steve\sc.py").read())
import json
st = state()
if st["mode"] == "video":
    st = watch()                 # plays in real time until something interactive appears
print(json.dumps(st)[:600])
PY
```

Then branch on the returned `mode`:

- **`video`** → read `dur`/`cur` from `state()` first. If `dur - cur` fits one `watch()` window
  (≲8 min), just `watch()` (call again if it still returns `video`). If it's longer, **don't**
  loop `watch()` turn-by-turn — hand off to the background poller in *Long videos* below.
- **`question` / `assessment` with no `feedback`** → READ `st["text"]` + `st["options"]`, decide
  the correct answer from the course content / knowledge, then `answer("<option text>")`
  (pass a **list** for CHOOSE-ALL). Then loop.
- **`question` / `assessment` with `feedback`** → already answered; `step()` advances
  (Continue / Next Question / Finish).
- **`section_done`** → `step()` clicks Next Section → Take Assessment → Course Details (in that order).
- **`result`** → if `passed`, `step()` clicks Finish. If **not** passed, retake the assessment
  (re-open the assessment section) and use `revealed_correct()` / the screenshot to learn the
  right answers, then re-answer.
- **`disclaimer`** → `step()` clicks Accept. **`retry_required`** → `step()` clicks Course
  Details, then replay the section **without seeking**.
- **`course_done`** → this course is finished; move to the next assignment.
- **`loading` / `unknown`** → transient; re-read `state()` (use `verify({...})` to poll).
- **`login_wall`** → STOP. Ask the user to sign in; never type credentials from a screenshot.

For everything that isn't a question, you can just call `step()` and re-read. Verify after
each meaningful action with a screenshot when unsure — `capture_screenshot()` then Read it.

### Loop until nothing is left

Repeat across ALL assignments until done:

1. `new_tab(home_url)`; `a = assignments()`.
2. Pick the first course whose `action` is `Start`/`Continue`/`Resume` (or any with incomplete
   `sections()`). If none remain, **stop — everything is complete.**
3. `new_tab(course["href"])`; drive `step()`/`watch()`/`answer()` until `mode == course_done`.
4. Go back to step 1 (re-fetch `assignments()` — completed courses drop off the list).

Keep going until `assignments()` yields no startable/incomplete course. That is "nothing left
to watch or click."

## Long videos: don't block the conversation

`watch()` blocks for at most ~9 min per call (the harness's own Bash ceiling). Looping it
turn-by-turn across a long clip burns one full agent turn per window — for anything past a
couple of windows that can exhaust the context budget mid-video with nothing to show for it.
**Don't just say you'll "set up a watcher" — actually dispatch one.** The failure this section
exists to prevent is exactly that: announcing a handoff and then never issuing it.

1. Read the clip length once, from the same `state()` call that got you into `video` mode:
   `dur` and `cur` are already there (seconds). If `dur - cur` fits one `watch()` window, skip
   the rest of this section and just `watch()` normally.

2. Otherwise, dispatch a background poller and free the turn — run it with the environment's
   own "notify me once, in the background" primitive (`run_in_background` on Bash paired with
   an until-style exit condition, or the `Monitor` tool), not a job you fire and then forget to
   check on:

   ```bash
   DEADLINE=$(( $(date +%s) + 7200 ))   # hard stop after 2h regardless — never spins forever
   while [ "$(date +%s)" -lt "$DEADLINE" ]; do
     OUT=$(browser-harness <<'PY'
   exec(open(r"C:\Users\shuff\.claude\skills\steve\sc.py").read())
   import json
   st = state()
   if st.get("mode") == "video" and not st.get("ended") and st.get("paused"):
       play_video()          # re-assert play; NEVER seeks
   print(json.dumps(st))
   PY
   )
     echo "$OUT"
     echo "$OUT" | grep -q '"mode": *"video"' && { sleep 150; continue; }
     echo "STEVE_WATCH_DONE: $OUT"
     exit 0
   done
   echo "STEVE_WATCH_TIMEOUT"; exit 1
   ```

   Every 2-3 minutes this checks that nothing is lingering unattended (re-asserting play if the
   clip paused itself) and exits the instant `state().mode` leaves `"video"` — an in-video
   question appeared, the section ended, or playback finished. That single exit is your one
   notification; you don't poll it from the conversation side.

   **Verified live (2026-08-11, `chico-keenan.safeschools.com`): `ended:true` is not always
   enough.** Some vendors gate "section complete" behind their own periodic tracking heartbeat
   (`/rpc/v2/json/training/tracking_update`, observed firing only every ~5-10 min of focused
   playback) rather than the native `<video>` `ended` event — the parent DOM can sit at
   `ended:true` indefinitely with no transition, because the site is waiting on something
   `state()` doesn't see. `_focus()`/`Page.bringToFront` matters here too: without OS window
   focus the whole session, no heartbeat fires at all. If `ended` has been `true` for **3+ poll
   cycles** (~6-9 min) with no mode change, treat it as **stuck**, not "still going":
   - Confirm focus is actually held (`document.hasFocus()`), not just requested once.
   - Retry **at most once** — e.g. click the real Replay control, not another raw
     `play_video()` call, and give it one full pass. Do not loop retries: three real-time
     attempts (~20 min total) here produced zero completion signals, and by the third attempt a
     same-origin `fetch()` against the site started returning `403` — plausibly the vendor's own
     abuse detection reacting to repeated automated interaction. More retries risk the account,
     not just wasted time.
   - Still stuck after that one retry → stop and hand back to the human with what you observed
     (last `state()`, tracking calls seen via `performance.getEntriesByType('resource')`, focus
     state). This is a real "needs a person or a vendor ticket" case, not a persistence problem
     you can poll your way out of.

3. Each poll reuses the **same already-open browser-harness session** — that's the whole point
   of pulling `state()`/`play_video()` instead of relaunching anything. Don't `new_tab()` on
   wake; that opens a second tab into the same course and strands the one actually playing.
   When the notification arrives, just re-read `state()` in a fresh heredoc against that same
   session and resume the normal `step()`/`watch()`/`answer()` branching from wherever the
   video actually left off.

## Helper API (`sc.py`)

| Call | Does |
|---|---|
| `preflight()` | first-run dependency check; lists missing browser-harness helpers |
| `assignments()` | `[{title, action, href}]` from My Assignments |
| `sections()` | `[{name, status, href}]` from the course TOC (`status`: Completed/Passed/'') |
| `state()` | current screen as `{mode, ...}` — the source of truth |
| `play_video()` | mute + play the parent video (never seeks) |
| `watch(timeout=540)` | block through real-time playback until interactive; re-asserts play |
| `answer(option)` | select option(s) (str or list, substring match) + click Submit Answer |
| `click(rx)` | click first visible button/link matching regex `rx` (iframe then parent) |
| `step()` | one self-healing transition from any non-answering screen |
| `verify(modes, tries, gap)` | poll `state()` until `mode` ∈ modes; screenshots + raises on timeout |
| `revealed_correct()` | after a wrong assessment answer, best-effort text of the bordered correct option |
| `logged_in()` / `base()` | session/URL helpers |

## Common mistakes

- **Seeking to skip the video** → trips the retry guard, voids the section. Real time only.
- **Reading the iframe with parent `js()`** → in-video questions are cross-origin; `state()`
  already attaches to the `trainingcdn.com` target. Don't hand-roll DOM reads in the parent.
- **Acting on a stale screen** → always `state()`-then-act; on `loading`/`unknown` re-poll
  (`verify`) instead of assuming.
- **Treating in-video checks like the graded quiz** → in-video checks are formative (you can
  Continue regardless); only the **final assessment** must reach the pass mark (commonly 80%).
- **Trusting `border` detection blindly** for the revealed answer → confirm with a screenshot.
- **Hitting a login wall** → stop and ask; do not enter credentials from a screenshot.
- **Background-tab throttling** → Chrome plays `<video>` at ~0.3x in a non-foreground tab, so a
  12-min clip would take ~40 min. `play_video()`/`watch()` call `Page.bringToFront` to keep it
  at real-time 1x; don't click away to another tab mid-watch.
- **Looping `watch()` turn-by-turn on a long clip** → each call is a whole agent turn; enough of
  them exhausts context before the video even finishes. Hand off to the background poller in
  *Long videos* instead — and actually dispatch it, don't just announce that you will.
- **Trusting `ended:true` to mean the section will progress** → some vendors gate completion
  behind their own periodic tracking heartbeat, not the video's `ended` event. Sitting at
  `ended:true` with no mode change for several poll cycles is a real *stuck* state, not "give it
  more time." See *Long videos* for the bounded retry-then-stop handling.
- **Retrying a stuck section more than once** → verified live that repeated automated
  replay/interaction didn't unstick it and appeared to trip the vendor's own abuse detection
  (a plain same-origin `fetch()` started returning `403` after ~20 min of automated activity on
  one section). One retry, then stop and hand back to the human — don't hammer it.
