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
# budget, not an oversight: these six cost ~630 tokens, all 42 would cost ~5,100.
# A skill named in AGENTS.md but missing here is a dangling pointer -- add to both.
SKILLS="bro fable gauntlet-loop handoff peer-bridge switch-computers"
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

# Prune links this script no longer names. Without this the install only ever GROWS:
# dropping a name from SKILLS leaves that skill loaded forever, which is what happened
# when caveman and caveman-commit were dropped on 2026-09-19 -- they stayed in
# `opencode debug skill` until swept by hand. Only links INTO THIS REPO are removed; a
# real directory, or a link pointing elsewhere, belongs to another tool and is left.
pruned=0
for link in "$OC_SKILL"/*; do
  [ -L "$link" ] || continue
  name="$(basename "$link")"
  case " $SKILLS " in *" $name "*) continue ;; esac
  target="$(readlink -f "$link" 2>/dev/null || true)"
  case "$target" in "$REPO/skills/"*) rm "$link"; pruned=$((pruned + 1)) ;; esac
done

echo "Skills: $installed linked -> $OC_SKILL/"
if [ "$pruned" -gt 0 ]; then
  echo "  pruned $pruned stale link(s) no longer named in SKILLS"
fi
[ -n "$missing" ] && echo "  WARNING: named in SKILLS but not in skills/:$missing"

# Vendored third-party plugins. COPIED into ~/.config/opencode/plugins/ (PLURAL) --
# three separate reasons, none of them style:
#
#   1. plugins/ is a real device-local directory; plugin/ (SINGULAR) is a symlink to
#      this repo's opencode/plugin/. Both auto-load, proven 2026-09-19 with a throwaway
#      probe plugin. Copying into the singular one would vendor 45KB of someone else's
#      code into our own plugin dir for no gain.
#   2. chisle's entry is ESM requiring a CommonJS core out of chisle-hooks/ by relative
#      path, so the whole tree has to land together, package.json pin included.
#   3. a copy is what upstream's own installer does and is therefore the shape that has
#      actually been tested; symlinking a plugin dir is not something anyone has verified
#      on this box, and the team loader already proved the two behaviours can differ.
#
# Source of truth is opencode/vendor/<name>/ -- editing the installed copy is editing a
# build artifact. See opencode/vendor/chisle/README.md for provenance and the update
# procedure (do NOT run `npx chisle`: its installer also appends a ruleset to
# ~/.config/opencode/AGENTS.md, which is a symlink into this repo).
OC_PLUGINS="$HOME/.config/opencode/plugins"
if [ -d "$REPO/opencode/vendor" ]; then
  mkdir -p "$OC_PLUGINS"
  for v in "$REPO/opencode/vendor/"*/; do
    name="$(basename "$v")"
    n=0
    # Docs stay in the repo; only runtime files are installed.
    for f in "$v"*.js "$v"*/; do
      [ -e "$f" ] || continue
      case "$f" in */README.md|*/LICENSE) continue ;; esac
      cp -rf "$f" "$OC_PLUGINS/" && n=$((n + 1))
    done
    echo "Vendor: $name -> $OC_PLUGINS/ ($n item(s))"
  done
fi

# Global instruction file. opencode resolves the GLOBAL layer by the same break-on-first
# walk as the project one -- ~/.config/opencode/AGENTS.md wins, and only falls through to
# ~/.claude/CLAUDE.md if it is absent -- so this symlink is what makes opencode/AGENTS.md
# load at all, in every directory, not just inside this repo.
#
# It was created BY HAND on 2026-09-17 and nothing recreated it: neither this script nor
# install.sh touched it until 2026-09-19. That was invisible while one box had it, and
# would have cost the next box the whole message-center protocol silently. The project
# AGENTS.md now points here for that protocol rather than repeating it, so the link is
# load-bearing, not convenience.
OC_CONF="$HOME/.config/opencode"
if [ -f "$REPO/opencode/AGENTS.md" ]; then
  mkdir -p "$OC_CONF"
  # A real file here is someone else's global instructions, not ours to clobber. Back it
  # up rather than overwrite, then link -- the same non-destructive shape install.sh uses.
  if [ -e "$OC_CONF/AGENTS.md" ] && [ ! -L "$OC_CONF/AGENTS.md" ]; then
    mv "$OC_CONF/AGENTS.md" "$OC_CONF/AGENTS.md.pre-agent-evo.bak"
    echo "Global:  backed up existing AGENTS.md -> AGENTS.md.pre-agent-evo.bak"
  fi
  ln -sfn "$REPO/opencode/AGENTS.md" "$OC_CONF/AGENTS.md"
  echo "Global:  AGENTS.md -> $OC_CONF/AGENTS.md"
fi

echo ""
echo "Teams:  $(grep -c '^[a-z]' "$REPO/roster/teams.yaml" 2>/dev/null || echo 0)"
echo "Chains: $(grep -c '^[a-z]' "$REPO/roster/agent-chain.yaml" 2>/dev/null || echo 0)"
echo ""
echo "Done. Re-run this after ANY roster/, omo/teams/, skills/ or opencode/vendor/ edit - the generated copies are not live."
