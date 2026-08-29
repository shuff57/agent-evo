#!/usr/bin/env node
// PreToolUse warner for two Bash traps that are documented and STILL bite.
//
//   ~/.claude/settings.json -> hooks.PreToolUse[]
//   { "matcher": "Bash",
//     "hooks": [{"type":"command",
//                "command":"node <HOME>/.claude/bin/bash-trap-warn.mjs"}] }
//
// WHY A HOOK AND NOT MORE PROSE. Both traps below are already written down --
// one in the Bash tool description that is read every single session, one in
// ~/.claude/CLAUDE.md -- and both were walked into anyway on 2026-08-27, the
// tail-pipe one TWICE in the same session, the second time by the very agent
// that had just finished writing up the first. A modify-mode evolution pass
// examined this on 2026-08-27 and concluded it is a salience-under-load
// problem rather than a placement gap: the text is at maximum structural
// visibility already and there is nowhere better to put it. That is what a
// point-of-use warning is for. It fires against the command as typed, at the
// moment it is typed, which no amount of documentation can do.
//
// NEVER BLOCKS. Exit code is always 0 and the tool call always proceeds.
// PreToolUse treats exit 2 as "block", and neither of these traps is
// unambiguous enough to earn that: a background pipe can be exactly what
// someone wants, and most heredoc backslashes are perfectly fine. A false
// block costs more than a redundant warning. This is deliberate -- do not
// "upgrade" it to blocking without a measured false-positive rate.
//
// Self-check:  node bash-trap-warn.mjs --selfcheck

import { readFileSync } from 'fs'

// ---------------------------------------------------------------------------
// Trap 1: piping a backgrounded process through tail/head.
//
// The pipe does not flush interim output, so the read-back is 0 bytes until
// the underlying process EXITS -- which looks exactly like "the run has
// produced nothing" right up until it is already over. Measured 2026-08-16
// polling a handoff.mjs dispatch, and again 2026-08-27 on a backgrounded
// pytest run and a backgrounded git push.
const BUFFERING_PIPE = /\|\s*(tail|head)\b/

// Reading a backgrounded run's own output FILE is the fix, so a command that
// is already doing that is not the trap -- do not warn on the remedy.
const READS_A_FILE = /\b(cat|sed|grep|rg|Read)\b[^|]*\.(output|log|txt|jsonl)\b/

// ---------------------------------------------------------------------------
// Trap 2: backslashes inside a heredoc.
//
// A heredoc body goes through one round of collapsing before the interpreter
// ever sees it, and a non-raw string literal eats another. `\n` written into
// a python heredoc can therefore arrive as a real newline, and `\f` as a 0x0C
// form feed -- which is how a control byte got written into a report on
// 2026-08-26 and reddened tests/test_no_control_bytes.py. chr(92) is the only
// backslash form immune to both. Python emits a SyntaxWarning; act on the
// FIRST one.
//
// Quoted delimiters (<<'PY') suppress shell expansion but NOT the interpreter
// half, so they are still worth flagging when the body carries escapes.
const HEREDOC = /<<-?\s*['"]?(\w+)['"]?/
const RISKY_ESCAPE = /\\[nrtf0abv\\]/

function warnings (cmd, background) {
  const out = []

  if (background && BUFFERING_PIPE.test(cmd) && !READS_A_FILE.test(cmd)) {
    out.push(
      'TRAP - backgrounded command piped through tail/head. The pipe does not ' +
      'flush until the process EXITS, so this reads back 0 bytes and looks ' +
      'like the run produced nothing. Drop the pipe and read the .output file ' +
      'the harness names, or poll a sentinel the run itself writes.'
    )
  }

  const hd = cmd.match(HEREDOC)
  if (hd && RISKY_ESCAPE.test(cmd.slice(cmd.indexOf(hd[0]) + hd[0].length))) {
    out.push(
      'TRAP - backslash escape inside a heredoc body. The heredoc collapses ' +
      'one round and a non-raw literal eats another, so \\n can arrive as a ' +
      'real newline and \\f as a 0x0C form feed. chr(92) is the only immune ' +
      'form. If a SyntaxWarning fires, act on the FIRST one.'
    )
  }

  return out
}

// ---------------------------------------------------------------------------

function selfcheck () {
  const cases = [
    // [background, command, expected count, label]
    [true,  'pytest -q 2>&1 | tail -40',                1, 'bg + tail'],
    [true,  'git push origin desktop 2>&1 | tail -25',  1, 'bg + tail (push)'],
    [false, 'pytest -q 2>&1 | tail -40',                0, 'fg + tail is fine'],
    [true,  'cat /tmp/run.output',                      0, 'reading the file is the FIX'],
    [true,  'tail -c 500 /tmp/task.output',             0, 'tail on a file, not a pipe'],
    [false, "python - <<'PY'\nprint('a\\nb')\nPY",      1, 'heredoc + escape'],
    [false, "python - <<'PY'\nprint(chr(92))\nPY",      0, 'chr(92) is the remedy'],
    [false, 'echo hello',                               0, 'ordinary command'],
  ]
  let bad = 0
  for (const [bg, cmd, want, label] of cases) {
    const got = warnings(cmd, bg).length
    const ok = got === want
    if (!ok) bad++
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${want}, got ${got}`)
  }
  console.log(`selfcheck: ${bad === 0 ? 'OK' : 'BLIND'} — ${cases.length - bad}/${cases.length} cases`)
  return bad === 0
}

if (process.argv.includes('--selfcheck')) {
  process.exit(selfcheck() ? 0 : 1)
}

// Never let a hook crash a tool call. Any parse failure means stay silent.
try {
  const raw = readFileSync(0, 'utf8')
  const p = JSON.parse(raw)
  if (p.tool_name === 'Bash') {
    const i = p.tool_input ?? {}
    const cmd = String(i.command ?? '')
    // The harness has used both spellings; accept either rather than guess.
    const bg = Boolean(i.run_in_background ?? i.runInBackground)
    const w = warnings(cmd, bg)
    if (w.length) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: w.join('\n')
        }
      }))
    }
  }
} catch {
  // stay silent
}
process.exit(0)
