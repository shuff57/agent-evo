# Block Interleaving Reference Prompt

This is the AI prompt template used when deciding supplemental content placement.

## Input Format

```json
{
  "section_title": "Section Name",
  "primary_blocks": [
    {"index": 0, "type": "text", "content": "..."},
    {"index": 1, "type": "definition", "content": "..."}
  ],
  "supplemental_blocks": [
    {"index": 0, "type": "definition", "content": "..."}
  ]
}
```

## Output Format

```json
{
  "insertions": [
    {"supp_index": 0, "insert_after": 1, "reason": "Complements primary definition"}
  ],
  "skip": [
    {"supp_index": 2, "reason": "Redundant with primary block 1"}
  ],
  "notes": "Summary"
}
```

## Guidelines
1. Keep valuable content that adds examples, alternative explanations, or complementary definitions
2. Skip redundant content that duplicates primary without adding value
3. Place definitions near related primary definitions, examples after related explanations
4. Every supplemental block must appear in either insertions or skip
