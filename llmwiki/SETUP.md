# LLM Wiki — per-device setup

The wiki **pages** (`wiki/`, symlinked here) sync via this repo. The llmwiki **app**,
its venv, the search index, and your raw source files do **not** sync — reproduce
them per device with the steps below.

Upstream: https://github.com/lucasastorian/llmwiki

## 1. Install the app

```bash
git clone https://github.com/lucasastorian/llmwiki.git ~/dev/llmwiki
cd ~/dev/llmwiki
python -m venv .venv
# Windows: .\.venv\Scripts\Activate.ps1   |   macOS/Linux: source .venv/bin/activate
pip install -r api/requirements.txt -r mcp/requirements.txt
cd web && npm install && cd ..    # optional: web viewer + Chrome clipper
```

Requires Python 3.11+ (3.14 works — all deps had wheels) and Node 20+.

## 2. Create the workspace and link the synced wiki

```bash
python llmwiki init ~/research          # creates ~/research/.llmwiki + wiki/ scaffold
rm -rf ~/research/wiki                   # remove the fresh scaffold...
# ...and point it at the synced copy in this repo:
#   Windows (PowerShell):
#     New-Item -ItemType SymbolicLink -Path ~/research/wiki -Target ~/Documents/GitHub/agent-evo/llmwiki/wiki
#   macOS/Linux:
#     ln -s ~/Documents/GitHub/agent-evo/llmwiki/wiki ~/research/wiki
python llmwiki reindex ~/research        # rebuild the local index over the linked wiki
```

## 3. Register the MCP server in Claude Code

**CRITICAL — do NOT register the `llmwiki mcp` launcher directly.** It uses
`os.execvp` to re-exec into `local_server`; on Windows that spawns a new process
and the parent exits, so Claude Code marks the server "tools fetch failed" and
**zero tools are callable**. Point Claude Code at `local_server` directly instead:

```bash
# user (global) scope — one entry per workspace
claude mcp add --scope user llmwiki-research \
  ~/dev/llmwiki/.venv/Scripts/python.exe \
  -m local_server --workspace ~/research
```

Then edit the entry in `~/.claude.json` to add the module path (Claude Code ignores
`cwd`, so `PYTHONPATH` is what makes `-m local_server` resolve):

```json
"llmwiki-research": {
  "type": "stdio",
  "command": ".../.venv/Scripts/python.exe",
  "args": ["-m", "local_server", "--workspace", ".../research"],
  "cwd": ".../dev/llmwiki/mcp",
  "env": { "PYTHONPATH": ".../dev/llmwiki/mcp" }
}
```

Verify: `claude mcp list` must show `llmwiki-research: ✔ Connected` (not
"tools fetch failed" / "Failed to connect").

## 4. Nightly maintenance routine

Runs `claude -p` headless against the workspace to fold new sources into the wiki.
Prompt: `routine-prompt.txt` (synced). Least-privilege — NO shell, since the wiki
ingests untrusted external content:

```
claude -p "$(cat routine-prompt.txt)" \
  --model sonnet \
  --strict-mcp-config --mcp-config <isolated-llmwiki-only.json> \
  --permission-mode acceptEdits \
  --allowedTools "mcp__llmwiki-research Read Glob Grep"
```

- **Windows:** wrap in a `.ps1` and register a Scheduled Task (at-logon + hourly
  while logged on). See `~/dev/llmwiki/nightly-wiki.ps1` on the original machine.
- **macOS:** `launchd` `StartInterval`, or a `crontab` entry.
- **Linux:** `crontab` or a systemd timer.

Cloud routines (claude.ai/code/routines) do **not** work with this — the workspace
is local files behind a stdio MCP server the cloud can't reach.
