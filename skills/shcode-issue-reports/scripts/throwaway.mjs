#!/usr/bin/env node
// Throwaway accounts on the LIVE site for checking a fix as real students and a teacher,
// and the cleanup that removes every trace of them.
//
//   node throwaway.mjs make <dir> [--students 2] [--teacher]   -> <dir>/s1.json, s2.json, (t.json): Playwright
//        storage states (sign-in cookie only). Also a class "Walk test class" (id ct-walk-class) with every
//        student enrolled, owned by the teacher (or by a placeholder owner when there is no teacher).
//   node throwaway.mjs cleanup [<dir>]                         -> deletes every shcode-ct-* row in every table that
//        holds one, the class, and the state files in <dir>; prints left_over (must be 0).
//
// Passwords are random, live only in this process's memory and are never printed or written.
// Load a state with:  playwright-cli -s=<name> open <url>; playwright-cli -s=<name> state-load <dir>/s1.json
// or playwright-core: browser.newContext({ storageState: '<dir>/s1.json' }).
// Repo: SHCODE_REPO env, default ~/Documents/GitHub/shCode-deploy. Site: SHCODE_BASE, default https://shcode.pages.dev.

import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.SHCODE_BASE || 'https://shcode.pages.dev';
const HOST = new URL(BASE).hostname;
const REPO = process.env.SHCODE_REPO || join(homedir(), 'Documents/GitHub/shCode-deploy');
const [cmd, dir] = process.argv.slice(2);
const flag = (k) => process.argv.includes('--' + k);
const num = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? Number(process.argv[i + 1]) : d; };
const P = "LIKE 'shcode-ct-%@example.invalid'";

function d1(sql) {
  const out = execFileSync('npm', ['run', '-s', 'd1', '--', 'execute', 'shcode-commits', '--remote', '--json', '--command', sql],
    { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf('['))).flatMap((r) => r.results ?? []);
}
const cookiesOf = (r) => (r.headers.getSetCookie?.() ?? []).map((c) => { const [nv] = c.split(';'); const i = nv.indexOf('='); return { name: nv.slice(0, i), value: nv.slice(i + 1) }; });
const state = (cs) => ({ cookies: cs.map((c) => ({ ...c, domain: HOST, path: '/', expires: Math.floor(Date.now() / 1000) + 86400, httpOnly: true, secure: BASE.startsWith('https'), sameSite: 'Lax' })), origins: [] });

async function signup(tag, first, last) {
  const email = `shcode-ct-${tag}-${randomBytes(4).toString('hex')}@example.invalid`;
  const password = randomBytes(18).toString('base64url');
  const r = await fetch(BASE + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ email, password, firstName: first, lastName: last, confirmedAge13: true, acceptedTerms: true }) });
  if (!r.ok) throw new Error(`signup ${r.status}`);
  return { email, password, cookies: cookiesOf(r) };
}

if (cmd === 'make') {
  if (!dir) { console.error('make needs a directory'); process.exit(2); }
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const names = [['Sam', 'Walker'], ['Ana', 'Pierce'], ['Lee', 'Moss'], ['Kai', 'Reyes']];
  const n = Math.max(1, Math.min(4, num('students', 2)));
  const students = [];
  for (let i = 0; i < n; i++) students.push(await signup('s' + (i + 1), ...names[i]));
  let owner = 'shcode-ct-owner@example.invalid';
  if (flag('teacher')) {
    const t = await signup('t', 'Terry', 'Teach');
    d1(`UPDATE students SET role='teacher' WHERE email='${t.email}'`);
    // The role rides in the session token, so sign in again to get a teacher session.
    const lr = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email: t.email, password: t.password }) });
    if (!lr.ok) throw new Error('teacher login ' + lr.status);
    writeFileSync(join(dir, 't.json'), JSON.stringify(state(cookiesOf(lr))), { mode: 0o600 });
    owner = t.email;
  }
  const now = Date.now(), exp = now + 2 * 86400000;
  d1(`INSERT INTO classes (id,name,code,owner_email,school_year,created_at) VALUES ('ct-walk-class','Walk test class','CTWK97','${owner}','2026-2027',${now});
      INSERT INTO enrollments (class_id,student_email,enrolled_at,expires_at) VALUES ${students.map((s) => `('ct-walk-class','${s.email}',${now},${exp})`).join(',')};`);
  students.forEach((s, i) => writeFileSync(join(dir, `s${i + 1}.json`), JSON.stringify(state(s.cookies)), { mode: 0o600 }));
  console.log(`made ${n} student(s)${flag('teacher') ? ' + teacher' : ''} in class ct-walk-class; states in ${dir}`);
} else if (cmd === 'cleanup') {
  const byEmail = { students: 'email', user_prefs: 'email', login_attempts: 'email', game_room_players: 'email',
    lesson_sync: 'student_email', lesson_sync_history: 'student_email', lesson_drafts: 'student_email', lesson_state: 'student_email',
    lesson_submissions: 'student_email', ai_help_usage: 'student_email', requirement_events: 'student_email', enrollments: 'student_email',
    library_games: 'owner_email', library_items: 'owner_email', uploads: 'owner_email', issue_reports: 'reporter_email' };
  const stmts = [
    `DELETE FROM code_sessions WHERE host_email ${P}`,
    `DELETE FROM game_room_events WHERE code IN (SELECT code FROM game_rooms WHERE host_email ${P})`,
    `DELETE FROM game_rooms WHERE host_email ${P}`,
    `DELETE FROM library_game_shares WHERE game_id IN (SELECT id FROM library_games WHERE owner_email ${P})`,
    `DELETE FROM library_shares WHERE item_id IN (SELECT id FROM library_items WHERE owner_email ${P})`,
    `DELETE FROM enrollments WHERE class_id = 'ct-walk-class'`,
    `DELETE FROM classes WHERE id = 'ct-walk-class'`,
  ];
  for (const [t, c] of Object.entries(byEmail)) stmts.push(`DELETE FROM ${t} WHERE ${c} ${P}`);
  // One statement per call: a table or column this deploy does not have must not stop the rest.
  const skipped = [];
  for (const s of stmts) { try { d1(s); } catch { skipped.push(s.split(' WHERE')[0]); } }
  const left = d1(`SELECT (SELECT COUNT(*) FROM students WHERE email ${P}) + (SELECT COUNT(*) FROM classes WHERE id='ct-walk-class')
    + (SELECT COUNT(*) FROM game_rooms WHERE host_email ${P}) + (SELECT COUNT(*) FROM code_sessions WHERE host_email ${P}) AS n`)[0].n;
  if (dir && existsSync(dir)) for (const f of ['s1.json', 's2.json', 's3.json', 's4.json', 't.json']) rmSync(join(dir, f), { force: true });
  if (skipped.length) console.log('skipped (no such table/column here): ' + skipped.join('; '));
  console.log('left_over ' + left);
  process.exit(left ? 1 : 0);
} else {
  console.log('usage: throwaway.mjs make <dir> [--students N] [--teacher] | cleanup [<dir>]');
  process.exit(cmd ? 2 : 0);
}
