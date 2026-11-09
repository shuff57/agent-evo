---
name: council
description: Trigger this if the user says 'council'.
---

# Council

Before an audit, address outstanding PR comments, fix known issues, and run
relevant checks. Give council the updated implementation; do not defer known
fixes until reviews return. If the user wants to discard the implementation
and explore new ideas, skip fixes to code being replaced.

## Step 1: ask who sits on the council

Before launching anything, ask the user (AskUserQuestion, or a plain question if unavailable) for
all three choices. Skip a question only if the user already answered it in this request.

1. **Harness**: how delegates are launched.
   - T3 Code `delegate_task` (call `orchestrator_capabilities` first to list providers and models)
   - `t3 thread start --provider <p> --model <m> --wait` from a shell (what
     `ui-hill-climb/scripts/run_council.sh` uses)
   - the current harness's native subagent tool (only if it can reach three providers)
2. **Providers**: three different ones. Offer the ones the harness reports as available.
3. **Models**: one per provider, at high reasoning effort. Recommend the latest flagship from each
   (for example Claude Opus, GPT Sol, Gemini Pro) as the first option in each question.

Then confirm the three provider:model pairs back in one line and launch. If you cannot reach three
providers, or a named member is unavailable, report it instead of substituting. Never silently
fall back to a different harness or model.

## Step 2: run it

Bring in the three delegates to help with the user's request, usually for review or feedback, one
per chosen provider, in parallel.

Give each delegate the request and relevant context. For review or feedback,
keep their work read-only. Collect their responses and summarize the useful
findings, disagreements, and recommended next steps.

For a code review, ask each delegate for a score out of 10.
Count each full review pass as one round.
A fresh review after fixes starts a new round.

If the work ends in a pull request, put the results in the PR description.
Put this section before the model and harness line at the end:

```markdown
## Council review

Rounds: 2

| Delegate | Round 1 | Round 2 |
| --- | --- | --- |
| Claude Opus | 7/10 | 9/10 |
| GPT Sol | 8/10 | 10/10 |
| Gemini Pro | 7/10 | 9/10 |
```

If a delegate gives no score, write `no score`. Do not invent one.
If the PR is open, edit the description. Do not post a comment for this.
If there is no PR, put the same results in the final reply only.

If you agree with their recommendations, make the changes and request a fresh
review after. Continue this process until all delegates are satisfied with the
outcome.

Do not let repeated reviews result in scope creep. It is your job to fight to
keep scope limited.

## Specializations

- **UI hill climb**: ask the Step 1 questions first, pass the answers as `UC_COUNCIL="provider:model ×3"`;
  `skills/ui-hill-climb/scripts/run_council.sh` then runs this same council
  (three providers, read-only, advisory) against a hill-climb round's plan and diff. The council
  never scores the UI; the blind panel owns the numbers. See "Council" in that skill.
