# Agent Roster

19 agents, 1 team, 0 chains.

**19 agents were retired on 2026-09-19** as redundant to oh-my-openagent's builtins —
`scout`, `librarian`, `oracle`, `metis`, `planner`, `critic`, `visual-analyzer`,
`code-engineer`, `ollama-code-engineer`, `documenter`, `summarizer`, `designer`,
`loom`, `qa-tester`, `council-glm`, `council-deepseek`, `red-team`, `bowser`,
`debugger`. Two of them (`librarian`, `oracle`) were already dead on the opencode
side: omo registers those names as `subagent` and won the collision, so the
generated `mode: primary` copies never loaded. The nine teams and all six chains
built out of them were dissolved in the same pass. Restore any of it with
`git checkout HEAD~1 -- roster/`.

Before that, 21 agents were retired on 2026-08-04 — `atlas`, `prometheus`,
`meta-orchestrator`, all seven `subcouncil-*` seats, and every `ollama-*` wrapper
except `ollama-code-engineer`. Restore those with `git checkout <sha> -- roster/`.

## Where the retired roles went

| Retired | Now |
|---------|-----|
| scout | omo `explore` — parallel-native, with a thoroughness dial |
| librarian, oracle, metis | omo builtins of the same name |
| planner | omo `prometheus` (interview-mode planner) |
| critic | omo `momus` (plan critic) |
| visual-analyzer | omo `multimodal-looker` |
| code-engineer | `task(category="unspecified-high")` — Sisyphus-Junior on `claude-sonnet-5`. **Not** `hephaestus`: omo's `no-hephaestus-non-gpt` hook disables it on a non-GPT model, and omo.jsonc pins it to sonnet, so it never registers |
| ollama-code-engineer | `task(category="quick")` → Sisyphus-Junior |
| documenter, summarizer | `task(category="writing")` |
| designer | `task(category="visual-engineering")` |
| loom | omo `sisyphus` — it *is* standalone-opencode orchestration |
| qa-tester, council-glm, council-deepseek | `review-work` skill (5 parallel reviewers) |
| red-team | `security-research` team skill |
| bowser | `ultimate-browsing` / `visual-qa` skills |
| debugger | `debugging` skill + `oracle` |

Caveat on the council seats: `council-glm` and `council-deepseek` ran on genuinely
different model families, which is the property that made two reviewers worth more
than one. `review-work` fires 3× Oracle + 2× unspecified-high, and this box's
`omo.jsonc` pins oracle to `claude-opus-5` and unspecified-high to
`claude-sonnet-5` — so that review is **all-Anthropic**. Repoint one of those slots
at a non-Anthropic model in `~/.omo/omo.jsonc` to get the diversity back.

Caveat on Claude Code: omo is an opencode plugin. None of the replacements above
are visible to a Claude Code session — reaching them needs a forwarder that calls
`opencode run --agent <name>`, the same shape the surviving ollama-lane agents use.

## Agent Categories

### Evolution (read-write)
| Agent | Purpose |
|-------|---------|
| **evolver** | Session-end evolution pass — proposes surgical edits |
| **evolver-meta** | Tunes the evolver's calibration against its own accuracy |
| **global-evolver** | Create-mode — drafts new global agents/skills for a capability gap |

Nothing in omo does self-modification of the agent config. These are the reason
the roster still exists.

### A/V Verification
| Agent | Purpose |
|-------|---------|
| **eyes-and-ears** | Machine eyes *and ears* — narrated or screen-recorded media |

Kept deliberately: `multimodal-looker`'s charter is PDFs, images and diagrams.
It has no audio.

### Curriculum Testing (read-only)
| Agent | Purpose |
|-------|---------|
| **cs-student-tester** | Works a CS course end-to-end as a real 14-year-old beginner |
| **cs-student-advanced** | Strong-student lens — fewest characters that still score full marks |
| **cs-student-moderate** | Competent-middle lens — reaches back for the course's own earlier material |
| **cs-student-beginner** | Struggling-beginner lens — slowest, most literal path. Pinned `@low` on purpose: this persona must NOT infer |
| **cs-teacher-tester** | Teacher side — a module as someone running 25 students would work it |

Domain personas, not routing. Nothing in omo covers them.

### Domain Experts (read-only, queried by the main session)
| Agent | Domain |
|-------|--------|
| **extensions-expert** | Plugins, tools, event handlers |
| **theme-expert** | Color tokens, theme configs |
| **skills-expert** | SKILL.md format, registration |
| **config-expert** | Settings, providers, models |
| **ui-expert** | Components, overlays, widgets |
| **prompts-expert** | Templates, arguments |
| **agents-expert** | Agent .md format, teams, chains |
| **cli-expert** | CLI flags, env vars, scripting |
| **keybindings-expert** | Shortcuts, key combos |

Unique in *subject* — Claude Code / opencode tooling knowledge baked into the
prompt — but redundant in *mechanism*. These are reference docs wearing agent
costumes; one skill would serve them better than nine agents.

### Utility
| Agent | Purpose |
|-------|---------|
| **test-ping** | Agent loading validation — `test.sh --live`'s only probe |

## Teams

One team, `experts`. See [teams.yaml](teams.yaml); the nine dissolved on
2026-09-19 are listed there.

## Chains

None. See [agent-chain.yaml](agent-chain.yaml) for what the six retired chains
were and where their shapes went.

## Model Assignments

`roster/*.md` is the source of truth. Each file declares `model:` + `effort:`
(what Claude Code runs natively) and `spawn-primary:` + `spawn-secondary:` (the
portable cross-CLI route, `<cli>/<model>[@effort]`).

## Setup

```bash
# From the repo root:
bash sync.sh
```

This runs `bin/gen-agents.mjs`, which generates **different** files for the two
consumers from this one source: a verbatim copy or a thin `opencode run`
forwarder into `~/.claude/agents/`, and a full body with the ollama model into
`~/.config/opencode/agents/`. It is not a symlink, and must not become one — a
symlink serves the same file to both CLIs, and every ollama-lane agent would then
run on Claude instead of spawning opencode.

Re-run it after **any** roster edit. Add `--prune` to drop generated copies whose
roster source is gone.
