# chisle — vendored, plugin only

Third-party. MIT, © 2026 Jay Pokale — see `LICENSE`, which is carried because
vendoring requires it. Upstream: <https://github.com/JayPokale/Chisle>.

| | |
|---|---|
| version | 3.5.0 |
| commit | `47b7dd716c192ac8dcda597610de1001474b9aa5` |
| vendored | 2026-09-19 |

## What it does, and what was deliberately left out

The tool-output compressor, and nothing else. Oversized `bash`/`grep`/`glob`/
`webfetch`/`websearch`/`task`/`list` output gets its repetitive middle elided
before the model reads it, error-looking lines salvaged from the cut, and the
full original spilled to `~/.config/opencode/chisle-spill/` — the marker names
that path and says to grep it rather than re-run the command.

`read`/`edit`/`write`/`patch` are never touched. That is upstream's design, by
allowlist rather than blocklist, and it is the reason this is safe to run here:
eliding a read would make the model edit text it never saw, which would break
`hashline.js`'s exact-byte edits.

**Upstream also ships a ruleset — a YAGNI ladder and a prose-compression block —
and it is NOT vendored.** Its installer appends that to
`~/.config/opencode/AGENTS.md`, which on this box is a symlink into this repo, so
`npx chisle --only opencode` writes through it into tracked files. The ladder is
also ponytail's ladder, rung for rung, so running both would mean two always-on
prose policies arguing for no new capability. Plugin only costs **zero tokens per
turn**.

## Why vendored rather than installed

`npx chisle` writes to `~/.config/opencode/`, which is device-local, so a
hand-install does not travel. These files are ~45KB and change rarely; carrying
them means `sync.sh` installs the same bytes on every machine and `git log` shows
when they moved.

## Updating

Do not run the real installer — it brings the ruleset back.

```bash
git clone https://github.com/JayPokale/Chisle /tmp/chisle && cd /tmp/chisle
node bin/install.js --only opencode --dry-run     # confirm the file list is still these three
```

Then re-copy into this directory, exactly as `copyOpencodePlugin()` does:

| upstream | here |
|---|---|
| `.opencode/plugins/chisle.mjs` | `chisle.js` (opencode auto-discovers `.js`/`.ts`, not `.mjs`) |
| `hooks/chisle-compress-output.js` | `chisle-hooks/chisle-compress-output.js` |
| `hooks/chisle-config.js` | `chisle-hooks/chisle-config.js` |
| — | `chisle-hooks/package.json` = `{ "type": "commonjs" }` |

That last file is not decoration: the core is CommonJS, and without the pin the
config dir's own module type propagates down and the first `require` throws.

Update the version and commit in the table above, run `bash sync.sh`, then check
`bun bin/chisle-savings.mjs` still reports — the marker format is upstream's and
that script parses it.

## Measuring it

`npx chisle --stats` reads a ledger the opencode path never writes: in 3.5.0
`recordSavings()` has exactly two callers, the Copilot hook
(`chisle-compress-output.js:478`) and the Claude PostToolUse hook (`:496`), while
`compressForOpencode()` returns `transform(...)` directly. Use
`bun bin/chisle-savings.mjs` instead — it reads the marker out of `opencode.db`
and stats the spilled original beside it, so the saving is exact rather than
estimated. If a later version wires the opencode path, that script becomes
redundant; check before assuming it is still needed.
