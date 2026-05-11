---
name: skill-author
description: Use when creating or rewriting an agent skill — interviews the user, decides code-first vs markdown-only, drafts with token-efficiency patterns, and validates before saving.
---

# Skill Author

> Methodology layer on top of Claude Code's official skill format. Interviews the user, makes the code-first decision, enforces token efficiency, and validates before saving. Claude Code already knows the SKILL.md format, frontmatter fields, and directory conventions — this skill defines **how to get there well**.

## Core Principle

**SKILL.md orchestrates, scripts execute.** Never put data-heavy logic in markdown.

## When to Use
- User asks to create a new skill
- User asks to rewrite/normalize an existing skill
- A plan task requires generating a SKILL.md

## When NOT to Use
- User wants to execute a skill, not author one
- User wants to audit/upgrade existing skills — use `skill-updater`

## Guardrails

> ⚠️ **Must NOT:**
> - Save a skill without explicit user confirmation of the final draft
> - Put data-heavy logic in SKILL.md that belongs in a script
> - Skip the code-first decision in Phase 2
> - Hardcode absolute paths — use `${CLAUDE_SKILL_DIR}` and `${CLAUDE_SESSION_ID}`

## Workflow

### Phase 1: Interview

Collect these inputs before drafting. Ask only for missing required fields.

| # | Field | Required | Example |
|---|-------|----------|---------|
| 1 | **Skill name** | Yes | `news-scraper` (kebab-case) |
| 2 | **Purpose** | Yes | "Scrape HN front page and return structured articles" |
| 3 | **Trigger phrases** | Yes | "get news", "scrape hacker news", "check HN" |
| 4 | **Tools/APIs used** | Yes | Playwriter, WebFetch, Bash |
| 5 | **Invocation model** | Yes | User-only, Claude-only, or both |
| 6 | **Execution context** | No | Inline (default) or fork to subagent |
| 7 | **Repeatable?** | No | Will this run repeatedly on the same data? |
| 8 | **Arguments?** | No | Positional args? e.g. `[issue-number]`, `[filename] [format]` |

- **OUTPUT:** Complete skill specification

### Phase 2: Code-First Decision

Evaluate whether the skill needs scripts:

| Signal | → Scripts needed |
|--------|-----------------|
| Extracts data from web pages or APIs | Yes |
| Transforms or filters data before model sees it | Yes |
| Runs repeatedly on same/similar data | Yes |
| Involves >1 page of content returning to context | Yes |
| Needs pre-computed selectors, schemas, or configs | Yes |
| Pure knowledge/guidelines (style guide, conventions) | No — markdown only |
| Simple orchestration with existing tools | No — markdown only |

- **OUTPUT:** `code-first` or `markdown-only`, plus list of scripts to create

### Phase 3: Draft

Using the official SKILL.md format (Claude Code knows this natively), draft the skill applying these methodology rules:

**Structure rules:**
1. Description starts with **"Use when..."**, under 250 chars, includes trigger phrases
2. **Guardrails** section appears **before Workflow** for fail-fast visibility
3. Each workflow phase uses **INPUT → ACTION → OUTPUT**
4. **Error Handling** and **Common Mistakes** are always tables
5. Cross-skill references use skill names, not file paths

**Code-first rules (when applicable):**
6. Scripts return **structured output** (JSON or filtered markdown) — never raw HTML
7. Scripts define **strict output schemas** so the model doesn't waste tokens parsing
8. Set **limits and stop conditions** to prevent context flooding (max pages, max items, max tokens)

**Token efficiency rules:**
9. Pre-compute known values (selectors, URLs, schemas) in scripts — don't make the model discover them each run
10. Design for **incremental runs** when the skill operates on data that changes over time
11. Batch parallel operations in scripts rather than sequential model round-trips
12. Use `` !`command` `` dynamic injection for small, stable context instead of making the model run the command after loading

**Argument rules (when applicable):**
13. Use `$ARGUMENTS` / `$0` / `$1` for positional args; add `argument-hint` frontmatter
14. Use `${CLAUDE_SESSION_ID}` for session-scoped state/log files

- **OUTPUT:** Full skill directory draft (SKILL.md + scripts/ + references/)

### Phase 4: Validate

Before presenting to user, confirm:

- [ ] Frontmatter complete (name, description, invocation control if needed)
- [ ] Description under 250 chars, starts with "Use when..."
- [ ] SKILL.md under 500 lines; overflow moved to `references/`
- [ ] Guardrails before Workflow
- [ ] All phases have INPUT → ACTION → OUTPUT
- [ ] No hardcoded absolute paths
- [ ] Scripts return structured output (if code-first)
- [ ] Limits/stop conditions present (if skill fetches external data)
- [ ] State management section present (if repeatable)
- [ ] `argument-hint` set (if skill accepts args)

- **OUTPUT:** Confirmed final draft — present to user for approval before saving

### Phase 5: Handoff to Testing (optional)

After the user approves and the skill is saved, offer:

> "Skill saved. Want to test and iterate on it? I can run Anthropic's `/skill-creator` eval framework against `{skill-path}` to benchmark it with blind A/B comparison."

If the user accepts, invoke `skill-creator` (the plugin) pointing at the newly saved skill path.

## Hub-Spoke Script Sharing Pattern

When creating a family of sibling skills that share logic (pre-session gather, post-session sync, common validation, etc.), use the **hub-spoke** pattern:

1. **Hub skill** — the earliest/most-general skill in the family owns the `scripts/` and `references/` directories. Siblings reference these, never duplicate them.
2. **Shared scripts** go in `hub-skill/scripts/` (e.g., `gather.py`, `sync.py`). Each has a companion doc in `hub-skill/references/`.
3. **Spoke skills** reference shared scripts via a `### Pre / Post-Session Hooks` subsection under `## Companion Skills`:
   ```
   - **Pre-session** (`hub-skill/scripts/gather.py`): Run in Phase 2 to...
   - **Post-session** (`hub-skill/scripts/sync.py`): Run in the final phase to...
   ```
4. **Hub skill** gets the same section noting it owns the scripts and listing which siblings consume them.

**Why not scripts in each skill?** DRY — a bug fix in one place, single maintenance point. Scripts are code; duplicated code rots.

**Batch creation:** When creating 3+ sibling skills from a shared template, write a single detailed task prompt to `/tmp/`, spawn `claude -p` (print mode) with `--allowedTools 'Read,Write,Bash'`, and have it read the prompt + a reference SKILL.md for format. Then patch each sibling with the shared hooks section afterward.

## Error Handling

| Problem | Action |
|---------|--------|
| Missing trigger phrases | Request them; rewrite description to start with "Use when..." |
| Name not kebab-case | Convert and confirm |
| Document too large | Move non-core detail to `references/` |
| Script returns raw HTML | Refactor to filter and structure output |
| No limits on data-fetching skill | Add max-pages/max-items/max-tokens guardrail |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Duplicating official format spec in SKILL.md | Claude Code knows the format — focus on domain content |
| Putting all logic in SKILL.md markdown | Move data-heavy logic into `scripts/`; SKILL.md orchestrates |
| Having model discover page structure each run | Pre-compute selectors in a script or reference file |
| No stop condition on paginated scraping | Add `max_pages` or `max_items` limit |
| Skipping the interview | Always gather spec before drafting — prevents rework |
