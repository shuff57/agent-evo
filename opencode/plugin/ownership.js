// Blocks writes to files another agent has claimed in the cross-CLI message center.
import { execFileSync } from "child_process";
import os from "os";
import path from "path";

const MSG = path.join(os.homedir(), ".claude", "bin", "msg.mjs").replace(/\\/g, "/");
const WRITERS = new Set(["write", "edit", "patch", "multiedit"]);

// opencode ALSO loads ~/.claude/settings.json hooks (its claude-code compat layer),
// so the PreToolUse `msg.mjs guard` fires in here too. That hook defaults to --as
// claude, which deadlocks: whichever identity holds a claim, the OTHER guard blocks the
// write, so a claim becomes a lock the claimant cannot open. The hook reads
// ${MSGBOX_AS:-claude}, so name this lane's identity in the env its hook subprocesses
// inherit and both guards agree. Same default as inbox.js's ME.
process.env.MSGBOX_AS ??= "opencode";

export const Ownership = async ({ directory }) => ({
  "tool.execute.before": async (input, output) => {
    if (!WRITERS.has(String(input.tool).toLowerCase())) return;
    const file = output.args?.filePath ?? output.args?.path ?? output.args?.file_path;
    if (!file) return;
    try {
      // ponytail: "node", not process.execPath — inside opencode that is the opencode
      // binary, which would run msg.mjs as a CLI arg and fail every write.
      execFileSync("node", [MSG, "guard", "--as", "opencode", "--path", file], {
        cwd: directory,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      throw new Error(String(e.stderr ?? "").trim() || `blocked: ${file} is owned by another agent`);
    }
  },
});

// ponytail: guards the write tools only — a shell heredoc can still clobber a claimed file.
// Gate the bash tool on a path regex if that ever actually happens.
