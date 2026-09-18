// Contract tests for bin/peer-term.mjs — the watchable tmux lane.
//
// Run with: bun test bin/peer/term.test.mjs
// (`node --test` does not work on a box where `node` is a bun shim; see the header of
// peer-term.mjs. These use node:test so they run under either runner.)
//
// Every test drives a FAKE opencode: a shell script that dumps its argv NUL-separated
// beside itself and prints a canned event stream. That keeps the suite hermetic, free
// and fast, and it puts the assertions where the bugs actually live — argv construction,
// completion detection, capture, and session continuity — rather than on a model's reply.
//
// The fake writes its argv to `$0.argv` rather than to a path passed in the environment
// ON PURPOSE: a tmux pane inherits the tmux SERVER's environment, not the environment of
// whoever ran `new-session`, so anything the pane needs has to arrive in the command
// string. Discovering that through a flaky test would have cost an afternoon.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TERM = path.resolve(HERE, '..', 'peer-term.mjs');

const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const tmux = (...args) => execFileSync('tmux', args, { encoding: 'utf8' });

// Lanes are randomised because the tmux session name is derived from the lane, and a
// fixed name would collide with a developer's own `peer-opencode` session.
let laneSeq = 0;
const freshLane = () => `t${process.pid}x${laneSeq++}`;

// Kill every tmux session these tests created, however the run ends.
const lanes = new Set();
process.on('exit', () => {
  for (const lane of lanes) { try { tmux('kill-session', '-t', `peer-${lane}`); } catch { /* gone */ } }
});

function makeFake(dir, { reply = 'FAKE-REPLY', sessionID = 'ses_fake1', exit = 0, sleep = 0, interrupt = false } = {}) {
  const bin = path.join(dir, 'fake-opencode');
  fs.writeFileSync(bin, [
    '#!/bin/sh',
    'printf \'%s\\0\' "$@" > "$0.argv"',
    sleep ? `sleep ${sleep}` : '',
    // Stands in for a human hitting Ctrl-C in the pane: kill the subshell that would
    // have recorded the exit code, leaving the outer shell to write the done-file.
    interrupt ? 'kill -9 $PPID' : '',
    `printf '{"type":"step_start","sessionID":"${sessionID}","part":{"id":"prt_s","type":"step-start"}}\\n'`,
    `printf '{"type":"text","sessionID":"${sessionID}","part":{"id":"prt_t","type":"text","text":"${reply}"}}\\n'`,
    `printf '{"type":"step_finish","sessionID":"${sessionID}","part":{"id":"prt_f","type":"step-finish"}}\\n'`,
    `exit ${exit}`,
  ].filter(Boolean).join('\n') + '\n', { mode: 0o755 });
  return { bin, argvFile: `${bin}.argv` };
}

const argvOf = (argvFile) => fs.readFileSync(argvFile, 'utf8').split('\0').slice(0, -1);

function runTerm(box, args, { fake, expectFail = false } = {}) {
  const env = { ...process.env, MSGBOX: box };
  if (fake) env.PEER_TERM_OPENCODE = fake;
  try {
    const stdout = execFileSync(process.execPath, [TERM, ...args], {
      env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.ok(!expectFail, 'expected a non-zero exit');
    return { stdout, code: 0, stderr: '' };
  } catch (err) {
    assert.ok(expectFail, `unexpected failure: ${err.stderr || err.message}`);
    return { stdout: err.stdout ?? '', code: err.status, stderr: err.stderr ?? '' };
  }
}

const stateOf = (box, lane) => JSON.parse(fs.readFileSync(path.join(box, 'term', `${lane}.json`), 'utf8'));

test('ask: opens a tmux lane, returns the reply, and remembers the session', () => {
  const box = tmp('term-ask-');
  const lane = freshLane(); lanes.add(lane);
  const { bin, argvFile } = makeFake(box);

  const { stdout } = runTerm(box, ['ask', '--as', lane, '--text', 'hello there'], { fake: bin });
  assert.match(stdout, /FAKE-REPLY/);

  // The pane exists and is watchable — that is the whole point of this transport.
  assert.doesNotThrow(() => tmux('has-session', '-t', `peer-${lane}`));

  const argv = argvOf(argvFile);
  assert.equal(argv.at(-1), 'hello there', 'the prompt is the last argument');
  assert.ok(argv.includes('--format') && argv.includes('json'), 'parsed from the JSON stream');
  assert.equal(stateOf(box, lane).sessionID, 'ses_fake1', 'session id captured for the next turn');
});

test('ask: the second turn continues the captured session', () => {
  const box = tmp('term-continue-');
  const lane = freshLane(); lanes.add(lane);
  const { bin, argvFile } = makeFake(box);

  runTerm(box, ['ask', '--as', lane, '--text', 'turn one'], { fake: bin });
  assert.ok(!argvOf(argvFile).includes('--session'), 'the first turn has no session to continue');

  runTerm(box, ['ask', '--as', lane, '--text', 'turn two'], { fake: bin });
  const argv = argvOf(argvFile);
  const i = argv.indexOf('--session');
  assert.notEqual(i, -1, 'the second turn continues');
  assert.equal(argv[i + 1], 'ses_fake1');
});

test('ask: --new starts a fresh session instead of continuing', () => {
  const box = tmp('term-new-');
  const lane = freshLane(); lanes.add(lane);
  const { bin, argvFile } = makeFake(box);

  runTerm(box, ['ask', '--as', lane, '--text', 'one'], { fake: bin });
  runTerm(box, ['ask', '--as', lane, '--text', 'two', '--new'], { fake: bin });
  assert.ok(!argvOf(argvFile).includes('--session'), '--new drops the remembered session');
});

// THE test. The prompt is typed into a live shell, so every quoting mistake in this
// file's command construction is a shell-injection bug. handoff.mjs has a five-failure
// header about exactly this class; peer-term must round-trip the hostile string byte for
// byte instead of stripping it.
test('ask: a prompt full of shell metacharacters arrives verbatim', () => {
  const box = tmp('term-inject-');
  const lane = freshLane(); lanes.add(lane);
  const { bin, argvFile } = makeFake(box);

  const nasty = [
    `'; touch ${path.join(box, 'PWNED')}; echo '`,
    '"double" `backtick` $(whoami) ${HOME} $HOME',
    'pipe | amp & semi ; redirect > < caret ^ percent %',
    'angle <brackets> and a literal newline follows:',
    'second line with \'single\' quotes',
  ].join('\n');

  runTerm(box, ['ask', '--as', lane, '--text', nasty], { fake: bin });

  assert.equal(argvOf(argvFile).at(-1), nasty, 'the prompt survives the shell untouched');
  assert.equal(fs.existsSync(path.join(box, 'PWNED')), false, 'nothing was executed');
});

test('ask: a trailing newline is the one thing the prompt loses', () => {
  const box = tmp('term-trailing-');
  const lane = freshLane(); lanes.add(lane);
  const { bin, argvFile } = makeFake(box);

  // Command substitution strips trailing newlines and there is no way around it short of
  // a second wrapper process. Pinned rather than hidden: a prompt whose meaning depends
  // on trailing blank lines will not survive this transport.
  runTerm(box, ['ask', '--as', lane, '--text', 'body\n\n'], { fake: bin });
  assert.equal(argvOf(argvFile).at(-1), 'body');
});

test('ask: refuses to type into a pane that is still busy', () => {
  const box = tmp('term-busy-');
  const lane = freshLane(); lanes.add(lane);
  const { bin } = makeFake(box);

  runTerm(box, ['ask', '--as', lane, '--text', 'first'], { fake: bin });
  // Occupy the pane with a foreground process, exactly as an in-flight turn would.
  tmux('send-keys', '-t', `peer-${lane}`, '--', 'sleep 30', 'Enter');
  for (let i = 0; i < 100; i++) {
    if (tmux('display-message', '-p', '-t', `peer-${lane}`, '#{pane_current_command}').trim() === 'sleep') break;
    execFileSync('sleep', ['0.05']);
  }

  const { stderr } = runTerm(box, ['ask', '--as', lane, '--text', 'second'], { fake: bin, expectFail: true });
  assert.match(stderr, /busy/i, 'a turn in flight must not have keys typed over it');
});

test('ask: a turn that never finishes times out and says so', () => {
  const box = tmp('term-timeout-');
  const lane = freshLane(); lanes.add(lane);
  const { bin } = makeFake(box, { sleep: 30 });

  const { stderr } = runTerm(box, ['ask', '--as', lane, '--text', 'slow', '--timeout', '600'], { fake: bin, expectFail: true });
  assert.match(stderr, /timed out/i);
  assert.match(stderr, new RegExp(`peer-${lane}`), 'the error names the pane to attach to');
});

test('ask: a non-zero opencode exit is reported, not swallowed', () => {
  const box = tmp('term-exit-');
  const lane = freshLane(); lanes.add(lane);
  const { bin } = makeFake(box, { exit: 7, reply: 'partial' });

  const { stderr } = runTerm(box, ['ask', '--as', lane, '--text', 'boom'], { fake: bin, expectFail: true });
  assert.match(stderr, /exit(ed)? 7/i);
});

// A lane built to be watched is a lane that can be Ctrl-C'd. The group dies before it
// records an exit code while the outer shell still writes the done-file, so the caller
// sees "finished, no exit code" — which must read as an interrupted turn, not as an
// ENOENT stack trace.
test('ask: an interrupted turn is reported as interrupted', () => {
  const box = tmp('term-interrupt-');
  const lane = freshLane(); lanes.add(lane);
  const { bin } = makeFake(box, { interrupt: true });

  const { stderr } = runTerm(box, ['ask', '--as', lane, '--text', 'interrupt me'], { fake: bin, expectFail: true });
  assert.match(stderr, /interrupted/i);
  assert.ok(!/ENOENT/.test(stderr), 'the caller must not see a raw filesystem error');
});

test('ask: --log threads the exchange into the message center', () => {
  const box = tmp('term-log-');
  const lane = freshLane(); lanes.add(lane);
  const { bin } = makeFake(box);

  runTerm(box, ['ask', '--as', lane, '--text', 'logged question', '--log'], { fake: bin });
  const lines = fs.readFileSync(path.join(box, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(lines.length, 2, 'the question and the reply');
  assert.deepEqual([lines[0].from, lines[0].to, lines[0].text], ['claude', lane, 'logged question']);
  assert.deepEqual([lines[1].from, lines[1].to, lines[1].text], [lane, 'claude', 'FAKE-REPLY']);
});

test('ask: without --log the committed box log is left alone', () => {
  const box = tmp('term-nolog-');
  const lane = freshLane(); lanes.add(lane);
  const { bin } = makeFake(box);

  runTerm(box, ['ask', '--as', lane, '--text', 'quiet'], { fake: bin });
  assert.equal(fs.existsSync(path.join(box, 'log.jsonl')), false, 'log.jsonl is committed; never written unasked');
});

test('status: reports the lane, the session, and how to watch it', () => {
  const box = tmp('term-status-');
  const lane = freshLane(); lanes.add(lane);
  const { bin } = makeFake(box);

  runTerm(box, ['ask', '--as', lane, '--text', 'x'], { fake: bin });
  const { stdout } = runTerm(box, ['status', '--as', lane]);
  assert.match(stdout, /ses_fake1/);
  assert.match(stdout, new RegExp(`tmux attach -t peer-${lane}`), 'status tells you how to watch');
  assert.match(stdout, /idle/);
});

test('reset: forgets the session and can kill the pane', () => {
  const box = tmp('term-reset-');
  const lane = freshLane(); lanes.add(lane);
  const { bin, argvFile } = makeFake(box);

  runTerm(box, ['ask', '--as', lane, '--text', 'x'], { fake: bin });
  runTerm(box, ['reset', '--as', lane, '--kill']);

  assert.equal(fs.existsSync(path.join(box, 'term', `${lane}.json`)), false);
  assert.throws(() => tmux('has-session', '-t', `peer-${lane}`), 'the pane is gone');

  runTerm(box, ['ask', '--as', lane, '--text', 'after reset'], { fake: bin });
  assert.ok(!argvOf(argvFile).includes('--session'), 'a reset lane starts clean');
});

test('usage: a missing command or lane exits 2', () => {
  const box = tmp('term-usage-');
  assert.equal(runTerm(box, [], { expectFail: true }).code, 2);
  assert.equal(runTerm(box, ['ask', '--text', 'no lane'], { expectFail: true }).code, 2);
  assert.equal(runTerm(box, ['ask', '--as', 'x'], { expectFail: true }).code, 2);
});
