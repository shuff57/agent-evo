#!/bin/bash
# run_critics.sh — Execute multimodal design critics across model families
# Primary panel = the council: UC_COUNCIL="provider:model provider:model provider:model" (3 distinct
# providers, chosen with the user via the council skill, Step 1). Set it and the council runs critic.md.
# Modes (cheap ollama-cloud judges, used when UC_COUNCIL is unset or alongside it via UC_PANEL):
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

if [ -n "${UC_COUNCIL:-}" ] && [ -z "${UC_PANEL:-}" ]; then
    read -r -a MEMBERS <<< "$UC_COUNCIL"
    provs=$(for m in "${MEMBERS[@]}"; do echo "${m%%:*}"; done | sort -u | wc -l)
    if [ "${#MEMBERS[@]}" -ne 3 ] || [ "$provs" -ne 3 ]; then
        echo "council needs 3 members from 3 different providers; do not substitute" >&2; exit 3
    fi
    echo "Running UI critics as the council..."
    . "$(dirname "$(readlink -f "$0")")/t3_run.sh"
    n=$(grep -c . "${UC_BLIND:-blind}/manifest.txt" 2>/dev/null); n=${n:-1}
    for m in "${MEMBERS[@]}"; do
        prov=${m%%:*}; model=${m#*:}
        t3_member "$prov" "$model" "critic-$prov" "${UC_CRITIC:-critic.md}" "${UC_BLIND:-blind}/out/$prov.jsonl" "$n" . &
        sleep "${UC_STAGGER:-20}"   # simultaneous starts contend for MCP registration (2026-11-08)
    done
    wait
    ls "${UC_BLIND:-blind}"/out/*.unavailable 2>/dev/null && echo "COUNCIL INCOMPLETE: a member is unavailable; report it, do not substitute, do not claim the bar."
    echo ALLDONE; exit 0
fi
if [ -z "${UC_PANEL:-}" ]; then
    echo "No panel chosen: ask the user for council members (council skill, Step 1) and set UC_COUNCIL, or set UC_PANEL=steer|waterfall|full for the cheap judges." >&2; exit 4
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
