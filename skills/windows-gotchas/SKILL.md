---
name: windows-gotchas
description: Windows and PowerShell pitfalls that silently corrupt Claude Code scripts, hooks, and verification steps. Use when writing or debugging a .ps1 script, a hook, or a statusline; when node and Git Bash exchange files; when python dies with no traceback; and whenever something "runs fine but produces nothing" on Windows. Covers .ps1 ANSI codepage/BOM, the PowerShell 5.1 vs 7 escape split, stdin capture, flat-only skill discovery, /tmp differing between node and Git Bash, bash reserved variables shadowing assignments, scratchpad ESM failing to resolve repo node_modules, SSLKEYLOGFILE set by antivirus killing python outright, and pipes buffering a backgrounded process until exit.
---

# Windows / PowerShell gotchas

When writing `.ps1` scripts (e.g. statusline, hooks) that will be invoked by Claude Code on Windows:

- **PowerShell 5.1 reads `.ps1` files in the system ANSI codepage, not UTF-8.** Unicode block chars (`█`, `░`, `▓`) and other non-ASCII content parse as garbage unless the file has a UTF-8 BOM. Prefer ASCII-only chars (`#`, `-`, `=`) for portability.
- **The `` `e `` ANSI-escape character literal is PowerShell 7+ only.** On 5.1 (the default `powershell.exe`), use `[char]27` to get ESC for ANSI color codes.
- **Stdin reading via `$input` is fragile** when the parent shell pipes JSON in (Git Bash → `powershell -File ...`). Prefer `[Console]::In.ReadToEnd()` for reliable single-shot stdin capture.
- **Skill discovery is flat-only.** Project-local skills must live at `.claude/skills/<name>/SKILL.md` directly — nested `<group>/<name>/SKILL.md` is NOT auto-discovered by the loader.
- **`/tmp` resolves differently in node vs Git Bash on Windows.** Node `fs`/`fetch` resolve `/tmp` to `C:\tmp`; Git Bash `curl`/`cat` resolve `/tmp` to the Git Bash mount. When a verification step writes a file from node and reads it from bash (or vice versa), use an explicit absolute path — `os.tmpdir()` in node, `$TEMP` or a repo-local `.tmp/` in bash — never the literal `/tmp`.
- **Bash builtin/special variables silently shadow your own assignment.** `GROUPS` is a bash builtin array holding the user's group ids — `GROUPS=(a b c)` doesn't error, it just no-ops your intent, and the failure surfaces far away (a later `${GROUPS[0]}`-style expansion pulls a numeric gid instead of your value, producing something like a baffling `fatal: Not a valid object name 197610` out of an unrelated `git` command). Other bash-reserved names to avoid for your own variables: `RANDOM`, `SECONDS`, `LINENO`, `PPID`, `REPLY`, `IFS`, `PATH`, `PS1`-`PS4`, `BASH_*`. Check `declare -p <name>` before reusing a short/common name for a loop or array variable.
- **An ESM script written to the session scratchpad can't resolve the repo's `node_modules`.** Node's ESM resolver walks up from the *script's own file location*, not the shell's cwd — a `.mjs` file under the scratchpad temp dir throws `ERR_MODULE_NOT_FOUND` for packages (e.g. `playwright`) that are installed in the project repo, even though the shell cwd is the repo root. Fix: `import { createRequire } from 'module'; const require = createRequire(pathToRepoPackageJson);` — pointing `createRequire` at the repo's own `package.json` (not the scratchpad file) re-roots resolution at the repo's `node_modules`. This will recur for any scratchpad-written ESM script that imports a repo dependency; the scratchpad convention itself doesn't account for it.
- **`SSLKEYLOGFILE` set by antivirus kills Python outright, with no traceback.** Norton
  sets it to a filter-driver path (`\\.\nllMonFltProxy\...`). Python's default SSL
  context opens that path as a `FILE*` — the one OpenSSL operation requiring
  `OPENSSL_Applink` — so the interpreter dies with `OPENSSL_Uplink ... no
  OPENSSL_Applink` and **no traceback and no partial output**. It is not limited to
  HTTPS: `urllib.request.urlopen` builds an HTTPSHandler even for a plain
  `http://localhost` URL, so local-only tooling dies too. The failure reads as a hang,
  an empty result, or (worst) a test suite that stops mid-run and returns non-zero with
  no summary line — which looks like "it ran" if you only check the exit code. Measured
  2026-08-26 on bookSHelf, where it had silently disabled `pytest`, the repo's only push
  gate. `Remove-Item Env:SSLKEYLOGFILE` / `unset SSLKEYLOGFILE` before any python, or
  set it empty in the harness env. `http.client` is unaffected for plain HTTP; `curl`
  is unaffected entirely (it ships its own OpenSSL), which is why a curl probe can pass
  while the equivalent python crashes.
- **Piping a backgrounded process through `tail`/`head` buffers until the pipe closes.** Checking on a long dispatch with `... | tail -n 20` or `| head -c 500` reads back 0 bytes every time until the underlying process exits — the pipe doesn't flush interim output, so it looks like the run has produced nothing right up until it's already over. Measured 2026-08-16 polling a `handoff.mjs` dispatch. Read the target file/log directly (no pipe) to see interim progress, or poll a sentinel the run itself writes.
