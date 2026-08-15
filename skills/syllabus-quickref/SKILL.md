---
name: syllabus-quickref
description: Rewrites a course syllabus into a one-page plain-English quick reference for students and parents. Strips the district legal boilerplate, policy citations, and compliance language, keeps only what a family acts on (contact, grading weights, late work, absences, supplies, help hours), and renders it as Markdown, a printable HTML one-pager, and .docx in the bookSHelf house theme. Use this skill whenever someone wants a syllabus shortened, simplified, made parent-friendly, or turned into a handout, cheat sheet, one-pager, first-day handout, or back-to-school-night page, and whenever someone says a syllabus is too long, too wordy, full of legalese, or that nobody reads it. It also applies when someone just hands over a syllabus PDF, Word file, or Google Doc and asks to clean it up or pull out the important parts.
---

# Syllabus quick reference

Turn a full syllabus into one page a student can read in ninety seconds and a
parent can search in ten.

The full syllabus stays exactly as it is, which is what makes the cutting safe:
this page is a companion, nothing is lost, and the compliance language is simply
no longer standing between a family and the answer they came for.

## The two ways this goes wrong

Timidity is the first. Keeping the academic integrity paragraph in case someone
needs it produces a second long document, which is the problem the teacher
already had, and a page that does not fit on a page does not get read.

Invention is the second and the worse one. Compressing prose into rules tempts
you to complete the pattern, so a syllabus that never named a late penalty
acquires one because every neighboring section had numbers in it. The result
reads well, matches the tone of everything around it, and is wrong, and a family
will hold the teacher to it. `scripts/check.py` exists for that failure
specifically, because it is the one nobody catches by proofreading.

Cut hard. Invent nothing. Every fact on the page traces to a line in the source.

## Workflow

### 1. Get the source into plain text

The checker in step 4 compares the rewrite against a text file, so produce one
first whatever the input format was.

```bash
python scripts/extract.py /abs/path/to/syllabus.pdf     # or .docx
# -> syllabus.source.txt
```

A PDF or Word file on disk goes through the command above. If it reports very
little text the PDF is a scan, so read it with the Read tool instead and save
the text yourself to `<name>.source.txt`. For a Google Doc, use the Google Drive
MCP tools, `search_files` to find it and `read_file_content` to pull it, then
write the result to a `.source.txt` file so the checker has something to compare
against. Pasted text goes into `.source.txt` verbatim before anything else
starts.

Read the whole source before writing. The grading weights, the late policy and
the contact block are usually in three different registers scattered across four
pages, and what the rewrite ends up looking like depends on what is actually
there.

### 2. Triage

Read `references/rewriting.md` at this point, since it carries the keep and cut
catalog, the translation patterns, and worked before-and-after examples. The
question it turns on: would a student or parent ever change what they do because
of this line? If it only matters in a dispute, or it describes the district
rather than the class, it goes.

### 3. Draft the page

Write `<course>-quickref.md` on the skeleton below, dropping any section the
syllabus does not cover, because an empty heading is an invitation to fill it in
from imagination. Keep the order, which is roughly the order the questions get
asked in.

```markdown
# <Course>: Quick Reference
<Teacher> · Room <N> · Period(s) <N> · <Term/Year>

## Contact
- **Email:** <address>, I reply within <N> school day(s)
- **Extra help:** <days, times, room>
- **Class site:** <link>   **Grades:** <portal>

## What we cover
- <3 to 5 plain bullets, no standards codes>

## Bring every day
- <short list>

## Your grade
| What | Weight |
|---|---|
| <category> | <N>% |

Scale: A 90+ · B 80+ · C 70+ · D 60+

## Turning work in late
- <exact numbers: how much off, for how many days>
- <passes, extensions, or extra credit if the syllabus offers any>

## When you are absent
- **Excused:** <the step the student takes, and by when>
- **Planned ahead:** <what to arrange before leaving>

## Tests
- **Retakes:** <when allowed, how to ask, or that there are none>

## In the room
- **Phones:** <the enforced version>
- **Cheating or AI-written work:** <consequence only>

## Dates to know
- <fixed dates only>

## For parents
- **Check grades:** <portal, how often it updates>
- **Reach me:** <preferred channel>

> The full syllabus has the complete policies. This page is the short version.
```

Aim for under about 350 words on a two-column page, or 255 on a single column.
Those numbers come from measuring real drafts rather than instinct: a 353-word
page fills 966px of the 970px a letter sheet has left after its margins. Numbers
go in tables, everything else goes in bullets, and nothing goes in paragraphs.

**Keep each section to roughly four or five bullets.** Sections are never split
across the column boundary, because a rule someone is scanning for should be
whole and under its own heading rather than continued in the next column. That
makes section length the thing you control: nine bullets under one heading
cannot pack into a column, so it strands half a page of white space and pushes
the rest onto a second sheet. When a section grows past five bullets, the fix is
not to shrink the type, it is to divide the section into the questions people
actually ask. One long "Rules that change your grade" list becomes "Turning work
in late," "When you are absent," "Tests," and "In the room," which packs into
columns and is easier to scan besides.

### 4. Check it before showing anyone

```bash
python scripts/check.py <course>-quickref.md --source syllabus.source.txt
```

The checker traces every number, email and link in the rewrite back to the
source, confirms the grading weights still sum to 100, flags legal phrasing that
survived, flags em dashes and exclamation points that break the house voice,
flags sentences too long to skim, and flags going over the page budget. Exit
code 1 means something failed.

A `[FAIL]` on an unmatched number is not a formatting nit. It is either an
invented fact or a number the syllabus wrote out in words, so trace each one to
a specific line in the source or cut it, and do not reword around the check to
quiet it.

### 5. Render

```bash
python scripts/render.py <course>-quickref.md \
    --html <course>-quickref.html \
    --docx <course>-quickref.docx
```

This produces a print-ready two-column letter page, `--columns 1` for a single
column, and an editable Word file carrying the same content. The Markdown file
is already usable for Canvas, Google Classroom, or an email body.

Both renderers apply the bookSHelf house theme: parchment canvas, one Wedgwood
blue accent held under five percent of the surface, warm ink ramp, serif
headings at weight 500, en-dash bullets in Wedgwood, and numbered section
markers. The theme spec lives in the bookSHelf repo at
`.claude/skills/theme-factory/themes/bookshelf.md`, and print one-pagers are
listed there as one of its intended uses.

The renderer reads a deliberately small slice of Markdown, headings, bullets,
pipe tables, `**bold**`, and `>` for the closing note. A draft that needs more
than that is too elaborate for a one-pager.

Offer to publish the HTML as an Artifact when the teacher wants a link to send
home rather than a printout.

### 6. Tell the teacher what the syllabus did not say

Gaps found in step 3 are a deliverable rather than a footnote, so close with
them, phrased as questions a teacher can answer in one sentence:

> Two things your syllabus does not cover, and parents ask about both: how long
> you take to reply to email, and whether tests can be retaken. Want them on the
> page?

Never fill a gap with a plausible default. That is the one error the teacher
cannot see and will still be held to.

## Multiple syllabi

A teacher with four preps wants four pages that look like siblings, so run the
whole workflow once per course rather than merging them, and hold the section
order, the wording of shared rules, and the column count identical across all
four. A parent with two kids in the building should recognize the format on
sight, and a late-work policy that is the same in all four classes should be
worded the same way in all four.

## Voice

The output goes out under the teacher's name, so it follows the house voice
profile in `~/.claude/skills/humanizer/voice-shuff.md`. For a reference document
like this one that profile governs rhythm and punctuation rather than injecting
first-person reflection: no em dashes or en dashes, colons carrying the reveal,
commas doing the joining, no semicolons, and specifics kept exactly as the
syllabus stated them. Bold is for structural labels such as policy names, never
for emphasis inside a sentence. `references/rewriting.md` has the tone
guardrails on adding warmth or menace that the syllabus never carried.

## Files

- `references/rewriting.md`, the keep and cut catalog, translation patterns,
  worked examples, and tone guardrails. Read it during step 2.
- `scripts/extract.py`, PDF, DOCX or TXT into plain text.
- `scripts/check.py`, the fidelity, jargon, voice, readability and length audit.
- `scripts/render.py`, Markdown into printable HTML and .docx.
