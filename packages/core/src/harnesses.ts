import type { AgentId, HarnessDescriptor } from "./types.js";

/**
 * Product-facing harness registry. Provider adapters stay private; all shared
 * code asks this registry what a harness can do instead of branching on names.
 */
export const HARNESSES: Record<AgentId, HarnessDescriptor> = {
  claude: {
    id: "claude",
    name: "Claude Code",
    shortName: "Claude",
    capabilities: {
      streaming: "token",
      nativeResume: true,
      interactivePermissions: true,
      contextWindow: 200_000,
      configuration: true,
      mcp: true,
      hooks: true,
      skills: true,
      nativeCompact: false,
    },
  },
  codex: {
    id: "codex",
    name: "Codex",
    shortName: "Codex",
    capabilities: {
      streaming: "item",
      nativeResume: true,
      interactivePermissions: false,
      contextWindow: 258_000,
      configuration: true,
      mcp: true,
      hooks: true,
      skills: true,
      nativeCompact: false,
    },
  },
};

export const harnessFor = (id: AgentId): HarnessDescriptor => HARNESSES[id];
export const harnessList = (): HarnessDescriptor[] => Object.values(HARNESSES);
