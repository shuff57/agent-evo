// sidecar.test.mjs — contract tests for bin/peer-sidecar.mjs
//
// Run with: bun test bin/peer/sidecar.test.mjs
// (`node --test` works only where a real Node.js is installed. Where `node` is a bun
// shim it runs the file with no runner at all and node:test throws on the first case.)
//
// Tests cover:
// 1. Startup registration + ready line
// 2. Auth: verified registry name used for log.from (not forged envelope from-name)
// 3. Auth: wrong token destroys connection, no log append
// 4. Auth: malformed JSON closes connection
// 5. Auth: oversized line closes connection
// 6. Unknown frame type skipped, connection alive
// 6b. Unsupported msgV skipped, connection alive
// 7. Priority recorded in log
// 8. Stale socket recovery
// 9. SIGTERM cleanup (unregister, unlink socket, exit 0)
// 10. Foreign entries preserved during sweep
// 11. Heartbeat refreshes updatedAt
// 12. Missing --as shows usage and exits 2
// 13. Fail-closed: uninitializable registry exits non-zero
// 14. PEER_MSGBOX_AS alias for --as

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

import { buildEnvelope, buildMessageFrame } from './codec.mjs';
import {
  MANAGED_BY,
  STATUS,
  defaultRegistryDir,
  ensureKeyFile,
  hashKeyContents,
  keyPathFor,
  platformIdentity,
  registryPath,
  registerPeer,
  withRegistry,
} from './registry.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SIDECAR = path.resolve(HERE, '..', 'peer-sidecar.mjs');

const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function cleanEnv(extra) {
  const env = { ...process.env };
  for (const key of ['MSGBOX', 'PEER_NAME', 'PEER_MSGBOX_AS', 'PEER_CWD', 'PEER_UNAUTH_TIMEOUT_MS', 'AGENT_EVO_PEER', 'XDG_RUNTIME_DIR', 'CLAUDE_CONFIG_DIR']) delete env[key];
  return { ...env, ...extra };
}

// Every spawned sidecar is tracked and killed when this process exits, however it
// exits. A test that throws before its own stop() used to strand a daemon that then
// heartbeated into a deleted tmpdir forever: one full failing run left 19 of them alive
// on the dev box. The per-test stop() is the tidy path; this is the one that holds when
// an assertion throws first.
const live = new Set();
process.on('exit', () => {
  for (const child of live) { try { child.kill('SIGKILL'); } catch { /* already gone */ } }
});

// `lane: null` means "start it WITHOUT --as", which is how the env-alias case is
// exercised. Spreading a null lane into the env and the argv instead passed the literal
// string "null" as the lane, so the alias was never under test.
function startSidecar({ box, runtimeDir, lane, heartbeatMs, extraEnv = {} }) {
  const env = cleanEnv({
    MSGBOX: box,
    XDG_RUNTIME_DIR: runtimeDir,
    PEER_CWD: box,
    ...(lane ? { PEER_NAME: lane, PEER_MSGBOX_AS: lane } : {}),
    ...extraEnv,
  });
  const argv = lane ? [SIDECAR, '--as', lane] : [SIDECAR];
  if (heartbeatMs) argv.push('--heartbeat-ms', String(heartbeatMs));
  const child = spawn(process.execPath, argv, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  live.add(child);
  child.once('exit', () => live.delete(child));
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`sidecar not ready; stdout=${stdout} stderr=${stderr}`)), 10000);
    const check = () => {
      const line = stdout.split('\n').find((l) => l.trim().startsWith('{'));
      if (!line) return;
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'ready') { clearTimeout(timer); resolve(parsed); }
      } catch {}
    };
    child.stdout.on('data', check);
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`sidecar exited ${code}; stderr=${stderr}`)); });
  });
  return { child, ready, stdout: () => stdout, stderr: () => stderr };
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

function connect(socketPath) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(socketPath);
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
  });
}

function sendLine(socket, value) {
  socket.write(JSON.stringify(value) + '\n');
}

function waitClose(socket, timeout = 3000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeout);
    socket.once('close', () => { clearTimeout(timer); resolve(true); });
  });
}

function readLog(box) {
  try {
    return fs.readFileSync(path.join(box, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

function registerSender(box, { peerId, name }) {
  const dir = defaultRegistryDir(box);
  fs.mkdirSync(dir, { recursive: true });
  const keyPath = keyPathFor(dir, peerId);
  const { keyHash } = ensureKeyFile(keyPath);
  const file = registryPath(dir);
  withRegistry(file, (reg) => registerPeer(reg, {
    peerId,
    name,
    pid: process.pid,
    status: STATUS.IDLE,
    keyHash,
  }));
  return { name, token: fs.readFileSync(keyPath, 'utf8'), keyPath };
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await once(child, 'exit');
}

test('ready: emits a ready line and registers a managed peer with a 0600 socket', async () => {
  const box = tmp('sidecar-ready-');
  const rt = tmp('sidecar-rt-');

  const s = startSidecar({ box, runtimeDir: rt, lane: 'claude' });
  const ready = await s.ready;
  assert.equal(ready.type, 'ready');
  assert.equal(ready.name, 'claude');
  assert.equal(ready.pid, s.child.pid);
  assert.ok(ready.socketPath.endsWith('.sock'));

  const entry = await waitFor(() => entryFor(box, 'claude'));
  assert.ok(entry, 'peer registered');
  assert.equal(entry.managedBy, MANAGED_BY);
  assert.equal(entry.name, 'claude');
  assert.equal(entry.status, STATUS.IDLE);
  assert.match(entry.keyHash, /^[0-9a-f]{64}$/);
  assert.ok(entry.socketPath.endsWith('.sock'));

  const sockStat = fs.statSync(entry.socketPath);
  assert.equal(sockStat.mode & 0o777, 0o600, 'socket is 0600');

  await stop(s.child);
});

test('auth: the verified registry name is used for log.from, not the envelope from-name', async () => {
  const box = tmp('sidecar-auth-');
  const rt = tmp('sidecar-rt-');
  const sender = registerSender(box, { peerId: 'sender-1', name: 'opencode' });

  const s = startSidecar({ box, runtimeDir: rt, lane: 'claude' });
  await s.ready;
  const entry = await waitFor(() => entryFor(box, 'claude'));
  const sock = await connect(entry.socketPath);

  sendLine(sock, { type: 'auth', token: sender.token });
  sendLine(sock, buildMessageFrame({
    from: 'uds:/forged',
    fromName: 'forged-root',
    fromMode: 'interactive',
    text: 'hello',
    priority: 'now',
  }));

  const line = await waitFor(() => readLog(box)[0]);
  assert.equal(line.from, 'opencode', 'verified registry name wins');
  assert.notEqual(line.from, 'forged-root');
  assert.equal(line.to, 'claude');
  assert.equal(line.text, 'hello');
  assert.equal(line.priority, 'now');

  await stop(s.child);
});

test('auth: a wrong token destroys the connection and appends nothing', async () => {
  const box = tmp('sidecar-auth-wrong-');
  const rt = tmp('sidecar-rt-');

  const s = startSidecar({ box, runtimeDir: rt, lane: 'claude' });
  await s.ready;
  const entry = await waitFor(() => entryFor(box, 'claude'));
  const sock = await connect(entry.socketPath);

  sendLine(sock, { type: 'auth', token: 'not-a-real-key' });
  assert.equal(await waitClose(sock), true);
  assert.equal(readLog(box).length, 0);

  await stop(s.child);
});

// The token has to be a REAL one. An earlier version authed with 'dummy', which the
// sidecar correctly refused — so the socket was already closed before the malformed
// line was written, and the close this asserts on had fired before waitClose attached
// its listener. The test then timed out while the behaviour under test was never
// exercised: a green-looking assertion about the wrong close.
test('malformed JSON closes the connection', async () => {
  const box = tmp('sidecar-malformed-');
  const rt = tmp('sidecar-rt-');
  const sender = registerSender(box, { peerId: 'sender-1', name: 'opencode' });

  const s = startSidecar({ box, runtimeDir: rt, lane: 'claude' });
  await s.ready;
  const entry = await waitFor(() => entryFor(box, 'claude'));
  const sock = await connect(entry.socketPath);

  // No sleep between the two writes: TCP preserves order, so the sidecar reads the
  // auth line first either way, and attaching waitClose before any close can fire is
  // what makes this deterministic.
  sendLine(sock, { type: 'auth', token: sender.token });
  sock.write('{ not json\n');
  assert.equal(await waitClose(sock), true);
  assert.equal(readLog(box).length, 0, 'a malformed frame appends nothing');

  await stop(s.child);
});

test('a line over 1 MiB closes the connection', async () => {
  const box = tmp('sidecar-oversize-');
  const rt = tmp('sidecar-rt-');
  const sender = registerSender(box, { peerId: 'sender-1', name: 'opencode' });

  const s = startSidecar({ box, runtimeDir: rt, lane: 'claude' });
  await s.ready;
  const entry = await waitFor(() => entryFor(box, 'claude'));
  const sock = await connect(entry.socketPath);

  sendLine(sock, { type: 'auth', token: sender.token });
  await new Promise(r => setTimeout(r, 50));
  sock.write('x'.repeat(1024 * 1024 + 16));
  assert.equal(await waitClose(sock), true);

  await stop(s.child);
});

test('an unknown frame type is skipped and the connection stays alive', async () => {
  const box = tmp('sidecar-unknown-');
  const rt = tmp('sidecar-rt-');
  const sender = registerSender(box, { peerId: 'sender-1', name: 'opencode' });

  const s = startSidecar({ box, runtimeDir: rt, lane: 'claude' });
  await s.ready;
  const entry = await waitFor(() => entryFor(box, 'claude'));
  const sock = await connect(entry.socketPath);

  sendLine(sock, { type: 'auth', token: sender.token });
  sendLine(sock, { type: 'heartbeat', msgV: 1 });
  sendLine(sock, buildMessageFrame({ from: 'uds:/x', fromName: 'opencode', text: 'after-unknown' }));

  const line = await waitFor(() => readLog(box)[0]);
  assert.equal(line.text, 'after-unknown');
  assert.equal(line.from, 'opencode');
  assert.equal(sock.destroyed, false);

  await stop(s.child);
});

test('an unsupported msgV is skipped and the connection stays alive', async () => {
  const box = tmp('sidecar-msgv-');
  const rt = tmp('sidecar-rt-');
  const sender = registerSender(box, { peerId: 'sender-1', name: 'opencode' });

  const s = startSidecar({ box, runtimeDir: rt, lane: 'claude' });
  await s.ready;
  const entry = await waitFor(() => entryFor(box, 'claude'));
  const sock = await connect(entry.socketPath);

  sendLine(sock, { type: 'auth', token: sender.token });
  sendLine(sock, { type: 'user', msgV: 99, message: { role: 'user', content: 'ignored' } });
  sendLine(sock, buildMessageFrame({ from: 'uds:/x', fromName: 'opencode', text: 'after-msgv' }));

  const line = await waitFor(() => readLog(box)[0]);
  assert.equal(line.text, 'after-msgv');
  assert.equal(sock.destroyed, false);

  await stop(s.child);
});

test('priority is recorded in the log line', async () => {
  const box = tmp('sidecar-priority-');
  const rt = tmp('sidecar-rt-');
  const sender = registerSender(box, { peerId: 'sender-1', name: 'opencode' });

  const s = startSidecar({ box, runtimeDir: rt, lane: 'claude' });
  await s.ready;
  const entry = await waitFor(() => entryFor(box, 'claude'));
  const sock = await connect(entry.socketPath);

  sendLine(sock, { type: 'auth', token: sender.token });
  sendLine(sock, buildMessageFrame({ from: 'uds:/x', fromName: 'opencode', text: 'prio-test', priority: 'later' }));

  const line = await waitFor(() => readLog(box)[0]);
  assert.equal(line.priority, 'later');

  await stop(s.child);
});

test('stale socket: a leftover socket file is recovered', async () => {
  const box = tmp('sidecar-stale-');
  const rt = tmp('sidecar-rt-');

  const first = startSidecar({ box, runtimeDir: rt, lane: 'claude' });
  await first.ready;
  const entry = await waitFor(() => entryFor(box, 'claude'));
  first.child.kill('SIGKILL');
  await once(first.child, 'exit');
  assert.ok(fs.existsSync(entry.socketPath), 'socket file left behind');

  const second = startSidecar({ box, runtimeDir: rt, lane: 'claude' });
  const ready = await second.ready;
  assert.equal(ready.type, 'ready');
  const newEntry = await waitFor(() => entryFor(box, 'claude'));
  // The peerId is deliberately STABLE across a restart — it is derived from
  // platform:host:user:lane, not from the pid, so the same lane is recognisable as the
  // same peer. What must change is the pid, and the socket must be live again.
  assert.equal(newEntry.peerId, entry.peerId, 'a restarted lane keeps its identity');
  assert.equal(newEntry.pid, second.child.pid, 'the new process owns the entry');
  assert.ok(fs.existsSync(newEntry.socketPath), 'socket rebound');

  await stop(second.child);
});

test('SIGTERM: unregisters, unlinks the socket, and exits 0', async () => {
  const box = tmp('sidecar-sigterm-');
  const rt = tmp('sidecar-rt-');

  const s = startSidecar({ box, runtimeDir: rt, lane: 'claude' });
  await s.ready;
  const entry = await waitFor(() => entryFor(box, 'claude'));

  s.child.kill('SIGTERM');
  const [code] = await once(s.child, 'exit');
  assert.equal(code, 0);
  assert.ok(!fs.existsSync(entry.socketPath), 'socket unlinked');
  const reg = readRegistry(box);
  assert.ok(!reg || !reg.peers[entry.peerId], 'unregistered');
});

test('sweep: foreign entries are preserved', async () => {
  const box = tmp('sidecar-foreign-');
  const rt = tmp('sidecar-rt-');

  const dir = defaultRegistryDir(box);
  fs.mkdirSync(dir, { recursive: true });
  const file = registryPath(dir);
  const foreign = { peerId: 'foreign-1', managedBy: 'someone-else', pid: 2147483646, status: 'idle', updatedAt: new Date().toISOString() };
  const dead = { peerId: 'dead-1', managedBy: MANAGED_BY, pid: 2147483646, status: 'idle', updatedAt: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify({ version: 1, peers: { 'foreign-1': foreign, 'dead-1': dead } }));

  const s = startSidecar({ box, runtimeDir: rt, lane: 'claude' });
  await s.ready;
  // Keyed by peerId, never by lane name: waiting on peers['claude'] waited for a key
  // that cannot exist, so this timed out instead of testing the sweep.
  const own = await waitFor(() => entryFor(box, 'claude'));
  assert.ok(own, 'the sidecar registered itself');
  const reg = readRegistry(box);
  assert.ok(reg.peers['foreign-1'], 'foreign preserved');
  assert.ok(!reg.peers['dead-1'], 'dead managed reaped');

  await stop(s.child);
});

test('heartbeat: the registry entry is refreshed', async () => {
  const box = tmp('sidecar-heartbeat-');
  const rt = tmp('sidecar-rt-');

  const s = startSidecar({ box, runtimeDir: rt, lane: 'claude', heartbeatMs: 100 });
  await s.ready;
  const first = await waitFor(() => entryFor(box, 'claude'));
  const updated = await waitFor(() => {
    const e = entryFor(box, 'claude');
    return e && e.updatedAt !== first.updatedAt ? e : null;
  }, { timeout: 3000 });
  assert.ok(updated, 'heartbeat refreshed updatedAt');

  await stop(s.child);
});

test('missing --as: usage error and exit 2', () => {
  const box = tmp('sidecar-missing-as-');
  const rt = tmp('sidecar-rt-');
  const env = cleanEnv({ MSGBOX: box, XDG_RUNTIME_DIR: rt });
  let code = 0, stderr = '';
  try { execFileSync(process.execPath, [SIDECAR], { env, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }); }
  catch (e) { code = e.status; stderr = e.stderr ?? ''; }
  assert.equal(code, 2);
  assert.match(stderr, /--as/);
});

test('fail-closed: an uninitializable registry exits non-zero without serving', () => {
  const box = tmp('sidecar-fail-closed-');
  const rt = tmp('sidecar-rt-');
  fs.writeFileSync(path.join(box, 'peer'), 'not a directory');
  const env = cleanEnv({ MSGBOX: box, XDG_RUNTIME_DIR: rt });
  let code = 0;
  try { execFileSync(process.execPath, [SIDECAR, '--as', 'claude'], { env, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }); }
  catch (e) { code = e.status; }
  assert.notEqual(code, 0);
});

test('PEER_MSGBOX_AS is an optional alias for --as', async () => {
  const box = tmp('sidecar-env-alias-');
  const rt = tmp('sidecar-rt-');
  const s = startSidecar({ box, runtimeDir: rt, lane: null, extraEnv: { PEER_MSGBOX_AS: 'opencode' } });
  const ready = await s.ready;
  assert.equal(ready.name, 'opencode');

  await stop(s.child);
});