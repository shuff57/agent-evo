# SPEC: agent telemetry events + live timeline UI (msgbox-ui)

You are building a small visualization layer for the cross-CLI message center so the operator can see when agents are spawned and when they are working. Everything below is pinned. Absolute paths are given; if any does not exist, STOP and report rather than guessing.

## Background (read first, do not modify)

- `C:/Users/shuff57/Documents/GitHub/agent-evo/bin/msg.mjs` — the message center CLI. Log = `<box>/log.jsonl`. DO NOT MODIFY THIS FILE.
- `C:/Users/shuff57/Documents/GitHub/agent-evo/bin/handoff.mjs` — dispatcher wrapper you WILL modify.
- `C:/Users/shuff57/.config/opencode/plugin/inbox.js` — opencode plugin you WILL modify.
- `C:/Users/shuff57/Documents/GitHub/agent-evo/msgbox-ui/server.mjs` — existing HTTP server you WILL extend.
- `C:/Users/shuff57/Documents/GitHub/agent-evo/msgbox-ui/index.html` — does not exist yet; you WILL create it.

## Event file

New file `<box>/events.jsonl`, same directory as the box's `log.jsonl`. Box resolution = the same walk `inbox.js` uses in `findBox()` (MSGBOX env → walk up to `.git` → `~/.claude/msgbox`). Append-only JSON lines, one per event, `ts` = `new Date().toISOString()`:

```
{"ts":"...","kind":"spawn","from":"claude-handoff","model":"<model>","spec":"<abs spec path>","noBox":true|false}
{"ts":"...","kind":"exit","from":"claude-handoff","code":0,"ok":true|false}
{"ts":"...","kind":"activity","from":"opencode","tool":"edit","file":"<path if known, else null>"}
{"ts":"...","kind":"task","from":"opencode","agent":"<name if extractable, else null>"}
```

Never throw from an emitter: wrap appends in try/catch. events.jsonl must never break a run.

## Change 1: handoff.mjs (agent-evo/bin/handoff.mjs)

Add a small `emit(event)` helper writing to `<boxdir>/events.jsonl` (boxdir resolved as above; create the file on first append if missing).

- Immediately BEFORE the `spawnSync('opencode', ...)` call (currently line ~120): emit `spawn` with `model`, `spec`, `noBox`, and `from: "claude-handoff"`.
- AFTER the run returns and ALL checks are done (every `process.exit` path after line ~125): emit `exit` with `code` = `run.status` and `ok` = whether the run passed the reply/file checks. Simplest correct structure: compute the outcome, emit, then exit — do not duplicate the exit logic.
- Keep every existing exit code and console message identical.

## Change 2: inbox.js (~/.config/opencode/plugin/inbox.js)

Inside the existing `tool.execute.after` hook, BEFORE the existing mtime logic (so the heartbeat fires on every tool call, delivered or not):

- Debounced `activity` heartbeat: module-level `let lastBeat = 0`; append `{"ts","kind":"activity","from":ME,"tool":<input.tool ?? null>,"file":<best-effort path from the tool input: look for `filePath` / `path` / `file` keys, else null>}` only if `Date.now() - lastBeat > 5000`; update `lastBeat` on append.
- Subagent spawn marker: when the tool name is `task`, always (not debounced) emit `{"ts","kind":"task","from":ME,"agent":<input.toolInput?.subagent_type ?? input.toolInput?.agent ?? null>}`.
- Same `fs.appendFileSync` + try/catch pattern as the rest of the hook. The heartbeat must be nearly free (one timestamp compare in the common case).

## Change 3: server.mjs (agent-evo/msgbox-ui/server.mjs)

- New endpoint `/api/events?box=<path>`: returns `{ box, events }` where events = parsed lines of `<box>/events.jsonl` (each with `id` = 1-based line number). Missing file → `{ box, events: [] }`. Unknown box → 404 like `/api/log`. Accept the same box identifiers `discoverBoxes()` returns.
- New endpoint `/api/stream`: Server-Sent Events. Every 2 s, stat `log.jsonl` and `events.jsonl` of the requested box; when either mtime changes, send `event: update` with no data (client re-fetches). Keep it to one box per connection (`?box=` param, validated the same way).
- Keep all existing endpoints and behavior unchanged.

## Change 4: index.html (agent-evo/msgbox-ui/index.html) — the main work

Single self-contained file, vanilla JS + CSS, no build step, dark theme (bg near-black #0d1117-ish, monospace). Two views toggled by tabs:

1. **Timeline** (default): one lane per agent name seen in events (and the log's from/to values, merged). For each `spawn` from that agent: a bar from spawn ts to its matching `exit` ts (match by same `from`, earliest exit after spawn). A spawn with no exit yet = pulsing bar extending to "now" with label "running". `activity` events paint small ticks on the bar (title tooltip = tool + file). `task` events render as a small child node labeled with the agent name, connected under the spawning lane. Render `claim`/`release` from the existing log endpoint as file-path badges attached to the owning agent's lane. Relative time axis (oldest event = 0), auto-refresh every 2 s using `/api/stream`; re-fetch `/api/events` + `/api/log` on update and re-render (full re-render is fine at this scale).
2. **Tree**: spawn tree from `parent`-less roots (handoff spawns) with `task` events as children; indented list is acceptable, fancy SVG not required.

Also: a box selector dropdown (populated from `/api/boxes`), a header line with box name + event count, and an empty state ("no events yet — dispatch a run via handoff.mjs"). Poll `/api/boxes` every 30 s to notice new boxes.

Escape all interpolated strings (textContent, not innerHTML, for any agent/file data).

## Constraints

- No new dependencies, no build step, no git commits, no changes to msg.mjs or anything else in bin/.
- All code comments in English, match the existing comment style of the files you touch (plain, reason-first).
- After editing: `node --check` every edited/created .mjs/.js file.

## Acceptance gates (run these, report output verbatim in your reply)

1. `node --check` passes on handoff.mjs, inbox.js, server.mjs.
2. Start `node server.mjs` (port 4567 or MSGBOX_UI_PORT), then:
   - `curl http://localhost:4567/api/boxes` → 200 with boxes list.
   - `curl "http://localhost:4567/api/events"` with a box param → 200, JSON (empty events is fine if no events file yet).
   - `curl -N --max-time 4 http://localhost:4567/api/stream?box=<one real box>` → you should receive SSE headers (and ideally one update frame); report what you saw.
   - Kill the server afterwards.
3. Emitter smoke test: append one line to the home box events file (`C:/Users/shuff57/.claude/msgbox/events.jsonl`) using the same code path style (a tiny inline node -e script mimicking emit), then confirm `/api/events?box=...` returns it, then DELETE that test line to restore the file (rewrite the file without that line; keep it valid JSONL).
4. Do NOT modify any file under .msgbox of a repo, log.jsonl, or msg.mjs. Do NOT run git commands.

Report in your reply: what you changed (files + rough line counts), the verbatim gate outputs, and which parts you did NOT finish.