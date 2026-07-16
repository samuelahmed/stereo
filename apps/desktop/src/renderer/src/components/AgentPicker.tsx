import type { AgentId, AgentSelection, AgentStatusInfo } from "@stereo/core";
import { AGENT_NAME } from "../labels";

export type AgentCatalog = { claude: AgentStatusInfo; codex: AgentStatusInfo } | null;

interface Props {
  value: AgentSelection;
  onChange(next: AgentSelection): void;
  agents: AgentCatalog;
}

/** Harness selection. Model and effort stay on the native CLI's tested default. */
export function AgentPicker({ value, onChange, agents }: Props) {
  return (
    <div className="agent-picker">
      <div className="agent-tabs">
        {(["claude", "codex"] as AgentId[]).map((agent) => (
          <button
            key={agent}
            className={`agent-tab ${agent} ${value.agent === agent ? "active" : ""}`}
            disabled={agents ? !agents[agent].installed : false}
            title={agents && !agents[agent].installed ? `${AGENT_NAME[agent]} is not installed` : undefined}
            onClick={() => onChange({ agent, model: null, effort: null })}
          >
            ● {AGENT_NAME[agent]}
          </button>
        ))}
      </div>
    </div>
  );
}
