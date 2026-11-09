#!/bin/bash
# run_council.sh - tstack-style council for a ui-hill-climb round.
# Three read-only delegates from THREE DIFFERENT providers at high effort review the builder's
# plan + diff against the panel's named gaps. They advise; they never score the UI (the blind
# panel owns the numbers, rule 3) and they never edit.
#
# Members: UC_COUNCIL="provider:model provider:model provider:model", e.g.
#   UC_COUNCIL="claude:claude-opus-5-5 codex:gpt-sol gemini:gemini-pro"
# Use the latest flagship from each provider (resolve with the harness's model list). Provider ids
# are your t3 provider instance ids. Fewer than three distinct providers => exit 3, no substitution.
#
# Context (env): UC_ANALYSIS (analyze.py output), UC_CRITERIA (criteria_check output),
#   UC_PLAN (builder's fix plan), UC_DIFF (git diff file), UC_VDIFF (dir of visual_diff PNGs, optional)
# ROUND=N names the round; results land in ${UC_BLIND:-blind}/council/rN/<member>.jsonl
#
# UC_COUNCIL_MODE (effort matters: the council must run at HIGH reasoning effort):
#   run (default)  start members with `t3 thread start` via t3_run.sh. That CLI has NO effort flag, so
#                  members run at their provider default (codex gpt-6.1-sol defaults to LOW). Use only
#                  outside T3 Code or when every member's default is already high.
#   prepare        write $OUTD/<member>.prompt (+ empty <member>.jsonl) and print one line per member:
#                  "<provider> <model> <prompt> <outfile>". The orchestrator then starts each member
#                  with delegate_task at high effort (codex reasoningEffort=high, claudeAgent effort=high,
#                  opencode variant=high), passing the prompt file's contents as the task. Measured
#                  2026-11-08: four council rounds ran at Sol's default low effort before this was noticed.
#   summary        only print the summary table for $OUTD (after delegate_task members finish).

cd "${UC_PROJECT:-.}" || exit 9
R="${ROUND:-1}"
OUTD="${UC_BLIND:-blind}/council/r$R"
mkdir -p "$OUTD"

read -r -a MEMBERS <<< "${UC_COUNCIL:-}"
if [ "${#MEMBERS[@]}" -ne 3 ]; then
    echo "council needs exactly 3 members in UC_COUNCIL (provider:model x3); got ${#MEMBERS[@]}" >&2
    exit 3
fi
provs=$(for m in "${MEMBERS[@]}"; do echo "${m%%:*}"; done | sort -u | wc -l)
if [ "$provs" -ne 3 ]; then
    echo "council members must come from 3 different providers; got $provs. Report it, do not substitute." >&2
    exit 3
fi

ctx() {
    printf '\nCONTEXT\nROUND: %s\nANALYSIS: %s\nCRITERIA: %s\nPLAN: %s\nDIFF: %s\nVISUAL_DIFFS: %s\n' \
        "$R" "${UC_ANALYSIS:-none}" "${UC_CRITERIA:-none}" "${UC_PLAN:-none}" "${UC_DIFF:-none}" "${UC_VDIFF:-none}"
}

. "$(dirname "$(readlink -f "$0")")/t3_run.sh"
run() {
    prov=${1%%:*}; model=${1#*:}; name="$prov"
    p="$OUTD/$name.prompt"
    { sed -e "s#MEMBER#$name#g" "${UC_COUNCIL_PROMPT:-council.md}"; ctx; } > "$p"
    t3_member "$prov" "$model" "council-r$R-$name" "$p" "$OUTD/$name.jsonl" 1 "$OUTD"
}

MODE=${UC_COUNCIL_MODE:-run}
if [ "$MODE" = prepare ]; then
    for m in "${MEMBERS[@]}"; do
        prov=${m%%:*}; model=${m#*:}; p="$OUTD/$prov.prompt"; o="$OUTD/$prov.jsonl"
        : > "$o"; rm -f "$o.unavailable"
        { sed -e "s#MEMBER#$prov#g" -e "s#OUTFILE#$(readlink -f "$o")#g" "${UC_COUNCIL_PROMPT:-council.md}"; ctx; } > "$p"
        echo "$prov $model $(readlink -f "$p") $(readlink -f "$o")"
    done
    exit 0
elif [ "$MODE" = run ]; then
    for m in "${MEMBERS[@]}"; do run "$m" & sleep "${UC_STAGGER:-20}"; done
    wait
fi

# Summary: scores per member, and whether everyone is satisfied.
python3 - "$OUTD" <<'PY'
import glob, json, sys
rows = []
for f in sorted(glob.glob(sys.argv[1] + "/*.jsonl")):
    for line in open(f):
        try: rows.append(json.loads(line))
        except Exception: pass
print("member      score  satisfied  monochrome_risk")
for r in rows:
    print(f"{r.get('member','?'):<11} {str(r.get('score')):<6} {str(r.get('satisfied')):<10} {r.get('monochrome_risk')}")
import os
missing = glob.glob(sys.argv[1] + "/*.unavailable")
if missing: print("UNAVAILABLE:", ", ".join(os.path.basename(m)[:-len(".jsonl.unavailable")] for m in missing), "(report it; no substitute)")
print("COUNCIL", "SATISFIED" if len(rows) == 3 and all(r.get("satisfied") for r in rows) else "NOT SATISFIED (fix, then run a NEW round)")
PY
