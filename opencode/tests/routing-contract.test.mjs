// Contract tests: the routing docs ARE the contract. (Ported from codex-plugin-cc's
// tests/commands.test.mjs idea — markdown files are pinned by grep-level assertions
// so a doc edit that breaks the contract fails CI instead of silently shipping.)
//
// Two layers:
//  1. routing-contract: CLAUDE.md's tier policy and the /delegate surface must keep
//     agreeing with the tier-gate plugin's constants. If someone edits the doc or the
//     plugin and the other side drifts, this fails.
//  2. tier-gate unit tests: the counting logic (lines, files, once-per-session)
//     exercised directly against the plugin module.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
// 1. Routing docs ↔ plugin contract
// ---------------------------------------------------------------------------
const CLAUDE_MD = fs.readFileSync(path.join(ROOT, "CLAUDE.md"), "utf8");

test("CLAUDE.md states the >10-line delegation default", () => {
  assert.match(CLAUDE_MD, /more than ~10 lines of new code goes to `ollama-code-engineer`/);
});

test("CLAUDE.md states the 2-file coordinated-fix trigger", () => {
  assert.match(CLAUDE_MD, /coordinated fix touching 2\+ files/);
});

test("CLAUDE.md states the fallback command the /delegate lane uses", () => {
  assert.match(CLAUDE_MD, /opencode run "<spec>" --auto -m ollama-cloud\/deepseek-v4\.1-flash/);
});

test("CLAUDE.md pins the rework bound (max 2, then sonnet)", () => {
  assert.match(CLAUDE_MD, /after 2 failures: rebuild on code-engineer \[sonnet\]/);
});

const gate = fs.readFileSync(path.join(ROOT, "opencode", "plugin", "tier-gate.js"), "utf8");

test("tier-gate constants match the CLAUDE.md thresholds", () => {
  assert.match(gate, /const LINE_THRESHOLD = 10;/);
  assert.match(gate, /const FILE_THRESHOLD = 2;/);
});

test("tier-gate never blocks — it injects a notice into the tool result", () => {
  assert.match(gate, /tool\.execute\.after/);
  assert.ok(!/"tool\.execute\.before"/.test(gate), "gate must not block writes");
});

test("tier-gate announces at most once per session", () => {
  assert.match(gate, /if \(state\.announced\) return;/);
  assert.match(gate, /state\.announced = true;/);
});

// The Claude Code port: same contract, PreToolUse-hook shape.
const claudeGate = fs.readFileSync(path.join(ROOT, "hooks", "tier-gate.js"), "utf8");

test("claude tier-gate hook mirrors the CLAUDE.md thresholds", () => {
  assert.match(claudeGate, /const LINE_THRESHOLD = 10;/);
  assert.match(claudeGate, /const FILE_THRESHOLD = 2;/);
  assert.match(claudeGate, /if \(state\.announced\) process\.exit\(0\);/);
});

test("claude tier-gate hook fails open", () => {
  assert.match(claudeGate, /catch\s*{?\s*\n?\s*process\.exit\(0\)/);
});

test("claude tier-gate hook is wired into settings.json PreToolUse", () => {
  const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
  const settings = fs.readFileSync(settingsPath, "utf8");
  const hooks = JSON.parse(settings).hooks?.PreToolUse ?? [];
  const wired = hooks.some(
    (h) => h.matcher === "Edit|Write|NotebookEdit" &&
      (h.hooks ?? []).some((k) => typeof k.command === "string" && k.command.includes("tier-gate.js"))
  );
  assert.ok(wired, "settings.json PreToolUse must invoke hooks/tier-gate.js");
});

test("CLAUDE.md documents enforcement on both CLIs", () => {
  assert.match(CLAUDE_MD, /BOTH CLIs/);
  assert.match(CLAUDE_MD, /hooks\/tier-gate\.js/);
});

// The /delegate lane.
const delegate = fs.readFileSync(path.join(ROOT, "opencode", "command", "delegate.md"), "utf8");

test("/delegate exists and routes through the delegate-build subagent", () => {
  assert.match(delegate, /Dispatch the `delegate-build` subagent/);
});

test("/delegate pins the forward-not-build contract", () => {
  assert.match(delegate, /Do NOT implement any of it yourself/);
  assert.match(delegate, /stdout verbatim/);
});

test("/delegate encodes the rework bound", () => {
  assert.match(delegate, /ONE rework round/);
  assert.match(delegate, /second failure, stop and say so/);
});

const fwd = fs.readFileSync(path.join(ROOT, "opencode", "agent", "delegate-build.md"), "utf8");

test("delegate-build agent is a thin forwarder with edit denied", () => {
  assert.match(fwd, /mode: subagent/);
  assert.match(fwd, /edit: deny/);
  assert.match(fwd, /exactly ONE Bash call/);
  assert.match(fwd, /STOP and say so rather than guessing/);
});

// ---------------------------------------------------------------------------
// 2. tier-gate unit tests — real counting behavior
// ---------------------------------------------------------------------------
const { TierGate } = await import(pathToFileURL(path.join(ROOT, "opencode", "plugin", "tier-gate.js")).href);
const { bashWrite } = await import(pathToFileURL(path.join(ROOT, "hooks", "tier-gate.js")).href);

async function hookFor(directory) {
  const plugin = await TierGate({ directory });
  return plugin["tool.execute.after"];
}

function fakeOutput() {
  return { output: "ok" };
}

test("small edits stay quiet", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-gate-test-"));
  const hook = await hookFor(dir);
  const out = fakeOutput();
  await hook({ tool: "edit", sessionID: "s-quiet", callID: "c1", args: { filePath: path.join(dir, "a.js"), newString: "x\ny" } }, out);
  assert.equal(out.output, "ok");
});

test("a 22-line write triggers the notice once", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-gate-test-"));
  const hook = await hookFor(dir);
  const big = Array.from({ length: 22 }, (_, i) => `line ${i}`).join("\n"); // 21 newlines > 20

  const out1 = fakeOutput();
  await hook({ tool: "write", sessionID: "s-lines", callID: "c1", args: { filePath: path.join(dir, "big.js"), content: big } }, out1);
  assert.match(out1.output, /\[tier-gate\] Tier policy crossed/);

  // second call same session: already announced, stays quiet
  const out2 = fakeOutput();
  await hook({ tool: "write", sessionID: "s-lines", callID: "c2", args: { filePath: path.join(dir, "big2.js"), content: big } }, out2);
  assert.equal(out2.output, "ok");
});

test("exactly 10 newlines does not trigger; 11 does", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-gate-test-"));
  const hook = await hookFor(dir);
  const ten = Array.from({ length: 11 }, (_, i) => `l${i}`).join("\n"); // 11 items = 10 newlines
  const out = fakeOutput();
  await hook({ tool: "write", sessionID: "s-edge", callID: "c1", args: { filePath: path.join(dir, "e.js"), content: ten } }, out);
  assert.equal(out.output, "ok");

  const eleven = Array.from({ length: 12 }, (_, i) => `l${i}`).join("\n"); // 11 newlines > 10
  const out2 = fakeOutput();
  await hook({ tool: "write", sessionID: "s-edge2", callID: "c1", args: { filePath: path.join(dir, "f.js"), content: eleven } }, out2);
  assert.match(out2.output, /\[tier-gate\] Tier policy crossed/);
});

test("two distinct files with tiny edits trigger the notice", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-gate-test-"));
  const hook = await hookFor(dir);
  for (const name of ["a.js", "b.js"]) {
    const out = fakeOutput();
    await hook({ tool: "edit", sessionID: "s-files", callID: name, args: { filePath: path.join(dir, name), newString: "one line" } }, out);
    if (name === "b.js") {
      assert.match(out.output, /2 files/);
    } else {
      assert.equal(out.output, "ok");
    }
  }
});

test("read tools are ignored; state never leaks across sessions", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-gate-test-"));
  const hook = await hookFor(dir);
  const out = fakeOutput();
  await hook({ tool: "read", sessionID: "s-iso1", callID: "c1", args: { filePath: path.join(dir, "x.js") } }, out);
  assert.equal(out.output, "ok");

  // one file in session A, the same file in session B — neither crosses alone
  for (const s of ["s-isoA", "s-isoB"]) {
    const o = fakeOutput();
    await hook({ tool: "edit", sessionID: s, callID: "a.js", args: { filePath: path.join(dir, "a.js"), newString: "x" } }, o);
    assert.equal(o.output, "ok", `${s}/a.js should stay quiet`);
  }
});

test("state persists across plugin instances for the same session", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-gate-test-"));
  const hook1 = await hookFor(dir);
  const hook2 = await hookFor(dir); // fresh instance, e.g. after restart
  const out1 = fakeOutput();
  await hook1({ tool: "edit", sessionID: "s-persist", callID: "c1", args: { filePath: path.join(dir, "a.js"), newString: "x\ny\nz" } }, out1);
  assert.equal(out1.output, "ok");
  const out2 = fakeOutput();
  await hook2({ tool: "edit", sessionID: "s-persist", callID: "c2", args: { filePath: path.join(dir, "b.js"), newString: "x\ny\nz" } }, out2);
  assert.match(out2.output, /\[tier-gate\]/); // 2nd distinct file crosses FILE_THRESHOLD
});

// ---------------------------------------------------------------------------
// 3. bashWrite — write-shaped Bash detection
// ---------------------------------------------------------------------------
test("bashWrite: sed -i is a write on its target file", () => {
  const r = bashWrite("sed -i 's/a/b/' foo.js");
  assert.equal(r.isWrite, true);
  assert.ok(r.files.includes("foo.js"));
});

test("bashWrite: quoted '>' must not count as a redirect", () => {
  const r = bashWrite('grep -n "foo > bar" x.js');
  assert.equal(r.isWrite, false);
});

test("bashWrite: redirect to /dev/null is not a write", () => {
  const r = bashWrite("echo hi > /dev/null");
  assert.equal(r.isWrite, false);
});

test("bashWrite: fd-dup 2>&1 is not a write", () => {
  const r = bashWrite("node x.js 2>&1");
  assert.equal(r.isWrite, false);
});

test("bashWrite: read-only git subcommands are not writes", () => {
  const r = bashWrite("git status --short");
  assert.equal(r.isWrite, false);
});

test("bashWrite: redirect wins over a read-only git subcommand", () => {
  const r = bashWrite("git diff --stat > out.txt");
  assert.equal(r.isWrite, true);
  assert.ok(r.files.includes("out.txt"));
});

test("bashWrite: heredoc counts body lines and names the target", () => {
  const body = Array.from({ length: 15 }, (_, i) => `line ${i}`).join("\n");
  const r = bashWrite(`cat > a.js <<'EOF'\n${body}\nEOF`);
  assert.equal(r.isWrite, true);
  assert.equal(r.lines, 15);
  assert.ok(r.files.includes("a.js"));
});

test("bashWrite: python without a write token is not a write", () => {
  const r = bashWrite('python -c "print(1)"');
  assert.equal(r.isWrite, false);
});

test("bashWrite: python with a write token is an unattributed write", () => {
  const r = bashWrite("python -c \"open('x','w').write(y)\"");
  assert.equal(r.isWrite, true);
  assert.deepEqual(r.files, ["<bash:unattributed>"]);
});

test("bashWrite: tee names its target file", () => {
  const r = bashWrite("tee -a log.txt");
  assert.equal(r.isWrite, true);
  assert.ok(r.files.includes("log.txt"));
});

test("bashWrite: non-string input is total and non-write", () => {
  const r = bashWrite(undefined);
  assert.deepEqual(r, { isWrite: false, files: [], lines: 0 });
});

// End-to-end on the opencode plugin: two sed -i bash calls on DIFFERENT files
// in one session must cross FILE_THRESHOLD and announce on the second.
test("two sed -i bash calls on different files trigger the notice", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-gate-test-"));
  const hook = await hookFor(dir);
  const out1 = fakeOutput();
  await hook({ tool: "bash", sessionID: "s-bash", callID: "c1", args: { command: `sed -i 's/a/b/' ${path.join(dir, "a.js")}` } }, out1);
  assert.equal(out1.output, "ok");
  const out2 = fakeOutput();
  await hook({ tool: "bash", sessionID: "s-bash", callID: "c2", args: { command: `sed -i 's/a/b/' ${path.join(dir, "b.js")}` } }, out2);
  assert.match(out2.output, /\[tier-gate\]/);
});
// Regression: a read-only python one-liner must not read as a write. The first spec
// listed a bare `open(` as a write token, which flagged `python -c "print(open('x').read())"`
// and let a pure read contribute to the file count. An explicit w/a/x mode is now required.
test("read-only interpreter one-liners are not writes", () => {
  assert.equal(bashWrite(`python -c "print(open('x').read())"`).isWrite, false);
  assert.equal(bashWrite(`node -e "console.log(fs.readFileSync('x','utf8'))"`).isWrite, false);
  assert.equal(bashWrite(`python -c "open('x','w').write(y)"`).isWrite, true);
  assert.equal(bashWrite(`python -c "open('x', 'a').write(y)"`).isWrite, true);
});

// The Bash lane is the whole point of bashWrite: the hook understood Bash for a while
// before settings.json actually routed Bash calls to it, which is a gate that reads as
// wired and sees nothing. Pin the wiring the same way the Edit|Write lane is pinned.
test("claude tier-gate hook is wired for the Bash lane too", () => {
  const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  const hooks = settings.hooks?.PreToolUse ?? [];
  const wired = hooks.some(
    (h) => h.matcher === "Bash" &&
      (h.hooks ?? []).some((k) => typeof k.command === "string" && k.command.includes("tier-gate.js"))
  );
  assert.ok(wired, "settings.json must route Bash to tier-gate.js, else bashWrite never runs");
});

// ---------------------------------------------------------------------------
// 4. Peer bridge — repo-level wiring + docs contract (hermetic)
// ---------------------------------------------------------------------------
// These read the REPO settings.json, never ~/.claude/settings.json. The live file is
// ORCA-managed and diverges per box, so a contract pinned against it would pass or fail
// by machine; the repo copy is the source of truth install.sh symlinks into place. The
// live-settings tests above are deliberately left as they were.
const REPO_SETTINGS = JSON.parse(fs.readFileSync(path.join(ROOT, "settings.json"), "utf8"));

function postToolUseCommands() {
  return (REPO_SETTINGS.hooks?.PostToolUse ?? []).flatMap((h) => h.hooks ?? []);
}

test("repo settings.json wires hooks/peer-inbox.js into PostToolUse", () => {
  const wired = postToolUseCommands().some(
    (k) => typeof k.command === "string" && k.command.includes("hooks/peer-inbox.js")
  );
  assert.ok(wired, "repo settings.json PostToolUse must invoke hooks/peer-inbox.js");
});

test("peer-inbox hook is matcher-less, so every tool call can deliver", () => {
  const entry = (REPO_SETTINGS.hooks?.PostToolUse ?? []).find((h) =>
    (h.hooks ?? []).some((k) => typeof k.command === "string" && k.command.includes("hooks/peer-inbox.js"))
  );
  assert.ok(entry, "peer-inbox entry must exist");
  assert.equal(entry.matcher, undefined, "a matcher would narrow delivery to some tools only");
});

test("peer-inbox hook command uses the $HOME-safe repo path", () => {
  const cmd = postToolUseCommands()
    .map((k) => k.command)
    .find((c) => typeof c === "string" && c.includes("hooks/peer-inbox.js"));
  assert.match(cmd, /^node \$HOME\/Documents\/GitHub\/agent-evo\/hooks\/peer-inbox\.js$/);
});

test("CLAUDE.md documents the peer bridge section", () => {
  assert.match(CLAUDE_MD, /^## Peer bridge$/m);
});

test("CLAUDE.md pins the sidecar usage string", () => {
  assert.match(CLAUDE_MD, /node bin\/peer-sidecar\.mjs --as opencode \[--heartbeat-ms 30000\]/);
});

test("CLAUDE.md pins the peer CLI send usage string", () => {
  assert.match(
    CLAUDE_MD,
    /node bin\/peer\.mjs send --to <name\|pid> --text <s> \[--priority now\|next\|later\] \[--from-name <s>\] \[--no-audit\]/
  );
});

test("CLAUDE.md states the peer bridge's fail-closed identity and trust boundary", () => {
  assert.match(CLAUDE_MD, /Identity is fail-closed/);
  assert.match(CLAUDE_MD, /same OS user and nothing more/);
});

test("CLAUDE.md states honest priority semantics", () => {
  assert.match(CLAUDE_MD, /Priority is honest/);
  assert.match(CLAUDE_MD, /delivery is the next tool/);
});

test("CLAUDE.md pins the watchable-lane usage string", () => {
  assert.match(CLAUDE_MD, /^### Watchable lane \(tmux\)$/m);
  assert.match(
    CLAUDE_MD,
    /node bin\/peer-term\.mjs ask --as <lane> --text <s> \[--model ID\] \[--new\] \[--log\] \[--auto\] \[--timeout MS\]/
  );
  assert.match(CLAUDE_MD, /tmux attach -t peer-<lane>/);
});

// The peer suites are `bun test`, not `node --test`: on a box where `node` is a bun shim
// the latter runs the file with no runner and node:test throws, which reads as a broken
// suite rather than a wrong command. Doc and headers are pinned together so neither can
// drift back on its own.
test("the peer test headers and CLAUDE.md agree on bun test", () => {
  assert.match(CLAUDE_MD, /Run the peer suites with `bun test`, not `node --test`/);
  for (const name of ["codec", "registry", "sidecar", "client", "term"]) {
    const src = fs.readFileSync(path.join(ROOT, "bin", "peer", `${name}.test.mjs`), "utf8").slice(0, 400);
    assert.match(src, new RegExp(`bun test bin/peer/${name}\\.test\\.mjs`), `${name}.test.mjs header`);
  }
});

test("CLAUDE.md no longer parks the Claude inbox hook", () => {
  assert.ok(!/left off deliberately/.test(CLAUDE_MD), "the stale parked-hook paragraph must be gone");
  assert.match(CLAUDE_MD, /hooks\/peer-inbox\.js/);
  assert.match(CLAUDE_MD, /mtime gate/);
});

// The opencode plugin contract: opencode calls EVERY exported function as a plugin factory,
// so inbox.js must expose exactly one. Pinned statically here (source-level) rather than by
// importing the module — msg.test.mjs already exercises the runtime shape, and this file's
// job is to catch a source edit that adds a second export before it ever runs. The registry
// import is a separate unit and is not present in inbox.js yet, so it is not pinned here.
const inboxPlugin = fs.readFileSync(path.join(ROOT, "opencode", "plugin", "inbox.js"), "utf8");

test("opencode/plugin/inbox.js keeps exactly one export", () => {
  const exports = inboxPlugin.match(/^export\s+/gm) ?? [];
  assert.equal(exports.length, 1, "a second export is invoked as a plugin factory and breaks loading");
  assert.match(inboxPlugin, /^export const Inbox = /m);
  assert.match(inboxPlugin, /Inbox\.findBox = findBox;/);
});
