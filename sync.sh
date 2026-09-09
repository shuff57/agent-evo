#!/bin/bash
# Sync agent roster to Claude Code + opencode.
# Run after cloning, or whenever roster/ changes.
#
# This used to symlink ~/.claude/agents -> roster/. It no longer does, and must
# not: roster/ is now the SINGLE SOURCE for both CLIs, and the two consumers get
# DIFFERENT files generated from it --
#
#   roster/<name>.md
#        |
#        +-- ~/.claude/agents/         claude-lane: verbatim copy
#        |                             ollama-lane: thin forwarder -> opencode run
#        |
#        +-- ~/.config/opencode/agents/  ollama-lane: full body + ollama model
#
# A symlink would serve the same file to both, so every ollama-lane agent would
# run on Claude instead of spawning opencode. bin/gen-agents.mjs owns this now.

set -e

REPO="$(cd "$(dirname "$0")" && pwd)"
CLAUDE="$HOME/.claude/agents"

# The old layout left a symlink here. Remove the LINK only - never recurse, or
# rm follows it straight into roster/ and deletes the source.
if [ -L "$CLAUDE" ]; then
  echo "Removing legacy symlink: $CLAUDE"
  rm "$CLAUDE"
fi

node "$REPO/bin/gen-agents.mjs"

echo ""
echo "Teams:  $(grep -c '^[a-z]' "$REPO/roster/teams.yaml" 2>/dev/null || echo 0)"
echo "Chains: $(grep -c '^[a-z]' "$REPO/roster/agent-chain.yaml" 2>/dev/null || echo 0)"
echo ""
echo "Done. Re-run this after ANY roster/ edit - the generated copies are not live."
