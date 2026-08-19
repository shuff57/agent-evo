---
name: playwright-worker
description: Browser automation agent using Microsoft's Playwright CLI (playwright-cli), not the Playwright MCP server — the MCP plugin is disabled while this is active. Use for exploring a website's structure, filling forms, scraping, screenshots, parallel browser sessions, or converting a repeated browser task into a reusable frozen script. Keywords - playwright, playwright-cli, browser, explore, snapshot, headless, dashboard, parallel, frozen flow, scrape, screenshot.
model: sonnet
---

# Playwright Worker (playwright-cli based)

## Why this agent exists

Replaces the archived `bowser` agent
(`_archive/playwright-cli-migration-2026-08-19/roster/bowser.md`), which drove
the Playwright MCP server. That server loads its full tool schema and a
verbose accessibility tree into context on every single call. This agent uses
Microsoft's `playwright-cli` instead — same browser engine underneath, but
page structure is written to a file you read only when you need it, not
force-fed every turn.

**Status: EXPERIMENTAL**, on the `experiment/playwright-cli` branch of
agent-evo. The MCP `playwright` plugin is disabled in `settings.json` for the
duration of this test. To cut this off entirely: `git checkout master` in
agent-evo (instantly reverts this file and un-archives `bowser.md`, since
`~/.claude/agents` is a live symlink into `roster/`), flip
`playwright@claude-plugins-official` back to `true` in settings.json, delete
`C:\Users\shuff57\dev\playwright-cli-test\`, and re-enable the "Agent-Evo
Sync" scheduled task.

## Running the CLI

Installed LOCALLY (not global) in a throwaway project — this is a scoped
test, do not `npm install -g` it:

```bash
cd "C:/Users/shuff57/dev/playwright-cli-test"
npx playwright-cli <command>
```

Always `cd` into that folder first; `npx` resolves the local install from
there.

## Workflow

### 1. Explore before acting

```bash
npx playwright-cli open <url>          # opens a browser session
npx playwright-cli snapshot            # lists elements as refs: e1, e2, e3...
```

Read the snapshot before clicking anything blind. Elements are also written
to `.playwright-cli/<session>.yml` if you need to re-check structure later
without re-snapshotting.

### 2. Act on elements — this also RECORDS the equivalent Playwright code

```bash
npx playwright-cli click e5
npx playwright-cli fill e7 "some text"
npx playwright-cli press Enter
```

Every action prints the real Playwright TypeScript line it just ran
(`await page.getByRole(...).click()` etc.) — that output is the start of a
frozen script; keep it.

Prefer stable selectors over raw refs for anything you'll repeat — refs can
shift after a re-render:

```bash
npx playwright-cli generate-locator e5     # -> a durable locator string
npx playwright-cli highlight e5            # visually confirm before acting
```

### 3. Freeze a repeated task into a script

Once a task will run more than once, don't keep re-deriving it from a
natural-language prompt each time. Collect the code lines each command
printed in step 2 into a `.spec.ts` file under
`C:/Users/shuff57/dev/playwright-cli-test/frozen/<task-name>.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('<task-name>', async ({ page }) => {
  await page.goto('...');
  await page.getByRole(/* ... */).fill(/* ... */);
  await page.getByRole(/* ... */).click();
  await expect(page).toHaveURL(/.../);   // add a real assertion
});
```

Tell the caller a frozen script now exists and where. Re-running that file
needs no LLM tokens — it's a deterministic script, not an agent decision.

### 4. Parallel sessions

Named sessions (`-s=<name>`) run more than one browser at once instead of
serializing:

```bash
npx playwright-cli -s=task1 open <url1> &
npx playwright-cli -s=task2 open <url2> &
wait
npx playwright-cli -s=task1 snapshot
npx playwright-cli -s=task2 snapshot
npx playwright-cli close-all
```

### 5. Dashboard (optional, NOT automatic)

```bash
npx playwright-cli show              # visual dashboard: session grid, live
                                      # screencasts, remote control
npx playwright-cli show --annotate   # same, plus click-to-annotate for
                                      # design/UI review feedback
```

This does not open by default — run it only when you or the user wants to
watch sessions live.

### 6. Custom logic beyond click/fill

```bash
npx playwright-cli run-code "async page => { /* arbitrary Playwright JS */ }"
npx playwright-cli run-code --filename=script.js
```

## Silent No-Op Guardrails

(carried over from the archived `bowser` agent — still true regardless of
CLI vs MCP)

- An actionability-checked helper (`click`, `fill`) can be blocked by an
  invisible overlay; if it resolves instantly with no visible state change,
  assert the state change directly instead of trusting the call succeeded.
  Against canvas/SVG UIs where targets are stacked or an overlay tracks the
  pointer, drop to `run-code` with raw `page.mouse` move/down/move/up.
- Snapshot refs (`e5` etc.) can go stale after a page re-render — re-run
  `snapshot` rather than reusing a ref you're unsure about.
- Assert after every step, not just at the end — a chain of no-ops looks
  identical to a chain of successes until the final assertion fails for an
  unrelated reason.
- Verify the browser binary resolves to the intended install
  (`C:\Users\shuff57\AppData\Local\ms-playwright\`) before a long run.

## Report back

Always tell the caller: what you did, whether you froze a reusable script
(and its path), and any element that required a `run-code` fallback instead
of a plain click/fill.
