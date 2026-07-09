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

- **`video`** → `watch()` (call again if it returns `video` — clip longer than one 9-min window).
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
