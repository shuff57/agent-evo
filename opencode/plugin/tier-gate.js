// Makes the tier-routing policy in CLAUDE.md mechanical instead of prose.
//
// The policy says: any session writing more than ~20 lines of new code, or making a
// coordinated fix touching 3+ files, should be delegated to a cheaper-tier builder
// rather than typed inline. That rule lives in a markdown file the model must
// *choose* to obey, and it was measured skipped twice (2026-08-17: an entire new
// lesson type built inline, never announced; 2026-08-18: 23 one-line edits across
// files judged "under threshold" and never announced). Ported from the stop-gate
// idea in openai/codex-plugin-cc: the harness detects the threshold mechanically
// and injects the notice into a tool result the model is already reading — the
// same delivery channel as inbox.js, which cannot be skipped.
//
// This is a NUDGE, not a block (fail-open by design): the announcement the policy
// demands is guaranteed to appear; what the session does with it is still up to
// the model and the user. Blocking writes would turn a style policy into a wall
// that high-stakes legit-inline work (auth, migrations) would keep hitting.
//
// Counting is per-write-call, not per-file-lifetime: a legitimate sequence of
// small edits to the SAME file stays quiet (that is the "tweak" lane), while a
// multi-file campaign crosses the 3-file line and a bulk edit crosses the line
// count. Both thresholds mirror CLAUDE.md exactly.
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const WRITERS = new Set(["write", "edit", "patch", "multiedit"]);
const LINE_THRESHOLD = 20; // CLAUDE.md: "more than ~20 lines of new code"
const FILE_THRESHOLD = 3; // CLAUDE.md: "coordinated fix touching 3+ files"
const MARKER = "[tier-gate]";

function stateDir() {
  const base = path.join(os.tmpdir(), "opencode-tier-gate");
  fs.mkdirSync(base, { recursive: true });
  return base;
}

// Keyed by session so parallel sessions (review lenses, fan-out builds) don't
// pollute each other's counters — same isolation lesson as CODEX_COMPANION_SESSION_ID.
function stateFile(sessionID, directory) {
  // Hash, never truncate: a truncated base64 key collides for any two directories
  // sharing a long prefix (temp dirs, sibling projects) and one session's
  // announced=true then silently mutes another's. Caught by the 3-file unit test.
  const dirKey = crypto.createHash("sha256").update(directory).digest("hex").slice(0, 16);
  return path.join(stateDir(), `${sessionID}-${dirKey}.json`);
}

function load(sessionID, directory) {
  try {
    return JSON.parse(fs.readFileSync(stateFile(sessionID, directory), "utf8"));
  } catch {
    return { announced: false, files: [] };
  }
}

function save(sessionID, directory, state) {
  try {
    fs.writeFileSync(stateFile(sessionID, directory), JSON.stringify(state));
  } catch {
    // Never let bookkeeping break a tool call.
  }
}

function filePathOf(args) {
  return args?.filePath ?? args?.path ?? args?.file_path ?? null;
}

// Lines actually introduced by this call: for `write` the whole file is new
// (conservative upper bound — re-writing an existing file counts as its size),
// for edit/patch the joined diff hunks / new content.
function newLinesOf(tool, args) {
  const text =
    tool === "write"
      ? args?.content
      : tool === "patch"
        ? (Array.isArray(args?.patches) ? args.patches.map((p) => p?.diff ?? "").join("\n") : "")
        : (args?.newString ?? args?.newText ?? "");
  if (typeof text !== "string") return 0;
  return text.split("\n").length - 1;
}

export const TierGate = async ({ directory }) => {
  // The gate only applies to primary sessions doing implementation work.
  // Subagent sessions have their own model pinned by the roster; nagging a
  // deepseek lens about "delegate to ollama-code-engineer" is noise.
  const sessions = new Map();

  const track = (sessionID) => {
    if (!sessions.has(sessionID)) sessions.set(sessionID, load(sessionID, directory));
    return sessions.get(sessionID);
  };

  return {
    "tool.execute.after": async (input, output) => {
      try {
        if (!WRITERS.has(String(input.tool).toLowerCase())) return;
        const state = track(input.sessionID);
        if (state.announced) return; // once per session is all the policy asks

        const file = filePathOf(input.args);
        if (file && !state.files.includes(file)) state.files.push(file);
        const lines = newLinesOf(String(input.tool).toLowerCase(), input.args);
        // Persist on every write, not just on announcing — otherwise a plugin reload
        // (or a second opencode instance for the same session) forgets the file count
        // and the 3-file line never fires. Caught by the persistence unit test.
        save(input.sessionID, directory, state);

        const overLines = lines > LINE_THRESHOLD;
        const overFiles = state.files.length >= FILE_THRESHOLD;
        if (!overLines && !overFiles) return;
        state.announced = true;
        save(input.sessionID, directory, state);

        const why = overLines
          ? `${lines} lines written in one call`
          : `writes now touch ${state.files.length} files (${state.files.slice(0, 5).join(", ")}${state.files.length > 5 ? ", …" : ""})`;
        const text = [
          "",
          `${MARKER} Tier policy crossed: ${why}.`,
          "CLAUDE.md routes work of this size to a cheaper-tier builder instead of typing it inline.",
          "Either delegate the remainder (e.g. /delegate, or the Agent tool with code-engineer / ollama-code-engineer),",
          "or say in your reply why inline is the better call here (high-stakes, genuinely ambiguous, or nearly done).",
          "Announcing this is the whole policy — do not silently continue.",
        ].join("\n");

        if (typeof output.output === "string") output.output += `\n\n${text}`;
        else output.output = text;
      } catch {
        // A nudge that throws is worse than no nudge.
      }
    },
  };
};