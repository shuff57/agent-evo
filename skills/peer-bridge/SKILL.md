---
name: peer-bridge
description: >-
  The live same-box agent-to-agent channel - peerProtocol v1 over a Unix socket,
  the sidecar that relays into the message log, the peer CLI, and the watchable
  tmux lane. Use when wiring a new lane, debugging a message that never arrived,
  changing bin/peer/*, or deciding between the peer bridge and the message log.
---

# Peer bridge

The message center (`bin/msg.mjs`) is the durable, cross-machine channel: its log is
committed and ships with the repo. The peer bridge is the **live, same-box** one.

It speaks **peerProtocol v1**: an auth frame followed by a user frame, one JSON object per
line (NDJSON), over a Unix-domain socket. `bin/peer/codec.mjs` and `bin/peer/registry.mjs`
are the transport units; the sidecar and the CLI are the two ends.

## Where state lives

Registry and keys live under `.msgbox/peer/` — `registry.json` plus one `<peerId>.key` per
peer — beside `log.jsonl`. That directory is **device-local and gitignored**: `.gitignore`
keeps `.msgbox/*` and re-includes only `log.jsonl`, so keys never ship between machines.

## Sidecar

One per lane per box. Relays inbound frames into the box log:

```bash
node bin/peer-sidecar.mjs --as opencode [--heartbeat-ms 30000]
```

## Peer CLI

Outbound send, list, sweep, unregister:

```bash
node bin/peer.mjs send --to <name|pid> --text <s> [--priority now|next|later] \
                       [--from-name <s>] [--no-audit]
```

## Two properties that are easy to get wrong

**Identity is fail-closed.** The auth frame carries the sender's own key-file contents;
the receiver hashes it and matches it against a managed registry entry's `keyHash`. A
match names the connection; anything else — no match, no registry, unreadable key — is
destroyed silently and nothing is appended. The log's `from` is always the
registry-verified name; the envelope's `from` / `from-name` / `from-mode` attributes are
display-only and **never authorize**. The trust boundary is the same OS user and nothing
more: 0600 key files, a 0700 socket directory, no cross-user guarantee.

**Priority is honest.** The wire carries `now|next|later` for protocol compatibility and
the value is recorded on the entry, but there is no interrupt channel, so delivery is the
next tool call for all three. **`now` does not preempt a running turn.**

## Watchable lane (tmux)

The sidecar is a socket: fast and invisible. `bin/peer-term.mjs` is the same conversation
in a window you can attach to — one tmux session per lane, the prompt typed in, the reply
rendered live, the text returned on stdout:

```bash
node bin/peer-term.mjs ask --as <lane> --text <s> [--model ID] [--new] [--log] [--auto] [--timeout MS]
node bin/peer-term.mjs status --as <lane>
node bin/peer-term.mjs reset --as <lane> [--kill]
```

`tmux attach -t peer-<lane>` shows the exchange at any point. Three properties are worth
knowing before changing it:

- **Completion is a fact, not a heuristic.** The pane runs a generated script that records
  opencode's exit code and then touches a done-file; the caller waits for that file. No
  idle-detection, no "output stopped changing" guess — and a non-zero exit is reported
  rather than read as an empty reply.
- **The prompt never enters the command line.** It is written to a file and read back with
  `"$(cat file)"`, so `; | & $( ) < >` and quotes are data. That is the same class of
  failure the `handoff` skill documents five times over. The one casualty is trailing
  newlines, which command substitution strips; `bin/peer/term.test.mjs` pins that rather
  than hiding it.
- **Continuity is opencode's own.** The session id is read out of the `--format json`
  event stream and passed back as `--session` next turn, so each turn is a fresh process
  and the conversation still remembers itself. `--new` starts over; `reset` forgets.

`--log` threads both halves of the exchange into `log.jsonl`. Without it the committed
thread is left alone, because a scratch question should not ship to the other machine.
Scraping the real TUI was the alternative and was rejected: it needs idle-detection, ANSI
stripping and bracketed-paste handling, and it breaks on every TUI redesign.

## Testing

**Run every peer suite with `bun test`, not `node --test`.** On a box where `node` is a
shim to bun — this one — `node --test <file>` runs the file with no test runner at all and
`node:test` throws on the first case, which reads as a broken suite rather than a wrong
command. `bun test` works either way, so it is what every peer test header names.

```bash
bun test bin/peer/codec.test.mjs
bun test bin/peer/registry.test.mjs
bun test bin/peer/sidecar.test.mjs
bun test bin/peer/client.test.mjs
bun test bin/peer/term.test.mjs
bun bin/msg.test.mjs          # message center + ownership self-check
```
