# caveman mode

At session start, follow `~/.claude/skills/caveman/SKILL.md` for output style. Default intensity: `full`. Stays active every response until the user says "stop caveman" or "normal mode" (then switch back to standard style for the rest of the session). Sub-skill `caveman-commit` fires on its own trigger ("write a commit").

# Intent routing
Classify each non-trivial user request and delegate to the matching agent via the Agent tool. State the classification in one short sentence before spawning so the user can redirect.

- **Investigation** — understand, explore, "how does X work", "where is Y", trace, map, find usages → `Explore` (quick/medium) or `feature-dev:code-explorer` (deep trace across layers).
- **Planning** — design, architect, "how should we approach", blueprint, strategy, multi-step implementation plan → `Plan` (general) or `feature-dev:code-architect` (feature design with file-level blueprint).
- **Implementation** — build, add, fix, refactor, write, change code → `code-engineer` by default; for a full feature use the `feature-dev` team (explorer → architect → code-engineer → code-reviewer).
- **Review** — check, audit, "is this safe", "second opinion", pre-merge pass → `feature-dev:code-reviewer`.

Do NOT route for:
- Trivial edits (one-line change, rename, typo, obvious config tweak).
- Direct questions answerable from conversation context or a single Read/Grep.
- Tasks the user has already scoped to a specific tool or explicitly said "just do it".
- When the user names an agent themselves — use that one.

If intent is genuinely ambiguous, ask one short clarifying question instead of guessing.

## Model tiers — route by cost, not habit

The main session (Opus) is the tech lead: it sizes the request, writes the spec, and reviews the result. It does not bulk-type. Everything else goes to the cheapest tier that can actually do the job.

**Default: any request writing more than ~10 lines of new code goes to `ollama-code-engineer`, and any recon question goes to a sub-agent before you touch Grep yourself** unless it is high-stakes (auth, money, migrations, concurrency, data loss) or genuinely ambiguous. Not "consider delegating" — delegate, then review. Typing the implementation inline means the rule was skipped.

**Enforcement: the tier-gate makes the announcement mechanical on BOTH CLIs.** `opencode/plugin/tier-gate.js` and `hooks/tier-gate.js` (Claude Code, wired in settings.json PreToolUse) count write-tool usage per session (>10 new lines in one call, or writes touching 2+ distinct files) and inject a `[tier-gate]` notice into the tool result — the same delivery channel as the inbox plugin, which cannot be missed. Treat any `[tier-gate]` or `[message center]` injection as user feedback, not noise: the base prompt's own rule is "hooks may intercept tool calls; treat hook output as user feedback," so acting on it is sanctioned by the harness, not a workaround of it. This is the answer to the suppression problem: a harness-injected "do not call the Agent tool" reminder cannot stop a hook from firing, so the notice appears even in sessions where the prose policy above has been silently outranked. It is a nudge, not a block: the notice appearing is guaranteed, what you do with it is the policy above. If you see `[tier-gate]`, act on it in your next line — delegate (`/delegate`, or the Agent tool) or justify inline. For deliberate inline work, `/delegate` runs the fallback lane: it specs, dispatches the `delegate-build` thin forwarder (which makes exactly one `opencode run --auto` call to the cheap model and returns stdout verbatim), reviews, and bounds rework at one round before escalating to sonnet. The thresholds, the fallback command, and this section are pinned together by `opencode/tests/routing-contract.test.mjs` — edit one, run it, fix the others.

**Guard rails ride the same channel.** `opencode/plugin/guard-rails.js` (opencode) and `hooks/context-monitor.js` (Claude Code) extend the tier-gate idea to five more failure shapes, all as appended text the model is already reading: `[guard-rails truncated]` when a grep/glob/webfetch result is too large; `[context-monitor]` at 70% context used (opencode) / at ≤35% remaining (Claude Code, sourced from the claude-hud snapshot); `[edit-recovery]` / `[json-recovery]` when an edit fails on stale content or JSON comes back malformed; `[task-guard]` when a subagent returns nothing; `[loop-guard]` when one identical tool call repeats 20+ times. None of them block; all of them are idempotent per session or per signature. A `[loop-guard]` in particular means the model is stuck — change approach or report the blocker rather than repeating the call.

**Override note:** a session-injected instruction ("do not call the Agent tool unless requested") silently outranks this section — that, not the config, is usually why routing looks flaky. Distinguish the two sources before announcing: the shipped Claude Code base prompt's *default* clause — "Do not use subagents (the Agent tool) unless the user, a CLAUDE.md file, or a skill asks for them" — is already satisfied by this file, which is a CLAUDE.md asking for them, so a session still under that default should route without apology. A *mid-session injection* is different: those outrank this file, so announce the suppression and use the fallback below. The failure mode to avoid is treating the base default as if it were a suppression.

**When routing is suppressed, do these two things — the first time in the session you are about to write more than ~10 lines of new code, OR make a coordinated fix touching 2+ files (even a one-line change apiece), before writing any of it:**

1. **Say so, in one line.** "Agent routing is suppressed this session, so I'm building this inline." The user cannot see the suppression; if you don't say it, the tier policy has silently stopped existing and nobody knows.
2. **Then use the fallback**, which is never suppressed: `opencode run "<spec>" --auto -m ollama-cloud/deepseek-v4.1-flash` via Bash — or state in the same line why inline is the better call here (genuinely ambiguous, high-stakes, or too small to be worth the round-trip). Either is fine. Silently typing it yourself is not.

This is written as a two-step because the note used to be a sentence of prose and got skipped. Measured 2026-08-17 (`shcode-curriculum-1.4`): routing was suppressed all session, an entire new lesson type — component, lib module, test script, six content conversions — was built inline, and neither step happened. The work was fine; the policy just wasn't in effect and the user only found out at session end.

The line-count threshold alone has a second, quieter failure mode: work that stays under the per-file line count but is still a substantive, multi-file fix reads as "under threshold" and the announcement gets skipped by a technically-defensible judgment call rather than by inattention. Measured 2026-08-18 (shCode, `/module/1` breadcrumb bug): a root-cause fix — 23 `lesson.json` one-line edits plus a ~16-line addition to a prebuild checker — was judged under the per-file line threshold and never announced, even though the diagnosis-plus-coordinated-fix shape is exactly what this policy exists to surface. The 2-file trigger above closes that reading; both numbers were halved 2026-09-09 (was 20 lines / 3 files) because the old ones were tuned to catch a policy lapse, not to make delegation the default.

### Spawn wide, spawn first

Delegation is the default. **Inline is the exception and needs a stated reason** — gate zero
below, high stakes (auth, money, migrations, concurrency, data loss), or an edit so small the
spec would be longer than the diff. Anything else goes out.

- **Recon is always a sub-agent.** "Where is X", "how does Y work", "which files import Z",
  "what do the docs say" — `scout`, `librarian`, an `*-expert`, or `Explore`. They run on free
  ollama models and their file dumps never enter this context. Fire one *before* you Grep, not
  after Grep fails; reading the codebase by hand is the most common way this session spends
  opus tokens on haiku work.
- **Independent parts spawn in parallel, in ONE message.** If two pieces of a task do not read
  each other's output, they go out together — three Agent calls in one block, not three round
  trips. Serialising independent work is a routing failure the same way under-delegating is.
- **Two lenses beat one pass.** Anything worth reviewing gets at least two reviewers from
  different model families, dispatched together (`council-glm` + `council-deepseek`, or
  `critic` + `qa-tester`). One reviewer is an opinion; two that disagree is information.
- **Sub-CLI over sub-agent for bulk.** An `opencode run` is free per token and costs this
  session no context at all. Route anything mechanical, long, or output-heavy through
  `bin/handoff.mjs` or `ollama-code-engineer`, and keep the Claude-lane agents for judgment,
  vision, and finishing.

**Gate zero, before all of the above: is this core work I am holding in my head?** If the
context that makes the change correct lives in this session and not in the repo — a diagnosis
I just made, a comparison I just ran, a constraint the user stated three messages ago — do it
inline regardless of size, and say so in one line. Passing that context through a spec costs
more than typing the change, and a child agent that half-receives it drifts confidently. This
is not the high-stakes exemption: blast radius and context drift fail independently.

Size every non-trivial request on two axes before routing — *do I know exactly what "done" looks like*, and *how much breaks if this is wrong*:

|  | Low blast radius | High blast radius |
|---|---|---|
| **Vague** | haiku recon, then re-size | **opus** — think before anyone builds |
| **Specified** | **ollama** or haiku | **sonnet** |

Two axes the table above does not capture, both of which decided real outcomes:

- **Measurement is not verdict.** A cheap model produces evidence well and judges it badly.
  Given the same measured fact — four labels dropping to opacity 0 at a loop seam — ollama
  called it "intentional-shaped" and sonnet called it a defect. Neither specification quality
  nor blast radius predicts that. So: **ollama may generate the numbers, but never owns the
  pass/fail call on its own work.** Encode the criterion as a check *you* own; a builder that
  can edit its own gate eventually will.
- **Vision and audio are Anthropic's, full stop — normally sonnet.** Operator decision
  2026-08-09. Ollama vision models do exist, but each has a hard, *complementary* blind spot,
  so no free model substitutes on a visual step: `kimi-k2.7-code` and `minimax-m3` INVERT
  alignment; `qwen3.5:397b` and `mistral-large-3` returned confident false CLEANs on a figure
  clipped mid-glyph. (Measured on labelled pairs 2026-08-07; table in bookSHelf
  `.claude/skills/book-pipeline/SKILL.md`.) Do not route visual work to a free model even
  "scoped to what it can see" — the scoping is what breaks silently. Audio has no choice
  anyway: no ollama-cloud model accepts it.
- **The text half of a review is deepseek's — `deepseek-v4.1-flash`.** Box containment,
  overflow at any width, horizontal scroll, clipped content, caption pairing, duplicate ids,
  computed colours, console and asset errors, numbering: all DOM numbers, no eyes needed. One
  lens per opencode session, in parallel, over the message center. Deepseek has **no** image
  input and will not volunteer that — asked to review a figure it could not see, it returned
  "ALL LENSES PASS". Every brief ends with "state which checks you could NOT perform."

- **Tweak** — one file, obvious, reversible → **do it inline, don't delegate.** The round-trip costs more than the edit.
- **Build from scratch** — new feature, module, or script → **opus specs → ollama builds → opus reviews.** See the loop below.
- **Bulk mechanical** — rename across N files, port tests, fill boilerplate → **`ollama-code-engineer`, fanned out in parallel.**
- **Subtle or high-stakes** — auth, money, migrations, concurrency, data loss → **`code-engineer` (sonnet). Skip ollama entirely.**
- **Graph-orchestrated multi-part build** — user invokes `$fable` or asks for a bounded task graph with parallel workers → **`fable` skill.** The ask must be in the user's own words ("use a workflow", "fan out agents", "orchestrate this with subagents", `$fable`) — a task that would merely *benefit* from parallelism does not authorize the graph by itself; size it through the tier table and delegate normally. Main session plans/adjudicates; workers are restricted to `glm-5.3-flash` (normal implementation) and `deepseek-v4.1-flash` (loops, bulk). High-stakes nodes still go to sonnet — the graph never overrides the tier table.

### Build-from-scratch loop

Ollama builds, a smarter model reviews. The nested ollama session runs non-interactively and **cannot ask questions mid-task** — an unambiguous spec is the whole safety margin.

The handoff runs through the message center (see below), not through an inline prompt: claim
the acceptance gate, send the spec, launch opencode with the `msg.mjs read` command named in the
prompt (see the message-center section — the bare "check your inbox" phrasing can no-op silently),
read the threaded reply. Encode review feedback as a **runnable check you own** — a builder that can edit its
own gate eventually will, and ownership is enforced, so claiming it is a real wall.

```
opus: write the spec
        │
        ▼
ollama-code-engineer ──build──▶ critic [opus]
        ▲                            │
        │                       fail │ pass ──▶ ship
        └──── rework, max 2 ◀────────┤
                                     │
        after 2 failures: rebuild on code-engineer [sonnet], don't loop again
```

Escalate, don't grind. Past two failed reviews the review cycles cost more than the sonnet build would have. Never send ollama a third time.

### Roster

**`roster/*.md` is the single source of truth for every agent, on both CLIs.** Each file
declares `model:` + `effort:` (what Claude Code runs natively) and `spawn-primary:` +
`spawn-secondary:` (the portable, cross-CLI route, `<cli>/<model>[@effort]`).

Nothing consumes the roster directly. `bin/gen-agents.mjs` generates both consumers, and
**must be re-run after any roster edit** — `sync.sh` calls it:

```
roster/<name>.md ──┬──▶ ~/.claude/agents/        claude-lane: verbatim copy
                   │                             ollama-lane: thin forwarder stub
                   └──▶ ~/.config/opencode/agents/  ollama-lane: full body + ollama model
```

An ollama-lane agent is a **haiku forwarder** on the Claude side that makes exactly one
`opencode run --agent <name> -m <model> --variant <effort> --auto` call and returns stdout
verbatim. `~/.claude/agents` is a generated directory, **not** a symlink — restoring the
old symlink serves one file to both CLIs, and every ollama-lane agent silently runs on
Claude instead of spawning opencode.

**Lanes** — ollama for bulk lookup and drafting; Claude for finishing, review, finer passes.

37 agents, 27 on ollama and 10 on Claude. `@` is the reasoning dial — `effort:` on the
Claude side, `--variant` on the opencode side.

| Lane | Route | Agents |
|---|---|---|
| **deepseek-flash** (17) | `ollama-cloud/deepseek-v4.1-flash` | all 9 `*-expert`, `scout@low`, `summarizer@low`, `documenter@low`, `librarian@low`, `test-ping@low`, `qa-tester@high`, `council-deepseek@high`, `red-team@high` |
| **glm-flash** (10) | `ollama-cloud/glm-5.3-flash` | `evolver@high`, `evolver-meta@high`, `global-evolver@high`, `council-glm@high`, `ollama-code-engineer@high`, `cs-student-advanced@max`, `cs-student-tester@medium`, `cs-student-moderate@medium`, `cs-student-beginner@low`, `cs-teacher-tester@medium` |
| **claude/opus** (4) | judgment | `oracle@max`, `metis@max`, `planner@max`, `critic@high` |
| **claude/sonnet** (6) | finishing + vision | `code-engineer@high`, `debugger@high`, `designer@medium`, `bowser@medium`, `eyes-and-ears@medium`, `visual-analyzer@medium` |

`cs-student-beginner` is deliberately `@low` — that persona must NOT infer, so capability
makes it a worse instrument. It is the one agent whose dial is set against capability.

**`--variant` is unverified.** `opencode run --variant bogusvalue` is accepted silently
(exit 0, no warning), and every ollama-cloud model reports `reasoning: 0` tokens at every
level, including models that certainly reason. Variant values are written on the assumption
they work; never claim one was verified.

**The council was retired to two seats 2026-09-09.** `council-chair`, `council-kimi` and
`council-qwen` are gone — the chair because the main session adjudicates, and kimi/qwen
because their namesake models are only reachable through a router. What survives is
`council-glm` and `council-deepseek`, which genuinely run their own model families; the
main session dispatches both and adjudicates. Restore any of the three with
`git checkout HEAD -- roster/<name>.md`.

Every ollama-lane agent's `spawn-secondary` is the Anthropic tier it replaced, so a swap is
reversible by definition. **No routers** — `openrouter`/`omnirouter` are an operator
decision, not a default.

Three traps, all measured 2026-09-09, all of which exit 0 while doing nothing:

- **`mode: subagent` breaks `--agent`.** opencode warns, silently falls back to the default
  agent, ignores your prompt, exits 0. Generated opencode defs must be `mode: primary`.
- **Claude Code caches agent definitions at session start.** Regenerating mid-session does
  not take effect; a forwarder will keep answering from the old body. Restart to test.
- **A forwarder can score a tool call without forwarding, so `tool_uses` is not the test.**
  Measured 2026-09-09 in one fresh session: `test-ping` forwarded correctly (17.9s, a real
  opencode session), while `scout`, asked to name a file in the repo root, made exactly ONE
  Bash call — an `ls`, not an `opencode run` — and answered itself. `tool_uses` was 1 and the
  answer was right, so it passes any count-based check. The two generated bodies are
  byte-identical apart from the description line, so this is task-dependent rather than a
  per-agent defect: any trivially-local task invites the shortcut, which hits the recon
  agents (`scout`, `librarian`, the `*-expert`s) hardest. `tool_uses >= 1` is NECESSARY BUT
  NOT SUFFICIENT, and reply text proves even less — `test-ping` returns `pong` either way.
  The only sound discriminator is the opencode log, which no wrapper can fake:

  ```bash
  grep 'agent=<name> mode=primary' ~/.local/share/opencode/log/opencode.log
  ```

  Force-pinning `tools: [Bash]` closed the Read/Grep hole but not this one: Bash alone is
  enough to do recon work, and it is also the tool the wrapper needs in order to spawn.

Don't send a haiku task to opus. Don't send an auth change to ollama. Both directions of mis-routing are failures, but they are **not symmetric in cost**: under-delegating burns opus tokens and this session's context every single time, while one extra free ollama agent costs wall clock and nothing else. Bias toward spawning. **Overspawning** is still a self-correction signal, but it names the wasteful shapes specifically — two agents handed the same brief, a Claude-lane agent doing work an ollama-lane one would have done, or independent agents fired one at a time instead of in a single block. Five agents on five genuinely separate questions is the policy working, not a lapse. The review pass should ask "did any two of these overlap, and did any of them need to be on Claude?"

**The main session orchestrates. There is no separate orchestrator agent.** `atlas`,
`prometheus` and `meta-orchestrator` were retired 2026-08-04, along with 11 of the 12
`ollama-*` wrappers and all 7 `subcouncil-*` seats — 21 agents, none of which had been
invoked in the preceding month. Restore any of them with
`git checkout roster/<name>.md` in `agent-evo`.

# Cross-CLI message center

Claude Code and opencode share an append-only message log so they can hand work back and
forth in one repo. Zero per-repo setup — the box resolves itself.

```
node ~/.claude/bin/msg.mjs where                                  # which box am I in
node ~/.claude/bin/msg.mjs read --as claude                       # inbox, advances cursor
node ~/.claude/bin/msg.mjs send --from claude --to opencode --re 2 --text "..."
node ~/.claude/bin/msg.mjs log --n 20                             # whole thread
```

Box = `$MSGBOX` -> `<git root>/.msgbox` -> `~/.claude/msgbox`. The repo box is committed, so the thread ships between machines; the cursor files beside it are device-local. Drop `.msgbox/log.jsonl` from a repo only if the thread shouldn't ship.

**Future plans live in `.msgbox/FUTURE.md`** — one per project, beside the log, so a parked
idea travels with the repo instead of dying in a session transcript. Newest first; each entry
records what was decided and what is still open. It is a plain file, not a `msg.mjs` feature.

**Retention.** The log is append-only but size-bounded. After every `send`, when the log exceeds
400 lines it auto-trims from the front: only lines EVERY agent that could need them has already
read go first. An unread line is never dropped, the newest `--keep` (default 30) lines are never
dropped, and claim/release events are never dropped — ownership replays from the log, so they are
state, not history. Cursors recalibrate automatically. Preview with
`node ~/.claude/bin/msg.mjs prune --dry-run`; tune with `--max N --keep K`. Because ids are
positional in the file, a prune renumbers everything behind it — thread with `--re last`, never a
hardcoded id from an older log.

**"What do we resume?"** — When a fresh session is asked what to resume / pick up on / continue,
`read --as claude` + `log --n 20` are the answer. Never reply with a question back.

**Reply contract.** A msgbox reply reports what actually happened, not what was intended. When
your reply says something is done, sent, saved, fixed, or verified, that claim must rest on a
result you observed this session — tool output, the file as it now reads, the test output as it
ran. If you did not check, say you did not check. If any step failed, was skipped, or came back
different from expected, say so in the first sentence, before the rest of the report — even when
the rest of the work succeeded. A dispatcher reading the log cannot see your session; the reply
is the whole evidence, and a summary that hides a problem manufactures a clean-looking failure.

**Launch with the command in the prompt. Never with a bare `"Check your inbox."`** The phrase only
works if the model acts on `AGENTS.md`, and it does so **intermittently**: a dozen handoffs on
2026-08-10 worked, then three in a row did not — one answering *"I don't have an inbox — I'm a coding
assistant, not an email client"*, another just listing a directory. Every one **exited 0**. That is
the worst failure shape available: a completed background task, a clean exit code, and nothing done.

Documenting the protocol harder does not fix it. `steve-desktop/AGENTS.md` was given a message-center
section precisely because it lacked one, and the bare phrase **still** no-opped on the very next
test. This is a cheap-model attention problem, not a config gap, so the only real fix is to stop
depending on the model noticing.

**Use the wrapper. Do not hand-roll the launch.** Five distinct silent failures on 2026-08-10, every
one exiting 0, are pre-empted by `bin/handoff.mjs`:

```bash
node ~/.claude/bin/handoff.mjs --spec /abs/path/to/SPEC.md [--model <id>] [--note "..."]
```

Its `DEFAULT_MODEL` is **`ollama-cloud/glm-5.3-flash`** (operator, 2026-08-26; it was
`ollama-cloud/deepseek-v4-flash:0731`). Pass `--model` explicitly anyway — the flag in
the command is what makes a run greppable afterwards, and a default is a cross-repo
setting any session may move. Note `--expect <files>` puts the run in no-box mode: the
prompt then tells it NOT to touch the message center, so `--expect` and mid-run Q&A are
mutually exclusive.

It refuses to dispatch if the spec path does not resolve, refuses to dispatch while file claims are
held (unless `--allow-claims`), puts the task in the prompt rather than behind an inbox read, strips
the characters a `shell:true` launch would otherwise let the shell reinterpret and wraps what's left
in double quotes, tells the run to STOP rather than guess a path, and — the check that matters —
counts replies in the message log before and after, exiting **non-zero when a run exits cleanly
having done nothing.** Its header lists which failure each guard exists for.

**Not single quotes.** An earlier version of this doc said "single-quotes it" — the actual
implementation double-quotes after stripping `"<>&|^%`; single-quoting was never shipped. Verify
against `bin/handoff.mjs` itself before repeating a claim about its behavior, not this doc.

Hand-rolling reintroduces them one at a time: a relative path (the run invents one and burns the
session), a double-quoted prompt containing `\"…\"` or `<angle brackets>` (the shell rewrites it into
a different command), a bare "check your inbox", a short `--re` continuation, or a claim you forgot to
release.

**Exit code 0 is not evidence the handoff worked.** The only proof is the threaded reply, so check
the log rather than the task notification. Symmetrically, **your own expectation is not evidence
either**: never fabricate or predict a pending agent's results — the notification is never something
you write yourself. If the user asks before a dispatched run has replied, say it's still running.


**A short `--re` reply gets READ and not ACTED ON.** Twice on 2026-08-10 a follow-up of the shape
"my error, claim released, proceed with SPEC.md as specced" was fetched by `msg.mjs read`, echoed to
stdout, and the run exited 0 having done nothing. A brief reply reads as an acknowledgement, so
"check your inbox" is satisfied by the reading. Full standalone work orders get carried out; short
continuations do not. Either resend the whole order, or — when the task needs no coordination, as
with file authoring — **skip the inbox entirely and put the task in the launch prompt.** The message
center is for handoff and mid-run correction, not for being clever about indirection.

**Give absolute paths, and tell it to stop rather than guess.** `opencode run` does not reliably
start in the repo root — the harness leaves the shell wherever the last backgrounded command left it,
so a relative path in the prompt resolves against a directory you did not choose. On 2026-08-10 a
prompt saying `mom-content/SPEC-3-5.md` was launched from inside `mom-content`, the file was not
found, and the model **invented** a path — wrong repo name (`steve-problems`), wrong filename
(`SPEC-3.5.md`) — then spent 35 minutes and produced nothing, never having read the spec. Nothing in
the output said "file not found"; it just quietly proceeded without it. Absolute paths everywhere,
plus one line: *if any path I gave you does not exist, STOP and say so rather than guessing.*

**Release your file claims BEFORE dispatching an authoring task.** A claim on `questions/` is right
for a browser push, where it stops the run editing the very sources its byte-exact read-back compares
against, and completely wrong for an authoring run, whose whole job is writing files there. Same
directory, opposite answer. A well-behaved builder will stop and say it is blocked — after reading
the entire spec first, so the wasted cycle is real.

Handoff shape that works:

```
claude: write SPEC.md + send task ──▶ opencode run '<explicit msg.mjs read command>' --auto
   ▲                                          │ builds, self-verifies
   │                                          ▼
   └──── read reply, run tests, send defect ◀─┘  replies --re last
```

Once you have dispatched, don't also run the work yourself — wait for the result. The handoff
window is the one time "don't duplicate" outranks "verify everything": parallel inline work on
the same task produces merge conflicts with a builder that is editing right now, and the reply
arrives on its own. Verify *after* the reply, against the result it reports.

- **Ask for one unpinned design decision** in the reply. That is where the spec gaps surface.
- Reply always carries `--re <id>`; never hand-edit `log.jsonl`. Ids are positional, so an id from an older log points at a different line after any prune — thread with `--re last`, which always resolves to the newest message addressed to you.

**A running opencode session receives messages sent after it starts.** `opencode run` reads its
inbox once, at launch, so anything later used to sit unread until the run ended — long enough for a
correction or a stop to arrive too late to matter. `opencode/plugin/inbox.js` closes that: on every
tool call it stats the log, and when there is something new it appends the message text to that
tool's result, where the model cannot miss it. So a mid-run correction is worth sending:

```
opencode run ... ──tool──▶ [message center] 1 new message for opencode ──▶ it adapts
```

The delivery is the message itself, not a "you have mail" notice — a notice costs a tool call to
act on, and an agent mid-task routinely decides not to spend one. `msg.mjs inbox` is that delivery
and shares one cursor with `read`, so nothing is shown twice or lost between them.

**Claude Code has no equivalent hook and does not need one** — the harness already surfaces the
user's mid-turn messages. If cross-agent messages ever need to reach a long Claude turn the same
way, it is a `PostToolUse` hook running `msg.mjs inbox --as claude`; it is left off deliberately,
because that spawns node on every tool call in every session to cover a case that is mostly already
covered.

## File ownership (enforced)

```
node ~/.claude/bin/msg.mjs claim --as claude test.js lib/   # trailing / = whole dir
node ~/.claude/bin/msg.mjs owners
node ~/.claude/bin/msg.mjs release --as claude --all
```

Claims replay from the same log — no second state file. Enforcement is real on both sides:
a `PreToolUse` hook on `Edit|Write|NotebookEdit` (settings.json) blocks Claude, and
`~/.config/opencode/plugin/ownership.js` blocks opencode. A blocked write is not a puzzle to
route around — message the owner and stop. Claim before delegating a build; release when the
handoff closes, or the next session inherits a locked repo.

Ceiling: the guards cover write tools only, so a shell heredoc can still clobber a claimed
file. Self-check for the whole thing: `node ~/.claude/bin/msg.test.mjs`.

### Install on a new box

`bin/` and `opencode/` symlink into place from this repo; the Claude-side hook goes in
by hand. Full procedure — generating the hook path for the box you are actually on, and
the probe that proves it — is in `~/.claude/skills/msgbox-install/SKILL.md`.

**A wrong hook path fails OPEN.** `PreToolUse` blocks only on exit code **2**; a bad path
throws MODULE_NOT_FOUND, exits 1, and the guard permits every write while looking fully
configured. `settings.json` is symlinked from this repo, so anything absolute written into it
travels to the next box: every hook command there uses `$HOME` instead, which works because
the harness runs hooks through a POSIX shell. Do not reintroduce a literal home directory.
Measured 2026-09-09: the repo copy said `C:/Users/shuff` on a `shuff57` box and had lost its
tier-gate entry, so running this repo's own `install.sh` would have silently disabled both
guards. Run that skill's probe after any machine move — and probe with a relative or `C:/`
path, never a Git-Bash `/c/...` one, which the guard does not normalise and lets through.

# Magic keywords

A keyword in the user's message → invoke the named skill via the Skill tool before any other action. Explicit `/skill-name` always wins over keyword detection. Case-insensitive, longest match wins.

| Trigger | Skill |
|---|---|
| "$fable" | `fable` |
| "write a commit", "/commit" | `caveman-commit` |
| "deep interview", "interview me" | `deep-interview` |
| "ultrawork", "ulw" | `ultrawork` |
| "verify this", "is this fixed" | (none - `verify` is user-invocation only; answer with evidence and offer `/verify`) |
| "/loop", "every N minutes" | `loop` |
| "claude council", "run the council", "convene the council", "council review" | `council` |
| "gauntlet loop", "gauntlet this", "loop until it beats X" | `gauntlet-loop` |
| "/bro", "bro", "tldr", "boil it down", "too long" | `bro` |
| "switching computers", "switch machines", "park this", "pack up", "on the other computer now" | `switch-computers` |

Don't activate on quoted/code-block matches. If a keyword fires but context makes it clearly inappropriate (e.g. user is asking *about* the skill, not invoking it), say so and skip.

# Post-build hardening (opt-in, gated)

After a build + tests are green, on explicit trigger only — **never auto-fire** (each run costs real tokens/minutes). Triggers: "harden it", "stress test", "deep dive", "council review".

- **Verify squad** — is it connected, rendering, and unbroken? Fan out in parallel via the Agent tool: `eyes-and-ears` (does it actually render/play), `bowser` (headless UI/interaction), `qa-tester` (edge cases, untested paths), `red-team` (break it adversarially) — then synthesize through `critic` against the plan. Use for "is everything wired up / rendering correctly / not broken".
- **Council** — diverse multi-model adversarial review, now two seats and no chair. Dispatch `council-glm` and `council-deepseek` in parallel and adjudicate their verdicts yourself; the main session is the chair. Use for a second-opinion stress test across genuinely different model families.

Run either or both. The **experts team** (skills/config/theme/ui/cli/... experts in `teams.yaml`) is NOT for app code — it only applies when the artifact under test IS Claude Code tooling (a skill, agent, theme, plugin, keybinding).

# Workflow state machine

For multi-step work that crosses agent boundaries (feature dev, major refactor, anything spanning sessions), persist progress through staged phases. Skip stages for trivial work.

Stages: **plan → prd → exec → verify → fix (bounded loop)**

1. **plan** — clarify intent and approach, write to `~/.claude/plans/{slug}.md`.
2. **prd** — append explicit acceptance criteria and scope to the plan file.
3. **exec** — implement; log decisions and tool runs to `~/.claude/state/sessions/{id}/notes.md`.
4. **verify** — run tests / manual check; record evidence in the session notes. (The `verify` skill is `disable-model-invocation`: only the user can run `/verify`.)
5. **fix** — bounded loop back to exec on failure. Max 3 attempts before stopping for human input.

Terminal states: `complete`, `failed`, `cancelled`. Before starting new work, check `~/.claude/state/sessions/` for an active/incomplete session and resume from its last stage.

## State dirs
- `~/.claude/plans/` — durable plan files (`{slug}.md`).
- `~/.claude/state/sessions/{id}/` — per-session notes, decisions, intermediate artifacts.
- `~/.claude/state/logs/` — audit / event logs.

# Windows / PowerShell gotchas

Ten pitfalls that fail silently on this platform — `.ps1` codepage/BOM, the PowerShell
5.1 vs 7 escape split, stdin capture, flat-only skill discovery, `/tmp` differing between
node and Git Bash, bash reserved variables, scratchpad ESM resolution, `SSLKEYLOGFILE`
killing python with no traceback, pipe buffering on backgrounded runs, and a PowerShell
here-string silently corrupting a Bash-tool call. Full detail is
in `~/.claude/skills/windows-gotchas/SKILL.md`.

# Coding conduct

Minimalism is the ponytail ladder above. Beyond that (per [Karpathy on LLM-coding pitfalls](https://x.com/karpathy/status/2015883857489522876)):

- **Think first.** Surface assumptions; if multiple interpretations exist, present them — don't pick silently. If unclear, stop and ask.
- **Surgical edits.** Touch only what the request needs; don't refactor working code or fix formatting you didn't break. Match existing style. Remove only orphans your change created; mention pre-existing dead code, don't delete it.
- **Goal-driven.** Turn tasks into verifiable criteria ("fix the bug" → "write a failing test, make it pass"). Loop until verified, not "looks right."

# Commit conduct

Conventional-commit subject (≤50 chars), optional body, then structured trailers when applicable. Skip trailers for trivial commits (typos, formatting). Use trailers to preserve decision context that would otherwise be lost.

Trailers:
- `Constraint:` — active constraint that shaped this decision
- `Rejected:` — alternative considered | reason for rejection
- `Directive:` — warning or instruction for future modifiers of this code
- `Confidence:` — high | medium | low
- `Scope-risk:` — narrow | moderate | broad
- `Not-tested:` — edge case or scenario not covered by tests

Example:

```
fix(auth): prevent silent session drops during long-running ops

Auth service returns inconsistent status on token expiry, so the
interceptor catches all 4xx and triggers inline refresh.

Constraint: Auth service does not support token introspection
Rejected: Background refresh on timer | race condition with concurrent requests
Confidence: high
Scope-risk: narrow
Directive: Error handling intentionally broad — verify upstream behavior before narrowing
Not-tested: Auth service cold-start latency >500ms
```
