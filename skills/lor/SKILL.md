---
name: lor
description: Draft a personalized letter of recommendation for a student in the teacher's own voice, grounded only in supplied source material. Use when asked to write a letter of recommendation, a letter of rec, a rec letter, an LOR, or a recommendation letter for a student.
---

# Letter of recommendation

## Purpose

Draft a letter of recommendation for a student, in the teacher's real voice, grounded only in
supplied facts. **Never invent an achievement, a grade, an award, or an anecdote.** Every concrete
claim in the letter must trace back to something the student or the teacher actually supplied.

## Inputs to gather

Ask for whichever of these exist. Accept a file path or pasted text for any of them. **Do not
require all of them** — work with what is given.

- The filled-out questionnaire — `questionnaire.md` in this skill directory. If the student has not
  filled it out yet, offer to hand them that file to copy and complete.
- The student's resume or profile.
- The teacher's own notes about the student.
- A "brag sheet" the student wrote.
- What the letter is *for* — college application and intended major, a named scholarship, a job or
  internship — plus any deadline, length, or format requirement the target program specifies.

## Drafting process

Collect what is available before writing. If a source is missing, proceed with what is given rather
than blocking, but say in your reply which sources you did **not** have.

Structure:

1. An opening establishing the relationship — how the teacher knows the student, for how long, in
   what capacity.
2. Two to three body paragraphs, each anchored to one specific, concrete example drawn from the
   supplied sources.
3. A closing statement of recommendation strength appropriate to the stated purpose.

**Hard rule: every concrete claim — a grade, an award, a project, a quote, an anecdote — must trace
back to one of the supplied sources. Never fabricate.** If the letter would be stronger with a
detail that is not in any source, ask the user for it rather than inventing it.

## Voice pass (mandatory)

Once a full draft exists, invoke the `humanizer` skill on it. Tell humanizer to use
`voice-shuff.md` — the voice profile shipped with the humanizer skill at
`skills/humanizer/voice-shuff.md` — as the voice profile, per humanizer's own voice-calibration
rules.

Humanizer only uses a profile when it is asked for by name. These are Steven's own letters, so this
skill always asks for `voice-shuff.md` by name.

## Output

Save the finished letter as a markdown file to
`~/Desktop/letters-of-rec/<student-name>-<purpose-or-program>.md` — create the directory if it does
not exist, and slugify the filename.

Mention that a `.docx` version can be produced on request via the `officecli` skill (`word`
sub-skill) if they want something to open directly in Word or Google Docs.

## Boundary

This skill only ever produces a local draft file for the teacher to review and edit. **It never
emails, uploads, or submits anything anywhere.**