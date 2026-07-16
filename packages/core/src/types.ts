export type AgentId = "claude" | "codex";

/** One agent seat. null model/effort = the CLI's own default. */
export interface AgentSelection {
  agent: AgentId;
  model: string | null;
  effort: string | null;
}

export type AuthMode = "subscription" | "api-key";
export type PermissionMode = "read-only" | "workspace-write";
export type EditorPreference = "auto" | "vscode" | "cursor" | "zed" | "system";

export interface Settings {
  authMode: AuthMode;
  defaultAgent: AgentSelection;
  defaultPermission: PermissionMode;
  editor: EditorPreference;
  notifyOnComplete: boolean;
}

export type ThreadKind = "chat" | "review";
export type ThreadStatus = "idle" | "running";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface DiffStats {
  filesChanged: number;
  additions: number;
  deletions: number;
}

/** A local file reference attached to a user message. The agent reads it from disk. */
export interface Attachment {
  path: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface QueuedMessage {
  id: string;
  text: string;
  attachments: Attachment[];
  createdAt: string;
}

/**
 * A thread is a terminal session that never dies: one agent, one working
 * directory, a permanent transcript. The vendor session id is only an
 * accelerator for native resume — the transcript is the canonical record.
 */
export interface Thread {
  id: string;
  title: string;
  cwd: string;
  kind: ThreadKind;
  agent: AgentSelection;
  permission: PermissionMode;
  status: ThreadStatus;
  createdAt: string;
  updatedAt: string;
  usage: TokenUsage;
  sessionId?: string;
  forkedFrom?: { threadId: string; title: string };
  /** Compiled handoff context that rides along with the next message, then clears. */
  pendingBriefing?: string;
}

export type ThreadEvent =
  | { type: "user-message"; text: string; attachments?: Attachment[] }
  | { type: "briefing"; text: string; trimmedEvents: number; approxTokens: number }
  | { type: "agent-text"; text: string }
  | { type: "tool"; name: string; detail: string }
  | { type: "turn-end"; usage: TokenUsage | null }
  | { type: "interrupted" }
  | { type: "notice"; text: string }
  | { type: "error"; message: string }
  | { type: "diff"; stats: DiffStats; clean: boolean };

export interface EventEnvelope {
  threadId: string;
  seq: number;
  at: string;
  event: ThreadEvent;
}

export interface AgentStatusInfo {
  agent: AgentId;
  installed: boolean;
  version: string | null;
  auth: string | null;
  /** Selectable models for this agent, freshest first. `null` value = CLI default. */
  models: { value: string | null; label: string }[];
  /** Selectable reasoning-effort levels. `null` = the CLI's own default. */
  efforts: (string | null)[];
}
