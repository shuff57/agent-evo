---
name: book-prompt-optimizer
description: Use when AI remaster outputs are systematically failing quality checks — runs a score-and-iterate loop to automatically optimize the remaster prompt using a linter as the scorer and a critic agent to patch failing rules.
---

# Book Remaster Prompt Optimizer

> Automated score-and-iterate loop: run candidate prompt against real sections,
> score with the linter, feed failures to a critic agent to patch the prompt,
> repeat until score plateaus or target is reached. Saves the winning prompt.

## When to Use
- Multiple remastered sections failing linter on the same rules (especially TIN=0)
- After discovering a prompt has diverged from the canonical version
- Before doing a batch re-remaster of a full chapter
- When you want to objectively compare two prompt variants

## When NOT to Use
- Single section failing with an isolated issue — fix manually
- Prompt already scores >=95 on test sections
- The linter itself needs updating (fix the linter first, then optimize)

## Key Files
- Linter: `scripts/workflows/lint_remaster.py` — 7-rule scorer, threshold 75/100
- Optimizer: `scripts/workflows/optimize_prompt.py` — the iterate loop
- Good prompt: `prompts/remaster-chapter.md` (184 lines, has Quality Checklist)
- Weak prompt: `scripts/workflows/prompts/remaster-chapter.md` (147 lines, no checklist)
- Optimization checkpoints: `prompts/optimization_runs/prompt_iterNN.md`

## Quick Run
```bash
cd /mnt/c/Users/shuff57/Documents/GitHub/bookSHelf

# Dry-run first to validate setup
python3 scripts/workflows/optimize_prompt.py --dry-run

# Full optimization run (uses good prompt as starting point)
# Pass --provider/--model to control which AI is used for the critic
python3 scripts/workflows/optimize_prompt.py \
  --prompt prompts/remaster-chapter.md \
  --target 95 \
  --iterations 6 \
  --provider ollama --model kimi-k2.5:cloud
```

## How It Works

```
candidate_prompt
      |
      v
remaster.py  (run against 1.1 + 5.3 — known bad sections)
      |
      v
lint_remaster.py --json  (score each output)
      |
      v
average score >= target? --> lock prompt to both locations
      |
    no
      v
critic agent (claude CLI) reads failures + current prompt
      |
      v
patched prompt  -->  next iteration
```

## Linter Rules (7 rules, 100pt scale)

| Rule | Weight | What It Checks |
|------|--------|---------------|
| try_it_now | 25 | >= 1 TIN per 80 source lines, min 1 total |
| source_attribution | 20 | Every Example/Definition/TIN has `**Source:**` within 3 lines |
| context_pauses | 10 | >= 1 Context Pause per 120 source lines |
| insight_notes | 10 | >= 1 Insight Note per 120 source lines |
| math_delimiters | 15 | Consistent `$...$` or `\(...\)`, no mixing |
| header_format | 10 | `# X.Y Title` format, no "Section" prefix |
| no_premature_solutions | 10 | No `<details>` in Problem Sets (auto-skips if solutions pipeline ran) |

Threshold: **75/100 to pass**, **95/100 target for optimization**.

## Baseline Scores (Applied Finite Math)
- `1.1 Graphing a Linear Equation` with WEAK prompt: **62.5 FAIL** (TIN=0, solutions in problem set)
- `5.3 Logarithms and Logarithmic Functions` with WEAK prompt: **65.0 FAIL** (TIN=0, solutions in problem set)
- `5.3 Logarithms and Logarithmic Functions` with GOOD prompt (kimi-k2.5:cloud, 10 chunks): **84.0 PASS**
  - Failing: header_format (AI adds `## 5.3.1` sub-numbers — needs explicit ban), source_attribution (TIN blocks missing Source:), math_delimiters (3 bare `$` in blockquote TOC links)
- `6.2 Compound Interest` with GOOD prompt: **100.0 PASS** (5 TINs, all rules pass)

## Manual Linting (without running optimizer)
```bash
# Single section with source for coverage ratios
python3 scripts/workflows/lint_remaster.py \
  --input "projects/Applied Finite Math/remastered/.../Section_Remastered.md" \
  --source "projects/Applied Finite Math/remastered/.../Section.md"

# JSON output for scripting
python3 scripts/workflows/lint_remaster.py --input ... --source ... --json

# Batch lint all sections in a chapter
for f in "projects/Applied Finite Math/remastered/.../*_Remastered.md"; do
  python3 scripts/workflows/lint_remaster.py --input "$f" --json | python3 -c \
    "import json,sys; r=json.load(sys.stdin); print(f\"{r['score']:5.1f} {'PASS' if r['passed'] else 'FAIL'}  {r['file'].split('/')[-1]}\")"
done
```

## Pitfalls

**Linter false positive: premature solutions**
The linter detects whether the solutions pipeline has already run by checking if `<details>` blocks appear within 5 lines of a Try It Now header. If solutions have run, the `no_premature_solutions` rule is skipped entirely (awarded full credit). If linting a fresh remaster output (pre-solutions), any `<details>` in Problem Sets is a real violation.

**Critic agent uses AIClient — no CLI dependency**
`call_critic()` in `optimize_prompt.py` makes direct HTTP calls via `ai_client.py` — same provider as the rest of the pipeline. Pass `--provider` / `--model` to `optimize_prompt.py` to control which model the critic uses. Manual fallback (pauses + waits for Enter) still applies if AI is completely unavailable.

**Two diverged prompt files — now synced**
Both prompt locations are now identical (184 lines). After optimization, the winning prompt is saved to BOTH:
- `prompts/remaster-chapter.md`
- `scripts/workflows/prompts/remaster-chapter.md`
If you edit the prompt manually after, sync both files (or just `cp` the root one over the scripts one).

**Source file required for accurate TIN/Context Pause scoring**
Without `--source`, the linter uses output file length as the denominator, which inflates expected counts. Always pass `--source` when the source section is available.

## Pipeline Gate Integration
The lint gate is wired into `bookshelf-app/app-main/pipeline-runner.js`:
- `pipeline-steps.js` step 3 (Remaster) has `lintGate: true`, `lintThreshold: 75`
- After a successful remaster step, `_runLintGate()` finds the latest `*_Remastered.md` and runs the linter
- `step:lint-pass` / `step:lint-fail` events emitted with score and failing rules
- Lint failure returns `{ code: 2 }` which stops the pipeline and triggers `autorun:stopped`
- UI can call `window.electronAPI.lintRemaster({ inputPath, sourcePath })` for on-demand linting
