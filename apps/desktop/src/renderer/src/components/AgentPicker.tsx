import type { AgentId, AgentSelection, AgentStatusInfo } from "@stereo/core";
import { AGENT_NAME, FALLBACK_EFFORTS, FALLBACK_MODELS } from "../labels";

export type AgentCatalog = { claude: AgentStatusInfo; codex: AgentStatusInfo } | null;

interface Props {
  value: AgentSelection;
  onChange(next: AgentSelection): void;
  agents: AgentCatalog;
}

/** Agent + model + effort selection — the user knows exactly what they're about to run. */
export function AgentPicker({ value, onChange, agents }: Props) {
  const info = agents?.[value.agent] ?? null;
  const models = info?.models ?? FALLBACK_MODELS[value.agent];
  const efforts = info?.efforts ?? FALLBACK_EFFORTS[value.agent];

  return (
    <div className="agent-picker">
      <div className="agent-tabs">
        {(["claude", "codex"] as AgentId[]).map((agent) => (
          <button
            key={agent}
            className={`agent-tab ${agent} ${value.agent === agent ? "active" : ""}`}
            onClick={() => onChange({ agent, model: null, effort: null })}
          >
            ● {AGENT_NAME[agent]}
          </button>
        ))}
      </div>
      <select value={value.model ?? ""} onChange={(e) => onChange({ ...value, model: e.target.value || null })}>
        {models.map((m) => (
          <option key={m.value ?? "default"} value={m.value ?? ""}>
            {m.label}
          </option>
        ))}
      </select>
      <select value={value.effort ?? ""} onChange={(e) => onChange({ ...value, effort: e.target.value || null })}>
        {efforts.map((e) => (
          <option key={e ?? "default"} value={e ?? ""}>
            {e ?? "default effort"}
          </option>
        ))}
      </select>
    </div>
  );
}
