---
name: hermes-team
description: Use when you need to run multiple agents in parallel on the same task. Covers all 11 teams, when to pick each one, how to invoke them, and how to compose custom teams.
triggers:
  - team
  - parallel agents
  - run agents in parallel
  - which team
  - team full
  - team quality
  - team debug
  - team advisory
---

# Hermes Agent Teams

Teams run multiple agents IN PARALLEL on the same prompt.
Use a team when you want simultaneous perspectives or parallel coverage.
Use a chain when you need sequential handoff. (See hermes-chain skill.)
If you need teammates that TALK TO EACH OTHER and share a task list,
use the cc-team skill for native Claude Code teams instead.

Source of truth: /mnt/c/Users/shuff57/Documents/GitHub/agent-evo/roster/teams.yaml

---

## Invocation syntax

In Claude Code:
  @team:<name>  <your prompt>

Examples:
  @team:quality  verify the auth module is complete and secure
  @team:advisory  should we use Redis or Postgres for session storage?
  @team:debug  the webhook handler is dropping events intermittently

Each agent in the team receives the same prompt and responds independently.
Results come back as separate agent outputs — no synthesis step.

---

## All 11 Teams

### full
Agents: scout, planner, code-engineer, critic, documenter, red-team
Use when: Complete lifecycle coverage for a non-trivial feature or task.
Each agent handles their domain concurrently — recon, planning, implementation,
quality gate, docs, and security all in one shot.
Avoid for: Quick one-off tasks (too heavy). Use a chain instead.

### info
Agents: scout, documenter, critic
Use when: You need to gather, summarize, and validate information about
the codebase or a topic without making any changes.
Example: "What does the payment module do and is the documentation accurate?"

### frontend
Agents: planner, code-engineer, bowser
Use when: Frontend work where you want a plan, implementation, and
browser verification happening together.
Example: "Add a dark mode toggle to the settings page."

### experts
Agents: meta-orchestrator + all 9 domain experts
(extensions-expert, theme-expert, skills-expert, config-expert,
ui-expert, prompts-expert, agents-expert, cli-expert, keybindings-expert)
Use when: Building or extending platform components (tools, plugins,
agent definitions, themes, configs). meta-orchestrator coordinates;
experts provide specialized knowledge in parallel.
Note: Don't query domain experts directly — always go through meta-orchestrator.

### omo
Agents: oracle, librarian, scout, critic
Use when: Deep research tasks that need both internal codebase knowledge
(scout), external documentation (librarian), expert reasoning (oracle),
and a quality check (critic). Good for architecture spikes or library evaluations.
Example: "Evaluate whether to migrate from REST to tRPC for our API layer."

### advisory
Agents: oracle, metis, critic
Use when: Architecture decisions, design reviews, or approach validation
before committing to an implementation. All three are read-only — no code changes.
oracle: deep reasoning. metis: surfaces hidden complexity. critic: challenges assumptions.
Example: "Review our proposed database schema before we build migrations."

### implementation
Agents: code-engineer, prometheus, atlas
Use when: You have a clear spec and want maximum implementation throughput.
code-engineer handles incremental work, prometheus handles autonomous full-task
execution, atlas orchestrates multi-step plans. Run in parallel on different
parts of the same feature.
Example: "Implement the user auth module — split frontend and backend."

### planning
Agents: scout, planner, critic
Use when: Creating a work plan. scout maps the codebase, planner drafts the
plan, critic reviews it — all in one pass.
Example: "Create a plan for adding pagination to the posts API."

### quality
Agents: qa-tester, critic, red-team
Use when: Post-implementation verification. Run after code is written to
get test coverage, correctness verification, and security audit simultaneously.
Example: "Verify the new checkout flow is correct, tested, and secure."

### design
Agents: designer, code-engineer, critic
Use when: UI/UX work where you want design decisions, implementation,
and review in parallel.
Example: "Redesign the dashboard layout for mobile responsiveness."

### debug
Agents: debugger, scout, oracle
Use when: Something is broken and you want root-cause diagnosis (debugger),
codebase context (scout), and architectural reasoning (oracle) at the same time.
Example: "Memory usage keeps climbing after ~100 requests to the job queue."

---

## Choosing the right team

Situation                                  | Team
---                                        | ---
Feature needs everything top to bottom     | full
Just gathering/summarizing info            | info
Frontend work with browser verify          | frontend
Building platform components (tools, UI)  | experts
Architecture spike or library evaluation   | omo
Design decision before you commit          | advisory
Clear spec, need fast parallel build       | implementation
Need a plan before building                | planning
Code is written, need full verification    | quality
UI work with design + code + review        | design
Something is broken, need diagnosis        | debug

---

## Composing a custom team (manual parallel invocation)

Teams are fixed in teams.yaml. For a custom parallel group, invoke agents
individually in the same message, or ask atlas to coordinate them:

  @atlas  run scout, librarian, and metis in parallel on this request: [task]

Or in Hermes via delegate_task:
  delegate_task with tasks=[
    {goal: "...", context: "..."},
    {goal: "...", context: "..."},
    {goal: "...", context: "..."}
  ]
Max 3 parallel subagents via delegate_task.

---

## Adding or editing teams

Edit: /mnt/c/Users/shuff57/Documents/GitHub/agent-evo/roster/teams.yaml
Then run: bash /mnt/c/Users/shuff57/Documents/GitHub/agent-evo/sync.sh

Format:
  team-name:
    - agent-one
    - agent-two
    - agent-three

---

## Pitfalls

- Teams run in parallel — agents do NOT see each other's output. If you need
  agent A's output to feed agent B, use a chain instead.
- The "experts" team should always include meta-orchestrator as the coordinator.
  Never invoke domain experts naked — they are research-only agents.
- "full" includes red-team (6 agents total). Don't underestimate the cost.
- Teams have no built-in synthesis step. You or atlas must read and combine outputs.
- @team syntax works in Claude Code. Hermes itself uses delegate_task
  for parallel subagent work.
