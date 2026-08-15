#!/usr/bin/env python3
"""UserPromptSubmit + PostToolUse(Skill): append friction/skill-load events to
<cwd>/_workspace/_metrics/events.jsonl for the evolver.

Path is CWD-relative on purpose — skills/evolution/SKILL.md pins _workspace/ to
the invoking session's working directory. Do NOT redirect this to a fixed repo.

Writes events.jsonl only. Never writes summary.jsonl: calibration.md heuristic
#5 says skeleton rows (hardcoded 0 counts) are treated as "no sessions logged"
and stall reconciliation, so a dumb autolog row is worse than none. Real
summary rows come from session-reflector via /session-end-wrap.

Silent by design: stdout on UserPromptSubmit is injected into the model's
context, so this prints nothing there. Failures go to stderr and exit 0.
"""
import json, os, sys, datetime

MAX_BYTES = 5 * 1024 * 1024
SNIPPET = 120

# Prefix-anchored -> the user is restating the same ask (taxonomy sec. 1).
REPHRASE = ("i meant", "actually", "no,", "no ", "try again", "not what i",
            "that's not what", "thats not what", "i said")
# Substring -> the user is patching the result they just got (taxonomy sec. 2).
CORRECTION = ("not quite", "missing", "also add", "don't forget", "dont forget",
              "fix the", "i already said", "you forgot", "that's wrong",
              "thats wrong", "undo", "revert that")


def workspace(cwd):
    """Resolve <cwd>/_workspace/_metrics, creating it (self-ignoring) if needed."""
    low = cwd.lower()
    for skip in ("\\temp\\", "/temp/", "\\appdata\\local\\temp", "scratchpad"):
        if skip in low:
            return None
    ws = os.path.join(cwd, "_workspace")
    metrics = os.path.join(ws, "_metrics")
    if not os.path.isdir(metrics):
        os.makedirs(metrics, exist_ok=True)
    # Prompt text lands here; _workspace/ is gitignored in agent-evo but not
    # necessarily in every repo a session runs from.
    gi = os.path.join(ws, ".gitignore")
    if not os.path.exists(gi):
        with open(gi, "w", encoding="utf-8") as f:
            f.write("*\n")
    return metrics


def classify(prompt):
    p = prompt.strip().lower()
    if not p:
        return None
    for m in REPHRASE:
        if p.startswith(m):
            return "rephrase", m
    for m in CORRECTION:
        if m in p:
            return "correction", m
    return None


def main():
    raw = sys.stdin.read()
    if not raw.strip():
        return
    d = json.loads(raw)
    cwd = d.get("cwd") or os.getcwd()
    event = d.get("hook_event_name")

    rec = {
        "ts": datetime.datetime.now(datetime.timezone.utc)
              .strftime("%Y-%m-%dT%H:%M:%SZ"),
        "session_id": d.get("session_id", "unknown"),
        "cwd": cwd,
    }

    if event == "UserPromptSubmit":
        prompt = d.get("prompt", "")
        hit = classify(prompt)
        # Every prompt is logged: friction counts are useless without a
        # denominator (rephrase_rate = rephrase_count / total_tasks).
        rec["type"] = "prompt"
        rec["friction"] = hit[0] if hit else None
        if hit:
            rec["marker"] = hit[1]
            rec["snippet"] = " ".join(prompt.split())[:SNIPPET]
    elif event == "PostToolUse":
        ti = d.get("tool_input") or {}
        skill = ti.get("skill")
        if not skill:
            return
        rec["type"] = "skill_load"
        rec["skill"] = skill
    else:
        return

    metrics = workspace(cwd)
    if metrics is None:
        return
    path = os.path.join(metrics, "events.jsonl")
    if os.path.exists(path) and os.path.getsize(path) > MAX_BYTES:
        print(f"[metrics-capture] {path} over {MAX_BYTES}B, skipping",
              file=sys.stderr)
        return
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


try:
    main()
except Exception as e:
    print(f"[metrics-capture] {e}", file=sys.stderr)
sys.exit(0)
