---
name: handoff
description: Read and write HANDOFF.md files to persist and resume cross-context state. Use at session start to pick up where you left off, and at session end to save your place.
tags: [context, handoff, memory, session, workflow]
related_skills: [session-reflector, book-pipeline]
---

# Handoff

Persistent cross-session state via a plain HANDOFF.md file in the project root.
No external dependencies. Works in any project, any agent.

## When to Use

- START OF SESSION: user says "read HANDOFF.md", "pick up from there", "continue where we left off"
- END OF SESSION: work is paused mid-task, a chapter/step is done, or context is about to be lost
- PROACTIVELY: after completing a significant pipeline step or before switching tasks


## READING A HANDOFF (Session Start)

1. Locate the file. Default path: {project_root}/HANDOFF.md
   - bookSHelf: /mnt/c/Users/shuff57/Documents/GitHub/bookSHelf/HANDOFF.md
   - Other projects: check project root or ask user

2. Read with read_file(path).

3. Surface to user:
   - WHERE WE ARE (current state)
   - IMMEDIATE NEXT STEPS (exactly what to do next)
   - Any blockers or approval gates

4. Ask: "Ready to continue? I'll start with: [first next step]"

5. Do NOT start work until user confirms (unless the task is clearly "read and continue").


## WRITING A HANDOFF (Session End)

### Required Sections

```
# {Project Name} — Context Handoff

Last updated: {YYYY-MM-DD}
Repo: {absolute path}
Active project: {project or task name}

---

## WHERE WE ARE

{1-3 sentence description of current state}

Pipeline state (if applicable):
  {step}    {DONE/TODO/PARTIAL}  {brief note}
  ...

---

## IMMEDIATE NEXT STEPS

1. {Exactly what to do, with the actual command or action}
2. ...

---

## CANONICAL PROJECT LAYOUT   (update if structure changed)

  {key dirs and what they contain}

---

## PIPELINE ARCHITECTURE   (update if process changed)

  {ordered steps with script names}

---

## KEY SCRIPTS

  {script path}    {one-line purpose}
  ...

---

## REMASTER / QUALITY RULES   (project-specific)

  {rules that must be followed}

---

## AI PROVIDER SETUP

  {provider, model, config location}

---

## CHAPTER / TASK APPROVAL GATE

  {any gate conditions}

---

## MANIFEST / ARTIFACTS

  {manifest location, how to regenerate, current summary}

---

## RECENT COMMITS

  {last 3-5 commits, one line each}

---

## ENV QUIRKS

  {WSL2 gotchas, timeout settings, workarounds}
```

### Steps

1. Gather state:
   - Run git log --oneline -5 to get recent commits
   - Check which pipeline steps are DONE vs TODO (read output dirs, manifests)
   - Note the exact next command to run

2. Draft the file using the template above. Omit sections that don't apply.

3. Confirm with user before writing:
   > "Save handoff to {path}? [y/n/edit]"

4. Write with write_file(path, content).

5. Optionally commit: git add HANDOFF.md && git commit -m "handoff: {short description}"


## UPDATING MID-SESSION

After completing a pipeline step, update just the relevant fields:
- Pipeline state table (mark step DONE)
- IMMEDIATE NEXT STEPS (advance to next item)
- MANIFEST section (new artifact counts)
- Last updated date

Use patch() for surgical updates to avoid rewriting the whole file.

Example patch call:
  patch(
    path="HANDOFF.md",
    old_string="  remastered   TODO",
    new_string="  remastered   DONE  5 sections, Chapter_1_Remastered.md written"
  )


## GUARDRAILS

- Never start Ch2 (or next chapter) without explicit user go-ahead -- approval gate.
- Never overwrite HANDOFF.md without user confirmation.
- Always surface the IMMEDIATE NEXT STEPS section first -- that is the signal.
- If HANDOFF.md is missing, offer to create one from scratch.


## BOOKSHELF-SPECIFIC PATHS

  HANDOFF.md:   /mnt/c/Users/shuff57/Documents/GitHub/bookSHelf/HANDOFF.md
  Project root: /mnt/c/Users/shuff57/Documents/GitHub/bookSHelf/
  Pipeline:     scripts/workflows/pipeline.py
  Manifest:     projects/{book}/merge/MANIFEST_chN.json


## EXAMPLE: Reading and Resuming

User: "Read HANDOFF.md at /mnt/c/.../bookSHelf/HANDOFF.md and pick up from there."

Steps:
  1. read_file("/mnt/c/Users/shuff57/Documents/GitHub/bookSHelf/HANDOFF.md")
  2. Parse WHERE WE ARE and IMMEDIATE NEXT STEPS
  3. Report state concisely
  4. Confirm with user before executing the first next step
  5. After each step completes, patch HANDOFF.md to mark it done
