#!/usr/bin/env node
// handoff.mjs — launch an opencode run from a spec file, reliably.
//
// Five distinct ways the hand-rolled launch failed on 2026-08-10, every one exiting 0:
//
//   1. `opencode run "Check your inbox."`      model did not act on AGENTS.md; answered
//                                             "I'm not an email client" and stopped
//   2. double-quoted prompt with \"…\" and     shell mangled it into a different command;
//      <angle brackets>                       the run listed a directory
//   3. short `--re` reply as the whole order   read, echoed, exited without doing the work
//   4. a claim on the target directory         every Write rejected; run stopped, correctly
//   5. a RELATIVE path in the prompt           cwd was not the repo root, file not found,
//                                             model INVENTED a path and burned 35 minutes
//
// Each is pre-empted below. The important one is the last check: an exit code of 0 proves
// nothing here, so this refuses to call a run successful unless a reply actually arrived.
//
//   node handoff.mjs --spec <path> [--model <id>] [--note "extra line"] [--detach]
//
// (8) A run launched from a parent that dies takes the run down with it. Measured 2026-09-16:
// a 40-min build dispatched from a Claude Code Bash tool died mid-stream at step 9 when the
// tool call's process tree was reaped — the session's last message had zero tokens, an empty
// reasoning part and no finish/error, which reads exactly like "the model produced nothing".
// --detach spawns opencode in its own process group with stdio ignored, so the run survives a
// dead parent. The reply still arrives in the message log; success is no longer checked here
// (the parent is gone), so the caller reads the log for the tag this prints.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  STATUS,
  defaultRegistryDir,
  peerIdForBoxLane,
  registryPath,
  setStatus,
  withRegistry,
} from './peer/registry.mjs';

// msg.mjs is this file's own sibling. Deriving the path from import.meta.url instead
// of a home directory is what makes it correct on BOTH boxes: ~/.claude/bin is a symlink
// into this shared repo, so a hardcoded C:/Users/<name> is always one machine's name and
// therefore wrong on the other. It was 'shuff57' while running as 'shuff', which made
// execSync at the claims check throw MODULE_NOT_FOUND and killed every dispatch.
const MSG = fileURLToPath(new URL('./msg.mjs', import.meta.url)).split(String.fromCharCode(92)).join('/');
// Budget contract default (operator, 2026-08-26). glm-5.3-flash measured reasoning:0 on a
// trivial packet, where the deepseek -0731 snapshot emitted 2-5x the tokens for the same
// answer. It also has vision, so the same id serves the eyes-and-eyes lenses.
const DEFAULT_MODEL = 'ollama-cloud/glm-5.3-flash';

// Box resolution, shared by telemetry and the peer heartbeat. Same walk as inbox.js and
// msg.mjs (MSGBOX env -> nearest .git -> ~/.claude/msgbox), kept in one place so the events
// lane and the peer registry can never point at different boxes.
const resolveBox = () => {
  if (process.env.MSGBOX) return process.env.MSGBOX;
  let dir = process.cwd();
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return path.join(dir, '.msgbox');
    const up = path.dirname(dir);
    if (up === dir) return path.join(os.homedir(), '.claude', 'msgbox');
    dir = up;
  }
};

// Telemetry events go to <box>/events.jsonl beside log.jsonl, consumed by msgbox-ui. An
// emitter that throws is a dead dispatch: telemetry must never break the launch, hence the
// total try/catch.
const emit = (event) => {
  try {
    const boxdir = resolveBox();
    fs.mkdirSync(boxdir, { recursive: true });
    fs.appendFileSync(path.join(boxdir, 'events.jsonl'), JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n');
  } catch {
    // Never let telemetry kill a dispatch. A missed event is a blank lane; a thrown emitter is a dead run.
  }
};

// Peer-registry heartbeat. The registry is device-local and only exists on boxes that opted
// into the bridge, so this is a no-op unless registry.json is already there: it never creates
// the registry or its directory, and never registers a peer. It only flips the status of an
// EXISTING managed opencode-lane entry, so a handoff can never invent registry state. Every
// write is best-effort — a registry that throws must not affect the launch, the reply count or
// the exit code.
const OPENCODE_LANE = 'opencode';
const heartbeat = (status) => {
  try {
    const file = registryPath(defaultRegistryDir(resolveBox()));
    if (!fs.existsSync(file)) return;
    // Under the registry's lock, and returning null when nothing changed so a dispatch
    // never rewrites a file it had no update for. A bare load+setStatus+save here raced
    // every sidecar heartbeat and could resurrect an entry the sidecar had just removed.
    withRegistry(file, (reg) => {
      const out = setStatus(reg, peerIdForBoxLane(OPENCODE_LANE, resolveBox()), status);
      return out.changed ? out : null;
    });
  } catch {
    // Fail open: a missing, foreign or unwritable registry is not a dispatch failure.
  }
};

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

const specArg = get('--spec');
const model = get('--model') || DEFAULT_MODEL;
const note = get('--note') || '';
// Reasoning effort, passed straight through as opencode's `--variant`. AGENTS.md
// documents the flag on the agent route (`opencode run --agent X -m Y --variant Z`)
// and this wrapper had no way to reach it, which left "dispatch at max effort" as
// a reason to hand-roll the launch -- the one thing this file exists to prevent.
const variant = get('--variant');

if (!specArg) {
  console.error('usage: node handoff.mjs --spec <path> [--model <id>] [--variant <effort>] [--note "..."]');
  process.exit(2);
}

// (5) absolutize and PROVE the spec exists before spending a session on it.
const spec = path.resolve(specArg).replace(/\\/g, '/');
if (!fs.existsSync(spec)) {
  console.error(`FAILED before launch: spec not found at ${spec}`);
  console.error('Nothing was dispatched. A run given a bad path invents one instead of stopping.');
  process.exit(2);
}

// (4) a claim on the files the run must write blocks every Write. Surface it now, not 40
// minutes in. Claims are right for a browser push and wrong for authoring.
// A browser push WANTS a claim on the sources its read-back compares against, so --allow-claims
// opts out of the refusal. It still prints them: a claim that blocks the run's real output is the
// failure this guard exists for, and only the dispatcher knows which case this is.
const allowClaims = args.includes('--allow-claims');
const owners = execSync(`node "${MSG}" owners`, { encoding: 'utf8' }).trim();
const heldClaims = owners && !/nothing claimed/i.test(owners);
if (heldClaims && !allowClaims) {
  console.error('FAILED before launch: file claims are held.\n' + owners);
  console.error('\nRelease them first (msg.mjs release --as claude --all) if this run must write.');
  console.error('Or pass --allow-claims if the claim is deliberate (a browser push guarding its gate).');
  process.exit(2);
}

// (6) The message log grows without bound — 119KB / ~30k tokens by 2026-08-10 — and a run told to
// reply with `--re last` reads the whole thing to resolve "last", burning its context before it
// writes a line. So a task that needs no coordination should not touch the box at all: pass
// --expect and success is measured by the files appearing, not by a reply.
const expect = (get('--expect') || '').split(',').map((s) => s.trim()).filter(Boolean);
const noBox = expect.length > 0;

// (7) A COUNT of replies cannot tell whose reply it is. The box is shared, so two dispatches
// running at once (a kernel build and a UI fix, say) both see each other's replies and both
// report success. Measured 2026-09-15: two brep-rs round dispatches died at their output-token
// limit having made zero edits and never replying, and handoff printed "OK — reply received"
// both times -- it had counted a concurrent run's reply. Exit 0 then means nothing, which is the
// exact failure this wrapper exists to catch.
//
// So each dispatch carries a unique tag the run is told to echo in its reply, and success needs
// THAT tag in the log. An untagged new reply is reported separately rather than counted: it is
// either a concurrent dispatch's, or this run ignoring the instruction, and the lead has to read
// the thread either way. Alphanumeric + hyphen so the prompt sanitiser below leaves it intact.
const tag = `HO-${Date.now().toString(36)}-${process.pid.toString(36)}`;
const readLog = () => {
  try { return execSync(`node "${MSG}" log --n 400`, { encoding: 'utf8' }); } catch { return ''; }
};
const countReplies = (log = readLog()) => (log.match(/opencode -> claude/g) || []).length;
const before = countReplies();

// (1)(3) the task goes IN the prompt. No inbox indirection, no short continuation that reads
// as an acknowledgement. (2) single-quoted, no nested quotes, no angle brackets.
const reportLine = noBox
  ? 'DO NOT touch the message center: do not read or write .msgbox, do not run msg.mjs. That log is large and reading it will consume your context before you produce anything. Print your report to stdout instead.'
  : `When finished, report by running: node ${MSG} send --from opencode --to claude --re last --text with your findings. Begin that reply with the tag ${tag} so the dispatcher can tell it apart from a concurrent run's reply.`;

const prompt = [
  `Read this file: ${spec} — that exact absolute path, it exists. Carry it out in full.`,
  note,
  'If any path given to you does not exist, STOP and say so rather than guessing a different one.',
  reportLine,
  'State plainly which parts you did NOT finish. An honest short list beats rushed work.',
]
  .filter(Boolean)
  .join(' ')
  // One line, no double quotes, no angle brackets. `opencode` is a .ps1/.cmd shim on Windows, so
  // this has to go through a shell (below) — and a shell is exactly what rewrote a prompt into a
  // different command on 2026-08-10. Keeping the string free of the characters that get reinterpreted
  // is what makes shell:true safe; the DETAIL lives in the spec file, not in the prompt.
  .replace(/["<>]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

console.log(`spec   ${spec}\nmodel  ${model}\nclaims ${heldClaims ? owners.replace(/\n/g, '; ') + '  (allowed)' : 'none held'}\n`);

// shell:true is REQUIRED on Windows — `opencode` is a .ps1/.cmd shim and Node will not execute one
// with shell:false. It returns status null and never launches, which reads exactly like a run that
// did nothing. Measured 2026-08-10: the wrapper's own first live dispatch failed this way.
// shell:true joins argv into ONE command line WITHOUT quoting, so an unquoted prompt splits on
// spaces and any `--word` inside it is parsed as an opencode flag — yargs prints usage and exits 1,
// having launched nothing. Measured 2026-08-16: the default reportLine contains `--from --to --re
// --text` and hit exactly this. Double quotes are safe here because the prompt had `"` `<` `>`
// stripped above; strip the remaining cmd.exe metacharacters too.
const shellSafePrompt = `"${prompt.replace(/[&|^%]/g, ' ').replace(/\s+/g, ' ').trim()}"`;
// (9) Non-interactive environment. An agent driving git can hit an editor/pager prompt that
// no one can answer, and the run hangs until timeout. Ported from omo-dev non-interactive-env:
// set the kill-switches on the SPAWN ENV rather than prefixing the command, because the
// prefix approach needs per-shell syntax (pwsh vs cmd) and this box has both.
// Never touch anything the caller set explicitly.
const AGENT_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
  GIT_EDITOR: ':',
  EDITOR: ':',
  GIT_SEQUENCE_EDITOR: ':',
  GIT_MERGE_AUTOEDIT: 'no',
  GIT_PAGER: 'cat',
  PAGER: 'cat',
  npm_config_yes: 'true',
  PIP_NO_INPUT: '1',
  DEBIAN_FRONTEND: 'noninteractive',
};
const env = { ...process.env };
for (const [k, v] of Object.entries(AGENT_ENV)) if (env[k] === undefined) env[k] = v;

emit({ kind: 'spawn', from: 'claude-handoff', model, spec, noBox, variant: variant || null });

// --detach: survive a dead parent. `spawn` with detached+stdio ignore releases the run from
// this process group, so a reaped Bash tool call no longer kills it mid-stream.
if (args.includes('--detach')) {
  // Busy before launch, and deliberately no idle after: the parent exits immediately, so an
  // idle write here would race the detached run and lie about it. The run's own sidecar (or
  // the stale window) owns the transition back.
  heartbeat(STATUS.BUSY);
  const child = spawn('opencode', ['run', shellSafePrompt, '--auto', '-m', model, ...(variant ? ['--variant', variant] : [])], {
    shell: true,
    detached: true,
    stdio: 'ignore',
    env,
  });
  child.unref();
  console.log(`\nDETACHED — pid ${child.pid}. The parent can exit; the run continues.`);
  console.log(`Watch for its tagged reply (${tag}) in the message log:`);
  console.log(`  node ${MSG} log --n 20`);
  process.exit(0);
}

heartbeat(STATUS.BUSY);
const run = spawnSync('opencode', ['run', shellSafePrompt, '--auto', '-m', model, ...(variant ? ['--variant', variant] : [])], {
  stdio: 'inherit',
  shell: true,
  env,
});

// One outcome, computed once, then emit + exit — the spec's shape for not duplicating exit logic.
// ok means "the run did its job" (files appeared or a reply arrived), not merely "exit 0": the
// reply-count check exists precisely because a clean exit here proves nothing.
let outcome;
if (run.status === null) {
  outcome = { code: 2, ok: false };
} else if (noBox) {
  const missing = expect.filter((f) => !fs.existsSync(path.resolve(f)));
  outcome = { code: missing.length ? 1 : 0, ok: !missing.length };
} else {
  // Read the log ONCE and answer two different questions from it: did THIS dispatch reply
  // (its tag is present), and did anything else reply meanwhile (the count moved). The second
  // is not success -- it is the concurrent-dispatch case that made the old check lie.
  const log = readLog();
  const tagged = log.includes(tag);
  outcome = { code: tagged ? 0 : 1, ok: tagged, untagged: countReplies(log) - before };
}
// The synchronous run is over, so the lane is idle again regardless of outcome. Best-effort:
// a registry write must never change the exit code computed above.
heartbeat(STATUS.IDLE);
emit({ kind: 'exit', from: 'claude-handoff', code: outcome.code, ok: outcome.ok });

if (run.status === null) {
  console.error(`\nFAILED to launch opencode (status null, ${run.error ? run.error.message : 'no error given'}).`);
  console.error('The process never started, so nothing was attempted.');
  process.exit(2);
}

// The check that matters: exit 0 is not evidence. Either the expected files exist, or a reply came.
// outcome.code/ok were already computed and emitted above — this block only prints, so the
// messages and exit codes stay byte-identical with the pre-telemetry behavior.
if (noBox) {
  const missing = expect.filter((f) => !fs.existsSync(path.resolve(f)));
  if (!missing.length) {
    console.log(`\nOK — all ${expect.length} expected file(s) present.`);
    process.exit(0);
  }
  console.error(`\nFAILED — the run exited (code ${run.status}) but ${missing.length} of ${expect.length} expected file(s) are missing:`);
  for (const m of missing) console.error(`  ${m}`);
  process.exit(1);
}

if (outcome.ok) {
  console.log(`\nOK — tagged reply received (${tag}). Read it with: node ${MSG} read --as claude`);
  process.exit(0);
}

// A reply arrived, but not this dispatch's. Reported as its own outcome rather than folded into
// either success or silence: the lead needs to know the box moved for some OTHER reason.
if (outcome.untagged > 0) {
  console.error(`\nFAILED — ${outcome.untagged} new reply(ies) in the box, none carrying this dispatch's tag (${tag}).`);
  console.error('Either a CONCURRENT dispatch replied into the same box, or this run ignored the tag instruction.');
  console.error(`Read the thread before re-dispatching: node ${MSG} read --as claude`);
  process.exit(1);
}

console.error(`\nFAILED — the run exited (code ${run.status}) with NO reply in the message log.`);
console.error('That is the silent-failure shape: task notification fires, exit code is clean, no work done.');
console.error('Check the run output for an invented path, a refusal, or a blocked write before re-dispatching.');
process.exit(1);
