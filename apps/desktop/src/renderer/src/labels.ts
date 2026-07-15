import type { AgentId, AgentSelection } from "@stereo/core";
import { CLAUDE_EFFORTS, CLAUDE_MODELS, CODEX_EFFORTS, CODEX_MODELS } from "@stereo/core/catalog";

export const AGENT_NAME: Record<AgentId, string> = { claude: "Claude", codex: "Codex" };

/** Static fallback catalogs, replaced by live agent detection when available. */
export const FALLBACK_MODELS: Record<AgentId, { value: string | null; label: string }[]> = {
  claude: CLAUDE_MODELS,
  codex: CODEX_MODELS,
};

export const FALLBACK_EFFORTS: Record<AgentId, (string | null)[]> = {
  claude: CLAUDE_EFFORTS,
  codex: CODEX_EFFORTS,
};

export function agentSummary(sel: AgentSelection): string {
  const parts = [sel.model, sel.effort].filter(Boolean);
  return parts.length > 0 ? `${AGENT_NAME[sel.agent]} · ${parts.join(" · ")}` : AGENT_NAME[sel.agent];
}

export function otherAgent(agent: AgentId): AgentId {
  return agent === "claude" ? "codex" : "claude";
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

export function shortPath(p: string): string {
  const parts = p.replace(/\/+$/, "").split("/").filter(Boolean);
  return parts.slice(-2).join("/") || p;
}
