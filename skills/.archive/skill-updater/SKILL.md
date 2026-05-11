---
name: skill-updater
description: Use when auditing and upgrading existing skills — scans for missing frontmatter, inline code that should be scripts, token waste, and missing limits, then applies fixes with approval.
disable-model-invocation: true
---

# Skill Updater

> Audits existing skills against the official SKILL.md format and `skill-author` methodology rules. Produces a tiered gap report, then upgrades one skill at a time after user approval.

## When to Use
- "Update my skills", "audit skills", "upgrade skills to new format"
- After updating skill-author methodology and wanting to bring existing skills in line
- When a skill is inefficient (too much inline code, no scripts, no limits)
- Periodic skill hygiene check

## When NOT to Use
- Creating a brand new skill — use `skill-author`
- Skill is already compliant
- User wants to delete or archive skills

## Guardrails

> ⚠️ **Must NOT:**
> - Apply changes without showing the audit report and getting explicit user approval
> - Delete or rename skills without confirmation
> - Break working skills — preserve all functionality during restructure
> - Auto-upgrade all skills in batch — one at a time with approval

## Limits
- Max skills per audit run: 10 (present results, get approval, then continue)
- Audit report per skill: under 50 lines

## Workflow

### Phase 1: Discover
- **INPUT:** Skills directory path (default: `~/.claude/skills/`)
- **ACTION:** Scan all skill directories, extract metadata (name, line count, has scripts/, has references/, frontmatter fields present)
- **OUTPUT:** List of skills with paths and basic structure info

### Phase 2: Audit

For each skill, check against the official SKILL.md format (Claude Code knows this natively) plus these methodology rules from `skill-author`:

| Check | What to look for |
|-------|-----------------|
| **Description format** | Starts with "Use when...", under 250 chars |
| **Invocation control** | Has `disable-model-invocation` or `user-invocable` if appropriate |
| **Section order** | Guardrails before Workflow |
| **Phase structure** | Each phase has INPUT → ACTION → OUTPUT |
| **Code-first compliance** | Data-heavy ops in `scripts/`, not inline markdown |
| **Script output** | Scripts return structured JSON/markdown, not raw HTML |
| **Token limits** | Has max-pages/items/tokens for data-fetching skills |
| **State management** | Has incremental-run pattern if skill is repeatable |
| **Path portability** | Uses `${CLAUDE_SKILL_DIR}`, no hardcoded absolute paths |
| **Argument handling** | Has `argument-hint` if skill accepts `$ARGUMENTS` |
| **Dynamic injection** | Uses `` !`command` `` where appropriate instead of post-load commands |
| **Size** | SKILL.md under 500 lines; overflow in `references/` |
| **Error/Mistakes** | Present as tables |

- **OUTPUT:** Raw audit results per skill

### Phase 3: Prioritize and Present

Group findings into tiers:

| Tier | Criteria | Examples |
|------|----------|---------|
| **Critical** | Broken functionality or major token waste | Hardcoded paths, raw HTML output, no limits on scraping |
| **Important** | Missing standard features | No frontmatter, no invocation control, inline code → scripts |
| **Polish** | Cosmetic or minor | Description too long, section order, missing IO labels |

Present as a table per skill: tier, check, current state, recommended fix.

- **OUTPUT:** User-reviewed prioritized report

### Phase 4: Upgrade (per skill, with approval)

- **INPUT:** Approved findings for one skill
- **ACTION:** Apply fixes in this order:
  1. Directory restructure — create `scripts/` and `references/` if needed
  2. Extract scripts — move inline code to `scripts/`; replace with `${CLAUDE_SKILL_DIR}/scripts/` references
  3. Fix frontmatter — add missing fields, fix description format
  4. Add limits — insert Limits section for data-fetching skills
  5. Add state management — insert incremental-run pattern for repeatable skills
  6. Fix paths — replace hardcoded paths with portable references
  7. Fix section order — Guardrails before Workflow
  8. Add IO labels — INPUT/ACTION/OUTPUT to workflow phases
  9. Split oversized SKILL.md — move overflow to `references/`
- **OUTPUT:** Updated skill directory

### Phase 5: Verify
- **INPUT:** Updated skill
- **ACTION:** Run the same checks from Phase 2 against the updated skill. Diff the changes and present to user.
- **OUTPUT:** Verified upgrade with diff summary

## Error Handling

| Problem | Action |
|---------|--------|
| No SKILL.md in directory | Skip; report as "not a valid skill directory" |
| Script extraction would break functionality | Flag as manual-review instead of auto-extracting |
| Broken file references | Report in audit |
| Skill is a symlink | Follow to source; audit/modify the source |
| User declines all upgrades | Skip and move to next skill |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Batch-upgrading without review | One skill at a time with explicit approval |
| Extracting documentation code blocks | Only extract code that's meant to be run, not examples |
| Breaking references during restructure | Update all internal links after moving files |
| Adding irrelevant frontmatter fields | Only add fields relevant to the skill's invocation model |
| Treating all skills as code-first | Markdown-only skills (style guides, conventions) don't need scripts |
