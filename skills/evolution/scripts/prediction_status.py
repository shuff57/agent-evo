#!/usr/bin/env python3
"""Report, for every PENDING prediction, whether it is scoreable YET.

Why this exists
---------------
The meta pass keeps diagnosing "unmeasurable predictions", and then logs a new
prediction whose own scoring requires reading a 60-entry meta log plus a
289-entry evolution log plus a 69-row session index and hand-counting which
post-mutation sessions were real. That cost is exactly why predictions sit at
PENDING: not because they are unfalsifiable, but because scoring them is
archaeology. Heuristic #6 gave INSUFFICIENT_DATA an exit path; this gives the
exit condition a command.

It computes the ONE number the reconciliation rules turn on -- how many real
(non-skeleton) sessions have landed since a mutation -- and prints whether each
PENDING row has cleared its window. It applies no verdicts and edits nothing:
deciding VALIDATED vs MISSED is still a judgment call on evidence, and a script
that guessed it would recreate the problem one layer up.

Usage
-----
    python prediction_status.py [--workspace PATH] [--min-sessions N] [--json]

--workspace defaults to the bookSHelf workspace. A "skeleton" session row is one
carrying no real signal (autolog placeholders): no notes, no tasks_handled, and
no skill_loads. Those must not count toward a post-mutation window -- 38 days of
them accumulated once and made every window look satisfied.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

DEFAULT_WORKSPACE = Path.cwd() / "_workspace"
# Heuristic #6 reconciles a non-recurrence entry at 2x the base window.
DEFAULT_MIN_SESSIONS = 2
NON_RECURRENCE_MULTIPLIER = 2


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue  # a torn write must not break the report
    return rows


def parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def is_real_session(row: dict) -> bool:
    """A row carries real signal, as opposed to an autolog skeleton.

    The writer STATES this in a `skeleton: true` field, so read it rather than
    inferring. The first cut of this function guessed from notes/tasks/skills
    and classified all 69 rows as real -- including the 41 autolog skeletons --
    because a skeleton row still carries a `notes` string explaining that it is
    a skeleton. A heuristic that the data can contradict is worse than no check.
    """
    if "skeleton" in row:
        return not row["skeleton"]
    # Pre-flag rows: fall back, but require signal a Stop-hook fallback lacks.
    return bool(row.get("tasks_handled") and row.get("skill_loads"))


def real_sessions_since(sessions: list[dict], when: datetime) -> list[str]:
    out = []
    for row in sessions:
        ts = parse_ts(row.get("timestamp"))
        if ts and ts > when and is_real_session(row):
            out.append(row.get("session_id") or "<unnamed>")
    return out


def collect_pending(rows: list[dict], source: str) -> list[dict]:
    pending = []
    for idx, row in enumerate(rows):
        if (row.get("status") or "").upper() != "PENDING":
            continue
        if not row.get("predicted_outcome"):
            continue
        pending.append(
            {
                "source": source,
                "line": idx + 1,
                "ts": row.get("ts") or row.get("timestamp"),
                "target": row.get("target") or row.get("pathology") or "?",
                "predicted": row["predicted_outcome"],
            }
        )
    return pending


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--workspace", type=Path, default=DEFAULT_WORKSPACE)
    ap.add_argument("--min-sessions", type=int, default=DEFAULT_MIN_SESSIONS)
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args()

    ws = args.workspace
    sessions = read_jsonl(ws / "_metrics" / "summary.jsonl")
    pending = (
        collect_pending(read_jsonl(ws / "_meta_evolution_log.jsonl"), "meta")
        + collect_pending(read_jsonl(ws / "_evolution_log.jsonl"), "modify")
    )

    total = len(sessions)
    real = sum(1 for s in sessions if is_real_session(s))
    report = []
    for item in pending:
        ts = parse_ts(item["ts"])
        if ts is None:
            item.update(elapsed=None, scoreable=None, sessions=[])
            report.append(item)
            continue
        landed = real_sessions_since(sessions, ts)
        base_ok = len(landed) >= args.min_sessions
        nonrec_ok = len(landed) >= args.min_sessions * NON_RECURRENCE_MULTIPLIER
        item.update(
            elapsed=len(landed),
            sessions=landed,
            scoreable=base_ok,
            nonrecurrence_scoreable=nonrec_ok,
        )
        report.append(item)

    if args.json:
        print(json.dumps({"sessions_total": total, "sessions_real": real, "pending": report}, indent=2))
        return 0

    print(f"session index: {total} rows, {real} real ({total - real} skeleton)")
    print(f"windows: base={args.min_sessions} real sessions, "
          f"non-recurrence={args.min_sessions * NON_RECURRENCE_MULTIPLIER}\n")
    if not report:
        print("no PENDING predictions.")
        return 0
    for item in report:
        head = f"[{item['source']}:{item['line']}] {item['ts']} — {item['target']}"
        if item["elapsed"] is None:
            print(f"{head}\n    UNDATED — cannot compute a window\n")
            continue
        verdict = (
            "SCOREABLE on non-recurrence" if item["nonrecurrence_scoreable"]
            else "SCOREABLE on the base window" if item["scoreable"]
            else "NOT YET — needs more real sessions"
        )
        print(f"{head}\n    {item['elapsed']} real session(s) since: {verdict}")
        if item["sessions"]:
            print(f"    {', '.join(item['sessions'][:6])}")
        print(f"    predicted: {item['predicted'][:160]}...")
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
