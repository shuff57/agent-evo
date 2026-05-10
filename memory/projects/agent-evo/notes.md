# agent-evo Project Notes

Repo: `C:\Users\shuff57\Documents\GitHub\agent-evo`
Purpose: Agent configuration, skills, memory system, and evolution infrastructure for Claude Code.

---

## Repo Structure

```
agent-evo/
├── memory/                    ← canonical memory store (junctioned from ~/.claude/memory/)
│   ├── global/notes.md        ← cross-project learnings
│   └── projects/<name>/       ← per-project notes
├── skills/                    ← agent skill library (markdown + scripts)
│   ├── session-reflector/     ← kept (user choice)
│   ├── graphify/              ← auto-created by graphify install
│   └── ...
├── evolution/                 ← evolution workspace (config, backups, tests)
├── graphify-out/              ← GITIGNORED: auto-rebuilt on commit/checkout
│   ├── graph.json             ← 790 nodes, 1073 edges, 64 communities (as of Apr 2026)
│   └── GRAPH_REPORT.md
├── install.sh                 ← CLEANED: removed hivemind dir checks
├── test.sh                    ← CLEANED: removed hivemind assertions
├── .gitignore                 ← includes graphify-out/, skills/.bundled_manifest
└── README.md                  ← updated memory section
```

---

## Memory System

- **Junction**: `~/.claude/memory/` → `agent-evo/memory/` (Windows Junction — do not break)
- **Format**: flat markdown files
- **Sync**: via `git push/pull` to `origin/master`
- **graphify does NOT index .md files** — use grep/read for memory queries, not graphify

---

## graphify Setup

- Package: `graphifyy` (PyPI) / imports as `graphify`
- Version: `0.4.1` (as of install)
- MCP config in `~/.claude/settings.json`:
  ```json
  "graphify": {
    "type": "stdio",
    "command": "python",
    "args": ["-m", "graphify.serve", "graphify-out/graph.json"]
  }
  ```
- Skill deployed to `~/.claude/skills/graphify/SKILL.md`
- PreToolUse hook in `~/.claude/settings.json`
- Git hooks: `post-commit` + `post-checkout` auto-rebuild graph
- `PYTHONUTF8=1` required on Windows (set in `~/.claude/settings.json` env block)

### Rebuild graph manually:
```powershell
$env:PYTHONUTF8=1; python -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path(r'C:\Users\shuff57\Documents\GitHub\agent-evo'))"
```

### Start MCP server:
```powershell
$env:PYTHONUTF8=1; python -m graphify.serve graphify-out/graph.json
```

---

## Removed Systems (do not re-add)

| System | What it was | Why removed |
|---|---|---|
| LightRAG | Vector graph memory w/ Neo4j/etc | Too complex, replaced with flat markdown |
| hivemind | Agent memory bus | Deprecated, moving to simpler system |
| swarmmail | Agent messaging | Deprecated |
| pi-memories | Raspberry Pi memory system | Not in use |
| hermes-bridge | Hermes agent integration | Hermes not installed on this machine |
| get-shit-done (GSD) | Workflow framework w/ skills + hooks | Archived 2026-05-10. User no longer uses it. Files moved to `~/.archive-claude/gsd-2026-05-10/` and `~/.claude/hooks/.archive/` |
| bundled skill topics | 135 nested skills under `~/.claude/skills/<topic>/<name>/` | Archived 2026-05-10. Loader is flat-only; nested skills were invisible. Moved to `~/.claude/skills/.archive/topics-2026-05-10/`. Pull individuals back to flat root if needed. |

Cleaned files:
- `evolution/plugin/hermes-bridge.ts` — DELETED
- `evolution/plugin/index.ts` — removed hivemind imports/calls
- `install.sh` — removed hivemind dir checks
- `test.sh` — replaced hivemind assertions

---

## Second Machine Setup

After `git pull` on second machine, run:
```bash
pip install graphifyy mcp
python -m graphify install           # deploys skill + hook
python -m graphify hook install      # installs git hooks
```
Set `PYTHONUTF8=1` in shell profile if on Windows.
Verify junction to memory/ is intact or recreate it.

---

## Key Commits

| Hash | Message |
|---|---|
| `5edb99a` | chore: remove hivemind/LightRAG/swarmmail, add new memory system + graphify |
