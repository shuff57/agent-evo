// Test harness for hooks/tier-gate.js — drives it with real PreToolUse payload
// shapes via child_process, asserting on stdout JSON and exit codes.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "tier-gate.js");
const STATE = path.join(os.tmpdir(), "claude-tier-gate");

// execFile+promisify hangs with stdin input on this Windows/node combo; spawn directly.
function fire(payload, env = {}) {
  return new Promise((resolve, reject) => {
    const c = spawn("node", [HOOK], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (err += d));
    c.on("close", (code) => resolve({ stdout: out.trim(), stderr: err.trim(), code }));
    c.on("error", reject);
    c.stdin.write(typeof payload === "string" ? payload : JSON.stringify(payload));
    c.stdin.end();
  });
}

const sid = `test-${Date.now()}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-"));

let r = await fire({ session_id: sid, cwd: tmp, tool_name: "Read", tool_input: { file_path: "a.js" } });
assert.equal(r.code, 0, "read exits 0");
assert.equal(r.stdout, "", "read: no output");

r = await fire({ session_id: sid, cwd: tmp, tool_name: "Edit", tool_input: { file_path: path.join(tmp, "a.js"), new_string: "x\ny" } });
assert.equal(r.code, 0);
assert.equal(r.stdout, "", "small edit stays quiet");

const big = Array.from({ length: 22 }, (_, i) => `line ${i}`).join("\n"); // 21 newlines
r = await fire({ session_id: sid, cwd: tmp, tool_name: "Write", tool_input: { file_path: path.join(tmp, "big.js"), content: big } });
assert.equal(r.code, 0);
const j = JSON.parse(r.stdout);
assert.match(j.hookSpecificOutput.additionalContext, /\[tier-gate\] Tier policy crossed: 21 lines written in one call/);
assert.equal(j.hookSpecificOutput.hookEventName, "PreToolUse");

r = await fire({ session_id: sid, cwd: tmp, tool_name: "Edit", tool_input: { file_path: path.join(tmp, "b.js"), new_string: big } });
assert.equal(r.stdout, "", "already announced: quiet for rest of session");

const sid2 = `${sid}-b`;
for (const name of ["a.js", "b.js", "c.js"]) {
  r = await fire({ session_id: sid2, cwd: tmp, tool_name: "Edit", tool_input: { file_path: path.join(tmp, name), new_string: "one line" } });
}
assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /3 files/);

r = await fire({ session_id: sid2, cwd: tmp, tool_name: "Write", tool_input: { file_path: path.join(tmp, "x.js"), content: "tiny" } });
assert.equal(r.stdout, "", "sid2 announced already");

const sid3 = `${sid}-c`;
for (const name of ["a.js", "b.js"]) {
  r = await fire({ session_id: sid3, cwd: tmp, tool_name: "Edit", tool_input: { file_path: path.join(tmp, name), new_string: "x" } });
  assert.equal(r.stdout, "", `${name} quiet`);
}

r = await fire({ session_id: `${sid}-d`, cwd: tmp, tool_name: "Edit", tool_input: { file_path: path.join(tmp, "a.js"), new_string: "x" } }, { CLAUDE_AGENT_ID: "sisyphus-junior" });
assert.equal(r.stdout, "", "subagent (CLAUDE_AGENT_ID) exempt");

r = await fire({ garbage: true });
assert.equal(r.code, 0, "malformed payload exits 0 (fail-open)");

r = await fire("not json at all");
assert.equal(r.code, 0, "bad json exits 0 (fail-open)");
assert.equal(r.stdout, "", "bad json: no output");

// session isolation across cwds
const sid4 = `${sid}-e`;
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "tg2-"));
await fire({ session_id: sid4, cwd: tmp, tool_name: "Edit", tool_input: { file_path: path.join(tmp, "a.js"), new_string: "x" } });
await fire({ session_id: sid4, cwd: tmp, tool_name: "Edit", tool_input: { file_path: path.join(tmp, "b.js"), new_string: "x" } });
r = await fire({ session_id: sid4, cwd: tmp2, tool_name: "Edit", tool_input: { file_path: path.join(tmp2, "a.js"), new_string: "x" } });
assert.equal(r.stdout, "", "same session, different cwd: fresh counter (a.js is file #1 there)");

console.log("PASS: tier-gate hook — 12 behavioral checks");
// cleanup our test state files
for (const f of fs.readdirSync(STATE)) {
  if (f.startsWith(sid)) fs.rmSync(path.join(STATE, f));
}