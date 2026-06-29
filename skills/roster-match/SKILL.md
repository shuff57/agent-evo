---
name: roster-match
description: Cross-references PDF sign-up rosters against unstructured class data text dumps to find overlapping students by STU ID and extract grades. Use this skill whenever the user provides one or more roster PDFs alongside class data text blocks and asks to find overlap, match students between lists, identify which sign-ups previously took a class, extract grades for students in both rosters, or any variation involving cross-referencing student lists by ID — even if they don't explicitly say "roster" or "match."
---

# Roster Match

Matches students between one or more PDF sign-up rosters and one or more unstructured class data text dumps. Extracts the Sem 1 letter grade and the last available grade (Sem 2 or 4th Prg) for students who appear in both. Results are grouped by PDF roster, then by class data block.

## Inputs

### 1. PDF Sign-Up Rosters (one or more)

PDF tables with columns: **STU ID, Last Name, First Name, Grade (level), Gender**.

Extract STU IDs, last names, and first names from each PDF. Build a lookup keyed on STU ID for each. The PDF is the authoritative source for clean student full names — use these in the output, not the abbreviated `Last, FirstInitial` form found in the class data.

The course name is on the PDF itself (e.g., "24525 Precalculus-P", "24522 HOTrig/Precal-P"). Use this to label each roster's results.

### 2. Unstructured Class Data (one or more text blocks)

Text exports from the student information system (tab-separated with irregular whitespace). Each block represents one class.

**Header row (from the data):** `Stu ID    Student Name    Grd    Course    1st Prg    2nd Prg    F Sem    3rd Prg    4th Prg    S Sem    Cred    Cit    WH    Abs    Tdy    Comments`

**Column layout (in order):**

1. STU ID (numeric, line-leading)
2. Name in `Last, FirstInitial` form (e.g., `Andel, N`)
3. Grade level (9–12)
4. Class name (e.g., `Integ Math 3-P`)
5. 1st Prg — first progress report grade
6. 2nd Prg — second progress report grade
7. F Sem (Sem 1) — first semester final grade
8. 3rd Prg — third progress report grade
9. 4th Prg — fourth progress report grade
10. S Sem (Sem 2) — second semester final grade (often blank if semester hasn't ended)
11. Credits (e.g., `5.00`)
12. Cit — citizenship
13. WH — work habits
14. Abs — absences
15. Tdy — tardies
16. Comments (optional)

**Known format quirks — handle defensively:**

- **Whitespace between fields varies.** May be tabs or spaces. Treat any run of whitespace (>1 space) as a separator — don't count tabs.
- **The name field is always `Last, FirstInitial`** (a single capital letter after the comma). Never let digits leak into the name.
- **Leading whitespace on every letter grade** (`   A+`). Always strip.
- **Variable trailing whitespace and empty columns** after the comments field.
- **Letter grades may be blank** if a progress report hasn't run yet. Treat blank as blank, not as a missing row.

**Parsing strategy:** split on runs of 2+ spaces or tabs. Reliable anchors:
- STU ID at line start (numeric)
- Name matches `Last, X` where `X` is a single capital letter
- Grade level is a 1–2 digit number (9–12)
- Six grade columns (each matches `[A-F][+-]?` or is blank)
- Credits is a decimal like `5.00`, after the grade run

Skip blank lines and the header row.

## Matching Logic

1. Parse each PDF roster into a `{STU_ID: {last, first}}` lookup labeled by the PDF's course name.
2. For each class data block, parse its rows.
3. For each PDF roster, intersect with each class data block on STU ID.
4. Match strictly on STU ID — ignore any name mismatches between sources.

## Output Format

Grouped by class data block first, then by PDF roster within each class.

**Within each class, show a subgroup heading per PDF roster** that has matches. Each subgroup gets its own markdown table.

Columns: **Student ID | Name | Sem 1 Grade | Last Grade**

- **Student ID**: full STU ID from the data
- **Name**: from the PDF, formatted `Last, First` (full first name, not initial)
- **Sem 1 Grade**: the F Sem column (column 7)
- **Last Grade**: S Sem (column 10) if present; otherwise 4th Prg (column 9). Show `—` if both are blank.

Example output:

```
Here's the overlap for each class:

**Integ Math 3-P**

*From Pre Calc roster (Precalculus-P):*

| Student ID | Name        | Sem 1 Grade | Last Grade |
|------------|-------------|-------------|-------------|
| 12347      | Ball, Alex  | B           | B-          |

*From Hon Trig roster (HOTrig/Precal-P):*

| Student ID | Name        | Sem 1 Grade | Last Grade |
|------------|-------------|-------------|-------------|
| 12345      | Andel, Noah | B-          | F           |
```

If a class block has no overlaps across all PDFs, write:

```
**[Class Name]**

No matching students.
```

If no class block has any overlap at all, write: `No matching students found in any class.`

## Response Style

- Lead with one short intro sentence (e.g., "Here's the overlap for each class:").
- Then the tables grouped by class and PDF roster.
- No extra commentary, analysis, or summary unless the user asks for it.
- Do not include students who appear in the class data but not in any PDF roster.
- Do not include students who appear in a PDF roster but not in any class data.
