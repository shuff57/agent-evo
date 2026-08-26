#!/usr/bin/env node
// Cross-CLI message center + file ownership. One append-only JSONL log per project.
// Usage:
//   node msg.mjs send --from claude --to opencode --text "..."   [--re 3] [--topic build]
//   node msg.mjs read --as opencode [--peek] [--all]
//   node msg.mjs inbox --as opencode                  # same, for hooks: silent when empty, always exit 0
//   node msg.mjs log [--n 20]
//   node msg.mjs prune [--max 400] [--keep 30] [--dry-run]  # trim READ history from the front
//   node msg.mjs claim --as claude test.js lib/        # dir claim: trailing /
//   node msg.mjs release --as claude test.js | --all
//   node msg.mjs owners
//   node msg.mjs guard --as opencode --path lib/x.js   # exit 2 if someone else owns it
//   node msg.mjs guard --as claude --hook              # same, reading a CC PreToolUse payload on stdin
//   node msg.mjs where
// Box: $MSGBOX > <git root>/.msgbox > ~/.claude/msgbox
// The repo box is committed to git, so the log ships between machines (same path
// everywhere, no username in it). Cursors stay device-local via .gitignore.
// The ~/.claude/msgbox fallback exists only for directories that are not a repo.
import fs from 'fs';
import path from 'path';
import os from 'os';

const VALUE_FLAGS = new Set(['from', 'to', 'text', 're', 'topic', 'as', 'n', 'path', 'max', 'keep']);
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

// Retention is size-triggered, never age-triggered: past tasks stay readable in `log` until the
// box is full, then the OLDEST lines that every interested agent has already consumed are dropped
// from the front. `send` auto-prunes when the log exceeds 400 lines. An unread line is never
// dropped; claim/release events are NEVER dropped - ownership replays from the log, so dropping
// them would silently disable the guards. Cursors are positional, so they are renumbered with
// the log (subtracting the number of dropped lines).
function cursors() {
  const out = [];
  for (const f of fs.readdirSync(box)) {
    const m = f.match(/^cursor-([\w.-]+)$/);
    if (m) {
      let val = 0;
      try { val = Number(fs.readFileSync(path.join(box, f), 'utf8').trim()) || 0; } catch {}
      out.push({ agent: m[1], file: f, val });
    }
  }
  return out;
}
const cursorOf = (agent) => cursors().find((c) => c.agent === agent)?.val ?? 0;

function prune(maxUntil, keep, dryRun = false) {
  const log = readLog();
  if (log.length <= maxUntil) return null;
  const cur = cursors();
  const droppable = new Set();
  for (const m of log) {
    if (m.kind) continue;                       // claims/releases replay as ownership state
    if (m.to === 'all' ? !cur.every((c) => c.val >= m.id) : cursorOf(m.to) < m.id) continue;
    droppable.add(m.id);
  }
  const target = Math.max(keep, Math.floor(maxUntil * 0.6));
  let dropCount = 0;
  for (const m of log) {
    if (m.id === dropCount + 1 && droppable.has(m.id) && log.length - dropCount > target) dropCount++;
    else break;
  }
  if (dropCount <= 0) return null;
  if (!dryRun) {
    const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
    fs.writeFileSync(logFile, lines.slice(dropCount).join('\n') + (lines.length > dropCount ? '\n' : ''));
    for (const c of cur) {
      if (c.val > 0) fs.writeFileSync(path.join(box, c.file), String(Math.max(0, c.val - dropCount)));
    }
  }
  return { dropped: dropCount, len: log.length - dropCount, cursors: cur.filter((c) => c.val > 0).length };
}


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
  if (opts.re) {
    // `--re last` = the newest message addressed to you. Threading should not
    // require guessing the next id.
    if (String(opts.re) === 'last') {
      const inbox = readLog().filter((m) => !m.kind && m.from !== opts.from && (m.to === opts.from || m.to === 'all'));
      if (inbox.length) msg.re = inbox.at(-1).id;
    } else msg.re = Number(opts.re);
  }
  if (opts.topic) msg.topic = opts.topic;
  const id = append(msg);
  console.log(`sent #${id} -> ${msg.to}${msg.re ? ` (re #${msg.re})` : ''}  (box: ${box})`);

  // A builder that finishes still holding claims blocks everyone else until
  // someone notices. Replying IS finishing, so drop its claims then - but never
  // the host's, whose claims (specs, acceptance gates) are meant to outlive the
  // exchange. Host = whoever opened the log. `--keep` opts out.
  const host = readLog()[0]?.from;
  if (msg.re && !opts.keep && opts.from !== host) {
    const held = [...ownerMap()].filter(([, o]) => o === opts.from).map(([p]) => p);
    if (held.length) {
      append({ kind: 'release', from: opts.from, all: true });
      console.log(`auto-released ${opts.from} claims on reply: ${held.join(', ')}  (--keep to opt out)`);
    }
  }

  // Retention: the log is append-only but not infinite. Trim READ history from the front
  // once the box gets big enough to cost real context when someone reads it.
  const plen = readLog().length;
  if (plen > 400) {
    const r = prune(400, 30);
    if (r) console.log(`auto-pruned ${r.dropped} read line(s) from the front; log ${plen} -> ${r.len} (cursors recalibrated)`);
  }

} else if (cmd === 'read' || cmd === 'inbox') {
  // `read` is for a human or an agent asking on purpose; `inbox` is the same delivery
  // driven by a hook. They MUST share one cursor and one filter, or a message delivered by
  // one silently disappears from the other. Hence one block, not two.
  const who = need(opts.as, 'need --as <name>');
  const cf = path.join(box, `cursor-${who.replace(/[^\w.-]/g, '_')}`);
  const seen = fs.existsSync(cf) ? Number(fs.readFileSync(cf, 'utf8').trim()) || 0 : 0;
  const all = readLog();
  const fresh = all.filter((m) => m.id > seen && m.from !== who && (opts.all || m.to === who || m.to === 'all' || m.kind));
  if (!opts.peek) fs.writeFileSync(cf, String(all.length));
  // Claim/release events are deliberately NOT pushed into a running task. They are state, not news:
  // `owners` answers "who holds what" at any moment, and the write guard blocks at the instant it
  // actually matters. Pushing them would mean a fresh agent's first tool call carried the entire
  // ownership history of the repo -- which is what this filter was added to stop.
  const news = fresh.filter((m) => !m.kind);
  if (cmd === 'read') {
    console.log(fresh.length ? fresh.map(fmt).join('\n\n') : `(no new messages for ${who})`);
  } else if (news.length) {
    // Deliver the text, do not announce that text exists: a "you have mail" notice costs the
    // agent a whole tool call to act on, and an agent mid-task routinely decides not to spend it.
    console.log(`[message center] ${news.length} new message${news.length > 1 ? 's' : ''} for ${who}. ` +
      `This arrived while you were working; it may change what you should do next.\n\n` +
      news.map(fmt).join('\n\n') +
      `\n\nReply with: node ${process.argv[1].split(path.sep).join('/')} send --from ${who} --to <them> --re <id> --text "..."`);
  }
  // `inbox` prints nothing when there is nothing, and never exits non-zero — it runs on every
  // tool call, so a noisy or failing check would break the agent it exists to help.

} else if (cmd === 'log') {
  console.log(readLog().slice(-Number(opts.n ?? 20)).map(fmt).join('\n\n') || '(empty)');

} else if (cmd === 'prune') {
  const dry = !!opts['dry-run'];
  const r = prune(Number(opts.max ?? 400), Number(opts.keep ?? 30), dry);
  if (!r) console.log(`prune${dry ? ' (dry-run)' : ''}: nothing to drop (${readLog().length} lines)`);
  else if (dry) console.log(`prune (dry-run): would drop ${r.dropped} line(s) from the front; ${r.len} would remain; ${r.cursors} cursor(s) would be recalibrated`);
  else console.log(`prune: dropped ${r.dropped} line(s) from the front; ${r.len} remain; ${r.cursors} cursor(s) recalibrated`);

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

} else if (cmd === 'tree') {
  const log = readLog();
  const talk = log.filter((m) => !m.kind);
  const who = [...new Set(log.map((m) => m.from))];
  const host = who[0] ?? '(nobody)';
  const owners = ownerMap();
  const t = (s) => (s ?? '').slice(11, 19);

  console.log(`box    ${box}`);
  console.log(`host   ${host}`);
  for (const w of who.filter((w) => w !== host)) {
    const sent = talk.filter((m) => m.from === w);
    const got = talk.filter((m) => m.to === w);
    const last = log.filter((m) => m.from === w).at(-1);
    console.log(`  runner ${w}  ${sent.length} sent / ${got.length} received  last ${t(last?.ts)}`);
  }
  const mine = [...owners].filter(([, o]) => o === host).map(([p]) => p);
  const theirs = [...owners].filter(([, o]) => o !== host);
  if (mine.length) console.log(`  claims ${host}: ${mine.join(', ')}`);
  for (const [p, o] of theirs) console.log(`  claims ${o}: ${p}`);

  console.log('\nthread');
  const kids = new Map();
  // A reply may point at a claim/release rather than a message; root it instead
  // of dropping it, or the thread silently loses branches.
  const talkIds = new Set(talk.map((m) => m.id));
  for (const m of talk) {
    const k = m.re && talkIds.has(m.re) ? m.re : 0;
    if (!kids.has(k)) kids.set(k, []);
    kids.get(k).push(m);
  }
  const walk = (id, depth) => {
    for (const m of kids.get(id) ?? []) {
      const head = (m.text ?? '').split('\n')[0].slice(0, 58);
      console.log(`${'  '.repeat(depth)}#${m.id} ${t(m.ts)} ${m.from} -> ${m.to}${m.topic ? ` {${m.topic}}` : ''}\n${'  '.repeat(depth)}   ${head}${head.length >= 58 ? '...' : ''}`);
      walk(m.id, depth + 1);
    }
  };
  walk(0, 0);

} else if (cmd === 'where') {
  console.log(box);
} else {
  console.log('commands: send | read | inbox | log | prune | claim | release | owners | guard | where');
  process.exit(2);
}
