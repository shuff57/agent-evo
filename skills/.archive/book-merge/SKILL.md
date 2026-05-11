---
name: book-merge
description: Use when merging content from multiple textbook sources into a single chapter, especially after section matching has produced a mapping file and before remastering.
disable-model-invocation: true
---

# Book Merge

> Deterministic Python pipeline for merging supplemental textbook sections into a primary book JSON. No AI needed for matching or insertion — the three-script pipeline handles everything in under 2 seconds.

## Core Insight (Learned the Hard Way)

**Do NOT use mapping.py (AI-based) for sibling-edition books.**
When primary and supplemental are from the same lineage (e.g. AHSS + OpenIntro Stats),
60-70% of sections are word-for-word duplicates. AI matching:
- Over-matches (18/18 at threshold 0.5 when real unique count is ~6)
- Scores duplicates at 0.65-0.72 with contradictory "same X but different" reasons
- Times out at threshold 0.5 with GLM on a 7,895-char prompt
- Cannot distinguish "same scenario, added question" from "genuinely new content"

Python fingerprint dedup catches all of this in milliseconds.

## Critical: AHSS Section Numbers Are NOT Unique

In the AHSS JSON, many sections share the same `number` field:
- `number: "1.1"` → 4 sections (chapter heading, 1.1.1 subsection, callout, GP)
- `number: "1.3"` → 6 sections
- `number: "1.4"` → 5 sections
- `number: None`  → 26 sections (learning objectives, summaries, callout boxes, exercises)

**Always use exact section titles for insertion targets, never section numbers.**
Placement format: `after_title:Exact Section Title` — not `after_1.3`.

## Three-Script Pipeline

```
fingerprint_dedup.py   -->   placement_map.py   -->   merge_from_placement.py
(classify sections)         (set insertion pts)       (do the actual merge)
```

All three scripts live at `scripts/workflows/` in the bookSHelf project.

### Script 1: fingerprint_dedup.py

Classifies every supplemental section as duplicate / unique / structural using
normalized word-overlap fingerprinting (first 200 chars of text content).

```bash
cd '/mnt/c/Users/shuff57/Documents/GitHub/bookSHelf' && \
python3 scripts/workflows/fingerprint_dedup.py \
  --primary      "projects/Introduction to Stats/remastered/Merged/ahss_ch1.json" \
  --supplemental "projects/Introduction to Stats/remastered/Merged/os_ch1.json" \
  --output       "projects/Introduction to Stats/remastered/Merged/dedup_ch1_v1.json"
```

Output categories:
- `duplicates`  (overlap >= 0.85): skip — same content
- `unique`      (overlap <  0.85): merge candidates — review these
- `structural`  (no text / titled "Exercises" etc.): skip — headers/exercise sets

Default threshold is 0.85. For sibling editions, 24/44 OS sections were exact dupes (100%),
8 more were 86-94% overlap. Only 15 were unique, and of those 6 were section-level intros
that the primary book already covers.

### Script 2: placement_map.py

Contains hand-curated `PLACEMENT_RULES` list. Each rule matches a supplemental section
by `(supp_id, title_fragment)` and assigns:
- `tier`: `include` | `borderline` | `skip`
- `placement`: `after_title:Exact AHSS Title` or `before_title:Exact AHSS Title`
- `category`: prerequisite / extension / alternative / practice / bridge / application

Three tiers allow toggling borderline sections without touching include/skip rules:

```bash
# With borderline (test run — both variants):
python3 scripts/workflows/placement_map.py \
  --dedup  ".../dedup_ch1_v1.json" \
  --output ".../placement_ch1_v2.json"

# Without borderline (clean run):
python3 scripts/workflows/placement_map.py \
  --dedup  ".../dedup_ch1_v1.json" \
  --output ".../placement_ch1_v2_no_borderline.json" \
  --no-borderline
```

When adding rules, get the exact AHSS section title from the JSON first:
```python
python3 -c "
import json
with open('projects/Introduction to Stats/remastered/Merged/ahss_ch1.json') as f:
    d = json.load(f)
for ch in d['chapters']:
    for s in ch.get('sections', []):
        print(repr(s.get('number')), repr(s.get('title','')))
"
```

### Script 3: merge_from_placement.py

Deterministic insertion using title-based lookup (not number-based — numbers are ambiguous).

```bash
python3 scripts/workflows/merge_from_placement.py \
  --primary      ".../ahss_ch1.json" \
  --supplemental ".../os_ch1.json" \
  --placement    ".../placement_ch1_v2.json" \
  --output       ".../merged_ch1_v2" \
  --chapter 1
```

Output: `merged_ch1_v2.json` + `merged_ch1_v2_report.md`

Each inserted section is tagged with all 6 fields (used by downstream remaster / HTML gen):
- `source_book`:    full supplemental book title (e.g. "OpenIntro Statistics Fourth Edition")
- `source_label`:   first 3 words of supp title — short display name for attribution badges
- `merge_tier`:     "include" or "borderline"
- `merge_category`: practice / extension / alternative / prerequisite / application / bridge
- `merge_reason`:   the placement rule's reason string
- `merge_primary`:  exact AHSS section title the OS section was placed relative to

Verify correctness: `Inserted: N` should equal exactly the number of matches in placement map.
If it says 31 instead of 9, you have number-based placement bleeding into duplicate sections.

## Determining Genuine vs Borderline Unique Sections

After running dedup, manually review the `unique` list. Classification guide:

| Type | Example | Decision |
|------|---------|----------|
| Section-level intro | "1.3 Sampling principles and strategies" | **skip** — primary book has its own |
| Chapter-level intro | "Introduction to data" (TOC list) | **skip** — primary book has its own |
| Callout box dupe | "ANECDOTAL EVIDENCE" callout | **skip** if overlap > 0.50 with primary callout |
| Added practice step | OS 1.1 GP: "compute 45/224" | **include** — concrete calculation AHSS omits |
| Conceptual primer | OS 1.2.5: obs/experiment intro | **include** — placed before AHSS section it previews |
| Depth extension | OS 1.4.2: blinding/placebo | **include** — genuinely new pedagogical content |
| Ethics angle | OS 1.17 GP: sham surgery ethics | **include** — new dimension absent from primary |
| Same scenario, diff figure | OS 1.12 GP: sunscreen + confounding fig | **borderline** |
| Same principle, diff examples | OS 1.4.1: pill-form placebo example | **borderline** |

Borderline rule: include if overlap is 55-80% AND it adds a figure, different example,
or an explicit "why" explanation the primary omits.

## Confirmed Unique Sections (AHSS + OS Stats Ch1)

For reference — the 9 sections in the placement_ch1_v2.json:

| OS section | Placement | Tier | Reason |
|---|---|---|---|
| 1.1 GUIDED PRACTICE 1.1 | after GUIDED PRACTICE 1.1 | include | Adds 45/224 proportion calculation AHSS omits |
| 1.2.5 Introducing obs/experiments | before 1.3 Overview | include | Conceptual primer before AHSS section |
| 1.3.4 Observational studies | after 1.3.4 Obs vs experiments | include | Loan/county data framing — different angle |
| 1.3.5 Four sampling methods | after 1.4.3 Sampling | include | Implied-randomness framing not in AHSS |
| 1.4.2 Reducing bias | after 1.5.1 Reducing bias | include | Blinding/placebo deep-dive |
| 1.17 GUIDED PRACTICE 1.17 | after GUIDED PRACTICE 1.28 | include | Sham surgery ethics — absent from AHSS |
| 1.12 GUIDED PRACTICE 1.12 | after GUIDED PRACTICE 1.15 | borderline | Sunscreen + confounding variable figure |
| 1.14 EXAMPLE 1.14 | after EXAMPLE 1.25 | borderline | Stratification precision explanation |
| 1.4.1 Principles of exp design | after 1.5.2 Principles | borderline | Same 4 principles, different examples |

## Output Files (Versioned — Never Overwrite)

| File | Script | Description |
|------|--------|-------------|
| `dedup_ch1_v1.json` | fingerprint_dedup.py | Classification of all supp sections |
| `placement_ch1_v2.json` | placement_map.py | Insertion rules (borderline included) |
| `placement_ch1_v2_no_borderline.json` | placement_map.py | Insertion rules (borderline excluded) |
| `merged_ch1_v2.json` | merge_from_placement.py | Merged book JSON, 89 sections |
| `merged_ch1_v2_report.md` | merge_from_placement.py | Merge report — what went where |

## Extracting a Single Chapter Before Running the Pipeline

The pipeline scripts take per-chapter JSON files, not full-book JSONs.
Extract the chapter you need first:

```python
python3 << 'PYEOF'
import json, os

base = 'projects/Introduction to Stats/remastered'

for source_file, out_file, label, chap_num in [
    ('ahss_full_source.json', 'Merged/ahss_ch2.json', 'AHSS', '2'),
    ('os_full_source.json',   'Merged/os_ch2.json',   'OS',   '2'),
]:
    with open(os.path.join(base, source_file)) as f:
        book = json.load(f)
    chapters = [ch for ch in book.get('chapters', []) if str(ch.get('number')) == chap_num]
    if not chapters:
        print("Chapter %s not found in %s" % (chap_num, source_file))
        continue
    out = dict(book)
    out['chapters'] = chapters
    with open(os.path.join(base, out_file), 'w') as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print("%s ch%s: %d sections -> %s" % (label, chap_num, len(chapters[0].get('sections',[])), out_file))
PYEOF
```

Scope all runs to one chapter at a time — full-book runs time out with GLM.

## Chapter 2 Confirmed Working (AHSS + OS)

The same three-script pipeline works for ch2 with no changes to the scripts.
Ch2 results: 23 placement rules (16 include + 7 borderline), 0 not found, 0 ambiguous.
Note: AHSS ch2 skips EXAMPLE 2.4–2.8 (jumps from 2.3 to 2.9) — if an OS section targets
a missing AHSS example number, fix the placement to the nearest preceding example.

## Pitfalls

- **Number-based placement fires multiple times**: `after_1.3` matches all 6 sections with
  `number: "1.3"`. Always use `after_title:Exact Title`. Symptom: 111 sections instead of 89.

- **Supp section not found (NOT_FOUND)**: Happens when supp_title in placement rule doesn't
  match actual JSON title. Check exact titles with the python one-liner above.

- **Borderline toggle**: `--no-borderline` flag on placement_map.py drops 3 sections from
  9 to 6. Run both variants for comparison before approving.

- **merge.py vs merge_from_placement.py**: The older `merge.py` uses number-based indexing
  (last-write-wins collision on duplicate section numbers). Use `merge_from_placement.py`
  for any books with non-unique section numbers (i.e. most textbook JSONs).

- **os_ch1.json also has duplicate IDs**: OS sections 1.2, 1.3, 1.4 each have 4-6 entries.
  `merge_from_placement.py` resolves these by matching on `supp_title` field from the
  placement map — always include `supp_title` in placement rules.
