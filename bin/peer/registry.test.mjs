// Self-check for the peer registry: bun test bin/peer/registry.test.mjs
// (`node --test` works only where a real Node.js is installed. Where `node` is a bun
// shim it runs the file with no runner at all and node:test throws on the first case.)
//
// Self-contained and hermetic: every test uses a throwaway tmpdir, so nothing real is
// touched. Only node: builtins. The suite pins the contract a sidecar depends on —
// key-path derivation, registration, cleanup, same-user identity, stale handling and
// the managedBy filter — plus the two invariants that make the registry safe to share:
// foreign entries are never mutated, and unknown fields survive a round-trip.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

import {
  MANAGED_BY,
  REGISTRY_VERSION,
  STATUS,
  DEFAULT_STALE_MS,
  platformIdentity,
  sameUser,
  isSameUser,
  registryPath,
  keyPathFor,
  hashKeyContents,
  hashKeyFile,
  ensureKeyFile,
  derivePeerId,
  peerIdForLane,
  emptyRegistry,
  normalizeRegistry,
  loadRegistry,
  saveRegistry,
  withRegistry,
  defaultRegistryDir,
  isManaged,
  isBusy,
  isIdle,
  isStale,
  isPidAlive,
  listPids,
  listManagedPeers,
  registerPeer,
  unregisterPeer,
  setStatus,
  touchPeer,
  cleanupRegistry,
} from './registry.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'peer-registry-test-'));
const managed = (over = {}) => ({ peerId: 'p1', managedBy: MANAGED_BY, pid: process.pid, status: STATUS.IDLE, ...over });

// ---------------------------------------------------------------------------
// Key path derivation
// ---------------------------------------------------------------------------
test('registryPath puts registry.json inside the given directory', () => {
  assert.equal(registryPath('/box/peer'), path.join('/box/peer', 'registry.json'));
});

test('keyPathFor derives <id>.key and sanitises traversal out of the id', () => {
  const dir = tmp();
  assert.equal(keyPathFor(dir, 'abc123'), path.join(dir, 'abc123.key'));
  const escaped = keyPathFor(dir, '../../etc/passwd');
  assert.equal(path.dirname(escaped), dir, 'a hostile id cannot escape the registry dir');
  assert.equal(path.basename(escaped), '.._.._etc_passwd.key', 'separators are neutralised into one filename');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('derivePeerId is stable, short and seed-sensitive', () => {
  const a = derivePeerId('linux:host:user:sidecar');
  assert.equal(a, derivePeerId('linux:host:user:sidecar'), 'same seed -> same id');
  assert.notEqual(a, derivePeerId('linux:host:user:other'));
  assert.match(a, /^[0-9a-f]{16}$/);
});

test('hashKeyContents is deterministic sha256 hex', () => {
  assert.equal(hashKeyContents('secret'), hashKeyContents('secret'));
  assert.notEqual(hashKeyContents('secret'), hashKeyContents('secret2'));
  assert.match(hashKeyContents('secret'), /^[0-9a-f]{64}$/);
});

test('ensureKeyFile mints once, then returns the same hash', () => {
  const dir = tmp();
  const kp = keyPathFor(dir, 'peer-a');
  const first = ensureKeyFile(kp);
  assert.equal(first.created, true);
  assert.ok(fs.existsSync(kp));
  assert.equal(first.keyHash, hashKeyFile(kp));

  const second = ensureKeyFile(kp);
  assert.equal(second.created, false, 'restart keeps identity');
  assert.equal(second.keyHash, first.keyHash);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('hashKeyFile returns null for a missing file instead of throwing', () => {
  assert.equal(hashKeyFile(path.join(tmp(), 'nope.key')), null);
});

// ---------------------------------------------------------------------------
// Same-user identity
// ---------------------------------------------------------------------------
test('sameUser: equal non-negative uids match, different uids do not', () => {
  assert.equal(sameUser({ uid: 1000, username: 'a' }, { uid: 1000, username: 'b' }), true);
  assert.equal(sameUser({ uid: 1000 }, { uid: 1001 }), false);
});

test('sameUser: Windows -1 uid falls back to a case-insensitive username', () => {
  assert.equal(sameUser({ uid: -1, username: 'Shuff57' }, { uid: -1, username: 'shuff57' }), true);
  assert.equal(sameUser({ uid: -1, username: 'shuff57' }, { uid: -1, username: 'other' }), false);
  assert.equal(sameUser({ uid: -1 }, { uid: -1 }), false, 'two anonymous -1 users are not the same user');
});

test('sameUser: null/undefined identities never match', () => {
  assert.equal(sameUser(null, { uid: 1 }), false);
  assert.equal(sameUser({ uid: 1 }, undefined), false);
});

test('isSameUser reads a peer entry against an identity', () => {
  const id = platformIdentity();
  assert.equal(isSameUser({ ...id }, id), true);
  assert.equal(isSameUser({ uid: 999999, username: 'nobody-else' }, id), false);
});

test('platformIdentity reports the fields a peer entry needs', () => {
  const id = platformIdentity();
  assert.equal(id.platform, process.platform);
  assert.equal(typeof id.hostname, 'string');
  assert.ok('username' in id && 'uid' in id && 'homedir' in id);
});

// ---------------------------------------------------------------------------
// Registry lifecycle
// ---------------------------------------------------------------------------
test('emptyRegistry has a version and no peers', () => {
  const reg = emptyRegistry();
  assert.equal(reg.version, REGISTRY_VERSION);
  assert.deepEqual(reg.peers, {});
});

test('save/load round-trips and preserves unknown fields', () => {
  const dir = tmp();
  const file = registryPath(dir);
  const reg = emptyRegistry();
  reg.futureTopLevel = { keep: true };
  reg.peers.p1 = managed({ futurePeerField: 42, nested: { a: 1 } });
  saveRegistry(file, reg);

  const loaded = loadRegistry(file);
  assert.equal(loaded.futureTopLevel.keep, true, 'unknown top-level field survives');
  assert.equal(loaded.peers.p1.futurePeerField, 42, 'unknown peer field survives');
  assert.deepEqual(loaded.peers.p1.nested, { a: 1 });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadRegistry tolerates a missing or corrupt file', () => {
  const dir = tmp();
  assert.deepEqual(loadRegistry(registryPath(dir)).peers, {}, 'missing file -> empty registry');
  fs.writeFileSync(registryPath(dir), '{ not json');
  assert.deepEqual(loadRegistry(registryPath(dir)).peers, {}, 'corrupt file -> empty registry');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('normalizeRegistry drops malformed peers but keeps the rest', () => {
  const reg = normalizeRegistry({ peers: { good: { pid: 1 }, bad: 'nope', worse: null, arr: [] } });
  assert.deepEqual(Object.keys(reg.peers), ['good']);
  assert.equal(reg.peers.good.peerId, 'good', 'peerId defaults to the map key');
});

test('withRegistry reads, mutates and persists in one call', () => {
  const dir = tmp();
  const file = registryPath(dir);
  const out = withRegistry(file, (reg) => registerPeer(reg, managed({ peerId: 'w1' })));
  assert.equal(out.created, true);
  assert.ok(out.registry.peers.w1, 'returned registry carries the new peer');
  assert.ok(loadRegistry(file).peers.w1, 'and it was written to disk');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('defaultRegistryDir nests peer/ under the box', () => {
  assert.equal(defaultRegistryDir('/box'), path.join('/box', 'peer'));
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
test('registerPeer creates a managed entry with timestamps and default status', () => {
  const { registry, created } = registerPeer(emptyRegistry(), { peerId: 'p1', pid: 123 });
  assert.equal(created, true);
  const e = registry.peers.p1;
  assert.equal(e.managedBy, MANAGED_BY);
  assert.equal(e.status, STATUS.IDLE);
  assert.ok(e.startedAt && e.updatedAt);
});

test('registerPeer refreshes an existing peer but keeps startedAt', () => {
  const first = registerPeer(emptyRegistry(), managed({ peerId: 'p1' }), { now: 1000 });
  const second = registerPeer(first.registry, managed({ peerId: 'p1', status: STATUS.BUSY }), { now: 2000 });
  assert.equal(second.created, false);
  assert.equal(second.registry.peers.p1.startedAt, first.registry.peers.p1.startedAt, 'start time is stable');
  assert.equal(second.registry.peers.p1.status, STATUS.BUSY);
  assert.notEqual(second.registry.peers.p1.updatedAt, first.registry.peers.p1.updatedAt);
});

test('registerPeer requires a peerId', () => {
  assert.throws(() => registerPeer(emptyRegistry(), { pid: 1 }), /peerId is required/);
});

test('registerPeer never overwrites a foreign entry', () => {
  const reg = normalizeRegistry({ peers: { p1: { peerId: 'p1', managedBy: 'someone-else', pid: 9 } } });
  const out = registerPeer(reg, managed({ peerId: 'p1', pid: 123 }));
  assert.equal(out.skipped, true);
  assert.equal(out.reason, 'foreign');
  assert.equal(out.registry.peers.p1.pid, 9, 'foreign entry is byte-for-byte untouched');
});

test('registerPeer always stamps its own managedBy marker', () => {
  const out = registerPeer(emptyRegistry(), { peerId: 'p1', pid: 1, managedBy: 'someone-else' });
  assert.equal(out.registry.peers.p1.managedBy, MANAGED_BY, 'a caller cannot create an unmanageable entry');
  assert.equal(isManaged(out.registry.peers.p1), true);
});

test('unregisterPeer removes only managed peers', () => {
  const reg = normalizeRegistry({
    peers: { mine: managed({ peerId: 'mine' }), theirs: { peerId: 'theirs', managedBy: 'other' } },
  });
  const out = unregisterPeer(reg, 'mine');
  assert.equal(out.removed, true);
  assert.ok(!out.registry.peers.mine);

  const foreign = unregisterPeer(reg, 'theirs');
  assert.equal(foreign.removed, false);
  assert.equal(foreign.skipped, true);
  assert.ok(foreign.registry.peers.theirs, 'foreign entry survives');

  assert.equal(unregisterPeer(reg, 'ghost').removed, false, 'missing peer is a no-op');
});

// ---------------------------------------------------------------------------
// Status handling
// ---------------------------------------------------------------------------
test('setStatus flips busy/idle and refreshes the heartbeat', () => {
  const reg = registerPeer(emptyRegistry(), managed({ peerId: 'p1' }), { now: 1000 }).registry;
  const busy = setStatus(reg, 'p1', STATUS.BUSY, { now: 5000 });
  assert.equal(busy.changed, true);
  assert.equal(isBusy(busy.registry.peers.p1), true);
  assert.equal(isIdle(busy.registry.peers.p1), false);

  const idle = setStatus(busy.registry, 'p1', STATUS.IDLE, { now: 6000 });
  assert.equal(isIdle(idle.registry.peers.p1), true);
});

test('setStatus rejects an unknown status', () => {
  const reg = registerPeer(emptyRegistry(), managed({ peerId: 'p1' })).registry;
  assert.throws(() => setStatus(reg, 'p1', 'sleeping'), /busy.*idle/);
});

test('setStatus/touchPeer skip foreign and missing peers', () => {
  const reg = normalizeRegistry({ peers: { theirs: { peerId: 'theirs', managedBy: 'other', status: STATUS.IDLE } } });
  const s = setStatus(reg, 'theirs', STATUS.BUSY);
  assert.equal(s.skipped, true);
  assert.equal(s.registry.peers.theirs.status, STATUS.IDLE, 'foreign status unchanged');
  assert.equal(setStatus(reg, 'ghost', STATUS.BUSY).reason, 'missing');
  assert.equal(touchPeer(reg, 'theirs').reason, 'foreign');
});

test('touchPeer refreshes updatedAt without changing status', () => {
  const reg = registerPeer(emptyRegistry(), managed({ peerId: 'p1', status: STATUS.BUSY }), { now: 1000 }).registry;
  const out = touchPeer(reg, 'p1', { now: 9000 });
  assert.equal(out.changed, true);
  assert.equal(out.registry.peers.p1.status, STATUS.BUSY);
  assert.equal(out.registry.peers.p1.updatedAt, new Date(9000).toISOString());
});

// ---------------------------------------------------------------------------
// Stale entry handling
// ---------------------------------------------------------------------------
test('isStale is false for a fresh entry and true past the window', () => {
  const now = 1_000_000;
  const fresh = { updatedAt: new Date(now - 1000).toISOString() };
  const old = { updatedAt: new Date(now - DEFAULT_STALE_MS - 1).toISOString() };
  assert.equal(isStale(fresh, now), false);
  assert.equal(isStale(old, now), true);
  assert.equal(isStale({ updatedAt: new Date(now - 5000).toISOString() }, now, 1000), true, 'custom window honoured');
});

test('isStale tolerates a missing or unparseable timestamp', () => {
  assert.equal(isStale({}, Date.now()), false);
  assert.equal(isStale({ updatedAt: 'not-a-date' }, Date.now()), false);
  assert.equal(isStale(null, Date.now()), false);
});

test('cleanupRegistry reaps dead-PID and stale managed peers', () => {
  const now = 1_000_000;
  const reg = normalizeRegistry({
    peers: {
      alive: managed({ peerId: 'alive', pid: 1, updatedAt: new Date(now).toISOString() }),
      dead: managed({ peerId: 'dead', pid: 2, updatedAt: new Date(now).toISOString() }),
      stale: managed({ peerId: 'stale', pid: 3, updatedAt: new Date(now - DEFAULT_STALE_MS - 1).toISOString() }),
    },
  });
  const out = cleanupRegistry(reg, { isAlive: (pid) => pid === 1, now });
  assert.deepEqual(out.removed.sort(), ['dead', 'stale']);
  assert.deepEqual(Object.keys(out.registry.peers), ['alive']);
});

test('cleanupRegistry keeps foreign entries and reports them as skipped', () => {
  const now = 1_000_000;
  const reg = normalizeRegistry({
    peers: {
      theirs: { peerId: 'theirs', managedBy: 'other', pid: 999, updatedAt: new Date(0).toISOString() },
      mine: managed({ peerId: 'mine', pid: 1, updatedAt: new Date(now).toISOString() }),
    },
  });
  const out = cleanupRegistry(reg, { isAlive: () => false, now });
  assert.deepEqual(out.removed, ['mine']);
  assert.deepEqual(out.skipped, ['theirs']);
  assert.ok(out.registry.peers.theirs, 'a dead foreign PID is still not ours to reap');
});

test('cleanupRegistry with a live, fresh peer removes nothing', () => {
  const now = 1_000_000;
  const reg = normalizeRegistry({ peers: { p1: managed({ peerId: 'p1', pid: 1, updatedAt: new Date(now).toISOString() }) } });
  const out = cleanupRegistry(reg, { isAlive: () => true, now });
  assert.deepEqual(out.removed, []);
  assert.deepEqual(Object.keys(out.registry.peers), ['p1']);
});

// ---------------------------------------------------------------------------
// managedBy filtering + PID listing
// ---------------------------------------------------------------------------
test('isManaged only accepts the agent-evo marker', () => {
  assert.equal(isManaged({ managedBy: MANAGED_BY }), true);
  assert.equal(isManaged({ managedBy: 'other' }), false);
  assert.equal(isManaged({}), false);
  assert.equal(isManaged(null), false);
});

test('listManagedPeers excludes foreign entries', () => {
  const reg = normalizeRegistry({
    peers: {
      a: managed({ peerId: 'a' }),
      b: { peerId: 'b', managedBy: 'other' },
      c: managed({ peerId: 'c' }),
    },
  });
  assert.deepEqual(listManagedPeers(reg).map((e) => e.peerId).sort(), ['a', 'c']);
});

test('listPids returns sorted PIDs and can filter to managed peers', () => {
  const reg = normalizeRegistry({
    peers: {
      a: managed({ peerId: 'a', pid: 30 }),
      b: { peerId: 'b', managedBy: 'other', pid: 10 },
      c: managed({ peerId: 'c', pid: 20 }),
      d: managed({ peerId: 'd', pid: 'not-a-pid' }),
    },
  });
  assert.deepEqual(listPids(reg), [10, 20, 30]);
  assert.deepEqual(listPids(reg, { managedOnly: true }), [20, 30]);
});

test('isPidAlive: this process is alive, nonsense PIDs are not', () => {
  assert.equal(isPidAlive(process.pid), true);
  assert.equal(isPidAlive(0), false);
  assert.equal(isPidAlive(-1), false);
  assert.equal(isPidAlive(undefined), false);
  assert.equal(isPidAlive('123'), false);
});

// ---------------------------------------------------------------------------
// Cross-process safety — the registry is shared, so these are the tests that
// matter most. Both were written after a live duplex run: six sidecars started
// together, all six minted a key and printed ready, and only THREE ended up in
// the registry. Shutting all six down left two phantom entries for dead
// processes. Every peer had done its own read-modify-write on one file, so the
// last writer silently discarded whatever the others had just committed.
// ---------------------------------------------------------------------------

const WORKER = `
import { registerPeer, unregisterPeer, withRegistry } from '${path.resolve('bin/peer/registry.mjs')}';
const [file, action, id] = process.argv.slice(2);
withRegistry(file, (reg) =>
  action === 'add' ? registerPeer(reg, { peerId: id, name: id, pid: process.pid }) : unregisterPeer(reg, id));
`;

function runWorkers(file, action, ids) {
  const script = path.join(path.dirname(file), `worker-${action}.mjs`);
  fs.writeFileSync(script, WORKER);
  const kids = ids.map((id) =>
    spawn(process.execPath, [script, file, action, id], { stdio: 'ignore' }));
  return Promise.all(kids.map((k) => once(k, 'exit')));
}

test('concurrent registrations from separate processes all survive', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-race-'));
  const file = registryPath(dir);
  saveRegistry(file, emptyRegistry());

  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  await runWorkers(file, 'add', ids);

  assert.deepEqual(Object.keys(loadRegistry(file).peers).sort(), ids,
    'a lost update here is a peer nobody can address');
});

test('concurrent unregistrations leave no phantom entries', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-race-'));
  const file = registryPath(dir);
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  let reg = emptyRegistry();
  for (const id of ids) reg = registerPeer(reg, { peerId: id, name: id, pid: process.pid }).registry;
  saveRegistry(file, reg);

  await runWorkers(file, 'remove', ids);

  assert.deepEqual(Object.keys(loadRegistry(file).peers), [],
    'a resurrected entry points senders at a socket whose owner is gone');
});

// ---------------------------------------------------------------------------
// One lane, one id. The sidecar, the CLI, the handoff wrapper and the opencode
// plugin each used to build this seed by hand, and the plugin's copy left out
// the username — so its heartbeat looked for an entry that could never exist
// and was a silent no-op forever. Its own test passed because it recomputed the
// plugin's formula instead of the contract.
// ---------------------------------------------------------------------------

test('peerIdForLane is stable and distinguishes lanes', () => {
  assert.equal(peerIdForLane('opencode'), peerIdForLane('opencode'));
  assert.notEqual(peerIdForLane('opencode'), peerIdForLane('claude'));
  assert.match(peerIdForLane('opencode'), /^[0-9a-f]{16}$/);
});

test('peerIdForLane includes the OS user, so two users do not collide', () => {
  const id = platformIdentity();
  const mine = peerIdForLane('opencode', id);
  const theirs = peerIdForLane('opencode', { ...id, username: `${id.username}-other` });
  assert.notEqual(mine, theirs);
  assert.equal(mine, peerIdForLane('opencode'), 'the default is this process identity');
});

test('every peer component derives its lane id from peerIdForLane', () => {
  const root = path.resolve('.');
  for (const f of ['bin/peer-sidecar.mjs', 'bin/peer.mjs', 'bin/handoff.mjs', 'opencode/plugin/inbox.js']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    assert.match(src, /peerIdForLane\(/, `${f} must not hand-roll the seed`);
    assert.ok(!/derivePeerId\(/.test(src), `${f} calls derivePeerId directly — that is how the seeds drifted`);
  }
});
