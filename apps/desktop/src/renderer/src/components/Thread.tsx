import { useEffect, useRef } from "react";
import type { EventEnvelope, Thread as ThreadT } from "@stereo/core";
import { AGENT_NAME, formatTokens } from "../labels";
import { Markdown } from "./Markdown";

interface Props {
  thread: ThreadT;
  events: EventEnvelope[];
  live: string;
}

function EventRow({ envelope, agent }: { envelope: EventEnvelope; agent: ThreadT["agent"]["agent"] }) {
  const e = envelope.event;
  switch (e.type) {
    case "user-message":
      return <div className="user-bubble">{e.text}</div>;
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
        <div className={`agent-card ${agent}`}>
          <div className="who">{AGENT_NAME[agent]}</div>
          <Markdown text={e.text} />
        </div>
      );
    case "tool":
      return (
        <div className="tool-line">
          <span className={`tool-name ${agent}`}>{e.name.toLowerCase()}</span>
          <span className="tool-detail">{e.detail}</span>
        </div>
      );
    case "turn-end":
      return (
        <div className="turn-divider">
          {e.usage ? `${formatTokens(e.usage.inputTokens + e.usage.outputTokens)} tok` : ""}
        </div>
      );
    case "interrupted":
      return <div className="interrupt-line">◼ Interrupted — the session is intact, send a message to continue</div>;
    case "error":
      return <div className="error-card">{e.message}</div>;
    case "diff":
      return e.clean ? (
        <div className="diff-line clean">✓ working tree clean</div>
      ) : (
        <div className="diff-line">
          <span className="dot">●</span> {e.stats.filesChanged} file{e.stats.filesChanged === 1 ? "" : "s"} uncommitted{" "}
          <span className="add">+{e.stats.additions}</span> <span className="del">−{e.stats.deletions}</span>
          <span className="dim"> — review in your editor, commit when happy</span>
        </div>
      );
    default:
      return null;
  }
}

export function Thread({ thread, events, live }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

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
      {events.map((envelope) => (
        <EventRow key={envelope.seq} envelope={envelope} agent={thread.agent.agent} />
      ))}
      {live.length > 0 && (
        <div className={`agent-card ${thread.agent.agent}`}>
          <div className="who">{AGENT_NAME[thread.agent.agent]}</div>
          <Markdown text={live} />
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
  );
}
