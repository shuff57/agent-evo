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
- Repo orientation: hand-written map in each repo's `CLAUDE.md` (free, every session) **plus** a graphify knowledge graph in Syllabus + bookSHelf (reinstated 2026-08-09, v0.9.37)
- **The graph is derived data and is never synced** — `graphify-out/` stays gitignored; every device builds its own. What travels in git is the repo's `.githooks/` + `.graphifyignore`
- **A fresh clone needs one command**: `git config core.hooksPath .githooks` (local config never clones). `agent-evo/install.sh` does this for the known repos

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



