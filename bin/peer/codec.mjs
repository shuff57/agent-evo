// Skein-compatible peerProtocol v1 codec for the hybrid Claude Code <-> opencode bridge.
//
// Wire shape (confirmed against opencode-skein's
// packages/opencode/src/peer/claude/codec.ts, peerProtocol v1): an auth frame
// followed by a user frame, one JSON object per line (NDJSON). The user frame's
// message.content is a <cross-session-message> envelope whose attributes carry
// sender identity and whose body carries the message text.
//
// Two trust boundaries shape this module:
//   1. Attribute values (from / from-name / from-mode) are routinely
//      model-generated, so they are escaped before interpolation.
//   2. Body text can originate from model output, so it is neutralized against
//      closing-tag and forged-attribute injection before it is wrapped.
//
// Node standard library only. No dependencies.
import crypto from 'node:crypto';

export const PEER_PROTOCOL_VERSION = 1;
export const PRIORITIES = Object.freeze(['now', 'next', 'later']);
export const DEFAULT_PRIORITY = 'next';

/** Typed error so a caller can branch on `err.code` instead of parsing messages. */
export class CodecError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CodecError';
    this.code = code;
  }
}

// Whitespace-tolerant and case-insensitive: a forged closing tag with padding
// must not slip past the neutralizer.
const CLOSING_TAG_RE = /<\/\s*cross-session-message\s*>/gi;
const FORGED_ATTR_RE = /from\s*=\s*"/gi;
const ENVELOPE_RE =
  /^<cross-session-message from="([^"]*)" from-name="([^"]*)" from-mode="([^"]*)">\n([\s\S]*)\n<\/cross-session-message>$/;

function requireString(value, code, message) {
  if (typeof value !== 'string') throw new CodecError(code, message);
  return value;
}

/**
 * Neutralizes body text that could forge envelope structure or sender identity.
 * Lossy by design: a literal closing tag becomes its escaped form.
 */
export function sanitizeText(text) {
  requireString(text, 'invalid-text', 'sanitizeText: text must be a string');
  return text.replace(CLOSING_TAG_RE, '&lt;/cross-session-message&gt;').replace(FORGED_ATTR_RE, 'from&#61;"');
}

/**
 * Escapes a value interpolated into an envelope ATTRIBUTE. `&` is escaped first,
 * or the later escapes would be double-encoded.
 */
export function sanitizeAttr(value) {
  requireString(value, 'invalid-attr', 'sanitizeAttr: value must be a string');
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\r\n]/g, ' ');
}

/**
 * Wraps message text in the confirmed envelope. `fromName`/`fromMode` default to
 * empty strings so a caller that only knows the address still produces a
 * well-formed envelope.
 */
export function buildEnvelope(input) {
  if (!input || typeof input !== 'object') {
    throw new CodecError('invalid-envelope-input', 'buildEnvelope: input object is required');
  }
  const from = sanitizeAttr(input.from);
  const fromName = sanitizeAttr(input.fromName ?? '');
  const fromMode = sanitizeAttr(input.fromMode ?? '');
  const text = sanitizeText(input.text);
  return `<cross-session-message from="${from}" from-name="${fromName}" from-mode="${fromMode}">\n${text}\n</cross-session-message>`;
}

/**
 * Strips the envelope from inbound content. A non-matching content string is
 * returned as `{ text: content }` rather than dropped. The returned from/fromName
 * are for DISPLAY ONLY: provenance for authorization is the authenticated socket
 * the frame arrived on, never these attributes.
 */
export function parseEnvelope(content) {
  requireString(content, 'invalid-content', 'parseEnvelope: content must be a string');
  const match = content.match(ENVELOPE_RE);
  if (!match) return { text: content };
  const [, from, fromName, fromMode, text] = match;
  return { from, fromName, fromMode, text };
}

/** A fresh UUID v4 for a frame's msg_id. */
export function randomMsgId() {
  return crypto.randomUUID();
}

/** The first frame on a connection: proves possession of the peer token. */
export function buildAuthFrame(token) {
  requireString(token, 'invalid-token', 'buildAuthFrame: token must be a string');
  if (token.length === 0) throw new CodecError('invalid-token', 'buildAuthFrame: token must not be empty');
  return { type: 'auth', token };
}

/**
 * The user frame. Key order is part of the wire contract (msgV, msg_id, type,
 * message, priority, from) and is preserved by JSON.stringify. `from` is the
 * sender's UDS address; the envelope's `from` attribute is the escaped copy.
 */
export function buildMessageFrame(input) {
  if (!input || typeof input !== 'object') {
    throw new CodecError('invalid-frame-input', 'buildMessageFrame: input object is required');
  }
  const priority = input.priority ?? DEFAULT_PRIORITY;
  if (!PRIORITIES.includes(priority)) {
    throw new CodecError('invalid-priority', `buildMessageFrame: priority must be one of ${PRIORITIES.join('|')}`);
  }
  return {
    msgV: PEER_PROTOCOL_VERSION,
    msg_id: randomMsgId(),
    type: 'user',
    message: { role: 'user', content: buildEnvelope(input) },
    priority,
    from: input.from,
  };
}

/** One JSON object per line, trailing newline — the confirmed NDJSON framing. */
export function encodeFrames(frames) {
  if (!Array.isArray(frames)) throw new CodecError('invalid-frames', 'encodeFrames: frames must be an array');
  for (const frame of frames) {
    if (!frame || typeof frame !== 'object') {
      throw new CodecError('invalid-frame', 'encodeFrames: every frame must be an object');
    }
  }
  return frames.map((frame) => JSON.stringify(frame)).join('\n') + '\n';
}
