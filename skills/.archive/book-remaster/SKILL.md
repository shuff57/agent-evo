---
name: book-remaster
description: Use when rewriting or enhancing textbook sections for clarity and engagement in the Student Enhanced Edition format, especially after merging or as the primary transformation step for single-source content.
disable-model-invocation: true
---

# Book Remaster

> Rewrite textbook sections into a "Student Enhanced Edition" that retains 100% mathematical substance while upgrading language, adding Context Pauses, Insight Notes, Try It Now exercises, and consistent formatting. Supports both monolithic (single AI call) and chunked (split-parallel-merge) modes based on file size.

## Prerequisites
- bookSHelf project at `C:\Users\shuff\Documents\GitHub\bookSHelf`
- Source markdown file (original or merged section)
- AI provider configured (env vars or explicit args)

## When to Use
- Transforming raw textbook content into Student Enhanced Edition format
- After book-merge has combined sources (remaster the merged output)
- Single-source textbook needing enhancement (skip merge, go straight to remaster)
- Re-remastering a section that needs quality improvements

## When NOT to Use
- Content is already remastered and passes quality checks
- Only math verification needed (use book-math-verify)
- Only HTML conversion needed (use book-html-gen)

## Guardrails

> ⚠️ **Must NOT:**
> - Remove any mathematical content from the original
> - Change section header format (must stay `# X.Y [Title]`)
> - Generate solutions (handled by separate pipeline step)
> - Skip source attribution on any Example, Definition, Try It Now, or Problem Set
> - Use chunked mode on files under 300 lines (wastes tokens)

## Quick Start
1. Identify the source markdown file
2. Script auto-selects mode: monolithic (<300 lines) or chunked (>300 lines)
3. Run remaster.py with the remaster prompt
4. Verify output against quality checklist

## Workflow

### Phase 1: Assess Input
- **INPUT:** Source markdown file path
- **ACTION:** Check file size and line count to determine mode
  - Files > 300 lines OR > 50KB: chunked mode
  - Files ≤ 300 lines AND ≤ 50KB: monolithic mode
- **OUTPUT:** Selected mode and file statistics

### Phase 2: Execute Remaster
- **INPUT:** Source file, mode decision
- **ACTION:** Run remaster script
```bash
cd /mnt/c/Users/shuff57/Documents/GitHub/bookSHelf && python3 scripts/workflows/remaster.py \
  --input "{source.md}" \
  --output "{remastered_v2.md}" \
  --prompt prompts/remaster-chapter.md \
  --provider ollama \
  --model glm-5.1:cloud \
  --base-url http://localhost:11434
```
Optional flags:
- `--chunked` to force chunked mode
- `--no-chunked` to force monolithic mode
- `--provider anthropic --model claude-sonnet-4-5` for specific AI
- **OUTPUT:** Remastered markdown file

> **Never overwrite existing output.** Always write to a versioned dupe: `_v2.md`, `_v3.md`, etc.
> Compare with diff + lint before asking user to approve. Only proceed to next section after approval.

**Confirmed working provider/model for this project:**
- `--provider copilot --model claude-sonnet-4.6` — **preferred**, ~2-5 sec/section. OAuth token auto-read from `~/.hermes/auth.json` credential_pool.copilot[0].access_token. Copilot provider branch is patched into `scripts/workflows/ai_client.py` — it is NOT in the original upstream file.
- `--provider ollama --model glm-5.1:cloud --base-url http://localhost:11434` — fallback, ~90-120s for heavy sections (2,500+ chars), ~20s for stubs. Full 89-section Ch1 ran in ~2 hours sequential (16:22–18:19). Confirmed: 89/89 PASS, 0 retries, 0 failures on updated prompt. The old "6-7 min/section" figure was an early estimate; real timing varies significantly by section size.
- No `.env` file — pass provider/model explicitly on every command

### Phase 3: Automated Quality Gate (Linter)
- **INPUT:** Remastered output markdown
- **ACTION:** Run the automated linter — this is the canonical quality gate:
```bash
cd /mnt/c/Users/shuff57/Documents/GitHub/bookSHelf
python3 scripts/workflows/lint_remaster.py \
  --input "path/to/Section_Remastered.md" \
  --source "path/to/source_Section.md"
```
  Use `--json` flag for machine-readable output.
  **Threshold: 75/100 to pass.** Target for optimization: 95/100.

- **Linter rules (8, weighted):**
  - Try It Now coverage (25 pts) — min 1 per 80 source lines
  - Source attribution (20 pts) — every Example/Definition/TIN/Guided Practice needs `**Source:**` (or `*Source:*` or `Source:`) within 3 lines
  - Math delimiters (15 pts) — consistent `\\(...\\)` inline, `$$...$$` block, no `$...$`
  - Context Pauses (10 pts) — min 1 per 120 source lines
  - Insight Notes (10 pts) — min 1 per 120 source lines
  - Header format (10 pts) — must be `# X.Y Title`, no "Section" prefix
  - No premature solutions (10 pts) — auto-skips if solutions pipeline already ran
  - Proportionality (0 pts, WARN only) — expansion from Try It Nows, Context Pauses, Insight Notes, TOC, and subsections is EXPECTED and intentional (3-8× is normal). Only WARN fires at >10× (likely fabrication). Stub floor: sources < 500 chars allowed up to 2000 chars output regardless of ratio. Stub sections auto-routed to remaster-stub.md by title pattern or size — this is the real guard against runaway stubs, not the ratio limit.

- **OUTPUT:** Score 0-100, PASS/FAIL per rule with line numbers for failures

### Phase 4: Fix Issues / Optimize Prompt
- **INPUT:** Linter failures
- **If manual fix:** address the specific line numbers flagged
- **If systematic (many sections failing same rules):** run the optimizer:
```bash
python3 scripts/workflows/optimize_prompt.py \
  --prompt prompts/remaster-chapter.md \
  --target 95 --iterations 6
```
  The optimizer reruns remaster on test sections, scores with linter, feeds failures to Claude critic, repeats until score plateaus or target hit. Winning prompt is auto-saved to both prompt locations.

- **OUTPUT:** Improved prompt locked to `prompts/remaster-chapter.md`



## Scripts

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `bookSHelf/scripts/workflows/remaster.py` | Remaster with auto mode selection | `--input SRC --output OUT --prompt PROMPT` | Remastered markdown |
| `bookSHelf/scripts/workflows/remaster_chunked.py` | Chunked mode backend | Called by remaster.py | Chunked remaster output |
| `bookSHelf/scripts/workflows/pipeline.py` | **Preferred** — full pipeline orchestrator | `--project --section [--steps remaster]` | Handles chunking natively |
| `bookSHelf/scripts/workflows/remaster_merged.py` | **Use when source is a merged JSON** — reads merged chapter JSON, exports each section as markdown, remasters with auto stub routing, lints, diffs vs existing, writes versioned output | `--merged PATH --out-dir PATH --provider copilot --model claude-sonnet-4.6 --section-index N --output-suffix _v2 [--stub-prompt PATH]` | Versioned `_Remastered_vN.md` per section. Stub prompt auto-detected as `remaster-stub.md` sibling — no explicit `--stub-prompt` needed unless overriding. |

### Parallel Batch Execution (Approved Pattern)

Once the first few sections are approved and quality is confirmed, run batches of 9 in parallel using shell `&` + `wait`. Copilot/sonnet-4.6 handles concurrent calls without rate errors:

```bash
# Run sections 9-17 in parallel (all complete in ~30s instead of ~3min sequential)
for i in 9 10 11 12 13 14 15 16 17; do
  python3 scripts/workflows/remaster_merged.py \
    --merged "projects/Introduction to Stats/remastered/Merged/merged_ch1_v3.json" \
    --out-dir "projects/Introduction to Stats/remastered/Chapter_1_Merged_v3_Sections_Remastered" \
    --compare-dir "projects/Introduction to Stats/remastered/Chapter_1_Merged_Sections_Remastered" \
    --remaster-prompt prompts/remaster-chapter.md \
    --provider copilot --model claude-sonnet-4.6 \
    --section-index $i --output-suffix _v2 2>&1 &
done
wait
echo "BATCH COMPLETE"
```

Run this via `terminal(background=True, notify_on_complete=True)`. Wrap in a background process + `process(action="wait")` loop. Do NOT run inside `execute_code` (300s hard cap).

**Recommended batch sizes:** 9 sections per batch. With 89 total sections at ~30s/batch, entire chapter 1 completes in ~5-6 minutes of wall time.

**Double-batching:** You can run two batches of 9 simultaneously in separate background processes (e.g. sections 18-26 and 27-35 at the same time) — Copilot handles 18 concurrent calls without rate errors. Wait for both with separate `process(action="wait")` calls. This halves wall time for large chapters.

**Full chapter run order:**
1. Run sections 0-2 manually with approval gates (validate quality)
2. Approve output pattern, then batch the rest in groups of 9 (or 9+9 double-batch)
3. After all sections done, run full re-audit to find any rule FAILs
4. Re-run only failing sections with `--output-suffix _v3` using tightened prompt
5. Commit all `_vN` files — pipeline downstream uses latest version per slug

## Remastering from Merged JSON (post-merge workflow)

`pipeline.py` expects a `_Sections/` directory — it has **no merged-JSON input support**. When the source is `merged_ch1_v3.json` (output of the merge step), use `remaster_merged.py` instead.

```bash
# Single section (approval-gate workflow)
python3 scripts/workflows/remaster_merged.py \
  --merged "projects/Introduction to Stats/remastered/Merged/merged_ch1_v3.json" \
  --out-dir "projects/Introduction to Stats/remastered/Chapter_1_Merged_v3_Sections_Remastered" \
  --compare-dir "projects/Introduction to Stats/remastered/Chapter_1_Merged_Sections_Remastered" \
  --remaster-prompt prompts/remaster-chapter.md \
  --provider copilot --model claude-sonnet-4.6 \
  --section-index 0 \
  --output-suffix _v2

# Dry run to preview section list
python3 scripts/workflows/remaster_merged.py ... --dry-run
```

The script:
1. Reads `merged_ch1_v3.json` -> `chapters[0].sections[]` (89 sections for ch1)
2. Converts each section's `blocks[]` to markdown (with source attribution headers, merge_tier metadata)
3. Calls `AIClient.generate()` directly (same lint/correction loop as pipeline.py)
4. Diffs output vs existing `_Remastered.md` in `--compare-dir` if provided
5. Writes versioned output; auto-bumps version number if file exists (never overwrites)

**Output dir naming:** Use `Chapter_1_Merged_v3_Sections_Remastered` — ends in `_Remastered` so `pipeline.py`'s `ProjectContext._find_dir` correctly identifies it as the remastered dir, not the source dir.
> **pipeline.py vs remaster_merged.py:**
> - `pipeline.py` expects a `_Sections/` directory with one `.md` file per section. It auto-discovers the first subdir matching `*_Sections*` (sorted). Use for single-source or pre-merged flat section files.
> - `remaster_merged.py` is the correct entry point when input is a merged chapter JSON (`merged_ch1_v3.json`). It handles the blocks→markdown conversion internally and writes to a new `*_Remastered/` output dir.

```bash
# Remaster section index 0 from merged JSON (approval-gate workflow):
cd /mnt/c/Users/shuff57/Documents/GitHub/bookSHelf
python3 scripts/workflows/remaster_merged.py \
  --merged "projects/Introduction to Stats/remastered/Merged/merged_ch1_v3.json" \
  --out-dir "projects/Introduction to Stats/remastered/Chapter_1_Merged_v3_Sections_Remastered" \
  --compare-dir "projects/Introduction to Stats/remastered/Chapter_1_Merged_Sections_Remastered" \
  --remaster-prompt prompts/remaster-chapter.md \
  --provider ollama --model glm-5.1:cloud --base-url http://localhost:11434 \
  --section-index 0 --output-suffix _v2
```

> **Prefer `pipeline.py` over calling `remaster.py` directly** for single-source work. The old `remaster_chunked.py` had an explicit bailout — "Claude must now spawn parallel subagents" — at the chunking decision point. `pipeline.py`'s `_remaster_chunked()` replaces this with a native Python loop.

## Error Handling

| Problem | Action |
|---------|--------|
| AI truncates output | Switch to chunked mode with smaller chunks |
| Missing source tags | Add them manually, mark as "Source: Main Text" if inferrable |
| Broken LaTeX | Preserve original and add comment: `<!-- Math notation unclear -->` |
| Image paths broken | Preserve original path, add: `<!-- Image path may need verification -->` |
| Numbering inconsistent | Apply unified C.N numbering ignoring source section numbers |

## Pitfalls Learned in Practice

| Pitfall | What Happened | Fix |
|---------|---------------|-----|
| Two diverged prompt files | `prompts/remaster-chapter.md` (good, 184 lines) vs `scripts/workflows/prompts/remaster-chapter.md` (weak, 147 lines). Ch1-5 used weak prompt → TIN=0 on every section. | Always pass `--prompt prompts/remaster-chapter.md` explicitly. Run `diff` on both to verify they match before batch runs. |
| Generating solutions in Problem Sets | Weak prompt omits "NEVER generate solutions" rule — AI puts `<details>` blocks in Problem Sets | Enforce via linter rule `no_premature_solutions`. Linter auto-detects if solutions pipeline already ran (skips check). |
| Changing `# X.Y` header format | AI adds "Section" prefix: `# Section 1.1 ...` | Linter flags `header_format` rule. Add explicit example in prompt. v1→v2 rerun on same source fixed this (100/100 vs 92.5/100). |
| Try It Now solution block missing Source tag | AI generates a "Solution Guide" section at end with `Try It Now X.Y Solution:` header but no `**Source:**` tag — linter flags it | v2 run eliminated the extra solution section entirely; Try It Now now uses `<details>` collapsible inline. |
| Image source caption dropped on re-run | v2 dropped `*Image Source: [Supplementary C]*` caption that v1 had for supplemental image | Minor regression — not a lint failure but worth noting. If image is from supplemental source, verify caption survived. |
| Using monolithic mode on large files | Truncated output | Let auto-detection choose or force `--chunked` |
| Missing Try It Now exercises | Most common failure with weak prompt — TIN=0 across entire chapter | Linter rule `try_it_now` weight is 25 pts (highest weight) — failing it alone causes FAIL |
| Math delimiter inconsistency | Good prompt uses `\\(...\\)`, some outputs mix with `$...$` | Linter detects standard in use and flags crossover violations |
| `remaster_chunked.py` halts with "Claude must now spawn parallel subagents" | Old design required agent intervention at chunk-split decision point | Use `pipeline.py` instead — it has a native `_remaster_chunked()` loop that calls `AIClient` per chunk in pure Python, no agent needed |
| TIN lint failure on tiny stub sections | 10-line intro/header stub sections score 0/25 on try_it_now — linter expects ~1 TIN regardless of source length | This is a linter artifact for stub sections; 75/100 (just passing) is correct and acceptable for these. Do not add forced TINs to stubs. |
| AI over-expands stub sections | On short stubs (6 lines, 2 bullets), prompt instructions for ToC + Context Pauses + TIN + Insight Notes caused 38.8× expansion (310 chars → 12,019 chars) — fabricating full chapters of invented content | Route to `prompts/remaster-stub.md` via title-pattern or size<=500 auto-routing in `remaster_merged.py`. The stub prompt caps output at 2000 chars and forbids adding new headers. The chapter prompt now has a softened PROPORTIONALITY RULE: expansion from TIN/Pause/TOC/subsections is encouraged; only wholesale fabrication (>10×) fires a WARN. The old 3× hard cap was contradicting the chapter prompt's own directives and has been removed. |
| Copilot provider not available in ai_client.py | Pipeline's AIClient had no copilot branch — OAuth token not wired | Added `copilot` provider branch to `ai_client.py`: reads token from `~/.hermes/auth.json`, calls `https://api.githubcopilot.com/chat/completions` with required headers. Use `--provider copilot --model claude-sonnet-4.6`. |
| execute_code 300s timeout kills long GLM calls | GLM cloud remaster of a full section takes >5 min — execute_code script wrapper times out | Use `terminal(background=True, notify_on_complete=True)` + `process(action='wait')` for all remaster calls. Never run remaster inside execute_code. |
| Dry-run leaves placeholder files | `--dry-run` writes raw source markdown to the output path (no suffix) — looks like a real remaster output | Clean up dry-run files before live run. Dry-run output is the raw blocks_to_markdown conversion, not remastered content. |
| GLM cloud call times out in execute_code | `execute_code` has a hard 300s cap; GLM remote calls take 6-7 min per section | Run `remaster_merged.py` via `terminal(background=True, notify_on_complete=True)`, then `process(action="wait")` in 180s increments until exit |
| Stub over-expansion persists despite prompt fix | Adding PROPORTIONALITY RULE to prompt reduced expansion from 38×→5× for medium stubs, but \"Learning objectives\" stubs (5-8 bullets, ~300-600 chars) still balloon to 22-23× (13K-24K chars). Claude interprets the ToC + Context Pause + TIN requirements as license to fabricate full chapter outlines. | Prompt fix is necessary but not sufficient for the worst stubs. Create a separate `prompts/remaster-stub.md` for sections under 600 chars that forbids adding new headers/content and caps output at 2000 chars. Re-run only the flagged 22×+ WARN sections with the stub prompt. `remaster_merged.py` now auto-routes to stub prompt by title pattern (see below) — no manual re-run needed for well-known stub titles. |
| Stub sections not limited to char-count threshold | Many structural sections ("Section summary", "Chapter highlights", "Key terms") are large enough to clear the 500-char stub floor but behaviorally identical to stubs — they balloon to 5-8× with the chapter prompt. Size alone is not a reliable stub signal. | Added title-pattern routing to `remaster_merged.py` via `STUB_TITLE_PATTERNS` and `select_prompt()`. Sections whose title matches "Learning objectives", "Section summary", "Chapter highlights", "Chapter summary", "Chapter overview", "Key terms", "Key concepts", or "Objectives" are automatically routed to `prompts/remaster-stub.md` regardless of source size. Pattern is case-insensitive and matches from start of title. The stub prompt is auto-detected as `remaster-stub.md` sibling of the chapter prompt — no `--stub-prompt` flag needed unless overriding. Log line "Prompt: stub (title-pattern)" vs "Prompt: chapter" confirms routing per section. |
| Guided Practice blocks missing source attribution | `rule_source_attribution` only triggered on Example, Definition, Try It Now headers. Guided Practice blocks (e.g. `### Guided Practice 1.20`) were not checked — Claude routinely skipped `**Source:**` on them. | Added "Guided Practice" to `trigger_rx` in `rule_source_attribution`. Also added section 5.5 "Guided Practice Blocks — Source Attribution Required" to `prompts/remaster-chapter.md` and "Guided Practice" line to the quality checklist. Same zero-tolerance rule as Examples: `**Source:** [Book Name]` within 3 lines. |
| Linter rejects valid italic `*Source:*` format | After stub prompt update, Claude occasionally writes `*(Source: Main Text)*` (italic) or plain `Source:` instead of `**Source:**` (bold). The linter's `source_rx = re.compile(r"\*\*Source:\*\*")` rejected these as FAIL even though attribution was present. | Loosened `source_rx` to `re.compile(r"(\*\*Source:\*\*|\*Source:|\bSource:)", re.IGNORECASE)` — accepts bold, italic, or plain. Only a complete absence of any "Source:" near the trigger fires a FAIL. Already patched in `lint_remaster.py`. |
| `--section-index` is 0-based, output slugs are 1-based | Output filenames are numbered 01-89 (1-based), but `--section-index` is 0-based. Slug `27 Learning objectives` = `--section-index 26`. Off-by-one caused stub re-run to write to the wrong files (28 and 73 instead of 27 and 72). Rule: subtract 1 from the slug number to get the correct `--section-index`. Verify with: `python3 -c \"import json; d=json.load(open('merged_ch1_v3.json')); s=d['chapters'][0]['sections'][IDX]; print(s['title'])\"` before running. |
| `no_premature_solutions` false positive after Problem Set | When `### Try It Now` follows `### Problem Set`, the linter's `in_problem_set` flag stays True (it only reset on top-level `#` headers). Any `<details>` in the Try It Now triggers a false FAIL. | Fixed: use `re.match(r'^#+\s', line)` (any header level) instead of `re.match(r'^#\s', line)` to reset the flag. Already patched in `lint_remaster.py` — do NOT revert to single-`#` check. |
| Insight Notes and Context Pauses silently skipped | Even with MANDATORY in the prompt, Claude skips Insight Notes on ~20% of sections (short stubs, simple Guided Practices). Score drops 10-20 pts. Pattern: sections where AI judges the content "too simple" for an analogy. | Strengthen prompt wording to: "⚠️ REQUIRED IN EVERY SECTION — NO EXCEPTIONS. If you omit this, the output will be REJECTED." — the word REJECTED is the key trigger that reduces omission rate. This change is already in `prompts/remaster-chapter.md`. |
| Fixup audit: how to find and re-run all failing sections | After a full chapter run, not all failures are visible from batch output (notifications arrive late/truncated). | Run a full re-audit with: `python3` loop over all output files, call `run_lint()` on each, collect failing rules. Group by failure type: hard FAIL (rule FAIL), egregious expansion (>5×), moderate expansion (3-5×). Re-run only sections with rule FAILs; treat 3-5× WARN as informational. Use `--output-suffix _v3` for re-runs to avoid overwriting originals. Final canonical version = latest `_vN` for each slug. |
| source_attribution failures in large Guided Practice sections | Sections with 8+ numbered elements (e.g. GUIDED PRACTICE 1.20 with 8 sub-questions) get partial attribution — Claude attributes 5/8 or 17/27 elements, skipping some. Score drops to 85/100. | These sections need a re-run. The attribution rule checks for `**Source:**` within 3 lines of each Example/Definition/TIN header — ensure the prompt emphasizes attribution on every numbered sub-element, not just top-level blocks. |
| \"Section summary\" stubs expand to 7× regardless of source size | \"Section summary\" sections with 500-2800 chars source routinely hit 5-7× expansion (3800-20000 chars output). The AI treats them as an invitation to write a comprehensive review chapter. | These are acceptable if the content is on-topic and all concepts trace to source. Spot-check a few for fabrication; if content is faithful (just verbose), treat 5-7× WARN as informational. Only re-run at 22×+. |
| Prompt contradiction: Section 6 vs PROPORTIONALITY RULE | Section 6 mandated creating subsections with \"a brief worked example\" for every rule with 2+ items. PROPORTIONALITY RULE said \"NEVER invent new... worked examples not present or directly implied by the source.\" These rules contradicted — the model cited Section 6 as license to fabricate worked examples. | **RESOLVED April 11 2026:** Section 6 now says explanation + notation only; worked examples are only included if one already exists in the source for that specific rule. PROPORTIONALITY RULE now explicitly lists what IS allowed (TOC, Context Pauses, Insight Notes, Try It Nows with full solutions, callout boxes, subsection headers) and sharpens the prohibition to \"NEVER invent new sections, subsections, definitions, examples, or problem content.\" |
| Try It Now solutions were capped at 3-5 steps | Old prompt said \"KEEP solutions concise (3-5 steps max)\" — this produced thin, student-unfriendly solutions that skipped reasoning steps. | **RESOLVED April 11 2026:** Replaced with \"YOU MUST WRITE complete, fully worked solutions. Do NOT truncate or summarize steps. Every step must be shown so a student can follow without outside help.\" Same fix applied to Examples (Section 3). Full solutions are explicitly listed in PROPORTIONALITY RULE as a legitimate/expected expansion source. |
| 3x-8x expansion is acceptable when driven by structural additions | User confirmed: 3x-8x growth is FINE when caused by Try It Nows (with collapsible solutions), Context Pauses, Insight Notes, TOC, and callout boxes. These are by-design additions. The concern is ONLY when the AI adds new definitions, new worked examples, or new sections not present in the source. | Distinguish expansion type before flagging. Check: is the added content a TIN, Context Pause, Insight Note, or TOC entry? Those are expected. Is it a new definition, new section, or a worked example with no source analog? That is fabrication and warrants a re-run. |
| GitHub Copilot model not accessible from pipeline | Hermes uses internal OAuth for copilot — no env vars exposed to subprocesses; old `AIClient` in pipeline.py had no copilot branch | **RESOLVED:** `copilot` provider branch added to `ai_client.py`. Reads token from `~/.hermes/auth.json` credential_pool.copilot[0].access_token, calls `https://api.githubcopilot.com/chat/completions` with required headers (`Copilot-Integration-Id: vscode-chat`, `Editor-Version: vscode/1.95.0`). Use `--provider copilot --model claude-sonnet-4.6`. ~2s/section vs 6-7min for GLM. |
| `_find_dir` picks wrong `_Sections` dir | `ProjectContext._find_dir` returns the FIRST sorted match — if two `*_Sections*` dirs exist (e.g. old `Chapter_1_Merged_Sections` and new `Chapter_1_Merged_v3_Sections`), it will pick the alphabetically earlier one | Use `remaster_merged.py` (bypasses `ProjectContext` entirely) or rename dirs so the correct one sorts first |

## Pre-Batch Prompt Audit (Do This Before Any Full Chapter Run)

Before running the full batch, audit the remaster prompt for internal contradictions. Key things to check:

1. **PROPORTIONALITY RULE vs section-level mandates** — if Section 6 (or any rule) says "include a worked example per subsection" but PROPORTIONALITY says "never invent worked examples," the model will cite the section-level rule. Fix: section-level rules must say "only if present in source."
2. **Solution conciseness cap vs student learning goal** — "3-5 steps max" contradicts the purpose of a student aid. Replace with "fully worked, every step shown."
3. **What counts as legitimate expansion** — make the PROPORTIONALITY RULE a bullet list of what IS explicitly allowed (TOC, Context Pauses, Insight Notes, Try It Nows with full solutions, callout boxes, subsection headers). The prohibition then reads clearly as: anything NOT in that list.

**Spot-check protocol before full batch** — always run at least 3 sections manually and read the output before committing to 89:
- Section 0 (chapter intro, short) — validates TOC, Context Pause, Insight Note basics
- A content-heavy section with a real worked example (e.g. 1,000-3,000 chars) — validates full solutions are preserved, no fabrication
- A rule-list section (e.g. "Principles of experimental design") — validates subsections don't inject invented worked examples

Spot-checks will get auto-bumped to `_v4` (or next available) when the full batch runs with the same `--output-suffix`, since the script never overwrites. This is cosmetic and harmless.

## Optimization Loop (Step-by-Step Approval)

When the user wants to optimize one step at a time with approval gates:

1. **Establish baseline** — lint the existing output, record score and failures
2. **Run versioned dupe** — write to `_v2.md` (never overwrite `_Remastered.md`)
   ```bash
   --output "...Section_Remastered_v2.md"
   ```
3. **Lint v2** and diff against v1
   ```bash
   python3 scripts/workflows/lint_remaster.py --input "...v2.md"
   diff "...Remastered.md" "...Remastered_v2.md"
   ```
4. **Show user:** lint score comparison, key content changes, any regressions
5. **Await approval** — do NOT move to next section or next pipeline step until user says go
6. **If rejected:** tweak prompt, bump to `_v3.md`, repeat
7. **If approved:** the versioned file becomes the accepted output; proceed to next section

> Scope: optimize one section at a time, one pipeline step at a time. Never batch-run ahead of user approval.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Generating solutions in Problem Sets | Do NOT generate solutions - handled by separate step |
| Changing `# X.Y` header format | Headers MUST stay as `# X.Y [Title]` for splitting script |
| Using monolithic mode on large files | Let auto-detection choose or force --chunked |
| Missing Context Pauses | Every complex term/formula needs a "why it matters" pause |
| Skipping Try It Now exercises | Each major concept needs a practice exercise with collapsible solution |
