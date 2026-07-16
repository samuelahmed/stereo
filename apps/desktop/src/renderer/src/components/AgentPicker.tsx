import type { AgentId, AgentSelection, AgentStatusInfo } from "@stereo/core";
import { AGENT_MODELS, defaultAgentSelection } from "@stereo/core/models";
import { AGENT_NAME, effortLabel } from "../labels";

export type AgentCatalog = { claude: AgentStatusInfo; codex: AgentStatusInfo } | null;

interface Props {
  value: AgentSelection;
  onChange(next: AgentSelection): void;
  agents: AgentCatalog;
  allowAgentChange?: boolean;
  disabled?: boolean;
}

/** One shared, explicit harness/model/effort selection control. */
export function AgentPicker({ value, onChange, agents, allowAgentChange = true, disabled = false }: Props) {
  const models = agents?.[value.agent].models ?? AGENT_MODELS[value.agent];
  const selectedModel = models.find((model) => model.id === value.model);
  const efforts = selectedModel?.efforts ?? [value.effort];
  const unavailable = agents ? !agents[value.agent].installed : false;
  const fieldsDisabled = disabled || unavailable;

  return (
    <div className="agent-picker">
      {allowAgentChange && <div className="agent-tabs">
        {(["claude", "codex"] as AgentId[]).map((agent) => (
          <button
            type="button"
            key={agent}
            className={`agent-tab ${agent} ${value.agent === agent ? "active" : ""}`}
            disabled={disabled || (agents ? !agents[agent].installed : false)}
            title={agents && !agents[agent].installed ? `${AGENT_NAME[agent]} is not installed` : undefined}
            onClick={() => onChange(defaultAgentSelection(agent))}
          >
            ● {AGENT_NAME[agent]}
          </button>
        ))}
      </div>}
      <div className="agent-fields">
        <label className="agent-field">
          <span>Model</span>
          <select
            aria-label={`${AGENT_NAME[value.agent]} model`}
            disabled={fieldsDisabled}
            value={value.model}
            onChange={(event) => {
              const model = models.find((candidate) => candidate.id === event.target.value);
              if (model) onChange({ ...value, model: model.id, effort: model.defaultEffort });
            }}
          >
            {!selectedModel && <option value={value.model}>{value.model} (saved)</option>}
            {models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
          </select>
        </label>
        <label className="agent-field">
          <span>Thinking</span>
          <select
            aria-label="Thinking effort"
            disabled={fieldsDisabled}
            value={value.effort}
            onChange={(event) => onChange({ ...value, effort: event.target.value })}
          >
            {efforts.map((effort) => <option key={effort} value={effort}>{effortLabel(effort)}</option>)}
          </select>
        </label>
      </div>
      {selectedModel && <span className="agent-model-note">{selectedModel.description}</span>}
    </div>
  );
}
