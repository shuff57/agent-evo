// Delivers cross-CLI messages into a running opencode session.
//
// `opencode run "..."` reads its inbox once, at start. Anything sent after that sits unread until
// the run ends — so a correction, a stop, or a changed requirement arrives too late to matter. That
// is not hypothetical: on 2026-08-09 a handoff ran for ten minutes past two messages, one of which
// removed a whole requirement.
//
// Polling was the other option and it is worse: it depends on the model choosing to spend a tool
// call on a check that is almost always empty, and a model mid-task reliably decides not to.
// Instead the message is APPENDED TO A TOOL RESULT the agent is already reading. It cannot be
// skipped, and it costs nothing to notice.
//
// ponytail: no daemon, no watcher, no queue. The append-only log already IS the queue; this only
// moves what is in it to where the model will see it.
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
// The peer registry is the sidecar's device-local list of live peers. This plugin only ever
// HEARTBEATS an entry that already exists: it never registers, never mints a key, and never
// creates registry.json. Imported by name and NOT re-exported — opencode calls every exported
// function in a plugin file as a plugin factory, so a stray export would be invoked as one.
import {
  STATUS,
  defaultRegistryDir,
  isPidAlive,
  loadRegistry,
  peerIdForBoxLane,
  registryPath,
  setStatus,
  touchPeer,
  withRegistry,
} from "../../bin/peer/registry.mjs";
import { fileURLToPath } from "node:url";
import { spawn as nodeSpawn } from "node:child_process";

const MSG = path.join(os.homedir(), ".claude", "bin", "msg.mjs").replace(/\\/g, "/");
// Which mailbox this session watches. A hardcoded "opencode" silently disabled the whole feature
// for any session addressed under another name: build-section.md fans out review lenses with a
// distinct `--to lens-<name>` each ("keeps briefs from bleeding together"), so the mid-run
// corrections went to lens-structure / lens-plugins / lens-a11y while this hook kept polling
// `opencode` and found nothing. Measured 2026-08-09 on programming §3.1 — three corrections sent,
// zero delivered, cursor-opencode ticking the whole time while cursor-lens-* stayed frozen. One of
// them carried the fix for a wedge the lens then sat in until it was killed.
// The launcher exports MSGBOX_AS alongside the `--to` it sends; the two must agree or delivery is
// silently a no-op again. Default preserves the single-session behaviour.
const ME = process.env.MSGBOX_AS || "opencode";

// Box resolution is duplicated from msg.mjs ON PURPOSE: it is the one thing needed BEFORE deciding
// whether to spawn anything, and spawning node on every tool call just to learn the path would cost
// more than the feature saves. Everything else -- the cursor, the filter, the formatting -- stays in
// msg.mjs so the two can never disagree about what counts as unread. Keep this in step with
// `msg.mjs where`; msg.test.mjs asserts they agree.
//
// NOT exported by name: opencode calls EVERY exported function in a plugin file as a plugin
// factory, passing its input object. An exported findBox was invoked as findBox({client, project,
// directory, ...}), path.join(<object>, ".git") threw "paths[0] ... got object", and the whole
// plugin failed to load -- 818 times in opencode.log from 2026-08-19 to 2026-09-15, so mid-run
// delivery silently never worked. Exposed as Inbox.findBox for msg.test.mjs instead.

// A runtime that can execute a .mjs file, for spawning the sidecar. Checked once
// per plugin instance: bun, then node. Neither found → no auto-start.
function resolveRuntime() {
  for (const bin of [process.env.PEER_RUNTIME, "bun", "node"]) {
    if (!bin) continue;
    try {
      execFileSync("which", [bin], { stdio: "ignore" });
      return bin;
    } catch { /* try the next */ }
  }
  return null;
}

function findBox(directory) {
  if (process.env.MSGBOX) return process.env.MSGBOX;
  let dir = directory || process.cwd();
  while (true) {
    if (fs.existsSync(path.join(dir, ".git"))) return path.join(dir, ".msgbox");
    const up = path.dirname(dir);
    if (up === dir) return path.join(os.homedir(), ".claude", "msgbox");
    dir = up;
  }
}

export const Inbox = async ({ directory }) => {
  const box = findBox(directory);
  const logFile = path.join(box, "log.jsonl");
  // The peer registry lives beside the box. `registryFile` is only ever READ unless it already
  // exists: a missing registry means no sidecar has registered this lane, and creating one here
  // would fabricate a peer with no key file and no identity.
  const registryFile = registryPath(defaultRegistryDir(box));
  const peerId = peerIdForBoxLane(ME, box);
  let lastSeenMtime = null;
  // One spawn attempt per plugin instance: a sidecar that fails to start must not be
  // retried on every tool call for the rest of the session.
  let sidecarEnsured = false;
  // Activity heartbeat for msgbox-ui: the last time an `activity` event was appended. One
  // timestamp compare in the common case, so the hook stays nearly free.
  let lastBeat = 0;
  // Registry heartbeat debounce, separate from the telemetry one: a registry write is a
  // read-modify-write of a shared file, so it is held to one write per 5 s regardless of how
  // many tool calls land in between.
  let lastRegistryBeat = 0;

  // Append one telemetry line to <box>/events.jsonl beside log.jsonl. An emitter that throws
  // would kill the tool call it hooks into, so it is wrapped by the caller's try/catch and
  // swallows its own I/O errors: a missed event is a blank lane, a thrown one is a dead tool.
  const emitEvent = (event) => {
    try {
      fs.appendFileSync(path.join(findBox(directory), "events.jsonl"), JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n");
    } catch { /* telemetry must never break the task */ }
  };

  // Refresh this lane's peer entry so the sidecar sees it as live and busy. Strictly a no-op
  // unless a sidecar already registered this peer: a missing registry, a missing/foreign entry,
  // a corrupt file or any I/O failure leaves the filesystem exactly as it was. The whole attempt
  // is debounced, so a burst of tool calls costs one stat and at most one read-modify-write.
  const beatRegistry = () => {
    try {
      if (Date.now() - lastRegistryBeat <= 5000) return;
      lastRegistryBeat = Date.now();
      if (!fs.existsSync(registryFile)) return;
      // Under the registry's lock, returning null when this lane has no entry so a
      // no-op stays a no-op. The bare load+save this replaced could clobber a
      // registration a sidecar had committed between the read and the write.
      withRegistry(registryFile, (reg) => {
        const touched = touchPeer(reg, peerId);
        return touched.changed ? setStatus(touched.registry, peerId, STATUS.BUSY) : null;
      });
    } catch { /* a missing/corrupt registry or a failed write is a no-op */ }
  };

  // The sidecar for this lane may not be running when a session starts — it is a
  // per-session daemon and nothing starts it automatically today. Spawning one lazily on
  // the first tool call closes that gap: detached so it survives this tool call, one
  // attempt per session so a sidecar that fails to start is not retried on every call,
  // and a no-op when the registry says the lane is already live.
  const ensureSidecar = () => {
    try {
      if (sidecarEnsured) return;
      if (process.env.PEER_SIDECAR_NO_SPAWN === "1") return; // test/ops kill switch
      sidecarEnsured = true; // one attempt per session; a failed spawn is not retried
      if (!fs.existsSync(registryFile)) return; // no registry = bridge not opted into

      const entry = loadRegistry(registryFile).peers[peerId];
      const alive = entry && isPidAlive(entry.pid) && entry.socketPath && fs.existsSync(entry.socketPath);
      if (alive) return;

      // The plugin runs from the REPO (import.meta.url = repo path) or from the
      // INSTALLED copy (~/.config/opencode/plugin/), where ../../bin does not exist.
      // Find the repo the same way the box was found: the box is <repo>/.msgbox.
      const sidecarRepo = path.join(box, "..", "bin", "peer-sidecar.mjs");
      const sidecarLocal = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "bin", "peer-sidecar.mjs");
      const sidecar = fs.existsSync(sidecarRepo) ? sidecarRepo : sidecarLocal;
      if (!fs.existsSync(sidecar)) return;

      // Detached + stdio ignore: the sidecar must outlive this tool call. MSGBOX is
      // PINNED to this plugin's own resolved box, not left to inheritance: a stale
      // MSGBOX in the environment would send the child to a different box than the
      // one this session watches, and the two would silently disagree forever.
      // process.execPath is NOT usable here: inside an opencode plugin it is the
      // opencode binary, so spawning it "runs" the sidecar path as an opencode
      // message and prints the CLI help. Resolve a real runtime instead.
      const runtime = resolveRuntime();
      if (!runtime) return;
      const child = nodeSpawn(runtime, [sidecar, "--as", ME], {
        cwd: directory,
        env: { ...process.env, MSGBOX: box, MSGBOX_AS: ME },
        detached: true,
        stdio: "ignore",
      });
      child.unref();
    } catch (e) {
    }
  };

  return {
    "tool.execute.after": async (_input, output) => {
      try {
        const tool = _input?.tool ?? null;
        const toolInput = _input?.input ?? {};
        // Heartbeat BEFORE the mtime short-circuit so every tool call (delivered or not) keeps
        // the timeline alive; debounce to one line per 5 s.
        if (Date.now() - lastBeat > 5000) {
          const file = toolInput?.filePath ?? toolInput?.path ?? toolInput?.file ?? null;
          emitEvent({ kind: "activity", from: ME, tool, file });
          lastBeat = Date.now();
        }
        // Subagent spawn marker: never debounced — one event per task tool call.
        if (tool === "task") {
          emitEvent({ kind: "task", from: ME, agent: toolInput?.subagent_type ?? toolInput?.agent ?? null });
        }
        ensureSidecar();
        beatRegistry();

        // The common case is "nothing new", and it has to be nearly free — one stat, no subprocess.
        // Read the mtime BEFORE delivering and store that value: anything appended during the
        // delivery leaves a newer mtime and so still triggers the next time round.
        const mtime = fs.existsSync(logFile) ? fs.statSync(logFile).mtimeMs : 0;
        if (mtime === lastSeenMtime) return;
        lastSeenMtime = mtime;

        const text = execFileSync("node", [MSG, "inbox", "--as", ME], {
          cwd: directory,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        if (!text) return;

        if (typeof output.output === "string") output.output += `\n\n${text}`;
        else output.output = text;
      } catch {
        // Never let the mailbox break the task. A failed delivery is a missed message; a thrown
        // error inside an after-hook is a dead tool call, on every tool call.
      }
    },
  };
};
// A property, not a named export: see the note above findBox for why.
Inbox.findBox = findBox;
