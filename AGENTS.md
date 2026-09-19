# agent-evo — operating rules

**How this file loads, and the trap inside it.** opencode's Instruction service walks
`["AGENTS.md", "CLAUDE.md", "CONTEXT.md"]` up from the working directory and **breaks on
the first name it finds** — the three never merge. This file is that name. A `CLAUDE.md`
dropped beside it would be silently ignored; renaming this file back would make every
session lose every rule below, with no warning. `~/.config/opencode/AGENTS.md` (symlinked
to `opencode/AGENTS.md`) is the global counterpart, resolved by the same rule.

**Everything in this file is always-on.** This file, the global `AGENTS.md`,
`.omo/rules/**` and `instructions:` in `opencode.json` all enter the prompt on every
single turn. Skills do not — they load on demand. So when a section grows past a screen
and is only needed sometimes, it belongs in `skills/`, not here. Measured 2026-09-19:
this file was 605 lines / ~12k tokens per prompt, most of it describing a harness that
had already stopped existing.

**The Claude-Code-shaped parts of this repo are inert, and several still look alive.**
`hooks/` (every file a `PreToolUse`/`PostToolUse` hook), `settings.json`, the `~/.claude/`
symlinks `install.sh` creates, and `commands/*.md` all target a harness nothing here
loads — `opencode/plugin/` holds the live equivalents. Don't hand-wire any of them to
opencode; port the behaviour into a plugin instead. The tests still exercise the `hooks/`
modules as pure functions, so they are not dead weight, they just never fire in a session.

## Where the rest lives

This file is the always-on layer and is kept small deliberately: every line in it is
re-read on every single turn. Everything below loads only when something reaches for it
— a skill through the skill tool, a doc through its path — and costs nothing until then.

| When | Read |
|---|---|
| dispatching a spec to another session, or a run came back empty | `skills/handoff/SKILL.md` |
| the same-box agent-to-agent socket, tmux lane, peer keys | `skills/peer-bridge/SKILL.md` |
| updating, debugging or measuring the tool-output compressor | `opencode/vendor/chisle/README.md` |
| about to re-add something that was removed | `docs/decisions.md` |
| which agents exist, and where every retired one went | `roster/README.md` |
| which model an agent or category runs on | `~/.omo/omo.jsonc`, or `opencode agent list` |
| the message-center protocol in full | `~/.config/opencode/AGENTS.md` (global, also always-on) |

A pointer here that does not resolve is the exact failure this table exists to prevent,
so `opencode/tests/routing-contract.test.mjs` checks every in-repo path in it. Moving a
section out of this file and into one of those is the intended direction of travel; the
reverse needs a reason, because it is paid for on every turn forever.

## Delegation

The main session is the tech lead: it sizes the request, writes the spec, reviews the
result. It does not bulk-type.

**Default: more than ~10 lines of new code, or a coordinated fix touching 2+ files, goes
to `task(category="quick")`**, and any recon question goes to a sub-agent before you
touch Grep yourself. Not "consider delegating" — delegate, then review. Typing the
implementation inline means the rule was skipped.

**Gate zero, before all of it: is this core work I am holding in my head?** If the
context that makes the change correct lives in this session and not in the repo — a
diagnosis I just made, a comparison I just ran, a constraint the user stated three
messages ago — do it inline regardless of size, and say so in one line. Passing that
context through a spec costs more than typing the change, and a child agent that
half-receives it drifts confidently. This is not the high-stakes exemption: blast radius
and context drift fail independently.

- **Recon is always a sub-agent, and `codegraph_explore` comes before Grep.** omo's
  codegraph MCP answers "how does X work / where is Y" by returning the verbatim source
  of the relevant symbols plus the call path between them, in one capped call — treat
  what it shows as already read rather than re-opening those files. Then `explore` for
  wider internal sweeps (parallel-friendly), `librarian` for external docs, an
  `*-expert` for this repo's own tooling. Fire one *before* you Grep, not after Grep
  fails; reading the codebase by hand is the most common way a session spends expensive
  tokens on cheap work.
- **codegraph replaced graphify on 2026-09-19**, and needs no bootstrap: omo indexes into
  `~/.omo/codegraph/projects/<repo>-<hash>/` and surfaces it as a `.codegraph` symlink.
  Derived data, never synced; every device builds its own. Why graphify went, and what
  was ripped out with it, is in `docs/decisions.md`.
- **Independent parts spawn in parallel, in ONE message.** Serialising independent work
  is a routing failure the same way under-delegating is.
- **Two lenses beat one pass.** Anything worth reviewing gets at least two reviewers,
  dispatched together. `review-work` is the packaged version — read the diversity caveat
  below before trusting it.
- **Tweak** — one file, obvious, reversible → inline. The round-trip costs more.
- **Bulk mechanical** — rename across N files, port tests, fill boilerplate →
  `task(category="quick")`, fanned out in parallel.
- **Subtle or high-stakes** — auth, money, migrations, concurrency, data loss →
  `task(category="unspecified-high")` (sonnet). Skip the cheap tier entirely. This and
  the rework bound below are the ONLY two routes to sonnet: it is an **escalation tier,
  not a default**. Everything else starts on `quick` and earns its way up.

Size every non-trivial request on two axes — *do I know exactly what "done" looks like*,
and *how much breaks if this is wrong*:

|  | Low blast radius | High blast radius |
|---|---|---|
| **Vague** | cheap recon, then re-size | **opus** — think before anyone builds |
| **Specified** | **cheap tier** | **sonnet** |

Mis-routing fails in both directions, but **not symmetrically**: under-delegating burns
opus tokens and this session's context every single time, while one extra cheap agent
costs wall clock and nothing else. Bias toward spawning. Overspawning names specific
wasteful shapes — two agents handed the same brief, an expensive lane doing cheap work,
or independent agents fired one at a time. Five agents on five genuinely separate
questions is the policy working, not a lapse.

**Enforcement.** `opencode/plugin/tier-gate.js` counts write-tool usage per session
(>10 new lines in one call, or writes touching 2+ distinct files) and injects a
`[tier-gate]` notice into the tool result. It never blocks, and announces at most once
per session. Treat the notice as user feedback — the harness's own rule is that hooks
may intercept tool calls and their output is feedback — so act on it in your next line:
delegate, or say why inline is the better call here. `opencode/plugin/guard-rails.js`
rides the same channel for five more shapes: `[guard-rails truncated]` on an oversized
grep/glob/webfetch result, `[context-monitor]` at 70% context used, `[edit-recovery]` /
`[json-recovery]` on stale content or malformed JSON, `[task-guard]` when a subagent
returns nothing, `[loop-guard]` when one identical call repeats 20+ times. None block;
all are idempotent per session. A `[loop-guard]` means you are stuck — change approach
or report the blocker rather than repeating the call.

**The same gate now counts the read side, because that is where the money was.**
`tier-gate.js` fires a second `[tier-gate]` notice at **25 read/grep/glob/webfetch or
non-write bash calls in one session with no `task()` at all**; every `task()` resets the
count to zero, so a session that keeps handing work out never accumulates toward it.
Measured 2026-09-19 across 3 days and 292 sessions on this box: **one `task()` per 77
read+grep+bash calls**, and 93% of $1,120 spend sat on Anthropic models whose cost was
cache-READ volume (600M on opus alone), not output — long sessions holding enormous
context, which is what "handled it inline" looks like on a bill. The write-side
thresholds could not see any of it: `WRITERS` contains no read tool. `codegraph_explore`
is deliberately exempt — it is the recommended first move, and a gate that fires on the
behaviour it wants teaches the opposite lesson.

**A third plugin compresses the input side: `chisle`.** The two gates above shrink what
this session *writes*; chisle shrinks what it *reads*, eliding the repetitive middle of
oversized bash/grep/web/task output before the model sees it, salvaging error lines from
the cut and spilling the full original to `~/.config/opencode/chisle-spill/` — the marker
names that path and says to grep it rather than re-run the command. Read/edit/write are
never touched: eliding them would make the model edit text it never saw, which would
break `hashline.js`'s exact-byte edits. It layers with `guard-rails` rather than fighting
it — chisle elides at 8k chars, guard-rails truncates at 200k, both idempotent behind
their own markers.

It is vendored in `opencode/vendor/chisle/` and installed by `sync.sh`, **plugin only —
never chisle's own ruleset**, which duplicates ponytail's ladder rung for rung and whose
installer writes through the `~/.config/opencode/AGENTS.md` symlink into tracked files.
So: do not run `npx chisle`. Measure it with `bun bin/chisle-savings.mjs` and **not**
`npx chisle --stats`, which reads a ledger the opencode path never writes. The update
procedure, the provenance pin, why `chisle-hooks/package.json` is load-bearing, and why
the install target is `plugins/` and not `plugin/`: `opencode/vendor/chisle/README.md`.

**`~/.config/opencode/opencode.jsonc` deliberately does not travel.** It carries a literal
`/home/shuff57/...` path to the Meridian plugin plus an `apiKey` and a localhost
`baseURL`, and an absolute home directory written into a tracked config is wrong on the
next box *silently* — this repo has been bitten by exactly that before. A new box needs
three things added to its own copy by hand: `"@dietrichgebert/ponytail"` in the `plugin`
array, the Meridian plugin at whatever absolute path it occupies there, and the
`anthropic` provider block pointing at the local proxy. Everything else — agents, skills,
team specs, our five plugins, the global AGENTS.md symlink, the vendored chisle —
installs itself with `bash sync.sh`.

The thresholds, the `/delegate` surface and this section are pinned together by
`opencode/tests/routing-contract.test.mjs`. Edit one, run it, fix the others.

### Build-from-scratch loop

The cheap model builds, a smarter one reviews. A nested run is non-interactive and
**cannot ask questions mid-task** — an unambiguous spec is the whole safety margin.

```
main session: write the spec
        │
        ▼
task(category="quick") ──build──▶ review-work
        ▲                            │
        │                       fail │ pass ──▶ ship
        └──── rework, max 2 ◀────────┤
                                     │
        after 2 failures: rebuild on category=unspecified-high [sonnet], don't loop again
```

Escalate, don't grind: past two failed reviews the cycles cost more than the sonnet
build would have. Encode review feedback as a **runnable check you own** — a builder
that can edit its own gate eventually will.

**More than one independent piece runs as a team, not as serial `task()`s.** Team mode
is enabled in `~/.omo/omo.jsonc` (4 parallel, 8 max, tmux on), and
`omo/teams/build-review/config.json` is the spec for exactly this loop: three `quick`
builders plus one `deep` worker for bulk, with this session as lead.

```
team_list()                             # an active run under the same name is a crashed orphan
team_create(teamName="build-review")    # lead = this session; members = 4 cheap workers
team_task_create(...)                   # one task per independent piece
                                        # lead reads the replies and REVIEWS the measurements
team_task_create(...)                   # re-dispatch the fix to the same cheap workers
team_delete(teamRunId=..., force=true)  # always; an orphan blocks the next create
```

The worker prompts encode the rule that makes the loop honest: **they report
measurements and never own the pass/fail verdict on their own work.** The lead
adjudicates and re-dispatches. That is the "measurement is not verdict" rule below,
moved out of prose and into the thing that actually runs.

Two things were measured the first time this spec loaded, and both are in
`docs/decisions.md`: a **symlinked** team directory is not found (hence `sync.sh` copies
team specs while symlinking skills — the two loaders genuinely disagree), and `deep`
resolved to `variant: "medium"` against a config pinning `reasoning: max`. Read the level
back out of the `team_create` response rather than claiming the config applied.

### Routing config lives in omo.jsonc, not in prose

`~/.omo/omo.jsonc` is the single source for which model each agent and category runs on,
and at what `reasoning:` level. **Do not restate its pins here.** A duplicated table is
exactly what produced the `hephaestus` error — a prose table named it the sonnet builder
while an omo hook had disabled it entirely, so it was never registered at all
(`docs/decisions.md`). Read the config, or run `opencode agent list`, before naming an
agent in a plan.

`roster/*.md` holds only the agents omo does **not** ship — the three evolvers,
`eyes-and-ears` (multimodal-looker has no audio), five `cs-*` curriculum personas, nine
`*-expert`s, and `test-ping`. `bin/gen-agents.mjs` generates
`~/.config/opencode/agents/` from it and **must be re-run after any roster edit**;
`sync.sh` does that. `roster/README.md` records where every retired agent's role went.

**`mode: subagent` breaks `--agent`.** opencode warns, silently falls back to the default
agent, ignores your prompt, and exits 0. Generated defs must be `mode: primary`.

**`review-work` is not a like-for-like council.** It fires 5 parallel seats, but under
this box's omo.jsonc every one of them resolves to an Anthropic model — a deeper review
than the old two-seat council, and a narrower one. Repoint a slot at a non-Anthropic
model there if you want the cross-family lens back.

**`unspecified-high` is load-bearing in two unrelated places — do not cheapen it to push
builds down.** It is both the sonnet escalation tier above **and 2 of `review-work`'s 5
seats** (hands-on QA, context mining). Those slot names are compiled into omo's dist, so
no config can split them: dropping `unspecified-high` to a cheap model to save on builds
silently buys a cheaper review at the same time. Operator decision 2026-09-19: leave it
on sonnet, keep it escalation-only. The spend problem was opus holding context inline,
not sonnet building — see the read-side gate above.

## Judgment rules that cost real money to relearn

- **Measurement is not verdict.** A cheap model produces evidence well and judges it
  badly. Given the same measured fact — four labels dropping to opacity 0 at a loop seam
  — the cheap lens called it "intentional-shaped" and sonnet called it a defect. Neither
  specification quality nor blast radius predicts that. **A model may generate the
  numbers; it never owns the pass/fail call on its own work.**
- **Vision and audio are Anthropic's, full stop.** Operator decision 2026-08-09. Free
  vision models each have a hard, *complementary* blind spot: `kimi-k2.7-code` and
  `minimax-m3` INVERT alignment; `qwen3.5:397b` and `mistral-large-3` returned confident
  false CLEANs on a figure clipped mid-glyph. Do not route visual work to a free model
  even "scoped to what it can see" — the scoping is what breaks silently. Audio has no
  choice anyway: no ollama-cloud model accepts it.
- **The text half of a review is `deepseek-v4.1-flash`'s.** Box containment, overflow at
  any width, clipped content, duplicate ids, computed colours, console and asset errors,
  numbering: all DOM numbers, no eyes needed. Deepseek has **no** image input and will
  not volunteer that — asked to review a figure it could not see, it returned "ALL
  LENSES PASS".
- **Every brief ends with "state which checks you could NOT perform."** Naming a lens you
  skipped is a complete answer; reporting it as passing is a false one.
- **Exit code 0 is not evidence.** A completed background task, a clean exit code and
  nothing done is the worst failure shape available. Check the artifact, not the status.
- **Never fabricate or predict a pending agent's results.** The notification is never
  something you write yourself. If the user asks before a dispatched run has replied,
  say it is still running.

## Handing work to another session

`bin/handoff.mjs` dispatches a spec to a nested `opencode run` and verifies it did
something. Use it; do not hand-roll the launch.

```bash
node bin/handoff.mjs --spec /abs/path/to/SPEC.md [--model <id>] [--detach] [--note "..."]
```

Absolute paths everywhere, the task in the launch prompt rather than behind an inbox
read, `--detach` for anything expected to outlive a few minutes, and file claims released
*before* dispatching an authoring task — a well-behaved builder otherwise stops, blocked,
after reading the whole spec. **Exit 0 proves nothing**: the threaded reply is the only
evidence, and once you have dispatched, don't also do the work yourself.

Each of those has a measured silent failure behind it, and "the model produced nothing"
has three distinct causes — parent death, a provider header timeout, and reasoning-budget
exhaustion — that look identical from outside and are diagnosed differently. The full
catalogue, including which guard exists for which failure and how to tell the three
apart, is in `skills/handoff/SKILL.md`.

## Message center

An append-only log so sessions hand work back and forth — between lanes on one box, and
between machines, since the log is committed and ships with the repo.

```
node bin/msg.mjs read --as opencode        # inbox, advances cursor
node bin/msg.mjs send --from opencode --to claude --re last --text "..."
node bin/msg.mjs claim --as opencode src/  # trailing / = whole dir; enforced, not advisory
```

**The full protocol lives in the global `~/.config/opencode/AGENTS.md`** — symlinked from
`opencode/AGENTS.md`, installed by `sync.sh` — which is also always-on, so it is not
repeated here. Three of its rules are worth naming anyway, because a session that misses
them fails silently rather than loudly:

- **"What do we resume?"** — `read` plus `log --n 20` are the answer. Never reply with a
  question back; an empty inbox costs one command and settles it.
- **A reply reports what actually happened, not what was intended.** If a step failed, was
  skipped, or came back different from expected, say so in the first sentence, before the
  rest of the report. The reply is the whole evidence a dispatcher has.
- **Messages sent mid-run find you** on the next tool result, as the message itself rather
  than a notice. Treat one as an instruction, act on it at your next natural break, and
  say what you did differently. A message asking you to stop means stop.

## Magic keywords

A keyword in the user's message → invoke the named skill before any other action. An
explicit `/skill-name` always wins over keyword detection. Case-insensitive, longest
match wins. Don't activate on quoted or code-block matches, and if context makes a
trigger clearly inappropriate (the user is asking *about* the skill), say so and skip.

| Trigger | Skill |
|---|---|
| "$fable" | `fable` |
| "gauntlet loop", "gauntlet this", "loop until it beats X" | `gauntlet-loop` |
| "/bro", "tldr", "boil it down", "too long" | `bro` |
| "switching computers", "switch machines", "park this", "pack up" | `switch-computers` |

`ultrawork` / `ulw` is **omo's own keyword**, handled by IntentGate before this table is
consulted — do not shadow it. `commands/ultrawork.md` and `commands/deep-interview.md`
are Claude Code slash commands and are not installed for opencode; they describe
pipelines you can run by hand until they are ported to `opencode/command/`.

### Which skills are actually loadable

A keyword row is only real if the skill can be loaded — until 2026-09-19 none of them
could, because opencode scans `~/.config/opencode/skill(s)/`, `~/.claude/skills/` and
`~/.agents/skills/`, and `skills/` in this repo is none of those. `sync.sh` now symlinks
the referenced six into place and prunes any link it no longer names. Add a row to the
table and a name to `SKILLS` in `sync.sh` **together**, or the row is decoration; a
contract test fails until the two agree.

It installs six, not all 42, because every installed skill's frontmatter enters the prompt
on every turn whether the skill is used or not: the six cost ~630 tokens, all 42 cost
~5,100. That list is a budget, not an oversight.

`caveman` and `caveman-commit` were installed and removed the same day, on measurements
rather than taste — read `docs/decisions.md` before restoring either. That file also
records why the install is a subset, and why `sync.sh` symlinks skills but copies team
specs (the two loaders disagree about symlinks, and both behaviours were tested).

## Post-build hardening (opt-in, gated)

After a build and its tests are green, on explicit trigger only — **never auto-fire**,
each run costs real tokens and minutes. Triggers: "harden it", "stress test", "deep
dive", "council review".

- **Verify squad** — is it connected, rendering, and unbroken? `eyes-and-ears` is the one
  seat still on this roster, because nothing in omo listens to audio. Fan it out in
  parallel with `ultimate-browsing` / `visual-qa` for headless UI and interaction, and
  the `security-research` team skill to break it adversarially.
- **Review** — `review-work` fires 5 parallel background reviewers (3 on
  goal/quality/security, 2 on hands-on QA and context mining) and all must pass. See the
  diversity caveat under Delegation.

The **experts team** in `roster/teams.yaml` is NOT for app code — it applies only when
the artifact under test IS agent tooling: a skill, an agent, a theme, a plugin.

## Coding conduct

- **Think first.** Surface assumptions; if multiple interpretations exist, present them
  rather than picking silently. If it is genuinely unclear, stop and ask.
- **Surgical edits.** Touch only what the request needs. Don't refactor working code or
  fix formatting you didn't break. Match existing style. Remove only orphans your change
  created; mention pre-existing dead code rather than deleting it.
- **Goal-driven.** Turn tasks into verifiable criteria ("fix the bug" → "write a failing
  test, make it pass"). Loop until verified, not until it looks right.

## Commit conduct

Conventional-commit subject (≤50 chars, hard cap 72) in the imperative mood — "add",
not "added" or "adds" — then an optional body and structured trailers when applicable.
Skip trailers for trivial commits. Use them to preserve decision context that would
otherwise be lost.

Never in a commit message: AI attribution of any kind ("Generated with …", "as
requested by …" — use a `Co-authored-by` trailer if attribution is genuinely needed),
or a restatement of the filename when the scope already names it.

- `Constraint:` — active constraint that shaped this decision
- `Rejected:` — alternative considered | reason for rejection
- `Directive:` — warning or instruction for future modifiers of this code
- `Confidence:` — high | medium | low
- `Scope-risk:` — narrow | moderate | broad
- `Not-tested:` — edge case or scenario not covered by tests

```
fix(auth): prevent silent session drops during long-running ops

Auth service returns inconsistent status on token expiry, so the
interceptor catches all 4xx and triggers inline refresh.

Constraint: Auth service does not support token introspection
Rejected: Background refresh on timer | race condition with concurrent requests
Confidence: high
Scope-risk: narrow
Directive: Error handling intentionally broad — verify upstream before narrowing
Not-tested: Auth service cold-start latency >500ms
```
