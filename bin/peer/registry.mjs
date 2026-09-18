// Peer registry for the hybrid Claude Code <-> opencode bridge.
//
// One device-local JSON file lists the live peer processes (a Claude Code session,
// an opencode run, a sidecar) that can talk to each other. The module is deliberately
// path-agnostic: every function takes the registry directory or file explicitly, so a
// sidecar can mount it wherever the box lives and tests can use a throwaway tmpdir.
//
// Two rules shape the whole module:
//
//   1. An entry is only ever mutated when `managedBy === 'agent-evo'`. A foreign entry
//      (written by another tool, or by a future version) is read, listed and preserved,
//      never edited or reaped. `cleanupRegistry` skips it by design, and every mutator
//      reports `{ skipped: true, reason: 'foreign' }` instead of touching it.
//
//   2. Unknown fields are tolerated everywhere. `normalizeRegistry` spreads the raw
//      object through instead of rebuilding it field by field, so a newer writer's keys
//      survive a round-trip through an older reader.
//
// Identity is a hash of a per-peer key file, not the PID: PIDs are reused, and a peer
// that restarts should be recognisable as the same peer. `derivePeerId` gives a stable
// id from a seed; `ensureKeyFile` mints the secret whose hash is the peer's proof of
// identity. `sameUser` decides whether a peer runs as the same OS user as this process.
//
// API (kept stable for the sidecar):
//   identity   platformIdentity, sameUser, isSameUser
//   key files  registryPath, keyPathFor, hashKeyContents, hashKeyFile, ensureKeyFile, derivePeerId
//   lifecycle  emptyRegistry, normalizeRegistry, loadRegistry, saveRegistry, withRegistry, defaultRegistryDir
//   peers      registerPeer, unregisterPeer, setStatus, touchPeer, cleanupRegistry
//   queries    listPids, listManagedPeers, isManaged, isBusy, isIdle, isStale, isPidAlive
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MANAGED_BY = 'agent-evo';
export const REGISTRY_VERSION = 1;
export const STATUS = Object.freeze({ BUSY: 'busy', IDLE: 'idle' });
// A sidecar heartbeats well inside this window; anything older is presumed gone even
// if its PID happens to be alive (PID reuse is exactly what the key hash guards against).
export const DEFAULT_STALE_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Platform identity
// ---------------------------------------------------------------------------

/** This process's platform identity, in the same shape a peer entry carries. */
export function platformIdentity() {
  let info = {};
  try {
    info = os.userInfo();
  } catch {
    // No passwd entry (containers, some Windows shells) — fall back to the env.
  }
  return {
    platform: process.platform,
    hostname: os.hostname(),
    username: info.username ?? process.env.USER ?? process.env.USERNAME ?? null,
    uid: typeof info.uid === 'number' ? info.uid : null,
    homedir: os.homedir(),
  };
}

function normUsername(u) {
  if (typeof u !== 'string') return null;
  const t = u.trim().toLowerCase();
  return t || null;
}

/**
 * Do two identities belong to the same OS user? UID is authoritative when both sides
 * report a real one; Windows reports -1, so that falls through to a case-insensitive
 * username compare rather than matching -1 === -1 across unrelated users.
 */
export function sameUser(a, b) {
  if (!a || !b) return false;
  const au = a.uid;
  const bu = b.uid;
  if (typeof au === 'number' && au >= 0 && typeof bu === 'number' && bu >= 0) return au === bu;
  const an = normUsername(a.username);
  const bn = normUsername(b.username);
  return an !== null && an === bn;
}

/** Is this peer entry the same OS user as `identity`? */
export function isSameUser(entry, identity) {
  return sameUser(entry, identity);
}

// ---------------------------------------------------------------------------
// Key files
// ---------------------------------------------------------------------------

/** The registry file inside a registry directory. */
export function registryPath(dir) {
  return path.join(dir, 'registry.json');
}

/**
 * The key file for a peer. The id is sanitised so a hostile or malformed peerId cannot
 * escape the registry directory (`../../etc/passwd` becomes `.._.._etc_passwd`).
 */
export function keyPathFor(dir, peerId) {
  return path.join(dir, `${String(peerId).replace(/[^\w.-]/g, '_')}.key`);
}

/** SHA-256 hex of arbitrary key material. */
export function hashKeyContents(contents) {
  return crypto.createHash('sha256').update(contents).digest('hex');
}

/** SHA-256 hex of a key file, or null when it is missing or unreadable. */
export function hashKeyFile(keyPath) {
  try {
    return hashKeyContents(fs.readFileSync(keyPath));
  } catch {
    return null;
  }
}

/**
 * Mint a key file if it does not exist, then return its hash. Idempotent: a second call
 * returns the same hash with `created: false`, so a restarting peer keeps its identity.
 */
export function ensureKeyFile(keyPath, { bytes = 32 } = {}) {
  if (fs.existsSync(keyPath)) {
    return { keyPath, keyHash: hashKeyFile(keyPath), created: false };
  }
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  const key = crypto.randomBytes(bytes).toString('hex');
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  return { keyPath, keyHash: hashKeyContents(key), created: true };
}

/** A stable, short peer id derived from a seed (e.g. platform:host:user:role). */
export function derivePeerId(seed) {
  return hashKeyContents(String(seed)).slice(0, 16);
}

// ---------------------------------------------------------------------------
// Registry lifecycle
// ---------------------------------------------------------------------------

/** A fresh, empty registry. */
export function emptyRegistry(now = Date.now()) {
  return { version: REGISTRY_VERSION, updatedAt: new Date(now).toISOString(), peers: {} };
}

/**
 * Coerce anything into a usable registry without dropping data. Unknown top-level and
 * per-peer fields are preserved; malformed peers are skipped rather than throwing.
 */
export function normalizeRegistry(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const peersSrc = src.peers && typeof src.peers === 'object' && !Array.isArray(src.peers) ? src.peers : {};
  const peers = {};
  for (const [id, entry] of Object.entries(peersSrc)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    peers[id] = { ...entry, peerId: entry.peerId ?? id };
  }
  return { ...src, version: src.version ?? REGISTRY_VERSION, peers };
}

/** Read a registry file; a missing or corrupt file yields an empty registry. */
export function loadRegistry(file) {
  try {
    return normalizeRegistry(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return emptyRegistry();
  }
}

/** Write a registry file atomically (temp file + rename) so a crash cannot truncate it. */
export function saveRegistry(file, registry, { now = Date.now() } = {}) {
  const reg = normalizeRegistry(registry);
  const out = { ...reg, version: reg.version ?? REGISTRY_VERSION, updatedAt: new Date(now).toISOString() };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n');
  fs.renameSync(tmp, file);
  return out;
}

/**
 * Read-modify-write in one call. `fn` receives the loaded registry and returns either a
 * mutator result (`{ registry, ...meta }`) or a bare registry; the saved registry is
 * returned alongside the mutator's metadata.
 */
export function withRegistry(file, fn, { now = Date.now() } = {}) {
  const current = loadRegistry(file);
  const outcome = fn(current);
  const next = outcome && outcome.registry ? outcome.registry : outcome && outcome.peers ? outcome : current;
  const saved = saveRegistry(file, next, { now });
  return { ...(outcome && outcome.registry ? outcome : {}), registry: saved };
}

/** Default registry directory for a message-center box. */
export function defaultRegistryDir(box) {
  return path.join(box, 'peer');
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Is this entry owned by agent-evo? Only these are ever mutated. */
export function isManaged(entry) {
  return !!entry && entry.managedBy === MANAGED_BY;
}

export function isBusy(entry) {
  return !!entry && entry.status === STATUS.BUSY;
}

export function isIdle(entry) {
  return !!entry && entry.status === STATUS.IDLE;
}

/** Has the entry's heartbeat aged past `staleMs`? A missing timestamp is tolerated. */
export function isStale(entry, now = Date.now(), staleMs = DEFAULT_STALE_MS) {
  if (!entry || !entry.updatedAt) return false;
  if (!Number.isFinite(staleMs)) return false;
  const t = Date.parse(entry.updatedAt);
  if (Number.isNaN(t)) return false;
  return now - t >= staleMs;
}

/** Is a PID alive? EPERM means it exists but belongs to another user, so it is alive. */
export function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return !!err && err.code === 'EPERM';
  }
}

/** PIDs of registered peers, ascending. `managedOnly` excludes foreign entries. */
export function listPids(registry, { managedOnly = false } = {}) {
  const reg = normalizeRegistry(registry);
  const pids = [];
  for (const entry of Object.values(reg.peers)) {
    if (managedOnly && !isManaged(entry)) continue;
    if (Number.isInteger(entry.pid) && entry.pid > 0) pids.push(entry.pid);
  }
  return pids.sort((a, b) => a - b);
}

/** Every agent-evo-managed peer entry. */
export function listManagedPeers(registry) {
  return Object.values(normalizeRegistry(registry).peers).filter(isManaged);
}

// ---------------------------------------------------------------------------
// Mutators — all return { registry, ...meta } and never touch foreign entries
// ---------------------------------------------------------------------------

/**
 * Add or refresh a peer. A foreign entry with the same id is left untouched and reported
 * as skipped, so a sidecar can never clobber another tool's registration.
 */
export function registerPeer(registry, entry, { now = Date.now() } = {}) {
  const reg = normalizeRegistry(registry);
  const peerId = entry && entry.peerId;
  if (!peerId) throw new Error('registerPeer: entry.peerId is required');
  const prev = reg.peers[peerId];
  if (prev && !isManaged(prev)) {
    return { registry: reg, peerId, created: false, skipped: true, reason: 'foreign' };
  }
  const ts = new Date(now).toISOString();
  const next = {
    ...prev,
    ...entry,
    peerId,
    // Always stamped: this module IS agent-evo, so anything it writes is managed by
    // definition. A caller-supplied marker is ignored rather than allowed to create a
    // foreign entry that the module would then refuse to clean up.
    managedBy: MANAGED_BY,
    status: entry.status ?? prev?.status ?? STATUS.IDLE,
    startedAt: prev?.startedAt ?? entry.startedAt ?? ts,
    updatedAt: ts,
  };
  return { registry: { ...reg, peers: { ...reg.peers, [peerId]: next } }, peerId, created: !prev };
}

/** Remove a managed peer. Foreign and missing entries are reported, not removed. */
export function unregisterPeer(registry, peerId) {
  const reg = normalizeRegistry(registry);
  const prev = reg.peers[peerId];
  if (!prev) return { registry: reg, removed: false };
  if (!isManaged(prev)) return { registry: reg, removed: false, skipped: true, reason: 'foreign' };
  const peers = { ...reg.peers };
  delete peers[peerId];
  return { registry: { ...reg, peers }, removed: true };
}

/** Set a managed peer's busy/idle status and refresh its heartbeat. */
export function setStatus(registry, peerId, status, { now = Date.now() } = {}) {
  if (status !== STATUS.BUSY && status !== STATUS.IDLE) {
    throw new Error(`setStatus: status must be "${STATUS.BUSY}" or "${STATUS.IDLE}"`);
  }
  const reg = normalizeRegistry(registry);
  const prev = reg.peers[peerId];
  if (!prev) return { registry: reg, changed: false, skipped: true, reason: 'missing' };
  if (!isManaged(prev)) return { registry: reg, changed: false, skipped: true, reason: 'foreign' };
  const next = { ...prev, status, updatedAt: new Date(now).toISOString() };
  return { registry: { ...reg, peers: { ...reg.peers, [peerId]: next } }, changed: true };
}

/** Refresh a managed peer's heartbeat without changing its status. */
export function touchPeer(registry, peerId, { now = Date.now() } = {}) {
  const reg = normalizeRegistry(registry);
  const prev = reg.peers[peerId];
  if (!prev) return { registry: reg, changed: false, skipped: true, reason: 'missing' };
  if (!isManaged(prev)) return { registry: reg, changed: false, skipped: true, reason: 'foreign' };
  const next = { ...prev, updatedAt: new Date(now).toISOString() };
  return { registry: { ...reg, peers: { ...reg.peers, [peerId]: next } }, changed: true };
}

/**
 * Reap managed peers whose PID is dead or whose heartbeat is stale. Foreign entries are
 * always kept and listed in `skipped`; `isAlive` is injectable so the sidecar (and tests)
 * can supply their own liveness probe.
 */
export function cleanupRegistry(registry, { isAlive = isPidAlive, now = Date.now(), staleMs = DEFAULT_STALE_MS } = {}) {
  const reg = normalizeRegistry(registry);
  const peers = {};
  const removed = [];
  const skipped = [];
  for (const [id, entry] of Object.entries(reg.peers)) {
    if (!isManaged(entry)) {
      peers[id] = entry;
      skipped.push(id);
      continue;
    }
    if (!isAlive(entry.pid) || isStale(entry, now, staleMs)) {
      removed.push(id);
      continue;
    }
    peers[id] = entry;
  }
  return { registry: { ...reg, peers }, removed, skipped };
}
