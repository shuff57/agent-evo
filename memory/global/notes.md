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
- `graphify-out/` is gitignored — rebuilt automatically by post-commit hook
- Always run `$env:PYTHONUTF8=1` before any graphify command on Windows (fixes charmap encoding error on `→` character)
- graphify package installs as `graphifyy` but imports as `graphify` (single y)

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
- **graphify on Windows**: Must set `PYTHONUTF8=1` env var or it fails with `UnicodeEncodeError` on special chars in graph output.
- **graphify build command**: There is no direct `graphify build` CLI. Use:
  ```powershell
  $env:PYTHONUTF8=1; python -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path(r'C:\Users\shuff57\Documents\GitHub\agent-evo'))"
  ```
- **graphify only indexes code files** (TS, JS, Python, etc.) — NOT markdown. Memory `.md` files are not graphed; use grep/read for memory queries.
- **graphify git hook**: May show `Python was not found` warning on Windows if bare `python` maps to Microsoft Store. Hooks still install correctly via `python -m graphify hook install`.
- **MCP server for graphify**: Requires `mcp` package (`pip install mcp`). Start with:
  ```powershell
  $env:PYTHONUTF8=1; python -m graphify.serve graphify-out/graph.json
  ```
- **PowerShell env vars**: Set with `$env:VAR=value`, not `export VAR=value`



