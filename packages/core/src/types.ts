export type AgentId = "claude" | "codex";

/** One explicitly configured agent seat. Stereo never delegates this choice to CLI defaults. */
export interface AgentSelection {
  agent: AgentId;
  model: string;
  effort: string;
}

export interface AgentModelInfo {
  id: string;
  label: string;
  description: string;
  efforts: string[];
  defaultEffort: string;
}

export type PermissionMode = "read-only" | "ask" | "workspace-write";
export type EditorPreference = "auto" | "vscode" | "cursor" | "zed" | "system";
export type ReadySound = "off" | "standard" | "prominent";

export interface Settings {
  defaultAgent: AgentSelection;
  defaultPermission: PermissionMode;
  editor: EditorPreference;
  notifyOnComplete: boolean;
  readySound: ReadySound;
}

/** A repository-scoped workspace shared by any number of threads. */
export interface Project {
  id: string;
  name: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  defaults: {
    agent: AgentSelection | null;
    permission: PermissionMode | null;
  };
}

export type ConfigScope = "user" | "project" | "local";

export interface ConfigSource {
  id: string;
  harness: AgentId | "shared";
  scope: ConfigScope;
  label: string;
  path: string;
  exists: boolean;
  summary: string;
}

export interface ProjectInspection {
  project: Project;
  sources: ConfigSource[];
  warnings: string[];
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

/** A file produced by an assistant and copied into Stereo-managed storage. */
export interface AssistantArtifact {
  id: string;
  kind: "image";
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
  projectId: string;
  kind: ThreadKind;
  agent: AgentSelection;
  permission: PermissionMode;
  /** Null or absent follows the app-wide ready-sound setting. */
  readySound?: ReadySound | null;
  status: ThreadStatus;
  createdAt: string;
  updatedAt: string;
  /** Present while the thread is hidden from the active conversation list. */
  archivedAt?: string;
  usage: TokenUsage;
  sessionId?: string;
  forkedFrom?: { threadId: string; title: string };
  /** Compiled handoff context that rides along with the next message, then clears. */
  pendingBriefing?: string;
  lastTurnUsage?: TokenUsage | null;
}

export interface PermissionRequest {
  id: string;
  threadId: string;
  tool: string;
  title: string;
  detail: string;
  input: Record<string, unknown>;
  createdAt: string;
}

export interface ToolEventData {
  /** Provider identifier used to pair a live invocation with its result. */
  callId?: string;
  name: string;
  /** Short human-readable summary used in the collapsed transcript. */
  detail: string;
  /** Complete provider input when it is exposed by the harness. */
  input?: unknown;
  /** Complete provider result when it is exposed by the harness. */
  output?: unknown;
  phase?: "started" | "completed";
}

export type ThreadEvent =
  | { type: "user-message"; text: string; attachments?: Attachment[]; messageId?: string }
  | { type: "briefing"; text: string; trimmedEvents: number; approxTokens: number }
  | { type: "agent-text"; text: string }
  | { type: "assistant-artifact"; artifact: AssistantArtifact }
  | ({ type: "tool" } & ToolEventData)
  | { type: "permission-request"; request: PermissionRequest }
  | { type: "permission-response"; requestId: string; allowed: boolean }
  | { type: "checkpoint"; label: string }
  | { type: "compacted"; approxTokens: number; trimmedEvents: number }
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
  models: AgentModelInfo[];
}
