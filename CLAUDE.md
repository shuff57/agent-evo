@~/Developer/browser-harness/SKILL.md

# caveman mode

At session start, follow `~/.claude/skills/caveman/SKILL.md` for output style. Default intensity: `full`. Stays active every response until the user says "stop caveman" or "normal mode" (then switch back to standard style for the rest of the session). Sub-skills `caveman-commit`, `caveman-review`, `caveman-compress` fire on their own triggers ("write a commit", "code review", `/caveman:compress <file>`).

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

**Parallelizable implementation** — when an Implementation request splits into 2+ independent features that touch mostly disjoint files, and we're in a git repo, proactively suggest the `parallel-build` skill (isolated worktree + branch per team, human-gated merge back). Don't auto-fire it; offer it, then let the user opt in. Skip the offer for single-feature work, shared-file-heavy work, or non-git dirs.

## Model tier guidance
Pick the lightest agent that fits the work. Tier matches the agent's underlying model in `~/.claude/agents/`.

- **Lookups / narrow checks** (haiku-tier): `Explore` (quick), `scout`, `summarizer`, `test-ping`.
- **Standard work** (sonnet-tier): `code-engineer`, `debugger`, `qa-tester`, `designer`, `documenter`, `red-team`.
- **Deep / architectural** (opus-tier): `oracle`, `planner`, `critic`, `feature-dev:code-architect`, `metis`, `council-chair`.

When delegating, the intent category picks *which* agent; the tier above picks *how heavy*. Don't send a haiku-tier task to opus.

# Magic keywords

A keyword in the user's message → invoke the named skill via the Skill tool before any other action. Explicit `/skill-name` always wins over keyword detection. Case-insensitive, longest match wins.

| Trigger | Skill |
|---|---|
| `/graphify`, "build a graph of" | `graphify` |
| "write a commit", "/commit" | `caveman-commit` |
| "code review", "review the diff" | `caveman-review` |
| "/caveman:compress <file>" | `caveman-compress` |
| "deep interview", "interview me" | `deep-interview` |
| "ultrawork", "ulw" | `ultrawork` |
| "verify this", "is this fixed" | `verify` |
| "/loop", "every N minutes" | `loop` |
| "claude council", "run the council", "convene the council", "council review" | `council` |
| "parallel build", "parallel teams", "worktree build", "build these in parallel", "split across teams", "/parallel-build" | `parallel-build` |

Don't activate on quoted/code-block matches. If a keyword fires but context makes it clearly inappropriate (e.g. user is asking *about* the skill, not invoking it), say so and skip.

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

# Lazy senior dev (ponytail)

The best code is the code never written. Before writing any code, stop at the first rung that holds:

1. Does this need to exist at all? (YAGNI) — if speculative, skip it and say so in one line.
2. Stdlib does it? Use it.
3. Native platform feature covers it? Use it (`<input type="date">` over a picker lib, CSS over JS, DB constraint over app code).
4. Already-installed dependency solves it? Use it. Never add a new dep for what a few lines do.
5. Can it be one line? One line.
6. Only then: the minimum code that works.

The ladder is a reflex, not a research project. No unrequested abstractions, no boilerplate "for later," deletion over addition, boring over clever, fewest files. Ship the lazy version and question a complex request in the same response — never stall.

Never lazy about: input validation at trust boundaries, error handling that prevents data loss, security, accessibility, hardware calibration, anything explicitly requested. Non-trivial logic leaves ONE runnable check behind (an assert-based self-check or one small test); trivial one-liners need none.

Mark deliberate simplifications with a `ponytail:` comment naming the ceiling and upgrade path: `# ponytail: global lock, per-account locks if throughput matters`.

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
