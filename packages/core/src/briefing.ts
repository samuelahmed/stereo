import type { AgentId, EventEnvelope } from "./types.js";

/**
 * The one compiler, two callers: "fork/duplicate a thread to any model" and
 * "resume when the native session is lost". It turns the saved transcript into
 * model context. Deliberately dumb — it emits everything we saved, in order —
 * with a single hard cap so an oversized briefing fails gracefully instead of
 * erroring at the API after a long wait.
 *
 * Cap: ~200k tokens (~4 chars/token). Claude's window is 1M, but the Codex CLI
 * only exposes ~258k usable input, so the cap sizes to the smaller vendor with
 * room left for its own system prompt and the actual new work.
 */
export const MAX_BRIEFING_CHARS = 800_000;
const WRAPPER_RESERVE = 4_000;

export const approxTokens = (chars: number): number => Math.round(chars / 4);

const AGENT_LABEL: Record<AgentId, string> = { claude: "Claude Code", codex: "Codex" };

export interface CompiledBriefing {
  text: string;
  trimmedEvents: number;
  approxTokens: number;
}

interface TranscriptPart {
  isUser: boolean;
  text: string;
}

function renderEvent(envelope: EventEnvelope, agentLabel: string): TranscriptPart | null {
  const e = envelope.event;
  switch (e.type) {
    case "user-message":
      return {
        isUser: true,
        text: `## User\n${e.text}${
          e.attachments?.length
            ? `\n\nAttached local files:\n${e.attachments.map((attachment) => `- ${attachment.path.replace(/[\r\n]/g, "")}`).join("\n")}`
            : ""
        }`,
      };
    case "agent-text":
      return { isUser: false, text: `## ${agentLabel}\n${e.text}` };
    case "assistant-artifact":
      return { isUser: false, text: `> [generated ${e.artifact.kind}] ${e.artifact.path.replace(/[\r\n]/g, "")}` };
    case "tool":
      return e.detail ? { isUser: false, text: `> [${e.name}] ${e.detail}` } : null;
    case "briefing":
      return { isUser: false, text: `## Handoff context this thread started from\n${e.text}` };
    case "interrupted":
      return { isUser: false, text: `> (the user interrupted this turn)` };
    default:
      return null;
  }
}

/**
 * Compile the transcript under a character budget. Trims oldest-first and
 * drops non-user parts before user messages — the user's words are the
 * intent-dense, portable core of the thread.
 */
function compileTranscript(events: EventEnvelope[], fromAgent: AgentId, budget: number): CompiledBriefing {
  const seenToolCalls = new Set<string>();
  const parts = events
    .map((envelope) => {
      if (envelope.event.type === "tool" && envelope.event.callId) {
        if (seenToolCalls.has(envelope.event.callId)) return null;
        seenToolCalls.add(envelope.event.callId);
      }
      return renderEvent(envelope, AGENT_LABEL[fromAgent]);
    })
    .filter((p): p is TranscriptPart => p !== null);

  const size = (list: (TranscriptPart | null)[]): number =>
    list.reduce((n, p) => n + (p ? p.text.length + 2 : 0), 0);

  const kept: (TranscriptPart | null)[] = [...parts];
  let trimmed = 0;

  // Pass 1: drop oldest non-user parts. Pass 2 (extreme): oldest user messages too.
  for (const dropUsers of [false, true]) {
    for (let i = 0; i < kept.length && size(kept) > budget; i++) {
      const part = kept[i];
      if (part && (dropUsers || !part.isUser)) {
        kept[i] = null;
        trimmed += 1;
      }
    }
  }

  const body = kept.filter((p): p is TranscriptPart => p !== null).map((p) => p.text);
  if (trimmed > 0) {
    body.unshift(
      `⚠ Note: this thread's history exceeded the context budget. The earliest ${trimmed} events were omitted from this handoff; everything below is complete and in order.`,
    );
  }
  const text = body.join("\n\n");
  return { text, trimmedEvents: trimmed, approxTokens: approxTokens(text.length) };
}

/** Briefing for "duplicate / continue this thread with another model". */
export function buildForkBriefing(
  events: EventEnvelope[],
  opts: { fromAgent: AgentId; cwd: string },
): CompiledBriefing {
  const transcript = compileTranscript(events, opts.fromAgent, MAX_BRIEFING_CHARS - WRAPPER_RESERVE);
  const text = [
    `You are taking over an ongoing coding session that was previously driven by ${AGENT_LABEL[opts.fromAgent]}. The full session transcript is below. All work so far already exists in the working tree at ${opts.cwd} — read files there for ground truth; the transcript is context, the tree is authoritative.`,
    `--- SESSION TRANSCRIPT ---`,
    transcript.text,
    `--- END TRANSCRIPT ---`,
    `Continue this session. The user's next message follows.`,
  ].join("\n\n");
  return { text, trimmedEvents: transcript.trimmedEvents, approxTokens: approxTokens(text.length) };
}

/**
 * Briefing for continuing a thread whose native CLI session was lost — the
 * second caller of the compiler. Same transcript, different wrapper: the
 * agent answers the user's latest message instead of waiting for a new one.
 */
export function buildResumeBriefing(
  events: EventEnvelope[],
  opts: { fromAgent: AgentId; cwd: string },
): CompiledBriefing {
  const transcript = compileTranscript(events, opts.fromAgent, MAX_BRIEFING_CHARS - WRAPPER_RESERVE);
  const text = [
    `You are continuing an ongoing coding session, but the CLI's native session state could not be loaded, so the full session transcript is provided below instead. All work so far already exists in the working tree at ${opts.cwd} — read files there for ground truth; the transcript is context, the tree is authoritative.`,
    `--- SESSION TRANSCRIPT ---`,
    transcript.text,
    `--- END TRANSCRIPT ---`,
    `Respond to the user's most recent message in the transcript above.`,
  ].join("\n\n");
  return { text, trimmedEvents: transcript.trimmedEvents, approxTokens: approxTokens(text.length) };
}

const MAX_DIFF_CHARS_IN_BRIEFING = 200_000;

/** Briefing for "review this thread's uncommitted work with another model". */
export function buildReviewBriefing(
  events: EventEnvelope[],
  diff: string,
  opts: { fromAgent: AgentId; cwd: string },
): CompiledBriefing {
  const clippedDiff = diff.length > MAX_DIFF_CHARS_IN_BRIEFING ? `${diff.slice(0, MAX_DIFF_CHARS_IN_BRIEFING)}\n[diff truncated]` : diff;
  const budget = MAX_BRIEFING_CHARS - WRAPPER_RESERVE - clippedDiff.length;
  const transcript = compileTranscript(events, opts.fromAgent, Math.max(budget, 50_000));
  const text = [
    `You are reviewing work done by another AI agent (${AGENT_LABEL[opts.fromAgent]}) in the repository at ${opts.cwd}. The session transcript and the current uncommitted diff are below. You share the same working tree and may read any file for context.`,
    `Review the diff for real defects: bugs, missed requirements, broken edge cases, security problems. Do not raise style preferences. Report findings ordered by severity, each with the file and a concrete failure scenario. If the diff is sound, say so plainly.`,
    `Do not modify any files unless the user explicitly asks you to fix something.`,
    `--- SESSION TRANSCRIPT ---`,
    transcript.text,
    `--- END TRANSCRIPT ---`,
    `--- UNCOMMITTED DIFF ---`,
    clippedDiff.trim().length > 0 ? clippedDiff : "(the working tree is clean — note this to the user)",
    `--- END DIFF ---`,
  ].join("\n\n");
  return { text, trimmedEvents: transcript.trimmedEvents, approxTokens: approxTokens(text.length) };
}
