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
  assert.match(gate, /const RECON_THRESHOLD = 25;/);
  assert.match(AGENTS_FLAT, /25 read\/grep\/glob\/webfetch or non-write bash calls/);
});

test("tier-gate never blocks — it injects a notice into the tool result", () => {
  assert.match(gate, /tool\.execute\.after/);
  assert.ok(!/"tool\.execute\.before"/.test(gate), "gate must not block writes");
});

test("tier-gate announces at most once per session, on BOTH sides", () => {
  assert.match(gate, /if \(state\.announced\) return;/);
  assert.match(gate, /state\.announced = true;/);
  assert.match(gate, /if \(state\.reconAnnounced\) return;/);
  assert.match(gate, /state\.reconAnnounced = true;/);
});

// The read side exists because the write side structurally could not see the spend:
// WRITERS contains no read tool, so a session can read all day and never trip it.
// Delegation ZEROES the counter rather than pausing it - that is the behaviour being
// asked for, so a session that keeps handing work out must never accumulate toward
// the notice at all.
test("tier-gate counts recon and resets the count on delegation", () => {
  assert.match(gate, /const READERS = new Set\(/);
  assert.match(gate, /const DELEGATORS = new Set\(\["task", "team_task_create"\]\);/);
  assert.match(gate, /state\.recon = 0;/);
  assert.match(gate, /state\.recon \+= 1;/);
});

// codegraph_explore is the move AGENTS.md recommends FIRST. A gate that fires on the
// behaviour it wants teaches the opposite of its own lesson, so the exemption is part
// of the contract, not an oversight to be tidied up later.
test("codegraph_explore is exempt from the recon counter", () => {
  const readers = gate.match(/const READERS = new Set\(\[[^\]]*\]\)/)?.[0] ?? "";
  assert.ok(readers, "READERS set must exist");
  assert.ok(!/codegraph/.test(readers), "codegraph_explore must stay out of READERS");
  assert.match(AGENTS_FLAT, /`codegraph_explore` is deliberately exempt/);
});

test("AGENTS.md pins sonnet as an escalation tier, not a default", () => {
  assert.match(AGENTS_FLAT, /escalation tier, not a default/);
});

// Measured 2026-09-19: `unspecified-high` is BOTH the sonnet escalation tier and 2 of
// review-work's 5 seats, and omo compiles those slot names into dist - so no config can
// split them. Cheapening it to save on builds silently buys a cheaper review too.
test("AGENTS.md records the unspecified-high coupling to review-work", () => {
  assert.match(AGENTS_FLAT, /2 of `review-work`'s 5 seats/);
  assert.match(AGENTS_FLAT, /compiled into omo's dist/);
});

// The Claude Code port: same contract, PreToolUse-hook shape. DORMANT since 2026-09-19
// (this box runs opencode only; nothing loads PreToolUse hooks), but still unit-tested as
// pure functions below, so its constants must not drift from the doc.
const claudeGate = fs.readFileSync(path.join(ROOT, "hooks", "tier-gate.js"), "utf8");

// The read side went into the LIVE plugin only. That asymmetry is a decision, not drift:
// hooks/ has no loader on this box, so porting it forward would be unrunnable code
// carrying an unrunnable threshold. Pinned so the next reader sees a choice rather than
// an oversight - if the Claude lane is ever revived, port it and change this test.
test("the read-side gate is opencode-only, by decision", () => {
  assert.match(gate, /const RECON_THRESHOLD = 25;/);
  assert.ok(
    !/RECON_THRESHOLD/.test(claudeGate),
    "hooks/tier-gate.js is dormant - adding the read side there is unrunnable code, not parity"
  );
  assert.match(AGENTS_FLAT, /`hooks\/` \(every file a `PreToolUse`\/`PostToolUse` hook\)/);
});

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

// Reads stopped being simply "ignored" on 2026-09-19. They are ignored by the WRITE
// counters - a read must never look like a touched file - and counted by the recon
// counter. Both halves matter: the first is why a read+edit pair stays quiet, the
// second is the reason the read side exists at all.
test("reads never feed the write-side file counter; state never leaks across sessions", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-gate-test-"));
  const hook = await hookFor(dir);
  const out = fakeOutput();
  await hook({ tool: "read", sessionID: "s-iso1", callID: "c1", args: { filePath: path.join(dir, "x.js") } }, out);
  assert.equal(out.output, "ok");

  // A read plus ONE edit must stay quiet. If the read had counted as a touched file the
  // pair would cross FILE_THRESHOLD, and the gate would fire on a one-file change.
  const o = fakeOutput();
  await hook({ tool: "edit", sessionID: "s-iso1", callID: "c2", args: { filePath: path.join(dir, "w.js"), newString: "x" } }, o);
  assert.equal(o.output, "ok", "one read + one edit is a tweak, not a 2-file campaign");

  // one file in session A, the same file in session B — neither crosses alone
  for (const s of ["s-isoA", "s-isoB"]) {
    const o2 = fakeOutput();
    await hook({ tool: "edit", sessionID: s, callID: "a.js", args: { filePath: path.join(dir, "a.js"), newString: "x" } }, o2);
    assert.equal(o2.output, "ok", `${s}/a.js should stay quiet`);
  }
});

test("the 25th recon call fires, the 24th does not, and it fires only once", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-gate-test-"));
  const hook = await hookFor(dir);

  for (let i = 1; i <= 24; i++) {
    const o = fakeOutput();
    await hook({ tool: "read", sessionID: "s-recon", callID: `c${i}`, args: { filePath: `/x/${i}.js` } }, o);
    assert.equal(o.output, "ok", `read #${i} should stay quiet`);
  }
  const o25 = fakeOutput();
  await hook({ tool: "read", sessionID: "s-recon", callID: "c25", args: { filePath: "/x/25.js" } }, o25);
  assert.match(o25.output, /\[tier-gate\] Recon budget crossed: 25 read\/grep\/bash calls/);

  const o26 = fakeOutput();
  await hook({ tool: "read", sessionID: "s-recon", callID: "c26", args: {} }, o26);
  assert.equal(o26.output, "ok", "once per session, same restraint as the write side");
});

test("delegating resets the count, so a delegating session never sees the notice", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-gate-test-"));
  const hook = await hookFor(dir);
  for (let i = 1; i <= 60; i++) {
    const o = fakeOutput();
    await hook({ tool: "read", sessionID: "s-deleg", callID: `c${i}`, args: {} }, o);
    assert.equal(o.output, "ok", `read #${i} fired despite regular delegation`);
    if (i % 10 === 0) {
      await hook({ tool: "task", sessionID: "s-deleg", callID: `t${i}`, args: {} }, fakeOutput());
    }
  }
});

test("non-write bash is recon; write-shaped bash is not", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-gate-test-"));
  const hook = await hookFor(dir);

  let fired = null;
  for (let i = 1; i <= 25; i++) {
    const o = fakeOutput();
    await hook({ tool: "bash", sessionID: "s-bashrecon", callID: `c${i}`, args: { command: "ls -la /tmp" } }, o);
    if (o.output !== "ok" && fired === null) fired = { i, text: String(o.output) };
  }
  assert.equal(fired?.i, 25, "read-shaped bash must reach the recon threshold");
  assert.match(fired.text, /Recon budget crossed/);

  // A write-shaped bash routes to the WRITE side instead: two distinct redirect targets
  // cross FILE_THRESHOLD long before 25 calls, and the notice must not say "recon".
  let w = null;
  for (let i = 1; i <= 5; i++) {
    const o = fakeOutput();
    await hook({ tool: "bash", sessionID: "s-bashwrite", callID: `c${i}`, args: { command: `echo hi > /tmp/f${i}.txt` } }, o);
    if (o.output !== "ok" && w === null) w = { i, text: String(o.output) };
  }
  assert.equal(w?.i, 2, "two distinct redirect targets cross FILE_THRESHOLD");
  assert.match(w.text, /Tier policy crossed/);
  assert.ok(!/Recon budget/.test(w.text), "a bash write must not be counted as recon");
});

test("a state file predating the recon counter does not poison the count", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier-gate-test-"));
  // Exactly what an older session left behind: no recon, no reconAnnounced. `undefined + 1`
  // is NaN, which compares false against every threshold and would silently mute the read
  // side for the whole life of that session.
  const { default: nodeCrypto } = await import("node:crypto");
  const stateDir = path.join(os.tmpdir(), "opencode-tier-gate");
  fs.mkdirSync(stateDir, { recursive: true });
  const dirKey = nodeCrypto.createHash("sha256").update(dir).digest("hex").slice(0, 16);
  fs.writeFileSync(
    path.join(stateDir, `s-legacy-${dirKey}.json`),
    JSON.stringify({ announced: false, files: [] })
  );

  const hook = await hookFor(dir);
  let fired = null;
  for (let i = 1; i <= 25; i++) {
    const o = fakeOutput();
    await hook({ tool: "read", sessionID: "s-legacy", callID: `c${i}`, args: {} }, o);
    if (o.output !== "ok" && fired === null) fired = i;
  }
  assert.equal(fired, 25, "legacy state must normalize to recon: 0, never NaN");
});

// ---------------------------------------------------------------------------
// 2b. The build-review team spec — the cheap-build / expensive-review loop
// ---------------------------------------------------------------------------
// The spec is the thing that actually enforces "workers measure, the lead judges".
// Verified 2026-09-19 against a real `team_create`: all four members resolved to
// ollama models (quick -> glm-5.3-flash, deep -> deepseek-v4.1-flash).
const TEAM_SPEC = path.join(ROOT, "omo", "teams", "build-review", "config.json");

test("the build-review spec parses and every worker is a cheap category", () => {
  const spec = JSON.parse(fs.readFileSync(TEAM_SPEC, "utf8"));
  assert.equal(spec.name, "build-review");
  // omo caps a team at 8 members and runs 4 in parallel; the spec is written to the
  // parallel width so no worker sits queued behind another.
  assert.equal(spec.members.length, 4);
  assert.deepEqual(
    spec.members.map((m) => m.category).sort(),
    ["deep", "quick", "quick", "quick"],
    "the expensive lane is the LEAD, which reviews - never a member"
  );
  for (const m of spec.members) {
    assert.match(m.name, /^[a-z0-9-]+$/, "omo requires lowercase-hyphen member names");
    assert.match(
      m.prompt,
      /lead owns the verdict/,
      `${m.name} must not be allowed to grade its own work`
    );
    assert.match(m.prompt, /could NOT perform/, `${m.name} must report skipped checks`);
  }
});

// Measured 2026-09-19: omo's on-disk team loader does NOT follow a symlinked team
// directory - it reported "not found" for a path that resolved and held valid JSON.
// Every other config in this repo is symlinked, so the exception needs a guard.
test("sync.sh copies team specs rather than symlinking them", () => {
  const sync = fs.readFileSync(path.join(ROOT, "sync.sh"), "utf8");
  assert.match(sync, /cp -f "\$spec\/config\.json"/);
  assert.ok(
    !/ln -s[^\n]*omo\/teams/.test(sync),
    "omo's loader does not follow a symlinked team dir - this must stay a copy"
  );
});

// The two loaders disagree about symlinks and BOTH were tested 2026-09-19: the skill
// loader resolved a symlinked skill dir (opencode debug skill reported it at its
// ~/.config path), the team loader above did not. Pinning the asymmetry stops a future
// tidy-up from "making them consistent" and silently unloading every skill.
test("sync.sh symlinks skills, the opposite of how it installs team specs", () => {
  const sync = fs.readFileSync(path.join(ROOT, "sync.sh"), "utf8");
  assert.match(sync, /ln -sfn "\$REPO\/skills\/\$s"/);
  assert.match(sync, /OC_SKILL="\$HOME\/\.config\/opencode\/skill"/);
  // The install must also SHRINK. Without a prune, dropping a name from SKILLS leaves
  // that skill loaded forever - measured 2026-09-19 when caveman and caveman-commit
  // were dropped and stayed in `opencode debug skill` until swept by hand.
  assert.match(sync, /pruned=\$\(\(pruned \+ 1\)\)/);
  assert.match(sync, /case "\$target" in "\$REPO\/skills\/"\*\)/,
    "prune must only remove links into THIS repo - another tool's skills are not ours");
});

// A keyword row naming a skill that no loader can reach is the exact failure this
// session spent several commits removing. The table and the install list are one
// contract: edit either and this fails until both agree.
test("every skill AGENTS.md names is installed by sync.sh and exists in skills/", () => {
  const sync = fs.readFileSync(path.join(ROOT, "sync.sh"), "utf8");
  const declared = (sync.match(/^SKILLS="([^"]+)"/m)?.[1] ?? "").split(/\s+/).filter(Boolean);
  assert.ok(declared.length >= 6, "SKILLS list must be populated");

  for (const s of declared) {
    assert.ok(
      fs.existsSync(path.join(ROOT, "skills", s, "SKILL.md")),
      `sync.sh installs ${s} but skills/${s}/SKILL.md does not exist`
    );
  }

  // Backtick-quoted skill names in the keyword table rows must all be installed.
  const table = AGENTS_MD.split("## Magic keywords")[1]?.split("###")[0] ?? "";
  const named = [...table.matchAll(/^\|[^|]*\|\s*`([a-z0-9-]+)`/gm)].map((m) => m[1]);
  // Floor, not a count: the guard exists so a regex that silently matches nothing reads
  // as a pass. It was >= 5 until caveman and caveman-commit were cut on 2026-09-19, and
  // it failed on the cut - which is the check doing its job. Lower it when a row goes.
  assert.ok(named.length >= 4, "keyword table must have rows");
  for (const n of named) {
    assert.ok(declared.includes(n), `AGENTS.md triggers \`${n}\` but sync.sh never installs it`);
  }
});

// Installing all 42 would quadruple the skill-listing cost for skills nothing routes to.
test("AGENTS.md records why the install is a subset, not the whole skills/ dir", () => {
  assert.match(AGENTS_FLAT, /the six cost ~630 tokens, all 42 cost ~5,100/);
  assert.match(AGENTS_FLAT, /the skill loader follows them; the team loader does not/);
});

// chisle is vendored by hand into ~/.config/opencode/plugins/ and is DEVICE-LOCAL, so
// nothing here asserts against that path - the three live-settings tests deleted on
// 2026-09-19 are the precedent: a contract pinned to per-box state can only go red for
// a reason nobody acts on. What is pinnable is repo-side: the doc points at a measuring
// script, and that script has to exist. A doc naming a tool that is not there is the
// dangling-pointer failure this session spent several commits deleting.
test("AGENTS.md's chisle measurement pointer resolves", () => {
  assert.match(AGENTS_FLAT, /bun bin\/chisle-savings\.mjs/);
  assert.ok(
    fs.existsSync(path.join(ROOT, "bin", "chisle-savings.mjs")),
    "AGENTS.md sends the reader to bin/chisle-savings.mjs - it must exist"
  );
});

// The reason --stats is not the instrument is a fact about someone else's code, so it
// is recorded rather than tested: chisle 3.5.0 records savings on the Copilot and
// Claude paths only. If a later version wires the opencode path, this note and the
// script both become redundant - check before assuming they are still needed.
test("AGENTS.md records why chisle --stats is not the measurement", () => {
  assert.match(AGENTS_FLAT, /`npx chisle --stats` does not work for this install shape/);
  assert.match(AGENTS_FLAT, /Only the plugin was installed, never chisle's ruleset/);
});

// caveman was always-on under CLAUDE.md, briefly installed on 2026-09-19, then cut the
// same day on a measurement. Without the number written down the next reader restores
// it on the strength of the word "compression", which is what the benchmark refutes.
// caveman-commit went for an unrelated reason: it duplicated and CONTRADICTED Commit
// conduct, so the check is that the rules it uniquely had now live there instead.
test("AGENTS.md records why both caveman skills were cut, with the numbers", () => {
  assert.match(AGENTS_FLAT, /`caveman` and `caveman-commit` were removed from the install/);
  assert.match(AGENTS_FLAT, /\+7% tokens, \+3% cost and \+2% time/);
  assert.match(AGENTS_FLAT, /not a disinterested source/);
  assert.match(AGENTS_FLAT, /`caveman-commit` is not a compression skill at all/);
});

// The three rules caveman-commit uniquely had were folded in rather than lost. If they
// vanish, the cut silently became a regression instead of a consolidation.
test("Commit conduct absorbed the rules caveman-commit uniquely carried", () => {
  const commit = AGENTS_MD.split("## Commit conduct")[1] ?? "";
  const flat = commit.replace(/\s+/g, " ");
  assert.match(flat, /imperative mood/);
  assert.match(flat, /AI attribution of any kind/);
  assert.match(flat, /restatement of the filename when the scope already names it/);
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
