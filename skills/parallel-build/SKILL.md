---
name: parallel-build
description: >
  Orchestrate multiple agent teams building features in parallel, each on its own
  git worktree + branch, with no cross-interference, then human-gated sequential
  merge back to a target branch. Use when the user wants to split work across
  parallel teams/agents, build several features at once without conflicts, run
  isolated worktree builds, or "fan out" independent feature work and merge later.
  Triggers: "parallel build", "parallel teams", "worktree build", "build these in
  parallel", "split this across teams", "/parallel-build".
version: 1.0.0
metadata:
  hermes:
    tags: [worktree, parallel, orchestration, merge, teams, git]
---

# parallel-build

Fan out N independent feature tasks across isolated git worktrees (one branch each),
build concurrently, then merge back **human-gated** — nothing lands on the target
branch without explicit approval.

## Preconditions (check first, stop if unmet)

- **Must be a git repo.** `git rev-parse --is-inside-work-tree`. If not, stop — worktrees
  require git. Offer `git init` or ask which project dir to run in. (Home dir
  `C:\Users\shuff57` is NOT a repo.)
- **Clean working tree** on the base branch. Uncommitted changes → stash or commit first,
  else worktrees fork off a dirty base. Ask before stashing.
- **Tasks must be independent.** Before dispatching, decompose the request and flag any two
  tasks that heavily touch the same file. Parallel worktrees still collide at merge —
  surface the overlap and let the user re-scope or serialize those two.

## Protocol

### 1. Scope & decompose
State the base branch (default: current). List the N tasks, one branch slug each
(`feat/<slug>`). Show the decomposition + any shared-file collision warnings. Get a
quick OK on the split before spawning anything.

### 2. Create worktrees + branches (explicit — named, persistent, inspectable)
Named branches are required so the user can review each before merge. Per task:

```bash
git worktree add "../<repo>-<slug>" -b "feat/<slug>" <base>
```

Worktrees live as sibling dirs (`../<repo>-<slug>`) so they don't pollute the main tree.
Record each worktree path + branch in `~/.claude/state/sessions/{id}/notes.md`.

> Use the harness's built-in `Agent(isolation: "worktree")` ONLY for fully-automated,
> throwaway parallel work — it auto-cleans unchanged worktrees but gives no named,
> persistent branch to review. For human-gated merge, use explicit `git worktree add -b`.

### 3. Dispatch one team per worktree (concurrent)
Spawn agents in a single message so they run in parallel. Each agent's prompt MUST:
- pin it to its worktree path (operate only on absolute paths under `../<repo>-<slug>`)
- build the one task + self-verify (tests / `verify` skill) inside isolation
- commit on its branch when green
- return a structured summary: branch, files changed, diffstat, verify result, open risks

Agents never touch the base branch or each other's worktree.

### 4. Collect
Gather each team's summary. Worktrees with commits persist; empty ones can be pruned
(`git worktree remove`). Report per-branch status (green / failed / partial).

### 5. Human gate (the load-bearing step)
Show the user, per branch: summary + `git diff --stat <base>...feat/<slug>` + verify
result. **Ask which branches to merge and in what order.** Do NOT merge anything not
explicitly approved.

### 6. Sequential merge (one at a time, verify between each)
For each approved branch, in the chosen order, into the target:

```bash
git switch <target>
git merge --no-ff "feat/<slug>"
```

After each merge: resolve conflicts (show the user any non-trivial conflict before
resolving), then run verify/tests. On failure, **stop and report** — do not proceed to
the next branch. Bounded fix loop per the workflow state machine: max 3 attempts, then
hand back to the user. A failing merge leaves the branch intact for retry.

### 7. Cleanup (after approval)
For successfully merged branches only:

```bash
git worktree remove "../<repo>-<slug>"
git branch -d "feat/<slug>"
```

Leave unmerged / failed branches + worktrees in place. List what was kept and why.

## Windows / PowerShell notes
- Worktree sibling paths use `..\<repo>-<slug>` in PowerShell; quote paths with spaces.
- `git worktree list` to audit; `git worktree prune` clears stale entries after manual dir
  deletion.

## Boundaries
- Never merges to the target branch without explicit per-branch approval.
- Never force-pushes or rebases shared branches unless the user asks.
- Does not open PRs — local branches only (extend if the user wants a PR-based gate).
- "branch-only" variant: stop after step 4, hand the branches over, skip 5–7.
