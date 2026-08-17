---
description: Verify an SVG diagram or HTML scene for visual quality. Renders to PNG, checks for overlaps, clipping, readability, density.
argument-hint: "[file-path]"
arguments: [file]
---
<!-- Vendored from noelpuig/claude-explains (MIT, (c) 2024-present Noel Puig).
     Agent names carry an `explains-` prefix: the upstream pack ships a
     `planner`, and this machine already has a different `planner`. Renaming
     only one side would silently route to the wrong agent.
     Renderer is NOT used — bookSHelf renders via render(t) + Playwright.
     Full source: ~/.claude/vendor/claude-explains -->


## Visual Verification

Verify the visual quality of: $file

### Step 1: CLI Validation
```
node C:/Users/shuff/.claude/vendor/claude-explains/cli/bin/claude-explains.js $file --validate
```
Parse the JSON output. Report all issues.

### Step 2: Render Preview
```
node C:/Users/shuff/.claude/vendor/claude-explains/cli/bin/claude-explains.js $file --preview 0 -o /tmp/verify_preview
```
Read the rendered PNG.

### Step 3: Visual Inspection
- [ ] All labels readable (not overlapping, not clipped)
- [ ] Content fills 80%+ of viewport
- [ ] Clear visual hierarchy (3 size tiers)
- [ ] Connector lines properly attached
- [ ] Content centered or intentionally positioned
- [ ] Colors match theme (60-30-10 rule)

### Step 4: Report
```json
{"file": "$file", "pass": true, "issues": []}
```
