#!/usr/bin/env node
// context-monitor — PostToolUse nudge when the Claude context window is running low.
//
// This is a revive of the archived gsd-context-monitor.js, which read a
// /tmp/claude-ctx-{session}.json bridge written by a statusline that no longer exists
// (the live statusline is claude-hud now). Measured 2026-09-16: zero bridge files on
// disk, so the archived hook could never fire. claude-hud instead caches the same
// numbers per session at ~/.claude/plugins/claude-hud/context-cache/<sha256(transcript_path)>.json,
// with { used_percentage, remaining_percentage, context_window_size, saved_at }.
// This hook reads THAT file — nothing else changed about the idea.
//
// Thresholds and delivery are the archived hook's, because they were right:
//   WARNING  (remaining <= 35%)  -> wrap up, avoid new complex work
//   CRITICAL (remaining <= 25%)  -> inform the user, do not start new work
// Delivered as additionalContext on PostToolUse — the harness shows it to the model
// without costing a tool call, the same delivery channel as tier-gate.
// Advisory wording only: never an imperative that would override user preference.
//
// Fail-open everywhere: no cache file, a stale snapshot, or an unexpected shape all
// exit 0 silently. A context warning that breaks a tool call is worse than none.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const WARNING_REMAINING = 35;
const CRITICAL_REMAINING = 25;
const STALE_MS = 120000; // a snapshot older than 2 min is not evidence of current usage
const DEBOUNCE_CALLS = 8;

function cacheDir() {
  const base = process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(os.homedir(), ".claude");
  return path.join(base, "plugins", "claude-hud", "context-cache");
}

let input = "";
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const transcript = data.transcript_path;
    const sessionId = data.session_id;
    if (!transcript || !sessionId) process.exit(0);

    const hash = crypto.createHash("sha256").update(path.resolve(transcript)).digest("hex");
    const snapPath = path.join(cacheDir(), `${hash}.json`);
    if (!fs.existsSync(snapPath)) process.exit(0); // no hud data for this session yet

    const snap = JSON.parse(fs.readFileSync(snapPath, "utf8"));
    const remaining = snap.remaining_percentage;
    const used = snap.used_percentage;
    if (typeof remaining !== "number") process.exit(0);

    const savedAt = typeof snap.saved_at === "number" ? snap.saved_at : 0;
    if (Date.now() - savedAt > STALE_MS) process.exit(0);

    if (remaining > WARNING_REMAINING) process.exit(0);

    // Debounce, with severity escalation bypassing it (warning -> critical fires now).
    const statePath = path.join(os.tmpdir(), `claude-context-monitor-${sessionId}.json`);
    let state = { calls: 0, lastLevel: null };
    try { state = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch {}
    state.calls = (state.calls || 0) + 1;

    const level = remaining <= CRITICAL_REMAINING ? "critical" : "warning";
    const escalated = level === "critical" && state.lastLevel === "warning";
    if (state.lastLevel !== null && state.calls < DEBOUNCE_CALLS && !escalated) {
      try { fs.writeFileSync(statePath, JSON.stringify(state)); } catch {}
      process.exit(0);
    }
    state.calls = 0;
    state.lastLevel = level;
    try { fs.writeFileSync(statePath, JSON.stringify(state)); } catch {}

    const message =
      level === "critical"
        ? `CONTEXT CRITICAL: ${used}% used, ${remaining}% remaining. Context is nearly exhausted. ` +
          "Inform the user that context is low and ask how they want to proceed. Do not start new complex work " +
          "or large reads; do not autonomously write handoff files unless the user asks."
        : `CONTEXT WARNING: ${used}% used, ${remaining}% remaining. Context is getting limited. ` +
          "Prefer finishing the current step over starting new exploration or large reads.";

    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: message },
      })
    );
  } catch {
    process.exit(0);
  }
});
