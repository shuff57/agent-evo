# Global Notes

Cross-project learnings, preferences, and patterns that apply across all work.

---

## Environment

- **Machine**: Windows 11, PowerShell (`pwsh`)
- **Python**: `C:\Users\shuff57\AppData\Local\Programs\Python\Python314\`
  - Use `python` (not `python3`) on this machine
  - Bare `python` may map to Microsoft Store on some installs — use full path if needed
- **GitHub repos**: `C:\Users\shuff57\Documents\GitHub\`
- **Claude config**: `C:\Users\shuff57\.claude\`
- **Memory junction**: `C:\Users\shuff57\.claude\memory\` → `C:\Users\shuff57\Documents\GitHub\agent-evo\memory\` (Windows Junction, do NOT break)
- **Git identity**: pushes to `origin/master` (not `main`)
- **Timezone**: America/Los_Angeles

---

## Patterns

- Memory lives in `agent-evo/memory/` — flat markdown, synced via git
- Per-project notes go in `memory/projects/<repo-name>/notes.md`
- Global learnings (env, preferences, gotchas) go in `memory/global/notes.md` (this file)
- Repo orientation: hand-written map in each repo's `AGENTS.md` (free, every session) **plus** omo's `codegraph` MCP (`codegraph_explore`), on demand
- **graphify was retired 2026-09-19, replaced by codegraph.** omo ships and indexes codegraph itself under `~/.omo/codegraph/projects/<repo>-<hash>/`, surfaced in each repo as a `.codegraph` symlink — no pip install, no git hooks, no per-repo bootstrap
- **Both are derived data and neither syncs** — every device builds its own index. Nothing about the graph travels in git

---

## Preferences

- Keep git history clean: one commit per logical unit of work
- Prefer markdown for notes/memory over JSON or JSONL
- Agent memory system: simple flat files, no database dependencies
- Tools to keep: `session-reflector` skill (explicit user choice)
- Do NOT use: LightRAG, hivemind, swarmmail, pi-memories, hermes-bridge, get-shit-done (GSD)

---

## Gotchas

- **Windows junctions**: Do not `rm -rf` junction targets — deletes the source. Use `Remove-Item junction_path` (no `-Recurse`) to remove only the junction.
- **PowerShell env vars**: Set with `$env:VAR=value`, not `export VAR=value`



