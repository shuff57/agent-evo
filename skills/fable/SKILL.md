---
name: fable
description: Orchestrate a non-trivial build as a bounded task graph. Plan and adjudicate in the main session (opus/sonnet), then fan implementation out to cheap workers — ollama-cloud/glm-5.3-flash for normal implementation, ollama-cloud/deepseek-v4.1-flash for loops, repeated iteration, and high-throughput mechanical work. Use when the user invokes $fable or asks for graph-style orchestration of a multi-part build.
---

# Fable orchestrator (local adaptation)

Adapted from codejunkie99/fable-orchestrator (MIT) for this box's actual model
stack. The original pins GPT-5.6 Luna and DeepSeek V4 Flash via Codex Router —
models this environment does not carry. The pattern is kept; the routes are
rewritten to the tiers that exist here. The orchestrator is the **main
session** (opus or sonnet per the tier table) — there is no separate
orchestrator model or agent, matching the roster decision of 2026-08-04.

## Invocation

Treat everything after `$fable` as the objective. The main session owns
orchestration decisions and final review. Implementation workers are restricted
to two callable routes:

- `$fable build the feature`
- `$fable port the test suite; implementer: deepseek-v4-flash`

Model names are requests, not guesses. Before dispatch, confirm the route is
callable: `ollama-cloud/glm-5.3-flash` and
`ollama-cloud/deepseek-v4.1-flash` (verify against
`opencode.json`/`opencode models` if in doubt). If a requested route is
unavailable, say so and substitute within these two only when low-risk;
otherwise ask for a replacement. Never invent a third route.

Apply this ordered classifier when the user did not explicitly choose a route:

- loop construction, repeated iteration, bulk mechanical work (rename across
  N files, port tests, fill boilerplate): `deepseek-v4.1-flash`
- all other implementation: `glm-5.3-flash`
- planning, research, review, and other work: stays in the main session or
  routes by the AGENTS.md tier table — never to an ollama worker.

An explicit implementation choice wins only when it is one of the two allowed
routes. After any applicable approval gate, state only
`<worker> — <model>: <bounded responsibility>`, then immediately start. Do
not show the full model catalog unless asked.

## Worker route contract

Both worker routes run through `opencode run` (the same lane the
`delegate-build` forwarder uses), non-interactive, so an unambiguous spec is
the whole safety margin. Dispatch shapes:

```
opencode run "<spec>" --auto -m ollama-cloud/glm-5.3-flash
opencode run "<spec>" --auto -m ollama-cloud/deepseek-v4.1-flash
```

For multi-worker or multi-round work, launch through the message center per
the AGENTS.md handoff section (`handoff.mjs` with `--model`, absolute spec
paths, claims released before authoring tasks), one lens per opencode
session, fanned out in parallel where the graph allows. Vision and audio
stay Anthropic-side — no ollama worker gets them (operator decision
2026-08-09). Cheap models may generate the numbers but never own the
pass/fail call on their own work; encode review criteria as checks the main
session owns.

## Workflow

1. Read the objective and relevant local instructions. Inspect enough of the
   workspace to give the plan facts rather than assumptions.
2. Build a compact orchestration packet: objective, acceptance criteria,
   workspace context, constraints, protected files, evidence already
   gathered, callable worker menu, concurrency limit, user preferences.
   Never put credentials in a packet.
3. Produce a bounded task graph — role, model route, owned files or
   responsibility, dependencies, expected output, verification, and a stop
   condition for every node. Reject any implementation node assigned to any
   model other than the two allowed routes. The main session's adjudication
   stays outside the worker graph.
4. Validate the graph against the actual task and current tools. The main
   session has final responsibility for safety and scope. Do not execute
   invented routes, unsafe actions, or work outside the user's request.
5. Spawn independent ready nodes in parallel, up to a sane concurrency limit
   (2–3 opencode sessions; ollama-cloud rate limits are real). Tell every
   code-writing worker its ownership and that other agents share the
   workspace, so it must preserve and accommodate their edits.
6. Collect results, inspect changed files, and run proportionate
   verification. For complex work, refine the graph for the next round.
   Cap at three orchestration rounds unless the user asks to continue.
7. Finish only when acceptance criteria and verification pass. Report
   selected models, material changes, and concrete proof. State which
   checks you could NOT perform.

When the orchestrator emits a plan, display it verbatim under this exact
heading:

```text
Fable speaks:
```

Do not relabel ordinary worker output as orchestration output.

## Boundaries

- The main session plans and adjudicates; it does not bulk-type
  implementation once workers are dispatched.
- Exchange decisions, evidence, task packets, diffs, test results, and
  blockers — not hidden reasoning.
- Orchestration does not expand authorization. Publishing, deployment,
  destructive operations, spending, and external messages retain their normal
  approval boundaries. File ownership is enforced: claim before dispatch,
  release when the handoff closes.
- If delegation adds no value (trivial edit, single file), use one worker or
  execute inline per the AGENTS.md tier policy — do not build a graph for
  its own sake.
- High-stakes work (auth, money, migrations, concurrency, data loss) goes to
  sonnet via `task(category="unspecified-high")`, never to an ollama worker — the graph does not
  override the tier table.

## Differences from upstream fable-orchestrator

Upstream (codejunkie99/fable-orchestrator) calls Claude Code's CLI as a
separate "Fable 5.1" model via `ask_fable.sh` and pins Codex Router agents.
That design was reviewed 2026-09-06 and not adopted directly because: the
`fable` alias it invokes does not exist on this box (the helper would label
whichever model answers as "Fable 5.1"), it loads the user's MCP servers
into every planning call (`--tools ""` does not disable MCP;
`--strict-mcp-config` is required), and its default model path aborts on
bash 3.2 (empty-array expansion under `set -u`). This adaptation keeps the
graph pattern but uses this box's existing orchestration lane (main
session + opencode run workers) instead of shelling to a second CLI.