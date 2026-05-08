---
name: site-profiler
description: "Use when you need to map a webpage's interactive elements, discover interaction workflows, or teach the agent how to use a page. Triggers: 'profile this page', 'map this site', 'discover page', 'teach the agent', 'scrape the DOM', 'create site profile'. Use before repeated browser automation on the same page."
---

# Site Profiler

> Maps a webpage's interactive elements, discovers interaction workflows, and records reusable site profiles via Playwriter. Three interaction modes: **auto** (agent extracts), **chat** (agent asks questions), **teach** (user clicks to demonstrate). Profiles are loaded on future visits so the agent already knows the page — no re-discovery needed.

## Prerequisites
- Playwriter connected to an active browser tab
- Target page loaded and ready
- Write access to `.agents/site-profiles/` in the project

## When to Use
- First time interacting with a new webpage
- Building automation for a site the agent will revisit
- User says "profile this page", "discover this site", "teach the agent"
- Before building any multi-step browser automation workflow
- When the agent needs to interact with elements inside iframes

## When NOT to Use
- Page is a one-time visit with no future interaction needed
- You just need to read text content — use `getPageMarkdown()` instead

## Guardrails

> **Must NOT:**
> - Run profiling on pages still loading — `waitForPageLoad()` first
> - Store credentials, cookies, or session tokens in profiles
> - Overwrite an existing profile without asking
> - Use `{ force: true }` or `dispatchEvent` on profiled elements
> - Submit forms, make purchases, or trigger destructive actions during profiling
> - Skip the confirmation flow — user must approve discovered selectors

## Quick Start
1. Navigate to page → run extraction → ask user's goal → confirm selectors → save
2. For iframe-heavy pages: detect frames, profile accessible ones, note cross-origin ones
3. For teach mode: user clicks elements, agent captures and generalizes selectors

## Workflow

### Phase 1: Scrape (Auto-extract)
- **INPUT:** Active Playwriter page
- **ACTION:**
  1. Wait for page: `await waitForPageLoad({ page: state.page, timeout: 8000 })`
  2. Dismiss modals: `await snapshot({ page: state.page, search: /cookie|consent|accept/i })`
  3. Run `references/extract-profile.js` via `page.evaluate()` to extract all interactive elements
  4. Detect iframes: `state.page.frames()` — for each accessible frame, run extraction inside it too
  5. Enrich with metadata: url, title, domain, profiledAt, pageName
- **OUTPUT:** Raw profile with elements, landmarks, headings, frames

### Phase 2: Intent (Understand the goal)
- **INPUT:** Raw profile + user context
- **ACTION:** Ask the user what they want to accomplish on this page. Use the question tool:
  - "What's your goal on this page?" (e.g., watch videos, fill forms, navigate courses)
  - Present what was found: "I see N buttons, N links, N forms. There's a video player in an iframe."
  - If the page has frames: "I found an iframe from [origin] — I can/cannot access it directly."
- **OUTPUT:** User's stated goal, stored as `profile.goal`

### Phase 3: Discover (Map goal to elements)
- **INPUT:** Raw profile + user's goal
- **ACTION:** Based on the goal, identify the **key elements** the agent will need:

  For **video watching** goals:
  - Play/Pause button, volume controls, progress indicator
  - Quiz/knowledge-check elements inside iframes
  - "Continue" / "Next Section" buttons
  - Completion indicators ("Congratulations", progress bars)

  For **form filling** goals:
  - Input fields, labels, submit buttons
  - Validation messages, error states

  For **navigation** goals:
  - Nav links, breadcrumbs, pagination
  - Menu buttons, dropdowns

  For each key element, verify it exists:
  ```js
  const count = await state.page.locator(selector).count()
  ```
  For iframe elements, check frame accessibility:
  ```js
  const frame = state.page.frames()[1]
  const btns = await frame.$$('button')
  ```
- **OUTPUT:** Mapped elements with verified selectors, grouped by purpose

### Phase 4: Teach (User demonstrates)
- **INPUT:** Elements the agent couldn't identify or needs clarification on
- **ACTION:** Three sub-modes, chosen based on context:

  **4a. Point mode** — User clicks elements in Chrome:
  - Ask: "Click the element that [starts the video / submits the answer / advances to next section]"
  - Capture via Playwriter pinned elements: `globalThis.playwriterPinnedElem1`
  - Or detect via snapshot diff: take snapshot before and after user clicks
  - Extract selector from captured element:
    ```js
    const selector = await getLocatorStringForElement(state.page.locator(capturedElement))
    ```

  **4b. Chat mode** — Agent asks targeted questions (max 5 turns):
  - "Is the quiz inside the video or on the main page?"
  - "After finishing a section, does the page reload or show a modal?"
  - "How many sections does a typical course have?"
  - Parse answers to build interaction context

  **4c. Walkthrough mode** — User performs the full workflow while agent records:
  - "Walk through the process. I'll record each step."
  - After each user action, take a snapshot diff to detect what changed
  - Record the action sequence as a workflow

- **OUTPUT:** Captured selectors and/or recorded workflow steps

### Phase 5: Confirm (Accept or refine)
- **INPUT:** All discovered elements and workflows
- **ACTION:** Walk through each key element with the user:
  1. Present selector + match count + sample text:
     "Play button: `role=button[name='Play (k)']` — matches 1 element. Correct?"
  2. User can:
     - **Accept** — selector is correct as-is
     - **Refine** — provide a better selector
     - **Skip** — element not needed
  3. For workflow steps, present the recorded sequence:
     "Step 1: Click Play → Step 2: Wait for quiz → Step 3: Answer quiz → Step 4: Click Continue"
  4. User confirms or adjusts the workflow
- **OUTPUT:** Confirmed profile with validated selectors and workflows

### Phase 6: Save
- **INPUT:** Confirmed profile
- **ACTION:**
  1. Build enhanced profile JSON (see `references/discovery-schema.json` for format)
  2. Save to `.agents/site-profiles/<domain>/<page-name>.json`
  3. If this page teaches patterns useful for other pages on the same domain, note them in `knowledge.md`
  4. Report summary: elements, workflows, frames detected
- **OUTPUT:** Saved profile, ready for future automation

## Enhanced Profile Schema

```json
{
  "url": "https://example.com/training/player/...",
  "domain": "example.com",
  "pageName": "video-player",
  "profiledAt": "2026-03-15T...",
  "goal": "Watch training videos to completion",

  "interactive": {
    "buttons": [{ "text": "Play", "selector": "role=button[name='Play (k)']", "purpose": "start-video" }],
    "links": [],
    "inputs": [],
    "forms": []
  },

  "workflows": [
    {
      "name": "watch-video-section",
      "trigger": "User wants to complete a video section",
      "steps": [
        { "action": "click", "selector": "role=button[name='Play (k)']", "context": "outer", "description": "Start video" },
        { "action": "wait-for", "condition": "quiz appears in iframe", "timeout": 300000 },
        { "action": "answer-quiz", "frame": "iframe[title*='Course']", "description": "Answer knowledge check" },
        { "action": "click", "selector": ":text('Continue')", "frame": "iframe", "description": "Dismiss quiz result" },
        { "action": "wait-for", "condition": "Congratulations! text appears", "description": "Video section complete" }
      ]
    }
  ],

  "frames": {
    "videoPlayer": {
      "selector": "iframe[title*='Course']",
      "origin": "trainingcdn.com",
      "crossOrigin": true,
      "accessible": true,
      "note": "Cross-origin but accessible via frame reference"
    }
  },

  "landmarks": {},
  "headings": [],
  "summary": {}
}
```

## Loading a Profile

```js
const fs = require('node:fs')
const profile = JSON.parse(fs.readFileSync('.agents/site-profiles/example-com/video-player.json', 'utf-8'))

// Use stored workflow
for (const step of profile.workflows[0].steps) {
  if (step.action === 'click') {
    const target = step.frame
      ? state.page.frames().find(f => f.url().includes(step.frame))
      : state.page
    await target.locator(step.selector).click()
  }
}
```

## Iframe Handling

Cross-origin iframes require special handling:

| Situation | Approach |
|---|---|
| Same-origin iframe | Use `frameLocator()` or `contentFrame()` for full DOM access |
| Cross-origin iframe accessible via `frames()` | Use `state.page.frames()[n].$()` and `$$()` for element queries |
| Cross-origin iframe fully blocked | Note in profile, try keyboard shortcuts that pass through |
| Iframe content changes dynamically (quizzes, videos) | Poll with `frame.$$('button')` to detect new interactive content |

## Diffing (detect page changes)

1. Load saved profile
2. Navigate to page, run extraction
3. Compare element counts — if >20% different, flag for re-profiling
4. For workflows: test first step's selector — if broken, suggest re-discovery

## Error Handling

| Problem | Action |
|---------|--------|
| Page still loading | `waitForPageLoad({ timeout: 10000 })` and retry |
| No interactive elements | Check iframes with `state.page.frames()` |
| Cross-origin iframe blocked | Use `frame.$()` instead of `frameLocator()`, or try keyboard shortcuts |
| Selectors stale after page update | Re-run Phase 1, diff against saved profile |
| User can't describe their goal | Switch to walkthrough mode — "Just do what you'd normally do, I'll watch" |
| Screenshots timeout (video playing) | Skip screenshot, use snapshot + frame inspection instead |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Profiling before page loads | Always `waitForPageLoad()` first |
| Using `frameLocator` for cross-origin iframes | Use `state.page.frames()[n]` with `.$()` and `.$$()` instead |
| Skipping iframe detection | Always check `state.page.frames()` — key content is often in iframes |
| Recording workflows without testing them | After recording, replay step 1 to verify selectors work |
| Not asking the user's goal | A profile without purpose context is just a data dump — always ask intent |
| Saving overly specific selectors | Strip nth-child, prefer role/aria/data-testid over positional selectors |

## Reference Files

- `references/extract-profile.js` — Browser-side extraction script (runs inside `page.evaluate()`)
- `references/discovery-schema.json` — JSON schema for enhanced profile format
- `knowledge.md` — Learned page patterns (auto-populated during discovery sessions)
