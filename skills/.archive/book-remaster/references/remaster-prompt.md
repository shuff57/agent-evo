# Remaster Chapter Reference

## Writing Guidelines
- Plain English for first-year undergrads, avoid passive voice, use "we" and "you"
- Context Pauses: REQUIRED every section — brief real-world relevance when complex terms introduced
- Insight Notes: REQUIRED every section — blockquotes for special insights and "aha!" moments

## Formatting
- Key terms: **Bold** on first appearance
- Inline math: `\( x^2 \)` — NEVER use `$...$` (MathJax v3 does not enable $ inline)
- Block math: `$$\nf(x) = mx + b\n$$`
- Currency: escape as `\$500`, `\$1,200`

## Numbering (CRITICAL)
All numbering is chapter-prefixed sequential across the ENTIRE chapter:
- Examples: `Example C.N` (e.g., Example 1.1, 1.2, 1.3...)
- Definitions: `Definition C.N: [Term]`
- Try It Now: `Try It Now C.N`
- Guided Practice: `Guided Practice C.N`

## Source Attribution (CRITICAL — ZERO TOLERANCE)
Every Example, Definition, Try It Now, Guided Practice, and Problem Set needs
`**Source:** [Book Name]` within the first 3 lines. No exceptions.

## Structure
- Section headers: `# X.Y [Title]` (do NOT change format — splitting script depends on this)
- Table of Contents at beginning
- Callout boxes for key rules (blockquote with bold label)
- Terminology blocks for related technical terms (blockquote with `**[Concept] Terminology**` title)
- Subsections for rule lists with 2+ items — but worked examples in subsections must come from source, not be invented

## Problem Sets
- Preserve existing, retain Source tag
- Do NOT generate solutions (separate pipeline step)

## Try It Now Exercises
- MANDATORY: one after every ## heading
- Use `<details><summary>Solution</summary>` for collapsible solutions
- Keep solutions concise (3-5 steps max)
- Source attribution required

## Expansion Guidelines
- 3x-8x expansion is EXPECTED and acceptable when driven by: Try It Nows, Context Pauses, Insight Notes, TOC, callout boxes, subsection structure
- NEVER invent: new definitions, new sections, new worked examples with no source analog
- Stub sections (title matches "Learning objectives", "Section summary", "Chapter highlights", etc.) auto-route to remaster-stub.md — they should NOT get full chapter prompt treatment
