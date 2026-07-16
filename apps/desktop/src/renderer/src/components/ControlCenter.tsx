import { useEffect, useMemo, useState } from "react";
import type { AgentStatusInfo, PermissionMode, ProjectInspection, SessionInfo, Thread } from "@stereo/core";
import { stereo } from "../bridge";
import { AGENT_NAME, formatTokens } from "../labels";
import { AgentPicker } from "./AgentPicker";

type Tab = "session" | "project" | "extensions" | "diagnostics";

interface Props {
  thread: Thread;
  agents: { claude: AgentStatusInfo; codex: AgentStatusInfo } | null;
  initialTab?: Tab;
  onClose(): void;
  onThreadCreated(thread: Thread): void;
  onError(message: string): void;
}

export function ControlCenter({ thread, agents, initialTab = "session", onClose, onThreadCreated, onError }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [inspection, setInspection] = useState<ProjectInspection | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [checkpoint, setCheckpoint] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = () => {
    void Promise.all([stereo.sessionInfo(thread.id), stereo.inspectProject(thread.projectId)])
      .then(([nextSession, nextInspection]) => {
        setSession(nextSession);
        setInspection(nextInspection);
      })
      .catch((error) => onError(error instanceof Error ? error.message : String(error)));
  };

  useEffect(refresh, [thread.id, thread.projectId]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    try {
      await action();
      refresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const contextLabel = useMemo(() => {
    if (!session) return "Loading…";
    const used = formatTokens(session.context.usedTokens);
    const window = session.context.windowTokens ? formatTokens(session.context.windowTokens) : "unknown";
    return `${used} / ${window}`;
  }, [session]);

  return (
    <div className="modal-backdrop control-backdrop" onPointerDown={onClose}>
      <div className="control-center" role="dialog" aria-modal="true" aria-label="Session and project controls" onPointerDown={(event) => event.stopPropagation()}>
        <div className="control-sidebar">
          <div className="control-title">Control center</div>
          <div className="control-subtitle">{AGENT_NAME[thread.agent.agent]} · {inspection?.project.name ?? "Project"}</div>
          {(["session", "project", "extensions", "diagnostics"] as Tab[]).map((item) => (
            <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
              <span>{item === "session" ? "◴" : item === "project" ? "⌂" : item === "extensions" ? "◇" : "↗"}</span>
              {item[0]!.toUpperCase() + item.slice(1)}
            </button>
          ))}
          <span className="control-spacer" />
          <button onClick={onClose}><span>×</span> Close</button>
        </div>
        <div className="control-content">
          {tab === "session" && (
            <>
              <div className="panel-heading"><div><h2>Session</h2><p>Context and lifecycle controls for this conversation.</p></div><span className={`agent-chip ${thread.agent.agent}`}>{AGENT_NAME[thread.agent.agent]}</span></div>
              <section className="metric-card context-card">
                <div className="metric-row"><span>Estimated context</span><strong>{contextLabel}</strong></div>
                <div className="context-meter"><span style={{ width: `${session?.context.percent ?? 0}%` }} /></div>
                <p>{session?.context.percent ?? 0}% of the known context window · transcript estimate, not provider billing</p>
              </section>
              <div className="metric-grid">
                <section className="metric-card"><span>Last turn</span><strong>{session?.lastTurnUsage ? formatTokens(session.lastTurnUsage.inputTokens + session.lastTurnUsage.outputTokens) : "—"}</strong><small>input + output tokens</small></section>
                <section className="metric-card"><span>All usage</span><strong>{session ? formatTokens(session.cumulativeUsage.inputTokens + session.cumulativeUsage.outputTokens) : "—"}</strong><small>cumulative, not context</small></section>
                <section className="metric-card"><span>Compactions</span><strong>{session?.compactions ?? 0}</strong><small>{session?.queuedMessages ?? 0} queued messages</small></section>
              </div>
              <section className="control-section">
                <h3>Context actions</h3>
                <div className="action-row">
                  <div><strong>Compact context</strong><span>Start a fresh native session with a bounded, portable transcript briefing.</span></div>
                  <button className="btn" disabled={thread.status === "running" || busy !== null} onClick={() => void run("compact", async () => { await stereo.compactSession(thread.id); })}>{busy === "compact" ? "Compacting…" : "Compact"}</button>
                </div>
                <div className="action-row">
                  <div><strong>Start fresh</strong><span>New conversation in this project with the same harness and access.</span></div>
                  <button className="btn ghost" onClick={() => void run("fresh", async () => onThreadCreated(await stereo.createThread({ cwd: thread.cwd, projectId: thread.projectId, agent: thread.agent, permission: thread.permission })))}>New thread</button>
                </div>
              </section>
              <section className="control-section">
                <h3>Checkpoint</h3>
                <div className="inline-form"><input value={checkpoint} onChange={(event) => setCheckpoint(event.target.value)} placeholder="e.g. Tests passing before refactor" /><button className="btn" disabled={thread.status === "running" || !checkpoint.trim()} onClick={() => void run("checkpoint", async () => { await stereo.addCheckpoint(thread.id, checkpoint); setCheckpoint(""); })}>Add</button></div>
              </section>
            </>
          )}

          {tab === "project" && inspection && (
            <>
              <div className="panel-heading"><div><h2>{inspection.project.name}</h2><p>{inspection.project.cwd}</p></div></div>
              <section className="control-section project-defaults">
                <h3>Defaults for new threads</h3>
                <AgentPicker value={inspection.project.defaults.agent ?? thread.agent} onChange={(agent) => void run("project", async () => {
                  const permission = agent.agent === "codex" && inspection.project.defaults.permission === "ask" ? "workspace-write" : inspection.project.defaults.permission;
                  const project = await stereo.updateProject(inspection.project.id, { name: inspection.project.name, defaults: { ...inspection.project.defaults, agent, permission } });
                  setInspection({ ...inspection, project });
                })} agents={agents} />
                <label>Access <select value={inspection.project.defaults.permission ?? ""} onChange={(event) => void run("project", async () => { const permission = (event.target.value || null) as PermissionMode | null; const project = await stereo.updateProject(inspection.project.id, { name: inspection.project.name, defaults: { ...inspection.project.defaults, permission } }); setInspection({ ...inspection, project }); })}><option value="">Use app default</option><option value="workspace-write">Workspace write</option>{(inspection.project.defaults.agent ?? thread.agent).agent === "claude" && <option value="ask">Ask before writes</option>}<option value="read-only">Read only</option></select></label>
              </section>
              <section className="control-section"><h3>Configuration sources</h3><p className="section-note">Read-only view of files the native harnesses load. Scope and provenance stay visible.</p>
                <div className="source-list">{inspection.sources.map((source) => <button key={source.id} disabled={!source.exists} onClick={() => void stereo.openProjectSource(inspection.project.id, source.id)}><span className={`source-dot ${source.harness}`} /><span><strong>{source.label}</strong><small>{source.path}</small></span><span className="source-meta">{source.scope}<small>{source.summary}</small></span></button>)}</div>
              </section>
              {inspection.warnings.map((warning) => <div className="config-warning" key={warning}>! {warning}</div>)}
            </>
          )}

          {tab === "extensions" && inspection && (
            <>
              <div className="panel-heading"><div><h2>Extensions</h2><p>MCP servers, hooks, skills, instructions, and plugins discovered for this project.</p></div></div>
              <div className="extension-grid">{inspection.extensions.length ? inspection.extensions.map((extension) => <section className="extension-card" key={extension.id}><div><span className={`source-dot ${extension.harness}`} /><strong>{extension.name}</strong><span className="extension-kind">{extension.kind}</span></div><p>{extension.detail}</p><small>{extension.source}</small></section>) : <div className="panel-empty">No configured extensions were discovered.</div>}</div>
              <div className="config-warning neutral">Stereo currently reflects native configuration here; it never silently rewrites harness files.</div>
            </>
          )}

          {tab === "diagnostics" && (
            <>
              <div className="panel-heading"><div><h2>Diagnostics</h2><p>What Stereo knows about this native session and its recovery path.</p></div></div>
              <dl className="diagnostic-list"><div><dt>Harness</dt><dd>{AGENT_NAME[thread.agent.agent]}</dd></div><div><dt>Native session</dt><dd>{session?.nativeSession ? "Available" : "Not established"}</dd></div><div><dt>Streaming</dt><dd>{session?.capabilities.streaming ?? "—"}</dd></div><div><dt>Interactive approvals</dt><dd>{session?.capabilities.interactivePermissions ? "Supported" : "Unavailable in this surface"}</dd></div><div><dt>Working directory</dt><dd>{thread.cwd}</dd></div><div><dt>Stereo transcript</dt><dd>Canonical · append-only</dd></div></dl>
              <section className="control-section"><h3>Native escape hatch</h3><p className="section-note">Resume this exact provider session in its own terminal when you need an unnormalized harness command.</p><button className="btn" disabled={!session?.nativeSession} onClick={() => void run("copy", async () => { await stereo.copyResumeCommand(thread.id); setCopied(true); window.setTimeout(() => setCopied(false), 1800); })}>{copied ? "Copied resume command" : "Copy resume command"}</button></section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
