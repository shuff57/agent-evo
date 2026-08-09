// Self-check: node msg.test.mjs   (uses a throwaway box, touches nothing real)
import { execFileSync } from 'child_process';
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

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

fs.rmSync(box, { recursive: true, force: true });
console.log('all pass');
