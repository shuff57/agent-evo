#!/usr/bin/env node
// peer-sidecar.mjs — UDS receiver sidecar for the hybrid Claude Code <-> opencode bridge.
//
// One sidecar fronts one lane (`--as <lane>`). It owns a 0600 Unix-domain socket,
// authenticates every connection by the sender's key-file contents, and appends
// accepted peerProtocol v1 user frames to the box's log.jsonl.
//
// Identity is fail-closed. A connection is accepted only when the presented token
// hashes to the keyHash of a managed registry entry, and the appended line's `from`
// is that entry's registry name — never the envelope's display-only from-name.
//
// Node standard library only. No dependencies.
//
// Usage:  node bin/peer-sidecar.mjs --as <lane> [--heartbeat-ms N]
// Box:    $MSGBOX > <git root>/.msgbox > ~/.claude/msgbox   (same as msg.mjs)
// Socket: $XDG_RUNTIME_DIR/agent-evo-peer/<peerId>.sock, else <box>/peer/<peerId>.sock

import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { PEER_PROTOCOL_VERSION, PRIORITIES, DEFAULT_PRIORITY, parseEnvelope } from './peer/codec.mjs';
import {
  STATUS,
  cleanupRegistry,
  defaultRegistryDir,
  derivePeerId,
  ensureKeyFile,
  isPidAlive,
  keyPathFor,
  listManagedPeers,
  loadRegistry,
  platformIdentity,
  registerPeer,
  registryPath,
  touchPeer,
  unregisterPeer,
  withRegistry,
} from './peer/registry.mjs';

const UNAUTH_TIMEOUT_MS = 5000;
const MAX_LINE_BYTES = 1024 * 1024;
const DEFAULT_HEARTBEAT_MS = 30000;
const PROBE_TIMEOUT_MS = 500;

function parseArgs(argv) {
  const out = { as: null, heartbeatMs: DEFAULT_HEARTBEAT_MS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--as') out.as = argv[++i];
    else if (a === '--heartbeat-ms') out.heartbeatMs = Number(argv[++i]);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const lane = args.as ?? process.env.PEER_MSGBOX_AS ?? process.env.PEER_NAME ?? null;
if (!lane) {
  process.stderr.write('peer-sidecar: --as <lane> is required\n');
  process.exit(2);
}
const heartbeatMs = Number.isFinite(args.heartbeatMs) && args.heartbeatMs > 0 ? args.heartbeatMs : DEFAULT_HEARTBEAT_MS;

function findRoot(startDir) {
  let dir = startDir;
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

const cwd = process.env.PEER_CWD ?? process.cwd();
const root = findRoot(cwd);
const box = process.env.MSGBOX ?? (root ? path.join(root, '.msgbox') : path.join(os.homedir(), '.claude', 'msgbox'));
const logFile = path.join(box, 'log.jsonl');
const registryDir = defaultRegistryDir(box);
const registryFile = registryPath(registryDir);

const identity = platformIdentity();
const peerId = derivePeerId(`${identity.platform}:${identity.hostname}:${identity.username}:${lane}`);
const keyPath = keyPathFor(registryDir, peerId);

function socketDirFor(boxDir) {
  return process.env.XDG_RUNTIME_DIR
    ? path.join(process.env.XDG_RUNTIME_DIR, 'agent-evo-peer')
    : path.join(boxDir, 'peer');
}
const socketPath = path.join(socketDirFor(box), `${peerId}.sock`);

const sockets = new Set();
let heartbeat = null;
let cleaned = false;
let shuttingDown = false;

function cleanup() {
  if (cleaned) return;
  cleaned = true;
  if (heartbeat) clearInterval(heartbeat);
  for (const socket of sockets) { try { socket.destroy(); } catch {} }
  try { server.close(); } catch {}
  try { fs.rmSync(socketPath, { force: true }); } catch {}
  try { withRegistry(registryFile, (reg) => unregisterPeer(reg, peerId)); } catch {}
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  cleanup();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function probeSocket(target) {
  return new Promise((resolve) => {
    const socket = net.connect(target);
    let settled = false;
    const done = (alive) => { if (settled) return; settled = true; socket.destroy(); resolve(alive); };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(PROBE_TIMEOUT_MS, () => done(false));
  });
}

const server = net.createServer();

server.on('connection', (socket) => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
  handleConnection(socket);
});

async function bindSocket() {
  fs.mkdirSync(path.dirname(socketPath), { recursive: true });
  if (fs.existsSync(socketPath)) {
    if (await probeSocket(socketPath)) {
      process.stderr.write(`peer-sidecar: socket already in use: ${socketPath}\n`);
      process.exit(1);
    }
    fs.rmSync(socketPath, { force: true });
  }
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => { server.removeListener('error', reject); resolve(); });
  });
  server.on('error', () => {});
  fs.chmodSync(socketPath, 0o600);
}

function verifyToken(token) {
  if (typeof token !== 'string' || token.length === 0) return null;
  const digest = Buffer.from(crypto.createHash('sha256').update(token).digest('hex'), 'hex');
  const registry = loadRegistry(registryFile);
  for (const entry of listManagedPeers(registry)) {
    if (typeof entry.keyHash !== 'string' || entry.keyHash.length !== 64) continue;
    const expected = Buffer.from(entry.keyHash, 'hex');
    if (expected.length !== digest.length) continue;
    if (crypto.timingSafeEqual(digest, expected)) return entry.name ?? entry.peerId;
  }
  return null;
}

function appendMessage(verifiedName, frame) {
  const content = frame.message && frame.message.content;
  if (typeof content !== 'string') return;
  const parsed = parseEnvelope(content);
  const priority = PRIORITIES.includes(frame.priority) ? frame.priority : DEFAULT_PRIORITY;
  const line = { ts: new Date().toISOString(), from: verifiedName, to: lane, text: parsed.text, priority };
  try {
    fs.mkdirSync(box, { recursive: true });
    fs.appendFileSync(logFile, JSON.stringify(line) + '\n');
  } catch { /* a failed append must not kill the receiver */ }
}

function handleLine(socket, state, line) {
  if (!line.trim()) return;
  let frame;
  try { frame = JSON.parse(line); } catch { socket.destroy(); return; }
  if (!frame || typeof frame !== 'object' || Array.isArray(frame)) { socket.destroy(); return; }

  if (!state.authed) {
    const name = verifyToken(frame.type === 'auth' ? frame.token : undefined);
    if (!name) { socket.destroy(); return; }
    state.authed = true;
    state.verifiedName = name;
    if (state.timer) { clearTimeout(state.timer); state.timer = null; }
    return;
  }

  if (frame.type !== 'user' || frame.msgV !== PEER_PROTOCOL_VERSION) return;
  appendMessage(state.verifiedName, frame);
}

function handleConnection(socket) {
  const state = { authed: false, verifiedName: null, buffer: '', timer: null };
  state.timer = setTimeout(() => { if (!state.authed) socket.destroy(); }, 5000);
  if (state.timer.unref) state.timer.unref();
  socket.setEncoding('utf8');
  socket.on('data', (chunk) => {
    state.buffer += chunk;
    let nl;
    while ((nl = state.buffer.indexOf('\n')) !== -1) {
      const line = state.buffer.slice(0, nl);
      state.buffer = state.buffer.slice(nl + 1);
      if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) { socket.destroy(); return; }
      handleLine(socket, state, line);
      if (socket.destroyed) return;
    }
    if (Buffer.byteLength(state.buffer, 'utf8') > MAX_LINE_BYTES) socket.destroy();
  });
  socket.on('error', () => {});
  socket.on('close', () => { if (state.timer) clearTimeout(state.timer); });
}

async function main() {
  try {
    fs.mkdirSync(box, { recursive: true });
    fs.mkdirSync(registryDir, { recursive: true });
    const key = ensureKeyFile(keyPath);
    if (!key.keyHash) throw new Error(`key file unreadable: ${keyPath}`);

    withRegistry(registryFile, (reg) => cleanupRegistry(reg, { isAlive: isPidAlive }));

    await bindSocket();

    withRegistry(registryFile, (reg) => registerPeer(reg, {
      peerId,
      name: lane,
      pid: process.pid,
      socketPath,
      keyHash: key.keyHash,
      status: STATUS.IDLE,
    }));

    // `name`, not `lane`: the ready line names the peer exactly as the registry entry
    // does, so a reader never has to know two words for one thing.
    process.stdout.write(JSON.stringify({ type: 'ready', pid: process.pid, peerId, socketPath, name: lane }) + '\n');

    heartbeat = setInterval(() => {
      try { withRegistry(registryFile, (reg) => touchPeer(reg, peerId)); } catch {}
    }, heartbeatMs);
    if (heartbeat.unref) heartbeat.unref();
  } catch (err) {
    process.stderr.write(`peer-sidecar: ${err && err.message ? err.message : String(err)}\n`);
    cleanup();
    process.exit(1);
  }
}

main().catch((err) => {
  cleanup();
  process.stderr.write(`peer-sidecar: ${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
});