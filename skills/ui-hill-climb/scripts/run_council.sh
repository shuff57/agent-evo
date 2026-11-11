#!/bin/bash
# run_council.sh - tstack-style council for a ui-hill-climb round.
# Two read-only delegates from TWO DIFFERENT providers at high effort review the builder's
# plan + diff against the panel's named gaps. They advise; they never score the UI (the blind
# panel owns the numbers, rule 3) and they never edit.
#
# Members: UC_COUNCIL="provider:model provider:model" (a third distinct provider is still accepted).
# Suggested at onboarding: Claude Opus + GPT Sol, both high, e.g.
#   UC_COUNCIL="claudeAgent_claude_proxy:claude-opus-5-5 codex:gpt-6.1-sol"
# Provider ids are your t3 provider instance ids (orchestrator_capabilities). Duplicate providers or
# fewer than two members => exit 3, no substitution.
#
# Tie-breaker: when the two disagree (one satisfied, one not), run again with UC_TIEBREAK=1. It adds
# UC_TIEBREAK_MEMBER (default opencode:ollama/kimi-k3.1-pro, variant high) as member "tiebreak" in the
# same round dir; the summary then takes the majority of three.
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
if [ "${#MEMBERS[@]}" -lt 2 ] || [ "${#MEMBERS[@]}" -gt 3 ]; then
    echo "council needs 2 (or 3) members in UC_COUNCIL (provider:model ...); got ${#MEMBERS[@]}" >&2
    exit 3
fi
provs=$(for m in "${MEMBERS[@]}"; do echo "${m%%:*}"; done | sort -u | wc -l)
if [ "$provs" -ne "${#MEMBERS[@]}" ]; then
    echo "council members must come from different providers; got $provs for ${#MEMBERS[@]}. Report it, do not substitute." >&2
    exit 3
fi
# The tie-breaker is named "tiebreak" so it never collides with a member's provider name.
member_name() { if [ -n "${UC_TIEBREAK:-}" ]; then echo tiebreak; else echo "${1%%:*}"; fi; }
[ -n "${UC_TIEBREAK:-}" ] && MEMBERS=("${UC_TIEBREAK_MEMBER:-opencode:ollama/kimi-k3.1-pro}")

ctx() {
    printf '\nCONTEXT\nROUND: %s\nANALYSIS: %s\nCRITERIA: %s\nPLAN: %s\nDIFF: %s\nVISUAL_DIFFS: %s\n' \
        "$R" "${UC_ANALYSIS:-none}" "${UC_CRITERIA:-none}" "${UC_PLAN:-none}" "${UC_DIFF:-none}" "${UC_VDIFF:-none}"
}

. "$(dirname "$(readlink -f "$0")")/t3_run.sh"
run() {
    prov=${1%%:*}; model=${1#*:}; name=$(member_name "$1")
    p="$OUTD/$name.prompt"
    { sed -e "s#MEMBER#$name#g" "${UC_COUNCIL_PROMPT:-council.md}"; ctx; } > "$p"
    t3_member "$prov" "$model" "council-r$R-$name" "$p" "$OUTD/$name.jsonl" 1 "$OUTD"
}

MODE=${UC_COUNCIL_MODE:-run}
if [ "$MODE" = prepare ]; then
    for m in "${MEMBERS[@]}"; do
        prov=${m%%:*}; model=${m#*:}; name=$(member_name "$m"); p="$OUTD/$name.prompt"; o="$OUTD/$name.jsonl"
        : > "$o"; rm -f "$o.unavailable"
        { sed -e "s#MEMBER#$name#g" -e "s#OUTFILE#$(readlink -f "$o")#g" "${UC_COUNCIL_PROMPT:-council.md}"; ctx; } > "$p"
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
main = [r for r in rows if r.get("member") != "tiebreak"]
tb = [r for r in rows if r.get("member") == "tiebreak"]
votes = [bool(r.get("satisfied")) for r in main]
if missing or len(main) < 2:
    print("COUNCIL INCOMPLETE (report it; no substitute)")
elif all(votes):
    print("COUNCIL SATISFIED")
elif not any(votes):
    print("COUNCIL NOT SATISFIED (fix, then run a NEW round)")
elif not tb:
    print("COUNCIL SPLIT: run the tie-breaker (UC_TIEBREAK=1, same ROUND) before deciding")
else:
    yes = sum(votes) + bool(tb[0].get("satisfied"))
    print("COUNCIL", "SATISFIED (2 of 3, tie-break)" if yes * 2 > len(votes) + 1 else "NOT SATISFIED (tie-break; fix, then run a NEW round)")
PY
