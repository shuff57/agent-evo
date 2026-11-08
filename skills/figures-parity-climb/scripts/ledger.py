#!/usr/bin/env python3
"""Open and close hill-climb rounds; the numbers come from score.json, never from the command line.

    # before editing: record the hypothesis and snapshot the score
    python3 ledger.py start --dir docs/figures-parity --round 3 --figure transformations \
      --capability cap-02 --hypothesis "Adding composition lets a teacher show a glide reflection; evidence changes:steps=..."

    # after refresh + probe + diff: read the new score, check the named capability, append the row
    python3 ledger.py close --dir docs/figures-parity --round 3 \
      --checker "pass: render shows the glide reflection, student copy hides the image" \
      --evidence "cargo test --lib figures ok; census +0/-0" --next "transformations cap-04"

A round whose capability does not pass, or whose score did not rise, is written as a
miss. A round cannot be closed on a score older than its start or a probe older than
the code.
"""

from __future__ import annotations

import argparse
import subprocess
from datetime import date, datetime
from pathlib import Path

from lib import read_json, write_json

HEADER = """# Figures parity ledger

One row per round, written by `ledger.py close` from `score.json`. A round whose
capability did not pass, or whose score did not move, is a **miss** and stays.

| round | date | figure | capability | figure score | pooled | probe | checker | result | evidence | next |
|---:|---|---|---|---:|---:|---|---|---|---|---|
"""


def cell(s: str) -> str:
    return (s or "").replace("|", "\\|").replace("\n", " ").strip()


def head(repo: Path) -> str:
    return subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=repo, text=True, capture_output=True).stdout.strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["start", "close"])
    ap.add_argument("--dir", default="docs/figures-parity")
    ap.add_argument("--repo", default=".")
    ap.add_argument("--round", type=int, required=True)
    ap.add_argument("--figure")
    ap.add_argument("--capability", help="the ledger capability id this round closes")
    ap.add_argument("--hypothesis", default="")
    ap.add_argument("--checker", default="", help="the independent checker's verdict: 'pass: ...' or 'fail: ...'")
    ap.add_argument("--evidence", default="", help="tests, census, task run")
    ap.add_argument("--next", dest="next_gap", default="")
    args = ap.parse_args()

    d = Path(args.dir)
    state_path = d / "rounds" / f"round-{args.round:03d}.json"
    score = read_json(d / "score.json")
    if not score:
        raise SystemExit(f"no {d / 'score.json'}; run probe.py then diff.py")

    if args.action == "start":
        if not (args.figure and args.capability and args.hypothesis):
            raise SystemExit("start needs --figure, --capability and --hypothesis")
        if state_path.exists():
            raise SystemExit(f"{state_path} exists; rounds are not restarted, use the next number")
        fig = score["figures"].get(args.figure)
        if fig is None:
            raise SystemExit(f"{args.figure} is not in score.json (not frozen, or no ledger)")
        caps = (read_json(d / "capabilities" / f"{args.figure}.json") or {}).get("capabilities", [])
        if not any(c.get("id") == args.capability for c in caps):
            raise SystemExit(f"{args.capability} is not in capabilities/{args.figure}.json")
        write_json(state_path, {"round": args.round, "figure": args.figure, "capability": args.capability,
                                "hypothesis": args.hypothesis, "started_at": datetime.now().isoformat(timespec="seconds"),
                                "git": head(Path(args.repo)), "before": {"figure": fig["score"], "pooled": score["pooled"]},
                                "before_comparable": score["comparable"], "before_drift": score["drift"]})
        print(f"round {args.round} open: {args.figure} {args.capability} at {fig['score']:.1f} (pooled {score['pooled']:.1f})")
        if not score["comparable"]:
            print("warning: the baseline is not comparable:\n  " + "\n  ".join(score["drift"]))
        return 0

    st = read_json(state_path)
    if not st:
        raise SystemExit(f"no {state_path}; run ledger.py start first")
    if st.get("closed"):
        raise SystemExit(f"round {args.round} is already closed")
    probe = read_json(d / "probe.json") or {}
    sp, pp = d / "score.json", d / "probe.json"
    if sp.stat().st_mtime < state_path.stat().st_mtime or not pp.exists() or pp.stat().st_mtime < state_path.stat().st_mtime:
        raise SystemExit("score.json or probe.json predates this round: run diff.py --refresh, probe.py, diff.py")
    if not args.checker:
        raise SystemExit("close needs --checker: the independent checker's verdict (see references/checker-brief.md)")
    fid, cid = st["figure"], st["capability"]
    after_fig = score["figures"].get(fid, {}).get("score", 0.0)
    cap_res = probe.get("figures", {}).get(fid, {}).get("caps", {}).get(cid, {})
    cap_pass = bool(cap_res.get("pass"))
    checker_pass = args.checker.strip().lower().startswith("pass")
    rose = after_fig > st["before"]["figure"]
    result = "hit" if (cap_pass and checker_pass and rose) else "miss"
    if not score["comparable"] and score["drift"] != st.get("before_drift"):
        result += " (baseline moved: " + "; ".join(x for x in score["drift"] if x not in st.get("before_drift", []))[:200] + ")"
    path = d / "ledger.md"
    if not path.exists():
        path.write_text(HEADER, encoding="utf-8")
    row = (f"| {args.round} | {date.today().isoformat()} | `{fid}` | {cid}: {cell(st['hypothesis'])[:140]} | "
           f"{st['before']['figure']:.1f} → {after_fig:.1f} | {st['before']['pooled']:.1f} → {score['pooled']:.1f} | "
           f"{'pass' if cap_pass else 'fail: ' + cell(cap_res.get('why', 'not probed'))} | {cell(args.checker)} | {result} | "
           f"{cell(args.evidence)} | {cell(args.next_gap)} |\n")
    with path.open("a", encoding="utf-8") as f:
        f.write(row)
    st.update({"closed": datetime.now().isoformat(timespec="seconds"), "after": {"figure": after_fig, "pooled": score["pooled"]},
               "probe": cap_res, "checker": args.checker, "result": result, "evidence": args.evidence, "next": args.next_gap})
    write_json(state_path, st)
    print(f"round {args.round} {result}: {fid} {st['before']['figure']:.1f} → {after_fig:.1f}, pooled {st['before']['pooled']:.1f} → {score['pooled']:.1f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
