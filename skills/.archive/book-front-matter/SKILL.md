---
name: book-front-matter
description: Use when generating a front matter HTML page for a merged bookSHelf project. Reads source book metadata from all contributing books, produces a styled page showing the remix evolution timeline, source attributions, merge statistics, educator attribution (Steven Huff), and license.
disable-model-invocation: true
---

# Book Front Matter

> Generates a self-contained HTML front matter page for a merged bookSHelf project.
> Uses the existing template/partials system (same CSS variables, navbar, dark mode).
> Reads metadata automatically from project JSON files — no manual input needed.

## When to Use

- After book-merge has produced a merged chapter JSON
- Before or after book-remaster — front matter is independent of chapter content
- Any time you want a proper title/attribution page for a project with 2+ source books
- Can also be run for single-book projects (shows source attribution + educator credit)

## Script

```
scripts/workflows/front_matter_gen.py
```

Located at: `/mnt/c/Users/shuff57/Documents/GitHub/bookSHelf/scripts/workflows/front_matter_gen.py`

## Quick Start

```bash
cd /mnt/c/Users/shuff57/Documents/GitHub/bookSHelf

# Stats project (merged, 2 source books):
python3 scripts/workflows/front_matter_gen.py \
  --project "Introduction to Stats" \
  --output  "projects/Introduction to Stats/html/front_matter.html" \
  --title   "Statistics: A Unified Introduction" \
  --subtitle "Merged & Remastered Edition" \
  --course-title "Introduction to Statistics"

# Applied Finite Math (single source):
python3 scripts/workflows/front_matter_gen.py \
  --project "Applied Finite Math" \
  --output  "projects/Applied Finite Math/html/front_matter.html" \
  --course-title "Applied Finite Mathematics"
```

## Arguments

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--project` | Yes | — | Folder name under `projects/` |
| `--output` | Yes | — | Output HTML path (relative to project root or absolute) |
| `--title` | No | Auto-detected | Merged book title shown in hero |
| `--subtitle` | No | "Merged & Remastered Edition" | Subtitle line in hero |
| `--course-title` | No | Same as title | Navbar brand text |

## What It Auto-Detects

The script reads these locations without any manual configuration:

| Data | Source |
|------|--------|
| Book titles | `remastered/*_full_source.json` → `title` field |
| Edition info | `remastered/*_full_source.json` → `metadata.edition` |
| Author names | `source_files/*/layout.json` — pages 1-3, name-pattern extraction |
| Copyright year | `source_files/*/layout.json` — first "© year" line |
| License text | `source_files/*/layout.json` — first "Creative Commons" line |
| Merge stats | `remastered/Merged/*_report.md` — most recent file |

## Page Sections

The generated HTML page contains:

1. **Hero** — title, subtitle, "Merged Edition" badge, year
2. **Remix Evolution Timeline** — each source book as a timeline node → Merge step → AI Remaster step → Final merged edition
3. **Source Attributions** — card grid, one card per source book with title, edition, authors, copyright, license
4. **Merge Statistics** — number of source books, sections merged in, total sections (only shown if merge report exists)
5. **Educator** — Steven Huff card with bio, credentials (10+ years, 20+ courses, $300K grant, 10+ tools), role badges, link to https://shuff57.github.io/steven/
6. **License** — CC BY 4.0 summary with remix attribution notice

## Design

Inherits the full bookSHelf design system:
- CSS variables from `partials/css/variables.css` (same `--primary-color`, `--secondary-color`, etc.)
- Navbar with dark mode toggle, dropdown menus (empty for front matter — no section/example/problem/video links)
- Dark mode support via `body.dark-mode` overrides
- No polyfill.io (safe CDN — MathJax only)
- Responsive grid for attribution cards

## Output Verification

After running, check:
```bash
# No polyfill.io (security check)
grep -c "polyfill" "projects/.../html/front_matter.html"
# Should be 0

# Educator link present
grep "shuff57.github.io" "projects/.../html/front_matter.html"

# Author names are clean (not garbled metadata)
grep "fm-attr-author" "projects/.../html/front_matter.html"

# Merge stats visible (Stats project)
grep "fm-stat-num" "projects/.../html/front_matter.html"
```

## Pitfalls

- **Garbled author from full_source.json metadata**: The raw JSON `metadata.author` is often noisy. The script prefers layout.json name-pattern extraction. Author names must be 2-5 words, title-case, no punctuation, not matching institution keywords.
- **AHSS license wraps across two PDF spans**: AHSS wraps "This textbook is also avail-" / "able under a Creative Commons..." with a soft hyphen. The script joins hyphen-terminated lines before searching. Unhyphenated continuation lines start lowercase — script skips lowercase-starting CC lines.
- **AHSS layout has null content fields**: page 1 spans have content: null (image-based PDF). Null spans are skipped automatically.
- **Auto-title for single-book projects**: Without --title, title is just the source book name. Always pass --title for production.
- **Navbar placeholders**: section_links / example_links / problem_links / video_links are filled with empty strings for front matter. Dropdowns render empty — correct behavior.
- **ProgressReporter API**: Uses ProgressReporter("front_matter", total_steps=5) with .start(), .update(step, msg), .complete(result, msg) — NOT .progress() (legacy, throws TypeError).

## Integration with Pipeline

The front matter page is standalone — it does not connect to `pipeline.py`.
To add it to the Electron UI, wire up a new `pipeline:run` IPC step or call it as a separate workflow step.

Output JSON (compatible with Electron progress stream):
```json
{"phase": "Complete", "progress": 100, "message": "Front matter written to ...", "result": {"success": true, "output_file": "...", "books_found": 2, "merge_report": true}}
```
