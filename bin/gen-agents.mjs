#!/usr/bin/env node
// gen-agents.mjs - roster/ is the single source of truth for agent definitions.
//
// Reads roster/*.md and generates BOTH consumers:
//
//   roster/<name>.md  (full body, spawn-primary/spawn-secondary declared)
//        |
//        +-- ~/.claude/agents/<name>.md
//        |      claude-lane -> full copy, verbatim
//        |      ollama-lane -> thin forwarder stub (model: haiku) that shells
//        |                     out to `opencode run --agent <name>`
//        |
//        +-- ~/.config/opencode/agents/<name>.md
//               ollama-lane only -> full body + the ollama-cloud model
//
// Never writes to roster/. Re-runnable. Run after any roster edit.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync,
         lstatSync, unlinkSync, rmdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir().replace(/\\/g, '/');
const ROSTER = 'C:/Users/shuff57/Documents/GitHub/agent-evo/roster';
const CLAUDE_AGENTS = `${HOME}/.claude/agents`;
const OPENCODE_AGENTS = `${HOME}/.config/opencode/agents`;
const DRY = process.argv.includes('--dry-run');

// ---------------------------------------------------------------- parse

function parse(file) {
  const raw = readFileSync(join(ROSTER, file), 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  if (lines[0].trim() !== '---') return null;
  const close = lines.indexOf('---', 1);
  if (close === -1) return null;
  const fm = lines.slice(0, close);
  const get = (k) => {
    const l = fm.find(x => x.startsWith(k + ':'));
    return l ? l.slice(k.length + 1).trim() : '';
  };
  return {
    file, eol,
    fm: fm.slice(1),                      // frontmatter lines only, no opening ---
    name: get('name'),
    model: get('model'),
    effort: get('effort'),
    primary: get('spawn-primary'),
    secondary: get('spawn-secondary'),
    body: lines.slice(close + 1).join(eol).replace(/^\s*\n/, ''),
    raw,
  };
}

// Frontmatter values can span lines (`description: >` folded scalars), and roster
// files carry keys this generator does not know about (tools, tier, pinned).
// Reconstructing the block loses both - so chunk it and edit in place instead.
// Bug found 2026-09-09: a rebuilt block gave global-evolver the description ">"
// and dropped its `tools:` restriction, removing it from routing entirely.
function chunk(fm) {
  const out = [];
  for (const line of fm) {
    if (/^[A-Za-z_][A-Za-z0-9_-]*:/.test(line)) out.push([line.split(':')[0], [line]]);
    else if (out.length) out[out.length - 1][1].push(line);   // continuation
    else out.push(['', [line]]);
  }
  return out;
}

const setKey = (blocks, key, val) => blocks.map(([k, ls]) =>
  k === key ? [k, [`${k}: ${val}`]] : [k, ls]);

const dropKeys = (blocks, keys) => blocks.filter(([k]) => !keys.includes(k));

const hasKey = (blocks, key) => blocks.some(([k]) => k === key);

const render = (blocks) => blocks.flatMap(([, ls]) => ls);

// "opencode/ollama-cloud/deepseek-v4-flash:0731@low" -> {cli, model, variant}
function splitSpawn(spec) {
  const [route, variant] = spec.split('@');
  const slash = route.indexOf('/');
  return { cli: route.slice(0, slash), model: route.slice(slash + 1), variant: variant || '' };
}

// ---------------------------------------------------------------- emit

function forwarderStub(a, spawn) {
  const variantFlag = spawn.variant ? ` --variant ${spawn.variant}` : '';
  const cmd = `opencode run "<task>" --agent ${a.name} -m ${spawn.model}${variantFlag} --auto --dir "$(pwd)"`;
  // Carry the roster frontmatter verbatim; override only what must change.
  // The wrapper runs on haiku regardless of what the agent itself needs.
  let blocks = chunk(a.fm);
  blocks = setKey(blocks, 'model', 'haiku');
  blocks = setKey(blocks, 'effort', 'low');
  // A forwarder gets Bash and nothing else, whatever the roster says. The roster
  // `tools:` describes the REAL agent, which runs on opencode; handing those tools
  // to the wrapper lets it do the work itself instead of routing. Measured
  // 2026-08-09: with full tool access the wrapper read the task, wrote both files
  // in 24s, never invoked opencode, and reported success. Prose telling it not to
  // did not hold; removing the tools did.
  blocks = hasKey(blocks, 'tools') ? setKey(blocks, 'tools', '[Bash]')
                                   : [...blocks, ['tools', ['tools: [Bash]']]];
  return [
    '---',
    ...render(blocks),
    '---',
    '',
    `You are a thin forwarding wrapper, not an engineer. Your only job is to hand`,
    `the task to \`${a.name}\` running on opencode and return its stdout verbatim.`,
    '',
    '## Rules',
    '',
    '- Make exactly ONE Bash call, of this shape:',
    '',
    '  ```',
    `  ${cmd}`,
    '  ```',
    '',
    '  where `<task>` is the task you were given. If the task text contains double',
    '  quotes, first write it to a file and pass the prompt `Read <absolute path>',
    '  (if it does not exist, STOP and say so rather than guessing) and execute the',
    '  task it contains.` instead.',
    '',
    '- Do NOT inspect the repository, edit files, poll, or do follow-up work of your',
    '  own. You are a forwarder, not an orchestrator.',
    '- Return the run\'s stdout EXACTLY as received. Do not summarize, do not fix, do',
    '  not omit.',
    '- If the Bash call fails, say plainly that it failed and report the exit code.',
    `  Do NOT retry and do NOT do the work yourself. The declared fallback is`,
    `  \`${a.secondary}\` - name it and stop, so the caller can escalate.`,
    '- Exit code 0 is not evidence the work happened. If stdout is empty, report that',
    '  the run produced nothing rather than reporting success.',
    '',
    '<!-- GENERATED by bin/gen-agents.mjs from roster/' + a.file + ' - do not edit -->',
    '',
  ].join(a.eol);
}

function opencodeDef(a, spawn) {
  // Keep the (possibly multi-line) description verbatim; drop Claude-only keys.
  // `tools:` is NOT carried: opencode's tools field is an object, not the Claude
  // comma-string, so passing it through would be a parse error. Tool limits on
  // the opencode side are expressed with `permission:` and are not translated -
  // see the tools-restriction warning printed at the end of a run.
  let blocks = chunk(a.fm);
  blocks = dropKeys(blocks, ['name', 'effort', 'spawn-primary', 'spawn-secondary',
                             'tools', 'tier', 'pinned', 'mode', 'model']);
  return [
    '---',
    ...render(blocks),
    'mode: primary',   // NOT subagent: --agent silently falls back to default
    `model: ${spawn.model}`,
    '---',
    '',
    a.body,
    '',
    '<!-- GENERATED by bin/gen-agents.mjs from roster/' + a.file + ' - do not edit -->',
    '',
  ].join(a.eol);
}

// ---------------------------------------------------------------- guard

// ~/.claude/agents is historically a SYMLINK to roster/. Replacing it must remove
// only the link - never recurse into the source. Abort loudly if roster shrinks.
function unlinkIfSymlink(path) {
  if (!existsSync(path)) return 'absent';
  const st = lstatSync(path);
  if (!st.isSymbolicLink()) return 'real-dir';
  const before = readdirSync(ROSTER).length;
  try { unlinkSync(path); } catch { rmdirSync(path); }
  const after = readdirSync(ROSTER).length;
  if (after !== before)
    throw new Error(`ABORT: roster went ${before} -> ${after} files while removing the symlink`);
  return 'symlink-removed';
}

// ---------------------------------------------------------------- run

const agents = readdirSync(ROSTER)
  .filter(f => f.endsWith('.md') && f !== 'README.md')
  .map(parse).filter(Boolean);

const claudeLane = agents.filter(a => a.primary.startsWith('claude/'));
const ollamaLane = agents.filter(a => !a.primary.startsWith('claude/'));

console.log(DRY ? '=== DRY RUN (nothing written) ===\n' : '=== GENERATING ===\n');
console.log(`  roster:        ${agents.length} agents`);
console.log(`  claude-lane:   ${claudeLane.length} (full copy)`);
console.log(`  ollama-lane:   ${ollamaLane.length} (forwarder + opencode def)\n`);

if (!DRY) {
  const state = unlinkIfSymlink(CLAUDE_AGENTS);
  console.log(`  ~/.claude/agents: ${state}`);
  mkdirSync(CLAUDE_AGENTS, { recursive: true });
  mkdirSync(OPENCODE_AGENTS, { recursive: true });
}

let wroteClaude = 0, wroteOpencode = 0;
for (const a of agents) {
  const cPath = join(CLAUDE_AGENTS, a.file);
  if (a.primary.startsWith('claude/')) {
    if (!DRY) writeFileSync(cPath, a.raw, 'utf8');       // verbatim, untouched
    wroteClaude++;
  } else {
    const spawn = splitSpawn(a.primary);
    if (spawn.cli !== 'opencode')
      throw new Error(`${a.name}: spawn-primary cli is '${spawn.cli}', expected 'opencode'`);
    if (!DRY) {
      writeFileSync(cPath, forwarderStub(a, spawn), 'utf8');
      writeFileSync(join(OPENCODE_AGENTS, a.file), opencodeDef(a, spawn), 'utf8');
    }
    wroteClaude++; wroteOpencode++;
    console.log(`  ${a.name.padEnd(22)} -> opencode run --agent ${a.name} -m ${spawn.model}` +
                (spawn.variant ? ` --variant ${spawn.variant}` : ''));
  }
}

// The old ~/.claude/agents was a SYMLINK to roster/, so everything in roster -
// not just agent .md files - was visible at that path. teams.yaml and
// agent-chain.yaml are load-bearing there. Mirror every non-agent entry
// verbatim, or replacing the symlink silently deletes them from that path.
const carried = readdirSync(ROSTER, { withFileTypes: true })
  .filter(e => !(e.isFile() && e.name.endsWith('.md')));
for (const e of carried) {
  if (!DRY) cpSync(join(ROSTER, e.name), join(CLAUDE_AGENTS, e.name),
                   { recursive: true, force: true });
  console.log(`  carried over: ${e.name}${e.isDirectory() ? '/' : ''}`);
}

// Self-check: a forwarder must keep every frontmatter key its roster file had.
// Losing one is invisible until the agent stops being routable (global-evolver,
// 2026-09-09: a dropped multi-line `description` removed it from the roster).
let keyLoss = 0;
for (const a of ollamaLane) {
  const want = chunk(a.fm).map(([k]) => k).filter(Boolean).sort();
  const gotRaw = DRY ? forwarderStub(a, splitSpawn(a.primary))
                     : readFileSync(join(CLAUDE_AGENTS, a.file), 'utf8');
  const gl = gotRaw.split(/\r?\n/);
  const got = chunk(gl.slice(1, gl.indexOf('---', 1))).map(([k]) => k).filter(Boolean).sort();
  const missing = want.filter(k => !got.includes(k));
  if (missing.length) { console.log(`  KEY LOSS  ${a.name}: dropped ${missing.join(', ')}`); keyLoss++; }
}
console.log(`\n  frontmatter self-check: ${ollamaLane.length - keyLoss}/${ollamaLane.length} forwarders kept every roster key`);

// Stale: generated files whose roster source is gone (a retired agent). Without
// this, retiring an agent leaves it live in both consumers forever - the roster
// stops being the source of truth the moment a deletion doesn't propagate.
// Reported by default; removed only with --prune, because ~/.claude/agents may
// also hold agents a user added by hand.
const PRUNE = process.argv.includes('--prune');
const rosterFiles = new Set(agents.map(a => a.file));
const ollamaFiles = new Set(ollamaLane.map(a => a.file));
const MARK = 'GENERATED by bin/gen-agents.mjs';

const stale = [];
if (existsSync(CLAUDE_AGENTS))
  for (const f of readdirSync(CLAUDE_AGENTS).filter(x => x.endsWith('.md')))
    if (!rosterFiles.has(f)) stale.push([join(CLAUDE_AGENTS, f), `~/.claude/agents/${f}`]);
if (existsSync(OPENCODE_AGENTS))
  for (const f of readdirSync(OPENCODE_AGENTS).filter(x => x.endsWith('.md'))) {
    if (ollamaFiles.has(f)) continue;
    const p = join(OPENCODE_AGENTS, f);
    // Only ours. A hand-maintained file here is an ORPHAN, reported below, never deleted.
    if (readFileSync(p, 'utf8').includes(MARK)) stale.push([p, `opencode/agents/${f}`]);
  }
for (const [p, label] of stale) {
  if (PRUNE && !DRY) { unlinkSync(p); console.log(`  PRUNED    ${label}`); }
  else console.log(`  STALE     ${label} - roster source gone; re-run with --prune to remove`);
}

// Orphans: files in the opencode agents dir that this generator does not own.
// They are hand-maintained and WILL drift from roster/ - report, never delete.
const owned = new Set(ollamaLane.map(a => a.file));
const orphans = existsSync(OPENCODE_AGENTS)
  ? readdirSync(OPENCODE_AGENTS).filter(f => f.endsWith('.md') && !owned.has(f))
  : [];
for (const o of orphans)
  console.log(`  ORPHAN    ~/.config/opencode/agents/${o} - not generated from roster; may be stale`);

const restricted = ollamaLane.filter(a => hasKey(chunk(a.fm), 'tools')).map(a => a.name);
if (restricted.length)
  console.log(`  NOTE: tools: restriction not translated to opencode for: ${restricted.join(', ')}`);

console.log(`\n  wrote ${wroteClaude} claude agent files, ${wroteOpencode} opencode defs`);
console.log(`  carried ${carried.length} non-agent entries (teams.yaml etc.)`);
console.log(`  roster untouched: ${readdirSync(ROSTER).length} entries still present`);
