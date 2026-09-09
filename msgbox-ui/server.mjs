#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MSGBOX_UI_PORT) || 4567;

function findRoot() {
  let dir = process.cwd();
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

const cwdRoot = findRoot();
const homeBox = path.join(os.homedir(), '.claude', 'msgbox');

// Roots scanned for <repo>/.msgbox boxes. Override with MSGBOX_ROOTS (comma-separated).
const DEFAULT_ROOTS = [path.join(os.homedir(), 'Documents', 'GitHub')];
const roots = (process.env.MSGBOX_ROOTS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((p) => path.resolve(p));
if (!roots.length) roots.push(...DEFAULT_ROOTS);

function discoverBoxes() {
  const boxes = new Map();
  const add = (p, name) => {
    if (fs.existsSync(path.join(p, 'log.jsonl'))) boxes.set(p, { name, path: p });
  };
  add(homeBox, '~/.claude/msgbox');
  if (cwdRoot) add(path.join(cwdRoot, '.msgbox'), path.basename(cwdRoot));
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const p = path.join(root, entry.name, '.msgbox');
      if (fs.existsSync(path.join(p, 'log.jsonl'))) add(p, entry.name);
    }
  }
  return [...boxes.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function readLog(boxPath) {
  const logFile = path.join(boxPath, 'log.jsonl');
  if (!fs.existsSync(logFile)) return [];
  return fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l, i) => {
    try { return { id: i + 1, ...JSON.parse(l) }; } catch { return { id: i + 1, from: '?', to: 'all', text: l }; }
  });
}

function ownerMap(log) {
  const owners = new Map();
  for (const m of log) {
    if (m.kind === 'claim') for (const p of m.paths ?? []) owners.set(p, m.from);
    else if (m.kind === 'release') {
      if (m.all) for (const [p, who] of [...owners]) { if (who === m.from) owners.delete(p); }
      else for (const p of m.paths ?? []) { if (owners.get(p) === m.from) owners.delete(p); }
    }
  }
  return owners;
}

function readEvents(boxPath) {
  const eventsFile = path.join(boxPath, 'events.jsonl');
  if (!fs.existsSync(eventsFile)) return [];
  return fs.readFileSync(eventsFile, 'utf8').split('\n').filter(Boolean).map((l, i) => {
    try { return { id: i + 1, ...JSON.parse(l) }; } catch { return { id: i + 1, kind: '?', raw: l }; }
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const json = (code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(obj));
  };

  if (url.pathname === '/api/boxes') {
    const boxes = discoverBoxes().map((b) => {
      const log = readLog(b.path);
      const last = log.at(-1);
      return {
        name: b.name,
        path: b.path,
        count: log.length,
        last: last ? { ts: last.ts, from: last.from, kind: last.kind ?? 'msg' } : null,
      };
    });
    json(200, { boxes, defaultBox: cwdRoot ? path.join(cwdRoot, '.msgbox') : homeBox });
    return;
  }

  if (url.pathname === '/api/log') {
    const want = url.searchParams.get('box');
    const known = discoverBoxes().find((b) => b.path === want);
    if (!known) {
      json(404, { error: 'unknown box' });
      return;
    }
    const log = readLog(known.path);
    const owners = [...ownerMap(log)].map(([p, owner]) => ({ path: p, owner }));
    json(200, { box: known.path, host: log[0]?.from ?? '(nobody)', log, owners });
    return;
  }

  if (url.pathname === '/api/events') {
    const want = url.searchParams.get('box');
    const known = discoverBoxes().find((b) => b.path === want);
    if (!known) {
      json(404, { error: 'unknown box' });
      return;
    }
    json(200, { box: known.path, events: readEvents(known.path) });
    return;
  }

  // SSE update stream: stat both files of ONE box every 2 s and push `event: update` (no data)
  // when either mtime moves, so the client re-fetches log + events. One box per connection —
  // the box param is validated the same way as /api/log.
  if (url.pathname === '/api/stream') {
    const want = url.searchParams.get('box');
    const known = discoverBoxes().find((b) => b.path === want);
    if (!known) {
      json(404, { error: 'unknown box' });
      return;
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      'connection': 'keep-alive',
    });
    let lastLog = 0;
    let lastEvents = 0;
    const tick = () => {
      try {
        const m = (f) => (fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0);
        const logM = m(path.join(known.path, 'log.jsonl'));
        const evM = m(path.join(known.path, 'events.jsonl'));
        if (logM !== lastLog || evM !== lastEvents) {
          lastLog = logM;
          lastEvents = evM;
          res.write('event: update\n\n');
        }
      } catch {
        // A stat failure must not tear down the stream; the next tick retries.
      }
    };
    // First frame on connect: the client needs a baseline, so always emit once.
    res.write('event: update\n\n');
    const timer = setInterval(tick, 2000);
    req.on('close', () => clearInterval(timer));
    return;
  }

  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const full = path.join(here, file);
  if (!full.startsWith(here) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(full)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(full).pipe(res);
}).listen(PORT, () => {
  console.log(`[msgbox-ui] http://localhost:${PORT}`);
  console.log(`[msgbox-ui] scanning roots: ${roots.join(', ')}`);
  console.log(`[msgbox-ui] boxes: ${discoverBoxes().map((b) => b.name).join(', ') || '(none found)'}`);
});
