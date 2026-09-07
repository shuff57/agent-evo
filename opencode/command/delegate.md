---
description: Delegate a spec to a cheaper-tier builder (default deepseek) — deterministic routing, no model judgment. Use for any build the tier policy says should not be typed inline.
---

# /delegate — deterministic tier routing

You are the orchestrator. Your only job is to hand the work below to a cheaper-tier
builder and then review its output. Do NOT implement any of it yourself, no matter
how simple it looks — the entire point of this command is that the building happens
on a cheaper model.

## Task

$ARGUMENTS

## Procedure

1. If the task is high-stakes (auth, money, migrations, concurrency, data loss) or
   genuinely ambiguous (you cannot write an unambiguous spec), STOP and say so —
   those route to `code-engineer` (sonnet) or stay with you, per CLAUDE.md.
2. Write the task as an unambiguous spec: exact file paths, complete acceptance
   criteria, and the command that verifies it (tests/lint). The nested session
   cannot ask questions mid-run.
3. Dispatch the `delegate-build` subagent with the spec. It forwards to the
   builder and returns stdout verbatim.
4. Review the result yourself. Run the verification command from the spec.
   If it fails, send ONE rework round with the exact failure output; after a
   second failure, stop and say so — escalate to sonnet, don't loop.
5. Reply with: what was built, the verification result (paste it, don't
   summarize), one design decision the spec did not pin down, and which checks
   you could NOT perform.