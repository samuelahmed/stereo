import { useEffect, useMemo, useRef } from "react";
import type { AgentId, EventEnvelope, Thread as ThreadT } from "@stereo/core";
import { AGENT_NAME, formatTokens } from "../labels";
import { Markdown } from "./Markdown";
import { AttachmentPreview } from "./AttachmentPreview";

interface Props {
  thread: ThreadT;
  events: EventEnvelope[];
  live: string;
  onOpenLink(href: string): void;
}

type TranscriptItem =
  | { type: "event"; envelope: EventEnvelope }
  | { type: "tools"; envelopes: EventEnvelope[] };

/** Keep noisy runs of tool calls compact without hiding them from the transcript. */
function groupEvents(events: EventEnvelope[]): TranscriptItem[] {
  const items: TranscriptItem[] = [];

  for (const envelope of events) {
    if (envelope.event.type !== "tool") {
      items.push({ type: "event", envelope });
      continue;
    }

    const previous = items.at(-1);
    if (previous?.type === "tools") previous.envelopes.push(envelope);
    else items.push({ type: "tools", envelopes: [envelope] });
  }

  return items;
}

function ToolIcon({ name }: { name: string }) {
  const normalized = name.toLowerCase();
  const glyph = normalized.includes("read")
    ? "R"
    : normalized.includes("grep") || normalized.includes("search")
      ? "S"
      : normalized.includes("edit") || normalized.includes("write") || normalized.includes("patch")
        ? "E"
        : normalized.includes("bash") || normalized.includes("shell") || normalized.includes("command")
          ? ">"
          : "·";
  return <span className="tool-icon" aria-hidden="true">{glyph}</span>;
}

function ToolGroup({ envelopes, agent }: { envelopes: EventEnvelope[]; agent: AgentId }) {
  const tools = envelopes.flatMap((envelope) => (envelope.event.type === "tool" ? [envelope.event] : []));
  const last = tools.at(-1);

  return (
    <details className={`tool-group ${agent}`}>
      <summary>
        <span className="tool-chevron" aria-hidden="true" />
        <span className="tool-group-label">{tools.length === 1 ? last?.name : `${tools.length} tool calls`}</span>
        {last && <span className="tool-group-preview">{last.detail}</span>}
      </summary>
      <div className="tool-list">
        {tools.map((tool, index) => (
          <div className="tool-call" key={`${envelopes[index]?.seq ?? index}-${tool.name}`}>
            <ToolIcon name={tool.name} />
            <span className="tool-name">{tool.name}</span>
            <span className="tool-detail" title={tool.detail}>{tool.detail}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function EventRow({ envelope, agent, onOpenLink }: { envelope: EventEnvelope; agent: AgentId; onOpenLink(href: string): void }) {
  const e = envelope.event;
  switch (e.type) {
    case "user-message":
      return (
        <div className="message-row user-message">
          <div className="message-label">You</div>
          <div className="user-bubble">
            {e.text && <div>{e.text}</div>}
            {e.attachments && e.attachments.length > 0 && (
              <div className="message-attachments">
                {e.attachments.map((attachment) => (
                  <div className="message-attachment" key={attachment.path} title={attachment.path}>
                    <AttachmentPreview attachment={attachment} />
                    <span>{attachment.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    case "briefing":
      return (
        <details className="briefing-card">
          <summary>
            ⑂ Context handoff · ~{formatTokens(e.approxTokens * 1)} tokens
            {e.trimmedEvents > 0 && (
              <span className="trim-warning"> · ⚠ {e.trimmedEvents} oldest events trimmed to fit the context budget</span>
            )}
          </summary>
          <pre>{e.text}</pre>
        </details>
      );
    case "agent-text":
      return (
        <div className={`agent-message ${agent}`}>
          <div className="message-label">{AGENT_NAME[agent]}</div>
          <Markdown text={e.text} onOpenLink={onOpenLink} />
        </div>
      );
    case "tool":
      return null;
    case "turn-end":
      return (
        <div className="turn-end">
          {e.usage ? `${formatTokens(e.usage.inputTokens + e.usage.outputTokens)} tokens used` : "Turn complete"}
        </div>
      );
    case "interrupted":
      return <div className="interrupt-line">◼ Interrupted — the session is intact, send a message to continue</div>;
    case "notice":
      return <div className="notice-line">⟳ {e.text}</div>;
    case "error":
      return <div className="error-card">{e.message}</div>;
    case "diff":
      return null;
    default:
      return null;
  }
}

export function Thread({ thread, events, live, onOpenLink }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const items = useMemo(() => groupEvents(events), [events]);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [events.length, live]);

  return (
    <div
      className="thread"
      ref={scroller}
      onScroll={() => {
        const el = scroller.current;
        if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      <div className="conversation">
        {items.map((item) =>
          item.type === "tools" ? (
            <ToolGroup key={`tools-${item.envelopes[0]?.seq}`} envelopes={item.envelopes} agent={thread.agent.agent} />
          ) : (
            <EventRow key={item.envelope.seq} envelope={item.envelope} agent={thread.agent.agent} onOpenLink={onOpenLink} />
          ),
        )}
        {live.length > 0 && (
          <div className={`agent-message live-message ${thread.agent.agent}`}>
            <div className="message-label">{AGENT_NAME[thread.agent.agent]}</div>
            <Markdown text={live} onOpenLink={onOpenLink} />
            <span className="cursor" />
          </div>
        )}
        {thread.status === "running" && live.length === 0 && (
          <div className="status-banner">
            <span className={`pulse-dot ${thread.agent.agent}`} />
            {AGENT_NAME[thread.agent.agent]} is working…
          </div>
        )}
      </div>
    </div>
  );
}
