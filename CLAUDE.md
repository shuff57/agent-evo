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

**Default: any request writing more than ~20 lines of new code goes to `ollama-code-engineer`** unless it is high-stakes (auth, money, migrations, concurrency, data loss) or genuinely ambiguous. Not "consider delegating" — delegate, then review. Typing the implementation inline means the rule was skipped.

**Override note:** a session-injected instruction ("do not call the Agent tool unless requested") silently outranks this section — that, not the config, is usually why routing looks flaky.

**When routing is suppressed, do these two things — the first time in the session you are about to write more than ~20 lines of new code, OR make a coordinated fix touching 3+ files (even a one-line change apiece), before writing any of it:**

1. **Say so, in one line.** "Agent routing is suppressed this session, so I'm building this inline." The user cannot see the suppression; if you don't say it, the tier policy has silently stopped existing and nobody knows.
2. **Then use the fallback**, which is never suppressed: `opencode run "<spec>" --auto -m ollama-cloud/deepseek-v4-flash:0731` via Bash — or state in the same line why inline is the better call here (genuinely ambiguous, high-stakes, or too small to be worth the round-trip). Either is fine. Silently typing it yourself is not.

This is written as a two-step because the note used to be a sentence of prose and got skipped. Measured 2026-08-17 (`shcode-curriculum-1.4`): routing was suppressed all session, an entire new lesson type — component, lib module, test script, six content conversions — was built inline, and neither step happened. The work was fine; the policy just wasn't in effect and the user only found out at session end.

The line-count threshold alone has a second, quieter failure mode: work that stays under ~20 new lines in any one file but is still a substantive, multi-file fix reads as "under threshold" and the announcement gets skipped by a technically-defensible judgment call rather than by inattention. Measured 2026-08-18 (shCode, `/module/1` breadcrumb bug): a root-cause fix — 23 `lesson.json` one-line edits plus a ~16-line addition to a prebuild checker — was judged under the per-file line threshold and never announced, even though the diagnosis-plus-coordinated-fix shape is exactly what this policy exists to surface. The 3-file trigger above closes that reading.

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
- **The text half of a review is deepseek's — `deepseek-v4-flash:0731`.** Box containment,
  overflow at any width, horizontal scroll, clipped content, caption pairing, duplicate ids,
  computed colours, console and asset errors, numbering: all DOM numbers, no eyes needed. One
  lens per opencode session, in parallel, over the message center. Deepseek has **no** image
  input and will not volunteer that — asked to review a figure it could not see, it returned
  "ALL LENSES PASS". Every brief ends with "state which checks you could NOT perform."

- **Tweak** — one file, obvious, reversible → **do it inline, don't delegate.** The round-trip costs more than the edit.
- **Build from scratch** — new feature, module, or script → **opus specs → ollama builds → opus reviews.** See the loop below.
- **Bulk mechanical** — rename across N files, port tests, fill boilerplate → **`ollama-code-engineer`, fanned out in parallel.**
- **Subtle or high-stakes** — auth, money, migrations, concurrency, data loss → **`code-engineer` (sonnet). Skip ollama entirely.**

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

- **opus** — `oracle`, `metis`, `planner`, `critic`, `council-chair`. Judgment calls, vague inputs, quality gates.
- **sonnet** — `code-engineer`, `debugger`, `qa-tester`, `designer`, `red-team`, `visual-analyzer`, `bowser`, `eyes-and-ears`, `evolver*`, the four `council-*` seats. Build when specified; review ollama output.
- **haiku** — `scout`, `summarizer`, `documenter`, `librarian`, `test-ping`, every `*-expert`, and `ollama-code-engineer` (it dispatches, it doesn't think).
- **ollama** (free, via `ollama-code-engineer`) — bulk mechanical work. Higher variance; **always** review before shipping.

Don't send a haiku task to opus. Don't send an auth change to ollama.

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
node ~/.claude/bin/handoff.mjs --spec /abs/path/to/SPEC.md [--note "..."]
```

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
the log rather than the task notification.

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

- **Ask for one unpinned design decision** in the reply. That is where the spec gaps surface.
- Reply always carries `--re <id>`; never hand-edit `log.jsonl`.

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

`bin/` and `opencode/` live in this repo; symlink them into place (as `sync.sh` does for
`roster`), then add the Claude-side hook by hand.

`settings.json` **is** symlinked from this repo, despite what this line used to say. That
means it carries absolute paths between machines: the guard command, the statusline, and
anything else pointing at a home directory are all one username away from being wrong on
the next box. The guard's version of wrong is silent — see the check below.

```bash
ln -sfn "$PWD/bin"             ~/.claude/bin
ln -sfn "$PWD/opencode/plugin" ~/.config/opencode/plugin
ln -sf  "$PWD/opencode/AGENTS.md" ~/.config/opencode/AGENTS.md
```

```jsonc
// ~/.claude/settings.json -> hooks.PreToolUse[]
{ "matcher": "Edit|Write|NotebookEdit",
  "hooks": [{"type": "command", "command": "node <YOUR-HOME>/.claude/bin/msg.mjs guard --as claude --hook"}] }
```

**Do not paste an absolute path out of this file.** JSON cannot expand `~`, and
`~/.claude/settings.json` is a symlink into this repo — so it travels to every box, carrying
whichever machine's home directory was written into it. Generate the line for the box you are
actually on:

```bash
node -e "console.log('node ' + require('os').homedir().split(String.fromCharCode(92)).join('/') + '/.claude/bin/msg.mjs guard --as claude --hook')"
```

The hook only takes effect on the next session start. `opencode` picks the plugin up on its
next run, no restart needed.

**Then prove it blocks, because a wrong path fails OPEN.** `PreToolUse` treats exit code **2**
as the block signal; every other non-zero exit is a non-blocking error that prints to stderr
and lets the write through. A bad path throws MODULE_NOT_FOUND, exits 1, and the guard passes
everything while looking configured.

Measured 2026-08-23: this file said `shuff57` where the home directory was `shuff`, and the
guard had therefore never blocked anything. Three sessions were working the same repo at the
time with nothing but a hand-negotiated file split between them. A second session read the bad
path, got MODULE_NOT_FOUND, and concluded the tool was not installed at all.

```bash
node ~/.claude/bin/msg.mjs claim --as someone-else tmp/probe.txt
printf '{"tool_name":"Write","tool_input":{"file_path":"'"$PWD"'/tmp/probe.txt"}}' \
  | node ~/.claude/bin/msg.mjs guard --as claude --hook; echo "exit $?   # must be 2"
node ~/.claude/bin/msg.mjs release --as someone-else --all
```

Exit 2 with a BLOCKED line means it works. Exit 0 or 1 means it does not, whatever the config
looks like. The claim path and the probe path must resolve to the same file — the guard
normalises against the repo root, so claiming `/tmp/x` and probing `<repo>/tmp/x` silently
matches nothing and looks like a working guard allowing a write.

# Magic keywords

A keyword in the user's message → invoke the named skill via the Skill tool before any other action. Explicit `/skill-name` always wins over keyword detection. Case-insensitive, longest match wins.

| Trigger | Skill |
|---|---|
| "write a commit", "/commit" | `caveman-commit` |
| "deep interview", "interview me" | `deep-interview` |
| "ultrawork", "ulw" | `ultrawork` |
| "verify this", "is this fixed" | `verify` |
| "/loop", "every N minutes" | `loop` |
| "claude council", "run the council", "convene the council", "council review" | `council` |
| "gauntlet loop", "gauntlet this", "loop until it beats X" | `gauntlet-loop` |
| "/bro", "bro", "tldr", "boil it down", "too long" | `bro` |

Don't activate on quoted/code-block matches. If a keyword fires but context makes it clearly inappropriate (e.g. user is asking *about* the skill, not invoking it), say so and skip.

# Post-build hardening (opt-in, gated)

After a build + tests are green, on explicit trigger only — **never auto-fire** (each run costs real tokens/minutes). Triggers: "harden it", "stress test", "deep dive", "council review".

- **Verify squad** — is it connected, rendering, and unbroken? Fan out in parallel via the Agent tool: `eyes-and-ears` (does it actually render/play), `bowser` (headless UI/interaction), `qa-tester` (edge cases, untested paths), `red-team` (break it adversarially) — then synthesize through `critic` against the plan. Use for "is everything wired up / rendering correctly / not broken".
- **Council** — diverse multi-model adversarial review. Invoke `council-chair` (or the `council` skill); it dispatches the 4 seats and synthesizes one verdict. Use for a second-opinion stress test across model families.

Run either or both. The **experts team** (skills/config/theme/ui/cli/... experts in `teams.yaml`) is NOT for app code — it only applies when the artifact under test IS Claude Code tooling (a skill, agent, theme, plugin, keybinding).

# Workflow state machine

For multi-step work that crosses agent boundaries (feature dev, major refactor, anything spanning sessions), persist progress through staged phases. Skip stages for trivial work.

Stages: **plan → prd → exec → verify → fix (bounded loop)**

1. **plan** — clarify intent and approach, write to `~/.claude/plans/{slug}.md`.
2. **prd** — append explicit acceptance criteria and scope to the plan file.
3. **exec** — implement; log decisions and tool runs to `~/.claude/state/sessions/{id}/notes.md`.
4. **verify** — run tests / `verify` skill / manual check; record evidence in the session notes.
5. **fix** — bounded loop back to exec on failure. Max 3 attempts before stopping for human input.

Terminal states: `complete`, `failed`, `cancelled`. Before starting new work, check `~/.claude/state/sessions/` for an active/incomplete session and resume from its last stage.

## State dirs
- `~/.claude/plans/` — durable plan files (`{slug}.md`).
- `~/.claude/state/sessions/{id}/` — per-session notes, decisions, intermediate artifacts.
- `~/.claude/state/logs/` — audit / event logs.

# Windows / PowerShell gotchas

When writing `.ps1` scripts (e.g. statusline, hooks) that will be invoked by Claude Code on Windows:

- **PowerShell 5.1 reads `.ps1` files in the system ANSI codepage, not UTF-8.** Unicode block chars (`█`, `░`, `▓`) and other non-ASCII content parse as garbage unless the file has a UTF-8 BOM. Prefer ASCII-only chars (`#`, `-`, `=`) for portability.
- **The `` `e `` ANSI-escape character literal is PowerShell 7+ only.** On 5.1 (the default `powershell.exe`), use `[char]27` to get ESC for ANSI color codes.
- **Stdin reading via `$input` is fragile** when the parent shell pipes JSON in (Git Bash → `powershell -File ...`). Prefer `[Console]::In.ReadToEnd()` for reliable single-shot stdin capture.
- **Skill discovery is flat-only.** Project-local skills must live at `.claude/skills/<name>/SKILL.md` directly — nested `<group>/<name>/SKILL.md` is NOT auto-discovered by the loader.
- **`/tmp` resolves differently in node vs Git Bash on Windows.** Node `fs`/`fetch` resolve `/tmp` to `C:\tmp`; Git Bash `curl`/`cat` resolve `/tmp` to the Git Bash mount. When a verification step writes a file from node and reads it from bash (or vice versa), use an explicit absolute path — `os.tmpdir()` in node, `$TEMP` or a repo-local `.tmp/` in bash — never the literal `/tmp`.
- **Bash builtin/special variables silently shadow your own assignment.** `GROUPS` is a bash builtin array holding the user's group ids — `GROUPS=(a b c)` doesn't error, it just no-ops your intent, and the failure surfaces far away (a later `${GROUPS[0]}`-style expansion pulls a numeric gid instead of your value, producing something like a baffling `fatal: Not a valid object name 197610` out of an unrelated `git` command). Other bash-reserved names to avoid for your own variables: `RANDOM`, `SECONDS`, `LINENO`, `PPID`, `REPLY`, `IFS`, `PATH`, `PS1`-`PS4`, `BASH_*`. Check `declare -p <name>` before reusing a short/common name for a loop or array variable.
- **An ESM script written to the session scratchpad can't resolve the repo's `node_modules`.** Node's ESM resolver walks up from the *script's own file location*, not the shell's cwd — a `.mjs` file under the scratchpad temp dir throws `ERR_MODULE_NOT_FOUND` for packages (e.g. `playwright`) that are installed in the project repo, even though the shell cwd is the repo root. Fix: `import { createRequire } from 'module'; const require = createRequire(pathToRepoPackageJson);` — pointing `createRequire` at the repo's own `package.json` (not the scratchpad file) re-roots resolution at the repo's `node_modules`. This will recur for any scratchpad-written ESM script that imports a repo dependency; the scratchpad convention itself doesn't account for it.
- **Piping a backgrounded process through `tail`/`head` buffers until the pipe closes.** Checking on a long dispatch with `... | tail -n 20` or `| head -c 500` reads back 0 bytes every time until the underlying process exits — the pipe doesn't flush interim output, so it looks like the run has produced nothing right up until it's already over. Measured 2026-08-16 polling a `handoff.mjs` dispatch. Read the target file/log directly (no pipe) to see interim progress, or poll a sentinel the run itself writes.

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
