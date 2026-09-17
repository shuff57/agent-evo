import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "loop-guard.js");

// Unique per run: state persists in %TMP% keyed by session id, so a fixed id would
// inherit a previous run's counter.
const RUN = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
const sid = (name) => `${name}-${RUN}`;

function call(payload, env = {}) {
  try {
    const stdout = execFileSync(process.execPath, [HOOK], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: { ...process.env, ...env },
      timeout: 15000,
    });
    return { stdout: stdout.trim(), code: 0 };
  } catch (e) {
    return { stdout: (e.stdout ?? "").trim(), code: e.status ?? 1 };
  }
}

function stateFor(sessionId) {
  const key = crypto.createHash("sha256").update(String(sessionId)).digest("hex").slice(0, 24);
  return path.join(os.tmpdir(), `claude-loop-guard-${key}.json`);
}

test("19 identical calls stay silent, the 20th announces exactly once", () => {
  const s = sid("loop");
  const payload = { session_id: s, tool_name: "Bash", tool_input: { command: "npm test" } };
  for (let i = 1; i <= 19; i++) {
    const r = call(payload);
    assert.equal(r.stdout, "", `call ${i} must stay silent`);
  }
  const twentieth = call(payload);
  assert.match(twentieth.stdout, /\[loop-guard\]/);
  assert.match(twentieth.stdout, /20 times consecutively/);
  const twentyFirst = call(payload);
  assert.equal(twentyFirst.stdout, "", "must not announce the same signature twice");
});

test("a different command resets the counter", () => {
  const s = sid("reset");
  for (let i = 1; i <= 19; i++) {
    call({ session_id: s, tool_name: "Bash", tool_input: { command: "npm test" } });
  }
  const other = call({ session_id: s, tool_name: "Bash", tool_input: { command: "git status" } });
  assert.equal(other.stdout, "", "different args start a fresh count");
  for (let i = 1; i <= 18; i++) {
    const r = call({ session_id: s, tool_name: "Bash", tool_input: { command: "git status" } });
    assert.equal(r.stdout, "", `second signature call ${i} must stay silent`);
  }
  const final = call({ session_id: s, tool_name: "Bash", tool_input: { command: "git status" } });
  assert.match(final.stdout, /\[loop-guard\]/, "the second signature announces on its own 20th");
});

test("key order does not change the signature", () => {
  const s = sid("order");
  for (let i = 1; i <= 19; i++) {
    call({ session_id: s, tool_name: "Edit", tool_input: { file_path: "a.js", old_string: "x" } });
  }
  const reordered = call({
    session_id: s,
    tool_name: "Edit",
    tool_input: { old_string: "x", file_path: "a.js" },
  });
  assert.match(reordered.stdout, /\[loop-guard\]/, "same call with keys swapped is the same call");
});

test("non-loop tools are ignored entirely", () => {
  const s = sid("excluded");
  for (let i = 1; i <= 25; i++) {
    const r = call({ session_id: s, tool_name: "Task", tool_input: { prompt: "same" } });
    assert.equal(r.stdout, "", "Task repeats legitimately and must not trip the guard");
  }
  const stateExists = fs.existsSync(stateFor(s));
  assert.equal(stateExists, false, "an excluded tool must not even write state");
});

test("limit is tunable and sessions are isolated", () => {
  const a = sid("a");
  const b = sid("b");
  const payloadA = { session_id: a, tool_name: "Bash", tool_input: { command: "x" } };
  const payloadB = { session_id: b, tool_name: "Bash", tool_input: { command: "x" } };
  // A gets 4, B gets 3 — so A's 5th is its trigger while B's 4th is still under.
  for (let i = 1; i <= 4; i++) call(payloadA, { LOOP_GUARD_LIMIT: "5" });
  for (let i = 1; i <= 3; i++) call(payloadB, { LOOP_GUARD_LIMIT: "5" });
  const fifthA = call(payloadA, { LOOP_GUARD_LIMIT: "5" });
  assert.match(fifthA.stdout, /limit 5/, "env limit must be honored");
  assert.equal(
    call(payloadB, { LOOP_GUARD_LIMIT: "5" }).stdout,
    "",
    "session B's own 4th call is under its limit — A's counts must not leak into B"
  );
});

test("malformed payloads fail open", () => {
  for (const bad of ['{"tool_name":', "not json at all", ""]) {
    try {
      execFileSync(process.execPath, [HOOK], { input: bad, encoding: "utf8", timeout: 10000 });
    } catch (e) {
      assert.equal(e.status, 0, `stdin ${JSON.stringify(bad)} must exit 0`);
    }
  }
});
