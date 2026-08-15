---
name: bro
description: Collapse a long answer into 3-5 bullets. Fires on "/bro", "bro", "bro version", "tldr", "just the bullets", "too long", "boil it down" — and self-fires whenever a reply would exceed ~15 lines of prose or ~5 paragraphs. Use for any request to shorten, summarize, or cut a wall of text down to what actually matters.
---

# bro

Wall of text → 3-5 bullets. Nothing else.

## When to fire

| Situation | Fire? |
|---|---|
| User typed `/bro`, "bro", "tldr", "boil it down", "too long" | Yes |
| Reply about to run >15 lines of prose or >5 paragraphs | Yes, self-fire |
| Reply is already short, or a table/diagram carries it | No |
| Code block, diff, command, file content, error text | No — never compress these |

Self-firing means: notice the wall *before* writing it, write the bullets instead. Not write the wall, then summarize it.

## Output shape

```
- [most important thing]
- [next]
- [next]
- [next]              <- 3 minimum, 5 hard cap
- [next]

<one line: the ask, the command, or the open question>
```

Rules:

- **3 minimum, 5 maximum.** Six means you did not decide. Merge or cut.
- **Ordered by what changes the user's next action**, not by narrative order. Conclusion first, background never.
- **One line each**, ~12 words. If a bullet needs a subclause, it is two bullets or it is not important.
- **Lead each bullet with the noun that matters** — the file, the number, the verdict. Not "There is a...", not "It seems...".
- **Exact stays exact.** File paths, flags, numbers, error strings, commands go in backticks verbatim. Compression is on the prose, never on the facts.
- **One closing line** only if there is a real next step or a real question. Otherwise stop at the last bullet.

## What gets cut

Setup, restatement of the question, what you tried, alternatives you rejected, caveats that do not change the action, "it's worth noting", anything the user already knows.

## What survives even when it costs a bullet slot

- Anything destructive, irreversible, or security-relevant.
- A fact that makes a bullet above it wrong or conditional.
- The one number or path the user needs to act.

If a warning cannot fit in 5 bullets, break format: warning as a plain sentence above the bullets, full and unhedged. Format loses to safety, always.

## Interaction with other modes

- **`Visual ELI5` output style** — bro overrides the diagram-first rule when it fires; a diagram plus 5 bullets is the wall again. Diagram *or* bullets, not both. Keep the diagram only when it replaces bullets outright.
- **caveman** — stacks fine. Caveman handles the words, bro handles how many.
- **Off**: "stop bro" or "normal mode".

## Example

Not:

> So I looked into the failing test and there are actually a few things going on here. The first is that the fixture in `conftest.py` is session-scoped, which means... [11 more lines]

Yes:

```
- `conftest.py:14` fixture is session-scoped — state leaks between tests
- Only fails in CI because local runs hit files in a different order
- Fix: change scope to `function`, costs ~4s per run
- `test_auth.py` has the same pattern, not yet failing

Change the scope, or want the ordering made deterministic instead?
```
