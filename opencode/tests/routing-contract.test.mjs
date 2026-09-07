// Contract tests: the routing docs ARE the contract. (Ported from codex-plugin-cc's
// tests/commands.test.mjs idea — markdown files are pinned by grep-level assertions
// so a doc edit that breaks the contract fails CI instead of silently shipping.)
//
// Two layers:
//  1. routing-contract: CLAUDE.md's tier policy and the /delegate surface must keep
//     agreeing with the tier-gate plugin's constants. If someone edits the doc or the
//     plugin and the other side drifts, this fails.
//  2. tier-gate unit tests: the counting logic (lines, files, once-per-session)
//     exercised directly against the plugin module.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
// 1. Routing docs ↔ plugin contract
// ---------------------------------------------------------------------------
const CLAUDE_MD = fs.readFileSync(path.join(ROOT, "CLAUDE.md"), "utf8");

test("CLAUDE.md states the >20-line delegation default", () => {
  assert.match(CLAUDE_MD, /more than ~20 lines of new code goes to `ollama-code-engineer`/);
});

test("CLAUDE.md states the 3-file coordinated-fix trigger", () => {
  assert.match(CLAUDE_MD, /coordinated fix touching 3\+ files/);
});

test("CLAUDE.md states the fallback command the /delegate lane uses", () => {
  assert.match(CLAUDE_MD, /opencode run "<spec>" --auto -m ollama-cloud\/deepseek-v4-flash:0731/);
});

test("CLAUDE.md pins the rework bound (max 2, then sonnet)", () => {
  assert.match(CLAUDE_MD, /after 2 failures: rebuild on code-engineer \[sonnet\]/);
});

const gate = fs.readFileSync(path.join(ROOT, "opencode", "plugin", "tier-gate.js"), "utf8");

test("tier-gate constants match the CLAUDE.md thresholds", () => {
  assert.match(gate, /const LINE_THRESHOLD = 20;/);
  assert.match(gate, /const FILE_THRESHOLD = 3;/);
});

test("tier-gate never blocks — it injects a notice into the tool result", () => {
  assert.match(gate, /tool\.execute\.after/);
  assert.ok(!/"tool\.execute\.before"/.test(gate), "gate must not block writes");
});

test("tier-gate announces at most once per session", () => {
  assert.match(gate, /if \(state\.announced\) return;/);
  assert.match(gate, /state\.announced = true;/);
});

// The Claude Code port: same contract, PreToolUse-hook shape.
const claudeGate = fs.readFileSync(path.join(ROOT, "hooks", "tier-gate.js"), "utf8");

test("claude tier-gate hook mirrors the CLAUDE.md thresholds", () => {
  assert.match(claudeGate, /const LINE_THRESHOLD = 20;/);
  assert.match(claudeGate, /const FILE_THRESHOLD = 3;/);
  assert.match(claudeGate, /if \(state\.announced\) process\.exit\(0\);/);
});

test("claude tier-gate hook fails open", () => {
  assert.match(claudeGate, /catch\s*{?\s*\n?\s*process\.exit\(0\)/);
});

test("claude tier-gate hook is wired into settings.json PreToolUse", () => {
  const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
  const settings = fs.readFileSync(settingsPath, "utf8");
  const hooks = JSON.parse(settings).hooks?.PreToolUse ?? [];
  const wired = hooks.some(
    (h) => h.matcher === "Edit|Write|NotebookEdit" &&
      (h.hooks ?? []).some((k) => typeof k.command === "string" && k.command.includes("tier-gate.js"))
  );
  assert.ok(wired, "settings.json PreToolUse must invoke hooks/tier-gate.js");
});

test("CLAUDE.md documents enforcement on both CLIs", () => {
  assert.match(CLAUDE_MD, /BOTH CLIs/);
  assert.match(CLAUDE_MD, /hooks\/tier-gate\.js/);
});

// The /delegate lane.
const delegate = fs.readFileSync(path.join(ROOT, "opencode", "command", "delegate.md"), "utf8");

test("/delegate exists and routes through the delegate-build subagent", () => {
  assert.match(delegate, /Dispatch the `delegate-build` subagent/);
});

test("/delegate pins the forward-not-build contract", () => {
  assert.match(delegate, /Do NOT implement any of it yourself/);
  assert.match(delegate, /stdout verbatim/);
});

test("/delegate encodes the rework bound", () => {
  assert.match(delegate, /ONE rework round/);
  assert.match(delegate, /second failure, stop and say so/);
});

const fwd = fs.readFileSync(path.join(ROOT, "opencode", "agent", "delegate-build.md"), "utf8");

test("delegate-build agent is a thin forwarder with edit denied", () => {
  assert.match(fwd, /mode: subagent/);
  assert.match(fwd, /edit: deny/);
  assert.match(fwd, /exactly ONE Bash call/);
  assert.match(fwd, /STOP and say so rather than guessing/);
});

// ---------------------------------------------------------------------------
// 2. tier-gate unit tests — real counting behavior
// ---------------------------------------------------------------------------
const { TierGate } = await import(pathToFileURL(path.join(ROOT, "opencode", "plugin", "tier-gate.js")).href);

async function hookFor(directory) {
  const plugin = await TierGate({ directory });
  return plugin["tool.execute.after"];
}

function fakeOutput() {
  return { output: "ok" };
}

test("small edits stay quiet", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-gate-test-"));
  const hook = await hookFor(dir);
  const out = fakeOutput();
  await hook({ tool: "edit", sessionID: "s-quiet", callID: "c1", args: { filePath: path.join(dir, "a.js"), newString: "x\ny" } }, out);
  assert.equal(out.output, "ok");
});

test("a 22-line write triggers the notice once", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-gate-test-"));
  const hook = await hookFor(dir);
  const big = Array.from({ length: 22 }, (_, i) => `line ${i}`).join("\n"); // 21 newlines > 20

  const out1 = fakeOutput();
  await hook({ tool: "write", sessionID: "s-lines", callID: "c1", args: { filePath: path.join(dir, "big.js"), content: big } }, out1);
  assert.match(out1.output, /\[tier-gate\] Tier policy crossed/);

  // second call same session: already announced, stays quiet
  const out2 = fakeOutput();
  await hook({ tool: "write", sessionID: "s-lines", callID: "c2", args: { filePath: path.join(dir, "big2.js"), content: big } }, out2);
  assert.equal(out2.output, "ok");
});

test("exactly 20 newlines does not trigger; 21 does", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-gate-test-"));
  const hook = await hookFor(dir);
  const twenty = Array.from({ length: 21 }, (_, i) => `l${i}`).join("\n"); // 21 items = 20 newlines
  const out = fakeOutput();
  await hook({ tool: "write", sessionID: "s-edge", callID: "c1", args: { filePath: path.join(dir, "e.js"), content: twenty } }, out);
  assert.equal(out.output, "ok");
});

test("three distinct files with tiny edits trigger the notice", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-gate-test-"));
  const hook = await hookFor(dir);
  for (const name of ["a.js", "b.js", "c.js"]) {
    const out = fakeOutput();
    await hook({ tool: "edit", sessionID: "s-files", callID: name, args: { filePath: path.join(dir, name), newString: "one line" } }, out);
    if (name === "c.js") {
      assert.match(out.output, /3 files/);
    } else {
      assert.equal(out.output, "ok");
    }
  }
});

test("read tools are ignored; state never leaks across sessions", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-gate-test-"));
  const hook = await hookFor(dir);
  const out = fakeOutput();
  await hook({ tool: "read", sessionID: "s-iso1", callID: "c1", args: { filePath: path.join(dir, "x.js") } }, out);
  assert.equal(out.output, "ok");

  // two files in session A, same two files in session B — neither crosses alone
  for (const s of ["s-isoA", "s-isoB"]) {
    for (const name of ["a.js", "b.js"]) {
      const o = fakeOutput();
      await hook({ tool: "edit", sessionID: s, callID: name, args: { filePath: path.join(dir, name), newString: "x" } }, o);
      assert.equal(o.output, "ok", `${s}/${name} should stay quiet`);
    }
  }
});

test("state persists across plugin instances for the same session", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-gate-test-"));
  const hook1 = await hookFor(dir);
  const hook2 = await hookFor(dir); // fresh instance, e.g. after restart
  const out1 = fakeOutput();
  await hook1({ tool: "edit", sessionID: "s-persist", callID: "c1", args: { filePath: path.join(dir, "a.js"), newString: "x\ny\nz\nw\nv" } }, out1);
  assert.equal(out1.output, "ok");
  const out2 = fakeOutput();
  await hook2({ tool: "edit", sessionID: "s-persist", callID: "c2", args: { filePath: path.join(dir, "b.js"), newString: "x\ny\nz\nw\nv" } }, out2);
  assert.equal(out2.output, "ok");
  const out3 = fakeOutput();
  await hook2({ tool: "edit", sessionID: "s-persist", callID: "c3", args: { filePath: path.join(dir, "c.js"), newString: "x\ny\nz\nw\nv" } }, out3);
  assert.match(out3.output, /\[tier-gate\]/);
});