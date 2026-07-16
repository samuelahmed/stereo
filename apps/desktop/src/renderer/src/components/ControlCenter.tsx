import { useEffect, useState } from "react";
import type { AgentStatusInfo, PermissionMode, ProjectInspection, Thread } from "@stereo/core";
import { stereo } from "../bridge";
import { AGENT_NAME } from "../labels";
import { AgentPicker } from "./AgentPicker";

type Tab = "project" | "diagnostics";

interface Props {
  thread: Thread;
  agents: { claude: AgentStatusInfo; codex: AgentStatusInfo } | null;
  initialTab?: Tab;
  onClose(): void;
  onError(message: string): void;
}

export function ControlCenter({ thread, agents, initialTab = "project", onClose, onError }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [inspection, setInspection] = useState<ProjectInspection | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = () => {
    void stereo.inspectProject(thread.projectId)
      .then(setInspection)
      .catch((error) => onError(error instanceof Error ? error.message : String(error)));
  };

  useEffect(refresh, [thread.id, thread.projectId]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
      refresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="modal-backdrop control-backdrop" onPointerDown={onClose}>
      <div className="control-center" role="dialog" aria-modal="true" aria-label="Session and project controls" onPointerDown={(event) => event.stopPropagation()}>
        <div className="control-sidebar">
          <div className="control-title">Control center</div>
          <div className="control-subtitle">{AGENT_NAME[thread.agent.agent]} · {inspection?.project.name ?? "Project"}</div>
          {(["project", "diagnostics"] as Tab[]).map((item) => (
            <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
              <span>{item === "project" ? "⌂" : "↗"}</span>
              {item[0]!.toUpperCase() + item.slice(1)}
            </button>
          ))}
          <span className="control-spacer" />
          <button onClick={onClose}><span>×</span> Close</button>
        </div>
        <div className="control-content">
          {tab === "project" && inspection && (
            <>
              <div className="panel-heading"><div><h2>{inspection.project.name}</h2><p>{inspection.project.cwd}</p></div></div>
              <section className="control-section project-defaults">
                <h3>Defaults for new threads</h3>
                <AgentPicker value={inspection.project.defaults.agent ?? thread.agent} onChange={(agent) => void run(async () => {
                  const permission = agent.agent === "codex" && inspection.project.defaults.permission === "ask" ? "workspace-write" : inspection.project.defaults.permission;
                  const project = await stereo.updateProject(inspection.project.id, { name: inspection.project.name, defaults: { ...inspection.project.defaults, agent, permission } });
                  setInspection({ ...inspection, project });
                })} agents={agents} />
                <label>Access <select value={inspection.project.defaults.permission ?? ""} onChange={(event) => void run(async () => { const permission = (event.target.value || null) as PermissionMode | null; const project = await stereo.updateProject(inspection.project.id, { name: inspection.project.name, defaults: { ...inspection.project.defaults, permission } }); setInspection({ ...inspection, project }); })}><option value="">Use app default</option><option value="workspace-write">Workspace write</option>{(inspection.project.defaults.agent ?? thread.agent).agent === "claude" && <option value="ask">Ask before writes</option>}<option value="read-only">Read only</option></select></label>
              </section>
              <section className="control-section"><h3>Configuration files</h3><p className="section-note">Known harness files for this working folder. Stereo does not modify them.</p>
                <div className="source-list">{inspection.sources.map((source) => <button key={source.id} disabled={!source.exists} onClick={() => void stereo.openProjectSource(inspection.project.id, source.id)}><span className={`source-dot ${source.harness}`} /><span><strong>{source.label}</strong><small>{source.path}</small></span><span className="source-meta">{source.scope}<small>{source.summary}</small></span></button>)}</div>
              </section>
              {inspection.warnings.map((warning) => <div className="config-warning" key={warning}>! {warning}</div>)}
            </>
          )}

          {tab === "diagnostics" && (
            <>
              <div className="panel-heading"><div><h2>Diagnostics</h2><p>What Stereo knows about this native session and its recovery path.</p></div></div>
              <dl className="diagnostic-list"><div><dt>Harness</dt><dd>{AGENT_NAME[thread.agent.agent]}</dd></div><div><dt>Native session</dt><dd>{thread.sessionId ? "Available" : "Not established"}</dd></div><div><dt>Working directory</dt><dd>{thread.cwd}</dd></div><div><dt>Stereo transcript</dt><dd>Saved locally</dd></div></dl>
              <section className="control-section"><h3>Native escape hatch</h3><p className="section-note">Resume this provider session in its own terminal when you need the native harness directly.</p><button className="btn" disabled={!thread.sessionId} onClick={() => void run(async () => { await stereo.copyResumeCommand(thread.id); setCopied(true); window.setTimeout(() => setCopied(false), 1800); })}>{copied ? "Copied resume command" : "Copy resume command"}</button></section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
