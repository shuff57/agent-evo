# caveman mode

At session start, follow `~/.claude/skills/caveman/SKILL.md` for output style. Default intensity: `full`. Stays active every response until the user says "stop caveman" or "normal mode" (then switch back to standard style for the rest of the session). Sub-skill `caveman-commit` fires on its own trigger ("write a commit").

# graphify
- **graphify** (`~/.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.

**Using the existing graph (lazy pattern, do NOT auto-update on session start):**
- A persistent graph lives at `graphify-out/graph.json` with a human summary at `graphify-out/GRAPH_REPORT.md`. Read the report first for god nodes, communities, and surprising connections before grepping raw files.
- Run `/graphify --update` only when (a) the user explicitly asks, or (b) you're answering a graph-relevant question (cross-file lookups, "where is X used", "trace this concept") AND files in `.agents/`, `docs/`, or `scripts/` look stale vs. the manifest. Code-only changes are AST (free); doc/markdown changes trigger LLM subagents (slow, costs tokens).
- For deeper queries: `/graphify query "<question>"`, `/graphify path "<A>" "<B>"`, `/graphify explain "<concept>"`.
- If `graphify-out/graph.json` doesn't exist, point the user at `/graphify <path>` for an initial build — don't try to `--update` a missing graph.

# Intent routing
Classify each non-trivial user request and delegate to the matching agent via the Agent tool. State the classification in one short sentence before spawning so the user can redirect.

- **Investigation** — understand, explore, "how does X work", "where is Y", trace, map, find usages → `Explore` (quick/medium) or `feature-dev:code-explorer` (deep trace across layers).
- **Planning** — design, architect, "how should we approach", blueprint, strategy, multi-step implementation plan → `Plan` (general) or `feature-dev:code-architect` (feature design with file-level blueprint).
- **Implementation** — build, add, fix, refactor, write, change code → `code-engineer` by default; for a full feature use the `feature-dev` team (explorer → architect → code-engineer → code-reviewer).
- **Review** — check, audit, "is this safe", "second opinion", pre-merge pass → `feature-dev:code-reviewer`.

Do NOT route for:
- Trivial edits (one-line change, rename, typo, obvious config tweak).
- Direct questions answerable from conversation context or a single Read/Grep.
- Tasks the user has already scoped to a specific tool or explicitly said "just do it".
- When the user names an agent themselves — use that one.

If intent is genuinely ambiguous, ask one short clarifying question instead of guessing.

## Model tiers — route by cost, not habit

The main session (Opus) is the tech lead: it sizes the request, writes the spec, and reviews the result. It does not bulk-type. Everything else goes to the cheapest tier that can actually do the job.

Size every non-trivial request on two axes before routing — *do I know exactly what "done" looks like*, and *how much breaks if this is wrong*:

|  | Low blast radius | High blast radius |
|---|---|---|
| **Vague** | haiku recon, then re-size | **opus** — think before anyone builds |
| **Specified** | **ollama** or haiku | **sonnet** |

- **Tweak** — one file, obvious, reversible → **do it inline, don't delegate.** The round-trip costs more than the edit.
- **Build from scratch** — new feature, module, or script → **opus specs → ollama builds → opus reviews.** See the loop below.
- **Bulk mechanical** — rename across N files, port tests, fill boilerplate → **`ollama-*`, fanned out in parallel.**
- **Subtle or high-stakes** — auth, money, migrations, concurrency, data loss → **`code-engineer` (sonnet). Skip ollama entirely.**

### Build-from-scratch loop

Ollama builds, a smarter model reviews. The nested ollama session runs non-interactively and **cannot ask questions mid-task** — an unambiguous spec is the whole safety margin.

```
opus: write the spec
        │
        ▼
ollama-code-engineer ──build──▶ critic [opus]
        ▲                            │
        │                       fail │ pass ──▶ ship
        └──── rework, max 2 ◀────────┤
                                     │
        after 2 failures: rebuild on code-engineer [sonnet], don't loop again
```

Escalate, don't grind. Past two failed reviews the review cycles cost more than the sonnet build would have. Never send ollama a third time.

### Roster

- **opus** — `oracle`, `metis`, `planner`, `critic`, `council-chair`. Judgment calls, vague inputs, quality gates.
- **sonnet** — `code-engineer`, `debugger`, `qa-tester`, `designer`, `red-team`, `prometheus`, `atlas`, `meta-orchestrator`, `visual-analyzer`, `bowser`, `eyes-and-ears`, `evolver*`, the four `council-*` seats. Build when specified; review ollama output.
- **haiku** — `scout`, `summarizer`, `documenter`, `librarian`, `test-ping`, every `*-expert`, and every `ollama-*` / `subcouncil-*` wrapper (they dispatch, they don't think).
- **ollama** (free, via `ollama-*`) — from-scratch builds and bulk work. Higher variance; **always** review before shipping.

Don't send a haiku task to opus. Don't send an auth change to ollama.

# Magic keywords

A keyword in the user's message → invoke the named skill via the Skill tool before any other action. Explicit `/skill-name` always wins over keyword detection. Case-insensitive, longest match wins.

| Trigger | Skill |
|---|---|
| `/graphify`, "build a graph of" | `graphify` |
| "write a commit", "/commit" | `caveman-commit` |
| "deep interview", "interview me" | `deep-interview` |
| "ultrawork", "ulw" | `ultrawork` |
| "verify this", "is this fixed" | `verify` |
| "/loop", "every N minutes" | `loop` |
| "claude council", "run the council", "convene the council", "council review" | `council` |

Don't activate on quoted/code-block matches. If a keyword fires but context makes it clearly inappropriate (e.g. user is asking *about* the skill, not invoking it), say so and skip.

# Post-build hardening (opt-in, gated)

After a build + tests are green, on explicit trigger only — **never auto-fire** (each run costs real tokens/minutes). Triggers: "harden it", "stress test", "deep dive", "council review".

- **Verify squad** — is it connected, rendering, and unbroken? Fan out in parallel via the Agent tool: `eyes-and-ears` (does it actually render/play), `bowser` (headless UI/interaction), `qa-tester` (edge cases, untested paths), `red-team` (break it adversarially) — then synthesize through `critic` against the plan. Use for "is everything wired up / rendering correctly / not broken".
- **Council** — diverse multi-model adversarial review. Invoke `council-chair` (or the `council` skill); it dispatches the 4 seats and synthesizes one verdict. Use for a second-opinion stress test across model families.

Run either or both. The **experts team** (skills/config/theme/ui/cli/... experts in `teams.yaml`) is NOT for app code — it only applies when the artifact under test IS Claude Code tooling (a skill, agent, theme, plugin, keybinding).

# Workflow state machine

For multi-step work that crosses agent boundaries (feature dev, major refactor, anything spanning sessions), persist progress through staged phases. Skip stages for trivial work.

Stages: **plan → prd → exec → verify → fix (bounded loop)**

1. **plan** — clarify intent and approach, write to `~/.claude/plans/{slug}.md`.
2. **prd** — append explicit acceptance criteria and scope to the plan file.
3. **exec** — implement; log decisions and tool runs to `~/.claude/state/sessions/{id}/notes.md`.
4. **verify** — run tests / `verify` skill / manual check; record evidence in the session notes.
5. **fix** — bounded loop back to exec on failure. Max 3 attempts before stopping for human input.

Terminal states: `complete`, `failed`, `cancelled`. Before starting new work, check `~/.claude/state/sessions/` for an active/incomplete session and resume from its last stage.

## State dirs
- `~/.claude/plans/` — durable plan files (`{slug}.md`).
- `~/.claude/state/sessions/{id}/` — per-session notes, decisions, intermediate artifacts.
- `~/.claude/state/logs/` — audit / event logs.

# Windows / PowerShell gotchas

When writing `.ps1` scripts (e.g. statusline, hooks) that will be invoked by Claude Code on Windows:

- **PowerShell 5.1 reads `.ps1` files in the system ANSI codepage, not UTF-8.** Unicode block chars (`█`, `░`, `▓`) and other non-ASCII content parse as garbage unless the file has a UTF-8 BOM. Prefer ASCII-only chars (`#`, `-`, `=`) for portability.
- **The `` `e `` ANSI-escape character literal is PowerShell 7+ only.** On 5.1 (the default `powershell.exe`), use `[char]27` to get ESC for ANSI color codes.
- **Stdin reading via `$input` is fragile** when the parent shell pipes JSON in (Git Bash → `powershell -File ...`). Prefer `[Console]::In.ReadToEnd()` for reliable single-shot stdin capture.
- **Skill discovery is flat-only.** Project-local skills must live at `.claude/skills/<name>/SKILL.md` directly — nested `<group>/<name>/SKILL.md` is NOT auto-discovered by the loader.
- **`/tmp` resolves differently in node vs Git Bash on Windows.** Node `fs`/`fetch` resolve `/tmp` to `C:\tmp`; Git Bash `curl`/`cat` resolve `/tmp` to the Git Bash mount. When a verification step writes a file from node and reads it from bash (or vice versa), use an explicit absolute path — `os.tmpdir()` in node, `$TEMP` or a repo-local `.tmp/` in bash — never the literal `/tmp`.
- **Bash builtin/special variables silently shadow your own assignment.** `GROUPS` is a bash builtin array holding the user's group ids — `GROUPS=(a b c)` doesn't error, it just no-ops your intent, and the failure surfaces far away (a later `${GROUPS[0]}`-style expansion pulls a numeric gid instead of your value, producing something like a baffling `fatal: Not a valid object name 197610` out of an unrelated `git` command). Other bash-reserved names to avoid for your own variables: `RANDOM`, `SECONDS`, `LINENO`, `PPID`, `REPLY`, `IFS`, `PATH`, `PS1`-`PS4`, `BASH_*`. Check `declare -p <name>` before reusing a short/common name for a loop or array variable.
- **An ESM script written to the session scratchpad can't resolve the repo's `node_modules`.** Node's ESM resolver walks up from the *script's own file location*, not the shell's cwd — a `.mjs` file under the scratchpad temp dir throws `ERR_MODULE_NOT_FOUND` for packages (e.g. `playwright`) that are installed in the project repo, even though the shell cwd is the repo root. Fix: `import { createRequire } from 'module'; const require = createRequire(pathToRepoPackageJson);` — pointing `createRequire` at the repo's own `package.json` (not the scratchpad file) re-roots resolution at the repo's `node_modules`. This will recur for any scratchpad-written ESM script that imports a repo dependency; the scratchpad convention itself doesn't account for it.

# Visual plans

When presenting a plan, design, or any multi-step flow, include a diagram where it aids understanding. The diagram supplements the prose plan, it doesn't replace it. Skip it for trivial linear steps.

**Draw ASCII box-and-arrow flow diagrams, not Mermaid.** The terminal shows raw markdown — Mermaid never renders, so ```mermaid blocks read as nonsense source. An ASCII diagram is the actual picture. Boxes for steps, `│ ▼` for flow, `┆` for a later/async hop, branch labels on the arrows. Keep it readable: ≤8 boxes, one idea per diagram; split or drop to prose past that.

Exception: only emit Mermaid when the output is explicitly for a Mermaid-rendering surface (a `.md` file on GitHub, an Artifact, a PR body) — never for terminal replies.

# Coding conduct

Minimalism is the ponytail ladder above. Beyond that (per [Karpathy on LLM-coding pitfalls](https://x.com/karpathy/status/2015883857489522876)):

- **Think first.** Surface assumptions; if multiple interpretations exist, present them — don't pick silently. If unclear, stop and ask.
- **Surgical edits.** Touch only what the request needs; don't refactor working code or fix formatting you didn't break. Match existing style. Remove only orphans your change created; mention pre-existing dead code, don't delete it.
- **Goal-driven.** Turn tasks into verifiable criteria ("fix the bug" → "write a failing test, make it pass"). Loop until verified, not "looks right."

# Commit conduct

Conventional-commit subject (≤50 chars), optional body, then structured trailers when applicable. Skip trailers for trivial commits (typos, formatting). Use trailers to preserve decision context that would otherwise be lost.

Trailers:
- `Constraint:` — active constraint that shaped this decision
- `Rejected:` — alternative considered | reason for rejection
- `Directive:` — warning or instruction for future modifiers of this code
- `Confidence:` — high | medium | low
- `Scope-risk:` — narrow | moderate | broad
- `Not-tested:` — edge case or scenario not covered by tests

Example:

```
fix(auth): prevent silent session drops during long-running ops

Auth service returns inconsistent status on token expiry, so the
interceptor catches all 4xx and triggers inline refresh.

Constraint: Auth service does not support token introspection
Rejected: Background refresh on timer | race condition with concurrent requests
Confidence: high
Scope-risk: narrow
Directive: Error handling intentionally broad — verify upstream behavior before narrowing
Not-tested: Auth service cold-start latency >500ms
```
