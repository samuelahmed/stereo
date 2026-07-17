import { useEffect, useState } from "react";
import type { AgentStatusInfo, PermissionMode, ProjectInspection, Settings, Thread } from "@stereo/core";
import { stereo } from "../bridge";
import { AGENT_NAME, agentSummary } from "../labels";
import { AgentPicker } from "./AgentPicker";

export type ControlTab = "app" | "harnesses" | "project" | "session";

interface Props {
  thread: Thread | null;
  agents: { claude: AgentStatusInfo; codex: AgentStatusInfo } | null;
  settings: Settings;
  initialTab?: ControlTab;
  onSettingsChange(settings: Settings): void;
  onClose(): void;
  onError(message: string): void;
}

export function ControlCenter({ thread, agents, settings, initialTab = "app", onSettingsChange, onClose, onError }: Props) {
  const [tab, setTab] = useState<ControlTab>(initialTab);
  const [inspection, setInspection] = useState<ProjectInspection | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = () => {
    if (!thread) {
      setInspection(null);
      return;
    }
    void stereo.inspectProject(thread.projectId)
      .then(setInspection)
      .catch((error) => onError(error instanceof Error ? error.message : String(error)));
  };

  useEffect(refresh, [thread?.id, thread?.projectId]);
  useEffect(() => {
    if (!thread && (tab === "project" || tab === "session")) setTab("app");
  }, [thread, tab]);
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

  const tabs: ControlTab[] = thread ? ["app", "harnesses", "project", "session"] : ["app", "harnesses"];

  return (
    <div className="modal-backdrop control-backdrop" onPointerDown={onClose}>
      <div className="control-center" role="dialog" aria-modal="true" aria-label="Stereo settings" onPointerDown={(event) => event.stopPropagation()}>
        <div className="control-sidebar">
          <div className="control-title">Settings</div>
          <div className="control-subtitle">Stereo</div>
          {tabs.map((item) => (
            <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
              {item[0]!.toUpperCase() + item.slice(1)}
            </button>
          ))}
          <span className="control-spacer" />
          <button onClick={onClose}>Close</button>
        </div>
        <div className="control-content">
          {tab === "app" && (
            <>
              <div className="panel-heading"><div><h2>App</h2><p>Defaults and preferences for new work in Stereo.</p></div></div>
              <div className="settings-list">
                <section className="settings-row agent-setting">
                  <div><strong>Default agent</strong><span>Used when a project does not define its own default.</span></div>
                  <AgentPicker value={settings.defaultAgent} onChange={(defaultAgent) => onSettingsChange({
                    ...settings,
                    defaultAgent,
                    defaultPermission: defaultAgent.agent === "codex" && settings.defaultPermission === "ask" ? "workspace-write" : settings.defaultPermission,
                  })} agents={agents} />
                </section>
                <label className="settings-row">
                  <div><strong>Default access</strong><span>Permission mode for new threads.</span></div>
                  <select value={settings.defaultPermission} onChange={(event) => onSettingsChange({ ...settings, defaultPermission: event.target.value as Settings["defaultPermission"] })}>
                    <option value="workspace-write">Workspace write</option>
                    {settings.defaultAgent.agent === "claude" && <option value="ask">Ask before writes</option>}
                    <option value="read-only">Read only</option>
                  </select>
                </label>
                <label className="settings-row">
                  <div><strong>Open files in</strong><span>Where Stereo sends paths and working folders.</span></div>
                  <select value={settings.editor} onChange={(event) => onSettingsChange({ ...settings, editor: event.target.value as Settings["editor"] })}>
                    <option value="auto">Auto-detect editor</option>
                    <option value="vscode">Visual Studio Code</option>
                    <option value="cursor">Cursor</option>
                    <option value="zed">Zed</option>
                    <option value="system">System default</option>
                  </select>
                </label>
                <label className="settings-row">
                  <div><strong>Completion notifications</strong><span>Notify when background work finishes.</span></div>
                  <input type="checkbox" checked={settings.notifyOnComplete} onChange={(event) => onSettingsChange({ ...settings, notifyOnComplete: event.target.checked })} />
                </label>
              </div>
            </>
          )}

          {tab === "harnesses" && (
            <>
              <div className="panel-heading"><div><h2>Harnesses</h2><p>Stereo uses the native CLI subscriptions already signed in on this computer.</p></div></div>
              <div className="harness-list">
                {agents ? (["claude", "codex"] as const).map((id) => (
                  <section className="harness-row" key={id}>
                    <div><strong>{AGENT_NAME[id]}</strong><span>{agents[id].version ?? "Version unavailable"}</span></div>
                    <div className={`harness-state ${agents[id].installed ? "ready" : "missing"}`}>
                      <strong>{agents[id].installed ? "Ready" : "Not installed"}</strong>
                      <span>{agents[id].auth ?? (agents[id].installed ? "Native authentication" : "Install the CLI to use this harness")}</span>
                    </div>
                  </section>
                )) : <div className="settings-empty">Checking local harnesses…</div>}
              </div>
            </>
          )}

          {tab === "project" && thread && inspection && (
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
                <div className="source-list">{inspection.sources.map((source) => <button key={source.id} disabled={!source.exists} onClick={() => void stereo.openProjectSource(inspection.project.id, source.id)}><span><strong>{source.label}</strong><small>{source.path}</small></span><span className="source-meta">{source.scope}<small>{source.summary}</small></span></button>)}</div>
              </section>
              {inspection.warnings.map((warning) => <div className="config-warning" key={warning}>{warning}</div>)}
            </>
          )}

          {tab === "session" && thread && (
            <>
              <div className="panel-heading"><div><h2>Session</h2><p>What Stereo knows about this native thread and its recovery path.</p></div></div>
              <dl className="diagnostic-list"><div><dt>Model</dt><dd>{agentSummary(thread.agent)}</dd></div><div><dt>Native session</dt><dd>{thread.sessionId ? "Available" : "Not established"}</dd></div><div><dt>Working directory</dt><dd>{thread.cwd}</dd></div><div><dt>Stereo transcript</dt><dd>Saved locally</dd></div></dl>
              <section className="control-section"><h3>Native escape hatch</h3><p className="section-note">Resume this provider session in its own terminal when you need the native harness directly.</p><button className="btn" disabled={!thread.sessionId} onClick={() => void run(async () => { await stereo.copyResumeCommand(thread.id); setCopied(true); window.setTimeout(() => setCopied(false), 1800); })}>{copied ? "Copied resume command" : "Copy resume command"}</button></section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
