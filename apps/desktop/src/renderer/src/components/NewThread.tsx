import type { AgentSelection, Attachment } from "@stereo/core";
import { shortPath } from "../labels";
import { AgentPicker, type AgentCatalog } from "./AgentPicker";
import { Composer } from "./Composer";

interface Props {
  cwd: string | null;
  recentDirs: string[];
  agent: AgentSelection;
  agents: AgentCatalog;
  onPickDir(): void;
  onUseDir(dir: string): void;
  onAgentChange(agent: AgentSelection): void;
  onSubmit(text: string, attachments: Attachment[]): boolean | Promise<boolean>;
}

export function NewThread({ cwd, recentDirs, agent, agents, onPickDir, onUseDir, onAgentChange, onSubmit }: Props) {
  const unavailable = agents ? !agents[agent.agent].installed : false;
  return (
    <>
      <div className="hero">
        <div className="hero-mark">◐</div>
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
            <span className="config-label">Agent</span>
            <AgentPicker value={agent} onChange={onAgentChange} agents={agents} />
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
