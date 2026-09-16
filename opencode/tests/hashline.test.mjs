// Contract tests for hashline.js. Same pattern as guard-rails.test.mjs:
// pathToFileURL import, poke the factory and helper properties directly.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLUGIN = path.join(ROOT, "opencode", "plugin", "hashline.js");

const mod = await import(pathToFileURL(PLUGIN).href);
const { Hashline } = mod;
const DICT_ALPHABET = "ZPMQVRWSNKTXJBYH";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hashline-"));
}

test("export shape: one function export, helpers are properties", () => {
  assert.equal(typeof Hashline, "function");
  assert.equal(typeof Hashline.computeLineHash, "function");
  assert.equal(typeof Hashline.validateLineRef, "function");
  const fns = Object.keys(mod).filter((k) => typeof mod[k] === "function");
  assert.deepEqual(fns, ["Hashline"]);
});

test("computeLineHash: deterministic, 2 chars from dict alphabet", () => {
  const h1 = Hashline.computeLineHash(3, "hello world");
  const h2 = Hashline.computeLineHash(3, "hello world");
  assert.equal(h1, h2);
  assert.equal(h1.length, 2);
  for (const ch of h1) assert.ok(DICT_ALPHABET.includes(ch));
  assert.equal(Hashline.HASHLINE_DICT.length, 256);
  // every dict entry is 2 chars of the alphabet, all distinct
  assert.equal(new Set(Hashline.HASHLINE_DICT).size, 256);
});

test("seed rule: identical blank lines at different line numbers differ", () => {
  // 3-byte blank lines collide in the 256-entry dict at low seeds (verified
  // against the reference impl); the property holds once seeds diverge enough.
  const pair = (a, b) => Hashline.computeLineHash(a, "   ") !== Hashline.computeLineHash(b, "   ");
  assert.ok([2, 3, 5, 7, 11].some((n) => pair(1, n)));
});

test("seed rule: content line hash independent of line number", () => {
  assert.equal(Hashline.computeLineHash(7, "const x = 1;"), Hashline.computeLineHash(99, "const x = 1;"));
});

test("xxHash32 matches reference test vectors", () => {
  assert.equal(Hashline.xxHash32("", 0), 0x02cc5d05);
  assert.equal(Hashline.xxHash32("a", 0), 0x550d7456);
  assert.equal(Hashline.xxHash32("abc", 0), 0x32d153ff);
  assert.equal(Hashline.xxHash32("message digest", 0), 0x7c948494);
});

test("CRLF vs LF same hash; trailing whitespace ignored", () => {
  assert.equal(Hashline.computeLineHash(5, "foo\r\nbar".split("\r\n")[0]), Hashline.computeLineHash(5, "foo"));
  assert.equal(Hashline.computeLineHash(5, "foo"), Hashline.computeLineHash(5, "foo   \t"));
});

test("read tagger: rewrites, skips truncated, idempotent", async () => {
  const plugin = await Hashline({ directory: os.tmpdir() });
  assert.ok(plugin["tool.execute.after"]);
  const tag = (text) => {
    const out = { output: text };
    plugin["tool.execute.after"]({ tool: "read" }, out);
    return out.output;
  };
  const output = "1: alpha\n12: foo\n13: bar baz\n14: tail... (line truncated to 2000 chars)\n";
  const tagged = tag(output);
  const lines = tagged.split("\n");
  assert.match(lines[1], /^12#[ZPMQVRWSNKTXJBYH]{2}\|foo$/);
  assert.match(lines[2], /^13#[ZPMQVRWSNKTXJBYH]{2}\|bar baz$/);
  // truncated line untouched
  assert.equal(lines[3], "14: tail... (line truncated to 2000 chars)");
  // idempotent
  assert.equal(tag(tagged), tagged);
  // untouched input stays untouched
  assert.equal(tag("no numbered lines here"), "no numbered lines here");
});

test("transformReadOutput respects <content> blocks", async () => {
  const output = "header line\n<content>\n1: alpha\n</content>\nfooter";
  const tagged = Hashline.transformReadOutput(output);
  const lines = tagged.split("\n");
  assert.equal(lines[0], "header line");
  assert.match(lines[2], /^1#[ZPMQVRWSNKTXJBYH]{2}\|alpha$/);
  assert.equal(lines[3], "</content>");
});

test("validateLineRef: accepts correct, rejects OOB and wrong hash", () => {
  const lines = ["alpha", "beta", "gamma"];
  const hash = Hashline.computeLineHash(2, "beta");
  assert.doesNotThrow(() => Hashline.validateLineRef(lines, `2#${hash}`));
  assert.throws(() => Hashline.validateLineRef(lines, "99#ZZ"), /out of bounds/);
  assert.throws(() => Hashline.validateLineRef(lines, `2#${hash === "QQ" ? "WW" : "QQ"}`), Hashline.HashlineMismatchError);
  // normalizer: whitespace, >>> marker, +, -, |content tail
  assert.doesNotThrow(() => Hashline.validateLineRef(lines, `  >>> 2#${hash}  `));
  assert.doesNotThrow(() => Hashline.validateLineRef(lines, `-2#${hash}|beta`));
});

test("mismatch message contains recomputed anchor + >>> marker", () => {
  const lines = ["alpha", "beta", "gamma", "delta"];
  try {
    Hashline.validateLineRef(lines, "2#ZZ");
    assert.fail("expected throw");
  } catch (e) {
    const fresh = Hashline.computeLineHash(2, "beta");
    assert.match(e.message, /changed since last read/);
    assert.match(e.message, new RegExp(`>>> 2#${fresh}\\|beta`));
    // ±2 context lines present
    assert.match(e.message, /0?1#/);
    assert.match(e.message, /4#/);
  }
});

test("two-edit application bottom-up against original snapshot", () => {
  const text = ["one", "two", "three", "four", "five"].join("\n");
  const edits = [
    { op: "replace", pos: "1#WW", lines: ["ONE"] },
    { op: "replace", pos: "4#WW", end: "5#WW", lines: ["FOUR", "FIVE"] },
  ];
  const hash1 = Hashline.computeLineHash(1, "one");
  const hash4 = Hashline.computeLineHash(4, "four");
  const hash5 = Hashline.computeLineHash(5, "five");
  const result = Hashline.validateAllEdits(text, [
    { op: "replace", pos: `1#${hash1}`, lines: ["ONE"] },
    { op: "replace", pos: `4#${hash4}`, end: `5#${Hashline.computeLineHash(5, "five")}`, lines: ["FOURX", "FIVEX"] },
  ]);
  assert.deepEqual(result.split("\n"), ["ONE", "two", "three", "FOURX", "FIVEX"]);
});

test("overlapping ranges rejected", () => {
  const text = ["a", "b", "c", "d"].join("\n");
  const refs = (i) => `${i}#${Hashline.computeLineHash(i, text.split("\n")[i - 1])}`;
  assert.throws(
    () => Hashline.validateAllEdits(text, [
      { op: "replace", pos: refs(1), end: refs(2), lines: null },
      { op: "replace", pos: refs(2), end: refs(3), lines: null },
    ]),
    /Overlap/
  );
});

test("stale edit rejected with repair payload, file not written", async () => {
  const dir = makeTempDir();
  const file = path.join(dir, "f.txt");
  fs.writeFileSync(file, "alpha\nbeta\ngamma\n", "utf8");
  const hash = Hashline.computeLineHash(2, "beta");
  const plugin = await Hashline({ directory: dir });
  const tool = plugin.tool.edit;
  // external modification after refs were computed
  fs.writeFileSync(file, "alpha\nBETA-CHANGED\ngamma\n", "utf8");
  const result = await tool.execute({ filePath: file, edits: [{ op: "replace", pos: `2#${hash}`, lines: ["xx"] }] }, { directory: dir });
  assert.match(result, /rejected/);
  assert.match(result, /changed since last read/);
  assert.match(result, new RegExp(`>>> 2#${Hashline.computeLineHash(2, "BETA-CHANGED")}\\|BETA-CHANGED`));
  assert.equal(fs.readFileSync(file, "utf8"), "alpha\nBETA-CHANGED\ngamma\n");
});

test("CRLF + BOM round trip preserved through edit", async () => {
  const dir = makeTempDir();
  const file = path.join(dir, "crlf.txt");
  const original = "\ufeffalpha\r\nbeta\r\ngamma\r\n";
  fs.writeFileSync(file, original, "utf8");
  const plugin = await Hashline({ directory: dir });
  const tool = plugin.tool.edit;
  const hash = Hashline.computeLineHash(2, "beta");
  const result = await tool.execute({ filePath: file, edits: [{ op: "replace", pos: `2#${hash}`, lines: ["BETA2"] }] }, { directory: dir });
  assert.match(result, /applied/);
  const after = fs.readFileSync(file, "utf8");
  assert.ok(after.startsWith("\ufeff"));
  assert.ok(after.includes("\r\n"));
  assert.equal(after.replace(/\r/g, ""), "\ufeffalpha\nBETA2\ngamma\n");
});

test("lines: null deletes exactly the consumed range", async () => {
  const dir = makeTempDir();
  const file = path.join(dir, "del.txt");
  fs.writeFileSync(file, "a\nb\nc\nd\n", "utf8");
  const plugin = await Hashline({ directory: dir });
  const h = (i) => `${i}#${Hashline.computeLineHash(i, ["a", "b", "c", "d"][i - 1])}`;
  const result = await plugin.tool.edit.execute(
    { filePath: file, edits: [{ op: "replace", pos: h(2), end: h(3), lines: null }] },
    { directory: dir }
  );
  assert.match(result, /applied/);
  assert.equal(fs.readFileSync(file, "utf8"), "a\nd\n");
});

test("fail-open: hooks survive garbage input without throwing", async () => {
  const plugin = await Hashline({ directory: os.tmpdir() });
  await assert.doesNotReject(() => plugin["tool.execute.after"](undefined, undefined));
  await assert.doesNotReject(() => plugin["tool.execute.after"]({ tool: "read" }, { output: 42 }));
  await assert.doesNotReject(() => plugin["tool.execute.after"]({ tool: "read" }, { output: null }));
  await assert.doesNotReject(() =>
    plugin.tool.edit.execute(
      { filePath: path.join(makeTempDir(), "missing.txt"), edits: [{ op: "replace", pos: "1#ZZ", lines: null }] },
      { directory: os.tmpdir() }
    )
  );
});