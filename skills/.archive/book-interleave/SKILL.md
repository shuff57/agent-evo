---
name: book-interleave
description: Use when deciding where supplemental textbook content should be inserted within primary textbook sections, especially after section matching and before merging.
disable-model-invocation: true
---

# Book Interleave

> Determine optimal insertion points for supplemental content blocks within primary textbook sections. Given primary blocks and supplemental blocks, produces insertion instructions that preserve primary ordering while intelligently placing supplemental material.

## Prerequisites
- Section matching completed (mapping_results.json from book-section-match)
- Both primary and supplemental content available as structured blocks

## When to Use
- After book-section-match has identified which supplemental sections fit
- Before book-merge to determine exact insertion points within sections
- When AI-assisted interleaving is needed for merge.py --ai-interleave mode

## When NOT to Use
- No supplemental book to interleave (single source, skip to book-remaster)
- Simple append is sufficient (no need for intelligent ordering)

## Guardrails

> ⚠️ **Must NOT:**
> - Reorder primary blocks - they stay in original order
> - Remove any primary content
> - Insert supplemental content that was marked as skip/redundant
> - Proceed without structured block format input

## Quick Start
1. Read the matched section pair (primary + supplemental blocks)
2. Analyze each supplemental block for insertion value
3. Produce insertion instructions JSON
4. Feed to book-merge for execution

## Workflow

### Phase 1: Load Blocks
- **INPUT:** Primary section blocks and matched supplemental blocks
- **ACTION:** Parse both into structured block format with index, type, and content
- **OUTPUT:** Indexed block arrays ready for analysis

### Phase 2: Evaluate Supplemental Blocks
- **INPUT:** Block arrays
- **ACTION:** For each supplemental block, determine:
  1. Does it add value (not redundant with primary)?
  2. Where should it be inserted (after which primary block)?
  3. Why is this the best placement?
- **OUTPUT:** Insertion decisions for each supplemental block

### Phase 3: Generate Instructions
- **INPUT:** Evaluation results
- **ACTION:** Produce structured JSON with insertions and skips
- **OUTPUT:** JSON object:
```json
{
  "insertions": [
    {"supp_index": 0, "insert_after": 1, "reason": "Definition complements primary definition"}
  ],
  "skip": [
    {"supp_index": 2, "reason": "Redundant with primary block 1"}
  ],
  "notes": "Summary of decisions"
}
```

## Error Handling

| Problem | Action |
|---------|--------|
| Blocks not in structured format | Parse markdown into blocks using heading/content splitting |
| All supplemental blocks redundant | Return empty insertions with skip reasons |
| Unclear placement | Default to inserting AFTER related primary content |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Reordering primary blocks | Primary order is sacred - only decide WHERE to insert supplemental |
| Inserting redundant content | Check for duplication before including |
| Missing insertion reasons | Always explain why a block goes where it does |
