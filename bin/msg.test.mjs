// Self-check: node msg.test.mjs   (uses a throwaway box, touches nothing real)
import { execFileSync } from 'child_process';
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const box = fs.mkdtempSync(path.join(os.tmpdir(), 'msgbox-test-'));
const msg = path.join(import.meta.dirname, 'msg.mjs');
const run = (...a) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [msg, ...a], { env: { ...process.env, MSGBOX: box }, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { code: e.status, out: (e.stdout ?? '') + (e.stderr ?? '') };
  }
};

// messaging round trip
run('send', '--from', 'claude', '--to', 'opencode', '--text', 'hello');
assert.match(run('read', '--as', 'opencode').out, /hello/, 'inbox delivers');
assert.match(run('read', '--as', 'opencode').out, /no new messages/, 'cursor advances');
assert.match(run('read', '--as', 'claude').out, /no new messages/, 'sender does not read own mail');

// ownership
assert.strictEqual(run('claim', '--as', 'claude', 'test.js').code, 0, 'claim succeeds');
assert.strictEqual(run('claim', '--as', 'opencode', 'test.js').code, 2, 'double claim rejected');
assert.strictEqual(run('claim', '--as', 'opencode', 'other.js').code, 0, 'unrelated claim fine');

// guard
assert.strictEqual(run('guard', '--as', 'opencode', '--path', 'test.js').code, 2, 'guard blocks other owner');
assert.strictEqual(run('guard', '--as', 'claude', '--path', 'test.js').code, 0, 'owner passes own file');
assert.strictEqual(run('guard', '--as', 'opencode', '--path', 'unclaimed.js').code, 0, 'unclaimed passes');

// directory claims cover children, siblings are untouched
run('claim', '--as', 'claude', 'lib/');
assert.strictEqual(run('guard', '--as', 'opencode', '--path', 'lib/deep/x.js').code, 2, 'dir claim covers children');
assert.strictEqual(run('guard', '--as', 'opencode', '--path', 'libel.js').code, 0, 'dir claim is not a string prefix');

// release
assert.strictEqual(run('release', '--as', 'opencode', 'test.js').code, 0, 'release of unowned path is a no-op, not an error');
assert.strictEqual(run('guard', '--as', 'opencode', '--path', 'test.js').code, 2, 'non-owner cannot release someone else claim');
run('release', '--as', 'claude', 'test.js');
assert.strictEqual(run('guard', '--as', 'opencode', '--path', 'test.js').code, 0, 'owner release frees the path');
run('release', '--as', 'claude', '--all');
assert.match(run('owners').out, /opencode\tother\.js/, 'release --all only drops that agent claims');

// --re last: thread without guessing an id
run('send', '--from', 'claude', '--to', 'opencode', '--text', 'question');
const threaded = run('send', '--from', 'opencode', '--to', 'claude', '--re', 'last', '--text', 'answer');
assert.match(threaded.out, /\(re #\d+\)/, '--re last resolves to the newest message addressed to me');

// auto-release: a builder that replies drops its claims; the host keeps its own
run('claim', '--as', 'opencode', 'builder-owned.js');
run('claim', '--as', 'claude', 'gate.js');
const reply = run('send', '--from', 'opencode', '--to', 'claude', '--re', 'last', '--text', 'done');
assert.match(reply.out, /auto-released opencode claims/, 'builder claims drop on reply');
assert.strictEqual(run('guard', '--as', 'claude', '--path', 'builder-owned.js').code, 0, 'released path is free');
assert.strictEqual(run('guard', '--as', 'opencode', '--path', 'gate.js').code, 2, 'host keeps its gate claim');
const kept = run('claim', '--as', 'opencode', 'again.js').code === 0 &&
  run('send', '--from', 'opencode', '--to', 'claude', '--re', 'last', '--keep', '--text', 'still working').out;
assert.ok(!/auto-released/.test(kept), '--keep opts out of auto-release');
assert.strictEqual(run('guard', '--as', 'claude', '--path', 'again.js').code, 2, '--keep really keeps the claim');

// inbox: the delivery a hook drives. It runs on EVERY tool call, so noise or a failure would break
// the very agent it exists to help.
// This runs LAST on purpose. By now the log is full of claim/release events, and `nobody-home` has
// never read it -- the exact shape of a fresh agent's first tool call. The first version of inbox
// reused read's filter and dumped the repo's whole ownership history into that call.
const quiet = run('inbox', '--as', 'nobody-home');
assert.strictEqual(quiet.code, 0, 'inbox exits 0 with nothing to deliver');
assert.strictEqual(quiet.out.trim(), '', 'a fresh agent is not flooded with ownership history');

run('send', '--from', 'claude', '--to', 'inboxee', '--text', 'stop what you are doing');
const delivered = run('inbox', '--as', 'inboxee');
assert.match(delivered.out, /stop what you are doing/, 'inbox delivers the text, not merely a notice');
assert.match(delivered.out, /\[message center\]/, 'delivery is labelled, so it is not read as tool output');

// The bug this shape exists to prevent: two cursors would mean a hook-delivered message either
// vanishes before the agent can `read` it, or arrives twice.
assert.match(run('read', '--as', 'inboxee').out, /no new messages/, 'inbox and read share one cursor');
assert.strictEqual(run('inbox', '--as', 'inboxee').out.trim(), '', 'a delivered message is not delivered twice');

// The plugin resolves the box itself, to stay free in the common case, so it MUST agree with
// msg.mjs about where the box is -- otherwise it watches a file nothing ever writes to and the
// whole feature silently does nothing.
const plugin = path.join(import.meta.dirname, '..', 'opencode', 'plugin', 'inbox.js');
const { findBox } = await import(pathToFileURL(plugin).href);
const whereNoOverride = execFileSync(process.execPath, [msg, 'where'],
  { env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'MSGBOX')), encoding: 'utf8' }).trim();
assert.strictEqual(findBox(process.cwd()), whereNoOverride, 'plugin and msg.mjs agree on the box path');
process.env.MSGBOX = '/tmp/explicit-box';
assert.strictEqual(findBox(process.cwd()), '/tmp/explicit-box', 'plugin honours MSGBOX like msg.mjs does');
delete process.env.MSGBOX;

fs.rmSync(box, { recursive: true, force: true });
console.log('all pass');
