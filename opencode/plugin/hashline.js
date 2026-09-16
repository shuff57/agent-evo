// Hash-anchored read/edit for opencode, ported from omo-dev hashline-core.
//
// Every read output line gets a stable `LINE#HASH|` tag (xxHash32 over the
// line, 2 chars from the 16-nibble alphabet); the shadowed `edit` tool
// validates those tags before applying and, on mismatch, returns the fresh
// anchors in the rejection itself — a stale edit retry costs one round trip,
// not a re-read.
//
// Export shape is deliberate: opencode calls EVERY exported function in a
// plugin file as a plugin factory, so exactly one export (`Hashline`) and all
// helpers ride as its properties (see inbox.js for the measured failure).
const NIBBLE_STR = "ZPMQVRWSNKTXJBYH";
const HASHLINE_DICT = Array.from({ length: 256 }, (_, i) => `${NIBBLE_STR[i >>> 4]}${NIBBLE_STR[i & 0x0f]}`);
const REF_PATTERN = /^([0-9]+)#([ZPMQVRWSNKTXJBYH]{2})$/;
const REF_EXTRACT_PATTERN = /([0-9]+#[ZPMQVRWSNKTXJBYH]{2})/;
const COLON_READ_LINE = /^\s*(\d+): ?(.*)$/;
const TRUNCATION_SUFFIX = "... (line truncated to 2000 chars)";
const MISMATCH_CONTEXT = 2;
const SIGNIFICANT = /[\p{L}\p{N}]/u;
const encoder = new TextEncoder();

const PRIME32_1 = 0x9e3779b1;
const PRIME32_2 = 0x85ebca77;
const PRIME32_3 = 0xc2b2ae3d;
const PRIME32_4 = 0x27d4eb2f;
const PRIME32_5 = 0x165667b1;

function rotateLeft32(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function readUint32LE(input, offset) {
  return (
    ((input[offset] ?? 0) |
      ((input[offset + 1] ?? 0) << 8) |
      ((input[offset + 2] ?? 0) << 16) |
      ((input[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

function round32(accumulator, value) {
  const added = (accumulator + Math.imul(value, PRIME32_2)) >>> 0;
  return Math.imul(rotateLeft32(added, 13), PRIME32_1) >>> 0;
}

// Pure-JS xxHash32 fallback path from omo-dev xxhash32.ts (no Bun fast path
// here — opencode runs on node; the fallback is byte-compatible anyway).
function xxHash32(input, seed) {
  const input2 = encoder.encode(input);
  const length = input2.length;
  let offset = 0;
  let hash;
  if (length >= 16) {
    const limit = length - 16;
    let value1 = (seed + PRIME32_1 + PRIME32_2) >>> 0;
    let value2 = (seed + PRIME32_2) >>> 0;
    let value3 = seed >>> 0;
    let value4 = (seed - PRIME32_1) >>> 0;
    while (offset <= limit) {
      value1 = round32(value1, readUint32LE(input2, offset)); offset += 4;
      value2 = round32(value2, readUint32LE(input2, offset)); offset += 4;
      value3 = round32(value3, readUint32LE(input2, offset)); offset += 4;
      value4 = round32(value4, readUint32LE(input2, offset)); offset += 4;
    }
    hash = (rotateLeft32(value1, 1) + rotateLeft32(value2, 7)) >>> 0;
    hash = (hash + rotateLeft32(value3, 12)) >>> 0;
    hash = (hash + rotateLeft32(value4, 18)) >>> 0;
  } else {
    hash = (seed + PRIME32_5) >>> 0;
  }
  hash = (hash + length) >>> 0;
  while (offset + 4 <= length) {
    hash = (hash + Math.imul(readUint32LE(input2, offset), PRIME32_3)) >>> 0;
    hash = Math.imul(rotateLeft32(hash, 17), PRIME32_4) >>> 0;
    offset += 4;
  }
  while (offset < length) {
    hash = (hash + Math.imul(input2[offset] ?? 0, PRIME32_5)) >>> 0;
    hash = Math.imul(rotateLeft32(hash, 11), PRIME32_1) >>> 0;
    offset += 1;
  }
  hash = (hash ^ (hash >>> 15)) >>> 0;
  hash = Math.imul(hash, PRIME32_2) >>> 0;
  hash = (hash ^ (hash >>> 13)) >>> 0;
  hash = Math.imul(hash, PRIME32_3) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

function computeNormalizedLineHash(lineNumber, normalized) {
  const seed = SIGNIFICANT.test(normalized) ? 0 : lineNumber;
  return HASHLINE_DICT[xxHash32(normalized, seed) % 256];
}

// trimEnd variant: current format.
function computeLineHash(lineNumber, content) {
  return computeNormalizedLineHash(lineNumber, content.replace(/\r/g, "").trimEnd());
}

// Legacy variant (all whitespace stripped) — still accepted on validation.
function computeLegacyLineHash(lineNumber, content) {
  return computeNormalizedLineHash(lineNumber, content.replace(/\r/g, "").replace(/\s+/g, ""));
}

function isCompatibleLineHash(line, content, hash) {
  return computeLineHash(line, content) === hash || computeLegacyLineHash(line, content) === hash;
}

function normalizeLineRef(ref) {
  const original = ref.trim();
  let trimmed = original
    .replace(/^(?:>>>|[+-])\s*/, "")
    .replace(/\s*#\s*/, "#")
    .replace(/\|.*$/, "")
    .trim();
  if (REF_PATTERN.test(trimmed)) return trimmed;
  const extracted = trimmed.match(REF_EXTRACT_PATTERN);
  if (extracted) return extracted[1];
  return original;
}

function parseLineRef(ref) {
  const normalized = normalizeLineRef(ref);
  const match = normalized.match(REF_PATTERN);
  if (match) return { line: Number.parseInt(match[1], 10), hash: match[2] };
  throw new Error(
    `Invalid line reference format: "${ref}". Expected format: "{line_number}#{hash_id}"`
  );
}

// The repair payload IS the mechanism: a rejected edit carries fresh anchors
// so the retry needs no re-read. >>> marks the changed line.
class HashlineMismatchError extends Error {
  constructor(mismatches, fileLines) {
    super(formatMismatch(mismatches, fileLines));
    this.name = "HashlineMismatchError";
  }
}

function formatMismatch(mismatches, fileLines) {
  const byLine = new Map(mismatches.map((m) => [m.line, m]));
  const display = new Set();
  for (const m of mismatches) {
    for (let i = Math.max(1, m.line - MISMATCH_CONTEXT); i <= Math.min(fileLines.length, m.line + MISMATCH_CONTEXT); i++) {
      display.add(i);
    }
  }
  const out = [
    `${mismatches.length} line${mismatches.length > 1 ? "s have" : " has"} changed since last read. ` +
      "Use updated {line_number}#{hash_id} references below (>>> marks changed lines).",
    "",
  ];
  let previous = -1;
  for (const line of [...display].sort((a, b) => a - b)) {
    if (previous !== -1 && line > previous + 1) out.push("    ...");
    previous = line;
    const content = fileLines[line - 1] ?? "";
    const prefix = `${line}#${computeLineHash(line, content)}|${content}`;
    out.push(byLine.has(line) ? `>>> ${prefix}` : `    ${prefix}`);
  }
  return out.join("\n");
}

function validateLineRef(lines, ref) {
  const { line, hash } = parseLineRef(ref);
  if (line < 1 || line > lines.length) {
    throw new Error(`Line number ${line} out of bounds. File has ${lines.length} lines.`);
  }
  if (!isCompatibleLineHash(line, lines[line - 1], hash)) {
    throw new HashlineMismatchError([{ line, expected: hash }], lines);
  }
}

function validateLineRefs(lines, refs) {
  const mismatches = [];
  for (const ref of refs) {
    const { line, hash } = parseLineRef(ref);
    if (line < 1 || line > lines.length) {
      throw new Error(`Line number ${line} out of bounds (file has ${lines.length} lines)`);
    }
    if (!isCompatibleLineHash(line, lines[line - 1], hash)) {
      mismatches.push({ line, expected: hash });
    }
  }
  if (mismatches.length > 0) throw new HashlineMismatchError(mismatches, lines);
}

// Validate EVERY ref against the ORIGINAL snapshot before applying ANY edit;
// apply bottom-up so earlier line numbers stay valid. Overlapping ranges are
// rejected up front rather than silently producing doubled content.
function validateAllEdits(fileText, edits) {
  const lines = fileText.split("\n");
  const ranges = [];
  for (const edit of edits) {
    const pos = parseLineRef(edit.pos);
    const end = edit.end ? parseLineRef(edit.end) : pos;
    if (pos.line < 1 || pos.line > lines.length) {
      throw new Error(`Line number ${pos.line} out of bounds (file has ${lines.length} lines)`);
    }
    if (end.line < pos.line || end.line > lines.length) {
      throw new Error(`End line ${end.line} out of bounds (file has ${lines.length} lines)`);
    }
    ranges.push({ pos, end, edit });
  }
  const sorted = [...ranges].sort((a, b) => a.pos.line - b.pos.line);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].pos.line <= sorted[i - 1].end.line) {
      throw new Error(`Overlapping edit ranges at lines ${sorted[i].pos.line}..${sorted[i].end.line}`);
    }
  }
  validateLineRefs(lines, ranges.flatMap((r) => (r.end.line !== r.pos.line ? [refStr(r.pos), refStr(r.end)] : [refStr(r.pos)])));
  const descending = [...ranges].sort((a, b) => b.pos.line - a.pos.line);
  for (const r of descending) {
    const replacement = r.edit.lines == null ? [] : Array.isArray(r.edit.lines) ? [...r.edit.lines] : [r.edit.lines];
    lines.splice(r.pos.line - 1, r.end.line - r.pos.line + 1, ...replacement);
  }
  return lines.join("\n");
}

function refStr(pos) {
  return `${pos.line}#${pos.hash}`;
}

// Read tagger: rewrite `12: foo` numbered lines to `12#HH|foo`. Only lines
// inside <content>/<file> blocks when those tags exist; a truncated line has
// no stable hash and must never be referenceable.
function transformReadOutput(output) {
  if (!output) return output;
  if (process.env.HASHLINE_DISABLE === "1") return output;
  const lines = output.split("\n");
  const numbered = lines.filter((l) => COLON_READ_LINE.test(l));
  if (numbered.length === 0) return output;
  if (numbered.some((l) => /^\s*\d+#[ZPMQVRWSNKTXJBYH]{2}\|/.test(l))) return output; // idempotent
  const transform = (text) =>
    text
      .split("\n")
      .map((line) => {
        const m = COLON_READ_LINE.exec(line);
        if (!m) return line;
        const content = m[2];
        if (content.endsWith(TRUNCATION_SUFFIX)) return line;
        return `${m[1]}#${computeLineHash(Number.parseInt(m[1], 10), content)}|${content}`;
      })
      .join("\n");
  const contentStart = lines.findIndex((l) => l.startsWith("<content>"));
  const fileStart = lines.findIndex((l) => l.startsWith("<file>"));
  const openIdx = contentStart !== -1 ? contentStart : fileStart;
  if (openIdx === -1) return transform(output);
  const openTag = contentStart !== -1 ? "<content>" : "<file>";
  const closeTag = contentStart !== -1 ? "</content>" : "</file>";
  const closeIdx = lines.indexOf(closeTag, openIdx + 1);
  if (closeIdx === -1) return transform(output);
  return [
    ...lines.slice(0, openIdx + 1),
    transform(lines.slice(openIdx + 1, closeIdx).join("\n")),
    ...lines.slice(closeIdx),
  ].join("\n");
}

// Preserve CRLF and BOM across an edit; edits operate on LF-normalized lines
// and the original ending/BOM is restored on write.
function loadFileText(raw) {
  const hasBom = raw.charCodeAt(0) === 0xfeff;
  const text = hasBom ? raw.slice(1) : raw;
  const crlf = text.includes("\r\n");
  return { hasBom, crlf, text: text.replace(/\r\n/g, "\n") };
}

function storeFileText(loaded, text) {
  const normalized = loaded.crlf ? text.replace(/\n/g, "\r\n") : text;
  return (loaded.hasBom ? "\ufeff" : "") + normalized;
}

function resolveEditArgs(edits) {
  if (!Array.isArray(edits)) throw new Error("edits must be an array");
  for (const edit of edits) {
    if (!edit || edit.op !== "replace" || typeof edit.pos !== "string") {
      throw new Error('Each edit must be { op: "replace", pos, end?, lines }');
    }
  }
  return edits;
}

async function runEdit(args) {
  const filePath = String(args.filePath ?? "");
  const edits = resolveEditArgs(args.edits);
  let raw;
  try {
    raw = await import("node:fs/promises").then((fs) => fs.readFile(filePath, "utf8"));
  } catch (error) {
    return `Error: cannot read ${filePath}: ${error.message}`;
  }
  const loaded = loadFileText(raw);
  try {
    const newText = validateAllEdits(loaded.text, edits);
    await import("node:fs/promises").then((fs) => fs.writeFile(filePath, storeFileText(loaded, newText), "utf8"));
    const lineCount = newText === "" ? 0 : newText.split("\n").length;
    return `Edit applied: ${edits.length} operation${edits.length === 1 ? "" : "s"}. ${lineCount} lines written.`;
  } catch (error) {
    return `Edit rejected: ${error.message}`;
  }
}

// Prefer the SDK's tool() helper; under plain node the bare import fails, so
// fall back to the plain object shape (tool() is an identity function anyway).
async function buildEditTool() {
  const description =
    "Edit files with LINE#ID hash anchors (from read output, e.g. 12#AB). " +
    "Submit edits as [{ op: 'replace', pos: '12#AB', end?: '14#CD', lines: string[] | null }]. " +
    "All refs are validated against the original file snapshot in one call — do NOT renumber for " +
    "earlier edits; ranges must not overlap. lines: null deletes the consumed range. " +
    "On hash mismatch the tool returns fresh anchors; retry with those, no re-read needed.";
  try {
    const mod = await import("@opencode-ai/plugin");
    const z = mod.tool.schema;
    return mod.tool({
      description,
      args: {
        filePath: z.string().describe("Absolute path of the file to edit"),
        edits: z
          .array(
            z.object({
              op: z.literal("replace"),
              pos: z.string(),
              end: z.string().optional(),
              lines: z.array(z.string()).nullable().optional(),
            })
          )
          .describe("Edits applied bottom-up against the original snapshot"),
      },
      execute: async (args) => runEdit(args),
    });
  } catch {
    return {
      description,
      args: {
        filePath: { type: "string", description: "Absolute path of the file to edit" },
        edits: {
          type: "array",
          description: "Edits applied bottom-up against the original snapshot",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["replace"] },
              pos: { type: "string" },
              end: { type: "string", optional: true },
              lines: { type: "array", items: { type: "string" }, nullable: true },
            },
            required: ["op", "pos"],
          },
        },
      },
      execute: async (args) => runEdit(args),
    };
  }
}

export const Hashline = async () => {
  const editTool = await buildEditTool();
  return {
    tool: { edit: editTool },
    "tool.execute.after": async (input, output) => {
      try {
        if (input?.tool?.toLowerCase() !== "read") return;
        if (typeof output?.output !== "string") return;
        const transformed = transformReadOutput(output.output);
        output.output = transformed;
      } catch {
        // fail-open: a broken tagger must not break the read
      }
    },
  };
};

Hashline.xxHash32 = xxHash32;
Hashline.computeLineHash = computeLineHash;
Hashline.computeLegacyLineHash = computeLegacyLineHash;
Hashline.formatHashLine = (lineNumber, content) => `${lineNumber}#${computeLineHash(lineNumber, content)}|${content}`;
Hashline.normalizeLineRef = normalizeLineRef;
Hashline.parseLineRef = parseLineRef;
Hashline.validateLineRef = validateLineRef;
Hashline.validateLineRefs = validateLineRefs;
Hashline.validateAllEdits = validateAllEdits;
Hashline.transformReadOutput = transformReadOutput;
Hashline.HASHLINE_DICT = HASHLINE_DICT;
Hashline.HashlineMismatchError = HashlineMismatchError;
Hashline.loadFileText = loadFileText;
Hashline.storeFileText = storeFileText;