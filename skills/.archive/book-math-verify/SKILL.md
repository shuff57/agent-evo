---
name: book-math-verify
description: Use when verifying mathematical correctness in textbook content, especially after remastering or merging when formulas, calculations, and examples need accuracy review.
disable-model-invocation: true
---

# Book Math Verify

> Review textbook content for mathematical correctness, consistency, and clarity. Produces a structured accuracy report categorizing issues by severity (Critical/High/Medium/Low) with specific quotes, locations, and recommended fixes.

## Prerequisites
- Remastered or merged markdown content to verify
- Content contains mathematical formulas, definitions, worked examples, or proofs

## When to Use
- After book-remaster has enhanced a section
- After book-merge has combined content from multiple sources
- Before book-html-gen to ensure content is mathematically sound
- User requests a math accuracy review

## When NOT to Use
- Content has no mathematical elements
- Quick formatting check only (use book-verify instead)

## Guardrails

> ⚠️ **Must NOT:**
> - Skip checking worked examples - these are where most errors occur
> - Auto-fix errors without reporting them first
> - Mark PASS without checking every formula and calculation
> - Modify the source file (report only, fixes are separate)

## Quick Start
1. Read the markdown file to verify
2. Systematically check all formulas, definitions, examples, and proofs
3. Produce the structured accuracy report
4. If issues found, fix and re-verify

## Workflow

### Phase 1: Load Content
- **INPUT:** Path to markdown file (remastered section or merged chapter)
- **ACTION:** Read the file and identify all mathematical elements:
  - Formulas/equations (inline $...$ and block $$...$$)
  - Definitions with mathematical content
  - Worked examples with solutions
  - Problem sets with answers
- **OUTPUT:** Count of elements to verify

### Phase 2: Verify Mathematics
- **INPUT:** Identified mathematical elements
- **ACTION:** For each element, verify:
  - Arithmetic correctness (calculations)
  - Formula validity (correct form)
  - Logical consistency (steps follow)
  - LaTeX rendering (balanced delimiters)
  - Notation consistency (same variable usage)
- **OUTPUT:** List of issues found with severity, location, quote, and fix

### Phase 3: Generate Report
- **INPUT:** Verification results
- **ACTION:** Produce structured report in this format:
```markdown
# Mathematical Accuracy Report

## Executive Summary
[2-3 sentences + overall assessment]

**Overall Assessment:** [PASS | PASS WITH CORRECTIONS | NEEDS REVISION | CRITICAL ISSUES]

**Issues Found:**
- Critical: [count]
- High: [count]
- Medium: [count]
- Low: [count]

## [Issues by severity - Critical, High, Medium, Low]
### Issue [C/H/M/L][N]: [Title]
**Location:** [Section/Example/Paragraph]
**Severity:** [level]
**Problem:** > [exact quote]
**Analysis:** [why it's wrong]
**Recommended Fix:** [specific correction]

## Verification Summary
| Category | Checked | Issues |
|----------|---------|--------|
| Formulas | N | N |
| Definitions | N | N |
| Examples | N | N |
```
- **OUTPUT:** Complete accuracy report

## Error Handling

| Problem | Action |
|---------|--------|
| LaTeX doesn't parse | Report as notation issue with raw LaTeX string |
| Uncertain about correctness | Include with "Confidence: Medium - verify with source" |
| Content truncated | Note in summary, analyze available content only |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Skipping simple arithmetic | Check every calculation, even obvious ones |
| Not quoting exact text | Always include the exact problematic quote |
| Missing LaTeX delimiter issues | Check every $...$ and $$...$$ for balance |
| Reporting style as math errors | Separate notation style from mathematical correctness |
