---
name: book-pipeline-external
description: "[INACTIVE — frozen snapshot] External-AI bookSHelf pipeline (claude-cli / GitHub Copilot / Ollama / OpenAI-compatible) at scripts/workflows-external/. Preserved as-of just before the in-session refactor began. Use ONLY to run the legacy external pipeline; do not extend or refactor it. For active work use the `book-pipeline` skill (in-session, scripts/workflows/)."
disable-model-invocation: true
---

# Book Pipeline (External AI)

> Drive the full bookSHelf pipeline via `scripts/workflows-external/pipeline.py` — an AI-agnostic Python orchestrator that makes direct API calls (claude-cli, GitHub Copilot, Ollama, OpenAI-compatible endpoints), writes files to disk, lints, and retries. The current Claude session does not perform the AI work — pipeline.py spawns external providers. The Electron app spawns it and reads the JSON progress stream.
>
> **This is the preserved "external AI" pipeline.** Forked from `scripts/workflows/` at the working-tree state captured just before the in-session refactor began (post 8.3-run math-delimiter fixes). For the in-session variant being rewritten in `scripts/workflows/`, use `book-pipeline` instead.

## Architecture (as of 2025)

```
pipeline.py
    |
    ├── step_remaster()    → AIClient.generate() → lint_remaster.py → correction loop
    ├── step_normalize()   → subprocess: normalize_headings.py (renumber h2, remove cross-section)
    ├── step_number()      → subprocess: number.py
    ├── step_solutions()   → AIClient.generate() per Problem Set block
    ├── step_math()        → subprocess: math_verify.py (LaTeX pre-checks + AI review)
    ├── step_youtube()     → inline AIClient.generate() → writes _video_queries.json
    ├── step_html()        → subprocess: html_gen.py (has its own AI call + lint+retry)
    ├── step_verify()      → 7-phase _verify_html() + .verify_ok stamp
    └── step_publish()     → subprocess: publish.py
```

Steps without their own script (`scrape`, `match`, `merge`, `math`) are delegated via `SUBPROCESS_STEPS` dict — they auto-skip if the script doesn't exist.

## 2026-04-18 updates (external-AI)

Since 2026-04-13 the external-AI path has accumulated the following changes. They apply to both student and teach editions.

### Parallelism (moderate 4-way, env-tunable)

| Step | Env var | Default | Notes |
|------|---------|---------|-------|
| `remaster` chunks (student) | `REMASTER_PARALLELISM` | 4 | `pipeline.py:_remaster_chunked` ThreadPoolExecutor. Preserves document order in output. |
| `remaster-teach` chunks | `REMASTER_PARALLELISM` | 4 | Same helper, teach path. |
| `math-verify` batches | `MATH_BATCH_PARALLELISM` | 4 | `math_verify.py` batches run concurrently; results aggregated to `all_issues[bi]`. |
| `html_gen` chunks | `HTML_CHUNK_PARALLELISM` | 4 | Previously hardcoded to 1 (Ollama-cloud rate limits). Lower to 1 for ollama-cloud: `HTML_CHUNK_PARALLELISM=1`. |

For `solutions` + `youtube` — already ran as a parallel pair via `PARALLEL_GROUPS` in `pipeline.py`.

### Copilot token auto-refresh

`ai_client.py:_call_copilot` catches HTTP 401 and calls `_refresh_copilot_token()` to exchange the stored `github_access_token` for a new Copilot OAuth token. The refreshed token is written back to `~/.hermes/auth.json`. One-time initial login via:

```bash
python scripts/copilot_login.py
```

Completes GitHub device-flow OAuth, stores both the short-lived Copilot token and the long-lived `github_access_token`. After that, long pipelines that span the 30-minute token TTL recover automatically.

Related fix: `AI_MODEL` env var no longer leaks into the Copilot provider (was causing HTTP 400 when `.env` had `AI_MODEL=glm-5.1:cloud`). Copilot now only reads `COPILOT_MODEL` → hardcoded default `claude-sonnet-4.6`.

### skip-if-fresh (mtime) instead of skip-if-exists

`pipeline.py` adds `_output_fresh(output, *inputs)` and wires it into:

- `step_extract`: skip if source `.md` mtime ≥ merged JSON mtime
- `step_solutions`: skip if solutions file fresh vs numbered/remastered input AND every PS block has `<!-- Solutions -->`
- `step_html`: skip if HTML fresh vs best-input mtime
- `step_youtube`: skip if video queries fresh vs best-input mtime

Stale outputs auto-regenerate without manual deletion.

### Fixup step — two new phases

`step_fixup` now runs two additional deterministic lint passes:

- **A4** (`_lint_renumber_problems`): scans each `<div class="problem-set">`, rewrites `<strong>8.31 Title.</strong>` and `<strong>8.17</strong> <strong>Title.</strong>` to `<strong>Problem K: Title.</strong>` (K is 1-indexed within each set).
- **A5** (`_lint_move_post_ps_examples`): if any `<div class="example">` appears AFTER a `<div class="problem-set">`, moves it (and any preceding HTML comment) to right before the problem-set so the problem-set stays last on the page.

Both are idempotent.

### Teach-edition watermark

`pipeline.py step_html`, when `ctx.teach_mode` is True, post-processes the fresh HTML to:

1. Add `class="teach-mode"` to the `<body>` tag (preserves any existing classes with a space separator)
2. Inject `<p class="teacher-edition-subtitle">Teacher Edition</p>` right after the first `<h1>`

CSS rules live in `docs/style.css` (+ the three theme variants `style-canvas-lms.css`, `style-clean-textbook.css`, `style-dark-canvas.css`). The red diagonal banner approach was replaced with a subtitle line in April 2026.

### Shared `docs/images/`

Image files now live at `docs/images/` instead of per-project `docs/<slug>/images/`. All published HTML references images via depth-aware relative paths:

- `docs/<slug>/*.html` → `src="../images/<hash>.jpg"`
- `docs/teach/<slug>/*.html` → `src="../../images/<hash>.jpg"`

`publish.py::resolve_images` takes a `src_prefix` argument (`"../images/"` student, `"../../images/"` teach). Orphan cleanup scans every `*.html` under `docs/` (not just the current project's dest_dir) so cross-project images are never deleted.

Migration of existing per-project image dirs: `scripts/consolidate_docs_images.py` (one-shot, idempotent).

### html_gen.py hardening

- `_unhtml_math_content`: reverts `<sup>N</sup>` → `^N` / `^{N}` (and `<sub>` → `_`) inside `\(…\)`, `\[…\]`, `$$…$$`. Called from `_strip_code_fences` after every chunk.
- `_convert_footnotes_outside_math`: the post-assembly footnote converter `re.sub(r"\^(\d+)", r"<sup>\1</sup>", body_content)` now tokenizes math-delim spans first so it only fires on text outside `\(…\)`/`\[…\]`/`$$…$$`. Previously re-introduced `<sup>` inside math after chunk-level cleanup.
- Per-chunk exception handling broadened: `_convert_one` catches any `Exception` (not just `IOError/RuntimeError/ValueError`) — a single flaky chunk no longer kills the whole HTML step.
- Gap-filling: when a chunk future raises past all handlers, the result is skipped and the deterministic `md→html` fallback fills the gap so document order stays intact.
- Defensive `<details>` → `<details class="solution">` rewrite — any bare `<details>` the AI produces gets tagged before `publish.py verify` rejects it as a critical error.

### extract_sections.py

`blocks_to_markdown` now recognizes the merged-JSON image schema `{"type": "image", "reference": "![](images/…)"}`. Previously looked for `src`/`content`/`alt` keys only and silently dropped every image reference during extract.

### Prompts — math-delim rules tightened

- `prompts/remaster-chapter.md`, `prompts/remaster-teach.md`, `prompts/solutions.md`: added "only wrap genuine math in `\(…\)`" rule with good/bad examples (✅ `\(x = 5\)`, ❌ `\(press MENU\)`); forbid HTML tags inside math delimiters.
- `scripts/workflows-external/prompts/create-html-body.md`: strengthened "Preserve all LaTeX" to explicitly forbid `^N → <sup>N</sup>`, `_i → <sub>i</sub>`, or any HTML tag inside math delimiters.

### New helper scripts

| Script | Purpose | Idempotent |
|--------|---------|------------|
| `scripts/copilot_login.py` | GitHub device-flow OAuth → writes `~/.hermes/auth.json` with both tokens | Overwrites prior token |
| `scripts/consolidate_docs_images.py` | One-shot migration: per-project `images/` → shared `docs/images/`; rewrites HTML refs | ✓ |
| `scripts/fix_problem_set_layout.py` | Retrofit A4/A5 fixup on already-published sections | ✓ |
| `scripts/clean_8_3_math.py`, `scripts/clean_8_4_math.py`, `scripts/patch_8_2_html.py` | One-shot math/image cleanup for specific sections generated before the html_gen hardening landed | ✓ |

## Assembly Step (pre-remaster, book/chapter agnostic)

**Correct pipeline order:**
```
merge JSON (N fragments) → assemble per section → remaster per section → number → html
```
NOT: remaster all fragments → assemble. Assembling first saves tokens and produces cleaner remaster input.

Two scripts handle assembly. Both are fully book/chapter agnostic — driven by the merged JSON, no hardcoded titles or section numbers.

### assemble_chapter.py

Reads merged chapter JSON + per-fragment source .md files → assembles by merge_tier:
- `main` → keep in order
- `include` → fold in after preceding main fragment
- `borderline` → drop

**Three modes:**

```bash
# 1. Per-section files (recommended — feed each into pipeline remaster):
python3 scripts/workflows-external/assemble_chapter.py \
  --merged  "projects/Book/remastered/Merged/merged_ch1.json" \
  --src-dir "projects/Book/source/Chapter_1_Sections" \
  --output  "projects/Book/remastered/Chapter_1_Assembled_Sections" \
  --chapter 1 --mode sections

# 2. Per-section + chapter concat in one pass:
python3 scripts/workflows-external/assemble_chapter.py \
  --merged  "projects/Book/remastered/Merged/merged_ch1.json" \
  --src-dir "projects/Book/source/Chapter_1_Sections" \
  --output  "projects/Book/remastered/Chapter_1_Assembled_Sections" \
  --chapter 1 --mode sections --concat

# 3. After remastering all sections, stitch into chapter file:
python3 scripts/workflows-external/assemble_chapter.py \
  --src-dir "projects/Book/remastered/Chapter_1_Remastered_Sections" \
  --output  "projects/Book/remastered/Chapter_1_Remastered.md" \
  --chapter 1 --from-sections
```

Mode `--from-sections` picks up all `1.X_*.md` files from src-dir sorted numerically — no JSON needed. Use it after remastering to build the chapter-level file for number.py / html_gen.py.

Output filenames: `1.1_case_study_using_stents.md`, `1.2_data_basics.md` etc. — section number prefix + slugified title.

### split_chapter_sections.py

Alternative: split an already-assembled monolithic chapter .md back into per-section files. Uses the merged JSON for split-point detection (keyword match on first occurrence of each X.Y section header).

```bash
python3 scripts/workflows-external/split_chapter_sections.py \
  --input   "projects/Book/remastered/Chapter_1_numbered.md" \
  --output  "projects/Book/remastered/Chapter_1_Sections" \
  --chapter 1 \
  --merged  "projects/Book/remastered/Merged/merged_ch1.json"
```

Without `--merged`, falls back to auto-detection (first non-fragment `# X.Y` header). Auto-detection is unreliable on assembled files that have noisy fragment headers — always pass `--merged` when available.

### Pitfalls

- **Fragment headers look like section headers**: After assembly, a file may have `# 1.1 Guided Practice 1.1` alongside `# 1.1 Case study...`. The assembler/splitter uses keyword matching against the JSON titles, not just regex, to find true section boundaries.
- **html_gen.py sends entire file to AI in one call**: Don't pass a 300k-char chapter file. Use per-section files (25–85k chars each) for html_gen.
- **number.py resets counters per `# X.Y` header**: If multiple fragments share the same section prefix (e.g. `# 1.1 Guided Practice` inside section 1.2), numbering scopes may reset unexpectedly. Use `--from-sections` chapter concat after numbering to avoid this.
- **Slug deduplication**: The `latest_file_for_index()` function picks highest `_vN` suffix — if a dir has both `_v3.md` and `_v4.md` for the same fragment, only `_v4` is used.

## Heading Normalization (normalize step — between remaster and number)

After remastering, the merged content from two source books has conflicting section numbering. The `normalize` step fixes:

- Duplicate subsection numbers (e.g. 1.4.2 appears twice in section 1.4)
- Cross-section content (e.g. "Section 1.14" reference in section 1.3)
- Repeated "Table of Contents" blocks, "Student Enhanced Edition" titles
- Double-numbered headings ("1.4 1.4.3" → "1.4.3")

This is now an **official pipeline step** (step 5, between remaster and number). Runs automatically via:

```bash
# Via pipeline
python3 scripts/workflows-external/pipeline.py --project "Introduction to Stats" --section "1.2" --steps normalize

# Standalone
python3 scripts/workflows-external/normalize_headings.py \
  --project "Introduction to Stats" --chapter 1 [--dry-run]
python3 scripts/workflows-external/normalize_headings.py \
  --dir "projects/Introduction to Stats/remastered/Chapter_1_Remastered" [--dry-run]
```

**Root cause**: Merge interleaves two source books with different section numbering schemes (e.g. AHSS 1.4 = "Observational Studies + Sampling" while OS 1.4 = "Experiments"). Supplemental blocks appended into a main section carry their original subsection numbers, creating duplicates.

**Fix at source**: `renumber_subsection_headings()` in `json_merge.py` runs inside `json_to_markdown()` during merge output. It walks each `## X.Y` section and renumbers all `###`/`####` headings sequentially, removes cross-section references, and resolves number conflicts. The remaster AI then reads clean numbered input from the start.

**Post-remaster normalize** (pipeline step 5) still runs as a safety net — the remaster AI can occasionally introduce heading artifacts that need cleanup. But the root cause is fixed at merge.

## Prerequisites
- bookSHelf project at `/mnt/c/Users/shuff57/Documents/GitHub/bookSHelf`
- Source content available in `projects/{project}/remastered/*_Sections/`
- AI provider configured (see Provider Config below)
- `scripts/workflows-external/lint_remaster.py` present (used as remaster gate)

## Provider Config

Priority order (first wins):
1. CLI flags: `--provider`, `--model`, `--api-key`, `--base-url`
2. Environment variables: `AI_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`, etc.
3. `.env` file in project root (auto-loaded)

Supported providers via `ai_client.py`:
- `openai` — OpenAI or any OpenAI-compatible endpoint
- `ollama` / `ollama-local` / `ollama-cloud`
- `gemini`
- `copilot` — GitHub Copilot (claude-sonnet-4.6); reads OAuth token automatically from `~/.hermes/auth.json`. Use `--provider copilot --model claude-sonnet-4.6`. ~2-5 sec/call vs ~6-7 min for GLM cloud. **Flaky on large sections** (1.4/1.5, 700+ lines) — attempt 1 gets server-side connection close, retries burn 45min. Use GLM for reliability.
- `ollama` + `glm-5.1:cloud` — **preferred for bookSHelf html step**. Slower (~15-30min/section) but never flakes on large inputs. Model string uses hyphen: `glm-5.1:cloud` (not `glm5.1:cloud`). Default Hermes model as of Apr 2026.
- Any unknown provider string — treated as OpenAI-compatible, reads `{PROVIDER}_BASE_URL`, `{PROVIDER}_API_KEY`, `{PROVIDER}_MODEL` from env

## Quick Start

```bash
cd /mnt/c/Users/shuff57/Documents/GitHub/bookSHelf

# Full pipeline, all steps
python3 scripts/workflows-external/pipeline.py \
  --project "Applied Finite Math" --section "5.3"

# Specific steps only
python3 scripts/workflows-external/pipeline.py \
  --project "Applied Finite Math" --section "5.3" \
  --steps "remaster,number,html"

# Start from a specific step (inclusive)
python3 scripts/workflows-external/pipeline.py \
  --project "Applied Finite Math" --section "5.3" \
  --from-step remaster

# Explicit provider
python3 scripts/workflows-external/pipeline.py \
  --project "Applied Finite Math" --section "5.3" \
  --provider ollama --model llama3.1 --base-url http://localhost:11434

# Dry run (no AI calls, validates paths and step order)
python3 scripts/workflows-external/pipeline.py \
  --project "Applied Finite Math" --section "5.3" \
  --dry-run
```

## All CLI Flags

| Flag | Description |
|------|-------------|
| `--project` | Project name (must match `projects/` subdirectory) |
| `--section` | Section ID, e.g. `5.3` |
| `--chapter` | Override chapter number (default: inferred from section) |
| `--steps` | Comma-separated steps to run (default: all 12) |
| `--from-step` | Start from this step inclusive |
| `--provider` | AI provider (overrides env) |
| `--model` | Model name (overrides env) |
| `--api-key` | API key (overrides env) |
| `--base-url` | API base URL (overrides env) |
| `--remaster-prompt` | Override path to remaster prompt file |
| `--solutions-prompt` | Override path to solutions prompt file |
| `--no-chunked` | Disable chunked mode for large sections |
| `--output-suffix` | Suffix appended before .md/.html on all outputs (e.g. `_v2`) — never overwrites originals, safe for comparison runs |
| `--dry-run` | Print steps without making any AI calls |

## Step Order and Weights

Steps run in this order. Progress bar is weighted by step cost:

| Step | Weight | Implementation |
|------|--------|----------------|
| scrape | 5% | subprocess: `scrape_concat.py` |
| merge | 10% | subprocess: `merge.py` |
| extract | 3% | inline: `extract_sections.py` — merged JSON → per-section markdown (handles `{"reference": "![](…)"}` images) |
| remaster | 25% | direct AIClient calls (**parallel** chunks, 4×) + lint gate + correction loop |
| remaster-teach | 20% | teach edition: condenses student remaster (parallel chunks, 4×) |
| number | 5% | subprocess: `number.py` |
| solutions | 20% | direct AIClient call per Problem Set block (runs in parallel with `youtube`) |
| youtube | 5% | inline AIClient call → `_video_queries.json` |
| math | 10% | subprocess: `math_verify.py` (**parallel** AI batches, 4×) |
| html | 10% | subprocess: `html_gen.py` (**parallel** chunks, 4×, env `HTML_CHUNK_PARALLELISM`) |
| fixup | 5% | inline lint: markdown-heading divs, chunk markers, duplicate IDs, problem renumber (A4), post-PS example reorder (A5), teach-mode body class + subtitle injection |
| stitch | 4% | subprocess: `stitch_chapter_html.py` (no AI — body concat) |
| publish | 6% | subprocess: `publish.py` — images go to shared `docs/images/`; src paths prefixed `../images/` (student) or `../../images/` (teach) |

## JSON Progress Stream

Every line to stdout is a JSON object. Electron app reads these via `pipeline:progress` IPC events.

```json
{"phase": "remaster", "progress": 14, "message": "Calling openai/gpt-4o (375 lines)...", "is_running": true}
{"phase": "remaster", "progress": 20, "message": "Lint score 62/100 — FAIL (try_it_now). Retrying...", "is_running": true, "lint_score": 62}
{"phase": "remaster", "progress": 22, "message": "After correction: 88/100 PASS", "is_running": true, "lint_score": 88}
{"phase": "Complete", "progress": 100, "message": "Pipeline complete: 3 steps | section 5.3", "is_running": false, "result": {...}}
{"phase": "Error", "progress": 0, "message": "Step 'remaster' raised: ...", "is_running": false, "error": "...", "step": "remaster"}
```

## Electron Integration

```js
// main.js — pipeline:run IPC handler spawns pipeline.py, parses JSON, emits pipeline:progress
// preload.js — exposes:
window.electronAPI.runPipeline({
  project: "Applied Finite Math",
  section: "5.3",
  steps: "remaster,number,html",   // optional
  provider: "openai",              // optional, overrides env
  model: "gpt-4o",                 // optional
  dryRun: false,
});

window.electronAPI.onPipelineProgress((update) => {
  // update = { phase, progress, message, is_running, lint_score?, result? }
});
```

Legacy `window.electronAPI.executePipelineStep()` still works for agent-CLI invocation (kept for backward compat).

## Remaster Step Detail

The remaster step has the most logic:
1. Load source file, count lines
2. Choose monolithic (<300 lines) or chunked (≥300 lines) mode
3. Call `AIClient.generate(prompt, source, temperature=0.3)`
4. Write output to `{section_slug}_Remastered.md`
5. Run `lint_remaster.py` — if score < 75 (FAIL):
   - Build correction prompt from failing rule details
   - Call AI again with `temperature=0.2`
   - Re-lint — emit score regardless of pass/fail
6. Emit `lint_score` and `lint_passed` on the final progress event

Chunked mode: splits on section headers, calls AI per chunk, merges. Falls back to monolithic if no split points found.

## Path Discovery

`ProjectContext` auto-discovers actual directory names by scanning `projects/{project}/remastered/`.
Two layouts are supported:

**Layout A** (Applied Finite Math):
```
remastered/
  AppliedFiniteMath_Sections/          ← source (has _Sections, not _Remastered)
  AppliedFiniteMath_Sections_Remastered/  ← remastered + numbered + solutions
```
- Source files named: `1.1 Section Title.md` (space separator)
- Remastered/Numbered/Solutions: `1.1 Section Title_Remastered.md`, `..._Numbered.md`, etc.

**Layout B** (Introduction to Stats):
```
remastered/
  Chapter_1_Numbered/     ← source + numbered (used as pipeline input)
  Chapter_1_Remastered/   ← remastered (from prior AI pass)
  Chapter_1_Assembled/    ← per-section assembled .md files
```
- Source files named: `1.1_section_title.md` (underscore separator)
- `_find_chapter_dir()` matches `Chapter_{N}_{suffix}` exactly

Discovery priority:
- Source dir: `_Sections` (Layout A) → `Chapter_N_Numbered` → `Chapter_N_Remastered`
- Remastered dir: `_Remastered` (Layout A) → `Chapter_N_Remastered`
- `_numbered_dir`: `Chapter_N_Numbered` if present; controls which file path patterns are used

When `_numbered_dir` is set (Layout B), numbered/solutions/mathverify files live in `_numbered_dir/`, not `_Remastered/`.
`_find_source()` matches both `section_id + " "` (Layout A) and `section_id + "_"` (Layout B).

**Running pipeline end-to-end on Layout B project:**
```bash
python3 scripts/workflows-external/pipeline.py \
  --project "Introduction to Stats" --section "1.2" \
  --provider ollama --model glm-5.1:cloud
# scrape/match/merge auto-skip (source_files/ present but step scripts may not apply)
# remaster/number/solutions/math/youtube/html/stitch/verify/publish all run
# use GLM (glm-5.1:cloud) — copilot flakes on 1.4/1.5 large sections
```

**Clean Layout B project structure (pipeline outputs only):**
```
Introduction to Stats/
  source_files/ahss/ + os/       — PDFs + scraped content (scrape step input)
  remastered/
    Chapter_1_Remastered/        — canonical: 1.1_*.md … 1.5_*.md ONLY (5 files)
  html/
    1.1_*.html … 1.5_*.html      — per-section HTMLs (html step)
    Chapter_1_assembled.html     — stitched chapter (stitch step)
    images/                      — images (scrape step)
```

**Remove these legacy dirs/files:**
- `remastered/Chapter_1_Assembled/` — superseded by assembled HTML
- `remastered/Chapter_1_Numbered/` — files now live in Chapter_1_Remastered/
- `remastered/Chapter_1_Merged_v*_Sections_Remastered/` — versioned intermediates
- `remastered/Chapter_1_Remastered/*_chunks/` — remaster working dirs
- `remastered/Chapter_1_Remastered/Chapter_1_Remastered.md` — concat MD, replaced by assembled HTML
- `merge/` — all intermediates (keep only if scrape/match/merge steps will re-run)
- `source/` — full source MD/JSON reference, superseded by source_files/
- `html/front_matter.html` — not generated by any pipeline step

## Prompt Files

| Prompt | Path | Purpose |
|--------|------|---------|
| remaster | `prompts/remaster-chapter.md` | Main remaster instructions (184 lines, GOOD version) |
| solutions | `prompts/solutions.md` | Solutions generation (fallback inline prompt if missing) |
| html | `scripts/workflows-external/prompts/create-html-body.md` | HTML conversion |

**Critical:** Always use `prompts/remaster-chapter.md` (project root), NOT `scripts/workflows-external/prompts/remaster-chapter.md` (weak 147-line version). Pass `--remaster-prompt prompts/remaster-chapter.md` explicitly if in doubt.

HTML prompt: `scripts/workflows-external/prompts/create-html-body.md` (body fragment, CORRECT for pipeline) vs `prompts/create-static-html.md` (slideshow/full-page, WRONG — generates scroll-snap slideshow not bookSHelf format). `step_html` must NOT pass `--prompt` at all — html_gen.py defaults to `create-html-body.md` + `build_template_from_partials` which is correct.

## Lint Gate

The linter (`scripts/workflows-external/lint_remaster.py`) runs automatically after remaster:
- Threshold: 75/100 to pass
- 7 rules: try_it_now (25pt), source_attribution (20pt), math_delimiters (15pt), context_pauses (10pt), insight_notes (10pt), header_format (10pt), no_premature_solutions (10pt)
- Auto-detects if solutions pipeline already ran (skips premature-solutions check)

Run manually:
```bash
python3 scripts/workflows-external/lint_remaster.py \
  --input "projects/.../Section_Remastered.md" \
  --source "projects/.../Section.md"
# Add --json for machine-readable output
```

## Optimize Prompt (When Many Sections Fail)

If multiple sections fail lint with the same rules, run the optimizer instead of manual fixes:
```bash
python3 scripts/workflows-external/optimize_prompt.py \
  --prompt prompts/remaster-chapter.md \
  --target 95 --iterations 6
```
Runs remaster → lint → critic-AI-patch → repeat. Saves checkpoints per iteration to `prompts/optimization_runs/`. Locks winner to both prompt locations.

## Error Handling

| Problem | Action |
|---------|--------|
| Source file not found | Check `projects/{project}/remastered/` dir names — use `_find_dir` logic |
| AI returns empty/short response | Pipeline logs it and continues (doesn't crash) |
| Step script not found | Auto-skips with `success: True, skipped: True` |
| Lint fails after correction | Pipeline continues, emits lint_score — doesn't block |
| subprocess step fails (non-zero exit) | Pipeline stops, emits Error JSON |

## Step Optimization Status

| Step | Status | Notes |
|------|--------|-------|
| scrape | optimized | |
| match | optimized | |
| merge | optimized | |
| remaster | optimized | lint gate, correction loop, chunked mode, prompt optimizer |
| number | optimized | see number.py edge cases below |
| solutions | optimized | idempotency guard, problem counter, lint gate, correction loop, bad-output hard-fail (hard: skip write; soft: write partial), separate _Solutions.md output, reverse-order insertion, progress ascending during reversed iter, full-file idempotency via solutions_file mtime (commits 7be21c9, 7497837) |
| math | optimized | math_verify.py: deterministic LaTeX pre-checks + AI review + lint gate + correction loop + idempotency (mtime) + input fallback chain (solutions > numbered > remastered). Report: _MathVerify.md. (commit 382966d) |
| youtube | optimized | AI query gen, idempotency, lint gate, correction loop, broken CLI fixed, --video-queries wired to html step (commit f718cc4) |
| html | optimized | idempotency, input chain (solutions>numbered>remastered), correct prompt (NO --prompt flag — html_gen defaults to create-html-body.md + build_template), _lint_html gate, two lint false-positive bugs fixed (<html check + <details\b count), subprocess timeout 1800s, --video-queries wired (commits d04fb94, 2c78b6e, b9d6906) |
| stitch | optimized | discovers section HTMLs by glob, idempotent (mtime), runs stitch_chapter_html.py, skips if assembled newer than all sections (commit 43f7986). Now demotes headings h1→h2, h2→h3 etc. and adds chapter-level h1 title. |
| verify | optimized | 7-phase _verify_html, hard-fail (polyfill.io, bare <details>, missing <body>, short, placeholders), soft-warn (structure/nav/content classes/math), .verify_ok stamp, idempotency by stamp mtime (commit 353a894) |
| publish | optimized | script-exists check, idempotency (dest mtime >= src mtime), verify-stamp gate warns if stamp absent (commit 353a894) |

## number.py — Known Element Patterns

The remaster step produces several variants that number.py must handle:

| Pattern | Form | Example |
|---------|------|---------|
| Example | `### Example 1.1` | heading, standard |
| Try It Now | `### Try It Now 1.1` | heading, standard |
| Try It Now | `**Try It Now — Title**` | bold text (no heading) — also `**Try It Now 1.1 — Title**` |
| Definition | `**Definition 1.1: Title**` | bold, colon-separated |
| Problem Set | `## Problem Set` or `### Problem Set` | may appear 2–5× in one section (continuation blocks) |
| TOC | `## Table of Contents` | h2 heading |
| TOC | `# Table of Contents` | h1 heading (some sections) |
| TOC | `**Table of Contents**` | bold text, no heading (some sections) |

Key behaviors (as of fix commit 62c902e):
- Bold Try It Now is converted to `### Try It Now X.Y.N` automatically
- Multiple Problem Set blocks in same section: first gets numbered, rest reuse same number
- TOC is preserved as-is; only bare `Problem Set` links are updated to `Problem Set X.Y`
- All outputs are idempotent (run twice = identical result)

## YouTube Step Detail

`step_youtube` runs inline (no subprocess). Generates YouTube search query JSON using AI.

1. **Idempotency**: if `html/<section_id>_video_queries.json` exists and is valid JSON, skip entirely. Corrupt file triggers regeneration.
2. **Input fallback**: solutions_file > numbered_file > remastered_file.
3. **Topic extraction** (`_extract_topics_for_youtube`): parses H2/H3 headers, filters excluded headers (TOC, Problem Set, Summary, Exercises, Review, bare Example/Definition numbering). Caps at 12 topics.
4. **AI call**: uses `prompts/youtube-queries.md`. `temperature=0.2`. Returns JSON with `queries` array.
5. **Lint gate**: strips markdown fences, validates JSON, checks `queries` is non-empty list, each item has `query` + `label` keys.
6. **Correction loop**: retry once with structured fix prompt on lint fail.
7. **Subject inference**: project name → "finite math" / "calculus" / "algebra" / normalized string.
8. Output: `ctx.video_queries_file` = `html/<section_id>_video_queries.json`.
9. **`step_html` wired**: now passes `--video-queries <file>` to html_gen.py when file exists (was never connected before this fix).

`ProjectContext` additions:
- `video_queries_file = html_dir / f"{section_id}_video_queries.json"`

### Pitfalls specific to youtube step

| Pitfall | Fix |
|---------|-----|
| youtube_lookup.py had no CLI — `--input` arg was silently ignored | Replaced with inline step_youtube; youtube_lookup.py kept but not called |
| step_html never passed --video-queries to html_gen | Fixed: step_html now checks ctx.video_queries_file.exists() and appends flag |
| AI often wraps JSON in markdown fences | _lint_queries strips ````json ... ```` before json.loads() |
| Some AI responses have empty queries list | Hard-fail: require len(queries) >= 1 |

## Math Step Detail

`math_verify.py` runs as a subprocess (step 7). Input selection: `solutions_file` if exists, else `numbered_file`, else `remastered_file`.

1. **Deterministic pre-checks**: LaTeX delimiter balance — unclosed `$$` blocks, odd inline `$` count per paragraph. Results injected into AI prompt context.
2. **Content statistics**: count display math, inline math, definitions, examples, solution blocks — also injected into prompt.
3. **Idempotency**: if `_MathVerify.md` exists and is newer than input (mtime check), skip entirely and return cached assessment.
4. **AI review**: uses `prompts/math-accuracy.md`. `temperature=0.1`.
5. **Lint gate**: report must contain `Overall Assessment:` line + `Executive Summary` section.
6. **Correction loop**: retry once with structured fix request if lint fails.
7. Output: `_MathVerify.md` beside input file.

`pipeline.py` additions:
- `ProjectContext.math_verify_file` attribute
- `SUBPROCESS_STEPS["math"]` uses `{solutions_file_or_numbered}` placeholder
- `run_subprocess_step` expands it via solutions > numbered > remastered fallback

## Solutions Step Detail

The solutions step generates worked solutions for every Problem Set block:

1. Load numbered (or remastered) file, extract all `### Problem Set` blocks via `_extract_problem_sets()`
2. **Process blocks in REVERSE order** — each insertion shifts line indices; processing last-to-first keeps all prior indices valid
3. **Idempotency guard**: if `<!-- Solutions -->` is already in the block text, skip it. After insertion the solutions become part of the block, so this check works on subsequent runs.
4. **Problem counter** (`_count_problems`): uses `re.findall()` on the full block text (not per-line) because multiple `<td>N)` entries can appear on one line in HTML table format. Falls back to bare `N)` line-start pattern for Chapter Review sections.
5. Call `AIClient.generate(prompt, ps_text, temperature=0.1)`
6. **Lint gate** (`_lint_solutions`): checks `<details>` count == expected, all have valid `<summary>Problem N Solution</summary>`, no unclosed tags
7. **Correction loop**: if lint fails, retry once with failure context appended to prompt
8. Splice insertion into `output_lines` list by splitting on `\n` and using `list.insert()` — do NOT append to the string then re-split, and do NOT track an offset accumulator (both approaches fail with multi-block sections)

### Pitfalls specific to solutions step

| Pitfall | Fix |
|---------|-----|
| Processing PS blocks forward with an offset accumulator | Offset only tracks the `\n` count in the insertion string — `output_lines` list size doesn't change until after the loop. Use **reverse order** instead. |
| `sum(1 for ln in lines if td_rx.search(ln))` for problem count | HTML tables often put 2+ `<td>N)` entries on one line. Use `td_rx.findall(ps_text)` on the full text. |
| Checking sentinel in lines after `end_line` | After insertion the solutions are INSIDE the block (block ends at the last `</details>`). Check `"<!-- Solutions -->" in ps_text` instead. |
| `insertion.count("\n")` as offset for list growth | The list doesn't grow — the insertion is embedded in one string element. Use `list.insert()` per line after splitting on `\n`. |

### Auditing a deterministic pipeline step

When asked to optimize a non-AI pipeline step (number, verify, etc.):
1. Read the script fully to understand its regex patterns and logic
2. Run it on all available real remastered sections: `for f in projects/.../Sections_Remastered/1.*.md`
3. Check element counts: source vs output should match (`grep -c "^### Example"`)
4. Check idempotency: run output through same script again, `diff` should be empty
5. Spot-check TOC, first/last elements, and any section with unusual structure (multi-problem-set, bold Try It Now, etc.)
6. Fix one issue at a time, re-run full suite after each fix
7. Commit with detailed message listing each bug fixed + verification method

## HTML Step Detail

`step_html` calls `html_gen.py` as a subprocess (step 9). Input selection: solutions > numbered > remastered.

1. **Idempotency**: if `ctx.html_file` already exists, skip entirely (size logged).
2. **Prompt**: do NOT pass `--prompt` to html_gen.py. Its default is `scripts/workflows-external/prompts/create-html-body.md` + `build_template_from_partials` → correct bookSHelf format. Passing `--prompt prompts/create-static-html.md` produces a scroll-snap slideshow embedded inside the bookSHelf template wrapper, creating double-`<body>` / double-`<!DOCTYPE>` garbage.
3. **Subprocess timeout**: large sections (700–2000 lines of markdown) take 15–25 min. Timeout must be ≥1800s. Default was 900s — caused silent timeout failures where html_gen.py succeeded but pipeline wrapper killed it.
4. **Video queries**: if `ctx.video_queries_file` exists, passes `--video-queries` to html_gen.py (written by step_youtube).
5. **`html_gen.py` lint gate** (`_lint_body`): validates AI body output — checks length ≥100, `<html>` tag if prompt requests full page, balanced `<details>` blocks. Two known false-positive bugs (fixed in `b9d6906`):
   - `<html` check: `create-html-body.md` contains the text `<html>` in a "DO NOT include" instruction — triggers false "Prompt requests full HTML" fail. Fix: also check `"DO NOT include" not in prompt and "Body Fragment" not in prompt`.
   - `<details>` count: used `body.count("<details>")` (exact) — misses `<details class="solution">`. Fix: use `re.findall(r'<details\b', body)` (prefix match).
6. Correction loop retries once on lint fail — but correction call re-sends full prompt + full markdown input. For large sections (1000+ lines), this exceeds token limits and always times out. After correction timeout, html_gen.py falls through and uses original output (line 271).
7. **`step_html` post-lint** (`_lint_html`): after subprocess exits 0, reads the written file and checks `<html>`, `<body>`, `</html>`, no unfilled `{content}`/`{title}` placeholders, length ≥100. Hard-fail deletes the bad file; soft warnings are logged but file kept.

`ProjectContext` additions:
- `video_queries_file = html_dir / f"{section_id}_video_queries.json"`

### Pitfalls specific to html step

| Pitfall | Fix |
|---------|-----|
| html_gen.py default prompt is a body fragment | Always pass `--prompt prompts/create-static-html.md` via step_html |
| AI wraps HTML in markdown fences | `_lint_body` doesn't strip fences — but `_lint_html` post-lint will catch `<html>` missing |
| Template placeholders not filled | `_lint_html` checks for `{content}` or `{title}` in output — hard-fail |
| html_gen.py exits 0 but never writes file | `step_html` explicitly checks `ctx.html_file.exists()` after subprocess |

## Pitfalls

| Pitfall | Fix |
|---------|-----|
| Assumed dir names don't match reality | ProjectContext scans actual dirs — don't construct paths from project name |
| `git status` hangs on WSL2+NTFS | Use `git log` or `git diff` instead |
| Chunked remaster used to bail out saying "Claude must intervene" | Old `remaster_chunked.py` design — `pipeline.py` handles chunking natively now |
| `detect_split_level()` returns int, not tuple | Fixed in pipeline.py — don't unpack as `level, _ = detect_split_level(...)` |
| `find_split_points()` returns `list[dict]` with `"line"` key, not tuple | Fixed: use `sp["line"]` not `sp[0]` when iterating split points |
| `lines` not defined in `_remaster_chunked` | Fixed: `lines = source_text.splitlines(keepends=True)` must be inside `_remaster_chunked`, not inherited from caller |
| Solutions step writes to wrong file | Must write to `ctx.solutions_file` (`_Solutions.md`), not overwrite the numbered file in place |
| html_gen.py uses wrong prompt | Default is `scripts/workflows-external/prompts/create-html-body.md` (body fragment) + `build_template_from_partials` → CORRECT bookSHelf format. Do NOT pass `--prompt prompts/create-static-html.md` — that generates a scroll-snap slideshow which gets embedded inside the template, producing double-`<!DOCTYPE>`/double-`<body>` garbage. |
| html_gen.py `<details>` lint false positive | `body.count("<details>")` misses `<details class="solution">`. Use `re.findall(r'<details\b', body)`. Fixed `b9d6906`. |
| html_gen.py `<html>` lint false positive | `create-html-body.md` contains `<html>` in a "DO NOT include" instruction. Lint fired even on correct body-fragment output. Fix: check `"DO NOT include" not in prompt`. Fixed `c9f9ac7`. |
| subprocess timeout | Large sections (700–2000 lines MD) take 15–25 min. Default 900s too short — pipeline silently killed html_gen.py after it finished. Use 1800s. Fixed `2c78b6e`. |
| Correction call timeout on large sections | Correction re-sends full prompt + full markdown — exceeds token limit for 1000+ line inputs. html_gen.py falls through to original output on correction timeout (line 271) — this is correct behavior, don't change it. |
| html_gen.py writes garbage on AI failure | No lint gate in original. Added `_lint_html` in pipeline post-subprocess (hard-fail deletes bad file) and `_lint_body` inside html_gen.py before assembly (correction loop). |
| html step re-runs AI on every pipeline run | No idempotency. Now: if `ctx.html_file.exists()` skip entirely. |
| step_html forced `--provider openai` when no provider set | Dropped the `or os.getenv("AI_PROVIDER", "openai")` fallback — only pass `--provider` when explicitly set. |
| Lint hard-fail still writes output | If lint fails twice AND `actual_count == 0`, skip write entirely. If `actual_count > 0` but wrong count (soft fail), write anyway — partial solutions are better than none. |
| Progress goes backwards during reversed iteration | Use `(total - 1 - i) / total` not `i / total` so progress ascends 0→100% as blocks are processed in reverse index order. |
| Idempotency check after insertion looks past block | After solutions are inserted, they become part of the PS block text. Check `"<!-- Solutions -->" in ps_text`, NOT `output_lines[end_line+1:end_line+4]`. |
| pipeline:execute still calls claude CLI | That's the LEGACY handler — use `pipeline:run` for the new AI-agnostic path |
| patch tool mangles regex strings in Python files | Use write_file to rewrite the entire script — patch tool double-escapes backslashes inside re.compile() strings |
| Copilot flakes on attempt 1 repeatedly across multiple runs | Rate limiting or server-side close — not a local timeout issue. Switch to GLM: `--provider ollama --model glm-5.1:cloud` (note hyphen, not dot). Run sequentially: `html_gen.py ... 1.4 && sleep 30 && html_gen.py ... 1.5`. GLM is slower but reliable for large sections. |
| AI provider silently falls back to `openai` | `AIClient.from_args()` didn't accept `task_type` → TypeError → catch-all `from_env()` → hardcoded `"openai"` default → ImportError. Fix: (1) `from_args` now accepts `task_type`; (2) `from_env` and `create_client` no longer default to `"openai"` — they require `AI_PROVIDER` env or `.env`; (3) `from_args(None)` falls back to env vars before raising `ValueError`; (4) pipeline `make_client()` reads `.env` before creating client; (5) `.env` file with `AI_PROVIDER=ollama` and `AI_MODEL=glm-5.1:cloud` is the canonical config. |
| `DEFAULT_TIMEOUT=300` too short for cloud models | Cloud GLM can take 10-15 min for large sections. Fix: `DEFAULT_TIMEOUT=900` (15 min). Also `AI_TIMEOUT=1800` in `.env` for pipeline-wide override. |
| 5 sections run in parallel overwhelm GLM endpoint | Run one section at a time: `for s in 1.1 1.2 1.3 1.4 1.5; do pipeline.py --section $s ...; done`. Sequential avoids timeout/rate-limit errors. |
| Stale background job notifications after killing | Killed procs report exit 143 (SIGTERM) via system notifications — ignore them. Always confirm active job by session_id (proc_XXXXX) not by command string. |
| Chapter HTML assembly | `stitch` is now step 10 in ALL_STEPS (between `html` and `verify`). Runs `stitch_chapter_html.py` — no AI, pure body concat. Idempotent via mtime. Run: `--steps stitch` or included automatically in full pipeline. |
| `--steps all` is invalid | Omit `--steps` entirely to run all steps. `--steps all` raises \"Unknown steps: ['all']\". |
| Chapter_1_assembled.html has stale section after section HTML replaced | Stitch step is idempotent by mtime — if assembled is newer than all section HTMLs it skips. After replacing a section HTML, delete assembled or `touch` the section HTML to force re-stitch. |
| Navbar shows "1.1 1.1 Case study..." (duplicate section number) | Fixed (commit dc70f93). `section_label()` now detects if title already contains section number. Cause: `extract_section_title()` returns "1.1 Case study..." and `section_label()` prepends "1.1 " again |
| Element IDs have "section-section-1-1--..." (double section- prefix) | Fixed (commit dc70f93). `reanchor_ids()` now receives number prefix ("1-1") not full anchor id ("section-1-1"). Cause: `section_anchor_id()` returns "section-1-1" but `reanchor_ids()` hardcodes "section-" prefix |
| GLM model name typo | Must be `glm-5.1:cloud` (hyphen). `glm5.1:cloud` (no hyphen) returns 404. |
| Layout B `remastered_file` resolves to wrong dir | Fixed (commit `eb1ca35`). `_find_chapter_dir()` now takes priority over `_find_dir()` for remastered_dir, so `Chapter_1_Remastered/` wins over `Chapter_1_Merged_v3_Sections_Remastered/`. `_numbered_dir` falls back to `remastered_dir` when no `Chapter_N_Numbered/` dir exists. All 5 Layout B paths resolve correctly. |
| Legacy `Chapter_1_Numbered/` dir deleted during cleanup | `_numbered_dir` falls back to `remastered_dir` — so deleting `Chapter_1_Numbered/` is safe as long as the numbered files live in `Chapter_1_Remastered/`. |
| Multiple legacy versioned dirs in remastered/ (e.g. `Chapter_1_Merged_v3_Sections_Remastered`) | Clean project by removing all legacy dirs. Keep only: `Chapter_1_Remastered/` (canonical), `Chapter_8_*/` (untouched). Remove intermediates: `Chapter_1_Assembled/`, `Chapter_1_Numbered/`, `*_Merged_v[N]_*`. |
