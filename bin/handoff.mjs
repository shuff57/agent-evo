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
//   node handoff.mjs --spec <path> [--model <id>] [--note "extra line"]

import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

const MSG = 'C:/Users/shuff/.claude/bin/msg.mjs';
const DEFAULT_MODEL = 'ollama-cloud/deepseek-v4-flash:0731';

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

const specArg = get('--spec');
const model = get('--model') || DEFAULT_MODEL;
const note = get('--note') || '';

if (!specArg) {
  console.error('usage: node handoff.mjs --spec <path> [--model <id>] [--note "..."]');
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
const owners = execSync(`node "${MSG}" owners`, { encoding: 'utf8' }).trim();
if (owners && !/nothing claimed/i.test(owners)) {
  console.error('FAILED before launch: file claims are held.\n' + owners);
  console.error('\nRelease them first (msg.mjs release --as claude --all) if this run must write.');
  process.exit(2);
}

const countReplies = () => {
  try {
    const log = execSync(`node "${MSG}" log --n 400`, { encoding: 'utf8' });
    return (log.match(/opencode -> claude/g) || []).length;
  } catch { return 0; }
};
const before = countReplies();

// (1)(3) the task goes IN the prompt. No inbox indirection, no short continuation that reads
// as an acknowledgement. (2) single-quoted, no nested quotes, no angle brackets.
const prompt = [
  `Read this file: ${spec} — that exact absolute path, it exists. Carry it out in full.`,
  note,
  'If any path given to you does not exist, STOP and say so rather than guessing a different one.',
  `When finished, report by running: node ${MSG} send --from opencode --to claude --re last --text with your findings.`,
  'State plainly which parts you did NOT finish. An honest short list beats rushed work.',
].filter(Boolean).join('\n\n');

console.log(`spec   ${spec}\nmodel  ${model}\nclaims none held\n`);

const run = spawnSync('opencode', ['run', prompt, '--auto', '-m', model], {
  stdio: 'inherit',
  shell: false,
});

// The check that matters: exit 0 is not evidence. A reply is.
const after = countReplies();
if (after > before) {
  console.log(`\nOK — reply received (${after - before} new). Read it with: node ${MSG} read --as claude`);
  process.exit(0);
}

console.error(`\nFAILED — the run exited (code ${run.status}) with NO reply in the message log.`);
console.error('That is the silent-failure shape: task notification fires, exit code is clean, no work done.');
console.error('Check the run output for an invented path, a refusal, or a blocked write before re-dispatching.');
process.exit(1);
