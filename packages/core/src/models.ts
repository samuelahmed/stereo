import type { AgentId, AgentModelInfo, AgentSelection } from "./types.js";

const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

export const AGENT_MODELS: Record<AgentId, AgentModelInfo[]> = {
  claude: [
    {
      id: "claude-fable-5",
      label: "Fable 5",
      description: "Best for demanding, long-running agent work",
      efforts: [...EFFORTS],
      defaultEffort: "high",
    },
    {
      id: "claude-opus-4-8",
      label: "Opus 4.8",
      description: "Complex reasoning and agentic coding",
      efforts: [...EFFORTS],
      defaultEffort: "high",
    },
    {
      id: "claude-sonnet-5",
      label: "Sonnet 5",
      description: "Fast, balanced intelligence",
      efforts: [...EFFORTS],
      defaultEffort: "high",
    },
  ],
  codex: [
    {
      id: "gpt-5.6-sol",
      label: "GPT-5.6 Sol",
      description: "Best for complex reasoning and coding",
      efforts: [...EFFORTS],
      defaultEffort: "high",
    },
    {
      id: "gpt-5.6-terra",
      label: "GPT-5.6 Terra",
      description: "Balanced intelligence and speed",
      efforts: [...EFFORTS],
      defaultEffort: "high",
    },
    {
      id: "gpt-5.6-luna",
      label: "GPT-5.6 Luna",
      description: "Fast for focused, routine work",
      efforts: [...EFFORTS],
      defaultEffort: "high",
    },
  ],
};

export const DEFAULT_AGENT_SELECTIONS: Record<AgentId, AgentSelection> = {
  claude: { agent: "claude", model: "claude-fable-5", effort: "high" },
  codex: { agent: "codex", model: "gpt-5.6-sol", effort: "high" },
};

export function defaultAgentSelection(agent: AgentId): AgentSelection {
  return { ...DEFAULT_AGENT_SELECTIONS[agent] };
}

/** Normalize persisted pre-catalog selections without making app startup fragile. */
export function normalizeAgentSelection(value: Partial<AgentSelection> | null | undefined, fallbackAgent: AgentId = "claude"): AgentSelection {
  const agent: AgentId = value?.agent === "codex" || value?.agent === "claude" ? value.agent : fallbackAgent;
  const known = AGENT_MODELS[agent].find((candidate) => candidate.id === value?.model) ?? AGENT_MODELS[agent][0]!;
  const effort = typeof value?.effort === "string" && known.efforts.includes(value.effort)
    ? value.effort
    : known.defaultEffort;
  return { agent, model: known.id, effort };
}

export function validateAgentSelection(value: AgentSelection): AgentSelection {
  const model = AGENT_MODELS[value.agent].find((candidate) => candidate.id === value.model);
  if (!model) throw new Error(`${value.model} is not an available ${value.agent === "claude" ? "Claude" : "Codex"} model`);
  if (!model.efforts.includes(value.effort)) throw new Error(`${model.label} does not support ${value.effort} effort`);
  return { ...value };
}

export function modelInfo(selection: AgentSelection): AgentModelInfo | null {
  return AGENT_MODELS[selection.agent].find((candidate) => candidate.id === selection.model) ?? null;
}
