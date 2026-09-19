// Makes the tier-routing policy in AGENTS.md mechanical instead of prose.
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
// count. Both thresholds mirror AGENTS.md exactly.
//
// THE READ SIDE (added 2026-09-19). Counting only writes left the expensive half
// of the problem unguarded: a session can burn hundreds of read/grep/bash calls on
// the top-tier model and never trip a write threshold, because none of those tools
// is in WRITERS. Measured on this box, 3 days / 292 sessions: ONE task() delegation
// per 77 read+grep+bash calls, and 93% of $1120 spend on Anthropic models whose
// cost was cache-READ volume (600M on opus alone), not output -- i.e. long sessions
// holding enormous context, which is exactly what "handled it inline" looks like on
// a bill. So RECON_THRESHOLD read-shaped calls with no delegation now injects a
// second notice, on the same contract as the first: fail-open, once per session.
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const WRITERS = new Set(["write", "edit", "patch", "multiedit"]);

// Read-shaped tools. The write-side counters ignore these; the recon counter below
// is the only reason they are named at all. `codegraph_explore` is deliberately NOT
// here: AGENTS.md makes it the recommended FIRST move, it is one capped call rather
// than a loop, and a gate that fires on the behaviour it wants teaches the opposite
// of the lesson.
const READERS = new Set(["read", "grep", "glob", "list", "webfetch", "websearch"]);

// Handing work to someone else. `task` is the category/subagent route; team mode
// dispatches through `team_task_create`.
const DELEGATORS = new Set(["task", "team_task_create"]);

const LINE_THRESHOLD = 10; // AGENTS.md: "more than ~10 lines of new code"
const FILE_THRESHOLD = 2; // AGENTS.md: "coordinated fix touching 2+ files"
// Not a measured optimum -- picked to actually fire. The measured ratio was 1:77,
// so anything near that would never trigger; 25 is low enough to catch a session
// that has settled into reading for itself, high enough that a focused "read three
// files and edit one" pass never sees it.
const RECON_THRESHOLD = 25; // AGENTS.md: "25 read-shaped calls with no delegation"
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
    const saved = JSON.parse(fs.readFileSync(stateFile(sessionID, directory), "utf8"));
    // State files written before the recon counter existed have neither field, and
    // `undefined + 1` is NaN -- which compares false against every threshold and
    // would silently disable the read side for the life of that session.
    return { announced: false, files: [], recon: 0, reconAnnounced: false, ...saved };
  } catch {
    return { announced: false, files: [], recon: 0, reconAnnounced: false };
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

  const append = (output, lines) => {
    const text = lines.join("\n");
    if (typeof output.output === "string") output.output += `\n\n${text}`;
    else output.output = text;
  };

  return {
    "tool.execute.after": async (input, output) => {
      try {
        const tool = String(input.tool).toLowerCase();
        const isBash = tool === "bash";
        const isWriter = WRITERS.has(tool);
        if (!isWriter && !isBash && !READERS.has(tool) && !DELEGATORS.has(tool)) return;

        const state = track(input.sessionID);

        // Delegating is the whole behaviour the recon counter is asking for, so it
        // ZEROES the count rather than merely pausing it: a session that keeps handing
        // work out never accumulates toward the notice at all.
        if (DELEGATORS.has(tool)) {
          if (state.recon !== 0) {
            state.recon = 0;
            save(input.sessionID, directory, state);
          }
          return;
        }

        // Bash splits both ways, and bashWrite() is the existing arbiter: write-shaped
        // commands feed the write counters below, everything else (ls, cat, rg, git log)
        // is recon. That is the 61% of this box's tool calls the write side could not see.
        const bw = isBash ? bashWrite(String(input.args?.command ?? "")) : null;

        if (READERS.has(tool) || (isBash && !bw.isWrite)) {
          if (state.reconAnnounced) return; // once per session, same restraint as the write side
          state.recon += 1;
          save(input.sessionID, directory, state);
          if (state.recon < RECON_THRESHOLD) return;
          state.reconAnnounced = true;
          save(input.sessionID, directory, state);
          append(output, [
            "",
            `${MARKER} Recon budget crossed: ${state.recon} read/grep/bash calls, no delegation this session.`,
            "AGENTS.md sends recon to a sub-agent before you read the codebase by hand:",
            "codegraph_explore first, then explore / librarian / an *-expert. Their file dumps",
            "never enter this context; every call you make yourself does, and context volume is",
            "where the top-tier spend actually goes -- not output tokens.",
            "Spawn one for the next question, or say why this session has to look for itself.",
            "The count resets on every task(); this notice fires once per session.",
          ]);
          return;
        }

        // --- write side ---------------------------------------------------------
        if (state.announced) return; // once per session is all the policy asks

        const file = filePathOf(input.args);
        let lines = newLinesOf(tool, input.args);

        if (isBash) {
          for (const f of bw.files) if (f && !state.files.includes(f)) state.files.push(f);
          lines = bw.lines;
        } else if (file && !state.files.includes(file)) {
          state.files.push(file);
        }
        // Persist on every write, not just on announcing — otherwise a plugin reload
        // (or a second opencode instance for the same session) forgets the file count
        // and the 2-file line never fires. Caught by the persistence unit test.
        save(input.sessionID, directory, state);

        const overLines = lines > LINE_THRESHOLD;
        const overFiles = state.files.length >= FILE_THRESHOLD;
        if (!overLines && !overFiles) return;
        state.announced = true;
        save(input.sessionID, directory, state);

        const why = overLines
          ? `${lines} lines written in one call`
          : `writes now touch ${state.files.length} files (${state.files.slice(0, 5).join(", ")}${state.files.length > 5 ? ", …" : ""})`;
        append(output, [
          "",
          `${MARKER} Tier policy crossed: ${why}.`,
          "AGENTS.md routes work of this size to a cheaper-tier builder instead of typing it inline.",
          "Either delegate the remainder (e.g. /delegate, or a category task - quick, or unspecified-high for high-stakes),",
          "or say in your reply why inline is the better call here (high-stakes, genuinely ambiguous, or nearly done).",
          "Announcing this is the whole policy — do not silently continue.",
        ]);
      } catch {
        // A nudge that throws is worse than no nudge.
      }
    },
  };
};