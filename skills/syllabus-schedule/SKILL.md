---
name: syllabus-schedule
description: Use when a course schedule, calendar, pacing guide, lesson list, or "dates only" handout should be pulled out of a full syllabus and printed on its own. Covers isolating the day-by-day tables from a syllabus .docx and rendering them as a multi-page PDF in the same house theme as the quick reference.
---

# Course schedule handout

The schedule is the part of a syllabus people go back to all year. Everything
around it is read once. Isolating it produces the one document a student tapes
inside a binder, and it costs nothing to make because the tables are already
written: this pulls them out of the .docx verbatim rather than retyping them.

**Sibling skill:** `syllabus-quickref` turns the same syllabus into a one-page
policy summary and owns the renderer and themes this borrows. A course should
have both, in the same theme.

## The one thing to get right

Nothing here is rewritten. The tables come out of the source exactly as they
went in, so the failure mode of the quickref skill, inventing a plausible fact,
cannot happen. The failure mode here is different: **picking up the wrong
tables, or quietly missing some**. Count the sections against the syllabus
before you hand the PDF over.

## Workflow

Ask first, then run it. This is a one-command skill and the whole decision is
which course, which theme, and how many pages are acceptable.

```bash
python scripts/schedule.py "/abs/path/Syllabus - IM1 2026-2027.docx" \
    --theme annotated --out syllabi/im1/out --name im1-schedule
```

That writes `im1-schedule.md`, `.html` and `.pdf`. Multi-page is normal and
expected: a year of lessons is five to eight pages. Do not shrink it to fit.

**The `.md` is the editable artifact.** Hand-edit it (rename a column, drop a
section, reword a heading) then re-run against the `.md` instead of the `.docx`
to reprint without losing the edits:

```bash
python scripts/schedule.py syllabi/im1/out/im1-schedule.md --theme annotated
```

Re-running against the `.docx` overwrites those edits, which is what you want
after the syllabus itself changes and nothing else.

## What it takes, and what it leaves

A table is claimed by its header row, never its position, because the shape
differs per course. Claimed:

| Header starts | What it is |
|---|---|
| `#` | a lesson or meeting list, however many columns follow |
| `Unit` | a chapter overview, the year at a glance |
| `Date` + `Weekday` | non-school days, minimum days, any calendar table |

Everything else stays behind: grade weights, the grading scale, contact and
response times, the phone policy. Those belong on the quick reference.

Each table becomes one compartment titled by the heading above it in the
document, with the paragraph under that heading as an intro line. The paragraph
before the very first table becomes the closing note.

Rows with an empty first cell are the no-school and holiday rows, and they get
a shaded italic band so the gaps in the year read at a glance.

## Check before handing it over

- **Section count.** Open the syllabus and count its schedule tables. Computer
  Science has fifteen, one per chapter; Integrated Math 1 has five. A missing
  one means a header this does not recognise, so add it to `is_schedule`.
- **Page breaks.** Look at the PDF, not the HTML. Chrome breaks between rows,
  but a compartment header stranded at the foot of a page needs the section
  split or a shorter intro line.
- **Column width.** Five columns fit a single letter column at this type size.
  Six probably will not.

## Common mistakes

| Mistake | What happens |
|---|---|
| Rendering two columns | A four-column date table in a half-width column is unreadable. Stay at `--columns 1`. |
| Trying to fit one page | A year does not fit one page. The quick reference is the one-pager. |
| Regenerating from the `.docx` after editing the `.md` | Silently reverts hand edits. Re-run against the `.md`. |
| Using a different theme than the course's quick reference | The two handouts stop reading as a set. |
