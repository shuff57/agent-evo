#!/usr/bin/env node
// loop-guard — PostToolUse nudge when one identical tool call repeats.
//
// The Claude Code port of opencode/plugin/guard-rails.js's [loop-guard]. The other
// four guards in that plugin port badly on purpose: probing claude.exe (2026-09-16)
// found the harness already ships them, sometimes with better wording than a port
// would have. Concretely, native coverage found in the binary:
//
//   truncation     BASH_MAX_OUTPUT_LENGTH / TASK_MAX_OUTPUT_LENGTH /
//                  MAX_MCP_OUTPUT_TOKENS + "[OUTPUT TRUNCATED - exceeded N token
//                  limit]" and "lines truncated" notices
//   edit failure   "String to replace not found in file" plus a hint that says to
//                  re-read and copy the exact surrounding text, and a message for
//                  old_string being a substring of a previous edit
//   subagent stall "agent stalled on all N attempts (no progress for Xms each)",
//                  "agent abandoned", "completed without calling StructuredOutput"
//   tool-input JSON "was called with input that could not be parsed as JSON ... Retry
//                  with valid JSON"
//   context        auto-compact (settings/CLAUDE_CODE_AUTO_COMPACT_WINDOW); the
//                  separate 35%/25% nudge is ours and is already wired via
//                  hooks/context-monitor.js
//
// What is NOT there is any sign of repeated-identical-call detection: the obvious
// strings ("You've called", "called the same", "same arguments", "repeating the
// same", "making no progress") are absent, and the one "Do not retry the identical
// call" in the binary is Chrome-extension-specific. So this is the one guard worth
// carrying over.
//
// Delivery is additionalContext on PostToolUse — the same channel as tier-gate and
// context-monitor: the harness shows it to the model without costing a tool call.
// Fail-open everywhere; a guard that breaks a tool call is worse than no guard.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

// Same tool set as the opencode port: the tools where an identical repeat means the
// model is stuck rather than working. Task/WebFetch/WebSearch are excluded — polling
// them legitimately repeats and would false-fire.
const LOOP_TOOLS = new Set(["bash", "read", "grep", "glob", "edit", "write"]);
const DEFAULT_LIMIT = 20;

function stateFile(sessionId) {
  // Hash the session id: it is used in a filename and arrives from the harness.
  const key = crypto.createHash("sha256").update(String(sessionId)).digest("hex").slice(0, 24);
  return path.join(os.tmpdir(), `claude-loop-guard-${key}.json`);
}

// Stable signature over the call: sorted keys recursively so two calls that differ
// only in key order hash the same. Only a digest is persisted — Edit/Write args
// carry whole files and a raw copy would bloat the state file.
function sortKeysDeep(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const out = {};
  for (const k of Object.keys(value).sort()) out[k] = sortKeysDeep(value[k]);
  return out;
}

function signature(tool, input) {
  let body;
  try {
    body = JSON.stringify(sortKeysDeep(input ?? {}));
  } catch {
    body = "unserializable";
  }
  return crypto.createHash("sha256").update(`${tool}::${body}`).digest("hex").slice(0, 32);
}

let raw = "";
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  clearTimeout(stdinTimeout);
  try {
    const payload = JSON.parse(raw);
    const tool = String(payload?.tool_name ?? "").toLowerCase();
    if (!LOOP_TOOLS.has(tool)) process.exit(0);

    const sessionId = payload?.session_id;
    if (!sessionId) process.exit(0);

    const limit = (() => {
      const n = Number.parseInt(process.env.LOOP_GUARD_LIMIT, 10);
      return Number.isFinite(n) && n > 1 ? n : DEFAULT_LIMIT;
    })();

    const sig = signature(tool, payload?.tool_input);
    const file = stateFile(sessionId);
    let state = { lastSig: null, count: 0, announced: [] };
    try {
      state = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      // First call in this session, or a corrupt state file: start clean.
    }
    if (!Array.isArray(state.announced)) state.announced = [];

    if (state.lastSig === sig) state.count = (state.count || 0) + 1;
    else {
      state.lastSig = sig;
      state.count = 1;
    }

    const announce = state.count >= limit && !state.announced.includes(sig);
    if (announce) {
      state.announced.push(sig);
      // Keep the announced list bounded; a long session can accumulate signatures.
      if (state.announced.length > 50) state.announced = state.announced.slice(-50);
    }

    try {
      fs.writeFileSync(file, JSON.stringify(state));
    } catch {
      // Bookkeeping must never break the tool call.
    }

    if (!announce) process.exit(0);

    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext:
            `[loop-guard] This exact tool call (same tool, same arguments) has now run ${state.count} ` +
            `times consecutively (limit ${limit}). If it is failing or not advancing, STOP repeating it: ` +
            "change approach, or report the blocker and ask. Repeating it again will not change the result.",
        },
      })
    );
    process.exit(0);
  } catch {
    process.exit(0);
  }
});
