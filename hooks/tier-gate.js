#!/usr/bin/env node
// Claude Code port of opencode/plugin/tier-gate.js — makes the tier-routing
// policy in CLAUDE.md mechanical instead of prose, on the harness where the
// suppression problem actually lives ("do not call the Agent tool" injected
// mid-session silently outranks the doc; measured skipped 2026-08-17 and
// 2026-08-18). The graphify Glob|Grep hook in settings.json already proved
// the PreToolUse additionalContext channel; this uses the same delivery.
//
// Same contract as the opencode plugin:
//   - >20 new lines in one write call, OR writes touching 3+ distinct files
//     in the session -> inject a [tier-gate] notice once per session.
//   - NUDGE, not a block: exit 0 always. A nudge that throws is worse than
//     no nudge, and blocking would wall off legit high-stakes inline work.
//   - Per-write-call counting: small edits to the same file stay quiet
//     ("tweak" lane); a multi-file campaign crosses the 3-file line.
//   - Once announced, stays quiet for the rest of the session.
//   - Subagent sessions exempt: their model is pinned by the roster; nagging
//     a pinned builder (code-engineer, ollama-code-engineer) to "delegate"
//     is noise. Claude Code runs hooks per tool call in whatever session
//     context the call lands in, and Task-tool subagents share the parent's
//     session_id, so the exemption is keyed by agent_id in the payload when
//     present; otherwise primary sessions announce normally.
//
// Claude Code PreToolUse hook protocol:
//   stdin: { session_id, transcript_path, cwd, hook_event_name, tool_name,
//            tool_input: { file_path, content/new_string/... } }
//   stdout: exit 0 with optional JSON {hookSpecificOutput:
//            {hookEventName:"PreToolUse", additionalContext:"..."}}
//
// Thresholds mirror CLAUDE.md exactly; the routing-contract test pins both
// files to the same numbers (opencode/tests/routing-contract.test.mjs).

import fs from "fs";
import os from "os";
import path from "path";

const LINE_THRESHOLD = 20;
const FILE_THRESHOLD = 3;
const MARKER = "[tier-gate]";
const STATE_DIR = path.join(os.tmpdir(), "claude-tier-gate");

const WRITERS = new Set(["Write", "Edit", "NotebookEdit"]);

function stateFile(sessionID, cwd) {
  const key = Buffer.from(String(cwd)).toString("base64url");
  return path.join(STATE_DIR, `${sessionID}-${key}.json`);
}

function load(sessionID, cwd) {
  try {
    return JSON.parse(fs.readFileSync(stateFile(sessionID, cwd), "utf8"));
  } catch {
    return { announced: false, files: [] };
  }
}

function save(sessionID, cwd, state) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(stateFile(sessionID, cwd), JSON.stringify(state));
  } catch {
    // Never let bookkeeping break a tool call.
  }
}

function newLinesOf(tool, input) {
  const text =
    tool === "Write"
      ? input?.content
      : tool === "NotebookEdit"
        ? (input?.new_source ?? "")
        : (input?.new_string ?? input?.content ?? "");
  if (typeof text !== "string") return 0;
  return text.split("\n").length - 1;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

try {
  const raw = await readStdin();
  const payload = JSON.parse(raw);
  const tool = String(payload?.tool_name ?? "");
  if (!WRITERS.has(tool)) process.exit(0);

  const sessionID = payload?.session_id ?? "unknown-session";
  const cwd = payload?.cwd ?? process.cwd();
  const input = payload?.tool_input ?? {};

  // Subagent writes are exempt: their model is roster-pinned, "delegate"
  // advice is noise there. Claude Code PreToolUse payloads do not carry a
  // documented agent field, so we key on the AGENT env var the harness
  // exports for subagent runs when present; primary sessions unset it.
  if (process.env.CLAUDE_AGENT_ID || process.env.CLAUDE_SUBAGENT) process.exit(0);

  const state = load(sessionID, cwd);
  if (state.announced) process.exit(0);

  const file = input?.file_path ?? input?.path ?? null;
  if (file && !state.files.includes(file)) state.files.push(file);
  const lines = newLinesOf(tool, input);
  save(sessionID, cwd, state); // persist every write, so reloads keep the file count

  const overLines = lines > LINE_THRESHOLD;
  const overFiles = state.files.length >= FILE_THRESHOLD;
  if (!overLines && !overFiles) process.exit(0);

  state.announced = true;
  save(sessionID, cwd, state);

  const why = overLines
    ? `${lines} lines written in one call`
    : `writes now touch ${state.files.length} files (${state.files.slice(0, 5).join(", ")}${state.files.length > 5 ? ", …" : ""})`;
  const text = [
    `${MARKER} Tier policy crossed: ${why}.`,
    "CLAUDE.md routes work of this size to a cheaper-tier builder instead of typing it inline.",
    "Either delegate the remainder (Agent tool with code-engineer / ollama-code-engineer, or the fallback",
    "`opencode run \"<spec>\" --auto -m ollama-cloud/deepseek-v4-flash:0731` via Bash), or say in your reply",
    "why inline is the better call here (high-stakes, genuinely ambiguous, or nearly done).",
    "Announcing this is the whole policy — do not silently continue.",
  ].join("\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: text,
      },
    })
  );
  process.exit(0);
} catch {
  process.exit(0); // fail-open always
}