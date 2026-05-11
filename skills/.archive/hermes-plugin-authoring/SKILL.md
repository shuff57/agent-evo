---
name: hermes-plugin-authoring
description: >
  Write Hermes plugins that hook into the agent lifecycle. Covers the correct
  hooks to use, how to inject context into the LLM, how to read live agent
  state, and the exact plugin layout required. Use when building any Hermes
  plugin — compression triggers, session observers, context injectors, etc.
tags: [hermes, plugin, hooks, lifecycle, context-injection, compression]
related_skills: [hermes-agent, handoff]
---

# Hermes Plugin Authoring

## Plugin Layout

Every plugin is a directory under `~/.hermes/plugins/<name>/` containing two files:

```
~/.hermes/plugins/my-plugin/
  plugin.yaml    — manifest
  __init__.py    — Python module with register(ctx) function
```

### plugin.yaml

```yaml
name: my-plugin
version: 1.0.0
description: "What this plugin does"
hooks:
  - on_session_end
  - pre_llm_call
```

Only list hooks your plugin actually registers — this is informational metadata.

### __init__.py

```python
def register(ctx) -> None:
    ctx.register_hook("on_session_end", _on_session_end)
    ctx.register_hook("pre_llm_call",   _pre_llm_call)

def _on_session_end(**kwargs) -> None:
    ...

def _pre_llm_call(**kwargs):
    ...
```

`register(ctx)` is the only required entry point. `ctx.register_hook(hook_name, fn)` wires callbacks.

---

## Valid Hooks and Their kwargs

| Hook | When it fires | kwargs | Return value used? |
|---|---|---|---|
| `on_session_start` | Brand-new session created | session_id, model, platform | No |
| `on_session_end` | End of every run_conversation() | session_id, completed, interrupted, model, platform | No |
| `on_session_finalize` | CLI atexit / /reset | session_id, platform | No |
| `on_session_reset` | /reset inside CLI | session_id | No |
| `pre_llm_call` | Before each LLM turn | session_id, user_message, conversation_history, is_first_turn, model, platform, sender_id | YES — string/dict injected into user message |
| `post_llm_call` | After each LLM turn | session_id, response, model, platform | No |
| `pre_tool_call` | Before each tool call | tool_name, args, task_id | No |
| `post_tool_call` | After each tool call | tool_name, args, result, task_id | No |
| `pre_api_request` | Before each raw API call | messages, model | No |
| `post_api_request` | After each raw API call | response, usage, model | No |

---

## Injecting Context into the LLM (pre_llm_call)

`pre_llm_call` is the ONLY hook whose return value is injected into the
conversation. Return a string or `{"context": "..."}` dict and Hermes
appends it to the user message for that turn.

Key pitfall: `on_session_start` does NOT inject — its return value is ignored.
Use `pre_llm_call` with an `is_first_turn` guard instead:

```python
_fired: set[str] = set()

def _pre_llm_call(**kwargs):
    if not kwargs.get("is_first_turn"):
        return None
    sid = kwargs.get("session_id", "")
    if sid in _fired:
        return None
    _fired.add(sid)
    # return context string — injected into first user message
    return "Read HANDOFF.md before continuing."
```

The injection is ephemeral — not persisted to session DB.
It preserves prompt cache because it goes into the user message, not system prompt.

---

## Reading Live Agent State

The live `AIAgent` instance is available via `run_agent._active_agent_ref`:

```python
def _get_agent():
    try:
        import run_agent as ra
        return getattr(ra, "_active_agent_ref", None)
    except Exception:
        return None

# Examples:
agent = _get_agent()
compression_count = getattr(agent.context_compressor, "compression_count", 0)
session_id = agent.session_id
model = agent.model
```

This is how to detect compression count — there is no dedicated on_compress hook.

---

## Detecting Context Compression

There is no `on_compress` hook. Instead:

1. Use `on_session_end` (fires after every run_conversation call)
2. Read `context_compressor.compression_count` via `_active_agent_ref`
3. Act when count >= your threshold

```python
def _on_session_end(**kwargs):
    try:
        import run_agent as ra
        agent = getattr(ra, "_active_agent_ref", None)
        if agent is None:
            return
        cc = getattr(agent.context_compressor, "compression_count", 0)
        if cc >= 2:
            _do_something(kwargs)
    except Exception as exc:
        import logging
        logging.warning("plugin failed: %s", exc)
```

The warning in run_agent.py at compression_count >= 2:
  "Session compressed N times — accuracy may degrade. Consider /new to start fresh."
fires at the same threshold. Your plugin fires at session end, after that warning.

---

## Reading Config

```python
def _cfg() -> dict:
    try:
        from hermes_cli.config import load_config
        return load_config().get("plugins", {}).get("my-plugin", {})
    except Exception:
        return {}
```

Users configure plugin options under `plugins.<plugin-name>` in `~/.hermes/config.yaml`:

```yaml
plugins:
  my-plugin:
    some_option: value
```

---

## Verifying the Plugin Loads

```python
cd ~/hermes-agent && source venv/bin/activate && python -c "
import sys; sys.path.insert(0, '.')
from hermes_cli.plugins import PluginManager
mgr = PluginManager()
mgr.discover_and_load()
p = mgr._plugins.get('my-plugin')
print('Hooks:', p.hooks_registered)
print('Error:', p.error)
"
```

- Class is `PluginManager` (not `PluginLoader`)
- Plugins stored in `mgr._plugins` dict keyed by plugin name
- `p.error` is None on success

---

## Pitfalls

- `on_session_start` return value is IGNORED — use `pre_llm_call` + `is_first_turn` for injection
- Always wrap hook bodies in try/except — uncaught exceptions are swallowed with a warning log
- `_active_agent_ref` is a module-level global in run_agent.py — it reflects the currently active agent
- Plugin dir name = plugin name in plugin.yaml (must match for discovery)
- No `on_compress` hook exists — poll compression_count in on_session_end instead
- `pre_llm_call` fires on EVERY turn — use a session-scoped set to fire once per session

---

## Example: Handoff-on-Compress Plugin

Full working plugin at: `~/.hermes/plugins/handoff-on-compress/`

What it does:
- Watches compression_count via on_session_end
- When >= 2, writes HANDOFF.md to cwd (or configured path) with git log + session ID
- On the next session's first turn, injects the HANDOFF.md contents via pre_llm_call
- Agent surfaces WHERE WE ARE + IMMEDIATE NEXT STEPS automatically

Config:
```yaml
plugins:
  handoff-on-compress:
    handoff_path: /path/to/HANDOFF.md  # default: cwd/HANDOFF.md
    compress_threshold: 2               # default: 2
    inject_on_start: true               # set false to skip auto-read
```
