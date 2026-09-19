#!/usr/bin/env node
// Claude Code port of opencode/plugin/tier-gate.js — makes the tier-routing
// policy in AGENTS.md mechanical instead of prose, on the harness where the
// suppression problem actually lives ("do not call the Agent tool" injected
// mid-session silently outranks the doc; measured skipped 2026-08-17 and
// 2026-08-18).
//
// DORMANT since 2026-09-19: this box runs opencode only and nothing loads
// PreToolUse hooks, so opencode/plugin/tier-gate.js is the gate that actually
// fires. Kept because the tests exercise bashWrite() and the counting logic
// directly, as pure functions.
//
// Same contract as the opencode plugin:
//   - >10 new lines in one write call, OR writes touching 2+ distinct files
//     in the session -> inject a [tier-gate] notice once per session.
//   - NUDGE, not a block: exit 0 always. A nudge that throws is worse than
//     no nudge, and blocking would wall off legit high-stakes inline work.
//   - Per-write-call counting: small edits to the same file stay quiet
//     ("tweak" lane); a multi-file campaign crosses the 3-file line.
//   - Once announced, stays quiet for the rest of the session.
//   - Subagent sessions exempt: their model is pinned by the roster; nagging
//     a pinned builder (sisyphus-junior on a category model) to "delegate"
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
// Thresholds mirror AGENTS.md exactly; the routing-contract test pins both
// files to the same numbers (opencode/tests/routing-contract.test.mjs).

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const LINE_THRESHOLD = 10;
const FILE_THRESHOLD = 2;
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

// Detect write-shaped Bash commands so the gate fires on Bash-first editing
// (python -c, sed -i, cat > f <<EOF) the same way it does on Edit|Write.
// Total: any error returns a non-write. Duplicated in opencode/plugin/tier-gate.js.
function heredocLines(raw) {
  const arr = raw.split("\n");
  let total = 0;
  for (let i = 0; i < arr.length; i++) {
    const m = arr[i].match(/<<-?\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/);
    if (!m) continue;
    const delim = m[1] ?? m[2] ?? m[3];
    let j = i + 1;
    while (j < arr.length && arr[j].trim() !== delim) j++;
    total += j - (i + 1);
  }
  return total;
}

function maskHeredocBodies(text) {
  const arr = text.split("\n");
  const out = arr.slice();
  for (let i = 0; i < arr.length; i++) {
    const m = arr[i].match(/<<-?\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/);
    if (!m) continue;
    const delim = m[1] ?? m[2] ?? m[3];
    let j = i + 1;
    while (j < arr.length && arr[j].trim() !== delim) j++;
    for (let k = i + 1; k < j; k++) out[k] = "\u0000".repeat(out[k].length);
  }
  return out.join("\n");
}

function findRedirects(text) {
  const files = [];
  const re = />+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const before = text[m.index - 1];
    const after = text[m.index + m[0].length];
    if (before === "&") continue; // fd-dup: 2>&1, &>
    if (after === "&") continue; // >&
    const rest = text.slice(m.index + m[0].length);
    const tok = rest.match(/^\s*([^\s;&|]+)/);
    if (tok) {
      const t = tok[1];
      if (["/dev/null", "/dev/stdout", "/dev/stderr"].includes(t)) continue;
      files.push(t);
    }
  }
  return files;
}

function lastNonFlag(text) {
  const args = text.trim().split(/\s+/);
  for (let i = args.length - 1; i >= 0; i--) {
    if (args[i] && !args[i].startsWith("-")) return args[i];
  }
  return null;
}

export function bashWrite(command) {
  try {
    if (typeof command !== "string") return { isWrite: false, files: [], lines: 0 };
    const raw = command;

    // Step C — heredoc line counting on the raw text.
    const lines = heredocLines(raw);

    // Step A — mask heredoc bodies first (so their operators never count), then
    // quoted regions, producing the operator-scan text.
    const scanText = maskHeredocBodies(raw).replace(
      /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g,
      (m) => "\u0000".repeat(m.length)
    );

    const files = [];
    let isWrite = false;

    // Output redirect: `>` / `>>` not an fd-dup.
    const redirectFiles = findRedirects(scanText);
    if (redirectFiles.length) {
      isWrite = true;
      files.push(...redirectFiles);
    }

    // Read-only git commands are never a write — unless a redirect above already won.
    const words = raw.trim().split(/\s+/);
    const firstWord = (words[0] || "").toLowerCase();
    if (firstWord === "git") {
      const sub = (words[1] || "").toLowerCase();
      if (["status", "log", "diff", "show", "grep", "branch", "rev-parse", "ls-files"].includes(sub) && !isWrite) {
        return { isWrite: false, files: [], lines: 0 };
      }
    }

    // sed -i / sed --in-place
    if (firstWord === "sed" && /(^|\s)(-i|--in-place)(\s|$)/.test(scanText)) {
      isWrite = true;
      const last = lastNonFlag(scanText);
      if (last) files.push(last);
    }

    // tee
    if (firstWord === "tee") {
      isWrite = true;
      const args = scanText.trim().split(/\s+/).slice(1);
      for (const a of args) if (a && !a.startsWith("-")) files.push(a);
    }

    // cp / mv / install
    if (["cp", "mv", "install"].includes(firstWord)) {
      isWrite = true;
      const last = lastNonFlag(scanText);
      if (last) files.push(last);
    }

    // truncate / dd of= / patch
    if (firstWord === "dd") {
      const m = scanText.match(/\bof=(\S+)/);
      if (m) {
        isWrite = true;
        files.push(m[1]);
      }
    } else if (firstWord === "truncate" || firstWord === "patch") {
      isWrite = true;
      const last = lastNonFlag(scanText);
      if (last) files.push(last);
    }

    // git apply / git checkout --
    if (firstWord === "git" && (words[1] === "apply" || (words[1] === "checkout" && words[2] === "--"))) {
      isWrite = true;
    }

    // Interpreters: only a write if the RAW command carries a write token.
    if (["python", "python3", "node", "perl", "ruby"].includes(firstWord)) {
      if (/open\([^)]*,\s*['"][wax]|\.write\(|writeFileSync|writeFile\(|Set-Content|Out-File|(^|\s)-i(\s|$)/.test(raw)) {
        isWrite = true;
      }
    }

    // Step D — unattributable writes collapse to one sentinel.
    if (isWrite && files.length === 0) files.push("<bash:unattributed>");

    return { isWrite, files, lines };
  } catch {
    return { isWrite: false, files: [], lines: 0 };
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

// Only run the hook body when executed directly (node hooks/tier-gate.js),
// not when imported for unit tests — importing must not block on stdin.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
try {
  const raw = await readStdin();
  const payload = JSON.parse(raw);
  const tool = String(payload?.tool_name ?? "");
  if (!WRITERS.has(tool) && tool !== "Bash") process.exit(0);

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

  let file = input?.file_path ?? input?.path ?? null;
  let lines = newLinesOf(tool, input);

  // Bash: only write-shaped commands feed the counters; everything else is
  // ignored exactly like a Read.
  // Counted by identity, not by spelling. Bash hands us a cwd-relative path and
  // Write hands us an absolute one, so one file touched by both used to count as
  // two and cross FILE_THRESHOLD on its own. The second cost is the worse one:
  // the notice is once per session, so that phantom spent the budget and the
  // genuinely large write later in the session was met with silence. The
  // unattributed sentinel is not a path and must survive unresolved.
  const identify = (f) => (f === "<bash:unattributed>" ? f : path.resolve(cwd, f));
  const remember = (f) => {
    const id = identify(f);
    if (!state.files.includes(id)) state.files.push(id);
  };

  if (tool === "Bash") {
    const bw = bashWrite(String(input?.command ?? ""));
    if (!bw.isWrite) process.exit(0);
    for (const f of bw.files) if (f) remember(f);
    lines = bw.lines;
  } else if (file) {
    remember(file);
  }
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
    "AGENTS.md routes work of this size to a cheaper-tier builder instead of typing it inline.",
    "Either delegate the remainder (Agent tool with a category task - quick, or unspecified-high",
    "for high-stakes - or the fallback",
    "`opencode run \"<spec>\" --auto -m ollama-cloud/deepseek-v4.1-flash` via Bash), or say in your reply",
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
}