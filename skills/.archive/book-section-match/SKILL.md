---
name: book-section-match
description: Use when matching sections between primary and supplementary textbooks to determine pedagogical fit, especially before merging content from multiple sources.
disable-model-invocation: true
---

# Book Section Match

> Match sections between a primary textbook and supplementary textbooks.
> **For sibling-edition books (same series, shared source material): skip AI matching entirely.**
> Use the three-script Python pipeline: fingerprint_dedup.py → placement_map.py → merge_from_placement.py.
> See book-merge skill for the full pipeline. AI matching (mapping.py) is only appropriate for
> books with no shared source material, and even then use --threshold 0.75 to suppress near-dupes.

## Prerequisites
- bookSHelf project at `/mnt/c/Users/shuff57/Documents/GitHub/bookSHelf` (WSL2 path)
- Both primary and supplemental textbooks extracted as JSON (via book-scrape)
- Chapter-scoped JSON files (see below)
- AI provider only needed if fingerprint dedup leaves ambiguous placements

## Key Insight: Use Python First, AI Second

When primary and supplemental books share source material (same series, sibling editions like AHSS + OpenIntro Stats), **the majority of supplemental sections are word-for-word or near-word-for-word duplicates**. Empirical finding on AHSS+OS ch1: 24 of 44 OS sections were 85-100% duplicate by content fingerprint. AI cannot reliably filter these — GLM correctly labels them "same" in reasons but still scores them 0.65-0.72 and keeps them above threshold.

The right architecture:
1. **fingerprint_dedup.py** — pure Python, runs in <1s, classifies every supplemental section as duplicate/unique/structural
2. **placement_map.py** — pure Python, maps unique sections to their AHSS insertion point by section number adjacency
3. **merge.py** — already deterministic, just needs clean placement input

AI is only called for step 2 when placement is genuinely ambiguous (no clear numeric neighbor).

## When to Use
- Preparing to merge content from multiple textbook sources
- Need to determine where supplemental content fits in a primary textbook
- Building a mapping file before running book-merge

## Note on AI Section Digests (Superseded)

A digest.py pre-processor was considered to generate semantic summaries before AI matching.
This approach is superseded by fingerprint_dedup.py — Python-based fingerprinting is faster,
cheaper, and more reliable for sibling-edition books. Digest generation may still be useful
if the two books are unrelated (no shared source material) and AI matching is unavoidable.


- Only one source textbook (no matching needed, skip to book-remaster)
- Mapping already exists and doesn't need updating

## Guardrails

> ⚠️ **Must NOT:**
> - Run without both primary and supplemental JSON files
> - Use topic similarity alone - evaluate pedagogical fit per the prompt
> - Skip confidence threshold filtering
> - Put specific book titles or series names in the section-matching prompt — keep it fully generic. The script injects actual titles from JSON metadata. Book-specific language breaks reusability across projects.

## Quick Start (Recommended: Fingerprint-First Pipeline)
1. Write chapter-scoped JSON copies (see below)
2. Run `fingerprint_dedup.py` — no AI, <1s, outputs `dedup_ch1_v1.json`
3. Review unique sections list — manually or via `placement_map.py`
4. Build `placement_map.json` (same schema as `mapping.json` used by merge.py)
5. Run `merge.py --mapping placement_map.json` — deterministic, no AI needed
6. Only use `mapping.py` (AI) if fingerprint dedup leaves genuinely ambiguous placements

## Step 1: Run fingerprint_dedup.py
```bash
cd /mnt/c/Users/shuff57/Documents/GitHub/bookSHelf
python3 scripts/workflows/fingerprint_dedup.py \
  --primary      "projects/{proj}/remastered/Merged/{main}_ch1.json" \
  --supplemental "projects/{proj}/remastered/Merged/{supp}_ch1.json" \
  --output       "projects/{proj}/remastered/Merged/dedup_ch1_v1.json" \
  --threshold    0.85
```

Output `dedup_ch1_v1.json` schema:
```json
{
  "duplicates": [{"supp_id": "1.6", "supp_title": "...", "matched_primary_id": "1.6", "overlap": 1.0}],
  "unique":     [{"supp_id": "1.17", "supp_title": "...", "closest_primary_id": "1.28", "overlap": 0.32, "supp_text_preview": "..."}],
  "structural": [{"supp_id": null, "supp_title": "Exercises", "reason": "structural_title"}]
}
```

Threshold guidance:
- 0.85 default: safe for sibling-edition books (AHSS+OS) — empirically catches all true duplicates
- 0.70: use for more loosely related books where you want to be more conservative
- After running, review `unique` list — some may still be structural noise (chapter intros, callout boxes with no section number)

### Write chapter-scoped JSON (required step)
```python
import json
for fname, outname in [
    ("projects/{proj}/remastered/{main}_full_source.json",   "projects/{proj}/remastered/Merged/{main}_ch1.json"),
    ("projects/{proj}/remastered/{supp}_full_source.json",   "projects/{proj}/remastered/Merged/{supp}_ch1.json"),
]:
    with open(fname) as f:
        book = json.load(f)
    ch = next(c for c in book["chapters"] if str(c.get("number")) == "1")
    with open(outname, "w") as f:
        json.dump({"title": book["title"], "chapters": [ch]}, f, indent=2)
    print(outname, len(ch["sections"]), "sections")
```
Note: chapter `number` field is a string (`"1"`), not int — use `str(c.get("number")) == "1"`.

## Workflow

### Phase 1: Validate Inputs
- **INPUT:** Primary JSON path, supplemental JSON path
- **ACTION:** Verify both files exist and contain section data
- **OUTPUT:** Confirmed paths and section counts

### Phase 2: Run Section Matching
- **INPUT:** Chapter-scoped JSON files (NOT full-book), confidence threshold
- **ACTION:** Run mapping script. Use `--threshold 0.5` for unrelated books, `--threshold 0.75` for books sharing source material (same series, sibling editions).
- **PROMPT OVERRIDE:** `mapping.py` has no `--prompt` flag. To use a custom prompt, use `PROMPTS_DIR` env var pointing to a directory containing `section-matching.md`:
```bash
mkdir -p /tmp/my_prompts && cp prompts/section-matching_v2.md /tmp/my_prompts/section-matching.md
PROMPTS_DIR=/tmp/my_prompts python3 scripts/workflows/mapping.py ...
```
- The prompt file must always be named `section-matching.md` regardless of version — use a temp dir copy.
```bash
cd /mnt/c/Users/shuff57/Documents/GitHub/bookSHelf
python3 scripts/workflows/mapping.py \
  --input "projects/{proj}/remastered/Merged/{main}_ch1.json" \
  --supplemental "projects/{proj}/remastered/Merged/{supp}_ch1.json" \
  --output "projects/{proj}/remastered/Merged/mapping_ch1_v1.json" \
  --provider ollama --model glm-5.1:cloud \
  --threshold 0.75
```
Note: `--chapter` flag does NOT exist — scope via input files.
- **Timeout:** The AI call takes ~60s at default prompt length. A longer/revised prompt may need `timeout 480` — the default `timeout 300` can expire mid-response with no output written.
- **OUTPUT:** mapping_ch1_v1.json + mapping_ch1_v1_report.md

### Phase 3: Review Results
- **INPUT:** mapping_ch1_v1.json + report
- **ACTION:** Read the raw JSON (not just the report — reason column is truncated there). Check:
  - Are there 0 unmatched? Suspicious if books are closely related (same-series books will over-match)
  - Are most matches `alternative` at 70-72%? That means near-duplicates, not genuine supplemental value
  - Is a TOC/intro block (number=None or number="1") matched to a real section? That's noise
- **Red flags requiring prompt tuning:**
  - Closely related books (AHSS + OpenIntro, two editions of same text) produce heavy `alternative` matches — same datasets, same examples, just reworded. These add clutter not value.
  - The section-matching prompt needs to mark same-dataset/same-example content as NO_MATCH unless it adds a genuinely different pedagogical angle
  - Even with a tightened prompt, GLM may still **score duplicates above the threshold** (0.65-0.72) while correctly labelling them "Duplicate" in the reason field. Two fixes work together:
    1. Raise `--threshold` to 0.75 to filter them out post-hoc
    2. Add explicit scoring guidance to the prompt: duplicate = score below 0.4
- **OUTPUT:** User-reviewed mapping ready for book-merge

## Prompt Optimization Loop

The section-matching prompt lives at `prompts/section-matching.md`. When results are poor, iterate on the prompt without touching the original:

1. Copy to `prompts/section-matching_v2.md` (never overwrite the original)
2. Make targeted edits — see known issues below
3. Create a temp dir copy named `section-matching.md` and point `PROMPTS_DIR` at it
4. Run mapping with `--output mapping_ch1_v2.json` — compare report to v1
5. Repeat until results are approved; only then promote v2 to replace the original

### Known prompt weaknesses (and fixes)

**Problem: `alternative` is a catch-all for rewording**
The model uses `alternative` for any same-topic section, even identical rewrites.
Fix: Redefine `alternative` as requiring a meaningfully different METHOD (visual vs algebraic, simulation vs formula). Add: "NEVER use for restatement of the same example with the same method."

**Problem: 0 NO_MATCH with overlapping books**
Books from the same series share datasets and examples. The model matches everything.
Fix: Add a Duplicate Detection section: "If the supplemental uses the same named example AND the same method → NO_MATCH. Different wording alone is not a supplement."

**Problem: Bare chapter intro (section ID with no decimal) matched to real content**
The preamble/TOC block gets matched as `alternative` at low confidence.
Fix: Add edge case rule: "If section ID has no decimal (e.g. '1' not '1.1') and contains only a chapter overview → NO_MATCH."

**Problem: Model correctly identifies duplicates in reasons but scores them 0.65-0.72**
Even with a tightened prompt, GLM will say "Duplicate exercise on X" but give 0.68 confidence.
Fix: Add explicit guidance: "Duplicates score 0.00-0.19. A 100% match rate is a red flag."
Also raise `--threshold 0.75` to filter them regardless.

**Problem: Section title match = structural duplicate the prompt can't catch**
When primary and supplemental sections have the SAME title (e.g., both "GUIDED PRACTICE 1.6"),
the content is identical or near-identical by construction. The model will categorize it as `practice`
at 75-88% because the follow-up question differs slightly — but it IS a duplicate.
Three-pronged fix:
1. Prompt rule: "If section titles are identical → NO_MATCH (structural duplicate)."
2. Post-process guard in mapping.py: after AI runs, drop any match where supplemental title == primary title.
3. (Best) Use AI-generated section digests — the digest AI flags "same scenario as [section ID]"
   in the summary, so the matcher sees the duplication explicitly and can NO_MATCH confidently.
Option 2 (post-process filter) is cheapest deterministic guard. Option 3 (digest) is the root fix.
Combined approach is safest. Expect ~8 of 13 matches to drop when books are sibling editions of the same series.

NOTE: Base-label normalization (stripping trailing section numbers from titles like "GUIDED PRACTICE 1.10")
only catches 2/13 duplicates — the section numbers differ so titles don't match exactly.
Raw title dedup is insufficient; semantic digest is needed for the rest.

**Problem: Chapter-scoped supplemental misses cross-chapter content**
When BOTH inputs are pre-scoped to chapter N, the mapping never sees OS chapter 2+ sections
that might pedagogically belong in AHSS chapter 1. This is a known scope limitation.
Options (in order of cost):
1. Accept it — note in report as "ch1 OS only" and move on (recommended for first pass)
2. Pass full supplemental JSON but scope primary to ch1 only — increases token load significantly
3. Run multiple passes: ch1 primary vs full-supp, filter AI output to ch1 placements only
For AHSS+OS specifically: OS ch1 has 44 sections (ample coverage). Cross-chapter gaps are edge cases.

**Problem: Prompt is book-specific (hardcoded book names)**
Breaks reusability for other book pairs.
Fix: Keep prompt fully generic. Never mention specific book titles. Use "primary book" and "supplemental book" only. The script injects actual titles from the JSON metadata.

**Problem: Revised prompt is too long — GLM times out on combined prompt+data**
Adding detailed rules grows the prompt enough that the combined prompt+34+18 section summaries exceeds GLM's effective token/time budget. The AI call times out with no output written (exit code 124), even with `timeout 480`.
Two options:
1. **Trim the prompt** — cut the example input/output section (~60 lines) since the rules are self-explanatory. Recovers ~25% of token budget.
2. **Switch the mapping model** — if a smarter/faster model is available (claude-sonnet, gpt-4o via ollama or API), use it for the mapping step. It handles longer prompts reliably and reasons better about duplicate detection.
Do not add more rules to the prompt without also trimming elsewhere — the prompt must stay within GLM's effective budget.

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `bookSHelf/scripts/workflows/mapping.py` | AI section matching | `--input PRI --supplemental SUPP --output OUT` | JSON mapping results |

## Error Handling

| Problem | Action |
|---------|--------|
| Missing JSON input files | Run book-scrape first to generate them |
| AI provider not configured | Check env vars or pass --provider --model explicitly |
| All sections NO_MATCH | Lower threshold or review if supplemental book is appropriate |
| Script import error | Ensure section_matching.py module exists in workflows/ |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Running on full-book JSON | Always write chapter-scoped JSON copies first — full-book (400+ sections) times out |
| `--chapter` flag | Does not exist in mapping.py — scope via input files |
| Matching by topic similarity alone | Use pedagogical fit categories: prerequisite, extension, application, alternative, practice, bridge |
| Using too low threshold with overlapping books | For books sharing source material (same series, sibling books), use --threshold 0.75 — keeps only genuinely strong matches and filters the 0.65-0.72 "Duplicate" noise |
| Skipping review | Always inspect raw JSON — the markdown report truncates reason column |
| Trusting 0 unmatched | With closely related books (same series, different editions) many OS sections use the same datasets as AHSS — `alternative` at 70% is often a near-duplicate, not supplement |
| Chapter number type | JSON chapter `number` is a string `"1"`, not int — use `str(c.get("number")) == "1"` |
