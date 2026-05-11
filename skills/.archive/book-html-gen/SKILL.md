---
name: book-html-gen
description: Use when converting remastered markdown textbook content to styled interactive HTML pages with scroll-snapping, MathJax, navigation, dark mode, and collapsible solutions.
disable-model-invocation: true
---

# Book HTML Gen

> Convert remastered markdown textbook sections into self-contained static HTML pages. Uses a template system with CSS partials for styling, MathJax for math rendering, scroll-snap for slide-like navigation, and collapsible details elements for solutions. Supports both Claude-converted body content and legacy AI API conversion.

## Prerequisites
- bookSHelf project at `C:\Users\shuff\Documents\GitHub\bookSHelf`
- Remastered markdown file (from book-remaster)
- Template partials in `bookSHelf/scripts/workflows/templates/`

## When to Use
- After book-remaster has produced enhanced markdown
- After book-math-verify confirms content is correct
- Converting remastered sections to publishable HTML pages

## When NOT to Use
- Content hasn't been remastered yet (run book-remaster first)
- Math errors haven't been verified (run book-math-verify first)
- Only need to verify existing HTML (use book-verify)
- Generating HTML for full-chapter assembled markdown (>~2,000 lines) — AI context limit causes silent truncation (logs "assembled 31427 chars, 741 lines" for 8,012-line input, outputs only ~1 section worth of content). Use the HTML stitcher approach instead.

## Full-Chapter HTML: Stitch, Do NOT Re-Generate

When a chapter has all per-section HTMLs generated, build the full-chapter page by stitching them:
- Extract `<body>...</body>` content from each section HTML
- Inject unified nav linking all sections + chapter TOC
- Output to `html/Chapter_N_assembled.html`

This preserves identical content and avoids AI context limits.
Running html_gen.py on concatenated chapter markdown (8,000+ lines) will ALWAYS truncate — never do this.

## Guardrails

> ⚠️ **Must NOT:**
> - Include polyfill.io references (compromised CDN - CRITICAL security issue)
> - Use absolute filesystem paths in HTML output
> - Skip MathJax inclusion for math-containing content
> - Produce HTML without navigation elements
> - Generate HTML body directly in SKILL.md - use the html_gen.py script

## Quick Start
1. Ensure remastered markdown exists and passes math verification
2. Convert markdown body to HTML (Claude does this part)
3. Run html_gen.py to assemble with template
4. Verify output with book-verify

## Workflow

### Phase 1: Prepare Body Content
- **INPUT:** Remastered markdown file
- **ACTION:** Convert markdown to HTML body content following these rules:
  - Each `## Section Title` becomes a new `<section class="page-section">`
  - Math expressions `$...$` and `$$...$$` preserved for MathJax
  - Examples wrapped in `<div class="example">` with `<div class="example-title">`
  - Definitions wrapped in `<div class="definition">` with `<div class="definition-title">`
  - Solutions use `<details class="solution"><summary>...</summary><div class="solution-content">...</div></details>`
  - Problems wrapped in `<div class="problem">`
  - Insight notes in `<div class="insight-note">`
  - Context pauses in `<div class="context-pause">`
  - All elements need proper id attributes for TOC navigation
- **OUTPUT:** HTML body content file

### Phase 2: Assemble HTML Page
- **INPUT:** HTML body file, section title
- **ACTION:** Run html_gen.py to combine body with template:
```bash
cd /mnt/c/Users/shuff57/Documents/GitHub/bookSHelf && python3 scripts/workflows/html_gen.py --body-file "{body.html}" --input "{section.md}" --output "{section.html}"
```
- Do NOT pass `--prompt` — html_gen default (`create-html-body.md` + `build_template`) is correct bookSHelf format. Passing `create-static-html.md` produces slideshow output.
- For direct AI conversion (no body file), use `--provider copilot --model claude-sonnet-4.6`
- **OUTPUT:** Complete self-contained HTML file

### Phase 3: Post-Processing
- **INPUT:** Generated HTML file
- **ACTION:**
  - Verify no polyfill.io references
  - Check all `<details>` have `class="solution"`
  - Verify MathJax script present
  - Check all images have valid relative paths
  - Verify TOC links match element IDs
- **OUTPUT:** Clean HTML ready for book-verify

## Scripts

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `bookSHelf/scripts/workflows/html_gen.py` | Assemble HTML from body + template | `--body-file BODY --input MD --output HTML` | Complete HTML page |
| `bookSHelf/scripts/workflows/chunk_html.py` | Pre-process markdown into chunks | markdown file | Chunked content |
| `bookSHelf/scripts/workflows/stitch_chapter_html.py` | Stitch per-section HTMLs into chapter page | `--sections 1.1 1.2 ... --html-dir ... --output ... --chapter-title ... --project ...` | Chapter HTML (no AI) |

### Heading Normalization (pre-HTML step)

Before generating HTML from remastered markdown, run heading normalization to fix common chunk-stitching artifacts:

```bash
python3 scripts/workflows/normalize_headings.py \
  --project "Introduction to Stats" --chapter 1 [--dry-run]
```

This fixes:
- Multiple `#` (h1) headings in a section file → one h1, rest demoted to h2
- Cross-section content (e.g. section 1.3 content in a 1.5 file) → removed
- Chunk stitching artifacts (repeated "Table of Contents", "Chapter N" titles, AI artifacts) → removed
- Double-numbered headings (e.g. "1.4 1.4.3" → "1.4.3") → fixed
- Duplicate section title h2 (when h1 and h2 say the same thing) → h2 removed

Backs up originals as `.md.bak`. Run with `--dry-run` first to preview changes.

### Chapter HTML Stitcher Usage
```bash
cd /mnt/c/Users/shuff57/Documents/GitHub/bookSHelf
python3 scripts/workflows/stitch_chapter_html.py \
  --sections 1.1 1.2 1.3 1.4 1.5 \
  --html-dir "projects/Introduction to Stats/html" \
  --output "projects/Introduction to Stats/html/Chapter_1_assembled.html" \
  --chapter-title "Chapter 1: Introduction to Data" \
  --project "Introduction to Stats"
```
Extracts `<main class="main-content">...</main>` from each section, wraps in `<section id="section-1-N">`, builds one `<head>` + unified navbar. Pure Python, no AI, ~30s runtime.

**Heading demotion**: By default, the stitcher demotes all headings by 1 level (h1→h2, h2→h3, h3→h4) so the chapter-level `<h1>` is the page title and section titles become `<h2>`. A chapter-level `<h1>` with the chapter title is automatically added before section content. Use `--no-demote-headings` to disable this.

| Pitfall | Fix |
|---------|-----|
| Per-section HTML has h1 for section title, h2 for subsections | Stitch demotes h1→h2, h2→h3 so the assembled page has proper hierarchy |
| Assembled page has 5 competing h1 tags | Stitch adds one chapter h1 and demotes all section h1s to h2 |
| Remastered markdown has chunk stitching artifacts (multiple h1, duplicate TOC, "Student Enhanced Edition" headings) | Run `normalize_headings.py` before HTML generation |
| Navbar shows "1.1 1.1 Case study..." (duplicate section number) | Fixed: `section_label()` now detects if title already contains the section number. Was caused by `extract_section_title()` returning "1.1 Case study..." and `section_label()` prepending "1.1 " again |
| Element IDs have "section-section-1-1--..." (double section- prefix) | Fixed: `reanchor_ids()` now receives number prefix ("1-1") not full anchor id ("section-1-1"). Was caused by `section_anchor_id()` returning "section-1-1" but `reanchor_ids()` hardcodes "section-" prefix |

## Required CSS Classes

| Element | Required Class | Container |
|---------|---------------|-----------|
| Learning objectives | `.learning-objectives` | `<div>` |
| Context pause boxes | `.context-pause` | `<div>` |
| Insight notes | `.insight-note` | `<div>` |
| Definitions | `.definition` + `.definition-title` | `<div>` |
| Examples | `.example` + `.example-title` | `<div>` |
| Important rules | `.important-rule` | `<div>` |
| Problem sets | `.problem-set` | `<div>` or `<section>` |
| Individual problems | `.problem` | `<div>` |
| Solutions | `details.solution` | `<details>` |

## Error Handling

| Problem | Action |
|---------|--------|
| polyfill.io found in output | Remove immediately - security vulnerability |
| Missing solution class on details | Add `class="solution"` to all `<details>` elements |
| Broken image paths | Convert to relative paths from HTML file location |
| MathJax not rendering | Check `$` delimiters preserved correctly in HTML |
| Template partials missing | Verify `bookSHelf/scripts/workflows/templates/` exists |
| Double `<!DOCTYPE html>` / two `<body>` tags | Pipeline was passing `--prompt create-static-html.md` (slideshow prompt). Remove `--prompt` override — html_gen default (create-html-body.md) is correct |
| html_gen lint: "Prompt requests full HTML but `<html>` missing" (false positive) | create-html-body.md says "DO NOT include `<html>`" which trips the lint check. Fixed: check excludes prompts containing "DO NOT include" or "Body Fragment" |
| html_gen lint: "Unbalanced `<details>`" (false positive) | bare `.count("<details>")` misses `<details class="solution">`. Fixed: use `re.findall(r'<details\b', body)` |
| AI read timeout on large sections (700+ line MD) | Default AIClient timeout=300s too short. Pass `timeout=900` to AIClient constructor in html_gen.py. pipeline.py subprocess timeout also needs 1800s. Note: copilot endpoint may still flake on attempt 1 — retry logic will handle it but needs 3x900s = 45min worst case. Run html_gen.py directly (not via pipeline) to avoid pipeline subprocess timeout wrapper. |
| pipeline step_html timeout despite html_gen succeeding | pipeline.py `subprocess.run(..., timeout=900)` kills long html_gen runs. Bumped to 1800s. Still not enough for very large sections — run html_gen.py directly for sections >700 lines MD. |
| Copilot "Network/timeout error attempt 1/3" on large sections | Copilot endpoint flakes on attempt 1 (connection close). Retries with 900s timeout per attempt = up to 45min total. If attempt 1 fails repeatedly across multiple runs (not just one), switch to `--provider ollama --model glm-5.1:cloud` (note hyphen, not dot). GLM is slower but reliable. Available models: `glm-5.1:cloud`, `glm-5:cloud`. |
| Multiple stale background jobs from killed reruns | Kill ALL old procs before relaunching. `proc_*.log` filenames indicate which run is active. Old killed procs report exit 143 (SIGTERM) via system notifications — ignore them. |
| Running GLM jobs in parallel causes rate limits | Run GLM sequentially with 30-60s gap: `python3 html_gen.py ... 1.4 ... && sleep 30 && python3 html_gen.py ... 1.5 ...` in one background job. |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `<details>` without `class="solution"` | ALWAYS add `class="solution"` - CSS depends on it |
| Absolute filesystem paths in images | Use relative paths from the HTML output location |
| Including polyfill.io | Use MathJax CDN directly, no polyfill needed |
| Missing anchor IDs for TOC | Every h2 and example/problem div needs an id attribute |
| Skipping post-processing verification | Always check output for common bugs before publishing |
