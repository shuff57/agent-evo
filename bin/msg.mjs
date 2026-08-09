#!/usr/bin/env node
// Cross-CLI message center + file ownership. One append-only JSONL log per project.
// Usage:
//   node msg.mjs send --from claude --to opencode --text "..."   [--re 3] [--topic build]
//   node msg.mjs read --as opencode [--peek] [--all]
//   node msg.mjs log [--n 20]
//   node msg.mjs claim --as claude test.js lib/        # dir claim: trailing /
//   node msg.mjs release --as claude test.js | --all
//   node msg.mjs owners
//   node msg.mjs guard --as opencode --path lib/x.js   # exit 2 if someone else owns it
//   node msg.mjs guard --as claude --hook              # same, reading a CC PreToolUse payload on stdin
//   node msg.mjs where
// Box: $MSGBOX > <git root>/.msgbox > ~/.claude/msgbox
import fs from 'fs';
import path from 'path';
import os from 'os';

const VALUE_FLAGS = new Set(['from', 'to', 'text', 're', 'topic', 'as', 'n', 'path']);
const raw = process.argv.slice(2);
const cmd = raw[0];
const opts = {};
const positional = [];
for (let i = 1; i < raw.length; i++) {
  const a = raw[i];
  if (a.startsWith('--')) {
    const name = a.slice(2);
    if (VALUE_FLAGS.has(name)) opts[name] = raw[++i];
    else opts[name] = true;
  } else positional.push(a);
}

function findRoot() {
  let dir = process.cwd();
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}
const root = findRoot();
const box = process.env.MSGBOX || (root ? path.join(root, '.msgbox') : path.join(os.homedir(), '.claude', 'msgbox'));
const logFile = path.join(box, 'log.jsonl');
fs.mkdirSync(box, { recursive: true });

const readLog = () =>
  fs.existsSync(logFile)
    ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l, i) => {
        try { return { id: i + 1, ...JSON.parse(l) }; } catch { return { id: i + 1, from: '?', to: 'all', text: l }; }
      })
    : [];
const append = (o) => { fs.appendFileSync(logFile, JSON.stringify({ ts: new Date().toISOString(), ...o }) + '\n'); return readLog().length; };

// Paths are stored relative to the repo root (or cwd when there is no repo), forward-slashed.
function norm(p) {
  const base = root || process.cwd();
  const abs = path.resolve(base, String(p));
  let rel = path.relative(base, abs).split(path.sep).join('/');
  if (rel === '') rel = '.';
  if (String(p).endsWith('/') || String(p).endsWith('\\')) rel += '/';
  return rel;
}
const covers = (claim, file) => claim === file || file.startsWith(claim.endsWith('/') ? claim : claim + '/');

// Ownership is replayed from the log — claims and releases are just messages.
function ownerMap() {
  const owners = new Map();
  for (const m of readLog()) {
    if (m.kind === 'claim') for (const p of m.paths ?? []) owners.set(p, m.from);
    else if (m.kind === 'release') {
      if (m.all) for (const [p, who] of [...owners]) { if (who === m.from) owners.delete(p); }
      else for (const p of m.paths ?? []) { if (owners.get(p) === m.from) owners.delete(p); }
    }
  }
  return owners;
}
const conflict = (who, file) => {
  for (const [claim, owner] of ownerMap()) if (owner !== who && covers(claim, file)) return { claim, owner };
  return null;
};

const fmt = (m) =>
  m.kind === 'claim' || m.kind === 'release'
    ? `#${m.id} [${m.ts ?? ''}] ${m.from} ${m.kind}s ${m.all ? '(all)' : (m.paths ?? []).join(' ')}`
    : `#${m.id} [${m.ts ?? ''}] ${m.from} -> ${m.to}${m.re ? ` (re #${m.re})` : ''}${m.topic ? ` {${m.topic}}` : ''}\n${m.text}`;

const need = (v, msg) => { if (!v) { console.error(msg); process.exit(2); } return v; };

if (cmd === 'send') {
  need(opts.from && opts.text, 'need --from and --text');
  const msg = { from: opts.from, to: opts.to ?? 'all', text: String(opts.text) };
  if (opts.re) msg.re = Number(opts.re);
  if (opts.topic) msg.topic = opts.topic;
  console.log(`sent #${append(msg)} -> ${msg.to}  (box: ${box})`);

} else if (cmd === 'read') {
  const who = need(opts.as, 'need --as <name>');
  const cf = path.join(box, `cursor-${who.replace(/[^\w.-]/g, '_')}`);
  const seen = fs.existsSync(cf) ? Number(fs.readFileSync(cf, 'utf8').trim()) || 0 : 0;
  const all = readLog();
  const fresh = all.filter((m) => m.id > seen && m.from !== who && (opts.all || m.to === who || m.to === 'all' || m.kind));
  if (!opts.peek) fs.writeFileSync(cf, String(all.length));
  console.log(fresh.length ? fresh.map(fmt).join('\n\n') : `(no new messages for ${who})`);

} else if (cmd === 'log') {
  console.log(readLog().slice(-Number(opts.n ?? 20)).map(fmt).join('\n\n') || '(empty)');

} else if (cmd === 'claim' || cmd === 'release') {
  const who = need(opts.as, 'need --as <name>');
  if (cmd === 'release' && opts.all) { append({ kind: 'release', from: who, all: true }); console.log(`${who} released everything`); }
  else {
    const paths = [...positional, ...(opts.path ? [opts.path] : [])].map(norm);
    need(paths.length, `need at least one path (or --all for release)`);
    if (cmd === 'claim') {
      const taken = paths.map((p) => [p, conflict(who, p)]).filter(([, c]) => c);
      if (taken.length) {
        console.error(taken.map(([p, c]) => `${p} is already owned by ${c.owner} (via ${c.claim})`).join('\n'));
        process.exit(2);
      }
    }
    append({ kind: cmd, from: who, paths });
    console.log(`${who} ${cmd}s ${paths.join(' ')}`);
  }

} else if (cmd === 'owners') {
  const m = ownerMap();
  console.log(m.size ? [...m].map(([p, o]) => `${o}\t${p}`).join('\n') : '(nothing claimed)');

} else if (cmd === 'guard') {
  const who = need(opts.as, 'need --as <name>');
  let files = [...positional, ...(opts.path ? [opts.path] : [])];
  if (opts.hook) {
    let stdin = '';
    try { stdin = fs.readFileSync(0, 'utf8'); } catch {}
    try {
      const p = JSON.parse(stdin || '{}');
      const i = p.tool_input ?? {};
      files = [i.file_path, i.notebook_path, i.path].filter(Boolean);
    } catch { files = []; }
  }
  for (const f of files) {
    const c = conflict(who, norm(f));
    if (c) {
      console.error(
        `BLOCKED: ${norm(f)} is owned by ${c.owner} (claimed as ${c.claim}).\n` +
        `Do not edit it. Send a message instead:\n` +
        `  node ${process.argv[1].split(path.sep).join('/')} send --from ${who} --to ${c.owner} --text "<what you need changed and why>"`
      );
      process.exit(2);
    }
  }
  process.exit(0);

} else if (cmd === 'where') {
  console.log(box);
} else {
  console.log('commands: send | read | log | claim | release | owners | guard | where');
  process.exit(2);
}
