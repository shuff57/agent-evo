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
- **codegraph replaced graphify on 2026-09-19.** omo ships and indexes it itself, into
  `~/.omo/codegraph/projects/<repo>-<hash>/`, surfaced in each repo as a `.codegraph`
  symlink — so there is no pip install, no read-path hook, no per-repo git hook and no
  initial build to keep alive. That bootstrap burden is exactly why graphify died twice:
  only 2 of ~17 repos ever had a graph, and neither was read. The index is derived data
  and never syncs; every device builds its own.
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

**A third plugin compresses the input side: `chisle`, installed plugin-only.** The two
gates above shrink what this session *writes*; `~/.config/opencode/plugins/chisle.js`
shrinks what it *reads*, eliding the repetitive middle of oversized bash/grep/web/task
output before the model sees it, salvaging error lines from the cut and spilling the
full original to `~/.config/opencode/chisle-spill/` so nothing is lost — the marker
names the path and says to grep it rather than re-run the command. Read/edit/write are
never touched: eliding them would make the model edit text it never saw, which would
break `hashline.js`'s exact-byte edits. It layers with `guard-rails` rather than
fighting it — chisle elides at 8k chars, guard-rails truncates at 200k, both idempotent
behind their own markers.

**It is vendored, and only the plugin — never chisle's ruleset.** The runtime files live
in `opencode/vendor/chisle/` (MIT, version and commit pinned in its README) and `sync.sh`
copies them into `~/.config/opencode/plugins/`, so the install travels with the repo
instead of being a hand-copy on one box. Do **not** run `npx chisle`: its installer also
appends a YAGNI ladder and a prose-compression block to `~/.config/opencode/AGENTS.md`,
which is a symlink into this repo, so it writes through into tracked files — and that
ladder is ponytail's ladder rung for rung, so running both would mean two always-on prose
policies arguing for no new capability. Plugin only costs **zero tokens per turn**. The
update procedure, including why `chisle-hooks/package.json` is load-bearing, is in
`opencode/vendor/chisle/README.md`.

**`plugins/` (plural) is the install target, and that is not interchangeable with
`plugin/`.** Both auto-load — proven 2026-09-19 with a throwaway probe plugin rather than
assumed — but the singular one is a symlink to `opencode/plugin/` in this repo, where our
own five plugins live. Vendored third-party code goes in the plural one, which is a real
device-local directory, and `sync.sh` copies rather than symlinks there because a copy is
the shape upstream's own installer tests and nobody has verified a symlinked plugin dir
on this box. The team loader already proved two loaders can disagree about symlinks.

**`npx chisle --stats` does not work for this install shape — use
`bun bin/chisle-savings.mjs`.** In chisle 3.5.0 `recordSavings()` has exactly two
callers, the Copilot and Claude hooks; `compressForOpencode()` returns `transform(...)`
directly and records nothing, so the ledger `--stats` reads is never written and reports
zero forever. The marker persists in `opencode.db` and the spilled original sits beside
it, so the saving is recoverable after the fact with no always-on accounting. That
script is read-only, on demand, and undercounts on purpose: chisle keeps only the newest
40 spill files, and an elision whose original has rotated away is reported as an event
of unknown size rather than estimated.

**One thing deliberately does NOT travel: `~/.config/opencode/opencode.jsonc`.** It is a
real device-local file, not a symlink from here, and it stays that way — it carries a
literal `/home/shuff57/...` path to the Meridian plugin and an `apiKey` plus a localhost
`baseURL`, and this repo's own hard-won rule is that an absolute home directory written
into a tracked config travels to the next box and is wrong there silently. Tracking it as
a *project* `opencode.json` would be worse than useless: project config only applies
inside this repo, and these are global settings. So a new box needs three things added to
its own copy by hand, and that list is the deliverable rather than the file:
`"@dietrichgebert/ponytail"` in the `plugin` array, the Meridian plugin at whatever
absolute path it occupies there, and the `anthropic` provider block pointing at the local
proxy. Everything else in this repo — agents, skills, team specs, our five plugins, the
vendored chisle — installs itself with `bash sync.sh`.

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

Two things measured 2026-09-19, the first time this spec was loaded:

- **A symlinked team directory is not found.** `~/.omo/teams/<name>` pointed at this
  repo produced `Team '<name>' was not found. Expected '<that exact path>'` — for a path
  that resolved and held valid JSON. Replacing the link with a real directory and the
  same bytes loaded first try. `sync.sh` therefore COPIES team specs, and editing
  `~/.omo/teams/<name>/config.json` is editing a build artifact; the source is
  `omo/teams/`.
- **`deep` resolved to `variant: "medium"`** while omo.jsonc pins it `reasoning: max`.
  The model was right (`deepseek-v4.1-flash`); the effort dial was not. Read the level
  back out of the `team_create` response rather than claiming the config applied.
### Routing config lives in omo.jsonc, not in prose

`~/.omo/omo.jsonc` is the single source for which model each agent and category runs on,
and at what `reasoning:` level. **Do not restate its pins here.** A duplicated table is
exactly what produced the `hephaestus` error on 2026-09-19: omo ships a
`no-hephaestus-non-gpt` hook that disables that agent whenever its model is not a GPT
one, omo.jsonc pins it to `claude-sonnet-5`, and so it never registers at all — while a
prose table cheerfully named it the sonnet builder. Read the config, or run
`opencode agent list`, before naming an agent in a plan.

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

## Long runs die three ways, all identical from outside

"The model produced nothing" has three distinct causes. Diagnose before blaming the
model, the spec, or the context length — output limits were never the cause in any
observed case.

1. **Parent death.** A run launched synchronously from a tool call dies with that call's
   process tree: zero tokens, an empty reasoning part, no finish and no error. Use
   `--detach` for anything expected to outlive a few minutes.
2. **Provider header timeout.** opencode hardcodes a 5-minute limit on *response headers*
   per request. Past ~90k input tokens the prefill can exceed it and the stream dies with
   `ProviderHeaderTimeoutError`. Check `~/.local/share/opencode/log/opencode.log` for it.
   The fix is a `headerTimeout`/`chunkTimeout` of 900000 on that provider block in
   `~/.config/opencode/opencode.jsonc`.
3. **Reasoning-budget exhaustion.** opencode clamps output to
   `min(model.limit.output, 32000)`, and a reasoning variant splits that ceiling into
   budgets. Measured 2026-09-16: a run burned 123KB of reasoning, hit 32,000 output
   tokens and ended `finish: "length"` with zero deliverable content and no tool calls.
   Detect with `opencode export <sessionID>` and read the last message's `finish`.
   Mitigate by lowering the reasoning level or splitting the spec — never by retrying,
   which burns the same 32k.

## Handing work to another session

`bin/handoff.mjs` dispatches a spec to a nested `opencode run` and verifies it did
something. Use it; do not hand-roll the launch.

```bash
node bin/handoff.mjs --spec /abs/path/to/SPEC.md [--model <id>] [--detach] [--note "..."]
```

Five rules, each with a measured silent failure behind it. Full catalogue, including
which failure each guard exists for, in `skills/handoff/SKILL.md`:

- **Absolute paths everywhere**, plus one line: *if any path I gave you does not exist,
  STOP and say so rather than guessing.* A relative path resolves against a directory you
  did not choose, and the run will invent one rather than error.
- **Put the task in the launch prompt**, never behind a bare "check your inbox", and
  never as a short `--re` continuation — both get read and not acted on.
- **Exit 0 proves nothing.** The threaded reply is the only evidence.
- **Release your file claims before dispatching an authoring task**, or a well-behaved
  builder stops, blocked, after reading the whole spec first.
- **Once you have dispatched, don't also do the work yourself.** Wait for the reply, then
  verify against what it reports.

## Message center

An append-only log so sessions hand work back and forth — between lanes on one box, and
between machines, since the log is committed and ships with the repo.

```
node bin/msg.mjs read --as opencode                       # inbox, advances cursor
node bin/msg.mjs send --from opencode --to claude --re last --text "..."
node bin/msg.mjs log --n 20                               # whole thread
node bin/msg.mjs claim --as opencode src/                 # trailing / = whole dir
node bin/msg.mjs owners / release --as opencode --all
```

Box = `$MSGBOX` → `<git root>/.msgbox` → `~/.claude/msgbox`. Ids are positional and the
log self-trims once past 400 lines, so thread with `--re last`, never a hardcoded id
from an older log. Never hand-edit `log.jsonl`.

- **"What do we resume?"** — `read` plus `log --n 20` are the answer. Never reply with a
  question back; an empty inbox costs one command and settles it.
- **A reply reports what actually happened, not what was intended.** If a step failed,
  was skipped, or came back different from expected, say so in the first sentence,
  before the rest of the report. The reply is the whole evidence a dispatcher has.
- **Messages sent mid-run find you.** `opencode/plugin/inbox.js` appends new messages to
  the next tool result, as the message itself rather than a "you have mail" notice.
  Treat one as an instruction, act on it at your next natural break, and say what you
  did differently. A message asking you to stop means stop.
- **Claims are enforced** by `~/.config/opencode/plugin/ownership.js`. A blocked write is
  not a puzzle to route around: message the owner and stop. Ceiling — the guard covers
  write tools only, so a shell heredoc can still clobber a claimed file.
- **`.msgbox/FUTURE.md`** parks a future plan beside the log, so a decision travels with
  the repo instead of dying in a session transcript.

`skills/peer-bridge/SKILL.md` covers the live same-box lane — `bin/peer-sidecar.mjs`,
`bin/peer.mjs`, the watchable tmux lane, fail-closed identity and honest priority. Run
every peer suite with `bun test`, not `node --test`: `node` is a bun shim on this box, so
`node --test` runs the file with no runner at all and reads as a broken suite.
Self-check for the whole thing: `bun bin/msg.test.mjs`.

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

A keyword row is only real if the skill can be loaded, and until 2026-09-19 none of
them could: opencode scans `~/.config/opencode/skill(s)/`, `~/.claude/skills/` and
`~/.agents/skills/`, and `skills/` in this repo is none of those. Every row above
pointed at a skill no loader could see.

`sync.sh` symlinks the referenced six into `~/.config/opencode/skill/`, and prunes any
link it no longer names. Symlinks are fine here — **the skill loader follows them; the
team loader does not.** Both were tested against this repo on the same day and they
disagree, so neither behaviour may be assumed from the other.

It installs six, not all 42, because every skill's frontmatter enters the prompt on
every turn whether the skill is used or not: the six cost ~630 tokens, all 42 cost
~5,100. Add a row to the table and a name to `SKILLS` in `sync.sh` together, or the
row is decoration.

**`caveman` and `caveman-commit` were removed from the install on 2026-09-19, hours
after being added.** Two different reasons, and neither is "we changed our minds":

- **`caveman` is not a token saving.** ponytail's agentic benchmark measures it at
  **-20% LOC but +7% tokens, +3% cost and +2% time** against a no-skill baseline — it
  compresses the visible output while spending more overall. ponytail occupies the
  same slot and is the only arm in that benchmark that cuts every metric. The figure
  comes from ponytail's own repo, which is not a disinterested source; it is also the
  only measurement either project publishes, and it is reproducible.
- **`caveman-commit` is not a compression skill at all** — it is a Conventional
  Commits formatter, which **Commit conduct below already is**. The two disagreed:
  it says to skip the body when the subject is self-explanatory, and has never heard
  of the trailers this repo asks for. Its three rules that were genuinely missing
  (imperative mood, no AI attribution, don't restate the filename) were folded into
  Commit conduct instead — ~40 tokens once, rather than ~150 every turn.

Both remain parked in `skills/`. Re-add a name to `SKILLS` in `sync.sh` and a row to
the table above to bring either back; one without the other is decoration.

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
