// Contract tests for handoff.mjs's peer-registry heartbeat.
//
// Run with: bun test bin/peer/handoff.test.mjs
// (`node --test` works only where a real Node.js is installed. Where `node` is a bun
// shim it runs the file with no runner at all and node:test throws on the first case.)
//
// Lives beside the peer units rather than next to handoff.mjs because the heartbeat is
// the peer-facing half of that file, and this way it runs with `bun test bin/peer/`.
//
// handoff launches `opencode` through a shell, so a fake first on PATH makes the whole
// dispatch hermetic: no model, no tokens, no network. That matters because the only
// alternative is a live run, and a test nobody can afford to run is a test nobody runs.
//
// The poller lives in THIS process, which is safe only because handoff is spawned
// asynchronously. handoff itself uses spawnSync, so anything polling inside handoff's own
// process would be frozen for the whole dispatch and would sample nothing — measured,
// while writing this: the first probe reported "never went busy" for a heartbeat that was
// working perfectly.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

import {
  STATUS,
  defaultRegistryDir,
  emptyRegistry,
  loadRegistry,
  peerIdForBoxLane,
  registerPeer,
  registryPath,
  saveRegistry,
} from './registry.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HANDOFF = path.resolve(HERE, '..', 'handoff.mjs');
const laneIdFor = (box) => peerIdForBoxLane('opencode', box);

const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

/** A stand-in for opencode that takes long enough to be observed, then succeeds. */
function fakeOpencode(dir, { sleep = 1.5, produces = null, exit = 0 } = {}) {
  const binDir = path.join(dir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'opencode'), [
    '#!/bin/sh',
    `sleep ${sleep}`,
    produces ? `printf done > '${produces}'` : '',
    `exit ${exit}`,
  ].filter(Boolean).join('\n') + '\n', { mode: 0o755 });
  return binDir;
}

function registerLane(box, status = STATUS.IDLE) {
  const file = registryPath(defaultRegistryDir(box));
  saveRegistry(file, registerPeer(emptyRegistry(), {
    peerId: laneIdFor(box), name: 'opencode', pid: process.pid, status,
  }).registry);
  return file;
}

function runHandoff(box, binDir, args) {
  const env = { ...process.env, MSGBOX: box, PATH: `${binDir}:${process.env.PATH}` };
  const child = spawn(process.execPath, [HANDOFF, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => { stderr += d; });
  child.stdout.resume();
  return { child, stderr: () => stderr };
}

/** Records every status CHANGE while `fn` runs, so a transition cannot be missed. */
async function watchStatus(file, fn) {
  // The box is recoverable from the registry path: <box>/peer/registry.json.
  const box = path.dirname(path.dirname(file));
  const seen = [];
  const tick = () => {
    const s = fs.existsSync(file) ? (loadRegistry(file).peers[laneIdFor(box)]?.status ?? 'gone') : 'no-registry';
    if (seen.at(-1) !== s) seen.push(s);
  };
  tick();
  const timer = setInterval(tick, 50);
  try { await fn(); } finally { clearInterval(timer); tick(); }
  return seen;
}

function writeSpec(box) {
  const spec = path.join(box, 'SPEC.md');
  fs.writeFileSync(spec, '# Task\n\nDo the thing.\n');
  return spec;
}

test('a synchronous dispatch flips the lane busy, then idle again', async () => {
  const box = tmp('handoff-busy-');
  const file = registerLane(box);
  const produced = path.join(box, 'out.txt');
  const binDir = fakeOpencode(box, { produces: produced });

  const seen = await watchStatus(file, async () => {
    const { child } = runHandoff(box, binDir, ['--spec', writeSpec(box), '--expect', produced]);
    const [code] = await once(child, 'exit');
    assert.equal(code, 0, 'the dispatch itself must succeed');
  });

  assert.deepEqual(seen, ['idle', 'busy', 'idle'],
    'a lane that never goes busy tells `peer list` nothing is happening while a run burns minutes');
});

test('a failed dispatch still returns the lane to idle', async () => {
  const box = tmp('handoff-fail-');
  const file = registerLane(box);
  // Nothing produces the expected file, so handoff reports failure.
  const binDir = fakeOpencode(box, { sleep: 0.5 });

  const { child } = runHandoff(box, binDir, ['--spec', writeSpec(box), '--expect', path.join(box, 'never.txt')]);
  const [code] = await once(child, 'exit');

  assert.notEqual(code, 0, 'a missing expected file is a failed dispatch');
  assert.equal(loadRegistry(file).peers[laneIdFor(box)].status, STATUS.IDLE,
    'a stuck busy lane would look like a run that never ended');
});

test('a detached dispatch leaves the lane busy, deliberately', async () => {
  const box = tmp('handoff-detach-');
  const file = registerLane(box);
  const binDir = fakeOpencode(box, { sleep: 0.2 });

  const { child } = runHandoff(box, binDir, ['--spec', writeSpec(box), '--detach']);
  await once(child, 'exit');

  // The parent exits immediately while the run continues, so writing idle here would
  // race the run and lie about it. The stale window owns that transition instead.
  assert.equal(loadRegistry(file).peers[laneIdFor(box)].status, STATUS.BUSY);
});

test('with no registry, a dispatch creates nothing', async () => {
  const box = tmp('handoff-noreg-');
  const produced = path.join(box, 'out.txt');
  const binDir = fakeOpencode(box, { sleep: 0.2, produces: produced });
  const peerDir = defaultRegistryDir(box);

  const { child } = runHandoff(box, binDir, ['--spec', writeSpec(box), '--expect', produced]);
  const [code] = await once(child, 'exit');

  assert.equal(code, 0, 'a box that never opted into the bridge still dispatches normally');
  assert.equal(fs.existsSync(peerDir), false, 'handoff must never fabricate registry state');
});

test('a foreign lane entry is left alone', async () => {
  const box = tmp('handoff-foreign-');
  const file = registryPath(defaultRegistryDir(box));
  const foreign = { peerId: laneIdFor(box), name: 'opencode', managedBy: 'another-tool', pid: process.pid, status: STATUS.IDLE };
  saveRegistry(file, { ...emptyRegistry(), peers: { [laneIdFor(box)]: foreign } });
  const produced = path.join(box, 'out.txt');
  const binDir = fakeOpencode(box, { sleep: 0.2, produces: produced });

  const { child } = runHandoff(box, binDir, ['--spec', writeSpec(box), '--expect', produced]);
  await once(child, 'exit');

  const after = loadRegistry(file).peers[laneIdFor(box)];
  assert.equal(after.managedBy, 'another-tool');
  assert.equal(after.status, STATUS.IDLE, 'another tool owns this entry; a dispatch does not get to move it');
});
