#!/usr/bin/env bash
# agents - install script
# Clones the repo (if needed), symlinks agents to Claude Code,
# and runs a verification pass.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/shuff57/agent-evo/main/install.sh | bash
#   # or after cloning:
#   bash install.sh

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
REPO_URL="${AGENTS_REPO_URL:-https://github.com/shuff57/agent-evo.git}"
INSTALL_DIR="${AGENTS_DIR:-$HOME/Documents/GitHub/agent-evo}"
CLAUDE_DIR="$HOME/.claude"

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
fail()  { echo -e "${RED}[fail]${NC}  $*"; }

# ── Platform detection ──────────────────────────────────────────────────────
detect_platform() {
  case "$(uname -s)" in
    Linux*)   PLATFORM="linux" ;;
    Darwin*)  PLATFORM="macos" ;;
    MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
    *)        PLATFORM="unknown" ;;
  esac
  info "Platform: $PLATFORM"
}

# ── Prerequisites ───────────────────────────────────────────────────────────
check_prereqs() {
  info "Checking prerequisites..."

  if ! command -v git &>/dev/null; then
    fail "git is required but not installed"
    exit 1
  fi
  ok "git found"

  if command -v claude &>/dev/null; then
    ok "Claude Code found: $(claude --version 2>/dev/null | head -1)"
  else
    fail "Claude Code not found. Install it:"
    echo "  https://docs.anthropic.com/en/docs/claude-code"
    exit 1
  fi
}

# ── Clone or update repo ───────────────────────────────────────────────────
setup_repo() {
  if [ -d "$INSTALL_DIR/.git" ]; then
    info "Repo exists at $INSTALL_DIR — pulling latest..."
    (cd "$INSTALL_DIR" && git pull --ff-only origin main 2>/dev/null || git pull --ff-only origin master 2>/dev/null) || warn "Pull failed — using existing version"
    ok "Repo updated"
  elif [ -d "$INSTALL_DIR/roster" ]; then
    info "Repo found at $INSTALL_DIR (not a git clone — using as-is)"
    ok "Using existing directory"
  else
    info "Cloning repo to $INSTALL_DIR..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    ok "Cloned"
  fi
}

# ── Backup and symlink ─────────────────────────────────────────────────────

# Check if a path is a Windows junction (NTFS reparse point).
# -L is unreliable for junctions in Git Bash / MSYS2.
is_junction() {
  local p="$1"
  if [ "$PLATFORM" = "windows" ]; then
    local win_p
    win_p="$(cygpath -w "$p")"
    powershell -Command "(Get-Item -LiteralPath '$win_p' -ErrorAction SilentlyContinue).Attributes -match 'ReparsePoint'" 2>/dev/null | grep -qi 'true'
  else
    [ -L "$p" ]
  fi
}

# Resolve the target of a symlink or junction, normalised to a Unix path.
resolve_link() {
  local p="$1"
  if [ "$PLATFORM" = "windows" ]; then
    local win_p raw
    win_p="$(cygpath -w "$p")"
    raw="$(powershell -Command "(Get-Item -LiteralPath '$win_p').Target" 2>/dev/null)"
    cygpath -u "$raw" 2>/dev/null || echo "$raw"
  else
    readlink "$p" 2>/dev/null || readlink -f "$p" 2>/dev/null
  fi
}

# Remove a symlink or junction without following it into the target.
remove_link() {
  local p="$1"
  if [ "$PLATFORM" = "windows" ]; then
    local win_p
    win_p="$(cygpath -w "$p")"
    # Use PowerShell to remove junction pointer without following target.
    # (Get-Item).Delete() removes the reparse point, not the target contents.
    powershell -Command "(Get-Item -LiteralPath '$win_p').Delete()" 2>/dev/null
  else
    rm "$p"
  fi
}

backup_and_link() {
  local target="$1"
  local source="$2"
  local label="$3"

  # Already correctly linked (symlink or junction)
  if is_junction "$target"; then
    local current
    current="$(resolve_link "$target")"
    # Normalise both to Unix paths for reliable comparison
    local norm_current norm_source
    norm_current="$(cygpath -u "$current" 2>/dev/null || echo "$current")"
    norm_source="$(cygpath -u "$source" 2>/dev/null || echo "$source")"
    if [ "$norm_current" = "$norm_source" ]; then
      ok "$label already linked"
      return
    fi
    info "$label linked elsewhere ($norm_current) — replacing"
    remove_link "$target"
  elif [ -d "$target" ]; then
    # Regular directory — back it up safely
    if [ -d "${target}.bak" ]; then
      warn "${target}.bak already exists — removing old backup"
      rm -rf "${target}.bak"
    fi
    info "Backing up existing $label to ${target}.bak"
    mv "$target" "${target}.bak"
  fi

  mkdir -p "$(dirname "$target")"

  if [ "$PLATFORM" = "windows" ]; then
    local win_target win_source
    win_target="$(cygpath -w "$target")"
    win_source="$(cygpath -w "$source")"
    powershell -Command "New-Item -ItemType Junction -Path '$win_target' -Target '$win_source'" > /dev/null
  else
    ln -sfn "$source" "$target"
  fi
  ok "$label linked -> $source"
}

backup_and_link_file() {
  local target="$1"
  local source="$2"
  local label="$3"

  # Already correctly linked
  if [ -L "$target" ] || is_junction "$target"; then
    local current
    current="$(resolve_link "$target")"
    local norm_current norm_source
    norm_current="$(cygpath -u "$current" 2>/dev/null || echo "$current")"
    norm_source="$(cygpath -u "$source" 2>/dev/null || echo "$source")"
    if [ "$norm_current" = "$norm_source" ]; then
      ok "$label already linked"
      return
    fi
    info "$label linked elsewhere ($norm_current) — replacing"
    rm -f "$target"
  elif [ -f "$target" ]; then
    info "Backing up existing $label to ${target}.bak"
    mv "$target" "${target}.bak"
  fi

  mkdir -p "$(dirname "$target")"

  if [ "$PLATFORM" = "windows" ]; then
    local win_target win_source
    win_target="$(cygpath -w "$target")"
    win_source="$(cygpath -w "$source")"
    cmd //c "mklink \"$win_target\" \"$win_source\"" > /dev/null 2>&1 || ln -sf "$source" "$target"
  else
    ln -sf "$source" "$target"
  fi
  ok "$label linked -> $source"
}

link_all() {
  info "Linking agents, skills, memory, commands, and hooks..."

  backup_and_link "$CLAUDE_DIR/agents" "$INSTALL_DIR/roster" "Claude Code agents"
  backup_and_link "$CLAUDE_DIR/skills" "$INSTALL_DIR/skills" "Claude Code skills"
  backup_and_link "$CLAUDE_DIR/memory" "$INSTALL_DIR/memory" "Claude Code memory"

  # Symlink settings.json
  if [ -f "$INSTALL_DIR/settings.json" ]; then
    backup_and_link_file "$CLAUDE_DIR/settings.json" "$INSTALL_DIR/settings.json" "Claude Code settings"
  fi

  # Symlink global CLAUDE.md
  if [ -f "$INSTALL_DIR/CLAUDE.md" ]; then
    backup_and_link_file "$CLAUDE_DIR/CLAUDE.md" "$INSTALL_DIR/CLAUDE.md" "Claude Code global instructions"
  fi

  # Link custom commands (ultrawork, deep-interview, etc.)
  mkdir -p "$CLAUDE_DIR/commands" "$CLAUDE_DIR/hooks"
  if [ -d "$INSTALL_DIR/commands" ]; then
    for cmd in "$INSTALL_DIR/commands/"*.md; do
      [ -f "$cmd" ] || continue
      local cmd_name
      cmd_name="$(basename "$cmd")"
      cp -f "$cmd" "$CLAUDE_DIR/commands/$cmd_name"
    done
    ok "Claude Code commands synced"
  fi

  # Link custom hooks
  if [ -d "$INSTALL_DIR/hooks" ]; then
    for hook in "$INSTALL_DIR/hooks/"*; do
      [ -f "$hook" ] || continue
      local hook_name
      hook_name="$(basename "$hook")"
      cp -f "$hook" "$CLAUDE_DIR/hooks/$hook_name"
    done
    ok "Claude Code hooks synced"
  fi
}

# ── Evolution Engine ───────────────────────────────────────────────────────
install_evolution() {
  info "Setting up evolution workspace..."

  # Install Hermes memory backend (source install only — not available on PyPI)
  if command -v uv &>/dev/null; then
    info "Installing Hermes memory backend (NousResearch/hermes-agent)..."
    if git clone --recurse-submodules https://github.com/NousResearch/hermes-agent.git ~/hermes-agent 2>/dev/null; then
      (
        cd ~/hermes-agent || exit 1
        uv venv venv --python 3.11 --quiet 2>/dev/null || { warn "Hermes venv creation failed (Python 3.11 required) — memory will use fallback JSONL"; exit 1; }
        VIRTUAL_ENV="$(pwd)/venv" uv pip install -e "." --quiet 2>/dev/null || { warn "Hermes pip install failed — memory will use fallback JSONL"; exit 1; }
        mkdir -p ~/.local/bin
        ln -sf ~/hermes-agent/venv/bin/hermes ~/.local/bin/hermes
        mkdir -p ~/.hermes/{memories,skills,sessions,logs}
        ok "Hermes memory backend installed (~/.local/bin/hermes)"
      ) || true
    else
      warn "Hermes clone failed — memory will use fallback JSONL"
    fi

  else
    warn "uv not found — skipping Hermes install (memory will use fallback JSONL)"
    warn "To install manually: https://github.com/NousResearch/hermes-agent"
  fi

  # Create _workspace directories (gitignored, device-local)
  mkdir -p "$INSTALL_DIR/_workspace/_metrics"
  mkdir -p "$INSTALL_DIR/_workspace/_evolution_staged"
  mkdir -p "$INSTALL_DIR/_workspace/_deprecated_skills"
  mkdir -p "$INSTALL_DIR/_workspace/_skill_audit"
  mkdir -p "$INSTALL_DIR/_workspace/_memory"
  ok "Workspace directories created"

  # Create gen-0 factory snapshot if it doesn't exist
  if [ ! -d "$INSTALL_DIR/evolution/backups/gen-0" ]; then
    info "Creating gen-0 factory snapshot..."
    mkdir -p "$INSTALL_DIR/evolution/backups/gen-0"
    cp "$INSTALL_DIR/roster/"*.md "$INSTALL_DIR/evolution/backups/gen-0/" 2>/dev/null
    cp "$INSTALL_DIR/roster/teams.yaml" "$INSTALL_DIR/evolution/backups/gen-0/" 2>/dev/null
    cp "$INSTALL_DIR/roster/agent-chain.yaml" "$INSTALL_DIR/evolution/backups/gen-0/" 2>/dev/null
    ok "Gen-0 factory snapshot created ($(ls "$INSTALL_DIR/evolution/backups/gen-0/" | wc -l) files)"
  else
    ok "Gen-0 factory snapshot already exists"
  fi

  # Ensure .gitignore covers _workspace
  if [ -f "$INSTALL_DIR/.gitignore" ]; then
    if ! grep -q "_workspace" "$INSTALL_DIR/.gitignore"; then
      echo "_workspace/" >> "$INSTALL_DIR/.gitignore"
      ok "Updated .gitignore"
    fi
  fi

  ok "Evolution workspace ready"
}

# ── Graphify ────────────────────────────────────────────────────────────────
# Per-device bootstrap for the knowledge graph. The graph itself is NEVER
# synced (derived data, tens of MB) — each device builds its own. What travels
# is: the repo's tracked .githooks/ + .graphifyignore, and this function.
# Graceful: warns and continues if Python is unavailable.
install_graphify() {
  info "Installing graphify knowledge graph..."

  local PY=""
  if [ -n "${WINDIR:-}" ] || [ -n "${MSYSTEM:-}" ]; then
    for v in Python314 Python313 Python312 Python311 Python310; do
      [ -f "$HOME/AppData/Local/Programs/Python/$v/python.exe" ] && \
        PY="$HOME/AppData/Local/Programs/Python/$v/python.exe" && break
    done
  fi
  [ -z "$PY" ] && PY="$(command -v python3 || command -v python || true)"
  if [ -z "$PY" ]; then
    warn "Python not found — skipping graphify (manual: pip install graphifyy mcp)"
    return 0
  fi

  # tree_sitter_sql ships in the [sql] extra; without it .sql files contribute
  # nothing to the graph. Probed alongside graphify so a machine installed before
  # the extra was added still picks it up instead of short-circuiting on "already
  # installed".
  if PYTHONUTF8=1 "$PY" -c "import graphify, tree_sitter_sql" &>/dev/null 2>&1; then
    ok "graphifyy already installed"
  else
    PYTHONUTF8=1 "$PY" -m pip install "graphifyy[sql]" mcp --quiet 2>/dev/null \
      && ok "graphifyy installed" \
      || { warn "pip install graphifyy failed — skipping graphify"; return 0; }
  fi

  # Upstream feeds raw .svelte files to the JS grammar, collapsing each SFC to one
  # top-level ERROR node — every script-block symbol is lost and only the file node
  # survives. Re-applied on every install because pip overwrites site-packages.
  PYTHONUTF8=1 "$PY" "$INSTALL_DIR/patches/graphify-svelte-symbols.py" &>/dev/null \
    && ok "svelte extractor patched" \
    || warn "svelte patch skipped — run patches/graphify-svelte-symbols.py to see why"

  # Read path: PreToolUse guard in ~/.claude/settings.json. Nudges the agent to
  # `graphify query` before grepping. Silent in repos with no graph, so it is
  # registered once, globally, and needs no per-repo install.
  # GRAPHIFY_HOOK_STRICT=1 upgrades the nudge to a hard block (no reinstall).
  PYTHONUTF8=1 "$PY" - "$HOME/.claude/settings.json" <<'PYEOF' && ok "Read-path hook registered in ~/.claude/settings.json"
import json, sys, shutil
from pathlib import Path
p = Path(sys.argv[1])
exe = shutil.which("graphify") or ""
if not exe:
    print("  graphify exe not on PATH — hook not registered"); sys.exit(0)
exe = exe.replace("\\", "/")
s = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
pre = [h for h in s.setdefault("hooks", {}).setdefault("PreToolUse", [])
       if "graphify" not in json.dumps(h)]
for matcher, kind in (("Bash|Grep", "search"), ("Read|Glob", "read")):
    pre.append({"matcher": matcher,
                "hooks": [{"type": "command", "command": f'"{exe}" hook-guard {kind}'}]})
s["hooks"]["PreToolUse"] = pre
p.write_text(json.dumps(s, indent=2) + "\n", encoding="utf-8")
PYEOF

  # Write path: repos that ship a tracked .githooks/ only need core.hooksPath
  # pointed at it (a LOCAL config, so it never clones — this is the one command
  # a fresh clone always needs). Repos without one get hooks installed directly.
  local repo
  for repo in "$@"; do
    [ -d "$repo/.git" ] || continue
    if [ -d "$repo/.githooks" ]; then
      git -C "$repo" config --local core.hooksPath .githooks
      ok "$(basename "$repo"): core.hooksPath -> .githooks"
    else
      (cd "$repo" && PYTHONUTF8=1 "$PY" -m graphify hook install) &>/dev/null \
        && ok "$(basename "$repo"): git hooks installed"
    fi
    # Build now rather than waiting for the first commit: hook-guard is silent
    # without a graph, so a fresh machine would grep blind until you happen to
    # commit to that repo.
    if [ ! -f "$repo/graphify-out/graph.json" ]; then
      info "$(basename "$repo"): building initial graph..."
      (cd "$repo" && PYTHONUTF8=1 "$PY" -m graphify update .) &>/dev/null \
        && ok "$(basename "$repo"): graph built" \
        || warn "$(basename "$repo"): initial build failed — next commit retries"
    fi
  done

  ok "Graphify setup complete"
}

# ── Verify ──────────────────────────────────────────────────────────────────
verify() {
  info "Verifying installation..."
  local errors=0

  # Check roster exists
  if [ ! -f "$INSTALL_DIR/roster/test-ping.md" ]; then
    fail "Roster not found at $INSTALL_DIR/roster/"
    errors=$((errors + 1))
  fi

  # Count agents
  local agent_count
  agent_count=$(ls "$INSTALL_DIR/roster/"*.md 2>/dev/null | grep -cv README || echo 0)
  if [ "$agent_count" -lt 20 ]; then
    fail "Expected 20+ agents, found $agent_count"
    errors=$((errors + 1))
  else
    ok "$agent_count agents in roster"
  fi

  # Check teams and chains
  if [ -f "$INSTALL_DIR/roster/teams.yaml" ]; then
    local team_count
    team_count=$(grep -c '^[a-z]' "$INSTALL_DIR/roster/teams.yaml")
    ok "$team_count teams defined"
  else
    fail "teams.yaml not found"
    errors=$((errors + 1))
  fi

  if [ -f "$INSTALL_DIR/roster/agent-chain.yaml" ]; then
    local chain_count
    chain_count=$(grep -c '^[a-z]' "$INSTALL_DIR/roster/agent-chain.yaml")
    ok "$chain_count chains defined"
  else
    fail "agent-chain.yaml not found"
    errors=$((errors + 1))
  fi

  # Count skills
  local skill_count
  skill_count=$(ls -d "$INSTALL_DIR/skills/"*/ 2>/dev/null | wc -l)
  if [ "$skill_count" -lt 10 ]; then
    fail "Expected 10+ skills, found $skill_count"
    errors=$((errors + 1))
  else
    ok "$skill_count skills in skills/"
  fi

  # Check memory dir
  if [ -d "$INSTALL_DIR/memory" ]; then
    ok "Memory directory found"
  else
    fail "Memory directory missing"
    errors=$((errors + 1))
  fi

  # Verify symlinks resolve AND point to the correct targets
  verify_link() {
    local link_path="$1" expected_source="$2" label="$3" probe="$4"
    if [ ! -e "$probe" ]; then
      fail "$label link broken (cannot reach $probe)"
      errors=$((errors + 1))
      return
    fi
    if is_junction "$link_path"; then
      local actual
      actual="$(resolve_link "$link_path")"
      local norm_actual norm_expected
      norm_actual="$(cygpath -u "$actual" 2>/dev/null || echo "$actual")"
      norm_expected="$(cygpath -u "$expected_source" 2>/dev/null || echo "$expected_source")"
      if [ "$norm_actual" != "$norm_expected" ]; then
        fail "$label points to $norm_actual (expected $norm_expected)"
        errors=$((errors + 1))
        return
      fi
    fi
    ok "$label OK"
  }

  verify_link "$CLAUDE_DIR/agents" "$INSTALL_DIR/roster" "Claude Code agents" "$CLAUDE_DIR/agents/test-ping.md"
  verify_link "$CLAUDE_DIR/skills" "$INSTALL_DIR/skills" "Claude Code skills" "$CLAUDE_DIR/skills/browser-use"
  verify_link "$CLAUDE_DIR/memory" "$INSTALL_DIR/memory" "Claude Code memory" "$CLAUDE_DIR/memory"
  verify_link "$CLAUDE_DIR/settings.json" "$INSTALL_DIR/settings.json" "Claude Code settings" "$CLAUDE_DIR/settings.json"

  # Validate agent frontmatter
  info "Validating agent frontmatter..."
  local bad_agents=0
  for f in "$INSTALL_DIR/roster/"*.md; do
    [ "$(basename "$f")" = "README.md" ] && continue
    if ! head -1 "$f" | grep -q '^---'; then
      fail "$(basename "$f") — missing frontmatter"
      bad_agents=$((bad_agents + 1))
    fi
    if ! grep -q '^name:' "$f"; then
      fail "$(basename "$f") — missing name field"
      bad_agents=$((bad_agents + 1))
    fi
    if ! grep -q '^description:' "$f"; then
      fail "$(basename "$f") — missing description field"
      bad_agents=$((bad_agents + 1))
    fi
  done
  if [ "$bad_agents" -eq 0 ]; then
    ok "All agents have valid frontmatter"
  fi

  # Check for orphaned team references
  info "Checking team references..."
  local orphans=0
  while IFS= read -r agent_name; do
    agent_name=$(echo "$agent_name" | sed 's/^[[:space:]]*- //' | tr -d '[:space:]')
    [ -z "$agent_name" ] && continue
    [[ "$agent_name" =~ ^# ]] && continue
    [[ "$agent_name" =~ : ]] && continue
    if [ ! -f "$INSTALL_DIR/roster/${agent_name}.md" ]; then
      fail "Team references '$agent_name' but ${agent_name}.md not found"
      orphans=$((orphans + 1))
    fi
  done < <(grep '^\s*-' "$INSTALL_DIR/roster/teams.yaml")
  if [ "$orphans" -eq 0 ]; then
    ok "All team references resolve to agent files"
  fi

  # Verify evolution engine
  info "Checking evolution engine..."
  if [ -f "$INSTALL_DIR/roster/evolver.md" ]; then
    ok "evolver.md found in roster"
  else
    fail "evolver.md missing from roster"
    errors=$((errors + 1))
  fi

  for cfile in safety-checksums.json agent-pins.json model-pricing.json; do
    if [ -f "$INSTALL_DIR/evolution/config/$cfile" ]; then
      ok "evolution/config/$cfile found"
    else
      fail "evolution/config/$cfile missing"
      errors=$((errors + 1))
    fi
  done

  if [ -d "$INSTALL_DIR/evolution/backups/gen-0" ]; then
    ok "Gen-0 factory snapshot exists"
  else
    fail "Gen-0 factory snapshot missing"
    errors=$((errors + 1))
  fi

  if grep -q "_workspace" "$INSTALL_DIR/.gitignore" 2>/dev/null; then
    ok "_workspace is gitignored"
  else
    warn "_workspace not in .gitignore"
  fi

  echo ""
  if [ "$errors" -eq 0 ] && [ "$bad_agents" -eq 0 ] && [ "$orphans" -eq 0 ]; then
    echo -e "${GREEN}Installation verified successfully.${NC}"
  else
    echo -e "${RED}Installation has issues — see above.${NC}"
    return 1
  fi
}

# ── Summary ─────────────────────────────────────────────────────────────────
summary() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${GREEN}Agents framework installed${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  echo "  Roster:  $INSTALL_DIR/roster/"
  echo "  Skills:  $INSTALL_DIR/skills/"
  echo "  Memory:  $INSTALL_DIR/memory/"
  echo ""

  echo "  Claude Code:"
  echo "    agents -> $INSTALL_DIR/roster/"
  echo "    skills -> $INSTALL_DIR/skills/"
  echo "    memory -> $INSTALL_DIR/memory/"
  echo "    settings.json -> $INSTALL_DIR/settings.json"
  echo ""
  if [ -d "$INSTALL_DIR/evolution" ]; then
    echo "  Evolution Workspace:"
    echo "    config  -> $INSTALL_DIR/evolution/config/"
    echo "    backups -> $INSTALL_DIR/evolution/backups/"
    echo "    tests   -> $INSTALL_DIR/evolution/tests/"
    echo ""
  fi
  echo "  Edit agents/skills/memory in the repo — Claude Code sees changes instantly."
  echo ""

  echo "  Quick test:  claude -p 'use the test-ping agent'"
  echo ""
}

# ── Main ────────────────────────────────────────────────────────────────────
main() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Agents Framework Installer"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  detect_platform
  check_prereqs
  setup_repo
  link_all
  install_evolution
  # Every repo under GitHub/, not a hardcoded pair — the old two-repo list is why
  # only Syllabus and bookSHelf had hooks. Non-repos are skipped by the .git test,
  # as is an unmatched glob.
  install_graphify "$HOME"/Documents/GitHub/*/
  verify
  summary
}

main "$@"