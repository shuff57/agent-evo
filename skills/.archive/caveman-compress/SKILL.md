---
name: caveman-compress
description: >
  Compress natural language memory files (CLAUDE.md, todos, preferences, Hermes memory notes)
  into caveman format to save input tokens every session. Preserves all technical substance,
  code, URLs, and structure. Compressed version overwrites the original file. Human-readable
  backup saved as FILE.original.md. Avg ~46% token reduction on prose-heavy files.
  Trigger: /caveman:compress <filepath> or "compress memory file" or "compress CLAUDE.md"
version: 1.0.0
author: JuliusBrussee (ported to Hermes by agent)
license: MIT
metadata:
  hermes:
    tags: [caveman, compress, token-saving, memory, optimization]
    homepage: https://github.com/JuliusBrussee/caveman
    related_skills: [caveman, caveman-commit, caveman-review]
---

# Caveman Compress

## Purpose

Compress natural language files (CLAUDE.md, todos, preferences, Hermes memory notes) into caveman-speak to reduce input tokens. Compressed version overwrites original. Human-readable backup saved as `<filename>.original.md`.

Avg savings per file type:
- preferences/CLAUDE.md: ~59%
- project-notes.md: ~53%
- todo lists: ~38%
- mixed code+prose: ~37%
- **Average: ~46%**

## Trigger

`/caveman:compress <filepath>` or when user asks to compress a memory/context file.

## Process

1. Read the target file
2. Create a backup at `<filepath>.original.md` (copy of original — preserve it)
3. Compress the file content using the rules below (apply directly, no external script needed)
4. Write compressed version back to `<filepath>`
5. Report: original token est, compressed token est, % saved

## Compression Rules

### Remove
- Articles: a, an, the
- Filler: just, really, basically, actually, simply, essentially, generally
- Pleasantries: "sure", "certainly", "of course", "happy to", "I'd recommend"
- Hedging: "it might be worth", "you could consider", "it would be good to"
- Redundant phrasing: "in order to" → "to", "make sure to" → "ensure", "the reason is because" → "because"
- Connective fluff: "however", "furthermore", "additionally", "in addition"

### Preserve EXACTLY (never modify)
- Code blocks (fenced ``` and indented)
- Inline code (`backtick content`)
- URLs and links (full URLs, markdown links)
- File paths (`/src/components/...`, `./config.yaml`)
- Commands (`npm install`, `git commit`, `docker build`)
- Technical terms (library names, API names, protocols, algorithms)
- Proper nouns (project names, people, companies)
- Dates, version numbers, numeric values
- Environment variables (`$HOME`, `NODE_ENV`)

### Preserve Structure
- All markdown headings (keep exact heading text, compress body below)
- Bullet point hierarchy (keep nesting level)
- Numbered lists (keep numbering)
- Tables (compress cell text, keep structure)
- Frontmatter/YAML headers in markdown files

### Compress
- Use short synonyms: "big" not "extensive", "fix" not "implement a solution for", "use" not "utilize"
- Fragments OK: "Run tests before commit" not "You should always run tests before committing"
- Drop "you should", "make sure to", "remember to" — just state the action
- Merge redundant bullets that say the same thing differently
- Keep one example where multiple examples show the same pattern

## Critical Rule

Anything inside ``` ... ``` must be copied EXACTLY. Do not modify code blocks under any circumstances.

## Hermes-Specific Notes

This skill works on any markdown file. Especially useful for:
- `~/.hermes/AGENTS.md` or project CLAUDE.md files
- Hermes memory notes (the compact text stored in the memory tool)
- Any context file loaded every session

After compressing, verify the backup exists at `<filepath>.original.md` before reporting success.
