// Blocks writes to files another agent has claimed in the cross-CLI message center.
import { execFileSync } from "child_process";
import os from "os";
import path from "path";

const MSG = path.join(os.homedir(), ".claude", "bin", "msg.mjs").replace(/\\/g, "/");
const WRITERS = new Set(["write", "edit", "patch", "multiedit"]);

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
