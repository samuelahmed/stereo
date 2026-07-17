import type { AgentSelection, Attachment, PermissionMode } from "@stereo/core";
import { shortPath } from "../labels";
import { AgentPicker, type AgentCatalog } from "./AgentPicker";
import { Composer } from "./Composer";
import { StereoBrandCharacter } from "./StereoBrandCharacter";

interface Props {
  cwd: string | null;
  recentDirs: string[];
  agent: AgentSelection;
  permission: PermissionMode;
  agents: AgentCatalog;
  onPickDir(): void;
  onUseDir(dir: string): void;
  onAgentChange(agent: AgentSelection): void;
  onPermissionChange(permission: PermissionMode): void;
  onSubmit(text: string, attachments: Attachment[]): boolean | Promise<boolean>;
}

export function NewThread({ cwd, recentDirs, agent, permission, agents, onPickDir, onUseDir, onAgentChange, onPermissionChange, onSubmit }: Props) {
  const unavailable = agents ? !agents[agent.agent].installed : false;
  return (
    <>
      <div className="hero">
        <StereoBrandCharacter motion="none" className="hero-character" />
        <div className="hero-title">Both frontier labs. One window.</div>
        <div className="hero-sub">
          A thread is a terminal session that never dies — it runs Claude Code or Codex in your repo, on your
          subscription. Fork any thread to the other lab. Review before you commit.
        </div>
        <div className="new-thread-config">
          <div className="config-row">
            <span className="config-label">Directory</span>
            <button className="dir-btn" onClick={onPickDir}>
              {cwd ? shortPath(cwd) : "Choose a directory…"}
            </button>
            {recentDirs
              .filter((d) => d !== cwd)
              .slice(0, 3)
              .map((d) => (
                <button key={d} className="dir-chip" onClick={() => onUseDir(d)} title={d}>
                  {shortPath(d)}
                </button>
              ))}
          </div>
          <div className="config-row">
            <span className="config-label">Access</span>
            <select className="config-select" value={permission} onChange={(event) => onPermissionChange(event.target.value as PermissionMode)}>
              <option value="workspace-write">Workspace write</option>
              {agent.agent === "claude" && <option value="ask">Ask before writes</option>}
              <option value="read-only">Read only</option>
            </select>
            <span className="config-help">Can be changed later per thread</span>
          </div>
          <div className="config-row">
            <span className="config-label">Agent</span>
            <AgentPicker value={agent} onChange={(next) => {
              onAgentChange(next);
              if (next.agent === "codex" && permission === "ask") onPermissionChange("workspace-write");
            }} agents={agents} />
          </div>
        </div>
      </div>
      <Composer
        draftKey="new-thread"
        placeholder={unavailable ? "Install the selected agent to start" : cwd ? "Describe the task — the agent works right in your checkout" : "Choose a directory first, then describe the task"}
        running={false}
        disabled={unavailable}
        hint={unavailable ? "This agent was not found on your system" : undefined}
        onSubmit={onSubmit}
      />
    </>
  );
}
