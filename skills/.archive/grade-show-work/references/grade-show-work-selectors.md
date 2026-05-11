# MyOpenMath Show Work Page DOM Selectors Reference

Reference for the `gbviewassess.php` ("Review Assessment Attempts" / Individual Student Grading) page. This page shows one student at a time with their uploaded work files.

## Page Structure

```
div#app[role="main"]
└── div.gbmainview
    ├── (header area)
    │   ├── h2                                    ← Student name ("Baisley, Thomas")
    │   ├── h3                                    ← Assessment name ("Unit 1 Test")
    │   ├── (timestamps: Started, Last Changed, Time on-screen, Due Date)
    │   ├── button "Make Exception"
    │   ├── strong "Score in Gradebook: 82.3/100"
    │   ├── button "Override score"
    │   ├── button "Delete all attempts"
    │   ├── link "View as student"
    │   ├── link "Print version"
    │   ├── link "Activity Log"
    │   ├── button#assess_select "Scored attempt. Score: 82.3/100."
    │   └── button "Filters and Options"
    ├── (question sections — repeated per question)
    │   └── div.bigquestionwrap                   ← Question container (one per question)
    │       ├── strong "Question N."              ← Question label
    │       ├── button#qselectN "Version 1*/1. Score: X/Y"  ← Expand/collapse toggle
    │       │   └── div[role="region"][aria-label="Question N"]  ← Question content
    │       │       ├── (question prompt text + math images)
    │       │       ├── textbox#qnNNNN            ← Student response inputs (read-only)
    │       │       ├── button "View Key for Question N Part M"
    │       │       └── (for Q10: work upload area — see below)
    │       ├── button#qmoreN "More"              ← Additional options
    │       ├── "Score:" label
    │       ├── textbox#scoreboxN "Score" / textbox#scoreboxN-M "Score Part M"  ← Score inputs
    │       ├── text "/maxScore"                  ← Max score (next sibling of score input)
    │       ├── button "Full credit" / "Full credit all parts"
    │       ├── button.slim "Add feedback"
    │       ├── div#fbN.fbbox.skipmathrender.mce-content-body  ← Per-question feedback
    │       ├── "Last Changed" timestamp
    │       ├── button.slim "Show all tries"      ← (conditional)
    │       └── button.slim "Show applied penalties"  ← (conditional)
    ├── (work upload section — inside question with file upload)
    │   └── div.sidebyside
    │       ├── div.questionwrap.questionpane      ← Question content pane
    │       └── div.questionpane.viewworkwrap      ← Work upload pane
    │           ├── button.slim "Hide Work" / "View Work"  ← Toggle
    │           └── div.introtext                  ← File list container
    │               └── ul.nomark
    │                   └── li (per file)
    │                       ├── a.attach.prepped[target="_blank"]  ← File download link
    │                       └── span.videoembedbtn#fileembedbtnN[role="button"]  ← Preview toggle
    ├── (bottom area)
    │   ├── span#fblblgen + div#fbgen.fbbox.skipmathrender.mce-content-body  ← General feedback
    │   ├── button.primary "Save Changes"         ← (appears twice: top and bottom)
    │   ├── button.primary "Save and Next Student"
    │   ├── button.secondary "Return to Gradebook"
    │   └── link "Message Student"
    └── button.primary "Save Changes"             ← (duplicate at very bottom)
```

---

## Selector Quick Reference

### General Page Elements

| Element | Selector | Notes |
|---------|----------|-------|
| **Student name** | `h2` | First `<h2>` in `.gbmainview` |
| **Assessment name** | `h3` | First `<h3>` in `.gbmainview` |
| **Overall score** | `button#assess_select` | Text: "Scored attempt. Score: 82.3/100." |
| **Override score** | `button:has-text("Override score")` | Overall score override |
| **Make Exception** | `button:has-text("Make Exception")` | Due date/attempt exception |
| **Filters and Options** | `button:has-text("Filters and Options")` | Display filters |

### Question Elements

| Element | Selector | Notes |
|---------|----------|-------|
| **Question container** | `div.bigquestionwrap` | One per question, 0-indexed |
| **Question label** | `.bigquestionwrap strong` | Text: "Question N." |
| **Question expand/collapse** | `button#qselectN` | `aria-expanded`, `aria-controls="qselectN_wrap"` |
| **Question content region** | `div[role="region"][aria-label="Question N"]` | Inside qselect wrap |
| **More button** | `button#qmoreN` | Per-question additional options |
| **Student response inputs** | `input#qnNNNN` or `input#qnN-M` | Read-only student answers |
| **View Key button** | `button:has-text("View Key for Question N Part M")` | Per-part, inside region |
| **Show all tries** | `button.slim:has-text("Show all tries")` | Conditional, no id |
| **Show applied penalties** | `button.slim:has-text("Show applied penalties")` | Conditional, no id |

### Score Input Elements

| Element | Selector | Notes |
|---------|----------|-------|
| **Score input (single-part)** | `input#scoreboxN` | `aria-label="Score"`, type="text" |
| **Score input (multi-part)** | `input#scoreboxN-M` | `aria-label="Score Part M"`, type="text" |
| **Max score text** | `scoreInput.nextSibling` | Text node: "/3.333", "/10", etc. |
| **Full credit button** | `button:has-text("Full credit")` | Text varies: "Full credit" vs "Full credit all parts" |

### Feedback Elements

| Element | Selector | Notes |
|---------|----------|-------|
| **Per-question feedback** | `div#fbN.fbbox` | TinyMCE inline editor (contenteditable div) |
| **Per-question feedback label** | `span#fblbl{qIndex}` | Associated label |
| **Add feedback button** | `button.slim:has-text("Add feedback")` | No id, one per question |
| **General feedback** | `div#fbgen.fbbox` | TinyMCE inline editor at bottom of page |
| **General feedback label** | `span#fblblgen` | Labeled "Feedback for {Student Name}" |

### Work/File Upload Elements

| Element | Selector | Notes |
|---------|----------|-------|
| **Work upload pane** | `div.questionpane.viewworkwrap` | Only present on questions requiring file upload |
| **Hide/View Work toggle** | `button.slim` inside `.viewworkwrap` | Text toggles: "Hide Work" ↔ "View Work" |
| **File list container** | `.viewworkwrap .introtext` | Hidden via `display:none` when work is hidden |
| **File list** | `.viewworkwrap .introtext ul.nomark` | Unordered list of uploaded files |
| **File download link** | `a.attach.prepped[target="_blank"]` | Opens in new tab |
| **File preview toggle** | `span.videoembedbtn#fileembedbtnN[role="button"]` | **NOT a `<button>`** — it's a `<span>` with `role="button"` |
| **Preview toggle text** | `#fileembedbtnN` text content | `[+]` = collapsed, `[-]` = expanded |
| **Inline preview image** | `img#fileiframefileembedbtnN` | Created dynamically when [+] clicked |

### Navigation/Save Elements

| Element | Selector | Notes |
|---------|----------|-------|
| **Save Changes** | `button.primary:has-text("Save Changes")` | Appears 2x (top + bottom) |
| **Save and Next Student** | `button.primary:has-text("Save and Next Student")` | Single instance |
| **Return to Gradebook** | `button.secondary:has-text("Return to Gradebook")` | Single instance |
| **Message Student** | `a:has-text("Message Student")` | Opens externally |

---

## Extraction Code Example

```javascript
// Run inside page.evaluate() to extract all data for the current student
const studentName = document.querySelector('h2')?.textContent?.trim();
const assessmentName = document.querySelector('h3')?.textContent?.trim();

const questions = Array.from(document.querySelectorAll('.bigquestionwrap')).map((wrap, qIdx) => {
  const label = wrap.querySelector('strong')?.textContent?.trim();
  const region = wrap.querySelector('[role="region"]');
  const scoreInputs = Array.from(wrap.querySelectorAll('input[id^="scorebox"]'));
  
  return {
    index: qIdx,
    label,
    regionAriaLabel: region?.getAttribute('aria-label'),
    scores: scoreInputs.map(inp => ({
      id: inp.id,
      value: inp.value,
      max: inp.nextSibling?.textContent?.trim()?.replace('/', ''),
    })),
    // Check for file uploads
    fileLinks: Array.from(wrap.querySelectorAll('a.attach')).map(a => ({
      href: a.href,
      filename: a.textContent.trim(),
    })),
    hasWorkUpload: !!wrap.querySelector('.viewworkwrap'),
    // Feedback
    feedbackDivId: wrap.querySelector('.fbbox')?.id,
  };
});

return { studentName, assessmentName, questions };
```

---

## File Preview Pattern

### Toggle Behavior

1. **Click `[+]`** on `span#fileembedbtnN`: A `<div>` with `<img>` is inserted inside the `<li>`, after the `<span>` button
2. **Image ID pattern**: `fileiframefileembedbtn{N}` (e.g., `fileiframefileembedbtn0`)
3. **Image src**: Same URL as the `<a>` link (`files.myopenmath.com/ufiles/{uid}/filename.jpg`)
4. **Image dimensions**: 750×1000 (resized photos)
5. **Button text changes**: `[+]` → `[-]`, title changes to "Hide preview"
6. **Click `[-]`**: Image removed, button reverts to `[+]`
7. **No lightbox, no new tab** — purely inline toggle

### Extracting File URLs

```javascript
// Get all uploaded work files for a question
const workPane = document.querySelector('.viewworkwrap');
if (workPane) {
  const files = Array.from(workPane.querySelectorAll('a.attach.prepped')).map(a => ({
    url: a.href,
    filename: a.textContent.trim()
  }));
  return files;
}
```

---

## Hide/View Work Toggle Pattern

### Toggle Behavior

1. **Default state**: "Hide Work" button visible, `.introtext` div visible (`display: block`)
2. **Click "Hide Work"**: Button text changes to **"View Work"**, `.introtext` gets `display: none`
3. **Click "View Work"**: Reverts to "Hide Work", `.introtext` back to `display: block`

### Code Pattern

```javascript
// Toggle work visibility
const toggleBtn = document.querySelector('.viewworkwrap button.slim');
if (toggleBtn?.textContent.includes('Hide Work')) {
  toggleBtn.click(); // Click to hide work
} else if (toggleBtn?.textContent.includes('View Work')) {
  toggleBtn.click(); // Click to show work
}
```

---

## Score Modification Pattern

### ID Convention

- **Single-part question**: `scorebox{qIndex}` (e.g., `scorebox1`, `scorebox3`)
- **Multi-part question**: `scorebox{qIndex}-{partIndex}` (e.g., `scorebox0-0`, `scorebox0-1`, `scorebox0-2`)
- Question index is 0-based (Question 1 = index 0)
- Part index is 0-based

### Setting a Score

```javascript
// Fill score for question 1 (single-part)
const scoreInput = document.getElementById('scorebox1');
scoreInput.value = '8';
scoreInput.dispatchEvent(new Event('input', { bubbles: true }));

// Fill score for question 1 part 2 (multi-part)
const partScoreInput = document.getElementById('scorebox0-1');
partScoreInput.value = '2.5';
partScoreInput.dispatchEvent(new Event('input', { bubbles: true }));
```

### Max Score Extraction

```javascript
// The max score is a text node immediately after the score input
const scoreInput = document.getElementById('scorebox1');
const maxText = scoreInput.nextSibling.textContent.trim(); // "/10"
const maxScore = parseFloat(maxText.replace('/', '')); // 10
```

---

## Feedback Pattern (TinyMCE)

MyOpenMath uses TinyMCE inline editors for feedback. You must set BOTH the visible contenteditable div AND dispatch an input event.

```javascript
// Per-question feedback
const fbDiv = document.getElementById('fb0');
if (fbDiv) {
  fbDiv.innerHTML = '<p>Your feedback here</p>';
  fbDiv.dispatchEvent(new Event('input', { bubbles: true }));
}

// General feedback
const fbGen = document.getElementById('fbgen');
if (fbGen) {
  fbGen.innerHTML = '<p>General feedback here</p>';
  fbGen.dispatchEvent(new Event('input', { bubbles: true }));
}
```

---

## Navigation: Save and Next Student

### Behavior

1. **Saves current scores** and navigates to next student
2. **Full page navigation** (not SPA routing) — triggers `document` resource type request
3. **URL changes**: `uid` parameter changes to next student's user ID
4. **`stu` param dropped**: Original URL had `stu=0`, next student URL omits it

### URL Transition Example

```
Before: /gbviewassess.php?stu=0&cid=306621&aid=22202268&uid=7158609  (Student A)
After:  /gbviewassess.php?cid=306621&aid=22202268&uid=7158624        (Student B)
```

### After Clicking Save and Next

```javascript
// Wait for navigation to complete
await page.waitForURL(/gbviewassess\.php/);
// Then re-extract data for the new student
const newStudentData = await page.evaluate(() => {
  return {
    name: document.querySelector('h2')?.textContent?.trim(),
    // ... extract other fields
  };
});
```
