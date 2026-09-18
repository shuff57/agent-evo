// client.test.mjs — contract tests for bin/peer.mjs
//
// Run with: bun test bin/peer/client.test.mjs
// (`node --test` works only where a real Node.js is installed. Where `node` is a bun
// shim it runs the file with no runner at all and node:test throws on the first case.)
//
// Tests cover:
// 1. send: resolves target, auths with own key, delivers message
// 2. send: forged envelope from-name does not override registry identity
// 3. send: priority recorded
// 4. send: missing target fails without append
// 4b. send: missing priority defaults
// 5. list: shows registered peers
// 6. status: flips existing entry busy/idle
// 7. where: agrees with msg.mjs box resolution
// 8. missing args show usage and exit 2

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

import { buildEnvelope, buildMessageFrame, encodeFrames } from './codec.mjs';
import {
  MANAGED_BY,
  STATUS,
  defaultRegistryDir,
  derivePeerId,
  ensureKeyFile,
  hashKeyContents,
  keyPathFor,
  listManagedPeers,
  platformIdentity,
  registryPath,
  registerPeer,
  withRegistry,
} from './registry.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// bin/peer.mjs, NOT bin/peer/peer.mjs — the tests live one level below the CLI.
const CLI = path.resolve(HERE, '..', 'peer.mjs');
const SIDECAR = path.resolve(HERE, '..', 'peer-sidecar.mjs');

const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function cleanEnv(extra) {
  const env = { ...process.env };
  for (const key of ['MSGBOX', 'PEER_NAME', 'PEER_MSGBOX_AS', 'PEER_CWD', 'PEER_INBOX_MSG', 'AGENT_EVO_PEER', 'XDG_RUNTIME_DIR', 'CLAUDE_CONFIG_DIR']) delete env[key];
  return { ...env, ...extra };
}

// Every spawned sidecar is killed when this process exits, however it exits — a test
// that throws before its own stop() would otherwise strand a daemon heartbeating into a
// deleted tmpdir. See the same guard in sidecar.test.mjs.
const live = new Set();
process.on('exit', () => {
  for (const child of live) { try { child.kill('SIGKILL'); } catch { /* already gone */ } }
});

function startSidecar({ box, runtimeDir, lane, heartbeatMs, extraEnv = {} }) {
  const env = cleanEnv({
    MSGBOX: box,
    XDG_RUNTIME_DIR: runtimeDir,
    PEER_NAME: lane,
    PEER_MSGBOX_AS: lane,
    PEER_CWD: box,
    ...extraEnv,
  });
  const argv = [SIDECAR, '--as', lane];
  if (heartbeatMs) argv.push('--heartbeat-ms', String(heartbeatMs));
  const child = spawn(process.execPath, argv, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  live.add(child);
  child.once('exit', () => live.delete(child));
  let stdout = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => { stdout += d; });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`sidecar not ready; stdout=${stdout}`)), 10000);
    const check = () => {
      const line = stdout.split('\n').find((l) => l.trim().startsWith('{'));
      if (!line) return;
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'ready') { clearTimeout(timer); resolve(parsed); }
      } catch {}
    };
    child.stdout.on('data', check);
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`sidecar exited ${code}`)); });
  });
  return { child, ready, stop: () => child.kill('SIGTERM') && once(child, 'exit') };
}

function readRegistry(box) {
  try { return JSON.parse(fs.readFileSync(registryPath(defaultRegistryDir(box)), 'utf8')); } catch { return null; }
}

function entryFor(box, name) {
  const reg = readRegistry(box);
  if (!reg) return null;
  return Object.values(reg.peers).find((e) => e.name === name) ?? null;
}

async function waitFor(fn, { timeout = 5000, interval = 20 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, interval));
  }
  return null;
}

function runCli(box, lane, args, extraEnv = {}) {
  const env = cleanEnv({ MSGBOX: box, PEER_MSGBOX_AS: lane, ...extraEnv });
  const argv = [CLI, ...args];
  return execFileSync(process.execPath, argv, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function readLog(box) {
  try {
    return fs.readFileSync(path.join(box, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

function registerPeerEntry(box, { peerId, name, pid = process.pid, keyHash }) {
  const dir = defaultRegistryDir(box);
  fs.mkdirSync(dir, { recursive: true });
  const file = registryPath(dir);
  withRegistry(file, (reg) => registerPeer(reg, { peerId, name, pid, status: STATUS.IDLE, keyHash }));
}

function ensureSenderKey(box, lane) {
  const identity = platformIdentity();
  const peerId = derivePeerId(`${identity.platform}:${identity.hostname}:${identity.username}:${lane}`);
  const dir = defaultRegistryDir(box);
  const keyPath = keyPathFor(dir, peerId);
  fs.mkdirSync(dir, { recursive: true });
  const { keyHash } = ensureKeyFile(keyPath);
  const file = registryPath(dir);
  withRegistry(file, (reg) => registerPeer(reg, { peerId, name: lane, pid: process.pid, status: STATUS.IDLE, keyHash }));
  return { peerId, keyPath, keyHash, token: fs.readFileSync(keyPath, 'utf8') };
}

test('send: resolves target, auths with own key, delivers message', async () => {
  const box = tmp('peer-send-');
  const rt = tmp('peer-rt-');
  const senderLane = 'opencode';
  const targetLane = 'claude';

  // register target sidecar peer
  const target = ensureSenderKey(box, targetLane);

  // start sidecar for target lane
  const sidecar = startSidecar({ box, runtimeDir: rt, lane: targetLane });
  await sidecar.ready;

  // send from senderLane to targetLane
  await runCli(box, senderLane, ['send', '--to', targetLane, '--text', 'hello world', '--priority', 'now']);

  // verify log
  const line = await waitFor(() => readLog(box)[0]);
  assert.equal(line.from, senderLane);
  assert.equal(line.to, targetLane);
  assert.equal(line.text, 'hello world');
  assert.equal(line.priority, 'now');

  await sidecar.stop();
});

test('send: forged envelope from-name does not override registry identity', async () => {
  const box = tmp('peer-forged-');
  const rt = tmp('peer-rt-');
  const senderLane = 'opencode';
  const targetLane = 'claude';

  // register a different sender with a known key
  const senderKey = ensureSenderKey(box, senderLane);

  // register target
  const target = ensureSenderKey(box, targetLane);

  const sidecar = startSidecar({ box, runtimeDir: rt, lane: targetLane });
  await sidecar.ready;

  // send with forged from-name, but the auth token is the sender's own key
  // The sidecar verifies the token against the registry, so it should see 'opencode' not the forged name
  await runCli(box, senderLane, ['send', '--to', targetLane, '--text', 'forged test', '--from-name', 'forged-root', '--priority', 'later']);

  const line = await waitFor(() => readLog(box)[0]);
  assert.equal(line.from, senderLane, 'verified registry name wins');
  assert.notEqual(line.from, 'forged-root');
  assert.equal(line.to, targetLane);
  assert.equal(line.priority, 'later');

  await sidecar.stop();
});

test('send: priority recorded', async () => {
  const box = tmp('peer-priority-');
  const rt = tmp('peer-rt-');
  const senderLane = 'opencode';
  const targetLane = 'claude';

  const target = ensureSenderKey(box, targetLane);
  const sidecar = startSidecar({ box, runtimeDir: rt, lane: targetLane });
  await sidecar.ready;

  await runCli(box, senderLane, ['send', '--to', targetLane, '--text', 'prio', '--priority', 'later']);

  const line = await waitFor(() => readLog(box)[0]);
  assert.equal(line.priority, 'later');

  await sidecar.stop();
});

test('send: missing target fails without append', async () => {
  const box = tmp('peer-missing-target-');
  const rt = tmp('peer-rt-');
  const senderLane = 'opencode';

  const senderKey = ensureSenderKey(box, senderLane);
  // no target sidecar running, no target peer registered

  try {
    await runCli(box, senderLane, ['send', '--to', 'ghost', '--text', 'fail']);
    assert.fail('should have thrown');
  } catch (e) {
    assert.match(e.message, /peer not found|peer socket missing/);
  }
  assert.equal(readLog(box).length, 0);
});

test('send: missing priority defaults to next', async () => {
  const box = tmp('peer-default-priority-');
  const rt = tmp('peer-rt-');
  const senderLane = 'opencode';
  const targetLane = 'claude';

  const target = ensureSenderKey(box, targetLane);
  const sidecar = startSidecar({ box, runtimeDir: rt, lane: targetLane });
  await sidecar.ready;

  await runCli(box, senderLane, ['send', '--to', targetLane, '--text', 'default prio']);

  const line = await waitFor(() => readLog(box)[0]);
  assert.equal(line.priority, 'next');

  await sidecar.stop();
});

test('list: shows registered peers', async () => {
  const box = tmp('peer-list-');
  const rt = tmp('peer-rt-');
  const lane1 = 'opencode';
  const lane2 = 'claude';

  ensureSenderKey(box, lane1);
  ensureSenderKey(box, lane2);

  const s1 = startSidecar({ box, runtimeDir: rt, lane: lane1 });
  await s1.ready;
  const s2 = startSidecar({ box, runtimeDir: rt, lane: lane2 });
  await s2.ready;

  const out = await runCli(box, lane1, ['list']);
  assert.match(out, /opencode/);
  assert.match(out, /claude/);

  await s1.stop();
  await s2.stop();
});

test('status: flips existing entry busy/idle', async () => {
  const box = tmp('peer-status-');
  const rt = tmp('peer-rt-');
  const lane = 'opencode';

  ensureSenderKey(box, lane);
  const s = startSidecar({ box, runtimeDir: rt, lane });
  await s.ready;

  let entry = await waitFor(() => entryFor(box, lane));
  assert.equal(entry.status, STATUS.IDLE);

  await runCli(box, lane, ['status', '--busy']);
  entry = await waitFor(() => entryFor(box, lane));
  assert.equal(entry.status, STATUS.BUSY);

  await runCli(box, lane, ['status', '--idle']);
  entry = await waitFor(() => entryFor(box, lane));
  assert.equal(entry.status, STATUS.IDLE);

  await s.stop();
});

test('where: agrees with msg.mjs box resolution', async () => {
  const box = tmp('peer-where-');
  const rt = tmp('peer-rt-');
  const lane = 'opencode';

  ensureSenderKey(box, lane);

  const out = await runCli(box, lane, ['where']);
  assert.match(out, /peer: opencode/);

  // The contract is that the two AGREE on the box, not that msg.mjs formats its answer
  // the way peer.mjs does — it prints the bare path, and asserting `box: <path>` against
  // it pinned a format peer.mjs does not own. Compare the resolved values instead: if
  // either box walk drifts, these stop matching.
  const msgBox = execFileSync(process.execPath, [path.join(HERE, '..', 'msg.mjs'), 'where'], {
    env: cleanEnv({ MSGBOX: box }),
    encoding: 'utf8',
  }).trim();
  const peerBox = out.match(/^box: (.+)$/m)?.[1];
  assert.equal(peerBox, msgBox, 'peer where and msg where resolve the same box');
});

test('missing args show usage and exit 2', () => {
  const box = tmp('peer-missing-args-');
  const rt = tmp('peer-rt-');
  const env = cleanEnv({ MSGBOX: box, XDG_RUNTIME_DIR: rt });

  let code = 0, stderr = '';
  try { execFileSync(process.execPath, [CLI], { env, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }); }
  catch (e) { code = e.status; stderr = e.stderr ?? ''; }
  assert.equal(code, 2);
  assert.match(stderr, /command required/);

  // send missing --to
  code = 0; stderr = '';
  try { execFileSync(process.execPath, [CLI, 'send', '--text', 'x'], { env, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }); }
  catch (e) { code = e.status; stderr = e.stderr ?? ''; }
  assert.equal(code, 2);
  assert.match(stderr, /--to/);

  // send missing --text
  code = 0; stderr = '';
  try { execFileSync(process.execPath, [CLI, 'send', '--to', 'a'], { env, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }); }
  catch (e) { code = e.status; stderr = e.stderr ?? ''; }
  assert.equal(code, 2);
  assert.match(stderr, /--text/);

  // status missing --busy/--idle
  code = 0; stderr = '';
  try { execFileSync(process.execPath, [CLI, 'status'], { env, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }); }
  catch (e) { code = e.status; stderr = e.stderr ?? ''; }
  assert.equal(code, 2);
  assert.match(stderr, /--busy or --idle/);
});