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

const MSG = "C:/Users/shuff/.claude/bin/msg.mjs";
const ME = "opencode";

// Box resolution is duplicated from msg.mjs ON PURPOSE: it is the one thing needed BEFORE deciding
// whether to spawn anything, and spawning node on every tool call just to learn the path would cost
// more than the feature saves. Everything else -- the cursor, the filter, the formatting -- stays in
// msg.mjs so the two can never disagree about what counts as unread. Keep this in step with
// `msg.mjs where`; msg.test.mjs asserts they agree.
export function findBox(directory) {
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
  const logFile = path.join(findBox(directory), "log.jsonl");
  let lastSeenMtime = null;

  return {
    "tool.execute.after": async (_input, output) => {
      try {
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
