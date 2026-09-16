// Guard rails for opencode: five post-tool nudges ported from omo-dev.
//
// Each nudge appends a short instruction to a tool result the model is already
// reading — the same delivery channel as inbox.js, which cannot be skipped —
// when the model is visibly about to waste work: rereading truncated output,
// retrying a blind edit, re-parsing broken JSON, waiting on a dead subagent,
// or repeating one identical call past the point of usefulness. All are
// NUDGES, not blocks: fail-open by design, a thrown nudge is worse than none.
//
// State is per-plugin-instance, keyed by sessionID in closures, never at module
// level: two instances (e.g. a plugin reload mid-session) must not share
// counters, or one session's announcement would mute another's.
const TRUNCATABLE_TOOLS = new Set(["grep", "glob", "webfetch", "fetch", "task"]);
const WEB_TOOLS = new Set(["webfetch", "fetch"]);
const MARKER = "[guard-rails truncated";
const EDIT_RECOVERY_MARKER = "[edit-recovery]";
const JSON_RECOVERY_MARKER = "[json-recovery]";
const CONTEXT_MONITOR_MARKER = "[context-monitor]";
const LOOP_GUARD_MARKER = "[loop-guard]";
const MIN_CHARS = 2000;
const EDIT_TOOLS = new Set(["edit", "write", "multiedit", "patch"]);
const JSON_EXCLUDED_TOOLS = new Set(["bash", "webfetch", "fetch", "read"]);
const JSON_PATTERNS = [
  /unexpected end of json input/i,
  /json parse error/i,
  /unexpected token .*json/i,
  /syntaxerror.*json/i,
];
const EDIT_PATTERNS = [
  "oldstring not found",
  "oldstring found multiple times",
  "oldstring and newstring must be different",
  "must be different",
  "no changes to apply",
];
// Conservative floors per provider prefix; env wins. Unknown provider -> skip.
const CONTEXT_LIMITS = [
  ["anthropic", 200000],
  ["openai", 400000],
  ["google", 1048576],
  ["deepseek", 131072],
  ["ollama-cloud", 131072],
  ["openrouter", 131072],
];
const LOOP_TOOLS = new Set(["bash", "read", "grep", "glob", "edit", "write"]);

function envInt(name, fallback) {
  const raw = process.env[name];
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Returns a copy with object keys sorted recursively (arrays keep order;
// non-objects returned as-is). Ported from omo-dev background-agent
// loop-detector.ts sortObject — used to build a stable call signature.
function sortKeysDeep(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const sorted = {};
  for (const key of Object.keys(value).sort()) sorted[key] = sortKeysDeep(value[key]);
  return sorted;
}

// Keep the first cap chars, cut back to the last newline in that prefix (a
// whole-line-only output reads as one line and is cut at cap instead), append
// the marker with counts. Floor of MIN_CHARS even if env sets something tiny.
function truncateOutput(text, cap) {
  if (text.includes(MARKER)) return null; // idempotent
  if (text.length <= cap) return null;
  const max = Math.max(cap, MIN_CHARS);
  const prefix = text.slice(0, max);
  const lastNewline = prefix.lastIndexOf("\n");
  const kept = lastNewline > 0 ? prefix.slice(0, lastNewline) : prefix;
  const removedChars = text.length - kept.length;
  const removedLines = text.slice(kept.length).split("\n").length - 1;
  return {
    output:
      kept +
      `\n\n...[${"guard-rails truncated"} ${removedChars} characters / ${removedLines} lines — narrow the query or read the file directly]`,
  };
}

function resolveContextLimit(providerID) {
  const env = Number.parseInt(process.env.GUARDRAILS_CONTEXT_LIMIT, 10);
  if (Number.isFinite(env) && env > 0) return env;
  for (const [prefix, limit] of CONTEXT_LIMITS) {
    if (String(providerID ?? "").toLowerCase().startsWith(prefix)) return limit;
  }
  return null;
}

export const GuardRails = async ({ directory }) => {
  void directory; // part of the factory contract; unused here
  // Per-session closures: two plugin instances must not share counters.
  const tokenCache = new Map(); // sessionID -> { used, providerID, modelID }
  const contextAnnounced = new Set(); // sessionIDs that got the context nudge
  const loopState = new Map(); // sessionID -> { lastSig, count, announced:Set }

  const truncateToolOutput = (tool, output) => {
    if (typeof output?.output !== "string") return;
    if (!TRUNCATABLE_TOOLS.has(tool)) return;
    const cap = WEB_TOOLS.has(tool)
      ? envInt("GUARDRAILS_WEB_MAX_CHARS", 40000)
      : envInt("GUARDRAILS_MAX_CHARS", 200000);
    const result = truncateOutput(output.output, cap);
    if (result) output.output = result.output;
  };

  const cacheTokensFromEvent = (event) => {
    if (event?.type !== "message.updated") return;
    const info = event.properties?.info;
    if (info?.role !== "assistant" || !info.tokens) return;
    const sessionID = event.properties.sessionID ?? info.sessionID;
    if (!sessionID) return;
    const read = info.tokens.cache?.read ?? 0;
    tokenCache.set(sessionID, {
      used: (info.tokens.input ?? 0) + read,
      providerID: info.providerID ?? null,
      modelID: info.modelID ?? null,
    });
  };

  const announceContextUsage = (sessionID, output) => {
    const cached = tokenCache.get(sessionID);
    if (!cached || contextAnnounced.has(sessionID)) return;
    const limit = resolveContextLimit(cached.providerID);
    if (!limit) return; // unknown provider: skip silently
    const ratio = cached.used / limit;
    if (ratio < 0.7) return;
    const pct = Math.min(100, Math.max(0, ratio * 100)).toFixed(1);
    output.output +=
      `\n\n[context-monitor] Context is ~${pct}% used (${cached.used}/${limit} tokens). ` +
      "Prefer finishing the current step and writing down state over starting new exploration or large reads.";
    contextAnnounced.add(sessionID);
  };

  const nudgeEditRecovery = (tool, output) => {
    if (!EDIT_TOOLS.has(tool)) return;
    if (typeof output?.output !== "string") return;
    if (output.output.includes(EDIT_RECOVERY_MARKER)) return;
    const lower = output.output.toLowerCase();
    const matched = EDIT_PATTERNS.find((p) => lower.includes(p));
    if (!matched) return;
    output.output +=
      `\n\n[edit-recovery] The edit failed (matched: "${matched}"). READ the file now to see its ACTUAL current content, ` +
      "then retry with the exact current text. Do not repeat the same edit blind; do not guess at the content.";
  };

  const nudgeJsonRecovery = (tool, output) => {
    if (JSON_EXCLUDED_TOOLS.has(tool)) return;
    if (typeof output?.output !== "string") return;
    if (output.output.includes(JSON_RECOVERY_MARKER)) return;
    if (!JSON_PATTERNS.some((re) => re.test(output.output))) return;
    output.output +=
      "\n\n[json-recovery] Output is malformed JSON. Re-run the producing command and pipe it through a JSON parser to find the break, " +
      "or fetch the value a different way. Do not parse the same broken output again.";
  };

  const guardTask = (input, output) => {
    const text = typeof output?.output === "string" ? output.output.trim() : "";
    if (text === "") {
      output.output =
        "[task-guard] The subagent returned no output at all. It either crashed or replied with nothing. " +
        "Do not wait — re-dispatch it, or report the failure to the user. Exit code 0 is not evidence the work happened.";
      return;
    }
    if (typeof output.output !== "string") return;
    const resumeId =
      input?.args?.sessionID ?? output?.metadata?.sessionID ?? output?.metadata?.sessionId;
    if (typeof resumeId !== "string" || resumeId === "") return;
    if (output.output.includes("to continue: task(")) return;
    output.output += `\n\nto continue: task(session_id="${resumeId}")`;
  };

  const trackLoop = (input, output) => {
    const tool = String(input?.tool ?? "").toLowerCase();
    if (!LOOP_TOOLS.has(tool)) return;
    const sessionID = input?.sessionID;
    if (!sessionID) return;
    const limit = envInt("GUARDRAILS_LOOP_LIMIT", 20);
    const sig = `${input.tool}::${JSON.stringify(sortKeysDeep(input?.args ?? {}))}`;
    let state = loopState.get(sessionID);
    if (!state || state.lastSig !== sig) {
      state = { lastSig: sig, count: 1, announced: new Set() };
      loopState.set(sessionID, state);
    } else {
      state.count += 1;
    }
    if (state.count < limit || state.announced.has(sig)) return;
    state.announced.add(sig);
    output.output +=
      `\n\n[loop-guard] This exact tool call (same tool, same arguments) has now run ${state.count} times consecutively ` +
      `(limit ${limit}). If it is failing or not advancing, STOP repeating it: change approach, or report the blocker and ask.`;
  };

  return {
    event: async ({ event } = {}) => {
      try {
        if (event?.type === "session.deleted") {
          const sid = event.properties?.sessionID;
          if (sid) tokenCache.delete(sid);
          return;
        }
        cacheTokensFromEvent(event);
      } catch {
        // A nudge that throws is worse than no nudge.
      }
    },
    "tool.execute.after": async (input, output) => {
      try {
        const tool = String(input?.tool ?? "").toLowerCase();
        truncateToolOutput(tool, output);
        announceContextUsage(input?.sessionID, output);
        nudgeEditRecovery(tool, output);
        nudgeJsonRecovery(tool, output);
        if (tool === "task") guardTask(input, output);
        trackLoop(input, output);
      } catch {
        // Never let a guard break the tool call it watches.
      }
    },
  };
};

// Helpers are properties, not named exports: opencode calls EVERY exported
// function in a plugin file as a plugin factory, so a separate export would be
// invoked with the plugin input object and crash at load (see inbox.js).
GuardRails.truncateOutput = truncateOutput;
GuardRails.sortKeysDeep = sortKeysDeep;