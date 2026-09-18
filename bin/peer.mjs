#!/usr/bin/env node
// peer.mjs — CLI client for the hybrid Claude Code <-> opencode peer bridge.
//
// Speaks peerProtocol v1 over UDS to a sidecar. Uses the shared registry
// for peer discovery and key-based authentication.
//
// Usage:
//   node bin/peer.mjs send --to <name|pid> --text "..." [--priority now|next|later] [--from-name "..."] [--no-audit]
//   node bin/peer.mjs list
//   node bin/peer.mjs status --busy|--idle [--as <lane>]
//   node bin/peer.mjs where

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { PRIORITIES, DEFAULT_PRIORITY, buildAuthFrame, buildMessageFrame, encodeFrames } from './peer/codec.mjs';
import {
  STATUS,
  defaultRegistryDir,
  peerIdForLane,
  ensureKeyFile,
  keyPathFor,
  listManagedPeers,
  loadRegistry,
  platformIdentity,
  registerPeer,
  registryPath,
  setStatus,
  withRegistry,
} from './peer/registry.mjs';

function parseArgs(argv) {
  const out = { cmd: null, to: null, text: null, priority: DEFAULT_PRIORITY, fromName: null, noAudit: false, as: null, status: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === 'send' || a === 'list' || a === 'status' || a === 'where') out.cmd = a;
    else if (a === '--to') out.to = argv[++i];
    else if (a === '--text') out.text = argv[++i];
    else if (a === '--priority') out.priority = argv[++i];
    else if (a === '--from-name') out.fromName = argv[++i];
    else if (a === '--no-audit') out.noAudit = true;
    else if (a === '--as') out.as = argv[++i];
    else if (a === '--busy') out.status = STATUS.BUSY;
    else if (a === '--idle') out.status = STATUS.IDLE;
    else if (!out.cmd && (a === 'send' || a === 'list' || a === 'status' || a === 'where')) out.cmd = a;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

function findBox(startDir) {
  if (process.env.MSGBOX) return process.env.MSGBOX;
  let dir = startDir || process.cwd();
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return path.join(dir, '.msgbox');
    const up = path.dirname(dir);
    if (up === dir) return path.join(os.homedir(), '.claude', 'msgbox');
    dir = up;
  }
}

function usage(message) {
  if (message) process.stderr.write(`peer: ${message}\n`);
  process.stderr.write('usage:\n' +
    '  node bin/peer.mjs send --to <name|pid> --text "..." [--priority now|next|later] [--from-name "..."] [--no-audit]\n' +
    '  node bin/peer.mjs list\n' +
    '  node bin/peer.mjs status --busy|--idle [--as <lane>]\n' +
    '  node bin/peer.mjs where\n');
  process.exit(2);
}

// The sender must be IN the registry with its keyHash before it dials: the receiver
// identifies a connection by scanning managed entries for the hash of the presented
// token, so an unregistered sender is indistinguishable from an attacker and gets
// silently dropped. Minting the key without registering it was exactly that bug.
function ensureOwnEntry(box, lane) {
  const registryDir = defaultRegistryDir(box);
  const identity = platformIdentity();
  const peerId = peerIdForLane(lane, identity);
  const keyPath = keyPathFor(registryDir, peerId);
  fs.mkdirSync(registryDir, { recursive: true });
  const key = ensureKeyFile(keyPath);
  if (!key.keyHash) throw new Error(`key file unreadable: ${keyPath}`);

  const reg = loadRegistry(registryPath(registryDir));
  const existing = reg.peers[peerId];
  if (existing && existing.name !== lane) {
    throw new Error(`peerId ${peerId} already registered with different name: ${existing.name}`);
  }
  // No socketPath: a CLI send has no listener, so it is a sender-only peer. registerPeer
  // refreshes an existing entry rather than replacing it, so a lane that also runs a
  // sidecar keeps its socketPath.
  withRegistry(registryPath(registryDir), (r) =>
    registerPeer(r, { peerId, name: lane, pid: process.pid, keyHash: key.keyHash }));
  return { peerId, keyPath, keyHash: key.keyHash };
}

function findTarget(box, to) {
  const registryDir = defaultRegistryDir(box);
  const reg = loadRegistry(registryPath(registryDir));
  const managed = listManagedPeers(reg);

  let target = null;
  if (/^\d+$/.test(to)) {
    const pid = parseInt(to, 10);
    target = managed.find((e) => e.pid === pid);
  } else {
    target = managed.find((e) => e.name === to);
  }
  if (!target) throw new Error(`peer not found: ${to}`);
  if (!target.socketPath) throw new Error(`peer has no socketPath: ${to}`);
  if (!fs.existsSync(target.socketPath)) throw new Error(`peer socket missing: ${target.socketPath}`);
  return target;
}

async function send(box, lane, target, text, priority, fromName) {
  const own = ensureOwnEntry(box, lane);
  const token = fs.readFileSync(own.keyPath, 'utf8');

  const frame = buildMessageFrame({
    from: own.peerId,
    fromName,
    fromMode: 'cli',
    text,
    priority,
  });

  const payload = encodeFrames([buildAuthFrame(token), frame]);

  // peerProtocol v1 ACKNOWLEDGES NOTHING. A good token gets no reply and a bad one gets
  // a silent destroy, so there is no auth response to wait for — an earlier version
  // waited for one and reported every successful send as "connection closed before
  // auth". Write both frames, half-close, and treat the close as the end of the send;
  // whether it was DELIVERED is answered by the audit below, not by the socket.
  return new Promise((resolve, reject) => {
    const socket = net.connect(target.socketPath);
    socket.on('error', reject);
    socket.on('close', () => resolve());
    socket.on('connect', () => socket.end(payload));
  });
}

// The only honest delivery check available on this protocol: the receiver appends to the
// shared box log, so a sender on the same box can look for its own line. A silent
// refusal (unregistered sender, wrong key, sidecar dead) is indistinguishable from
// success on the wire and shows up here as nothing arriving.
async function auditDelivery(box, want, { timeout = 3000, interval = 25 } = {}) {
  const logFile = path.join(box, 'log.jsonl');
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const m = JSON.parse(lines[i]);
          if (m.from === want.from && m.to === want.to && m.text === want.text) return true;
        } catch { /* a line another writer is mid-append on */ }
      }
    } catch { /* no log yet */ }
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

async function cmdSend(box, lane, args) {
  if (!args.to) usage('send requires --to');
  if (!args.text) usage('send requires --text');
  if (!PRIORITIES.includes(args.priority)) usage(`invalid priority: ${args.priority}`);

  const target = findTarget(box, args.to);
  await send(box, lane, target, args.text, args.priority, args.fromName);
  if (args.noAudit) return;
  const delivered = await auditDelivery(box, { from: lane, to: target.name, text: args.text });
  if (!delivered) {
    throw new Error(
      `sent to ${target.name} but nothing arrived in the box log. The receiver refuses silently, ` +
      `so this is most likely a key/registry mismatch or a dead sidecar. Pass --no-audit to skip this check.`
    );
  }
}

function cmdList(box, lane) {
  const registryDir = defaultRegistryDir(box);
  const reg = loadRegistry(registryPath(registryDir));
  const managed = listManagedPeers(reg);
  if (!managed.length) {
    console.log('no peers');
    return;
  }
  console.log('NAME\tPID\tSTATUS\tSOCKET\tUPDATED');
  for (const e of managed) {
    console.log(`${e.name}\t${e.pid ?? '-'}\t${e.status}\t${e.socketPath ?? '-'}\t${e.updatedAt ?? '-'}`);
  }
}

async function cmdStatus(box, lane, status) {
  const registryDir = defaultRegistryDir(box);
  const registryFile = registryPath(registryDir);
  const out = withRegistry(registryFile, (reg) => {
    const peerId = peerIdForLane(lane);
    return setStatus(reg, peerId, status);
  });
  if (!out.changed) console.log('peer not found or status unchanged');
  else console.log('status updated');
}

function cmdWhere() {
  const box = findBox(process.cwd());
  const identity = platformIdentity();
  const lane = process.env.MSGBOX_AS || 'opencode';
  const peerId = peerIdForLane(lane, identity);
  console.log(`box: ${box}`);
  console.log(`peer: ${lane} (${peerId})`);
  console.log(`registry: ${registryPath(defaultRegistryDir(box))}`);
}

async function main() {
  const box = findBox(process.cwd());
  const lane = args.as ?? process.env.MSGBOX_AS ?? 'opencode';

  try {
    switch (args.cmd) {
      case 'send':
        await cmdSend(box, lane, args);
        break;
      case 'list':
        cmdList(box, lane);
        break;
      case 'status':
        if (!args.status) usage('status requires --busy or --idle');
        await cmdStatus(box, lane, args.status);
        break;
      case 'where':
        cmdWhere();
        break;
      default:
        usage('command required: send, list, status, or where');
    }
  } catch (err) {
    process.stderr.write(`peer: ${err.message}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`peer: ${err.message}\n`);
  process.exit(1);
});