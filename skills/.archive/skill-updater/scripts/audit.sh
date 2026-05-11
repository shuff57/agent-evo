#!/usr/bin/env bash
# Audit skill directories and extract metadata for the skill-updater.
# Usage: audit.sh [skills-directory]
# Output: JSON array of skill metadata to stdout

set -euo pipefail

SKILLS_DIR="${1:-$HOME/.claude/skills}"

if [ ! -d "$SKILLS_DIR" ]; then
  echo "Error: Skills directory not found: $SKILLS_DIR" >&2
  exit 1
fi

echo "["
first=true

for entry in $(ls -1 "$SKILLS_DIR"); do
  skill_dir="$SKILLS_DIR/$entry"
  # Resolve symlinks and check it's a directory
  if [ -L "$skill_dir" ]; then
    is_symlink=true
    source_path=$(readlink -f "$skill_dir")
    [ -d "$source_path" ] || continue
  elif [ -d "$skill_dir" ]; then
    is_symlink=false
    source_path="$skill_dir"
  else
    continue
  fi
  skill_name="$entry"
  # Use source_path for file checks (follows symlinks correctly)
  skill_md="$source_path/SKILL.md"

  # is_symlink and source_path already set in loop header

  # Skip if no SKILL.md
  if [ ! -f "$skill_md" ]; then
    # Check for legacy single-file format
    legacy_count=$(find "$source_path" -maxdepth 1 -name "*.md" | wc -l)
    if [ "$legacy_count" -eq 0 ]; then
      continue
    fi
  fi

  # Extract metadata
  has_skill_md=false
  line_count=0
  has_frontmatter=false
  has_description=false
  description_starts_use_when=false
  description_length=0
  has_scripts_dir=false
  has_references_dir=false
  has_guardrails=false
  has_workflow=false
  guardrails_before_workflow=false
  has_error_handling=false
  has_common_mistakes=false
  has_limits=false
  has_state_management=false
  inline_code_blocks=0
  has_hardcoded_paths=false
  has_claude_skill_dir=false

  if [ -f "$skill_md" ]; then
    has_skill_md=true
    line_count=$(wc -l < "$skill_md")

    # Check frontmatter
    if head -1 "$skill_md" | grep -q "^---"; then
      has_frontmatter=true
    fi

    # Check description
    if grep -q "^description:" "$skill_md" 2>/dev/null; then
      has_description=true
      desc=$(grep "^description:" "$skill_md" | head -1 | sed 's/^description: *//')
      description_length=${#desc}
      if echo "$desc" | grep -qi "^Use when"; then
        description_starts_use_when=true
      fi
    fi

    # Check sections (|| true to prevent set -e from killing us)
    grep -qi "## Guardrails" "$skill_md" 2>/dev/null && has_guardrails=true || true
    grep -qi "## Workflow" "$skill_md" 2>/dev/null && has_workflow=true || true
    grep -qi "## Error Handling" "$skill_md" 2>/dev/null && has_error_handling=true || true
    grep -qi "## Common Mistakes" "$skill_md" 2>/dev/null && has_common_mistakes=true || true
    grep -qi "## Limits" "$skill_md" 2>/dev/null && has_limits=true || true
    grep -qi "## State Management" "$skill_md" 2>/dev/null && has_state_management=true || true

    # Check Guardrails before Workflow
    if $has_guardrails && $has_workflow; then
      guard_line=$(grep -ni "## Guardrails" "$skill_md" 2>/dev/null | head -1 | cut -d: -f1)
      work_line=$(grep -ni "## Workflow" "$skill_md" 2>/dev/null | head -1 | cut -d: -f1)
      if [ -n "$guard_line" ] && [ -n "$work_line" ] && [ "$guard_line" -lt "$work_line" ]; then
        guardrails_before_workflow=true
      fi
    fi

    # Count inline code blocks (``` markers)
    inline_code_blocks=$(grep -c '```' "$skill_md" 2>/dev/null) || inline_code_blocks=0
    inline_code_blocks=$((inline_code_blocks / 2))

    # Check for hardcoded paths
    if grep -qE '/(Users|home)/[a-zA-Z]' "$skill_md" 2>/dev/null; then
      has_hardcoded_paths=true
    fi

    # Check for CLAUDE_SKILL_DIR usage
    if grep -q 'CLAUDE_SKILL_DIR' "$skill_md" 2>/dev/null; then
      has_claude_skill_dir=true
    fi
  fi

  # Check directory structure
  [ -d "$source_path/scripts" ] && has_scripts_dir=true
  [ -d "$source_path/references" ] && has_references_dir=true

  # Output JSON
  if $first; then
    first=false
  else
    echo ","
  fi

  cat <<ENDJSON
  {
    "name": "$skill_name",
    "path": "$skill_dir",
    "sourcePath": "$source_path",
    "isSymlink": $is_symlink,
    "hasSkillMd": $has_skill_md,
    "lineCount": $line_count,
    "hasFrontmatter": $has_frontmatter,
    "hasDescription": $has_description,
    "descriptionStartsUseWhen": $description_starts_use_when,
    "descriptionLength": $description_length,
    "hasScriptsDir": $has_scripts_dir,
    "hasReferencesDir": $has_references_dir,
    "hasGuardrails": $has_guardrails,
    "hasWorkflow": $has_workflow,
    "guardrailsBeforeWorkflow": $guardrails_before_workflow,
    "hasErrorHandling": $has_error_handling,
    "hasCommonMistakes": $has_common_mistakes,
    "hasLimits": $has_limits,
    "hasStateManagement": $has_state_management,
    "inlineCodeBlocks": $inline_code_blocks,
    "hasHardcodedPaths": $has_hardcoded_paths,
    "hasClaudeSkillDir": $has_claude_skill_dir
  }
ENDJSON

done

echo ""
echo "]"
