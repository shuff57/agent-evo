# Section Matching Reference

This file documents the matching categories and confidence scoring used by the section matching AI.

## Match Categories

| Category | Description | Typical Placement |
|----------|-------------|-------------------|
| **Prerequisite** | Foundational concepts needed before main content | Chapter start or before dependent sections |
| **Extension** | Deeper exploration of an introduced concept | After the section it extends |
| **Application** | Real-world uses, word problems, practical examples | After theory/definitions |
| **Alternative Explanation** | Different approach to the same concept | Near primary explanation |
| **Practice** | Additional worked examples or exercises | After examples of the same type |
| **Bridge** | Connects chapter content to other topics | End of related section |

## Confidence Scoring

| Score | Meaning |
|-------|---------|
| 0.90-1.00 | Essential fit - crucial for understanding |
| 0.75-0.89 | Strong fit - significantly enhances learning |
| 0.60-0.74 | Good fit - useful supplementary material |
| 0.40-0.59 | Moderate fit - relevant but not central |
| 0.20-0.39 | Weak fit - tangentially related |
| 0.00-0.19 | No fit - doesn't support chapter goals |