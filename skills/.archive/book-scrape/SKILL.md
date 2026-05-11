---
name: book-scrape
description: Use when scraping and concatenating textbook source content from scraped section files into a single full.md file, especially when starting a new bookSHelf project or adding a new source book.
disable-model-invocation: true
---

# Book Scrape

> Scrape and concatenate textbook source sections into a unified markdown file. Reads a manifest of previously scraped sections, concatenates them in chapter/section order, normalizes markdown formatting, and produces a full_source.md ready for downstream pipeline processing.

## Prerequisites
- bookSHelf project exists at `C:\Users\shuff\Documents\GitHub\bookSHelf`
- Project directory exists under `bookSHelf/projects/{ProjectName}/`
- Source sections already scraped into `source_files/{source}/` with manifest.json

## When to Use
- Starting a new textbook project and need to assemble scraped sections
- Adding a new source book to an existing project
- Re-concatenating after adding/fixing scraped sections

## When NOT to Use
- Sections haven't been scraped yet (scrape manually first)
- Need to match/merge multiple books (use `book-section-match` then `book-merge`)

## Guardrails

> ⚠️ **Must NOT:**
> - Run without verifying the project directory exists
> - Modify original scraped section files
> - Skip the --dry-run step on first execution

## Quick Start
1. Verify project structure exists
2. Run with --dry-run to preview
3. Run for real to produce full_source.md

## Workflow

### Phase 1: Validate Project
- **INPUT:** Project name and source identifier
- **ACTION:** Verify `bookSHelf/projects/{project}/source_files/{source}/` exists with manifest.json
- **OUTPUT:** Confirmed project path and section count

### Phase 2: Dry Run
- **INPUT:** Project name, source name
- **ACTION:** Run scrape_concat.py with --dry-run flag
```bash
cd C:\Users\shuff\Documents\GitHub\bookSHelf && python scripts/workflows/scrape_concat.py --project "{project}" --source "{source}" --dry-run
```
- **OUTPUT:** Preview of sections to concatenate and output path

### Phase 3: Execute
- **INPUT:** Confirmed dry run output
- **ACTION:** Run scrape_concat.py without --dry-run
```bash
cd C:\Users\shuff\Documents\GitHub\bookSHelf && python scripts/workflows/scrape_concat.py --project "{project}" --source "{source}"
```
- **OUTPUT:** `projects/{project}/source_files/{source}/full.md` containing all sections

### Phase 4: Verify
- **INPUT:** Generated full.md file
- **ACTION:** Check file exists, count sections (grep for `# X.Y` headers), verify size is reasonable
- **OUTPUT:** Section count and file size confirmation

## Scripts

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `bookSHelf/scripts/workflows/scrape_concat.py` | Concatenate scraped sections | `--project NAME --source SRC` | JSON progress + full.md file |

## Error Handling

| Problem | Action |
|---------|--------|
| Project directory missing | Create it with required subdirs (source_files, remastered, html) |
| manifest.json missing | List available files and ask user to create manifest |
| No sections found | Report empty source directory |
| Script import error | Ensure running from bookSHelf root directory |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Running from wrong directory | Always cd to bookSHelf root before running scripts |
| Forgetting --dry-run first | Always preview before executing |
| Wrong source name | List available sources in source_files/ directory |
