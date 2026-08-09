# Agent-Evo

Self-evolving agent framework for Claude Code — agents, teams, chains, skills, persistent memory, and an evolution workspace.

## Install

**One-liner** (clone + symlink + verify):
```bash
git clone https://github.com/shuff57/agent-evo.git ~/Documents/GitHub/agent-evo && bash ~/Documents/GitHub/agent-evo/install.sh
```

**Or step by step:**
```bash
git clone https://github.com/shuff57/agent-evo.git ~/Documents/GitHub/agent-evo
cd ~/Documents/GitHub/agent-evo
bash install.sh    # detects platform, symlinks into ~/.claude, verifies
bash test.sh       # runs full test suite
```

### What `install.sh` does

1. Detects your platform (Linux, macOS, Windows/MSYS)
2. Checks for Claude Code
3. Backs up any existing agents in `~/.claude/agents/`
4. Symlinks `roster/`, `skills/`, `memory/`, and `settings.json` into `~/.claude/`
5. Installs the Hermes memory backend (if `uv` is available)
6. Installs graphify + registers the read-path hook and per-repo git hooks
7. Validates all agents, teams, chains, and symlinks

### Configuration

Override defaults with environment variables:
```bash
AGENTS_DIR=~/my/custom/path bash install.sh
```

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENTS_DIR` | `~/Documents/GitHub/agent-evo` | Where to install/find the repo |
| `AGENTS_REPO_URL` | (GitHub URL) | Git clone URL |

## Structure

```
roster/          # agent definitions + teams + chains (symlinked to ~/.claude/agents)
skills/          # reusable skill packages (SKILL.md + references)
memory/          # persistent memory (markdown notes, project-organized, git-synced)
evolution/       # evolution workspace (config + backups + tests)
install.sh       # full installer with platform detection
test.sh          # test suite (structure + integrity checks)
sync.sh          # minimal symlink-only script
```

## Roster

Agents are organized into categories. See [roster/README.md](roster/README.md) for the full breakdown.

| Category | Agents |
|----------|--------|
| Exploration & Research | scout, librarian, swarm-researcher |
| Planning & Analysis | planner, plan-draft, swarm-planner, metis |
| Review & Critique | reviewer, critic, red-team |
| Advisory | oracle |
| Implementation | code-engineer, prometheus, swarm-worker, documenter |
| Orchestration | atlas, meta-orchestrator |
| Visual & Browser | visual-analyzer, bowser |
| Domain Experts | extensions, theme, skills, config, ui, prompts, agents, cli, keybindings + test-ping |

## Teams & Chains

**Teams** group agents for coordinated work. **Chains** are sequential pipelines where each step's output feeds the next.

```bash
cat roster/teams.yaml
cat roster/agent-chain.yaml
```

## Adding an Agent

1. Create `roster/my-agent.md`:
   ```markdown
   ---
   name: my-agent
   description: What this agent does and when to use it.
   ---

   You are my-agent. Your system prompt goes here.
   ```
2. Add to `roster/teams.yaml` if it belongs to a team
3. Add to `roster/agent-chain.yaml` if it participates in a chain
4. Run `bash test.sh` to verify

No `sync.sh` needed after adding files — the symlink points to the directory, so new files appear instantly.

## Testing

```bash
bash test.sh          # structural + integrity checks
bash test.sh --live   # also invoke test-ping via Claude Code
```

Tests check:
- All agents have valid YAML frontmatter (`name`, `description`)
- All agents have non-empty system prompts
- All team/chain references resolve to agent files
- Symlinks are active and Claude Code can see agents
- No platform-specific text in prompts
- Skills all have SKILL.md
- Memory directory exists

## Memory

Persistent cross-session memory via markdown files in `memory/`. Symlinked to `~/.claude/memory/` so Claude reads it automatically.

```bash
# After a session with notable learnings — commit and push
git add memory/
git commit -m "memory: <project> learnings"
git push

# On another machine before starting work
git pull
```

See [memory/README.md](memory/README.md) for structure and format.

## Uninstall

```bash
rm ~/.claude/agents                              # remove Claude Code agents symlink
rm ~/.claude/skills                              # remove Claude Code skills symlink
rm ~/.claude/memory                              # remove Claude Code memory symlink
rm ~/.claude/settings.json                       # remove Claude Code settings symlink
rm -rf ~/Documents/GitHub/agent-evo              # remove repo
```
