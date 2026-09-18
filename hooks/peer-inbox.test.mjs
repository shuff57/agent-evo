// Test harness for hooks/peer-inbox.js — drives it with real PostToolUse payload shapes
// via child_process, asserting on stdout JSON, exit codes, and whether msg.mjs was spawned.
//
// Two kinds of fixture are used on purpose:
//   - the REAL bin/msg.mjs, to prove the hook stays compatible with the inbox output and
//     the unread filter (empty inbox, addressed-to-someone-else, cursor advance);
//   - a fake msg.mjs that records each spawn, to prove the mtime gate actually suppresses
//     the subprocess rather than merely suppressing its output.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.resolve(HERE, "peer-inbox.js");
const REAL_MSG = path.resolve(HERE, "..", "bin", "msg.mjs");

// Unique per run: the mtime state lives in %TMP% keyed by session id + box, so a fixed id
// would inherit a previous run's "last seen" value.
const RUN = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
const sid = (name) => `${name}-${RUN}`;

function runHook(payload, env = {}) {
  const clean = { ...process.env };
  delete clean.MSGBOX;
  delete clean.PEER_INBOX_MSG;
  Object.assign(clean, env);
  try {
    const stdout = execFileSync(process.execPath, [HOOK], {
      input: typeof payload === "string" ? payload : JSON.stringify(payload),
      encoding: "utf8",
      env: clean,
      timeout: 15000,
    });
    return { stdout: stdout.trim(), code: 0 };
  } catch (e) {
    return { stdout: (e.stdout ?? "").trim(), code: e.status ?? 1 };
  }
}

// A box with a log.jsonl. Returns { box, logFile }.
function box(lines = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peer-inbox-"));
  const logFile = path.join(dir, "log.jsonl");
  fs.writeFileSync(logFile, lines.map((l) => JSON.stringify(l)).join("\n") + (lines.length ? "\n" : ""));
  return { box: dir, logFile };
}

const msg = (from, to, text) => ({ ts: new Date().toISOString(), from, to, text });

// Force a distinctly newer mtime so the gate cannot be defeated by coarse filesystem
// timestamp granularity (some filesystems only tick once per second).
function touchNewer(file) {
  const t = new Date(Date.now() + 2000);
  fs.utimesSync(file, t, t);
}

test("empty inbox: silent, exit 0, no JSON emitted", () => {
  const { box: b } = box([]);
  const r = runHook(
    { session_id: sid("empty"), cwd: b, tool_name: "Read", tool_input: { file_path: "a.js" } },
    { MSGBOX: b }
  );
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "", "an empty inbox must produce no output at all");
});

test("missing log: silent, exit 0", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peer-inbox-nolog-"));
  const r = runHook(
    { session_id: sid("nolog"), cwd: dir, tool_name: "Read", tool_input: {} },
    { MSGBOX: dir }
  );
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "");
});

test("non-empty inbox: delivers the message as PostToolUse additionalContext", () => {
  const { box: b } = box([msg("opencode", "claude", "please stop and re-read the spec")]);
  const r = runHook(
    { session_id: sid("deliver"), cwd: b, tool_name: "Bash", tool_input: { command: "ls" } },
    { MSGBOX: b }
  );
  assert.equal(r.code, 0);
  const j = JSON.parse(r.stdout);
  assert.equal(j.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.equal(typeof j.hookSpecificOutput.additionalContext, "string");
  assert.match(j.hookSpecificOutput.additionalContext, /\[message center\]/);
  assert.match(j.hookSpecificOutput.additionalContext, /please stop and re-read the spec/);
});

test("JSON shape is exactly the PostToolUse contract", () => {
  const { box: b } = box([msg("opencode", "claude", "shape check")]);
  const r = runHook({ session_id: sid("shape"), cwd: b, tool_name: "Read", tool_input: {} }, { MSGBOX: b });
  const j = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(j), ["hookSpecificOutput"]);
  assert.deepEqual(Object.keys(j.hookSpecificOutput).sort(), ["additionalContext", "hookEventName"]);
  assert.equal(j.hookSpecificOutput.hookEventName, "PostToolUse");
});

test("messages addressed to another agent are not delivered to claude", () => {
  const { box: b } = box([msg("claude", "opencode", "this is for opencode only")]);
  const r = runHook({ session_id: sid("filter"), cwd: b, tool_name: "Read", tool_input: {} }, { MSGBOX: b });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "", "the unread filter belongs to msg.mjs and must be honoured");
});

test("mtime gate: unchanged log does not spawn msg.mjs; an append does", () => {
  const { box: b, logFile } = box([msg("opencode", "claude", "first")]);
  const marker = path.join(b, "spawns.txt");
  const fake = path.join(b, "fake-msg.mjs");
  fs.writeFileSync(
    fake,
    [
      'import fs from "node:fs";',
      "const marker = process.env.PEER_TEST_MARKER;",
      'if (marker) fs.appendFileSync(marker, "spawn\\n");',
      'process.stdout.write("[message center] 1 new message for claude.\\n\\n#1 fake\\nfirst\\n");',
    ].join("\n")
  );
  const env = { MSGBOX: b, PEER_INBOX_MSG: fake, PEER_TEST_MARKER: marker };
  const payload = { session_id: sid("gate"), cwd: b, tool_name: "Read", tool_input: {} };

  const first = runHook(payload, env);
  assert.match(first.stdout, /first/, "first call delivers");
  assert.equal(fs.readFileSync(marker, "utf8").trim().split("\n").length, 1, "first call spawns once");

  const second = runHook(payload, env);
  assert.equal(second.stdout, "", "unchanged log stays silent");
  assert.equal(
    fs.readFileSync(marker, "utf8").trim().split("\n").length,
    1,
    "unchanged log must NOT spawn msg.mjs — the gate is the whole point"
  );

  fs.appendFileSync(logFile, JSON.stringify(msg("opencode", "claude", "second")) + "\n");
  touchNewer(logFile);
  const third = runHook(payload, env);
  assert.match(third.stdout, /first/, "a newer mtime delivers again");
  assert.equal(fs.readFileSync(marker, "utf8").trim().split("\n").length, 2, "append spawns again");
});

test("box resolution: <cwd>/.git -> <cwd>/.msgbox when MSGBOX is unset", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peer-inbox-git-"));
  fs.mkdirSync(path.join(dir, ".git"));
  fs.mkdirSync(path.join(dir, ".msgbox"));
  fs.writeFileSync(
    path.join(dir, ".msgbox", "log.jsonl"),
    JSON.stringify(msg("opencode", "claude", "found via git root")) + "\n"
  );
  const r = runHook({ session_id: sid("gitbox"), cwd: dir, tool_name: "Read", tool_input: {} });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /found via git root/);
});

test("fail-open: malformed stdin exits 0 with no output", () => {
  for (const bad of ['{"tool_name":', "not json at all", ""]) {
    const r = runHook(bad, { MSGBOX: os.tmpdir() });
    assert.equal(r.code, 0, `stdin ${JSON.stringify(bad)} must exit 0`);
    assert.equal(r.stdout, "", `stdin ${JSON.stringify(bad)} must emit nothing`);
  }
});

test("fail-open: missing msg.mjs exits 0 with no output", () => {
  const { box: b } = box([msg("opencode", "claude", "unreachable")]);
  const r = runHook(
    { session_id: sid("nomsg"), cwd: b, tool_name: "Read", tool_input: {} },
    { MSGBOX: b, PEER_INBOX_MSG: path.join(b, "does-not-exist.mjs") }
  );
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "");
});

test("fail-open: a non-zero msg.mjs exits 0 with no output", () => {
  const { box: b } = box([msg("opencode", "claude", "child fails")]);
  const fake = path.join(b, "failing-msg.mjs");
  fs.writeFileSync(fake, "process.exit(2);\n");
  const r = runHook(
    { session_id: sid("childfail"), cwd: b, tool_name: "Read", tool_input: {} },
    { MSGBOX: b, PEER_INBOX_MSG: fake }
  );
  assert.equal(r.code, 0, "a failing child must not fail the tool call");
  assert.equal(r.stdout, "");
});

test("real msg.mjs compatibility: cursor advances, so the same message is not re-delivered", () => {
  const { box: b } = box([msg("opencode", "claude", "deliver exactly once")]);
  const payload = { session_id: sid("cursor"), cwd: b, tool_name: "Read", tool_input: {} };
  const first = runHook(payload, { MSGBOX: b, PEER_INBOX_MSG: REAL_MSG });
  assert.match(first.stdout, /deliver exactly once/);
  // Same mtime is not the mechanism here — force a newer mtime so the hook DOES spawn,
  // and prove msg.mjs's own cursor is what prevents a duplicate.
  touchNewer(path.join(b, "log.jsonl"));
  const second = runHook(payload, { MSGBOX: b, PEER_INBOX_MSG: REAL_MSG });
  assert.equal(second.stdout, "", "msg.mjs cursor must suppress the already-read message");
});
