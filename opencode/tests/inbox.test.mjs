// Contract tests for inbox.js. Same pattern as guard-rails.test.mjs: import the plugin with
// pathToFileURL, build the hook via the factory, poke it with plain objects.
//
// The peer-registry half is the part under test here: the plugin may only HEARTBEAT a peer a
// sidecar already registered. It must never create registry.json, never mint a key, and never
// rewrite the registry more than once per debounce window. Every box is a throwaway tmpdir.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import {
  MANAGED_BY,
  STATUS,
  defaultRegistryDir,
  peerIdForLane,
  loadRegistry,
  registryPath,
  registerPeer,
  emptyRegistry,
  saveRegistry,
} from "../../bin/peer/registry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLUGIN = path.join(ROOT, "opencode", "plugin", "inbox.js");

const mod = await import(pathToFileURL(PLUGIN).href);
const { Inbox } = mod;

// peerIdForLane is the CONTRACT — the same function the sidecar registers under. An earlier
// version of this line recomputed the plugin's own seed instead, so it passed while the plugin
// looked for an id no sidecar would ever write and the heartbeat was a permanent no-op.
// Derive the expectation from the shared definition, never from the code under test.
const LANE = process.env.MSGBOX_AS || "opencode";
const PEER_ID = peerIdForLane(LANE);

function makeBox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "inbox-test-"));
}

// A box with a registry.json holding one managed peer for this lane.
function boxWithPeer() {
  const box = makeBox();
  const file = registryPath(defaultRegistryDir(box));
  const reg = registerPeer(emptyRegistry(), {
    peerId: PEER_ID,
    managedBy: MANAGED_BY,
    pid: process.pid,
    status: STATUS.IDLE,
  }).registry;
  saveRegistry(file, reg);
  return { box, file };
}

async function hookFor(box) {
  // findBox honours MSGBOX before walking up from `directory`, so point it at the throwaway box
  // the same way the launcher does; otherwise a tmpdir with no .git resolves to ~/.claude/msgbox.
  process.env.MSGBOX = box;
  const plugin = await Inbox({ directory: box });
  return plugin["tool.execute.after"];
}

const call = (hook, tool = "read") => hook({ tool, sessionID: "s1", callID: "c1", input: {} }, { output: "ok" });

test("export shape: only Inbox is exported, findBox stays a property", () => {
  assert.equal(typeof Inbox, "function");
  assert.equal(typeof Inbox.findBox, "function");
  const fns = Object.keys(mod).filter((k) => typeof mod[k] === "function");
  assert.deepEqual(fns, ["Inbox"]);
});

test("existing registered peer: updatedAt advances and status becomes busy", async () => {
  const { box, file } = boxWithPeer();
  const before = loadRegistry(file).peers[PEER_ID];
  assert.equal(before.status, STATUS.IDLE);

  const hook = await hookFor(box);
  await call(hook);

  const after = loadRegistry(file).peers[PEER_ID];
  assert.equal(after.status, STATUS.BUSY, "tool activity marks the lane busy");
  assert.ok(Date.parse(after.updatedAt) >= Date.parse(before.updatedAt), "heartbeat advances updatedAt");
  assert.equal(after.managedBy, MANAGED_BY, "the entry stays managed");
});

test("debounce: repeated calls inside the window do not rewrite the registry", async () => {
  const { box, file } = boxWithPeer();
  const hook = await hookFor(box);

  await call(hook);
  const first = fs.readFileSync(file, "utf8");

  await call(hook);
  await call(hook);
  const second = fs.readFileSync(file, "utf8");

  assert.equal(second, first, "a burst of tool calls must not rewrite the registry");
});

test("absent registry.json is never created", async () => {
  const box = makeBox();
  const file = registryPath(defaultRegistryDir(box));
  assert.equal(fs.existsSync(file), false);

  const hook = await hookFor(box);
  await call(hook);
  await call(hook);

  assert.equal(fs.existsSync(file), false, "the plugin must not fabricate a registry");
  assert.equal(fs.existsSync(defaultRegistryDir(box)), false, "nor the peer directory");
});

test("missing peer entry is a no-op, not a registration", async () => {
  const box = makeBox();
  const file = registryPath(defaultRegistryDir(box));
  saveRegistry(file, emptyRegistry());

  const hook = await hookFor(box);
  await call(hook);

  assert.deepEqual(loadRegistry(file).peers, {}, "an unregistered lane is not added");
});

test("corrupt registry is a no-op and is left untouched", async () => {
  const box = makeBox();
  const file = registryPath(defaultRegistryDir(box));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "{ not json");

  const hook = await hookFor(box);
  await assert.doesNotReject(() => call(hook));
  assert.equal(fs.readFileSync(file, "utf8"), "{ not json", "a corrupt file is not rewritten");
});

test("fail-open: hook survives garbage input without throwing", async () => {
  const { box } = boxWithPeer();
  const hook = await hookFor(box);
  await assert.doesNotReject(() => hook(undefined, undefined));
  await assert.doesNotReject(() => hook({}, {}));
  await assert.doesNotReject(() => hook({ tool: null, input: null }, { output: null }));
});
