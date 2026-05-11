---
name: obsidian-second-brain
description: >
  Wire Hermes agent memory into Obsidian as a live second brain.
  Covers three layers: (1) plugin hook auto-mirror of every memory write,
  (2) session handoff notes written at session end, (3) periodic cron sync.
  Use when setting up Obsidian as a persistent knowledge store for agent memory.
tags: [obsidian, memory, plugin, second-brain, hermes]
related_skills: [obsidian, hermes-plugin-authoring, handoff]
---

# Obsidian Second Brain

Three-layer architecture for wiring Hermes memory into Obsidian:

  Layer 1 (live):     obsidian-memory-mirror plugin    -- mirrors every memory write instantly
  Layer 2 (session):  obsidian-session-handoff plugin  -- writes handoff note at session end
  Layer 3 (periodic): obsidian-memory-sync cron job    -- full sweep every N hours

## Prerequisites

- Obsidian installed with a vault
- mcp-obsidian configured (see obsidian skill for WSL2 path pitfall)
- Vault path known (WSL: /mnt/c/..., Windows: C:\...)

## Vault Structure Created

```
<vault>/
  Hermes/
    Memory.md           -- agent notes (live mirror, overwritten each update)
    User Profile.md     -- user profile (live mirror, overwritten each update)
    Sessions/
      YYYY-MM-DD-<sid>.md  -- per-session handoff notes
  Daily/
    YYYY-MM-DD.md       -- daily log, one entry per session appended
```

## Plugin 1: obsidian-memory-mirror

Hook: post_tool_call -- watches for tool_name == 'memory'
On fire: reads entries[] from result, writes structured markdown to vault.
Location: ~/.hermes/plugins/obsidian-memory-mirror/

plugin.yaml:
```yaml
name: obsidian-memory-mirror
version: 1.0.0
description: Mirrors every Hermes memory write to Obsidian
hooks:
  - post_tool_call
```

__init__.py key logic:
```python
def register(ctx):
    ctx.register_hook("post_tool_call", _on_tool_call)

def _on_tool_call(**kwargs):
    if kwargs.get("tool_name") != "memory":
        return
    target = kwargs.get("args", {}).get("target", "memory")
    entries = kwargs.get("result", {}).get("entries", [])
    # write vault/Hermes/Memory.md or vault/Hermes/User Profile.md
```

Note format:
```markdown
---
tags: [hermes/memory]
updated: YYYY-MM-DD HH:MM
---

# Agent Memory

> Auto-synced from Hermes memory -- last updated YYYY-MM-DD HH:MM

## Entry 1

<entry content>
```

## Plugin 2: obsidian-session-handoff

Hooks: on_session_end, pre_llm_call
On session end: writes Daily/YYYY-MM-DD.md (append) + Hermes/Sessions/YYYY-MM-DD-<sid>.md (new)
On next session first turn: injects one-line hint pointing at latest session note.
Location: ~/.hermes/plugins/obsidian-session-handoff/

Session note includes: session_id, model, platform, status, compression_count, git log (last 5 commits), wikilinks to Memory and User Profile notes.

Daily note entry format:
```markdown
## HH:MM -- Hermes Session

Model: <model> | Platform: <platform> | Status: done/interrupted
[[Hermes/Sessions/YYYY-MM-DD-<sid>]]
```

## Plugin Verification

```python
cd ~/hermes-agent && source venv/bin/activate && python -c "
import sys; sys.path.insert(0, '.')
from hermes_cli.plugins import PluginManager
mgr = PluginManager()
mgr.discover_and_load()
print('hooks:', list(mgr._hooks.keys()))
for name in ['obsidian-memory-mirror', 'obsidian-session-handoff']:
    p = mgr._plugins.get(name)
    print(name, 'hooks_registered:', p.hooks_registered, 'error:', p.error)
"
```

PITFALL: hooks_registered may show [] even when hooks ARE registered in mgr._hooks.
Check `list(mgr._hooks.keys())` -- that is the ground truth.

Smoke test:
```python
mgr.invoke_hook('post_tool_call', tool_name='memory', args={'target': 'memory'},
    result={'entries': ['test'], 'success': True}, task_id='test')
# check that vault/Hermes/Memory.md was created
```

## Layer 3: Cron Job

```python
cronjob(action='create',
    name='obsidian-memory-sync',
    schedule='every 6h',
    deliver='local',
    prompt="""
    Sync Hermes memory to Obsidian vault at /mnt/c/Users/.../Obsidian Vault.
    1. Read memory tool entries for both targets.
    2. Write vault/Hermes/Memory.md (tag: hermes/memory).
    3. Write vault/Hermes/User Profile.md (tag: hermes/user-profile).
    4. session_search with no query for recent sessions, append as ## Recent Sessions.
    5. Report filenames + line counts.
    """)
```

## Config Options (optional, in config.yaml)

```yaml
plugins:
  obsidian-memory-mirror:
    vault_path: /mnt/c/Users/.../Obsidian Vault
    memory_note: Hermes/Memory.md
    user_note: Hermes/User Profile.md
  obsidian-session-handoff:
    vault_path: /mnt/c/Users/.../Obsidian Vault
    daily_note: Daily/{date}.md
    session_note: Hermes/Sessions/{date}-{sid}.md
    inject_reminder: true
```

If vault_path not set in config, falls back to OBSIDIAN_VAULT_PATH env var, then hardcoded default.

## Pitfalls

- WSL2: npx runs in Windows context -- mcp-obsidian needs Windows path; plugin file writes use WSL /mnt/c/ path (pathlib works fine)
- hooks_registered field on plugin object can be empty even when hooks work -- check mgr._hooks instead
- on_session_end fires after EVERY run_conversation() call, not just CLI exits
- Always wrap hook bodies in try/except -- uncaught exceptions silently swallowed
- Daily note: plugin appends; if file doesn't exist yet it creates with # YYYY-MM-DD header
