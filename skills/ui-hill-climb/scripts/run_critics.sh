#!/bin/bash
# run_critics.sh — Execute multimodal design critics across model families
# Modes:
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

PANEL="${UC_PANEL:-full}"
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
