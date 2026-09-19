// Contract tests: the routing docs ARE the contract. (Ported from codex-plugin-cc's
// tests/commands.test.mjs idea — markdown files are pinned by grep-level assertions
// so a doc edit that breaks the contract fails CI instead of silently shipping.)
//
// Two layers:
//  1. routing-contract: AGENTS.md's tier policy and the /delegate surface must keep
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
// 2026-09-19: CLAUDE.md became AGENTS.md. That is not cosmetic - opencode's Instruction
// service walks ["AGENTS.md", "CLAUDE.md", "CONTEXT.md"] and BREAKS on the first name it
// finds, so the filename IS the load. In the same pass the handoff and peer catalogues
// moved into skills/, which load on demand instead of on every prompt. Each assertion
// below is pinned against whichever file now owns the string; a section that moves again
// must move its test with it, or this file pins prose that nothing reads.
const AGENTS_MD = fs.readFileSync(path.join(ROOT, "AGENTS.md"), "utf8");
const HANDOFF_SKILL = fs.readFileSync(path.join(ROOT, "skills", "handoff", "SKILL.md"), "utf8");
const PEER_SKILL = fs.readFileSync(path.join(ROOT, "skills", "peer-bridge", "SKILL.md"), "utf8");

// Prose assertions match against a whitespace-flattened copy. The contract is "the doc
// says this", not "the doc says this with these line breaks" - two assertions went red on
// 2026-09-19 purely because a reflow moved a wrap point mid-phrase, which is a false
// failure that teaches the next person to loosen the regex instead of fixing the doc.
// Heading and code-block assertions still use the raw text, because ^...$ is the point.
const flat = (doc) => doc.replace(/\s+/g, " ");
const AGENTS_FLAT = flat(AGENTS_MD);
const HANDOFF_FLAT = flat(HANDOFF_SKILL);
const PEER_FLAT = flat(PEER_SKILL);

test("AGENTS.md is the instruction filename, and no CLAUDE.md shadows it", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "AGENTS.md")), "AGENTS.md is what opencode loads");
  assert.ok(
    !fs.existsSync(path.join(ROOT, "CLAUDE.md")),
    "a root CLAUDE.md is never read (AGENTS.md wins the break-on-first walk) - it is dead weight that reads as live"
  );
});

test("AGENTS.md states the >10-line delegation default", () => {
  assert.match(AGENTS_FLAT, /more than ~10 lines of new code/);
  assert.match(AGENTS_FLAT, /`task\(category="quick"\)`/);
});

test("AGENTS.md states the 2-file coordinated-fix trigger", () => {
  assert.match(AGENTS_FLAT, /coordinated fix touching 2\+ files/);
});

// The handoff catalogue used to sit inline and cost ~110 lines on every prompt. It is a
// skill now, so the contract is the POINTER plus the strings at the far end of it - a
// dangling pointer is the failure this pair catches.
test("AGENTS.md points at the handoff skill, which owns the dispatch command", () => {
  assert.match(AGENTS_FLAT, /skills\/handoff\/SKILL\.md/);
  assert.match(HANDOFF_FLAT, /node bin\/handoff\.mjs --spec/);
  assert.match(HANDOFF_FLAT, /ollama-cloud\/glm-5\.3-flash/);
});

test("AGENTS.md pins the rework bound (max 2, then sonnet)", () => {
  // Since the 2026-09-19 retirement of code-engineer, the sonnet builder is the
  // unspecified-high category (Sisyphus-Junior on claude-sonnet-5). NOT hephaestus:
  // omo's no-hephaestus-non-gpt hook disables that agent on a non-GPT model.
  assert.match(AGENTS_MD, /after 2 failures: rebuild on category=unspecified-high \[sonnet\]/);
});

const gate = fs.readFileSync(path.join(ROOT, "opencode", "plugin", "tier-gate.js"), "utf8");

test("tier-gate constants match the AGENTS.md thresholds", () => {
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

// The Claude Code port: same contract, PreToolUse-hook shape. DORMANT since 2026-09-19
// (this box runs opencode only; nothing loads PreToolUse hooks), but still unit-tested as
// pure functions below, so its constants must not drift from the doc.
const claudeGate = fs.readFileSync(path.join(ROOT, "hooks", "tier-gate.js"), "utf8");

test("claude tier-gate hook mirrors the AGENTS.md thresholds", () => {
  assert.match(claudeGate, /const LINE_THRESHOLD = 10;/);
  assert.match(claudeGate, /const FILE_THRESHOLD = 2;/);
  assert.match(claudeGate, /if \(state\.announced\) process\.exit\(0\);/);
});

test("claude tier-gate hook fails open", () => {
  assert.match(claudeGate, /catch\s*{?\s*\n?\s*process\.exit\(0\)/);
});

// The two tests that asserted ~/.claude/settings.json wires this hook were dropped
// 2026-09-19. They pinned a harness nothing here runs, against an app-managed file that
// churns per box - so they could only ever go red for a reason no one would act on. What
// replaces them is the rule that keeps the dormancy from being un-noticed by accident.
test("AGENTS.md records that the Claude-Code-shaped files are inert", () => {
  assert.match(AGENTS_FLAT, /`hooks\/` \(every file a `PreToolUse`\/`PostToolUse` hook\)/);
  assert.match(AGENTS_FLAT, /inert/);
  assert.match(AGENTS_FLAT, /opencode\/plugin\/` holds the live equivalents/);
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

// The Bash-lane wiring test went with the other live-settings ones on 2026-09-19: the
// hook understood Bash before settings.json routed Bash to it, which was a real gate that
// read as wired and saw nothing - but on a box with no Claude Code there is no wiring to
// assert. bashWrite() itself is still exercised directly above.

// ---------------------------------------------------------------------------
// 4. Peer bridge — repo-level wiring + docs contract (hermetic)
// ---------------------------------------------------------------------------
// These guard the repo's own settings.json. It is DORMANT (no Claude Code on this box),
// but it is still a tracked file that travels between machines and has silently lost an
// entry before, so its shape stays pinned rather than untested.
//
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

test("AGENTS.md points at the peer-bridge skill, which owns the section", () => {
  assert.match(AGENTS_FLAT, /skills\/peer-bridge\/SKILL\.md/);
  assert.match(PEER_SKILL, /^# Peer bridge$/m);
});

test("the peer skill pins the sidecar usage string", () => {
  assert.match(PEER_SKILL, /node bin\/peer-sidecar\.mjs --as opencode \[--heartbeat-ms 30000\]/);
});

test("the peer skill pins the peer CLI send usage string", () => {
  // Wrapped with a trailing backslash in the skill's code block; \s+ spans the break.
  assert.match(
    PEER_SKILL,
    /node bin\/peer\.mjs send --to <name\|pid> --text <s> \[--priority now\|next\|later\][\s\\]+\[--from-name <s>\] \[--no-audit\]/
  );
});

test("the peer skill states fail-closed identity and the trust boundary", () => {
  assert.match(PEER_FLAT, /Identity is fail-closed/);
  assert.match(PEER_FLAT, /same OS user and nothing more/);
});

test("the peer skill states honest priority semantics", () => {
  assert.match(PEER_FLAT, /Priority is honest/);
  assert.match(PEER_FLAT, /delivery is the next tool call for all three/);
});

test("the peer skill pins the watchable-lane usage string", () => {
  assert.match(PEER_SKILL, /^## Watchable lane \(tmux\)$/m);
  assert.match(
    PEER_SKILL,
    /node bin\/peer-term\.mjs ask --as <lane> --text <s> \[--model ID\] \[--new\] \[--log\] \[--auto\] \[--timeout MS\]/
  );
  assert.match(PEER_SKILL, /tmux attach -t peer-<lane>/);
});

// The peer suites are `bun test`, not `node --test`: on a box where `node` is a bun shim
// the latter runs the file with no runner and node:test throws, which reads as a broken
// suite rather than a wrong command. Doc and headers are pinned together so neither can
// drift back on its own.
test("the peer test headers and the peer skill agree on bun test", () => {
  assert.match(PEER_FLAT, /Run every peer suite with `bun test`, not `node --test`/);
  for (const name of ["codec", "registry", "sidecar", "client", "term"]) {
    const src = fs.readFileSync(path.join(ROOT, "bin", "peer", `${name}.test.mjs`), "utf8").slice(0, 400);
    assert.match(src, new RegExp(`bun test bin/peer/${name}\\.test\\.mjs`), `${name}.test.mjs header`);
  }
});

// peer-inbox.js is a Claude Code PostToolUse hook and therefore dormant here; the live
// mid-run delivery is opencode/plugin/inbox.js, which AGENTS.md must keep naming because
// a session that does not know messages arrive on tool results will poll or miss them.
test("AGENTS.md documents mid-run delivery via the opencode inbox plugin", () => {
  assert.match(AGENTS_FLAT, /opencode\/plugin\/inbox\.js/);
  assert.match(AGENTS_FLAT, /Messages sent mid-run find you/);
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

// ---------------------------------------------------------------------------
// 5. tier-gate counts FILES, not path spellings
// ---------------------------------------------------------------------------
// Bash hands the hook a cwd-relative path and Write hands it an absolute one, so
// one file touched by both used to count as two and cross FILE_THRESHOLD on its
// own. Two costs, and the second is the worse one: the notice is deliberately
// once per session, so a phantom trigger SPENDS that budget and the genuinely
// large write later in the session is met with silence. Observed live on a
// single-file edit, then reduced to the case below.
import { execFileSync } from "node:child_process";

const TIER_GATE = path.join(ROOT, "hooks", "tier-gate.js");

function feedGate(sessionID, payload) {
  const body = JSON.stringify({ session_id: sessionID, cwd: ROOT, ...payload });
  return execFileSync(process.execPath, [TIER_GATE], {
    input: body,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_AGENT_ID: "", CLAUDE_SUBAGENT: "" },
  });
}

const bashWriteTo = (file) => ({ tool_name: "Bash", tool_input: { command: `echo hi > ${file}` } });
const writeTo = (file) => ({ tool_name: "Write", tool_input: { file_path: file, content: "x" } });

function gateSession(name) {
  const id = `gate-${name}-${process.pid}`;
  // One state file per session id; clear any leftover so a rerun starts fresh.
  for (const f of fs.readdirSync(path.join(os.tmpdir(), "claude-tier-gate")).filter((f) => f.startsWith(`${id}-`))) {
    fs.rmSync(path.join(os.tmpdir(), "claude-tier-gate", f), { force: true });
  }
  return id;
}

test("tier-gate: one file reached by two path spellings is one file", () => {
  const id = gateSession("same");
  assert.equal(feedGate(id, bashWriteTo("tmp/one.txt")), "", "a single relative write is under threshold");
  const out = feedGate(id, writeTo(path.join(ROOT, "tmp", "one.txt")));
  assert.equal(out, "", "the same file by its absolute name must not read as a second file");
});

test("tier-gate: two genuinely distinct files still announce", () => {
  const id = gateSession("distinct");
  assert.equal(feedGate(id, bashWriteTo("tmp/one.txt")), "");
  const out = feedGate(id, writeTo(path.join(ROOT, "tmp", "two.txt")));
  assert.match(out, /\[tier-gate\] Tier policy crossed/, "the counter must still fire on real multi-file work");
  assert.match(out, /touch 2 files/);
});
