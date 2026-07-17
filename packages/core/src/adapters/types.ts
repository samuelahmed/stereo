import type { AgentId, TokenUsage, ToolEventData } from "../types.js";

export interface TurnCallbacks {
  /** Ephemeral streaming text — rendered live, never persisted. */
  onDelta(text: string): void;
  /** A completed text block — persisted to the transcript. */
  onText(text: string): void;
  /** A tool invocation/result with a concise summary and complete provider data. */
  onTool(tool: ToolEventData): void;
  /** A provider-produced local file that the host should validate and import. */
  onArtifact(filePath: string): void;
  /** Authoritative usage for the turn, reported once from the final result. */
  onUsage(usage: TokenUsage): void;
  /** Ask the host to resolve a provider permission prompt. */
  onPermission(tool: string, input: Record<string, unknown>, detail: string): Promise<boolean>;
}

export interface TurnOptions {
  cwd: string;
  resumeSessionId?: string;
}

export interface TurnResult {
  sessionId?: string;
  interrupted: boolean;
  /** The CLI could not load the resume session and would have started fresh. */
  sessionLost?: boolean;
}

export interface TurnHandle {
  /** Stop the turn at the next safe point. The session survives — resume works. */
  interrupt(): void;
  done: Promise<TurnResult>;
}

export interface AgentAdapter {
  agent: AgentId;
  startTurn(prompt: string, opts: TurnOptions, callbacks: TurnCallbacks): TurnHandle;
}
