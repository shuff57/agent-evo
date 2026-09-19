---
name: deep-interview
description: Socratic requirements clarification before planning — exposes hidden assumptions and failure modes.
argument-hint: "<vague or complex request>"
---
<objective>
Conduct a structured requirements interview using Socratic questioning before any planning or implementation. Use the **metis** agent (omo's pre-planning consultant) to deeply analyze the request, then hand off to planning and execution. Models come from each agent's pin in `~/.omo/omo.jsonc`, not from this file.

Use this when:
- The request is vague or open-ended
- The task touches multiple systems
- You're not sure what "done" looks like
- The user says "I want something like..." or "make it better"
</objective>

<context>
Request: $ARGUMENTS
</context>

<process>
## Phase 1: INTERVIEW
Spawn the **metis** agent:
- Restate the request to confirm understanding
- Ask 3-5 critical questions ranked by impact on outcome
- Identify hidden assumptions, contradictions, and scope risks
- Verdict: CLEAR TO PLAN or NEEDS CLARIFICATION

If NEEDS CLARIFICATION: present questions to the user and wait for answers before proceeding.

## Phase 2: PLAN
Once requirements are clear, spawn the **prometheus** agent:
- Create implementation plan informed by the requirements analysis
- Include numbered tasks with acceptance criteria

## Phase 3: REVIEW
Spawn the **momus** agent:
- Verify plan addresses all clarified requirements
- Check for gaps between interview findings and plan
- Verdict: READY TO EXECUTE or NEEDS REVISION

## Phase 4: EXECUTE
Dispatch a worker with `task(category="unspecified-high")` (sonnet):
- Implement the reviewed plan
- Follow existing codebase patterns

## Phase 5: VERIFY
Run the **review-work** skill:
- Final check: does implementation satisfy all requirements from the interview?
- Verdict: APPROVED or REJECT

Report final verdict and summary.
</process>
