#!/usr/bin/env bash
# agents — test script
# Runs after install to verify everything works end-to-end.
# Can also be used as a CI health check.
#
# Usage: bash test.sh [--live]
#   --live  Also test agent invocation via Claude Code (requires API access)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROSTER="$SCRIPT_DIR/roster"
LIVE_TEST=false
PASS=0
FAIL=0

[ "${1:-}" = "--live" ] && LIVE_TEST=true

ok()   { echo -e "  ${GREEN}PASS${NC}  $*"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}FAIL${NC}  $*"; FAIL=$((FAIL + 1)); }
info() { echo -e "${BLUE}──${NC} $*"; }

# ── Structure tests ─────────────────────────────────────────────────────────
info "Structure"

[ -d "$ROSTER" ] && ok "roster/ exists" || fail "roster/ missing"
[ -f "$ROSTER/teams.yaml" ] && ok "teams.yaml exists" || fail "teams.yaml missing"
[ -f "$ROSTER/agent-chain.yaml" ] && ok "agent-chain.yaml exists" || fail "agent-chain.yaml missing"
[ -d "$SCRIPT_DIR/skills" ] && ok "skills/ exists" || fail "skills/ missing"
[ -d "$SCRIPT_DIR/memory" ] && ok "memory/ exists" || fail "memory/ missing"

# ── Agent count ─────────────────────────────────────────────────────────────
info "Agent count"

agent_count=$(ls "$ROSTER/"*.md 2>/dev/null | grep -cv README || echo 0)
[ "$agent_count" -ge 29 ] && ok "$agent_count agents (expected 29+)" || fail "$agent_count agents (expected 29+)"

# ── Frontmatter validation ──────────────────────────────────────────────────
info "Frontmatter validation"

frontmatter_errors=0
for f in "$ROSTER/"*.md; do
  name=$(basename "$f" .md)
  [ "$name" = "README" ] && continue

  # Check opening ---
  if ! head -1 "$f" | grep -q '^---$'; then
    fail "$name — no opening ---"
    frontmatter_errors=$((frontmatter_errors + 1))
    continue
  fi

  # Check closing ---
  if ! sed -n '2,/^---$/p' "$f" | tail -1 | grep -q '^---$'; then
    fail "$name — no closing ---"
    frontmatter_errors=$((frontmatter_errors + 1))
    continue
  fi

  # Check required fields
  if ! grep -q '^name:' "$f"; then
    fail "$name — missing name:"
    frontmatter_errors=$((frontmatter_errors + 1))
  fi
  if ! grep -q '^description:' "$f"; then
    fail "$name — missing description:"
    frontmatter_errors=$((frontmatter_errors + 1))
  fi

  # Check name matches filename
  declared_name=$(grep '^name:' "$f" | head -1 | sed 's/^name:[[:space:]]*//')
  if [ "$declared_name" != "$name" ]; then
    fail "$name — name field is '$declared_name' (should match filename)"
    frontmatter_errors=$((frontmatter_errors + 1))
  fi
done
[ "$frontmatter_errors" -eq 0 ] && ok "All agents have valid frontmatter"

# ── System prompt body ──────────────────────────────────────────────────────
info "System prompt body"

empty_bodies=0
for f in "$ROSTER/"*.md; do
  name=$(basename "$f" .md)
  [ "$name" = "README" ] && continue

  # Extract body (everything after the closing --- of frontmatter)
  body=$(awk '/^---$/{n++; next} n>=2' "$f")
  body_chars=$(echo "$body" | tr -d '[:space:]' | wc -c)

  if [ "$body_chars" -lt 20 ]; then
    fail "$name — system prompt body is empty or too short ($body_chars chars)"
    empty_bodies=$((empty_bodies + 1))
  fi
done
[ "$empty_bodies" -eq 0 ] && ok "All agents have system prompt bodies"

# ── Team reference integrity ────────────────────────────────────────────────
info "Team reference integrity"

orphans=0
while IFS= read -r line; do
  agent_name=$(echo "$line" | sed 's/^[[:space:]]*- //' | tr -d '[:space:]')
  [ -z "$agent_name" ] && continue
  [[ "$agent_name" =~ ^# ]] && continue
  [[ "$agent_name" =~ : ]] && continue
  if [ ! -f "$ROSTER/${agent_name}.md" ]; then
    fail "teams.yaml references '$agent_name' — no ${agent_name}.md found"
    orphans=$((orphans + 1))
  fi
done < <(grep '^\s*-' "$ROSTER/teams.yaml")
[ "$orphans" -eq 0 ] && ok "All team members have agent files"

# ── Chain reference integrity ───────────────────────────────────────────────
info "Chain reference integrity"

chain_orphans=0
while IFS= read -r line; do
  agent_name=$(echo "$line" | sed 's/.*agent:[[:space:]]*//' | tr -d '[:space:]')
  [ -z "$agent_name" ] && continue
  if [ ! -f "$ROSTER/${agent_name}.md" ]; then
    fail "agent-chain.yaml references '$agent_name' — no ${agent_name}.md found"
    chain_orphans=$((chain_orphans + 1))
  fi
done < <(grep 'agent:' "$ROSTER/agent-chain.yaml")
[ "$chain_orphans" -eq 0 ] && ok "All chain agents have agent files"

# ── Symlink verification ───────────────────────────────────────────────────
info "Symlink verification"

CLAUDE_AGENTS="$HOME/.claude/agents"

if [ -L "$CLAUDE_AGENTS" ] || [ -d "$CLAUDE_AGENTS" ]; then
  if [ -f "$CLAUDE_AGENTS/test-ping.md" ]; then
    ok "Claude Code can see agents"
  else
    fail "Claude Code agents dir exists but test-ping.md not found"
  fi
else
  fail "Claude Code agents not linked ($CLAUDE_AGENTS)"
fi

# ── No platform-specific text ───────────────────────────────────────────────
info "Platform-agnostic check"

platform_refs=0
for f in "$ROSTER/"*.md; do
  [ "$(basename "$f")" = "README.md" ] && continue
  if grep -qi "for this pi workspace\|for this pi " "$f"; then
    fail "$(basename "$f") — contains platform-specific text"
    platform_refs=$((platform_refs + 1))
  fi
done
[ "$platform_refs" -eq 0 ] && ok "No platform-specific text in agent prompts"

# ── Skills check ────────────────────────────────────────────────────────────
info "Skills"

# Count all SKILL.md files recursively (handles namespaced sub-dirs like apple/, mlops/)
skill_count=$(find "$SCRIPT_DIR/skills" -name "SKILL.md" 2>/dev/null | wc -l)
[ "$skill_count" -gt 0 ] && ok "$skill_count skills available" || fail "No skills found"

# Every SKILL.md found IS a skill — so count == total by definition; just verify none are empty
skills_empty=0
while IFS= read -r skill_file; do
  [ ! -s "$skill_file" ] && skills_empty=$((skills_empty + 1))
done < <(find "$SCRIPT_DIR/skills" -name "SKILL.md" 2>/dev/null)
[ "$skills_empty" -eq 0 ] && ok "All skills have non-empty SKILL.md" || fail "$skills_empty skills have empty SKILL.md"

# ── Memory check ────────────────────────────────────────────────────────────
info "Memory"

[ -d "$SCRIPT_DIR/memory" ] && ok "Memory directory exists" || fail "Memory directory missing"

# ── Live test (optional) ───────────────────────────────────────────────────
if [ "$LIVE_TEST" = true ]; then
  info "Live agent test"

  if command -v claude &>/dev/null; then
    echo -n "  Invoking test-ping agent via Claude Code... "
    result=$(claude -p "You are the test-ping agent. Respond with exactly: pong" --max-turns 1 2>/dev/null || echo "ERROR")
    if echo "$result" | grep -qi "pong"; then
      ok "Claude Code agent invocation works"
    else
      fail "Claude Code agent invocation failed"
    fi
  fi
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
total=$((PASS + FAIL))
if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}All $total tests passed${NC}"
else
  echo -e "  ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC} (of $total)"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit "$FAIL"
