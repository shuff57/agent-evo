#!/usr/bin/env bun
// What chisle's tool-output compressor actually saved, measured from opencode's
// own session store. Read-only, on demand, nothing always-on.
//
//   bun bin/chisle-savings.mjs
//
// WHY THIS EXISTS. `npx chisle --stats` reads a ledger the opencode path never
// writes. In chisle 3.5.0, `recordSavings()` has exactly two callers -- the
// Copilot hook (hooks/chisle-compress-output.js:478) and the Claude PostToolUse
// hook (:496). `compressForOpencode()` returns `transform(...)` directly and
// records nothing, so on an opencode-only install `--stats` reports zero
// forever. Not a bug we hit: a measurement path that does not exist. Verified
// 2026-09-19 by installing the plugin, compressing a real 2,000-line bash
// output, and finding no `.chisle-compress-stats.json` anywhere on the box.
//
// What IS recoverable: chisle mutates the tool output in place, so its marker
// persists in opencode.db, and the elided original spills to disk beside it.
// original - stored = saved, exactly, with no estimation.
//
// UNDERCOUNTS BY DESIGN. chisle keeps only the newest 40 spill files
// (SPILL_KEEP), so an elision whose original has rotated away is reported as an
// event of unknown size rather than guessed at. A run that says "12 measured,
// 30 rotated" is telling you the real figure is higher, not that it failed.
import { Database } from "bun:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DB = path.join(os.homedir(), ".local", "share", "opencode", "opencode.db");
if (!fs.existsSync(DB)) {
  console.error(`no opencode store at ${DB}`);
  process.exit(1);
}

// Both marker shapes: "elided N lines, kept first 60, last 40." and
// "elided N chars from the middle." Only the spill path is load-bearing here --
// the count in the marker is for the model to read, not for arithmetic.
const MARKER = /\[chisle: elided [\d,]+ (?:lines|chars)[^\]]*?Full output: (\S+?) \(grep it/;

const db = new Database(DB, { readonly: true });
const rows = db.query("SELECT data FROM part WHERE data LIKE (?)").all("%chisle: elided%");

// One elided original can appear in several parts (the tool.execute.after copy
// and the request-time transform copy). Key by spill path and keep the LARGEST
// stored length, which is the most conservative saving of the set.
const byOriginal = new Map();
for (const { data } of rows) {
  let part;
  try { part = JSON.parse(data); } catch { continue; }
  const out = part?.state?.output;
  if (typeof out !== "string") continue;
  const m = out.match(MARKER);
  if (!m) continue;
  const spill = m[1];
  const prev = byOriginal.get(spill);
  if (!prev || out.length > prev.stored) {
    byOriginal.set(spill, { stored: out.length, tool: part.tool ?? "?" });
  }
}

let measured = 0, rotated = 0, origTotal = 0, storedTotal = 0;
const perTool = new Map();
for (const [spill, { stored, tool }] of byOriginal) {
  let orig;
  try { orig = fs.statSync(spill).size; } catch { rotated++; continue; }
  if (orig <= stored) continue; // nothing to credit
  measured++;
  origTotal += orig;
  storedTotal += stored;
  const t = perTool.get(tool) ?? { n: 0, saved: 0 };
  t.n++; t.saved += orig - stored;
  perTool.set(tool, t);
}

const saved = origTotal - storedTotal;
const n = (x) => x.toLocaleString("en-US");

console.log("chisle tool-output compression, from opencode.db\n");
console.log(`  elisions found:   ${n(byOriginal.size)}`);
console.log(`  measured:         ${n(measured)}`);
if (rotated) console.log(`  original rotated: ${n(rotated)}  (real saving is higher than below)`);
if (!measured) {
  console.log("\n  nothing measurable yet - run some tool-heavy sessions first.");
  process.exit(0);
}
console.log(`\n  original:         ${n(origTotal)} chars`);
console.log(`  after chisle:     ${n(storedTotal)} chars`);
console.log(`  saved:            ${n(saved)} chars  (~${n(Math.round(saved / 4))} tokens)`);
console.log(`                    ${((saved / origTotal) * 100).toFixed(1)}% of the outputs it touched`);
console.log(`  per elision:      ${n(Math.round(saved / measured))} chars\n`);
for (const [tool, t] of [...perTool].sort((a, b) => b[1].saved - a[1].saved)) {
  console.log(`  ${tool.padEnd(10)} ${String(t.n).padStart(4)} elisions  ${n(t.saved).padStart(12)} chars saved`);
}
// Saved bytes are billed on EVERY later request in that session, not once, so
// this figure is a floor on the cache-read cost avoided rather than the total.
console.log("\n  (tool output is re-billed each later turn, so this is a floor)");
