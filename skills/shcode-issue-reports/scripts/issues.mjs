#!/usr/bin/env node
// shCode student issue reports, read and triaged straight from the production D1
// (through the repo's own `npm run d1` wrapper, which retries Cloudflare's
// transient failures). No password or session is involved: wrangler is already
// logged in on this machine.
//
//   node issues.mjs list [open|in-progress|deferred|fixed|active|all]   (default: active = open + in-progress)
//   node issues.mjs show 89                                              full message, context, note
//   node issues.mjs set --ids 12,13 --status in-progress|fixed|deferred|open --note "..." [--by email]
//   node issues.mjs counts
//
// --note is shown to the STUDENT who filed the report (and to staff). Plain words, no file
// names, no internals. Omit --note to change the status and keep the existing note.
// "closed" is accepted as an alias of "fixed" (the app's word for done).
// Repo: SHCODE_REPO env or --repo, default ~/Documents/GitHub/shCode-deploy.

import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
const REPO = opt('repo') || process.env.SHCODE_REPO || join(homedir(), 'Documents/GitHub/shCode-deploy');
const STATUSES = ['open', 'in-progress', 'fixed', 'deferred'];

function d1(sql) {
  const out = execFileSync('npm', ['run', '-s', 'd1', '--', 'execute', 'shcode-commits', '--remote', '--json', '--command', sql],
    { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  const json = JSON.parse(out.slice(out.indexOf('[')));
  return json.flatMap((r) => r.results ?? []);
}
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const ids = (s) => {
  const list = String(s || '').split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0);
  if (!list.length) { console.error('--ids needs numbers like 12,13'); process.exit(2); }
  return list;
};
const when = (ms) => (ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : '');

if (cmd === 'counts') {
  for (const r of d1('SELECT status, COUNT(*) n FROM issue_reports WHERE withdrawn_at IS NULL GROUP BY status')) console.log(r.status.padEnd(12), r.n);
} else if (cmd === 'list') {
  const which = args[1] && !args[1].startsWith('--') ? args[1] : 'active';
  const where = which === 'all' ? '1=1' : which === 'active' ? "status IN ('open','in-progress')" : `status = ${q(which)}`;
  const rows = d1(`SELECT id, kind, status, created_at, substr(coalesce(title, message),1,70) t,
    json_extract(context_json,'$.lessonId') lesson, json_extract(context_json,'$.path') path,
    (SELECT COUNT(*) FROM issue_report_votes v WHERE v.report_id = r.id) votes, screenshot_id IS NOT NULL shot
    FROM issue_reports r WHERE ${where} ORDER BY id`);
  for (const r of rows) console.log(`#${r.id}  ${r.status.padEnd(11)} ${r.kind.padEnd(11)} ${when(r.created_at)}  ${r.lesson || r.path || ''}  votes:${r.votes}${r.shot ? ' [screenshot]' : ''}\n      ${r.t}`);
  console.log(`\n${rows.length} report(s)`);
} else if (cmd === 'show') {
  for (const r of d1(`SELECT * FROM issue_reports WHERE id = ${ids(args[1]).join(' OR id = ')}`)) {
    let ctx = {}; try { ctx = JSON.parse(r.context_json || '{}'); } catch {}
    console.log(`#${r.id} ${r.kind} ${r.status}  filed ${when(r.created_at)}  triaged ${when(r.triaged_at)}`);
    console.log(`title:   ${r.title ?? ''}\nmessage: ${r.message}`);
    console.log(`where:   ${ctx.url ?? ''}  lesson=${ctx.lessonId ?? ''} file=${ctx.currentFile ?? ''}`);
    console.log(`browser: ${ctx.userAgent ?? ''}  screen=${JSON.stringify(ctx.screen ?? '')}`);
    if (r.screenshot_id) console.log(`screenshot: yes (key ${r.screenshot_id}, shared=${r.screenshot_shared})`);
    console.log(`note:    ${r.resolution_note ?? '(none)'}`);
    const extra = Object.keys(ctx).filter((k) => !['url', 'path', 'lessonId', 'currentFile', 'userAgent', 'screen'].includes(k));
    if (extra.length) console.log('context: ' + JSON.stringify(Object.fromEntries(extra.map((k) => [k, ctx[k]]))).slice(0, 1500));
    console.log('');
  }
} else if (cmd === 'set') {
  let status = opt('status');
  if (status === 'closed') status = 'fixed';
  if (!STATUSES.includes(status)) { console.error('--status must be one of ' + STATUSES.join(', ') + ' (or closed)'); process.exit(2); }
  const list = ids(opt('ids'));
  const note = opt('note');
  if (note !== undefined && note.length > 2000) { console.error('note is over 2000 characters (the app limit)'); process.exit(2); }
  const by = opt('by');
  const sets = [`status = ${q(status)}`, `triaged_at = ${Date.now()}`];
  if (by) sets.push(`triaged_by = ${q(by)}`);
  if (note !== undefined) sets.push(`resolution_note = ${note.trim() ? q(note.trim()) : 'NULL'}`);
  d1(`UPDATE issue_reports SET ${sets.join(', ')} WHERE id IN (${list.join(',')})`);
  for (const r of d1(`SELECT id, status, substr(coalesce(resolution_note,''),1,90) note FROM issue_reports WHERE id IN (${list.join(',')})`)) console.log(`#${r.id} -> ${r.status}  ${r.note}`);
} else {
  console.log('usage: issues.mjs list [status|active|all] | show <id,...> | set --ids a,b --status s [--note "..."] | counts');
  process.exit(cmd ? 2 : 0);
}
