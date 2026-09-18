#!/usr/bin/env node
// peer-inbox — PostToolUse delivery of cross-CLI messages into a running Claude Code turn.
//
// CLAUDE.md parked this exact hook: "Claude Code has no equivalent hook and does not need
// one — the harness already surfaces the user's mid-turn messages. If cross-agent messages
// ever need to reach a long Claude turn the same way, it is a PostToolUse hook running
// msg.mjs inbox --as claude; it is left off deliberately, because that spawns node on every
// tool call in every session to cover a case that is mostly already covered."
//
// This is that hook, built so the spawn is paid only when there is something to deliver.
// The opencode side (opencode/plugin/inbox.js) appends the message to a tool result the
// model is already reading; Claude Code has no such append channel, so delivery rides
// additionalContext on PostToolUse — the same channel tier-gate, context-monitor and
// loop-guard use, which the harness shows to the model without costing a tool call.
//
// The common case is "nothing new" and it must be nearly free: one stat of the box log, no
// subprocess. Only when the log's mtime moved do we spawn `msg.mjs inbox --as claude`, which
// owns the cursor, the unread filter and the formatting — this hook never reimplements them,
// so the two can never disagree about what counts as unread.
//
// The mtime is read and persisted BEFORE delivery, exactly as the opencode plugin does:
// anything appended while msg.mjs runs leaves a newer mtime and so still triggers next call.
// A failed child is recovered on the next append, because the cursor msg.mjs owns was never
// advanced.
//
// Fail-open everywhere: no box, no log, no msg.mjs, a malformed payload, a non-zero child or
// an unwritable state file all exit 0 silently. A mailbox that breaks a tool call is worse
// than a missed message.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

// Claude Code's peer name in the message center. Hardcoded, not MSGBOX_AS: that variable is
// the opencode launcher's fan-out dial, and honouring it here would let a leaked value make
// Claude read another agent's cursor.
const ME = "claude";
const CHILD_TIMEOUT_MS = 5000;

// Box resolution is duplicated from msg.mjs ON PURPOSE, the same way opencode/plugin/inbox.js
// duplicates it: it is the one thing needed BEFORE deciding whether to spawn anything, and
// spawning node on every tool call just to learn the path would cost more than the feature
// saves. Keep in step with `msg.mjs where`.
function findBox(startDir) {
  if (process.env.MSGBOX) return process.env.MSGBOX;
  let dir = startDir || process.cwd();
  while (true) {
    if (fs.existsSync(path.join(dir, ".git"))) return path.join(dir, ".msgbox");
    const up = path.dirname(dir);
    if (up === dir) return path.join(os.homedir(), ".claude", "msgbox");
    dir = up;
  }
}

// msg.mjs lives beside this hook in the repo (bin/msg.mjs) and is symlinked to
// ~/.claude/bin/msg.mjs on an installed box. Prefer the sibling so the hook works from a
// checkout; fall back to the installed path. PEER_INBOX_MSG overrides both (tests, ops).
function findMsg() {
  const override = process.env.PEER_INBOX_MSG;
  if (override) return override;
  const sibling = path.join(__dirname, "..", "bin", "msg.mjs");
  if (fs.existsSync(sibling)) return sibling;
  return path.join(os.homedir(), ".claude", "bin", "msg.mjs");
}

// The mtime gate is per session AND per box: two sessions in one repo must not share a
// "last seen" value, and one session in two boxes must not either.
function stateFile(sessionId, box) {
  const key = crypto
    .createHash("sha256")
    .update(`${sessionId ?? ""}\u0000${box}`)
    .digest("hex")
    .slice(0, 24);
  return path.join(os.tmpdir(), `claude-peer-inbox-${key}.json`);
}

let raw = "";
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  clearTimeout(stdinTimeout);
  try {
    const payload = JSON.parse(raw);
    const box = findBox(payload?.cwd);
    const logFile = path.join(box, "log.jsonl");

    // One stat, no subprocess: the common case ends here.
    const mtime = fs.existsSync(logFile) ? fs.statSync(logFile).mtimeMs : 0;

    const file = stateFile(payload?.session_id, box);
    let state = { mtime: null };
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (parsed && typeof parsed === "object") state = parsed;
    } catch {
      // First call in this session, or a corrupt state file: treat as never seen.
    }
    if (state.mtime === mtime) process.exit(0);

    // A missing msg.mjs must not consume the gate: leave the mtime unwritten so delivery
    // resumes on the next tool call once the file is back, not only on the next append.
    const msg = findMsg();
    if (!fs.existsSync(msg)) process.exit(0);

    // Persist the observed mtime BEFORE delivery: an append during the child run leaves a
    // newer mtime and still triggers next call.
    try {
      fs.writeFileSync(file, JSON.stringify({ mtime }));
    } catch {
      // Bookkeeping must never break the tool call.
    }

    const text = execFileSync(process.execPath, [msg, "inbox", "--as", ME], {
      cwd: payload?.cwd || process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: CHILD_TIMEOUT_MS,
    }).trim();
    if (!text) process.exit(0);

    // Exit from the write callback, not immediately after it: process.exit() does not wait
    // for an async pipe write, and a long parked note can exceed the pipe buffer.
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: text },
      }),
      () => process.exit(0)
    );
  } catch {
    process.exit(0);
  }
});
