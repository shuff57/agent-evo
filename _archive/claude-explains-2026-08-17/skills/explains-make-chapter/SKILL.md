---
description: Create all scenes for one chapter of a video. Reads chapter plan, creates scene HTML files, validates each.
argument-hint: [chapter-plan-path]
arguments: [chapter_plan]
---
<!-- Vendored from noelpuig/claude-explains (MIT, (c) 2024-present Noel Puig).
     Agent names carry an `explains-` prefix: the upstream pack ships a
     `planner`, and this machine already has a different `planner`. Renaming
     only one side would silently route to the wrong agent.
     Renderer is NOT used — bookSHelf renders via render(t) + Playwright.
     Full source: ~/.claude/vendor/claude-explains -->


## Chapter Creation

### Setup
1. Read the chapter plan at $chapter_plan
2. Read pipeline/briefings/explains-scene-author.md for scene creation rules
3. Read pipeline/briefings/quality-floor.md for minimum requirements
4. Read relevant files in `references/` for this chapter's factual content

### For Each Scene
1. Read the scene plan
2. Write the scene HTML
3. Run: `node C:/Users/shuff/.claude/vendor/claude-explains/cli/bin/claude-explains.js <scene> --validate`
4. Fix and re-validate if needed (max 3 tries)
5. Run --preview at mid-timestamp to visually verify

### Quality Checks Per Scene
- ≥3 data-appear events
- ≥2 data-fade-out events  
- ≥1 viewport transform (canvas scenes)
- No placeholder text

### Report
```json
{"chapter": "...", "scenes": N, "pass": N, "fail": N}
```
