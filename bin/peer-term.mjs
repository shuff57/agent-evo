#!/usr/bin/env node
// peer-term.mjs — a watchable opencode lane in a tmux pane.
//
// The peer bridge (peer.mjs / peer-sidecar.mjs) is a socket: fast, invisible. This is the
// other half of the same idea — a conversation you can WATCH. Each lane owns a tmux
// session, the prompt is typed into it, the reply renders live, and the caller gets the
// text back on stdout. `tmux attach -t peer-<lane>` at any moment shows the exchange.
//
//   node bin/peer-term.mjs ask --as review --text "..." [--model ID] [--new] [--log] [--auto]
//   node bin/peer-term.mjs status --as review
//   node bin/peer-term.mjs reset  --as review [--kill]
//
// Three things make this reliable rather than a screen-scrape:
//
//   1. Completion is a FACT, not a heuristic. The pane runs a small script that records
//      opencode's exit code and then touches a done-file; this process waits for that
//      file. No idle-detection, no "has the output stopped changing" guessing.
//   2. The prompt never enters the command line. It is written to a file and read back
//      with "$(cat file)", so shell metacharacters are data. handoff.mjs's header lists
//      five silent failures from prompts the shell reinterpreted; this sidesteps the
//      whole class. The one casualty is trailing newlines, which command substitution
//      strips — pinned in term.test.mjs rather than hidden.
//   3. Continuity is opencode's own: the session id is read out of the JSON event stream
//      and passed back as --session on the next turn, so each turn is a fresh process
//      and the conversation still remembers itself.
//
// Run the tests with `bun test bin/peer/term.test.mjs`. On a box where `node` is a bun
// shim, `node --test` runs the file WITHOUT a runner and node:test throws — so the
// header command that works everywhere is the bun one.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
// A pane sitting at one of these is free. Anything else is a turn in flight, and typing
// into it would interleave keystrokes with a running program.
const SHELLS = new Set(['bash', 'sh', 'zsh', 'fish', 'dash', 'ksh']);
const DEFAULT_MODEL = 'ollama-cloud/glm-5.3-flash';
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const POLL_MS = 100;

function parseArgs(argv) {
  const out = { cmd: null, as: null, text: null, model: DEFAULT_MODEL, timeout: DEFAULT_TIMEOUT_MS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!out.cmd && (a === 'ask' || a === 'status' || a === 'reset' || a === 'render')) out.cmd = a;
    else if (a === '--as') out.as = argv[++i];
    else if (a === '--text') out.text = argv[++i];
    else if (a === '--model' || a === '-m') out.model = argv[++i];
    else if (a === '--timeout') out.timeout = Number(argv[++i]);
    else if (a === '--new') out.fresh = true;
    else if (a === '--log') out.log = true;
    else if (a === '--auto') out.auto = true;
    else if (a === '--kill') out.kill = true;
  }
  return out;
}

function usage(message) {
  process.stderr.write(`peer-term: ${message}\n` +
    'usage:\n' +
    '  node bin/peer-term.mjs ask --as <lane> --text "..." [--model ID] [--new] [--log] [--auto] [--timeout MS]\n' +
    '  node bin/peer-term.mjs status --as <lane>\n' +
    '  node bin/peer-term.mjs reset --as <lane> [--kill]\n');
  process.exit(2);
}

function fail(message) {
  process.stderr.write(`peer-term: ${message}\n`);
  process.exit(1);
}

// Same walk as msg.mjs and peer.mjs. Kept in step with `msg.mjs where`.
function findBox() {
  if (process.env.MSGBOX) return process.env.MSGBOX;
  let dir = process.cwd();
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return path.join(dir, '.msgbox');
    const up = path.dirname(dir);
    if (up === dir) return path.join(os.homedir(), '.claude', 'msgbox');
    dir = up;
  }
}

/** Single-quote for /bin/sh. Every path and flag this file puts in the script goes through it. */
const shq = (s) => `'${String(s).split("'").join("'\\''")}'`;

// `=name` is tmux's EXACT-match SESSION target: without it a lane called `review` also
// matches `review-2`, so a kill lands in the wrong place. It does NOT work for pane
// targets (`send-keys -t =review` is "can't find pane"), and `-t review:` resolves to
// something whose pane_current_command reads as `tmux`. So panes are addressed by their
// id instead, resolved through an exact string compare on the session name here rather
// than through tmux's own fuzzy target matching.
const tmux = (...args) => execFileSync('tmux', args, { encoding: 'utf8' });
const tmuxTry = (...args) => spawnSync('tmux', args, { encoding: 'utf8' });

/** The active pane of a lane's session: `{ id, cmd }`, or null when the lane is not up. */
function activePane(name) {
  const r = tmuxTry('list-panes', '-a', '-F', '#{session_name}\t#{window_active}#{pane_active}\t#{pane_id}\t#{pane_current_command}');
  if (r.status !== 0) return null;
  for (const line of r.stdout.split('\n')) {
    const [sessionName, active, id, cmd] = line.split('\t');
    if (sessionName === name && active === '11') return { id, cmd };
  }
  return null;
}

const stateFile = (dir, lane) => path.join(dir, `${lane}.json`);
function readState(dir, lane) {
  try { return JSON.parse(fs.readFileSync(stateFile(dir, lane), 'utf8')); } catch { return {}; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Pull the reply and the session id out of an opencode `--format json` stream.
 * Text parts are keyed by part id because a streaming part is re-emitted as it grows:
 * last write wins per id, insertion order preserved across parts.
 */
function parseStream(raw) {
  const parts = new Map();
  let sessionID = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.sessionID) sessionID = ev.sessionID;
    if (ev.type === 'text' && ev.part && typeof ev.part.text === 'string') {
      parts.set(ev.part.id ?? parts.size, ev.part.text);
    }
  }
  return { sessionID, text: [...parts.values()].join('').trim() };
}

/**
 * Hidden subcommand, run INSIDE the pane at the end of the pipe. Turns the event stream
 * into something a human can read while it arrives — the raw NDJSON carries token counts
 * and part ids that bury the one line anybody is watching for. The full stream is still
 * teed to a file upstream, so nothing is lost by prettifying here.
 */
async function render() {
  const shown = new Map();
  let buffer = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line.trim()) continue;
      let ev;
      // An unparseable line is opencode telling us something we did not anticipate.
      // Show it rather than swallow it.
      try { ev = JSON.parse(line); } catch { process.stdout.write(line + '\n'); continue; }
      if (ev.type === 'text' && ev.part && typeof ev.part.text === 'string') {
        const id = ev.part.id ?? '';
        const seen = shown.get(id) ?? 0;
        if (ev.part.text.length > seen) {
          process.stdout.write(ev.part.text.slice(seen));
          shown.set(id, ev.part.text.length);
        }
      } else if (ev.type === 'tool' && ev.part?.tool) {
        process.stdout.write(`\n  [${ev.part.tool}]`);
      } else if (ev.type === 'step_finish') {
        process.stdout.write('\n');
      }
    }
  }
}

async function ask(box, a) {
  const lane = a.as;
  const name = `peer-${lane}`;
  const dir = path.join(box, 'term');
  fs.mkdirSync(dir, { recursive: true });

  let pane = activePane(name);
  if (pane) {
    if (!SHELLS.has(pane.cmd)) {
      fail(`lane ${lane} is busy — ${pane.cmd} is running in ${name}. Watch it: tmux attach -t ${name}`);
    }
  } else {
    const id = tmux('new-session', '-d', '-s', name, '-x', '200', '-y', '50', '-c', process.cwd(),
      '-P', '-F', '#{pane_id}').trim();
    pane = { id, cmd: 'sh' };
  }

  // One directory per turn, wiped first: a stale done-file from the previous turn would
  // make this process report the previous reply as this one's.
  const run = path.join(dir, `${lane}.run`);
  fs.rmSync(run, { recursive: true, force: true });
  fs.mkdirSync(run, { recursive: true });
  const F = {
    prompt: path.join(run, 'prompt'),
    out: path.join(run, 'out.jsonl'),
    err: path.join(run, 'err'),
    rc: path.join(run, 'rc'),
    done: path.join(run, 'done'),
    script: path.join(run, 'turn.sh'),
  };
  fs.writeFileSync(F.prompt, a.text);

  const state = readState(dir, lane);
  const bin = process.env.PEER_TERM_OPENCODE || 'opencode';
  const args = ['run', '--format', 'json'];
  if (!a.fresh && state.sessionID) args.push('--session', state.sessionID);
  if (a.model) args.push('-m', a.model);
  if (a.auto) args.push('--auto');

  // A tmux pane inherits the tmux SERVER's environment, not this process's, so the box
  // and the lane have to travel in the script or the run inside resolves a DIFFERENT box
  // from the one this lane writes to — and a peer message addressed to the lane lands
  // where its inbox plugin is not looking, with nothing reporting an error.
  const env = [`MSGBOX=${shq(box)}`, `MSGBOX_AS=${shq(lane)}`];

  // The prompt is the LAST argument and arrives via command substitution, never as part
  // of the command text. `rc` is written inside the group so it captures opencode's
  // status and not tee's; `done` is written after the whole pipeline drains, so seeing it
  // means the output file is complete.
  fs.writeFileSync(F.script, [
    '#!/bin/sh',
    `printf '\\n>>> claude -> %s  [%s]\\n' ${shq(lane)} ${shq(a.model)}`,
    `cat ${shq(F.prompt)}`,
    `printf '\\n<<< %s -> claude\\n' ${shq(lane)}`,
    `{ ${env.join(' ')} ${shq(bin)} ${args.map(shq).join(' ')} "$(cat ${shq(F.prompt)})"; printf '%s' "$?" > ${shq(F.rc)}; } ` +
      `2> ${shq(F.err)} | tee ${shq(F.out)} | ${shq(process.execPath)} ${shq(SELF)} render`,
    `printf ok > ${shq(F.done)}`,
  ].join('\n') + '\n', { mode: 0o755 });

  // -l sends the string literally, so tmux cannot read any of it as a key name; Enter
  // goes as its own non-literal call.
  tmux('send-keys', '-t', pane.id, '-l', '--', `sh ${shq(F.script)}`);
  tmux('send-keys', '-t', pane.id, 'Enter');

  const deadline = Date.now() + a.timeout;
  while (!fs.existsSync(F.done)) {
    if (Date.now() > deadline) {
      fail(`lane ${lane} timed out after ${a.timeout}ms. The turn may still be running — watch it: tmux attach -t ${name}`);
    }
    await sleep(POLL_MS);
  }

  // The whole point of this lane is that a human can watch it, which means a human can
  // also Ctrl-C it. That kills the group before it records an exit code, while the outer
  // shell carries on to the done-file — so a missing rc is not corruption, it is an
  // interrupted turn, and it has to say so rather than throw ENOENT at the caller.
  if (!fs.existsSync(F.rc)) {
    fail(`the turn in ${name} was interrupted before it finished. Nothing was recorded; ask again.`);
  }
  const rc = Number(fs.readFileSync(F.rc, 'utf8').trim() || '0');
  const { sessionID, text } = parseStream(fs.readFileSync(F.out, 'utf8'));
  if (rc !== 0) {
    const err = fs.readFileSync(F.err, 'utf8').trim();
    fail(`opencode exited ${rc} in ${name}${err ? `\n${err}` : ''}`);
  }

  if (sessionID) {
    fs.writeFileSync(stateFile(dir, lane),
      JSON.stringify({ lane, pane: name, sessionID, model: a.model, updatedAt: new Date().toISOString() }, null, 2) + '\n');
  }

  // log.jsonl is the COMMITTED message thread, so it is only ever written on request —
  // a terminal lane used for scratch questions must not push noise to the other machine.
  if (a.log) {
    const logFile = path.join(box, 'log.jsonl');
    const append = (o) => fs.appendFileSync(logFile, JSON.stringify({ ts: new Date().toISOString(), ...o }) + '\n');
    append({ from: 'claude', to: lane, text: a.text });
    append({ from: lane, to: 'claude', text });
  }

  process.stdout.write(text + '\n');
}

function status(box, a) {
  const lane = a.as;
  const name = `peer-${lane}`;
  const state = readState(path.join(box, 'term'), lane);
  const pane = activePane(name);
  const health = pane === null ? 'not started' : SHELLS.has(pane.cmd) ? 'idle' : `busy (${pane.cmd})`;
  process.stdout.write(
    `lane     ${lane}\n` +
    `pane     ${name} — ${health}\n` +
    `session  ${state.sessionID ?? 'none (next ask starts fresh)'}\n` +
    `model    ${state.model ?? a.model}\n` +
    `watch    tmux attach -t ${name}\n`);
}

function reset(box, a) {
  const lane = a.as;
  const dir = path.join(box, 'term');
  fs.rmSync(stateFile(dir, lane), { force: true });
  fs.rmSync(path.join(dir, `${lane}.run`), { recursive: true, force: true });
  // `=` is the exact-match session target: without it, killing `review` also matches a
  // lane called `review-2` and takes down the wrong pane.
  if (a.kill) tmuxTry('kill-session', '-t', `=peer-${lane}`);
  process.stdout.write(`reset ${lane}${a.kill ? ' (pane killed)' : ''}\n`);
}

const a = parseArgs(process.argv.slice(2));
if (a.cmd === 'render') {
  await render();
} else {
  if (!a.cmd) usage('command required: ask, status, or reset');
  if (!a.as) usage(`${a.cmd} requires --as <lane>`);
  // The lane names a file and a tmux session, so anything outside this set could escape
  // the term directory or address a pane it was never given.
  if (!/^[\w.-]+$/.test(a.as)) usage(`lane must match [A-Za-z0-9_.-]+, got ${a.as}`);
  if (!Number.isFinite(a.timeout) || a.timeout <= 0) usage('--timeout must be a positive number of milliseconds');

  const box = findBox();
  if (a.cmd === 'ask') {
    if (!a.text) usage('ask requires --text');
    await ask(box, a);
  } else if (a.cmd === 'status') status(box, a);
  else reset(box, a);
}
