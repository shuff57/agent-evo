agent-evo: skills/ (88 dirs) symlinked to ~/.hermes/skills/ and ~/.claude/skills/. fact_store ids 1-3 for map+roster.
§
bookSHelf pipeline: scrape→match→merge→remaster→normalize→number→solutions→math→youtube→html→stitch→verify→publish. AI: from_args accepts task_type; from_env/create_client no longer default "openai"; .env has AI_PROVIDER=ollama, AI_MODEL=glm-5.1:cloud. Stitch: no AI. Run sequentially. ProjectContext._find_chapter_dir for Layout B. Prompts: Context Pause + Insight Note REQUIRED. Full worked solutions mandatory.
§
Hermes config: ~/.hermes/config.yaml. Model catalog in fact_store id 4. agent-mem DEPRECATED — all content migrated to fact_store (ids 9-18) + memory tool.
§
bookSHelf: Ch1 remaster 89/89 PASS committed a2a8655. Prompts: Context Pause + Insight Note REQUIRED. Full worked solutions mandatory. Subsection rule-lists: explain + notate only.
§
Obsidian MCP fix: use Linux Node.js (~/.local/nodejs/bin/npx) + WSL path. Windows npx via WSL shim caused CancelledError on MCP handshake. Linux npx+v22.14.0 at ~/.local/nodejs/. Config: command=/home/shuff57/.local/nodejs/bin/npx, path=/mnt/c/Users/shuff57/Documents/Obsidian Vault.
§
SOUL.md (~/.hermes/SOUL.md): session-startup preloaded skills. Caveman + karpathy-guidelines both inject as [SYSTEM: preloaded] blocks. Add new always-on skills there. Skill missing from skills_list? Check if symlink-to-dir in agent-evo/skills/ — os.walk skips symlinks.
§
OGRE repo: /mnt/c/Users/shuff57/Documents/GitHub/O.G.R.E-OllamaGradingRubricEvaluator/. Run with `bun run dev` (Vite dev server). Tests: `bun run vitest run <file>`. WSL rollup issue — must use bun, not npx vitest.
§
SOUL.md updated: added claude-code as third preloaded skill alongside caveman and karpathy-guidelines. Claude-operator skill doesn't exist — only claude-code.
§
MOM repo: /mnt/c/Users/shuff57/Documents/GitHub/MOM. Honcho peer: "mom". 32 regression + 18 stats-tests questions. Ch8 gaps: ~15-20 new questions needed (correlation interp, slope inference/CI/HT, transformations, regression output reading).