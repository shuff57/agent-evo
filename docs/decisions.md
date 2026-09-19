# Decisions — read before re-adding something that was removed

Archaeology, deliberately **not** always-on. `AGENTS.md` carries the rules a session
needs every turn; this file carries the reasons behind the removals, so the reasons
survive without being re-read on every prompt.

Each entry exists because the thing it describes looks like an oversight and is not.
If you are about to restore one of these, the measurement is here.

---

## caveman + caveman-commit — installed and removed the same day, 2026-09-19

Two skills, two unrelated reasons.

**`caveman` is not a token saving.** ponytail's agentic benchmark measures it at **−20%
LOC but +7% tokens, +3% cost and +2% time** against a no-skill baseline: it compresses
the visible output while spending more overall. ponytail occupies the same slot and is
the only arm in that benchmark that cuts every metric. Chisle's independent comparison
puts caveman in the same direction (worst case 424% of baseline, 6 of 20 tasks worse
than no tool at all), which matters because the two sources are not aligned with each
other.

Both figures come from projects that compete with caveman and neither is disinterested.
They are also the only published measurements either project offers, and both are
reproducible. Weigh them as such — but do not restore caveman on the strength of the
word "compression", which is the specific thing they refute.

It had been always-on before that: the old `CLAUDE.md` opened with a directive switching
it on for every response. The 2026-09-19 rewrite dropped that directive, and leaving it
dropped is a decision rather than an omission.

**`caveman-commit` is not a compression skill at all.** It is a Conventional Commits
formatter, which `AGENTS.md`'s own Commit conduct section already is — and the two
disagreed. It says to skip the body when the subject is self-explanatory, and it has
never heard of the `Constraint:` / `Rejected:` / `Directive:` / `Confidence:` /
`Scope-risk:` / `Not-tested:` trailers this repo asks for. Two sources of truth for
commit messages, one contradicting house style.

Its three genuinely-missing rules were folded into Commit conduct rather than lost:
imperative mood, no AI attribution, and no restating the filename when the scope already
names it. ~40 tokens once instead of ~150 every turn.

Both skills remain in `skills/`. To restore one, add its name to `SKILLS` in `sync.sh`
**and** a row to the keyword table in `AGENTS.md` — one without the other is decoration,
and a contract test fails until they agree.

---

## Why the skill install is a subset, not all of `skills/`

Every **installed** skill's frontmatter enters the prompt on every turn whether the skill
is used or not. The six installed cost ~630 tokens; all 42 would cost ~5,100. The
`SKILLS` list in `sync.sh` is therefore a budget, not an oversight.

Until 2026-09-19 the install was empty and every keyword row pointed at a skill no loader
could see: opencode scans `~/.config/opencode/skill(s)/`, `~/.claude/skills/` and
`~/.agents/skills/`, and `skills/` in this repo is none of those.

`sync.sh` also **prunes** links it no longer names. Without that the install only ever
grew — dropping a name from `SKILLS` left the skill loaded forever, which is exactly what
happened when the caveman pair was cut. The prune removes only symlinks pointing into
this repo; a real directory, or a link owned by another tool, is left alone (verified
against a planted foreign symlink).

---

## The two loaders disagree about symlinks

Both measured against this repo on 2026-09-19, hours apart:

| loader | symlinked directory |
|---|---|
| skills (`~/.config/opencode/skill/<name>`) | **followed** — `opencode debug skill` reported the linked skill |
| teams (`~/.omo/teams/<name>`) | **not found** — for a path that resolved and held valid JSON |

Replacing the team link with a real directory holding the same bytes loaded first try.
So `sync.sh` symlinks skills and copies team specs, ten lines apart, on purpose. Neither
behaviour may be assumed from the other, and "making them consistent" would silently
unload one side. Contract tests pin both shapes.

The team-loader failure is worth quoting because it names the path it just refused:

```
Team '<name>' was not found. Expected '/home/.../.omo/teams/<name>/config.json'
```

— for exactly that path, which resolved through the symlink and held valid JSON. So
`~/.omo/teams/<name>/config.json` is a build artifact: the source is `omo/teams/`, and an
edit made to the installed copy is gone on the next `sync.sh`.

One more thing measured the first time a team spec loaded: **`deep` resolved to
`variant: "medium"`** while `~/.omo/omo.jsonc` pins it `reasoning: max`. The model was
right (`deepseek-v4.1-flash`); the effort dial was not. Read the level back out of the
`team_create` response rather than claiming the config applied.

---

## graphify → codegraph, 2026-09-19

graphify was retired box-wide: the `install_graphify()` bootstrap, the `Glob|Grep`
read-path hook, the `mcpServers.graphify` entry, the Svelte site-packages patch, and the
`graphify-out/` ignore and merge rules. bookSHelf's three tracked git hooks and shCode's
`CLAUDE.md` instructions went with it.

It needed a pip install, a per-repo `graphify hook install`, tracked git hooks and an
initial build. That bootstrap burden is why it lapsed twice: only 2 of ~17 repos ever had
a graph, and neither was read. codegraph needs none of it — omo indexes into
`~/.omo/codegraph/projects/<repo>-<hash>/` and surfaces it as a `.codegraph` symlink.

---

## Three archives deleted, 2026-09-19

1,144 tracked files, 22 MB, none of it reachable by any loader. Working tree 37 MB → 15 MB;
`.git` keeps every byte, which is why it was safe.

| archive | files | why |
|---|--:|---|
| `skills/.archive/` | 1,097 | 151 `SKILL.md` under a dot-dir the scanner skips outright — unreachable the whole time they sat there |
| `_archive/` | 12 | the claude-explains agent pack; nothing referenced it |
| `evolution/backups/gen-0/` | 35 | see below |

`gen-0` called itself a *factory* snapshot while being a copy of whatever roster existed
the first time `install.sh` ran on that box, so it differed per machine. The committed
copy had drifted both ways: 22 of its 32 agents no longer existed, and 9 live ones (three
evolvers, `eyes-and-ears`, five `cs-*`) were never in it. Restoring from it would have
installed a roster two retirement passes old. `skills/evolution/SKILL.md` already names
the evolution log as the rollback mechanism.

Recover anything with `git checkout 26a6377 -- skills/.archive/<path>`,
`git checkout 7e58290 -- _archive/<path>`, or
`git checkout b6f2985 -- evolution/backups/gen-0/<path>`.

---

## 10 evolution fixtures deleted, 2026-09-19

`evolution/tests/` held 12 fixtures; 10 named agents or chains that no longer exist. A
fixture pointing at a missing agent can never run and can never fail. Eight were orphaned
by the 19-agent retirement in `67df1cd` (six agents plus both chain fixtures, since all
six chains dissolved there); `prometheus` and `reviewer` were already dead before it.
`evolver` and the `evolution` skill fixture survive and both still resolve.

Provenance was not treated as a reason to keep the two older ones: an unrunnable test is
unrunnable regardless of who orphaned it.

---

## 19 agents retired for omo builtins, 2026-09-19

The full mapping of where each retired agent's role went is in
[`../roster/README.md`](../roster/README.md), which is the right place for it — that file
is about the roster. Two notes that belong here instead:

- **`librarian` and `oracle` were already dead before being retired.** omo registers both
  names as `subagent`; the generated `mode: primary` copies lost the name collision and
  never loaded.
- **`hephaestus` is not the sonnet builder here, despite omo's README.** omo ships a
  `no-hephaestus-non-gpt` hook that disables that agent whenever its model is not a GPT
  one, and `~/.omo/omo.jsonc` pins it to `claude-sonnet-5` — so it never registers at all
  and is absent from `opencode agent list`. The sonnet lane is
  `task(category="unspecified-high")`. This was caught only because the mapping was
  checked against the live agent list rather than the docs.
