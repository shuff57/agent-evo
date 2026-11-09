#!/bin/bash
# t3_run.sh - start one judge/council thread and survive startup failures. Sourced by
# run_critics.sh and run_council.sh.
#
#   t3_member PROVIDER MODEL NAME PROMPT_FILE OUTFILE WANT_LINES LOGDIR
#
# Why: a thread can die before it reads a single image. Measured 2026-11-08: a claudeAgent judge
# failed with "Claude timed out while registering its MCP tools" while two other providers were
# starting at the same moment; the old one-shot retry fired at once, hit the same wall, and the
# member contributed nothing. Counting lines alone cannot tell that apart from a judge that stopped
# early, so this reads the thread's own status and error.
#
# - Startup/infra errors (MCP registration timeout, overloaded, rate or usage limit, connection
#   reset) are retried with backoff: UC_BACKOFF (default "45 120 300") seconds between tries.
# - A run that completed but wrote fewer than WANT_LINES lines is re-run once more at most, and the
#   re-run MERGES only the ids the first pass missed (a retry never truncates real verdicts; r9 lost
#   90 lines that way).
# - Anything else (a real error) is not retried blindly: it is reported.
# - Persistent failure writes OUTFILE.unavailable with the last error and returns 3. The caller
#   reports the member as unavailable. Never substitute another model (council rule).

INFRA_RE='registering its MCP tools|timed out while (starting|connecting)|overloaded|rate.?limit|usage limit|429|503|ECONNRESET|socket hang up|temporarily unavailable'

_t3_merge() {  # merge ids from $2 missing in $1 into $1
python3 - "$1" "$2" <<'PY'
import json, sys
a, b = sys.argv[1:3]
def rows(f):
    try: lines = open(f).read().splitlines()
    except FileNotFoundError: return
    for l in lines:
        l = l.strip()
        if not l: continue
        for c in (l, l + '}'):
            try:
                o = json.loads(c); yield c, o.get('id', o.get('member', c)); break
            except Exception: pass
keep = list(rows(a)); ids = {i for _, i in keep}
keep += [(c, i) for c, i in rows(b) if i not in ids]
open(a, 'w').write(''.join(c + '\n' for c, _ in keep))
PY
}

t3_member() {
    local prov=$1 model=$2 name=$3 prompt=$4 out=$5 want=${6:-1} logd=${7:-.}
    local tries=0 shortruns=0 target status err got
    local delays=(${UC_BACKOFF:-45 120 300})
    rm -f "$out.unavailable"; : > "$out"
    while :; do
        target=$out; [ $tries -gt 0 ] && target="$out.try$tries" && : > "$target"
        sed "s#OUTFILE#$target#g" "$prompt" \
            | t3 thread start . - --title "ui $name" --provider "$prov" --model "$model" --wait --json \
                > "$logd/$name.json" 2> "$logd/$name.err"
        status=$(python3 -c 'import json,sys
try: d=json.loads(open(sys.argv[1]).read().strip().splitlines()[-1]); print(d.get("status",""))
except Exception: print("")' "$logd/$name.json")
        err=$(python3 -c 'import json,sys
try: d=json.loads(open(sys.argv[1]).read().strip().splitlines()[-1]); print(d.get("error") or "")
except Exception: print("")' "$logd/$name.json")
        [ -z "$err" ] && err=$(grep -vi warn "$logd/$name.err" | grep -iE "fail|error|timed out" | tail -1)
        [ "$target" != "$out" ] && _t3_merge "$out" "$target"
        got=$(grep -c . "$out" 2>/dev/null); got=${got:-0}
        if [ "$got" -ge "$want" ]; then echo "$name ok lines=$got/$want tries=$((tries+1))"; return 0; fi
        if [ "$status" != completed ] && echo "$err" | grep -qiE "$INFRA_RE"; then
            if [ $tries -lt ${#delays[@]} ]; then
                echo "$name startup/infra failure (try $((tries+1))): $err -- waiting ${delays[$tries]}s"
                sleep "${delays[$tries]}"; tries=$((tries+1)); continue
            fi
        elif [ "$status" = completed ] && [ $shortruns -lt 1 ]; then
            echo "$name short ($got/$want), re-running once for the missing ids"
            shortruns=1; tries=$((tries+1)); continue
        fi
        echo "status=$status lines=$got/$want error=$err" > "$out.unavailable"
        echo "$name UNAVAILABLE ($got/$want): ${err:-status $status}. Report it; do not substitute."
        return 3
    done
}
