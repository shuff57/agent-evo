# Site Profiler — Learned Patterns

Append-only knowledge base. Each entry records a reusable pattern discovered during profiling sessions.

## SafeColleges / Vector Solutions Training Portal

**Domain:** `butte-keenan.safecolleges.com`
**Discovered:** 2026-03-15

### Page structure
- Training home → Course launch → Video player (3-page flow)
- Video player embeds content in a cross-origin iframe from `trainingcdn.com`
- The iframe is accessible via `state.page.frames()[1]` despite being cross-origin
- Video controls (Play, Pause, Mute, Volume, CC, Fullscreen) are in the **outer** page
- Quiz/knowledge-check content appears **inside** the iframe during video playback

### Quiz interaction pattern
- Quiz uses AngularJS (`ng-controller="SLICChoiceCtrl"`)
- Question text: `.question_main` selector inside iframe
- Answer options: `label[aria-label]` (e.g., `label[aria-label="Option 1: True"]`)
- Submit button: `button` with text "Submit Answer"
- After submit: feedback appears in `.feedback-section` with "Correct!" / "Incorrect!" text
- Continue button appears inside `.feedback-section` after answering

### Video completion pattern
- After all sections complete: "Congratulations!" text appears
- Two buttons shown: "Take Assessment" and "Return to Course Details"
- These are in the outer page (not the iframe)

### Iframe access pattern
- `page.evaluate()` on the iframe's `contentDocument` returns "CROSS-ORIGIN"
- `state.page.frames()[1].$()` and `$$()` work for element queries
- `state.page.frames()[1].$eval()` works for reading DOM content
- `state.page.frames()[1].click()` works for interactions
- Screenshots timeout when video is playing — use snapshot + frame queries instead

### Selector stability
- Outer page buttons use ARIA labels: `role=button[name="Play (k)"]` (stable)
- Iframe quiz elements use class-based selectors: `.question_main`, `.feedback-section` (moderately stable)
- Answer labels use `aria-label` attributes: `label[aria-label="Option 1: True"]` (stable per quiz)
