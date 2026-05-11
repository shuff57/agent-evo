---
name: grade-show-work
description: Use when evaluating partial credit for "show your work" math problems on MyOpenMath grading pages, especially when students uploaded work images, auto-scores are below passing, and the teacher wants a report-first bonus-only review before any score changes.
---

# Grade Show Work

> Review uploaded student work images on MyOpenMath `gbviewassess.php` pages and recommend bonus partial credit for visible effort. This skill is **bonus only**: it rewards work shown with `+2`, `+1`, or `+0`, generates a full approval report first, and only applies approved bonuses afterward.

## Overview
- Target page: MyOpenMath `gbviewassess.php` individual-student grading view
- Goal: reward visible mathematical effort on uploaded work files
- Decision rule: recommend `+2`, `+1`, or `+0` based on work shown, then wait for teacher approval before writing anything

## Prerequisites
- Playwriter connected to a Chrome tab already on the MyOpenMath grading page
- A `gbviewassess.php` individual-student grading URL
- Student work uploaded as files, not just text responses
- Permission to create or update `grade-show-work-state.json`

## When to Use
- User asks to grade or review “show your work” partial credit
- User wants bonus points for handwritten/uploaded math work images
- Questions have file uploads and current auto-scores below passing
- Teacher wants a dry run or report before any scores are written

## When NOT to Use
- Text-only or essay grading workflows
- Full regrading of mathematical correctness
- Situations where the user wants immediate silent score changes
- Questions without uploaded files or without a visible `viewworkwrap`

## Guardrails

> ⚠️ **Must NOT:**
> - **Never decrease a score.** This workflow is bonus only.
> - **Never skip the report.** Generate the full report, show it to the teacher, and wait for explicit approval before editing any `scorebox` input.
> - **Never overwrite an approved non-zero score with a lower value.** Only add bonus points.
> - **Never exceed the question max.** Cap `currentScore + bonus` at the displayed maximum.
> - **Never judge correctness instead of effort.** Award for visible mathematical work, not for a correct final answer.
> - **Never depend on UI preview clicks to obtain files.** Extract URLs from `a.attach.prepped` programmatically.
> - **Never evaluate questions without both conditions:** auto-score `< 4` and a visible work-upload area (`.viewworkwrap`).
> - **Never continue past 20 students in one session.** Soft warning at 15, stop at 20.

## Quick Start
1. Open the `gbviewassess.php` grading page and load or create `grade-show-work-state.json`.
2. Scan students, extract eligible uploads, evaluate work as `+2`, `+1`, or `+0`, then generate the report.
3. After teacher approval, revisit approved students, add bonus points to the right `scorebox` fields, and save.

## Workflow

### Phase 0: Resume or Start Fresh
- **INPUT:** A grading page URL and optional existing `grade-show-work-state.json`
- **ACTION:**
  - Read the state entry for this exact grading URL.
  - If a saved entry exists, offer resume vs. start fresh.
  - Use phase values exactly: `scan` while collecting recommendations, `apply` while writing approved bonuses.
  - Navigate with Playwriter and verify the current student by re-observing `h2` and `h3`.
- **OUTPUT:** Active grading session positioned at the correct student and phase.

### Phase 1: Scan Current Student in One Extraction Pass
- **INPUT:** Current `gbviewassess.php` page
- **ACTION:** Use one browser extraction to gather student name, assessment name, question containers, score inputs, score maxima, and file links.

**Eligibility reminder:** only review questions that have a visible work-upload pane (`div.questionpane.viewworkwrap` / `.viewworkwrap`), at least one uploaded file, and an auto-score below `4`.

```javascript
const data = await state.gradePage.evaluate(() => {
  const studentName = document.querySelector('h2')?.textContent?.trim() || '';
  const assessmentName = document.querySelector('h3')?.textContent?.trim() || '';

  const questions = Array.from(document.querySelectorAll('.bigquestionwrap')).map((wrap, qIndex) => {
    const scoreInputs = Array.from(wrap.querySelectorAll('input[id^="scorebox"]'));
    const fileLinks = Array.from(wrap.querySelectorAll('a.attach.prepped')).map((a) => ({
      url: a.href,
      filename: a.textContent.trim(),
    }));

    return {
      qIndex,
      label: wrap.querySelector('strong')?.textContent?.trim() || `Question ${qIndex + 1}`,
      hasWorkUpload: !!wrap.querySelector('.viewworkwrap'),
      scoreInputs: scoreInputs.map((input) => ({
        id: input.id,
        value: parseFloat(input.value) || 0,
        max: parseFloat((input.nextSibling?.textContent || '').trim().replace('/', '')) || 0,
      })),
      fileLinks,
    };
  });

  return { studentName, assessmentName, questions };
});
```

- **Eligibility criteria:** only keep questions where:
  - at least one score part is `< 4`
  - `hasWorkUpload === true` because a `.viewworkwrap` work pane is present/visible for that question
  - at least one uploaded file URL is present
- **OUTPUT:** Eligible question list for the current student.

### Phase 2: Fetch and Evaluate Uploaded Work
- **INPUT:** Eligible questions from Phase 1
- **ACTION:**
  - Use extracted URLs directly; do **not** click preview toggles.
  - File URLs follow `https://files.myopenmath.com/ufiles/{uid}/{filename}` and do not require authentication.
  - Save each file locally, then inspect it with the environment’s media-analysis tool.
  - Award bonus based on visible effort:

| Bonus | Criteria | Examples |
|------:|----------|----------|
| `+2` | Substantial work shown | correct setup, relevant formula, multiple steps, organized attempt, meaningful progress |
| `+1` | Some relevant work shown | wrote givens, began setup, drew relevant diagram, one real attempt step |
| `+0` | No meaningful work shown | blank, illegible, unrelated image, copied prompt only |

  - Record a short rationale and work description for each recommendation.
  - Cap the proposed new score at the question max.
- **OUTPUT:** Per-student bonus recommendations with evidence notes.

### Phase 3: Advance Through the Roster Safely
- **INPUT:** Current student completed in scan mode
- **ACTION:**
  - Click **Save and Next Student**.
  - Treat this as a full page navigation, not an SPA update.
  - Expect the `uid` URL parameter to change to the next student; the original `stu` parameter may disappear after navigation.
  - Wait for `domcontentloaded`, then verify the `h2` student name changed.
  - Increment the session counter.
  - At 15 students, warn that the 20-student limit is approaching.
  - At 20 students, stop scanning, save state, and generate the interim report.
- **OUTPUT:** Next student loaded or session halted at the safety limit.

### Phase 4: Generate the Report First
- **INPUT:** All scan-mode recommendations collected so far
- **ACTION:** Build a markdown report with:
  - assignment name, date, scanned student count
  - summary table of students/questions with current score, bonus, new score
  - detailed rationale per question
  - only students receiving `+1` or `+2` listed in full detail
  - students with `+0` only summarized as a count instead of expanded
  - explicit approval prompt

Suggested structure:

```markdown
# Partial Credit Report: {Assignment Name}

## Summary
| Student | Question | Auto-Score | Bonus | New Score | Work Shown |
|---------|----------|------------|-------|-----------|------------|

## Detailed Breakdown
| Student | Question | Work Description | Credit | Rationale |
|---------|----------|------------------|--------|-----------|

## Approval Request
Apply these bonuses? (yes / no / adjust)
```

- **OUTPUT:** Teacher-reviewable report. No score edits yet.

### Phase 5: Wait for Explicit Approval
- **INPUT:** Completed report
- **ACTION:**
  - Ask the teacher whether to apply, cancel, or adjust.
  - If adjustments are requested, update the report and re-confirm.
  - If the teacher declines, stop with no score changes.
- **OUTPUT:** Approved final change list or a clean cancellation.

### Phase 6: Apply Approved Bonuses Only
- **INPUT:** Teacher-approved recommendations
- **ACTION:**
  - Revisit each approved student URL.
  - Update the exact `scorebox` inputs tied to the approved question parts.
  - Re-read the value after filling to verify the bonus stuck.
  - Save changes, then update `grade-show-work-state.json` to phase `apply` with progress.

```javascript
for (const update of approvedUpdates) {
  const input = state.gradePage.locator(`input#${update.scoreboxId}`);
  await input.fill('');
  await input.fill(String(update.newScore));
}
```

- **OUTPUT:** Approved bonuses saved and verified.

## Error Handling

| Problem | Action |
|---------|--------|
| No `viewworkwrap` or no uploaded file links | Skip the question; it is not eligible for this skill. |
| File fetch fails | Note the failure in the report and award `+0` unless the teacher wants manual review. |
| Image is blank, illegible, or unrelated | Award `+0` and say why in the report. |
| Student already has full or near-full credit | Cap bonus at the question max; never exceed it. |
| Score input pattern unclear | Use the `scorebox{qIndex}` / `scorebox{qIndex}-{partIndex}` convention and re-read the DOM before writing. |
| Session reaches 20 students | Stop, save state, generate report, and ask the teacher to resume in a new session. |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Grading mathematical correctness instead of work shown | Judge effort, setup, and visible reasoning only. |
| Clicking file previews instead of using URLs | Extract `a.attach.prepped` links directly from the DOM. |
| Writing scores before teacher approval | Report first, then wait for explicit approval. |
| Lowering an existing score during adjustment | Never decrease scores; this is bonus only. |
| Ignoring multipart score IDs | Use `scorebox0-0`, `scorebox0-1`, etc. for multipart questions. |
| Letting one long session run indefinitely | Warn at 15 students and stop at 20. |

## State Management

- **State file:** `grade-show-work-state.json`
- **Phases:**
  - `scan` — actively reviewing students and building recommendations
  - `apply` — approved changes are being written back
- **Recommended entry shape:** preserve enough writeback data to resume safely, including `uid`, `studentUrl`, question index, and exact `scoreboxId` values for approved updates.

```json
{
  "<grading-page-url>": {
    "lastStudent": "LastName, FirstName",
    "count": 12,
    "phase": "scan",
    "report": [
      {
        "student": "LastName, FirstName",
        "uid": "7158609",
        "studentUrl": "https://example.com/gbviewassess.php?cid=1&aid=2&uid=7158609",
        "questions": [
          {
            "index": 0,
            "label": "Question 1.",
            "scoreboxId": "scorebox0-0",
            "currentScore": 2,
            "maxScore": 5,
            "bonus": 2,
            "newScore": 4,
            "rationale": "Substantial work shown"
          }
        ]
      }
    ],
    "timestamp": "2026-03-15T12:00:00Z"
  }
}
```

- Save after each student during scan mode and after each applied student during apply mode.

## Selectors / References

### Core DOM selectors

| Element | Selector / Pattern | Notes |
|---------|--------------------|-------|
| Student name | `h2` | Current student identity check |
| Assessment name | `h3` | Assignment/report title |
| Question container | `.bigquestionwrap` | One per question, 0-based order |
| Question label | `.bigquestionwrap strong` | Usually `Question N.` |
| Score inputs | `input[id^="scorebox"]` | Catch both `scoreboxN` and `scoreboxN-M` |
| Score wrapper hint | `.score-inputs` | Useful on variants, but do not rely on this wrapper alone |
| Single-part score | `input#scoreboxN` | Example: `scorebox0` |
| Multipart score | `input#scoreboxN-M` | Example: `scorebox0-0` |
| Max score text | `scoreInput.nextSibling` | Text node like `/5` or `/10` |
| Work upload pane | `.viewworkwrap` | Required for eligibility |
| File download link | `a.attach.prepped[target="_blank"]` | Direct file URL lives on the anchor |
| Work toggle | `.viewworkwrap button.slim` | Text flips between “Hide Work” and “View Work” |
| Save and Next Student | `button.primary:has-text("Save and Next Student")` | Full-page navigation |
| Save Changes | `button.primary:has-text("Save Changes")` | Appears more than once |

### Full selector reference

| Element | Selector | Notes |
|---------|----------|-------|
| Overall score | `button#assess_select` | Text like `Scored attempt. Score: X/Y.` |
| Make Exception | `button:has-text("Make Exception")` | Header action |
| Override score | `button:has-text("Override score")` | Header action |
| Filters and Options | `button:has-text("Filters and Options")` | Header display control |
| Question expand/collapse | `button#qselectN` | Per-question version/score toggle |
| Question content region | `div[role="region"][aria-label="Question N"]` | Inside the selected question panel |
| More button | `button#qmoreN` | Per-question options |
| Student response input | `input#qnNNNN` or `input#qnN-M` | Read-only student answer field |
| View key button | `button:has-text("View Key for Question N Part M")` | Part-specific key display |
| Full credit button | `button:has-text("Full credit")` | Text may be `Full credit all parts` |
| Add feedback button | `button.slim:has-text("Add feedback")` | One per question |
| Question feedback box | `div#fbN.fbbox` | TinyMCE inline editor |
| General feedback box | `div#fbgen.fbbox` | Bottom-of-page feedback editor |
| General feedback label | `span#fblblgen` | Label for general feedback area |
| Show all tries | `button.slim:has-text("Show all tries")` | Conditional |
| Show applied penalties | `button.slim:has-text("Show applied penalties")` | Conditional |
| Side-by-side wrapper | `div.sidebyside` | Question pane plus work pane layout |
| Question content pane | `div.questionwrap.questionpane` | Left pane when uploads exist |
| Work upload pane | `div.questionpane.viewworkwrap` | Right pane with file uploads |
| Work list container | `.viewworkwrap .introtext ul.nomark` | File links remain in DOM even if hidden |
| File download link | `a.attach.prepped[target="_blank"]` | Direct fetch target for uploaded work |
| Preview toggle | `span.videoembedbtn#fileembedbtnN[role="button"]` | A `<span>` with button role, not a real `<button>` |
| Inline preview image | `img#fileiframefileembedbtnN` | Created dynamically after preview toggle |
| Return to Gradebook | `button.secondary:has-text("Return to Gradebook")` | Exit button |
| Message Student | `a:has-text("Message Student")` | External/student contact link |

### Score input ID convention
- Single-part question: `scorebox{qIndex}`
- Multipart question: `scorebox{qIndex}-{partIndex}`
- Both question index and part index are **0-based**.

### Max score extraction

```javascript
const input = document.getElementById('scorebox0');
const maxScore = parseFloat(input.nextSibling.textContent.trim().replace('/', ''));
```

### File URL facts
- Host: `files.myopenmath.com`
- Pattern: `/ufiles/{uid}/{filename}`
- Authentication: none required for direct fetch
- Typical image shape: resized upload (often `.jpg`) suitable for vision review
- Other possible extensions: `.png`, `.pdf`, `.jpeg`, `.heic`

### Preview toggle facts
- `span.videoembedbtn#fileembedbtnN[role="button"]` is a span-based control, not a real button.
- Preview text usually flips from `[+]` to `[-]` when expanded.
- Inline preview images use IDs like `img#fileiframefileembedbtnN`.

### Navigation fact
- **Save and Next Student** performs full page navigation; always re-observe the page after clicking it.
