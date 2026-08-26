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
import { fileURLToPath } from 'node:url';

// msg.mjs is this file's own sibling. Deriving the path from import.meta.url instead
// of a home directory is what makes it correct on BOTH boxes: ~/.claude/bin is a symlink
// into this shared repo, so a hardcoded C:/Users/<name> is always one machine's name and
// therefore wrong on the other. It was 'shuff57' while running as 'shuff', which made
// execSync at the claims check throw MODULE_NOT_FOUND and killed every dispatch.
const MSG = fileURLToPath(new URL('./msg.mjs', import.meta.url)).split(String.fromCharCode(92)).join('/');
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

const countReplies = () => {
  try {
    const log = execSync(`node "${MSG}" log --n 400`, { encoding: 'utf8' });
    return (log.match(/opencode -> claude/g) || []).length;
  } catch { return 0; }
};
const before = countReplies();

// (1)(3) the task goes IN the prompt. No inbox indirection, no short continuation that reads
// as an acknowledgement. (2) single-quoted, no nested quotes, no angle brackets.
const reportLine = noBox
  ? 'DO NOT touch the message center: do not read or write .msgbox, do not run msg.mjs. That log is large and reading it will consume your context before you produce anything. Print your report to stdout instead.'
  : `When finished, report by running: node ${MSG} send --from opencode --to claude --re last --text with your findings.`;

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
const run = spawnSync('opencode', ['run', shellSafePrompt, '--auto', '-m', model], {
  stdio: 'inherit',
  shell: true,
});

if (run.status === null) {
  console.error(`\nFAILED to launch opencode (status null, ${run.error ? run.error.message : 'no error given'}).`);
  console.error('The process never started, so nothing was attempted.');
  process.exit(2);
}

// The check that matters: exit 0 is not evidence. Either the expected files exist, or a reply came.
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

const after = countReplies();
if (after > before) {
  console.log(`\nOK — reply received (${after - before} new). Read it with: node ${MSG} read --as claude`);
  process.exit(0);
}

console.error(`\nFAILED — the run exited (code ${run.status}) with NO reply in the message log.`);
console.error('That is the silent-failure shape: task notification fires, exit code is clean, no work done.');
console.error('Check the run output for an invented path, a refusal, or a blocked write before re-dispatching.');
process.exit(1);
