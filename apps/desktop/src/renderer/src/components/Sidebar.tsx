import type { AgentStatusInfo, Settings, Thread } from "@stereo/core";
import { AGENT_NAME, shortPath, timeAgo } from "../labels";

interface Props {
  threads: Thread[];
  selectedId: string | null;
  agents: { claude: AgentStatusInfo; codex: AgentStatusInfo } | null;
  settings: Settings | null;
  onSelect(id: string | null): void;
  onAuthModeChange(mode: Settings["authMode"]): void;
}

export function Sidebar({ threads, selectedId, agents, settings, onSelect, onAuthModeChange }: Props) {
  return (
    <div className="sidebar">
      <div className="brand">
        <span className="brand-glyph">◐</span> Stereo
      </div>
      <button className="new-thread" onClick={() => onSelect(null)}>
        + New thread
      </button>
      <div className="thread-list">
        {threads.map((t) => (
          <div
            key={t.id}
            className={`thread-item ${t.id === selectedId ? "selected" : ""}`}
            onClick={() => onSelect(t.id)}
          >
            <div className="title">
              <span className={`status-dot ${t.agent.agent} ${t.status === "running" ? "pulse" : ""}`} />
              {t.title}
            </div>
            <div className="meta">
              {t.kind === "review" && <span className="kind-badge">review</span>}
              <span>{AGENT_NAME[t.agent.agent]}</span>
              <span className="dim">{shortPath(t.cwd)}</span>
              <span className="dim right">{timeAgo(t.updatedAt)}</span>
            </div>
          </div>
        ))}
        {threads.length === 0 && <div className="thread-list-empty">Threads live here — forever.</div>}
      </div>
      <div className="sidebar-footer">
        {agents &&
          (["claude", "codex"] as const).map((id) => {
            const a = agents[id];
            return (
              <div key={id} className="agent-badge">
                <span className={`status-dot ${id}`} style={{ opacity: a.installed ? 1 : 0.25 }} />
                <span>{AGENT_NAME[id]}</span>
                <span className="dim">{a.installed ? (a.auth ?? "") : "not installed"}</span>
              </div>
            );
          })}
        {settings && (
          <div className="auth-toggle">
            <span>Billing</span>
            <select
              value={settings.authMode}
              onChange={(e) => onAuthModeChange(e.target.value as Settings["authMode"])}
            >
              <option value="subscription">Subscription</option>
              <option value="api-key">API key</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
