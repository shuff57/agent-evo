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

# omo team specs. COPIED, not symlinked -- and that is not a style choice: omo's
# on-disk team loader does not follow a symlinked team directory. Measured
# 2026-09-19 with ~/.omo/teams/build-review symlinked at this repo:
#
#   Team 'build-review' was not found. Expected
#   '/home/shuff57/.omo/teams/build-review/config.json'
#
# for a path that resolved and held valid JSON. Replacing the link with a real
# directory and the same bytes loaded first try. So this is a copy, and editing
# ~/.omo/teams/<name>/config.json directly is editing a build artifact -- the
# source is omo/teams/, and the edit is gone the next time this runs.
OMO_TEAMS="$HOME/.omo/teams"
if [ -d "$REPO/omo/teams" ]; then
  mkdir -p "$OMO_TEAMS"
  for spec in "$REPO/omo/teams/"*/; do
    [ -f "$spec/config.json" ] || continue
    name="$(basename "$spec")"
    # A previous install may have left the link this comment warns about.
    [ -L "$OMO_TEAMS/$name" ] && rm "$OMO_TEAMS/$name"
    mkdir -p "$OMO_TEAMS/$name"
    cp -f "$spec/config.json" "$OMO_TEAMS/$name/config.json"
    echo "Team spec: $name -> $OMO_TEAMS/$name/config.json"
  done
fi

# Skills. SYMLINKED, unlike the team specs directly above -- the two loaders behave
# differently and both were tested on 2026-09-19: the skill loader resolves a symlinked
# skill directory (verified by `opencode debug skill` reporting the linked skill at its
# ~/.config path), the team loader does not. Do not "make them consistent".
#
# Only the skills AGENTS.md actually references are installed. Every installed skill's
# frontmatter is injected on every turn whether it is used or not, so this list is a
# budget, not an oversight: these eight cost ~950 tokens, all 42 would cost ~5,100.
# A skill named in AGENTS.md but missing here is a dangling pointer -- add to both.
SKILLS="bro caveman caveman-commit fable gauntlet-loop handoff peer-bridge switch-computers"
OC_SKILL="$HOME/.config/opencode/skill"
mkdir -p "$OC_SKILL"
installed=0
missing=""
for s in $SKILLS; do
  if [ -f "$REPO/skills/$s/SKILL.md" ]; then
    ln -sfn "$REPO/skills/$s" "$OC_SKILL/$s"
    installed=$((installed + 1))
  else
    missing="$missing $s"
  fi
done
echo "Skills: $installed linked -> $OC_SKILL/"
[ -n "$missing" ] && echo "  WARNING: named in SKILLS but not in skills/:$missing"

echo ""
echo "Teams:  $(grep -c '^[a-z]' "$REPO/roster/teams.yaml" 2>/dev/null || echo 0)"
echo "Chains: $(grep -c '^[a-z]' "$REPO/roster/agent-chain.yaml" 2>/dev/null || echo 0)"
echo ""
echo "Done. Re-run this after ANY roster/, omo/teams/ or skills/ edit - the generated copies are not live."
