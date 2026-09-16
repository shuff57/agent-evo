// Contract tests for guard-rails.js. Pattern follows routing-contract.test.mjs:
// import the plugin with pathToFileURL, build the hook via the factory, poke
// the hook functions directly with plain objects.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLUGIN = path.join(ROOT, "opencode", "plugin", "guard-rails.js");

const mod = await import(pathToFileURL(PLUGIN).href);
const { GuardRails } = mod;

async function build() {
  return await GuardRails({ directory: os.tmpdir() });
}

function toolArgs(tool, args, output) {
  return { tool, sessionID: "s1", callID: "c1", args, output };
}

test("export shape: one function export, helpers are properties", () => {
  assert.equal(typeof GuardRails, "function");
  assert.equal(typeof GuardRails.truncateOutput, "function");
  assert.equal(typeof GuardRails.sortKeysDeep, "function");
  const fns = Object.keys(mod).filter((k) => typeof mod[k] === "function");
  assert.deepEqual(fns, ["GuardRails"]);
});

test("sortKeysDeep sorts recursively, keeps array order", () => {
  assert.deepEqual(
    GuardRails.sortKeysDeep({ b: 1, a: { y: 2, x: [3, { n: 1, m: 2 }] } }),
    { a: { x: [3, { m: 2, n: 1 }], y: 2 }, b: 1 }
  );
  assert.deepEqual(GuardRails.sortKeysDeep([2, 1]), [2, 1]);
  assert.equal(GuardRails.sortKeysDeep("x"), "x");
  assert.equal(GuardRails.sortKeysDeep(null), null);
});

test("truncateOutput helper: caps, floors, idempotence", () => {
  const long = "line\n".repeat(60000); // 300000 chars
  const r = GuardRails.truncateOutput(long, 200000);
  assert.ok(r.output.length < 201000);
  assert.ok(r.output.startsWith("line\n"));
  assert.ok(r.output.includes("[guard-rails truncated"));
  assert.equal(GuardRails.truncateOutput(r.output, 200000), null);
  // one-line output longer than cap: cut at cap, no newline adjustment
  const oneLine = "x".repeat(250000);
  const r2 = GuardRails.truncateOutput(oneLine, 200000);
  assert.ok(r2.output.includes("[guard-rails truncated"));
  // never below the 2000 floor
  const r3 = GuardRails.truncateOutput("y".repeat(5000), 10);
  assert.ok(r3.output.length > 2000);
  // short output untouched
  assert.equal(GuardRails.truncateOutput("hi", 10), null);
});

test("truncation: 300k grep output truncated below 201k; 100-char untouched; 100k webfetch under 41k", async () => {
  const h = await build();
  const after = h["tool.execute.after"];

  const big = { title: "t", output: "row\n".repeat(75000), metadata: {} }; // 300k chars
  await after({ tool: "grep", sessionID: "s", callID: "c", args: {} }, big);
  assert.ok(big.output.length < 201000);
  assert.ok(big.output.startsWith("row\n"));
  assert.ok(big.output.includes("[guard-rails truncated"));

  const small = { title: "t", output: "x".repeat(100), metadata: {} };
  await after({ tool: "grep", sessionID: "s", callID: "c2", args: {} }, small);
  assert.equal(small.output, "x".repeat(100));

  const web = { title: "t", output: "w".repeat(100000), metadata: {} };
  await after({ tool: "webfetch", sessionID: "s", callID: "c3", args: {} }, web);
  assert.ok(web.output.length < 41000);
  assert.ok(web.output.includes("[guard-rails truncated"));
});

test("truncation idempotence: second pass adds no second marker", async () => {
  const h = await build();
  const after = h["tool.execute.after"];
  const out = { title: "t", output: "r\n".repeat(120000), metadata: {} }; // 240k chars
  await after({ tool: "glob", sessionID: "s", callID: "c", args: {} }, out);
  const once = out.output;
  await after({ tool: "glob", sessionID: "s", callID: "c2", args: {} }, out);
  assert.equal(out.output, once);
  assert.equal(out.output.split("[guard-rails truncated").length - 1, 1);
});

test("edit recovery: matches get the reminder, clean output does not, no double-append", async () => {
  const h = await build();
  const after = h["tool.execute.after"];

  const failed = { title: "t", output: "Error: oldString not found in file", metadata: {} };
  await after({ tool: "edit", sessionID: "s", callID: "c", args: {} }, failed);
  assert.ok(failed.output.includes("[edit-recovery]"));
  await after({ tool: "edit", sessionID: "s", callID: "c2", args: {} }, failed);
  assert.equal(failed.output.split("[edit-recovery]").length - 1, 1);

  const ok = { title: "t", output: "all good", metadata: {} };
  await after({ tool: "edit", sessionID: "s", callID: "c3", args: {} }, ok);
  assert.equal(ok.output, "all good");
});

test("edit recovery matches case-insensitively across edit-family tools", async () => {
  const h = await build();
  const after = h["tool.execute.after"];
  const out = { title: "t", output: "oldString found multiple times", metadata: {} };
  await after({ tool: "MultiEdit", sessionID: "s", callID: "c", args: {} }, out);
  assert.ok(out.output.includes('[edit-recovery] The edit failed (matched: "oldstring found multiple times")'));
});

test("json recovery: bash ignored, grep appends once", async () => {
  const h = await build();
  const after = h["tool.execute.after"];

  const bashOut = { title: "t", output: "Unexpected end of JSON input", metadata: {} };
  await after({ tool: "bash", sessionID: "s", callID: "c", args: {} }, bashOut);
  assert.equal(bashOut.output, "Unexpected end of JSON input");

  const grepOut = { title: "t", output: "Unexpected end of JSON input", metadata: {} };
  await after({ tool: "grep", sessionID: "s", callID: "c", args: {} }, grepOut);
  assert.ok(grepOut.output.includes("[json-recovery]"));
  await after({ tool: "grep", sessionID: "s", callID: "c2", args: {} }, grepOut);
  assert.equal(grepOut.output.split("[json-recovery]").length - 1, 1);
});

test("empty task output becomes the no-output warning", async () => {
  const h = await build();
  const after = h["tool.execute.after"];
  const out = { title: "t", output: "", metadata: {} };
  await after({ tool: "task", sessionID: "s", callID: "c", args: {} }, out);
  assert.ok(out.output.startsWith("[task-guard] The subagent returned no output at all."));
});

test("task resume: id from args.sessionID lands as task(session_id=...)", async () => {
  const h = await build();
  const after = h["tool.execute.after"];
  const out = { title: "t", output: "done", metadata: {} };
  await after({ tool: "task", sessionID: "s", callID: "c", args: { sessionID: "ses_abc" } }, out);
  assert.ok(out.output.includes('to continue: task(session_id="ses_abc")'));

  const out2 = { title: "t", output: "done", metadata: { sessionId: "ses_def" } };
  await after({ tool: "task", sessionID: "s", callID: "c2", args: {} }, out2);
  assert.ok(out2.output.includes('to continue: task(session_id="ses_def")'));
});

test("loop guard: announces on the 20th identical call, once; resets on new args", async () => {
  const h = await build();
  const after = h["tool.execute.after"];
  const call = (out) => after({ tool: "bash", sessionID: "s-loop", callID: "c", args: { command: "ls" } }, out);

  const out19 = { title: "t", output: "ok", metadata: {} };
  for (let i = 0; i < 19; i++) await call(out19);
  assert.ok(!out19.output.includes("[loop-guard]"));

  const out20 = { title: "t", output: "ok", metadata: {} };
  await call(out20);
  assert.ok(out20.output.includes("[loop-guard]"));
  assert.ok(out20.output.includes("20 times consecutively"));

  const out21 = { title: "t", output: "ok", metadata: {} };
  await call(out21); // same signature already announced
  assert.equal(out21.output, "ok");

  // a different arg resets the count: fresh 19 identical calls stay silent
  const outB = { title: "t", output: "ok", metadata: {} };
  for (let i = 0; i < 19; i++) {
    await after({ tool: "bash", sessionID: "s-loop", callID: "c", args: { command: "pwd" } }, outB);
  }
  assert.ok(!outB.output.includes("[loop-guard]"));

  // ...and call 20 of the second signature announces again
  await after({ tool: "bash", sessionID: "s-loop", callID: "c", args: { command: "pwd" } }, outB);
  assert.ok(outB.output.includes("[loop-guard]"));
});

test("loop guard ignores non-counting tools and other sessions", async () => {
  const h = await build();
  const after = h["tool.execute.after"];
  const out = { title: "t", output: "ok", metadata: {} };
  for (let i = 0; i < 25; i++) {
    await after({ tool: "webfetch", sessionID: "s-noloop", callID: "c", args: { url: "x" } }, out);
  }
  assert.equal(out.output, "ok");
});

test("context monitor: announces at 85% once, then never again; low usage silent", async () => {
  const h = await build();
  const event = h.event;
  const after = h["tool.execute.after"];

  // 80000 input + 90000 cache read = 170000 / 200000 = 85%
  await event({ event: { type: "message.updated", properties: { sessionID: "s-ctx", info: { role: "assistant", providerID: "anthropic", modelID: "claude-x", tokens: { input: 80000, cache: { read: 90000 } } } } } });

  const out = { title: "t", output: "ok", metadata: {} };
  await after({ tool: "grep", sessionID: "s-ctx", callID: "c", args: {} }, out);
  assert.ok(out.output.includes("[context-monitor]"));
  assert.ok(out.output.includes("85.0% used (170000/200000 tokens)"));

  const out2 = { title: "t", output: "ok", metadata: {} };
  await after({ tool: "grep", sessionID: "s-ctx", callID: "c2", args: {} }, out2);
  assert.equal(out2.output, "ok");

  await event({ event: { type: "message.updated", properties: { sessionID: "s-low", info: { role: "assistant", providerID: "anthropic", tokens: { input: 1000, cache: { read: 0 } } } } } });
  const out3 = { title: "t", output: "ok", metadata: {} };
  await after({ tool: "grep", sessionID: "s-low", callID: "c", args: {} }, out3);
  assert.equal(out3.output, "ok");
});

test("context monitor: unknown provider and session.deleted cleanup", async () => {
  const h = await build();
  const event = h.event;
  const after = h["tool.execute.after"];

  await event({ event: { type: "message.updated", properties: { sessionID: "s-unk", info: { role: "assistant", providerID: "mystery", tokens: { input: 999999, cache: { read: 999999 } } } } } });
  const out = { title: "t", output: "ok", metadata: {} };
  await after({ tool: "grep", sessionID: "s-unk", callID: "c", args: {} }, out);
  assert.equal(out.output, "ok");

  // delete a known session's cache: its next call is silent
  await event({ event: { type: "message.updated", properties: { sessionID: "s-del", info: { role: "assistant", providerID: "anthropic", tokens: { input: 190000, cache: { read: 0 } } } } } });
  const pre = { title: "t", output: "ok", metadata: {} };
  await after({ tool: "grep", sessionID: "s-del", callID: "c", args: {} }, pre);
  assert.ok(pre.output.includes("[context-monitor]"));
  const h2 = await build();
  await h2.event({ event: { type: "message.updated", properties: { sessionID: "s-del2", info: { role: "assistant", providerID: "anthropic", tokens: { input: 190000, cache: { read: 0 } } } } } });
  await h2.event({ event: { type: "session.deleted", properties: { sessionID: "s-del2" } } });
  const post = { title: "t", output: "ok", metadata: {} };
  await h2["tool.execute.after"]({ tool: "grep", sessionID: "s-del2", callID: "c", args: {} }, post);
  assert.equal(post.output, "ok");
});

test("fail-open: hooks survive undefined / null-ish inputs", async () => {
  const h = await build();
  await h.event({ event: undefined });
  await h.event(undefined);
  await h.event({ event: null });
  await h.event({ event: { type: "message.updated", properties: null } });
  await h["tool.execute.after"](undefined, undefined);
  await h["tool.execute.after"]({}, {});
  await h["tool.execute.after"]({ tool: "grep", sessionID: "s", callID: "c" }, { title: "t" });
  await h["tool.execute.after"]({ tool: null, sessionID: null, args: null }, { output: null });
  await h["tool.execute.after"]({ tool: "task", sessionID: "s", args: null }, { output: null, metadata: null });
  await h["tool.execute.after"]({ tool: "bash", sessionID: "s", args: undefined }, { output: "ok" });
});

test("event with no tokens does not poison the cache", async () => {
  const h = await build();
  await h.event({ event: { type: "message.updated", properties: { sessionID: "s-nt", info: { role: "assistant", tokens: null } } } });
  const out = { title: "t", output: "ok", metadata: {} };
  await h["tool.execute.after"]({ tool: "grep", sessionID: "s-nt", callID: "c", args: {} }, out);
  assert.equal(out.output, "ok");
});