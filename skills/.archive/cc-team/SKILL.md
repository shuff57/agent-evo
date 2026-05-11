---
name: cc-team
description: Spawn a NATIVE Claude Code agent team (coordinated teammates with shared task list and mailbox) using a preset roster from agent-evo/roster/teams.yaml. Use when teammates need to talk to each other or share work — not for parallel fan-out. Requires CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 and Claude Code v2.1.32+.
triggers:
  - cc-team
  - native team
  - spawn team
  - agent team
  - coordinated team
  - team with shared tasks
---

# Claude Code Native Team

Spawns a real Claude Code agent team (not parallel fan-out). Teammates share a task list, message each other, and the lead synthesizes results.

## When to use this vs. hermes-team

| Need                                             | Use            |
| :----------------------------------------------- | :------------- |
| Teammates need to talk to each other             | **cc-team**    |
| Shared task list / self-claimed work             | **cc-team**    |
| Plan approval gates, lead synthesis              | **cc-team**    |
| Quick parallel perspectives, no coordination     | hermes-team    |
| Same prompt to N agents, independent responses   | hermes-team    |

If in doubt: cc-team is strictly more powerful but costs more tokens (each teammate is a full Claude Code instance). Start with hermes-team for read-only survey work; escalate to cc-team when coordination matters.

## Invocation

```
/cc-team <team-name> <prompt>
```

Examples:
- `/cc-team quality  verify the new checkout flow is correct, tested, and secure`
- `/cc-team debug    webhook handler drops events intermittently`
- `/cc-team planning create a plan for adding pagination to posts API`

## How the lead (you) handles invocation

1. **Look up the team.** Read `~/Documents/GitHub/agent-evo/roster/teams.yaml` and find the list of agents for `<team-name>`. If the team is unknown, list available teams and stop.
2. **Spawn a native Claude Code team.** Tell Claude Code to create a team with each listed agent as a teammate, using that agent's subagent definition by name (e.g., `spawn a teammate using the critic agent type...`). The agent definitions are already available at `~/.claude/agents/` via symlink.
3. **Pass the prompt.** Give each teammate the user's `<prompt>` as their spawn-time task. Let the lead (you) coordinate — do not assign all tasks up front; let the team self-claim where possible.
4. **Synthesize.** As teammates report back, combine findings into a single response to the user.

> Do NOT hand-edit `~/.claude/teams/{team-name}/config.json` — Claude Code generates it at runtime. Just describe the team to spawn; the runtime creates the config.

## Team roster reference (mirror of teams.yaml)

Authoritative source: `~/Documents/GitHub/agent-evo/roster/teams.yaml`. Re-read it at invocation time in case it changed.

| Team            | Agents                                                                 | Intent |
| :-------------- | :--------------------------------------------------------------------- | :----- |
| full            | scout, planner, code-engineer, critic, documenter, red-team            | Full lifecycle coverage |
| info            | scout, documenter, critic                                              | Research + validate |
| frontend        | planner, code-engineer, bowser                                         | Frontend with browser verify |
| experts         | meta-orchestrator + 9 domain experts                                   | Platform component work |
| omo             | oracle, librarian, scout, critic                                       | Architecture spike / lib eval |
| advisory        | oracle, metis, critic                                                  | Design review, read-only |
| implementation  | code-engineer, prometheus, atlas                                       | Parallel build from clear spec |
| planning        | scout, planner, critic                                                 | Plan + review in one pass |
| quality         | qa-tester, critic, red-team                                            | Post-impl verification |
| design          | designer, code-engineer, critic                                        | UI/UX with design + code |
| debug           | debugger, scout, oracle                                                | Root-cause + context + reasoning |

## Pitfalls

- **Only one team per session.** Clean up the current team before spawning a new one (`ask lead to clean up the team`).
- **Lead is fixed.** The session that spawns the team is lead for its lifetime.
- **No nested teams.** Teammates cannot spawn their own teams.
- **File conflicts.** Split work so teammates don't edit the same file concurrently.
- **Token cost scales linearly** with team size. The `full` and `experts` teams are expensive.

## Related

- `hermes-team` — parallel fan-out version (same roster, different mechanism)
- `hermes-chain` — sequential pipelines with output handoff
- Official docs: https://code.claude.com/docs/en/agent-teams
