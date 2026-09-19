---
name: ultrawork
description: 5-phase autonomous loop — explore, plan, decide, execute, verify. Maximum performance mode.
argument-hint: "<task description>"
---
<objective>
Execute a task using the 5-phase ultrawork pipeline. Each phase uses the optimal agent for the job, with the model coming from that agent's pin in `~/.omo/omo.jsonc` rather than from this file.

Note: omo ships its own `ultrawork` / `ulw` keyword. This command is the explicit 5-phase pipeline; the keyword is the general "every agent activates" mode. Prefer the keyword unless you specifically want these phases in this order.

Phases:
1. EXPLORE — explore maps the codebase terrain (deepseek-v4.1-flash, fast)
2. PLAN — prometheus creates detailed strategy (glm-5.3, interview-mode)
3. DECIDE — momus reviews plan for gaps and risks (kimi-k3, plan critic)
4. EXECUTE — task(category="unspecified-high") implements the approved plan (claude-sonnet-5)
5. VERIFY — the review-work skill verifies implementation (5 parallel reviewers)

If DECIDE rejects the plan, loop back to PLAN with feedback (max 2 iterations).
If VERIFY rejects the implementation, loop back to EXECUTE with feedback (max 2 iterations).
</objective>

<context>
Task: $ARGUMENTS
</context>

<process>
## Phase 1: EXPLORE
Spawn the **explore** agent to map the codebase:
- Find relevant files, patterns, dependencies, and entry points for the task
- Identify existing conventions and potential impacts
- Return structured findings

## Phase 2: PLAN
Spawn the **prometheus** agent with exploration findings:
- Create a detailed implementation strategy
- Include task breakdown, risk assessment, and acceptance criteria
- Define what "done" looks like

## Phase 3: DECIDE
Spawn the **momus** agent to review the plan:
- Challenge assumptions, find gaps, assess feasibility
- Verdict: APPROVED or REVISE with specific feedback
- If REVISE: return to Phase 2 with feedback (max 2 loops)

## Phase 4: EXECUTE
Dispatch a worker with `task(category="unspecified-high")` (sonnet) to implement:
- Follow the approved plan step by step
- Match existing codebase patterns
- Verify each change as you go

## Phase 5: VERIFY
Run the **review-work** skill for final verification:
- Check every changed file against original requirements
- Verify no stubs, TODOs, or incomplete work
- Verdict: APPROVED or REJECT with specifics
- If REJECT: return to Phase 4 with feedback (max 2 loops)

Report the final verdict and summary of all changes made.
</process>
