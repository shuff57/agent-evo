// Makes the tier-routing policy in CLAUDE.md mechanical instead of prose.
//
// The policy says: any session writing more than ~10 lines of new code, or making a
// coordinated fix touching 2+ files, should be delegated to a cheaper-tier builder
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
const LINE_THRESHOLD = 10; // CLAUDE.md: "more than ~10 lines of new code"
const FILE_THRESHOLD = 2; // CLAUDE.md: "coordinated fix touching 2+ files"
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

// Detect write-shaped Bash commands so the gate fires on Bash-first editing
// (python -c, sed -i, cat > f <<EOF) the same way it does on write/edit.
// Total: any error returns a non-write. Duplicated in hooks/tier-gate.js.
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
  // deepseek lens about "delegate to a cheaper tier" is noise.
  const sessions = new Map();

  const track = (sessionID) => {
    if (!sessions.has(sessionID)) sessions.set(sessionID, load(sessionID, directory));
    return sessions.get(sessionID);
  };

  return {
    "tool.execute.after": async (input, output) => {
      try {
        const tool = String(input.tool).toLowerCase();
        if (!WRITERS.has(tool) && tool !== "bash") return;
        const state = track(input.sessionID);
        if (state.announced) return; // once per session is all the policy asks

        let file = filePathOf(input.args);
        let lines = newLinesOf(tool, input.args);

        // Bash: only write-shaped commands feed the counters; everything else is
        // ignored exactly like a read.
        if (tool === "bash") {
          const bw = bashWrite(String(input.args?.command ?? ""));
          if (!bw.isWrite) return;
          for (const f of bw.files) if (f && !state.files.includes(f)) state.files.push(f);
          lines = bw.lines;
        } else if (file && !state.files.includes(file)) {
          state.files.push(file);
        }
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
          "Either delegate the remainder (e.g. /delegate, or a category task - quick, or unspecified-high for high-stakes),",
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