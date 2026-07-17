import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  AgentSelection,
  AssistantArtifact,
  Attachment,
  EventEnvelope,
  PermissionRequest,
  Project,
  ProjectInspection,
  QueuedMessage,
  Settings,
  Thread,
  ThreadEvent,
  TokenUsage,
} from "./types.js";
import type { AgentAdapter, TurnHandle } from "./adapters/types.js";
import { claudeAdapter } from "./adapters/claude.js";
import { codexAdapter } from "./adapters/codex.js";
import { applySubscriptionAuthToProcess } from "./adapters/env.js";
import { buildForkBriefing, buildResumeBriefing, buildReviewBriefing } from "./briefing.js";
import { diffStats, diffText } from "./git.js";
import { inspectProject, makeProject, projectId } from "./projects.js";
import { normalizeAgentSelection, validateAgentSelection } from "./models.js";
import { ThreadStore } from "./store.js";

const MAX_REVIEW_DIFF_CHARS = 200_000;
const MAX_ARTIFACT_BYTES = 15 * 1024 * 1024;
const ARTIFACT_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function hasImageSignature(filePath: string, mimeType: string): boolean {
  const header = Buffer.alloc(12);
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(filePath, "r");
    const length = fs.readSync(descriptor, header, 0, header.length, 0);
    if (mimeType === "image/png") return length >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (mimeType === "image/jpeg") return length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    if (mimeType === "image/gif") return length >= 6 && ["GIF87a", "GIF89a"].includes(header.subarray(0, 6).toString("ascii"));
    if (mimeType === "image/webp") return length >= 12 && header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WEBP";
    return false;
  } catch {
    return false;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

type AdapterFactory = (thread: Thread) => AgentAdapter;
const ADAPTERS: Record<Thread["agent"]["agent"], AdapterFactory> = {
  claude: (thread) => claudeAdapter(thread.agent, thread.permission),
  codex: (thread) => codexAdapter(thread.agent, thread.permission),
};

export interface CreateThreadInput {
  cwd: string;
  agent: AgentSelection;
  permission?: Thread["permission"];
  projectId?: string;
}

function promptWithAttachments(text: string, attachments: Attachment[]): string {
  if (attachments.length === 0) return text;
  const paths = attachments.map((attachment) => {
    const safePath = attachment.path.replace(/[\r\n]/g, "");
    const kind = attachment.mimeType || "unknown type";
    return `- ${safePath} (${kind})`;
  });
  return [
    text,
    "--- ATTACHED LOCAL FILES ---",
    ...paths,
    "These files were explicitly attached by the user. Inspect them with your available file/image tools as relevant to the request.",
  ].join("\n\n");
}

/**
 * The Stereo engine. A thread is a permanent terminal session: one agent, one
 * cwd, an append-only transcript. Turns run in the user's working tree — no
 * worktrees, no branches, no commits; git and the user's editor own review.
 *
 * Emits:
 *  - "event"   (EventEnvelope)          persisted transcript events
 *  - "delta"   ({threadId, text})       ephemeral streaming text
 *  - "threads" (Thread[])               metadata changes (status, title, usage)
 *  - "queue"   ({threadId, queue})      pending queued messages changed
 */
export class Engine extends EventEmitter {
  private threads = new Map<string, Thread>();
  private seq = new Map<string, number>();
  private store: ThreadStore;
  private turns = new Map<string, TurnHandle>();
  private queues = new Map<string, QueuedMessage[]>();
  private projects = new Map<string, Project>();
  private permissionResolvers = new Map<string, { threadId: string; resolve: (allowed: boolean) => void }>();
  private artifactsDir: string;

  constructor(
    private settings: Settings,
    dataDir: string,
  ) {
    super();
    applySubscriptionAuthToProcess();
    this.store = new ThreadStore(dataDir);
    this.artifactsDir = path.join(dataDir, "artifacts");
    fs.mkdirSync(this.artifactsDir, { recursive: true });

    for (const project of this.store.loadProjects()) this.projects.set(project.id, project);
    const savedQueues = this.store.loadQueues();
    for (const [threadId, queue] of Object.entries(savedQueues)) this.queues.set(threadId, queue);

    const crashed: string[] = [];
    let migrated = false;
    for (const thread of this.store.loadThreads()) {
      const normalizedAgent = normalizeAgentSelection(thread.agent);
      if (thread.agent.model !== normalizedAgent.model || thread.agent.effort !== normalizedAgent.effort) {
        thread.agent = normalizedAgent;
        migrated = true;
      }
      if (!thread.permission) {
        thread.permission = this.settings.defaultPermission;
        migrated = true;
      }
      // Legacy threads predate per-harness permission validation. A global
      // Claude "ask" default must never migrate an existing Codex thread into
      // a mode that codex exec cannot represent.
      if (thread.agent.agent === "codex" && thread.permission === "ask") {
        thread.permission = "workspace-write";
        migrated = true;
      }
      if (!thread.projectId) {
        thread.projectId = projectId(thread.cwd);
        migrated = true;
      }
      if (thread.lastTurnUsage === undefined) {
        thread.lastTurnUsage = null;
        migrated = true;
      }
      if (!this.projects.has(thread.projectId)) this.projects.set(thread.projectId, makeProject(thread.cwd));
      this.threads.set(thread.id, thread);
      this.seq.set(thread.id, this.store.lastSeq(thread.id));
      if (thread.status === "running") {
        // The app quit mid-turn. Both CLIs persist their sessions on disk, so
        // the thread is still resumable — mark the interruption and move on.
        thread.status = "idle";
        crashed.push(thread.id);
      }
    }
    for (const project of this.projects.values()) {
      if (!project.defaults.agent) continue;
      const normalizedAgent = normalizeAgentSelection(project.defaults.agent);
      if (project.defaults.agent.model !== normalizedAgent.model || project.defaults.agent.effort !== normalizedAgent.effort) {
        project.defaults.agent = normalizedAgent;
        migrated = true;
      }
    }
    for (const [threadId, queue] of this.queues) {
      if (!this.threads.has(threadId)) {
        this.queues.delete(threadId);
        continue;
      }
      const delivered = new Set(this.eventsFor(threadId).flatMap((event) => event.event.type === "user-message" && event.event.messageId ? [event.event.messageId] : []));
      this.queues.set(threadId, queue.filter((message) => !delivered.has(message.id)));
    }
    for (const id of crashed) this.emitEvent(id, { type: "interrupted" });
    if (crashed.length > 0 || migrated) this.store.saveThreads(this.list());
    this.persistProjects();
    this.persistQueues();
  }

  updateSettings(settings: Settings): void {
    this.settings = settings;
  }

  listThreads(): Thread[] {
    return this.list().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  eventsFor(threadId: string): EventEnvelope[] {
    return this.store.loadEvents(threadId);
  }

  listProjects(): Project[] {
    return [...this.projects.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  projectFor(projectIdValue: string): Project | null {
    return this.projects.get(projectIdValue) ?? null;
  }

  inspectProject(projectIdValue: string): ProjectInspection {
    const project = this.projects.get(projectIdValue);
    if (!project) throw new Error("Unknown project");
    return inspectProject(project);
  }

  updateProject(projectIdValue: string, update: Pick<Project, "name" | "defaults">): Project {
    const project = this.projects.get(projectIdValue);
    if (!project) throw new Error("Unknown project");
    const name = update.name.trim();
    if (!name) throw new Error("Project name cannot be empty");
    if (update.defaults.permission === "ask" && update.defaults.agent?.agent === "codex") {
      throw new Error("Codex exec does not expose interactive approvals");
    }
    project.name = name.slice(0, 80);
    project.defaults = {
      agent: update.defaults.agent ? validateAgentSelection(update.defaults.agent) : null,
      permission: update.defaults.permission,
    };
    project.updatedAt = new Date().toISOString();
    this.persistProjects();
    return project;
  }

  createThread(input: CreateThreadInput): Thread {
    const now = new Date().toISOString();
    const id = input.projectId ?? projectId(input.cwd);
    let project = this.projects.get(id);
    if (!project) {
      project = makeProject(input.cwd);
      this.projects.set(project.id, project);
      this.persistProjects();
    }
    const agent = validateAgentSelection(input.agent);
    const permission = input.permission ?? project.defaults.permission ?? this.settings.defaultPermission;
    if (permission === "ask" && agent.agent === "codex") throw new Error("Codex exec does not expose interactive approvals");
    const thread: Thread = {
      id: crypto.randomUUID(),
      title: "New thread",
      cwd: input.cwd,
      projectId: project.id,
      kind: "chat",
      agent,
      permission,
      status: "idle",
      createdAt: now,
      updatedAt: now,
      usage: { inputTokens: 0, outputTokens: 0 },
      lastTurnUsage: null,
    };
    this.threads.set(thread.id, thread);
    this.persist();
    return thread;
  }

  renameThread(threadId: string, title: string): Thread {
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error(`Unknown thread ${threadId}`);
    const trimmed = title.trim();
    if (!trimmed) throw new Error("Thread title cannot be empty");
    thread.title = trimmed.slice(0, 120);
    thread.updatedAt = new Date().toISOString();
    this.persist();
    return thread;
  }

  setThreadPermission(threadId: string, permission: Thread["permission"]): Thread {
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error(`Unknown thread ${threadId}`);
    if (permission === "ask" && thread.agent.agent === "codex") throw new Error("Codex exec does not expose interactive approvals");
    thread.permission = permission;
    thread.updatedAt = new Date().toISOString();
    this.persist();
    return thread;
  }

  setThreadAgent(threadId: string, agent: AgentSelection): Thread {
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error(`Unknown thread ${threadId}`);
    if (thread.archivedAt) throw new Error("Restore this thread before changing its model");
    if (agent.agent !== thread.agent.agent) throw new Error("Fork the thread to switch between Claude and Codex");
    if (thread.status === "running" || this.turns.has(threadId)) throw new Error("Wait for the running turn to finish before changing models");
    if ((this.queues.get(threadId)?.length ?? 0) > 0) throw new Error("Finish or remove queued messages before changing models");
    thread.agent = validateAgentSelection(agent);
    thread.updatedAt = new Date().toISOString();
    this.persist();
    return thread;
  }

  setThreadArchived(threadId: string, archived: boolean): Thread {
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error(`Unknown thread ${threadId}`);
    if (archived && (thread.status === "running" || this.turns.has(threadId) || (this.queues.get(threadId)?.length ?? 0) > 0)) {
      throw new Error("Finish or remove pending work before archiving this thread");
    }
    if (archived) thread.archivedAt = new Date().toISOString();
    else delete thread.archivedAt;
    thread.updatedAt = new Date().toISOString();
    this.persist();
    return thread;
  }

  deleteThread(threadId: string): void {
    const thread = this.threads.get(threadId);
    if (!thread) return;
    if (thread.status === "running" || this.turns.has(threadId)) {
      throw new Error("Stop the running thread before deleting it");
    }
    this.threads.delete(threadId);
    this.seq.delete(threadId);
    this.queues.delete(threadId);
    this.persistQueues();
    this.store.deleteEvents(threadId);
    fs.rmSync(path.join(this.artifactsDir, threadId), { recursive: true, force: true });
    this.persist();
  }

  /**
   * Send a message. Messages queue like they do in the CLIs: if a turn is
   * running, the message waits and runs next.
   */
  sendMessage(threadId: string, text: string, attachments: Attachment[] = []): QueuedMessage {
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error(`Unknown thread ${threadId}`);
    if (thread.archivedAt) throw new Error("Restore this thread before sending another message");
    const queue = this.queues.get(threadId) ?? [];
    const message: QueuedMessage = { id: crypto.randomUUID(), text, attachments, createdAt: new Date().toISOString() };
    queue.push(message);
    this.queues.set(threadId, queue);
    this.emitQueue(threadId);
    this.persistQueues();
    void this.pump(threadId);
    return message;
  }

  queuedFor(threadId: string): QueuedMessage[] {
    return [...(this.queues.get(threadId) ?? [])];
  }

  removeQueued(threadId: string, messageId: string): void {
    const queue = this.queues.get(threadId) ?? [];
    this.queues.set(threadId, queue.filter((message) => message.id !== messageId));
    this.persistQueues();
    this.emitQueue(threadId);
  }

  moveQueued(threadId: string, messageId: string, direction: -1 | 1): void {
    const queue = this.queues.get(threadId) ?? [];
    const from = queue.findIndex((message) => message.id === messageId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= queue.length) return;
    [queue[from], queue[to]] = [queue[to]!, queue[from]!];
    this.persistQueues();
    this.emitQueue(threadId);
  }

  interrupt(threadId: string): void {
    for (const [requestId, pending] of this.permissionResolvers) {
      if (pending.threadId === threadId) {
        this.permissionResolvers.delete(requestId);
        pending.resolve(false);
      }
    }
    this.turns.get(threadId)?.interrupt();
  }

  resumeQueued(): void {
    for (const threadId of this.queues.keys()) void this.pump(threadId);
  }

  resolvePermission(requestId: string, allowed: boolean): void {
    const pending = this.permissionResolvers.get(requestId);
    if (!pending) throw new Error("This permission request is no longer active");
    this.permissionResolvers.delete(requestId);
    pending.resolve(allowed);
  }

  nativeResumeCommand(threadId: string): string | null {
    const thread = this.threads.get(threadId);
    if (!thread?.sessionId) return null;
    const cwd = `'${thread.cwd.replaceAll("'", "'\\''")}'`;
    const sid = `'${thread.sessionId.replaceAll("'", "'\\''")}'`;
    const model = `'${thread.agent.model.replaceAll("'", "'\\''")}'`;
    const effort = `'${thread.agent.effort.replaceAll("'", "'\\''")}'`;
    return thread.agent.agent === "claude"
      ? `cd ${cwd} && claude --resume ${sid} --model ${model} --effort ${effort}`
      : `cd ${cwd} && codex resume ${sid} --model ${model} --config model_reasoning_effort=${effort}`;
  }

  /** Duplicate a thread to any model. The briefing rides along with the user's next message. */
  forkThread(threadId: string, agent: AgentSelection): Thread {
    const source = this.threads.get(threadId);
    if (!source) throw new Error(`Unknown thread ${threadId}`);
    if (source.status === "running" || this.turns.has(threadId)) throw new Error("Wait for the running turn to finish before forking it");
    const compiled = buildForkBriefing(this.eventsFor(threadId), {
      fromAgent: source.agent.agent,
      cwd: source.cwd,
    });
    const permission = agent.agent === "codex" && source.permission === "ask" ? "workspace-write" : source.permission;
    const thread = this.createThread({ cwd: source.cwd, projectId: source.projectId, agent, permission });
    thread.title = source.title === "New thread" ? "New thread" : `⑂ ${source.title}`;
    thread.forkedFrom = { threadId: source.id, title: source.title };
    thread.pendingBriefing = compiled.text;
    this.emitEvent(thread.id, {
      type: "briefing",
      text: compiled.text,
      trimmedEvents: compiled.trimmedEvents,
      approxTokens: compiled.approxTokens,
    });
    this.persist();
    return thread;
  }

  /** Spin up the other lab on this thread's uncommitted diff. Runs immediately. */
  async reviewThread(threadId: string, agent: AgentSelection): Promise<Thread> {
    const source = this.threads.get(threadId);
    if (!source) throw new Error(`Unknown thread ${threadId}`);
    if (source.status === "running" || this.turns.has(threadId)) throw new Error("Wait for the running turn to finish before reviewing its working tree");
    const diff = await diffText(source.cwd, MAX_REVIEW_DIFF_CHARS);
    const compiled = buildReviewBriefing(this.eventsFor(threadId), diff, {
      fromAgent: source.agent.agent,
      cwd: source.cwd,
    });
    const thread = this.createThread({ cwd: source.cwd, projectId: source.projectId, agent, permission: "read-only" });
    thread.kind = "review";
    thread.title = `Review: ${source.title}`;
    thread.forkedFrom = { threadId: source.id, title: source.title };
    this.emitEvent(thread.id, {
      type: "briefing",
      text: compiled.text,
      trimmedEvents: compiled.trimmedEvents,
      approxTokens: compiled.approxTokens,
    });
    this.persist();
    // The briefing IS the first turn's prompt — the review starts right away.
    void this.runTurn(thread, compiled.text).then(() => this.pump(thread.id));
    return thread;
  }

  async stats(threadId: string): Promise<ReturnType<typeof diffStats>> {
    const thread = this.threads.get(threadId);
    if (!thread) return null;
    return diffStats(thread.cwd);
  }

  private list(): Thread[] {
    return [...this.threads.values()];
  }

  private emitEvent(threadId: string, event: ThreadEvent): void {
    const seq = (this.seq.get(threadId) ?? 0) + 1;
    this.seq.set(threadId, seq);
    const envelope: EventEnvelope = { threadId, seq, at: new Date().toISOString(), event };
    this.store.appendEvent(envelope);
    this.emit("event", envelope);
  }

  private importArtifact(threadId: string, sourcePath: string, ordinal: number): AssistantArtifact | null {
    try {
      const source = fs.realpathSync(sourcePath);
      const stat = fs.statSync(source);
      const extension = path.extname(source).toLowerCase();
      const mimeType = ARTIFACT_MIME[extension];
      if (!mimeType || !stat.isFile() || stat.size <= 0 || stat.size > MAX_ARTIFACT_BYTES || !hasImageSignature(source, mimeType)) return null;

      const id = crypto.randomUUID();
      const directory = path.join(this.artifactsDir, threadId);
      fs.mkdirSync(directory, { recursive: true });
      const destination = path.join(directory, `${id}${extension === ".jpeg" ? ".jpg" : extension}`);
      fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
      const copied = fs.statSync(destination);
      return {
        id,
        kind: "image",
        path: destination,
        name: `Generated image ${ordinal}${path.extname(destination)}`,
        mimeType,
        size: copied.size,
      };
    } catch {
      return null;
    }
  }

  private persist(): void {
    this.store.saveThreads(this.list());
    this.emit("threads", this.listThreads());
  }

  private persistProjects(): void {
    this.store.saveProjects(this.listProjects());
  }

  private persistQueues(): void {
    this.store.saveQueues(this.queues);
  }

  private emitQueue(threadId: string): void {
    this.emit("queue", { threadId, queue: this.queuedFor(threadId) });
  }

  private async pump(threadId: string): Promise<void> {
    const thread = this.threads.get(threadId);
    if (!thread || thread.status === "running") return;
    const next = this.queues.get(threadId)?.shift();
    if (next === undefined) return;
    this.emitQueue(threadId);

    if (thread.title === "New thread") {
      thread.title = (next.text.trim() || next.attachments[0]?.name || "New thread").split("\n")[0]!.slice(0, 80);
    }
    this.emitEvent(threadId, { type: "user-message", text: next.text, attachments: next.attachments, messageId: next.id });
    this.persistQueues();

    let prompt = promptWithAttachments(next.text, next.attachments);
    if (thread.pendingBriefing) {
      prompt = `${thread.pendingBriefing}\n\n--- USER MESSAGE ---\n\n${prompt}`;
      thread.pendingBriefing = undefined;
    }
    await this.runTurn(thread, prompt);
    void this.pump(threadId);
  }

  private async runTurn(thread: Thread, prompt: string): Promise<void> {
    thread.status = "running";
    thread.updatedAt = new Date().toISOString();
    this.persist();

    let turnUsage: TokenUsage | null = null;
    let artifactOrdinal = 0;
    const callbacks = {
      onDelta: (text: string) => this.emit("delta", { threadId: thread.id, text }),
      onText: (text: string) => this.emitEvent(thread.id, { type: "agent-text", text }),
      onTool: (name: string, detail: string) => this.emitEvent(thread.id, { type: "tool", name, detail }),
      onArtifact: (filePath: string) => {
        const artifact = this.importArtifact(thread.id, filePath, artifactOrdinal + 1);
        if (!artifact) return;
        artifactOrdinal += 1;
        this.emitEvent(thread.id, { type: "assistant-artifact", artifact });
      },
      onUsage: (usage: TokenUsage) => {
        turnUsage = usage;
        thread.lastTurnUsage = usage;
        thread.usage.inputTokens += usage.inputTokens;
        thread.usage.outputTokens += usage.outputTokens;
      },
      onPermission: (tool: string, input: Record<string, unknown>, detail: string) => {
        const id = crypto.randomUUID();
        const request: PermissionRequest = {
          id,
          threadId: thread.id,
          tool,
          title: `${thread.agent.agent === "claude" ? "Claude" : "Codex"} wants to use ${tool}`,
          detail,
          input: {},
          createdAt: new Date().toISOString(),
        };
        this.emitEvent(thread.id, { type: "permission-request", request });
        return new Promise<boolean>((resolve) => {
          this.permissionResolvers.set(id, { threadId: thread.id, resolve: (allowed) => {
            this.emitEvent(thread.id, { type: "permission-response", requestId: id, allowed });
            resolve(allowed);
          }});
        });
      },
    };
    try {
      // Adapter construction can validate provider-specific configuration and
      // may throw. Keep it inside the lifecycle guard so no failure can strand
      // a thread in the running state.
      const adapter = ADAPTERS[thread.agent.agent](thread);
      let attemptPrompt = prompt;
      let resume = thread.sessionId;
      for (let attempt = 0; ; attempt++) {
        const handle = adapter.startTurn(attemptPrompt, { cwd: thread.cwd, resumeSessionId: resume }, callbacks);
        this.turns.set(thread.id, handle);
        const result = await handle.done;
        if (result.sessionLost && attempt === 0) {
          // The CLI couldn't load its native session (it silently starts a
          // fresh one instead). The transcript is the canonical record —
          // rebuild the context from it and retry once without native resume.
          this.emitEvent(thread.id, {
            type: "notice",
            text: "The CLI's native session couldn't be resumed — Stereo rebuilt the context from this thread's transcript and retried.",
          });
          const compiled = buildResumeBriefing(this.eventsFor(thread.id), {
            fromAgent: thread.agent.agent,
            cwd: thread.cwd,
          });
          attemptPrompt = compiled.text;
          resume = undefined;
          thread.sessionId = undefined;
          continue;
        }
        if (result.sessionId) thread.sessionId = result.sessionId;
        if (result.interrupted) {
          this.emitEvent(thread.id, { type: "interrupted" });
        } else {
          this.emitEvent(thread.id, { type: "turn-end", usage: turnUsage });
        }
        break;
      }
    } catch (error) {
      this.emitEvent(thread.id, {
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      for (const [requestId, pending] of this.permissionResolvers) {
        if (pending.threadId === thread.id) {
          this.permissionResolvers.delete(requestId);
          pending.resolve(false);
        }
      }
      this.turns.delete(thread.id);
      thread.status = "idle";
      thread.updatedAt = new Date().toISOString();
      const stats = await diffStats(thread.cwd).catch(() => null);
      if (stats) {
        this.emitEvent(thread.id, { type: "diff", stats, clean: stats.filesChanged === 0 });
      }
      this.persist();
    }
  }
}
