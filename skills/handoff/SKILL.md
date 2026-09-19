---
name: handoff
description: >-
  Dispatch a spec to a nested opencode run with bin/handoff.mjs, and the full
  catalogue of measured silent failures each of its guards exists for. Use when
  handing a build to another session, when a dispatched run came back empty or
  exited 0 having done nothing, or before hand-rolling an `opencode run` launch.
---

# Handoff

`bin/handoff.mjs` dispatches a spec to a nested `opencode run` and verifies it actually
did something. Every guard in it exists because of a measured silent failure — a run that
**exited 0** and produced nothing. That is the worst failure shape available: a completed
background task, a clean exit code, and no work.

```bash
node bin/handoff.mjs --spec /abs/path/to/SPEC.md [--model <id>] [--variant <effort>] \
                     [--detach] [--expect <files>] [--note "..."] [--allow-claims]
```

`DEFAULT_MODEL` is `ollama-cloud/glm-5.3-flash` (operator, 2026-08-26). **Pass `--model`
explicitly anyway** — the flag in the command is what makes a run greppable afterwards,
and a default is a cross-repo setting any session may move.

`--expect <files>` puts the run in no-box mode: the prompt then tells it NOT to touch the
message center, so `--expect` and mid-run Q&A are mutually exclusive.

## What the wrapper guards, and what breaks without it

It refuses to dispatch if the spec path does not resolve. It refuses to dispatch while
file claims are held (unless `--allow-claims`). It puts the task in the prompt rather than
behind an inbox read. It strips the characters a `shell:true` launch would let the shell
reinterpret and wraps what is left in double quotes. It tells the run to STOP rather than
guess a path. And — the check that matters — it counts replies in the message log before
and after, **exiting non-zero when a run exits cleanly having done nothing.**

**Not single quotes.** An earlier version of the docs said "single-quotes it"; the actual
implementation double-quotes after stripping `"<>&|^%`. Single-quoting was never shipped.
Verify against `bin/handoff.mjs` itself before repeating a claim about its behaviour.

Hand-rolling reintroduces the failures one at a time.

### 1. A relative path makes the run invent one

`opencode run` does not reliably start in the repo root — the harness leaves the shell
wherever the last backgrounded command left it, so a relative path resolves against a
directory you did not choose.

Measured 2026-08-10: a prompt saying `mom-content/SPEC-3-5.md` was launched from inside
`mom-content`, the file was not found, and the model **invented** a path — wrong repo name
(`steve-problems`), wrong filename (`SPEC-3.5.md`) — then spent 35 minutes and produced
nothing, never having read the spec. Nothing in the output said "file not found".

**Absolute paths everywhere**, plus one line in the prompt: *if any path I gave you does
not exist, STOP and say so rather than guessing.*

### 2. A bare "Check your inbox." no-ops intermittently

The phrase only works if the model acts on `AGENTS.md`, and it does so **intermittently**:
a dozen handoffs on 2026-08-10 worked, then three in a row did not — one answering *"I
don't have an inbox — I'm a coding assistant, not an email client"*, another just listing
a directory. Every one exited 0.

Documenting the protocol harder does not fix it. `steve-desktop/AGENTS.md` was given a
message-center section precisely because it lacked one, and the bare phrase **still**
no-opped on the very next test. This is a cheap-model attention problem, not a config gap,
so the only real fix is to stop depending on the model noticing: name the explicit
`msg.mjs read` command in the prompt, or skip the inbox entirely and put the task there.

### 3. A short `--re` continuation gets READ and not ACTED ON

Twice on 2026-08-10 a follow-up of the shape *"my error, claim released, proceed with
SPEC.md as specced"* was fetched by `msg.mjs read`, echoed to stdout, and the run exited 0
having done nothing. A brief reply reads as an acknowledgement, so "check your inbox" is
satisfied by the reading. Full standalone work orders get carried out; short continuations
do not.

Either resend the whole order, or — when the task needs no coordination, as with file
authoring — put the task in the launch prompt. The message center is for handoff and
mid-run correction, not for being clever about indirection.

### 4. Held claims block the very files the run was sent to write

A claim on `questions/` is right for a browser push, where it stops the run editing the
sources its byte-exact read-back compares against, and completely wrong for an authoring
run whose whole job is writing files there. Same directory, opposite answer.

**Release your file claims BEFORE dispatching an authoring task.** A well-behaved builder
will stop and say it is blocked — after reading the entire spec first, so the wasted cycle
is real.

### 5. Exit code 0 is not evidence

The only proof is the threaded reply, so check the log rather than the task notification.
Symmetrically, **your own expectation is not evidence either**: never fabricate or predict
a pending agent's results. If the user asks before a dispatched run has replied, say it is
still running.

## Three ways a long run dies, all identical from outside

"The model produced nothing" has three distinct causes. Diagnose before blaming the model,
the spec, or the context length — output limits were never the cause in any observed case
(glm-5.3-flash allows 131k output tokens; the observed deaths were at 0 tokens).

1. **Parent death.** A dispatch launched synchronously from a tool call dies with that
   call's process tree. The session's last message then has zero tokens, an empty reasoning
   part, and no finish or error. Use `--detach` on anything expected to outlive a few
   minutes: `handoff.mjs` spawns it in its own process group with stdio ignored and prints
   the tag to watch for. The reply still lands in the message log; success is checked by
   the tag, not by the dispatching process.
2. **Provider header timeout.** opencode hardcodes a 5-minute limit on *response headers*
   per request. As a session grows past ~90k input tokens the prefill can exceed that and
   the stream dies with `ProviderHeaderTimeoutError`, again leaving a zero-token assistant
   message. Check `~/.local/share/opencode/log/opencode.log` for that error. The fix is a
   provider block in `~/.config/opencode/opencode.jsonc` setting
   `headerTimeout`/`chunkTimeout` to 900000.
3. **Reasoning-budget exhaustion (`finish: "length"`).** opencode clamps every model's
   output budget to `min(model.limit.output, 32000)`, and a reasoning variant splits that
   ceiling into budgets — roughly 16k of thinking at `high`, 32k at `max`. Measured
   2026-09-16: a `glm-5.3-flash` run burned 123KB of reasoning, hit 32,000 output tokens,
   and ended `finish: "length"` with **zero deliverable content and no tool calls**.
   Detect with `opencode export <sessionID>` and read the last assistant message's
   `finish` — `"length"` with `reasoning >> output` means thinking ate the budget.
   Mitigate by lowering the reasoning level, splitting the spec, or running on a model
   with no reasoning variant. Do not simply retry: the second attempt burns the same 32k.

## Shape that works

```
main: write SPEC.md + send task ──▶ opencode run '<explicit msg.mjs read command>' --auto
   ▲                                          │ builds, self-verifies
   │                                          ▼
   └──── read reply, run tests, send defect ◀─┘  replies --re last
```

- **Ask for one unpinned design decision** in the reply. That is where the spec gaps
  surface.
- **Once you have dispatched, don't also run the work yourself.** The handoff window is
  the one time "don't duplicate" outranks "verify everything": parallel inline work
  produces merge conflicts with a builder that is editing right now, and the reply arrives
  on its own. Verify *after* the reply, against the result it reports.
- Reply always carries `--re last`; never hand-edit `log.jsonl`. Ids are positional, so an
  id from an older log points at a different line after any prune.
