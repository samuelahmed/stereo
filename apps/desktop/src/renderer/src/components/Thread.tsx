import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AgentId, AssistantArtifact, EventEnvelope, Thread as ThreadT, ToolEventData } from "@stereo/core";
import { AGENT_NAME, formatTokens } from "../labels";
import { Markdown } from "./Markdown";
import { AttachmentPreview } from "./AttachmentPreview";
import { StereoBrandCharacter } from "./StereoBrandCharacter";

interface Props {
  thread: ThreadT;
  events: EventEnvelope[];
  live: string;
  onOpenLink(href: string): void;
  onResolvePermission(requestId: string, allowed: boolean): void;
}

type TranscriptItem =
  | { type: "event"; envelope: EventEnvelope }
  | { type: "tools"; envelopes: EventEnvelope[] }
  | { type: "artifacts"; envelopes: EventEnvelope[] };

const TRANSCRIPT_PAGE_SIZE = 160;

/** Keep noisy tool runs compact and display adjacent artifacts as one gallery. */
function groupEvents(events: EventEnvelope[]): TranscriptItem[] {
  const items: TranscriptItem[] = [];

  for (const envelope of events) {
    if (envelope.event.type === "assistant-artifact") {
      const previous = items.at(-1);
      if (previous?.type === "artifacts") previous.envelopes.push(envelope);
      else items.push({ type: "artifacts", envelopes: [envelope] });
      continue;
    }
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

function ArtifactGroup({ envelopes, agent }: { envelopes: EventEnvelope[]; agent: AgentId }) {
  const artifacts = envelopes.flatMap((envelope) =>
    envelope.event.type === "assistant-artifact" ? [envelope.event.artifact] : [],
  );
  return (
    <div className={`agent-message assistant-artifacts ${agent}`}>
      <div className="message-label">{AGENT_NAME[agent]}</div>
      <div className="assistant-artifact-grid">
        {artifacts.map((artifact: AssistantArtifact) => (
          <div className="assistant-artifact-card" key={artifact.id}>
            <AttachmentPreview attachment={artifact} />
            <span title={artifact.name}>{artifact.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function mergedTools(envelopes: EventEnvelope[]): ToolEventData[] {
  const calls: ToolEventData[] = [];
  const byId = new Map<string, ToolEventData>();
  for (const envelope of envelopes) {
    if (envelope.event.type !== "tool") continue;
    const event = envelope.event;
    const existing = event.callId ? byId.get(event.callId) : undefined;
    if (!existing) {
      const call = { ...event };
      calls.push(call);
      if (call.callId) byId.set(call.callId, call);
      continue;
    }
    if (event.name && event.name !== "Tool") existing.name = event.name;
    if (event.detail) existing.detail = event.detail;
    if (event.input !== undefined) existing.input = event.input;
    if (event.output !== undefined) existing.output = event.output;
    if (event.phase) existing.phase = event.phase;
  }
  return calls;
}

function toolValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function ToolEvidence({ label, value }: { label: string; value: unknown }) {
  const text = toolValue(value);
  return (
    <section className="tool-evidence-section">
      <div className="tool-evidence-heading">
        <span>{label}</span>
        <button type="button" onClick={() => void navigator.clipboard.writeText(text).catch(() => {})}>Copy</button>
      </div>
      <pre>{text}</pre>
    </section>
  );
}

function ToolGroup({ envelopes, agent }: { envelopes: EventEnvelope[]; agent: AgentId }) {
  const tools = mergedTools(envelopes);
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
          <details className="tool-call" key={tool.callId ?? `${envelopes[index]?.seq ?? index}-${tool.name}`}>
            <summary>
              <span className="tool-name">{tool.name}</span>
              <span className="tool-detail" title={tool.detail}>{tool.detail || (tool.phase === "started" ? "Running…" : "Details")}</span>
            </summary>
            <div className="tool-evidence">
              {tool.input !== undefined && <ToolEvidence label="Input" value={tool.input} />}
              {tool.output !== undefined && <ToolEvidence label="Output" value={tool.output} />}
              {tool.input === undefined && tool.output === undefined && <ToolEvidence label="Detail" value={tool.detail || "No additional data was provided by the harness."} />}
              {tool.phase === "started" && tool.output === undefined && <div className="tool-evidence-note">The harness has not provided a result yet.</div>}
            </div>
          </details>
        ))}
      </div>
    </details>
  );
}

type PermissionState = boolean | "expired";

function EventRow({ envelope, agent, onOpenLink, resolvedPermissions, onResolvePermission }: { envelope: EventEnvelope; agent: AgentId; onOpenLink(href: string): void; resolvedPermissions: Map<string, PermissionState>; onResolvePermission(requestId: string, allowed: boolean): void }) {
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
            Context handoff · ~{formatTokens(e.approxTokens * 1)} tokens
            {e.trimmedEvents > 0 && (
              <span className="trim-warning"> · {e.trimmedEvents} oldest events trimmed to fit the context budget</span>
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
    case "assistant-artifact":
      return null;
    case "tool":
      return null;
    case "permission-request": {
      const resolved = resolvedPermissions.get(e.request.id);
      return (
        <div className={`permission-card ${resolved === false || resolved === "expired" ? "denied" : ""}`}>
          <div className="permission-card-icon">!</div>
          <div className="permission-card-body">
            <strong>{e.request.title}</strong>
            <span>{e.request.detail || e.request.tool}</span>
          </div>
          {resolved === undefined ? (
            <div className="permission-card-actions">
              <button className="btn ghost" onClick={() => onResolvePermission(e.request.id, false)}>Deny</button>
              <button className="btn primary" onClick={() => onResolvePermission(e.request.id, true)}>Allow once</button>
            </div>
          ) : <span className="permission-result">{resolved === "expired" ? "Expired" : resolved ? "Allowed" : "Denied"}</span>}
        </div>
      );
    }
    case "permission-response":
      return null;
    case "checkpoint":
      return <div className="checkpoint-line">{e.label}</div>;
    case "compacted":
      return <div className="notice-line">↘ Context compacted to ~{formatTokens(e.approxTokens)} tokens{e.trimmedEvents ? ` · ${e.trimmedEvents} older events omitted` : ""}</div>;
    case "turn-end":
      return (
        <div className="turn-end">
          {e.usage ? `${formatTokens(e.usage.inputTokens + e.usage.outputTokens)} tokens used` : "Turn complete"}
        </div>
      );
    case "interrupted":
      return <div className="interrupt-line">Interrupted — the session is intact, send a message to continue</div>;
    case "notice":
      return <div className="notice-line">{e.text}</div>;
    case "error":
      return <div className="error-card">{e.message}</div>;
    case "diff":
      return null;
    default:
      return null;
  }
}

export function Thread({ thread, events, live, onOpenLink, onResolvePermission }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const prependHeight = useRef<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(TRANSCRIPT_PAGE_SIZE);
  const items = useMemo(() => groupEvents(events), [events]);
  const hiddenCount = Math.max(0, items.length - visibleCount);
  const visibleItems = hiddenCount > 0 ? items.slice(hiddenCount) : items;
  const resolvedPermissions = useMemo(() => {
    const states = new Map<string, PermissionState>();
    const pending = new Set<string>();
    for (const envelope of events) {
      const event = envelope.event;
      if (event.type === "permission-request") pending.add(event.request.id);
      if (event.type === "permission-response") {
        states.set(event.requestId, event.allowed);
        pending.delete(event.requestId);
      }
      if (event.type === "interrupted" || event.type === "turn-end" || event.type === "error") {
        for (const requestId of pending) states.set(requestId, "expired");
        pending.clear();
      }
    }
    return states;
  }, [events]);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [events.length, live]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || prependHeight.current === null) return;
    el.scrollTop += el.scrollHeight - prependHeight.current;
    prependHeight.current = null;
  }, [visibleCount]);

  const showEarlier = () => {
    const el = scroller.current;
    if (el) prependHeight.current = el.scrollHeight;
    setVisibleCount((count) => Math.min(items.length, count + TRANSCRIPT_PAGE_SIZE));
  };

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
        {hiddenCount > 0 && (
          <button className="load-earlier" type="button" onClick={showEarlier}>
            Show earlier activity <span>{hiddenCount.toLocaleString()} hidden</span>
          </button>
        )}
        {visibleItems.map((item) =>
          item.type === "tools" ? (
            <ToolGroup key={`tools-${item.envelopes[0]?.seq}`} envelopes={item.envelopes} agent={thread.agent.agent} />
          ) : item.type === "artifacts" ? (
            <ArtifactGroup key={`artifacts-${item.envelopes[0]?.seq}`} envelopes={item.envelopes} agent={thread.agent.agent} />
          ) : (
            <EventRow key={item.envelope.seq} envelope={item.envelope} agent={thread.agent.agent} onOpenLink={onOpenLink} resolvedPermissions={resolvedPermissions} onResolvePermission={onResolvePermission} />
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
            <StereoBrandCharacter
              motion="working"
              className="status-character"
              color={thread.agent.agent === "claude" ? "var(--claude-character)" : "var(--codex-character)"}
            />
            {AGENT_NAME[thread.agent.agent]} is working…
          </div>
        )}
      </div>
    </div>
  );
}
