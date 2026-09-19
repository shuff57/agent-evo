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
│   └── ...
├── evolution/                 ← evolution workspace (config, backups, tests)
├── install.sh                 ← CLEANED: removed hivemind dir checks
├── test.sh                    ← CLEANED: removed hivemind assertions
├── .gitignore                 ← includes skills/.bundled_manifest
└── README.md                  ← updated memory section
```

---

## Memory System

- **Junction**: `~/.claude/memory/` → `agent-evo/memory/` (Windows Junction — do not break)
- **Format**: flat markdown files
- **Sync**: via `git push/pull` to `origin/master`
- **Queries**: grep/read the markdown directly

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
| graphify | Knowledge-graph skill + MCP server + git hooks (`graphifyy` PyPI) | **RETIRED 2026-09-19 for omo's `codegraph`** — `install_graphify()`, the `Glob\|Grep` read-path hook, the `mcpServers.graphify` entry, `patches/graphify-svelte-symbols.py` and the `graphify-out/` ignore/merge rules are all gone. codegraph needs no pip install, no git hooks and no per-repo bootstrap: omo indexes into `~/.omo/codegraph/projects/<repo>-<hash>/` and links it as `.codegraph`. Previously reinstated 2026-08-09 on v0.9.37, removed 2026-08-01 (`a7242f7`); the reason it kept dying is that nothing auto-rebuilt the graph — only 2 of ~17 repos ever had a `graphify-out/`, neither read since. |
| bundled skill topics | 135 nested skills under `~/.claude/skills/<topic>/<name>/` | Archived 2026-05-10. Loader is flat-only; nested skills were invisible. Moved to `~/.claude/skills/.archive/topics-2026-05-10/`. Pull individuals back to flat root if needed. |

Cleaned files:
- `evolution/plugin/hermes-bridge.ts` — DELETED
- `evolution/plugin/index.ts` — removed hivemind imports/calls
- `install.sh` — removed hivemind dir checks
- `test.sh` — replaced hivemind assertions

---

## Second Machine Setup

After `git pull` on second machine, run `./install.sh`.
Verify junction to memory/ is intact or recreate it.

---

## Key Commits

| Hash | Message |
|---|---|
| `5edb99a` | chore: remove hivemind/LightRAG/swarmmail, add new memory system + graphify |
| `a7242f7` | chore(skills): remove graphify |
