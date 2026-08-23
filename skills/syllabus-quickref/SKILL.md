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

**For the copies that get handed out, print the HTML.** `--pdf` runs it through
headless Chrome or Edge, which is the only renderer that agrees with the page
exactly, because it is the same engine and the same `@page` rules:

```bash
python scripts/render.py <course>-quickref.md --theme annotated \
    --html <course>-quickref.html --pdf <course>-quickref.pdf
```

With no browser installed it says so and stops; opening the `.html` and hitting
Ctrl+P → Save as PDF gives a byte-for-byte equivalent result. Nothing is lost by
doing it by hand. The page also carries a **Save as PDF** button in its footer,
which is the same `window.print()` and is hidden from the printed sheet.

**Every theme sets `@page { margin: 0 }` and holds the page margin on `body`
padding instead. Do not "tidy" that back.** Chrome and Edge draw their print
header and footer — the date, the title, the file URL, the page number — inside
the `@page` margin box. Print with a margin there and a teacher gets
`8/16/26, 3:28 PM   Introduction to Statistics: Quick Reference` across the top
of a handout. With no margin box there is nowhere to draw them. The printed
geometry is unchanged because the same measurement moved onto the body, which is
why the print block no longer zeroes body padding.

The three outputs are for three different jobs, and it is worth not confusing
them. The **PDF** is the artifact you print and hand out. The **HTML** is the
one you publish or email a link to. The **.docx** is for the person who needs to
change a date — it rebuilds the layout out of Word primitives (a compartment is
a one-column bordered table, a column is a section property, the weight bar is a
row of proportionally-sized shaded cells) and is a good likeness, not a copy. If
the Word file and the page disagree, the page is right.

#### The three hand marks

Beyond `**bold**`, the dialect carries the three marks a teacher actually makes
on a page. Use them on the handful of facts a family comes to the page for, and
nothing else: a page where everything is highlighted has highlighted nothing.

| Syntax | Mark |
|---|---|
| `==ten per semester==` | a highlighter band behind the words |
| `((No retakes))` | a pen circle round a hard rule |
| `~~check here first~~` | a handwritten aside |

All three delimiters are two characters, and that is deliberate. A single `~`
was tried first: one stray tilde anywhere in a syllabus silently turns the rest
of its line into handwriting, and neither the checker nor the renderer would say
so. Doubling costs one character and removes the failure. GFM reads `~~` as
strikethrough, which this dialect does not have, so nothing is shadowed.

Each theme translates the three into its own register, and the two without a
hand translate hardest: `bookshelf` and `spec` set the aside in italic rather
than script, and `bookshelf` draws the ring as a rule under the words, because
the bordered pill it used before broke in half whenever the phrase wrapped, and
a circled clause is long enough that it usually does.

`render.py` warns on an unclosed mark, with a line number, before it writes
anything. An odd `==` otherwise reaches the handout as a literal `==` and the
first person to notice is whoever printed thirty copies.

The `.docx` keeps all three. Word has a real highlighter and real fonts, so
`==swiped==` becomes a yellow highlight and `~~in hand~~` becomes Segoe Script,
both still editable as text. Word cannot draw an ellipse behind a run, so
`((circled))` becomes a character border in the accent colour — a box rather
than a circle, which still reads as "someone ringed this."

#### The byline

The line under the title is one `·`-separated list. A segment written
`Label: value` carries its label separately, which the grid themes stack above
the value as a spec cell and the rest print inline:

```markdown
Instructor: R. Calderon · Contact: r.calderon@ridgeview.example.edu · Periods: 2, 4, 6
```

Keep it to who, where and when: name, contact, and when the class meets. Reply
time, office hours and the rest belong under **Contact**, one screen down. Every
extra segment is width taken from the others, and the first thing a crowded
byline does is wrap the class times into a second line or push the last cell off
the row entirely.

#### Themes

`--theme NAME` picks the look. `--list-themes` prints what is installed, and
`--sticky "Head|body"` adds the corner note, which `annotated` and `markedup`
place top right. `bookshelf`, `spec` and `whiteboard` accept the flag and ignore
it, for opposite reasons: the first two carry no hand anywhere else, so one
rotated cursive note would be the only mark on the page and reads as a mistake,
while `whiteboard` is already entirely in a hand and a second one is a mark too
many.

```bash
python scripts/render.py <course>-quickref.md --theme annotated \
    --sticky "Read this first|the syllabus is longer. this is the part you need." \
    --html <course>-quickref.html
```

| Theme | What it is |
|---|---|
| `bookshelf` | The default. Parchment, one Wedgwood accent, the house theme below. |
| `annotated` | Crisp boxed compartments, Bodoni headings over Charter, hand used only as annotation: the corner note, a highlighter, an aside. |
| `spec` | The technical one. Monospace, coded section IDs, boxed compartments under a filled header bar. No corner note and no handwriting: the marks are set in the page's own face. |
| `markedup` | Hand-drawn frames keeping `spec`'s header bars and coded IDs, in academic serif. The weight bar is coloured in by hand. |
| `whiteboard` | Pens and whiteboard markers on white. Drawn frames, cursive heads, checkbox bullets, a hand-coloured weight bar, and no corner note. |

All five hold one letter page for a quick reference of the size step 3 targets.
Print each after a content change: the hand-drawn themes carry larger type and
run out of page soonest, and a two-page "one-pager" is the failure to watch for.

Writing another: a theme is `scripts/themes/NAME.css` redefining the token block
at the top of `spec.css`. The compartment box, the header bar, the masthead cell
strip and the ID chip are what a reader recognises a theme by, and `annotated`
and `spec` deliberately share all four, separating on face and hand instead:
Charter with a sticky note and cursive asides against monospace with neither.
That is the closest two themes should sit. A third one built on the same four
would not read as a third theme, so change one of them as well. `diagrams.py` paints the weight bar from those same
token names, so the figure recolours itself and never needs touching. A theme
that needs an SVG filter ships `NAME.defs.html` beside it, injected into the top
of `<body>`. Two rules learned the hard way and worth keeping:

- **Displacement scales with the mark.** One `feDisplacementMap` cannot serve
  both a 200pt frame and a 6pt checkbox: the scale that makes the frame read as
  hand-drawn shreds the checkbox into noise. Use a second, gentler filter for
  small marks, and below roughly 8pt use none at all, just uneven corner radii.
- **A filter alone does not read as hand-coloured.** The weight bar's segments
  carry `class="seg"` and the surround `class="frame"`, so a theme can roughen
  them, and roughening alone still looked printed. What sells it is the fill
  falling short of the ruled line, a rounded corner, a degree of tilt alternating
  segment to segment, and turbulence stretched higher across the grain than along
  it, the way a marker leaves a ragged top edge and a straight side. The 7pt
  legend swatches, `class="key"`, take none of it.
- **The corner note is a flex child, never `position: absolute`.** Absolute
  reserves no space, so the note overflows itself and lands on top of whatever
  section sits underneath it.

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

### The pamphlet form

For back-to-school night, an open house, or anything handed to a room full of
people, the same Markdown lays out as a folded pamphlet:

```bash
python scripts/pamphlet.py <course>-quickref.md            # trifold, two sides
python scripts/pamphlet.py <course>-quickref.md --single   # one sheet, one side
```

The default is a six-panel trifold on two sides, with a cover panel carrying the
course name and a back panel a parent can read without unfolding anything. The
last section in the file becomes that back panel, so put the parent material
last. Print landscape letter, double sided, flipped on the short edge, then fold
the right third in and the left third over it.

`--single` puts three panels on one side of one sheet and folds in a Z, first
panel forward and last panel back, so one panel still faces outward. It holds
the same content at the same density as the portrait one-pager and costs half
the paper, at the price of the dedicated cover: panel one gets a masthead
instead. A letter fold would hide both printed faces on a one-sided sheet, which
is why this mode folds differently, and the printed banner says so.

A grading table whose percentages sum to 100 renders as a proportional bar
rather than rows, with the largest category in Wedgwood. Three numbers in a
table are three numbers to compare, and a student who sees that tests are three
quarters of the bar has taken in the most important thing on the page without
reading a word of it.

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

The output goes out under the teacher's name, so the voice is the teacher's
first-day voice rather than a writer's. For a reference document like this one
that means rhythm and punctuation rather than first-person reflection: no em dashes or en dashes, colons carrying the reveal,
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
- `scripts/pamphlet.py`, the same Markdown into a folded trifold, either six
  panels across two sides or three on one.
