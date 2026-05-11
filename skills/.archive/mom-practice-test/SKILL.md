---
name: mom-practice-test
description: Assembles a practice (ungraded/low-stakes) MOM assessment from existing repo questions first, drafts new ones only if gaps exist. Starts from a chapter/topic, SELECTS existing .php files, only drafts when coverage gaps remain, then creates the assessment with practice-specific settings. Triggers include "build a practice test", "practice assessment from chapter", "ungraded practice MOM".
---

# MOM Practice Test Builder

> Repo-first practice assessment builder. Starts from a chapter/topic, scans the question repo for matching .php files, selects existing questions, drafts new ones only to fill gaps, then creates the MOM assessment with practice-specific settings (unlimited attempts, show solutions, non-graded category).

## Distinction from mom-section-to-questions

That skill starts from a **web page section** and drafts from scratch. This one starts from a **chapter/topic**, SELECTS existing repo .php files first, only drafts if gaps exist, then creates the assessment with practice-specific settings. Use this skill when the goal is a practice test assembled from existing questions, not a fresh batch generated from source material.

## Prerequisites

- The MOM question repo at the workspace path with `questions/` directories and `AGENTS.md` files
- A logged-in MyOpenMath browser tab with the Playwriter Chrome extension connected
- The target course `cid` and block path for the new assessment
- Chapter/topic identifier (e.g. 'Ch8 Regression')

## When to Use

- Teacher wants a practice (ungraded/low-stakes) assessment for a chapter or topic
- Existing questions in the repo should be reused before drafting new ones
- The assessment needs practice-specific settings: unlimited attempts, show solutions, Homework subtype

## When NOT to Use

- Starting from a specific web page section and drafting from scratch — use `mom-section-to-questions`
- Single one-off question — edit the repo directly
- Building a graded quiz or test — use `mom-ind-test` or `mom-group-test`
- Essay/FRQ assessment — use `mom-frq`

## Practice Test Settings (addassessment2.php)

| Field | Value |
|-------|-------|
| `input#name` | `Practice: {topic}` |
| `select#displaymethod` | `All questions on one page` or `One at a time` — configurable, ask teacher |
| `select#subtype` | `Homework` (students can retry, see feedback) |
| `spinbutton#defattempts` | `999` (unlimited) or `3` — ask teacher |
| `select#gbcategory` | `Practice` or `Not for grade` |
| Show solutions | Yes (after last attempt) |
| Points | Low or 0 |

## Guardrails

> ⚠️ **Must NOT:**
> - Never skip the approval gate for new-drafted questions
> - Never create the assessment until questions are selected and gaps resolved
> - Never hardcode MOM URLs — always construct from `cid` and `block`
> - Never use blocked PHP functions in drafted questions (see `mom-section-to-questions` references/autofix-patterns.md)
> - Never set a graded category for practice tests — use `Practice` or `Not for grade`
> - Never add a question to the assessment without verifying it returns Correct first
> - Never draft all questions from scratch when existing repo questions exist — SELECT first, draft only for gaps

## Companion Skills

| Companion | Role |
|-----------|------|
| `mom-style-guide` | Voice, rubric design, randomization strategy, house style |
| `mom-lib-map` | Route the topic to the right MOM library node |
| `mom-patterns` | Reuse verified question patterns from the cached knowledge base |
| `mom-frq` | IMathAS syntax, macros, allowed functions, question-type scaffolds |
| `mom-page-map` | Browser/URL patterns for the MOM assessment creation and question-add pages |
| `mom-section-to-questions` | Workflow for the DRAFT NEW phase when gaps exist |
| `playwriter` | Browser automation for MOM pages |

Load `mom-style-guide`, `mom-lib-map`, `mom-patterns`, and `mom-frq` before drafting. Load `mom-page-map` before assessment creation.

## Workflow

### Phase 1: Gather Inputs

- **ASK the teacher** for:
  - Chapter/topic (e.g. 'Ch8 Regression')
  - Target course `cid` and block path
  - Number of questions N
  - Coverage priorities (which subtopics matter most)
  - Display method preference: all-on-one-page or one-at-a-time
  - Attempts: unlimited (999) or limited (3)?

- Do NOT start scanning until these are locked.

### Phase 2: Scan Repo

- Search `questions/` directories for matching .php files across families.
- Use `AGENTS.md` files (root and per-topic) to understand question families and their coverage.
- Build a **coverage matrix**: rows = subtopics within the chapter, columns = computation / conceptual / multipart, cells = list of matching .php files.
- Flag subtopics with zero or insufficient coverage as gaps.

### Phase 3: Select Existing

- Pick from the repo, prioritizing:
  - Variety: mix computation + conceptual
  - Coverage: at least one question per important subtopic
  - Quality: prefer questions with robust randomization
- Flag remaining gaps clearly.
- Present the selected list to the teacher with gap annotations.

### Phase 4: Draft New (If Gaps Exist)

- Apply the `mom-section-to-questions` workflow for missing coverage only.
- Draft the minimum number of new questions to fill gaps.
- **Approval gate required.** Show all drafts and wait for explicit "approve" before writing files.
- Follow `mom-style-guide`, `mom-lib-map`, `mom-patterns`, `mom-frq` for all drafting.
- If no gaps exist, skip this phase.

### Phase 5: Create Assessment

- Navigate to `addassessment2.php?block={block}&cid={cid}`.
- Set the assessment name: `Practice: {topic}`.
- Set practice-specific settings (see table above).
- Use `playwriter` + `mom-page-map` for all browser interactions.
- Record the new `aid` from the post-create URL.

### Phase 6: Add Questions

- For each question (existing repo first, then new drafts), run the create→verify→add loop per `mom-section-to-questions` references/mom-verify-loop.md:
  1. **Create** (if new): navigate to `moddataset.php?cid={cid}`, fill fields, save, extract `qid`.
  2. **Verify**: open `testquestion2.php?cid={cid}&qsetid={qid}`, compute expected answer, submit, read `.scoremarker`.
  3. **Auto-fix on Incorrect**: apply autofix patterns (max 2 attempts), then ask teacher.
  4. **Add to assessment**: navigate to `addquestions2.php?aid={aid}&cid={cid}`, search by description, check row, click `Add`.
  5. **Verify add**: confirm qid appears in "Questions in Assessment" table.
- For existing repo questions already on MOM: skip Create, go directly to Add using their existing `qid`.
- Keep a running log: `{slot, title, qid, file, gap-filled?, verify_status}`.

### Phase 7: Configure

- Verify all practice-specific settings on the assessment:
  - Display method matches teacher preference
  - Attempts set to 999 or 3 as requested
  - Gradebook category is `Practice` or `Not for grade` (never `Tests`)
  - Show solutions: Yes (after last attempt)
  - Points: low or 0
- If any setting is wrong, correct it via the assessment edit page.

### Phase 8: Update Docs

- If new .php files were written in Phase 4:
  - Update `questions/{topic}/AGENTS.md` with new question entries.
  - Update root `AGENTS.md` pointer if needed (add family count, structure line).
- Follow the thin-pointer pattern per `mom-section-to-questions` Phase 9.

### Phase 9: Summary

- Present a table of all questions:

| Slot | Title | QID | Repo File | Gap-Filled? |
|------|-------|-----|-----------|-------------|
| 1 | ... | 12345 | q1-slug.php | No |
| ... | ... | ... | ... | ... |

- Assessment URL for the teacher to preview.
- List any docs files updated.
- Remind teacher to preview the assessment in MOM.

## Error Handling

| Problem | Action |
|---------|--------|
| No matching questions found in repo for any subtopic | Proceed to Phase 4 for all N questions; inform teacher that all are new drafts. |
| Playwriter extension not connected | Pause at Phase 5 and walk through connection steps. |
| Verify returns Incorrect after 2 auto-fix attempts | Stop and ask teacher; do not add to assessment. |
| addquestions2.php search returns no rows | Search by description, not qid; adjust scope if needed. |
| New question causes CodeMirror sync failure | Ensure `cm.save()` after `cm.setValue()`, before clicking Save. |
| Assessment created with wrong settings | Edit via assessment page before adding questions. |

## Common Mistakes

| Mistake | Fix |
|----------|-----|
| Drafting all questions from scratch instead of scanning repo first | Always run Phase 2 Scan Repo and Phase 3 Select Existing before drafting. |
| Setting graded category (`Tests`) on a practice test | Use `Practice` or `Not for grade`. |
| Skipping the approval gate for gap-fill drafts | Phase 4 always requires explicit approval. |
| Adding a question without verifying it returns Correct | Run testquestion2.php for every question before adding. |
| Hardcoding MOM URLs | Construct all URLs from `cid`, `aid`, `block` parameters. |
| Using blocked PHP functions in drafted gap-fill questions | Check `references/autofix-patterns.md` before writing. |
| Forgetting to update AGENTS.md after writing new files | Phase 8 is mandatory when new .php files exist. |