import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "context-monitor.js");

// Debounce state lives in %TMP%/claude-context-monitor-<session>.json, so a fixed
// session id would inherit state from a previous run of this suite. Real session ids
// are unique; make the fixture's ids unique too.
const RUN = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
const sid = (name) => `${name}-${RUN}`;
const tpath = (name) => `C:/tmp/${name}-${RUN}.jsonl`;

function runHook(payload, env = {}) {
  try {
    const stdout = execFileSync(process.execPath, [HOOK], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: { ...process.env, ...env },
      timeout: 15000,
    });
    return { stdout, code: 0 };
  } catch (e) {
    return { stdout: e.stdout ?? "", code: e.status ?? 1 };
  }
}

// Build a fake CLAUDE_CONFIG_DIR with one context-cache snapshot.
function fixture({ remaining, used, savedAt, transcript, sessionId }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmon-"));
  const cacheDir = path.join(dir, "plugins", "claude-hud", "context-cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  const hash = crypto.createHash("sha256").update(path.resolve(transcript)).digest("hex");
  fs.writeFileSync(
    path.join(cacheDir, `${hash}.json`),
    JSON.stringify({
      used_percentage: used,
      remaining_percentage: remaining,
      context_window_size: 200000,
      saved_at: savedAt ?? Date.now(),
      session_name: null,
    })
  );
  return { configDir: dir, sessionId };
}

test("high remaining stays silent", () => {
  const fx = fixture({ remaining: 80, used: 20, transcript: tpath("t1"), sessionId: sid("quiet") });
  const r = runHook(
    { session_id: sid("quiet"), transcript_path: tpath("t1") },
    { CLAUDE_CONFIG_DIR: fx.configDir }
  );
  assert.equal(r.stdout.trim(), "");
  assert.equal(r.code, 0);
});

test("warning threshold emits additionalContext once then debounces", () => {
  const fx = fixture({ remaining: 30, used: 70, transcript: tpath("t2"), sessionId: sid("warn") });
  const env = { CLAUDE_CONFIG_DIR: fx.configDir };
  const first = runHook({ session_id: sid("warn"), transcript_path: tpath("t2") }, env);
  assert.match(first.stdout, /CONTEXT WARNING/);
  assert.match(first.stdout, /hookSpecificOutput/);
  // second call within the debounce window stays silent
  const second = runHook({ session_id: sid("warn"), transcript_path: tpath("t2") }, env);
  assert.equal(second.stdout.trim(), "");
});

test("critical emits immediately (escalation bypasses debounce)", () => {
  const fx = fixture({ remaining: 30, used: 70, transcript: tpath("t3"), sessionId: sid("crit") });
  const env = { CLAUDE_CONFIG_DIR: fx.configDir };
  const first = runHook({ session_id: sid("crit"), transcript_path: tpath("t3") }, env);
  assert.match(first.stdout, /CONTEXT WARNING/);
  const second = runHook({ session_id: sid("crit"), transcript_path: tpath("t3") }, env);
  assert.equal(second.stdout.trim(), "");
  // rewrite the snapshot to critical and escalate immediately
  const cacheFile = fs.readdirSync(path.join(fx.configDir, "plugins", "claude-hud", "context-cache")).map((f) =>
    path.join(fx.configDir, "plugins", "claude-hud", "context-cache", f)
  )[0];
  const snap = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  snap.remaining_percentage = 10;
  snap.used_percentage = 90;
  snap.saved_at = Date.now();
  fs.writeFileSync(cacheFile, JSON.stringify(snap));
  const third = runHook({ session_id: sid("crit"), transcript_path: tpath("t3") }, env);
  assert.match(third.stdout, /CONTEXT CRITICAL/);
});

test("stale snapshot is ignored", () => {
  const fx = fixture({ remaining: 10, used: 90, savedAt: Date.now() - 10 * 60 * 1000, transcript: tpath("t4"), sessionId: sid("stale") });
  const r = runHook(
    { session_id: sid("stale"), transcript_path: tpath("t4") },
    { CLAUDE_CONFIG_DIR: fx.configDir }
  );
  assert.equal(r.stdout.trim(), "");
});

test("missing cache file and malformed input both fail open", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmon-empty-"));
  const r1 = runHook(
    { session_id: sid("none"), transcript_path: tpath("none") },
    { CLAUDE_CONFIG_DIR: dir }
  );
  assert.equal(r1.stdout.trim(), "");
  assert.equal(r1.code, 0);

  try {
    execFileSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8", timeout: 10000 });
  } catch (e) {
    assert.equal(e.status, 0, "malformed stdin must still exit 0");
  }
});
