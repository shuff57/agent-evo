#!/bin/bash
# run_critics.sh — Execute multimodal design critics across model families
# Primary panel = the council: UC_COUNCIL="provider:model provider:model" (2 critics from 2 different
# providers, chosen with the user at onboarding; suggested Claude Opus + GPT Sol, both at HIGH effort).
# A third distinct-provider member is still accepted.
#
# Tie-breaker: when the two critics split (a pair with one vote each way, or one says tie), run
#   UC_TIEBREAK=1 bash run_critics.sh
# It grades the SAME blind pack (controls and mirrors included, so its honesty is measured too) with
# UC_TIEBREAK_MEMBER (default opencode:ollama/kimi-k3.1-pro, variant high) into blind/tiebreak/.
# analyze.py reads it only to settle split pairs; it never enters a mean (rule 3).
#
# UC_CRITIC_MODE (effort: `t3 thread start` has no effort flag):
#   run (default)  start members with t3_run.sh at their provider default effort.
#   prepare        write <outdir>/<name>.prompt (+ empty <name>.jsonl) and print one line per member:
#                  "<provider> <model> <prompt> <outfile>". Start each with delegate_task at high
#                  effort (claudeAgent effort=high, codex reasoningEffort=high, opencode variant=high).
# Cheap ollama judges (used when UC_COUNCIL is unset, via UC_PANEL):
#   UC_PANEL=full (default): Run all 5 critics concurrently across distinct model labs.
#   UC_PANEL=steer: Run only 2 fast screener models for rapid iteration.
#   UC_PANEL=waterfall: Run screener first; proceed to remaining judges only if screener succeeds.

cd "${UC_PROJECT:-.}" || exit 9
mkdir -p "${UC_BLIND:-blind}/out"

run() {
    m=$1
    s=$2
    o="${UC_BLIND:-blind}/out/$s.jsonl"
    : > "$o"
    sed "s#OUTFILE#$o#g" "${UC_CRITIC:-critic.md}" | t3 thread start . - --title "ui critic: $s" --provider opencode --model "$m" --wait --json > critic-$s.json 2> critic-$s.err
    ret=$?
    lines=$(wc -l < "$o" 2>/dev/null || echo 0)
    echo "$s exit=$ret lines=$lines"
    return $ret
}

if [ -n "${UC_TIEBREAK:-}" ]; then
    MEMBERS=("${UC_TIEBREAK_MEMBER:-opencode:ollama/kimi-k3.1-pro}")
    OUTD="${UC_BLIND:-blind}/tiebreak"; KIND=tiebreak
elif [ -n "${UC_COUNCIL:-}" ] && [ -z "${UC_PANEL:-}" ]; then
    read -r -a MEMBERS <<< "$UC_COUNCIL"
    provs=$(for m in "${MEMBERS[@]}"; do echo "${m%%:*}"; done | sort -u | wc -l)
    if [ "${#MEMBERS[@]}" -lt 2 ] || [ "${#MEMBERS[@]}" -gt 3 ] || [ "$provs" -ne "${#MEMBERS[@]}" ]; then
        echo "council needs 2 (or 3) members, each from a different provider; do not substitute" >&2; exit 3
    fi
    OUTD="${UC_BLIND:-blind}/out"; KIND=council
fi
if [ -n "${KIND:-}" ]; then
    mkdir -p "$OUTD"
    n=$(grep -c . "${UC_BLIND:-blind}/manifest.txt" 2>/dev/null); n=${n:-1}
    name_of() { if [ "$KIND" = tiebreak ]; then m=${1#*:}; echo "${m##*/}"; else echo "${1%%:*}"; fi; }
    if [ "${UC_CRITIC_MODE:-run}" = prepare ]; then
        for m in "${MEMBERS[@]}"; do
            prov=${m%%:*}; model=${m#*:}; name=$(name_of "$m")
            o="$OUTD/$name.jsonl"; : > "$o"; rm -f "$o.unavailable"; o=$(readlink -f "$o")
            sed "s#OUTFILE#$o#g" "${UC_CRITIC:-critic.md}" > "$OUTD/$name.prompt"
            echo "$prov $model $(readlink -f "$OUTD/$name.prompt") $o"
        done
        exit 0
    fi
    echo "Running UI critics ($KIND)..."
    . "$(dirname "$(readlink -f "$0")")/t3_run.sh"
    for m in "${MEMBERS[@]}"; do
        prov=${m%%:*}; model=${m#*:}; name=$(name_of "$m")
        t3_member "$prov" "$model" "critic-$name" "${UC_CRITIC:-critic.md}" "$OUTD/$name.jsonl" "$n" . &
        sleep "${UC_STAGGER:-20}"   # simultaneous starts contend for MCP registration (2026-11-08)
    done
    wait
    ls "$OUTD"/*.unavailable 2>/dev/null && echo "PANEL INCOMPLETE: a member is unavailable; report it, do not substitute, do not claim the bar."
    echo ALLDONE; exit 0
fi
if [ -z "${UC_PANEL:-}" ]; then
    echo "No panel chosen: confirm the critics with the user (suggested: Claude Opus + GPT Sol, high) and set UC_COUNCIL, or set UC_PANEL=steer|waterfall|full for the cheap judges." >&2; exit 4
fi
PANEL="$UC_PANEL"
echo "Running UI critics with UC_PANEL=$PANEL..."

case "$PANEL" in
    steer)
        # Fast, low-cost screening during early iteration
        run ollama-cloud/deepseek-v4.1-flash deepseek &
        run ollama-cloud/kimi-k3 kimi &
        wait
        ;;
    waterfall)
        # Tier 1 Screener: fast/cheap models first
        echo "=== Tier 1 Screener ==="
        run ollama-cloud/deepseek-v4.1-flash deepseek &
        run ollama-cloud/kimi-k3 kimi &
        wait

        # Check that screener produced valid output
        ds_lines=$(wc -l < "${UC_BLIND:-blind}/out/deepseek.jsonl" 2>/dev/null || echo 0)
        km_lines=$(wc -l < "${UC_BLIND:-blind}/out/kimi.jsonl" 2>/dev/null || echo 0)

        if [ "$ds_lines" -eq 0 ] && [ "$km_lines" -eq 0 ]; then
            echo "Tier 1 screener failed (no verdicts returned). Halting before burning Tier 2 tokens."
            exit 1
        fi

        echo "=== Tier 2 Full Panel ==="
        run ollama-cloud/glm-5.3-flash glm &
        run ollama-cloud/minimax-m3.1-flash minimax &
        run ollama-cloud/mistral-large-4 mistral &
        wait
        ;;
    full|*)
        # Default: Full multi-lab panel concurrently
        run ollama-cloud/deepseek-v4.1-flash deepseek &
        run ollama-cloud/glm-5.3-flash glm &
        run ollama-cloud/kimi-k3 kimi &
        run ollama-cloud/minimax-m3.1-flash minimax &
        run ollama-cloud/mistral-large-4 mistral &
        wait
        ;;
esac

echo ALLDONE
