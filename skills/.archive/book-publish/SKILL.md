---
name: book-publish
description: Use when publishing finished HTML textbook pages from a bookSHelf project to the docs/ folder for GitHub Pages, especially after HTML generation and verification pass.
disable-model-invocation: true
---

# Book Publish

> Publish verified HTML pages from a bookSHelf project's html/ directory to the docs/ folder for GitHub Pages hosting. Copies HTML files, resolves image paths (copying images alongside), and regenerates the index.html with links to all published sections.

## Prerequisites
- bookSHelf project at `C:\Users\shuff\Documents\GitHub\bookSHelf`
- HTML files in `projects/{project}/html/` verified by book-verify
- docs/ directory exists at bookSHelf root

## When to Use
- After book-verify confirms HTML output passes all checks
- Publishing new or updated sections to the docs site
- Regenerating the index after adding sections

## When NOT to Use
- HTML hasn't been verified yet (run book-verify first)
- Need to generate HTML from markdown (use book-html-gen first)
- Only need to verify, not publish (use book-verify)

## Guardrails

> ⚠️ **Must NOT:**
> - Publish HTML that hasn't passed book-verify
> - Overwrite docs/ files without --dry-run first
> - Skip image resolution (images must be copied alongside HTML)
> - Publish files containing polyfill.io references

## Quick Start
1. Run with --dry-run to preview what will be published
2. Review the publish plan
3. Run without --dry-run to execute
4. Verify docs/ directory has correct files

## Workflow

### Phase 1: Dry Run
- **INPUT:** Project name, optional section filter
- **ACTION:** Run publish.py with --dry-run
```bash
cd C:\Users\shuff\Documents\GitHub\bookSHelf && python scripts/workflows/publish.py --project "{project}" --dry-run
```
For specific sections:
```bash
cd C:\Users\shuff\Documents\GitHub\bookSHelf && python scripts/workflows/publish.py --project "{project}" --sections 5.5 --dry-run
```
- **OUTPUT:** Preview of files to copy, image paths to resolve, index updates

### Phase 2: Execute Publish
- **INPUT:** Confirmed dry run output
- **ACTION:** Run publish.py for real
```bash
cd C:\Users\shuff\Documents\GitHub\bookSHelf && python scripts/workflows/publish.py --project "{project}"
```
- **OUTPUT:** Files copied to `docs/{project-slug}/`, images resolved, index.html updated

### Phase 3: Verify Publication
- **INPUT:** Published files in docs/
- **ACTION:** Confirm:
  - HTML files exist in `docs/{project-slug}/`
  - Images copied alongside HTML files
  - index.html updated with links to new sections
  - No broken relative paths
- **OUTPUT:** Publication confirmation with file count and section list

## Scripts

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `bookSHelf/scripts/workflows/publish.py` | Copy HTML + images to docs/, update index | `--project NAME [--sections X.Y] [--dry-run]` | Published files in docs/ |

## Error Handling

| Problem | Action |
|---------|--------|
| docs/ directory missing | Create it at bookSHelf root |
| No HTML files found | Run book-html-gen first |
| Image paths unresolvable | Check original image locations in project directory |
| Index generation fails | Check for malformed HTML filenames |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Skipping --dry-run | Always preview before publishing |
| Publishing unverified HTML | Run book-verify first |
| Forgetting to publish images | publish.py handles this, but verify images appear |
| Not committing after publish | Remind user to commit the docs/ changes |
