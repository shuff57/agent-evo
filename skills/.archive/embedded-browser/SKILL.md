---
name: embedded-browser
description: Use when external agents need to discover and control the OGRE embedded Electron browser via Chrome DevTools Protocol.
---

# Embedded Browser CDP Access

## What this skill does

Provides a repeatable workflow for external agents (Playwriter and CLI tooling) to discover OGRE Desktop's Electron remote debugging endpoint and control embedded browser targets through CDP.

The Electron main process writes the current debugger port to:

`~/.ogre/cdp-port`

## Prerequisites

- OGRE Desktop running
- Electron remote debugging enabled by app startup
- Node.js available for `cdp.mjs`
- `chrome-cdp-skill` fork available locally **or** use the GitHub path below

Local expected path (if cloned):

- `~/.chrome-cdp-skill/`

If not installed locally, reference:

- GitHub: `https://github.com/shuff57/chrome-cdp-skill`

## 1) Discover the CDP port

```bash
cat ~/.ogre/cdp-port
```

This returns the Electron remote debugging port (for example `9223`).

## 2) Use cdp.mjs to enumerate and control targets

Set the script path to your local checkout (adjust as needed):

```bash
CDP_SCRIPT=~/.chrome-cdp-skill/scripts/cdp.mjs
```

List discoverable targets:

```bash
node "$CDP_SCRIPT" list
```

Capture accessibility snapshot for a target:

```bash
node "$CDP_SCRIPT" snap <target>
```

Click an element on a target:

```bash
node "$CDP_SCRIPT" click <target> <selector>
```

Examples:

```bash
node "$CDP_SCRIPT" list
node "$CDP_SCRIPT" snap 1
node "$CDP_SCRIPT" click 1 "button:has-text('Next')"
```

## 3) Connect Playwriter to the embedded browser

1. Read the port:

   ```bash
   PORT=$(cat ~/.ogre/cdp-port)
   ```

2. Confirm CDP target endpoint responds:

   ```bash
   curl "http://127.0.0.1:${PORT}/json"
   ```

3. In Playwriter automation, attach using the discovered CDP endpoint (the WebSocket URL from `/json`), then interact with the embedded page target.

## 4) Example grading-session workflow

```bash
# Start OGRE Desktop first, then:
PORT=$(cat ~/.ogre/cdp-port)
CDP_SCRIPT=~/.chrome-cdp-skill/scripts/cdp.mjs

# 1) Verify targets are visible
node "$CDP_SCRIPT" list

# 2) Snapshot accessibility tree of grading tab target
node "$CDP_SCRIPT" snap <grading-target>

# 3) Drive a grading action (example click)
node "$CDP_SCRIPT" click <grading-target> "button:has-text('Save')"
```

Use this loop repeatedly during grading:

1. `list` to confirm active targets
2. `snap` to inspect current state
3. `click` (or other commands from the cdp tool) for deterministic actions
4. re-`snap` to verify effect before mutating grades further

## Notes

- OGRE does **not** add `chrome-cdp-skill` as a package dependency; it remains an external operator tool.
- If `~/.chrome-cdp-skill/` is missing, clone `shuff57/chrome-cdp-skill` and set `CDP_SCRIPT` to its `scripts/cdp.mjs` path.
