#!/usr/bin/env python3
"""Status line segment: Ollama Cloud plan + 7d usage. Cached 3 min.
Optional percent: ~/.cache/ollama-meter/limits.json {"session_pct":..,"week_pct":..,"ts":..} (written by ollama-limits scrape)."""
import json, os, sys, time, urllib.request
C = os.path.expanduser("~/.cache/ollama-meter"); os.makedirs(C, exist_ok=True)
CF = C + "/cache.json"
def fetch():
    key = json.load(open(os.path.expanduser("~/.config/ollama-cloud/credentials.json")))["apiKey"]
    def call(path, method):
        r = urllib.request.Request("https://ollama.com/api/" + path, method=method, headers={"Authorization": "Bearer " + key})
        return json.load(urllib.request.urlopen(r, timeout=8))
    plan = call("me", "POST").get("Plan", "?")
    t = call("usage", "GET")["totals"]
    return {"ts": time.time(), "plan": plan, "usd": t["usage_usd"], "req": t["request_count"]}
d = None
try:
    d = json.load(open(CF))
    if time.time() - d["ts"] > 180: d = None
except Exception: pass
if d is None:
    try:
        d = fetch(); json.dump(d, open(CF, "w"))
    except Exception:
        try: d = json.load(open(CF))
        except Exception: print("Ollama ?"); sys.exit(0)
out = f"Ollama {d['plan']} · 7d ${d['usd']:.2f} · {d['req']/1000:.1f}k req"
try:
    l = json.load(open(C + "/limits.json"))
    if time.time() - l["ts"] < 6 * 3600:
        out = f"Ollama {d['plan']} · sess {l['session_pct']:.0f}% · wk {l['week_pct']:.0f}% · 7d ${d['usd']:.2f}"
except Exception: pass
print(out)
