import type {
  AgentSelection,
  Attachment,
  AgentStatusInfo,
  DiffStats,
  EventEnvelope,
  Project,
  ProjectInspection,
  QueuedMessage,
  ReadySound,
  Settings,
  Thread,
  ThreadEvent,
} from "@stereo/core";
import { AGENT_MODELS, defaultAgentSelection } from "@stereo/core/models";

export interface StereoApi {
  platform: "mac" | "windows" | "linux";
  getSettings(): Promise<Settings>;
  setSettings(settings: Settings): Promise<Settings>;
  testNotifications(): Promise<void>;
  detectAgents(): Promise<{ claude: AgentStatusInfo; codex: AgentStatusInfo }>;
  pickDir(): Promise<string | null>;
  openDir(directory: string): Promise<void>;
  listProjects(): Promise<Project[]>;
  inspectProject(projectId: string): Promise<ProjectInspection>;
  updateProject(projectId: string, update: Pick<Project, "name" | "defaults">): Promise<Project>;
  openProjectSource(projectId: string, sourceId: string): Promise<void>;
  openLink(threadId: string, href: string): Promise<void>;
  pathForFile(file: File): string;
  previewFile(filePath: string): Promise<string | null>;
  createThread(input: { cwd: string; projectId?: string; agent: AgentSelection; permission?: Thread["permission"] }): Promise<Thread>;
  setThreadPermission(threadId: string, permission: Thread["permission"]): Promise<Thread>;
  setThreadReadySound(threadId: string, readySound: ReadySound | null): Promise<Thread>;
  setThreadAgent(threadId: string, agent: AgentSelection): Promise<Thread>;
  renameThread(threadId: string, title: string): Promise<Thread>;
  setThreadArchived(threadId: string, archived: boolean): Promise<Thread>;
  deleteThread(threadId: string): Promise<void>;
  listThreads(): Promise<Thread[]>;
  threadEvents(threadId: string): Promise<EventEnvelope[]>;
  sendMessage(threadId: string, text: string, attachments?: Attachment[]): Promise<void>;
  interrupt(threadId: string): Promise<void>;
  forkThread(threadId: string, agent: AgentSelection): Promise<Thread>;
  reviewThread(threadId: string, agent: AgentSelection): Promise<Thread>;
  promoteReview(threadId: string): Promise<Thread>;
  threadStats(threadId: string): Promise<DiffStats | null>;
  threadQueue(threadId: string): Promise<QueuedMessage[]>;
  removeQueued(threadId: string, messageId: string): Promise<void>;
  moveQueued(threadId: string, messageId: string, direction: -1 | 1): Promise<void>;
  resolvePermission(requestId: string, allowed: boolean): Promise<void>;
  copyResumeCommand(threadId: string): Promise<string>;
  onEvent(handler: (envelope: EventEnvelope) => void): () => void;
  onDelta(handler: (delta: { threadId: string; text: string }) => void): () => void;
  onThreads(handler: (threads: Thread[]) => void): () => void;
  onQueue(handler: (payload: { threadId: string; queue: QueuedMessage[] }) => void): () => void;
  onRevealThread(handler: (threadId: string) => void): () => void;
}

declare global {
  interface Window {
    stereo?: StereoApi;
  }
}

const MOCK_REPLY =
  "I read through the session logic and the flake is a race between the token refresh timer and the test's teardown.\n\n" +
  "Here's what I changed:\n\n" +
  "1. **Stubbed the clock** in `session.spec.ts` so the refresh timer is deterministic.\n" +
  "2. **Awaited the refresh promise** instead of letting it float past the assertion.\n" +
  "3. Made `afterEach` flush pending promises before restoring timers.\n\n" +
  "All 21 tests pass now. The diff is small — worth a quick look at the teardown change in particular.";

const MOCK_REVIEW_REPLY =
  "I found one issue worth fixing: `afterEach` restores fake timers before the pending refresh promise settles. " +
  "That can leak work into the next test and explains the intermittent failure. The production change looks sound.\n\n" +
  "I would update the test teardown to flush pending timers before restoring the real clock. This review is read-only; send a follow-up if you want me to apply that fix.";

/**
 * Outside Electron (plain browser during UI development) window.stereo is
 * absent; this mock simulates a full thread lifecycle — streaming deltas, tool
 * lines, diff markers — so the interface can be exercised end to end without
 * spending anyone's tokens.
 */
function createMock(): StereoApi {
  let settings: Settings = {
    defaultAgent: defaultAgentSelection("claude"),
    defaultPermission: "workspace-write",
    editor: "auto",
    notifyOnComplete: false,
    readySound: "off",
  };
  const threads = new Map<string, Thread>();
  const events = new Map<string, EventEnvelope[]>();
  const seq = new Map<string, number>();
  const eventHandlers = new Set<(e: EventEnvelope) => void>();
  const deltaHandlers = new Set<(d: { threadId: string; text: string }) => void>();
  const threadHandlers = new Set<(t: Thread[]) => void>();
  const mockProject: Project = {
    id: "mock-project",
    name: "acme-app",
    cwd: "/Users/you/acme-app",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    defaults: { agent: null, permission: null },
  };

  const list = () => [...threads.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const pushThreads = () => threadHandlers.forEach((h) => h(list()));
  const emit = (threadId: string, event: ThreadEvent) => {
    const n = (seq.get(threadId) ?? 0) + 1;
    seq.set(threadId, n);
    const envelope: EventEnvelope = { threadId, seq: n, at: new Date().toISOString(), event };
    events.get(threadId)?.push(envelope);
    eventHandlers.forEach((h) => h(envelope));
  };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const makeThread = (cwd: string, agent: AgentSelection, permission = settings.defaultPermission): Thread => {
    const id = `mock-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const now = new Date().toISOString();
    const thread: Thread = {
      id,
      title: "New thread",
      cwd,
      projectId: mockProject.id,
      kind: "chat",
      agent,
      permission,
      status: "idle",
      createdAt: now,
      updatedAt: now,
      usage: { inputTokens: 0, outputTokens: 0 },
      lastTurnUsage: null,
    };
    threads.set(id, thread);
    events.set(id, []);
    return thread;
  };

  const runMockTurn = async (thread: Thread) => {
    // Capture the turn's sandbox. Promoting a review while this turn is still
    // running must only affect the queued follow-up, never the active review.
    const readOnly = thread.permission === "read-only";
    thread.status = "running";
    thread.updatedAt = new Date().toISOString();
    pushThreads();
    await wait(350);
    emit(thread.id, { type: "tool", callId: "mock-read", name: "Read", detail: "src/session.spec.ts", input: { file_path: "src/session.spec.ts", offset: 1, limit: 240 }, phase: "started" });
    await wait(420);
    emit(thread.id, { type: "tool", callId: "mock-read", name: "Read", detail: "", output: "1  describe('session refresh', () => {\n2    beforeEach(() => vi.useFakeTimers())\n3    // … complete file contents from the harness …", phase: "completed" });
    emit(thread.id, { type: "tool", callId: "mock-grep", name: "Grep", detail: "refreshToken", input: { pattern: "refreshToken", path: "src" }, output: "src/session.ts:84: await refreshToken()\nsrc/session.spec.ts:37: expect(refreshToken)", phase: "completed" });
    if (!readOnly) {
      await wait(420);
      emit(thread.id, { type: "tool", callId: "mock-edit", name: "Edit", detail: "src/session.spec.ts", input: { file_path: "src/session.spec.ts", old_string: "afterEach(() => vi.useRealTimers())", new_string: "afterEach(async () => {\n  await vi.runAllTimersAsync()\n  vi.useRealTimers()\n})" }, output: "Updated src/session.spec.ts", phase: "completed" });
      await wait(380);
      emit(thread.id, { type: "tool", callId: "mock-bash", name: "Bash", detail: "pnpm test session", input: { command: "pnpm test session" }, phase: "started" });
      await wait(600);
      emit(thread.id, { type: "tool", callId: "mock-bash", name: "Bash", detail: "", output: "✓ src/session.spec.ts (21 tests)\n\nTest Files  1 passed\nTests       21 passed", phase: "completed" });
    }
    const reply = readOnly ? MOCK_REVIEW_REPLY : MOCK_REPLY;
    // Stream the reply token-ish chunk by chunk, then persist the whole block.
    for (let i = 0; i < reply.length; i += 7) {
      deltaHandlers.forEach((h) => h({ threadId: thread.id, text: reply.slice(i, i + 7) }));
      await wait(12);
    }
    emit(thread.id, { type: "agent-text", text: reply });
    thread.usage.inputTokens += 31_000;
    thread.usage.outputTokens += 4200;
    emit(thread.id, { type: "turn-end", usage: { inputTokens: 31_000, outputTokens: 4200 } });
    emit(thread.id, { type: "diff", stats: { filesChanged: 2, additions: 48, deletions: 12 }, clean: false });
    thread.status = "idle";
    thread.updatedAt = new Date().toISOString();
    pushThreads();
  };

  return {
    platform: /Mac|iPhone|iPad/.test(navigator.platform) ? "mac" : /Win/.test(navigator.platform) ? "windows" : "linux",
    getSettings: async () => settings,
    setSettings: async (next) => {
      settings = next;
      return settings;
    },
    testNotifications: async () => undefined,
    detectAgents: async () => ({
      claude: {
        agent: "claude",
        installed: true,
        version: "2.1.198 (mock)",
        auth: "Claude login",
        models: AGENT_MODELS.claude,
      },
      codex: {
        agent: "codex",
        installed: true,
        version: "codex-cli 0.137.0 (mock)",
        auth: "ChatGPT login",
        models: AGENT_MODELS.codex,
      },
    }),
    pickDir: async () => "/Users/you/acme-app",
    openDir: async () => undefined,
    listProjects: async () => [mockProject],
    inspectProject: async () => ({
      project: mockProject,
      sources: [
        { id: "agents-instructions", harness: "shared", scope: "project", label: "Repository instructions", path: `${mockProject.cwd}/AGENTS.md`, exists: true, summary: "42 lines · 3 KB" },
        { id: "codex-project", harness: "codex", scope: "project", label: "Codex project config", path: `${mockProject.cwd}/.codex/config.toml`, exists: false, summary: "Not configured" },
      ],
      warnings: [],
    }),
    updateProject: async (_projectId, update) => Object.assign(mockProject, update),
    openProjectSource: async () => undefined,
    openLink: async () => undefined,
    pathForFile: (file) => file.webkitRelativePath || file.name,
    previewFile: async () => null,
    createThread: async ({ cwd, agent, permission }) => {
      const t = makeThread(cwd, agent, permission);
      pushThreads();
      return t;
    },
    setThreadPermission: async (threadId, permission) => {
      const thread = threads.get(threadId);
      if (!thread) throw new Error(`Unknown thread ${threadId}`);
      if (thread.kind === "review" && permission !== "read-only") thread.kind = "chat";
      thread.permission = permission;
      pushThreads();
      return thread;
    },
    setThreadReadySound: async (threadId, readySound) => {
      const thread = threads.get(threadId);
      if (!thread) throw new Error(`Unknown thread ${threadId}`);
      thread.readySound = readySound;
      thread.updatedAt = new Date().toISOString();
      pushThreads();
      return thread;
    },
    setThreadAgent: async (threadId, agent) => {
      const thread = threads.get(threadId);
      if (!thread) throw new Error(`Unknown thread ${threadId}`);
      if (thread.status === "running") throw new Error("Wait for the running turn to finish before changing models");
      if (thread.agent.agent !== agent.agent) throw new Error("Fork the thread to switch between Claude and Codex");
      thread.agent = agent;
      thread.updatedAt = new Date().toISOString();
      pushThreads();
      return thread;
    },
    renameThread: async (threadId, title) => {
      const thread = threads.get(threadId);
      if (!thread) throw new Error(`Unknown thread ${threadId}`);
      thread.title = title.trim().slice(0, 120);
      thread.updatedAt = new Date().toISOString();
      pushThreads();
      return thread;
    },
    setThreadArchived: async (threadId, archived) => {
      const thread = threads.get(threadId);
      if (!thread) throw new Error(`Unknown thread ${threadId}`);
      if (archived && thread.status === "running") throw new Error("Stop the running thread before archiving it");
      if (archived) thread.archivedAt = new Date().toISOString();
      else delete thread.archivedAt;
      thread.updatedAt = new Date().toISOString();
      pushThreads();
      return thread;
    },
    deleteThread: async (threadId) => {
      const thread = threads.get(threadId);
      if (thread?.status === "running") throw new Error("Stop the running thread before deleting it");
      threads.delete(threadId);
      events.delete(threadId);
      seq.delete(threadId);
      pushThreads();
    },
    listThreads: async () => list(),
    threadEvents: async (threadId) => events.get(threadId) ?? [],
    sendMessage: async (threadId, text, attachments = []) => {
      const thread = threads.get(threadId);
      if (!thread) return;
      if (thread.archivedAt) throw new Error("Restore this thread before sending another message");
      if (thread.title === "New thread") thread.title = (text.trim() || attachments[0]?.name || "New thread").split("\n")[0]!.slice(0, 80);
      emit(threadId, { type: "user-message", text, attachments });
      pushThreads();
      void runMockTurn(thread);
    },
    interrupt: async (threadId) => {
      const thread = threads.get(threadId);
      if (!thread || thread.status !== "running") return;
      thread.status = "idle";
      emit(threadId, { type: "interrupted" });
      pushThreads();
    },
    forkThread: async (threadId, agent) => {
      const source = threads.get(threadId)!;
      const t = makeThread(source.cwd, agent);
      t.title = `Fork: ${source.title}`;
      t.forkedFrom = { threadId: source.id, title: source.title };
      emit(t.id, {
        type: "briefing",
        text: "You are taking over an ongoing coding session…\n\n## User\nFix the flaky session test\n\n## Claude\nStubbed the clock, awaited the refresh…",
        trimmedEvents: 0,
        approxTokens: 1840,
      });
      pushThreads();
      return t;
    },
    reviewThread: async (threadId, agent) => {
      const source = threads.get(threadId)!;
      const t = makeThread(source.cwd, agent, "read-only");
      t.kind = "review";
      t.title = `Review: ${source.title}`;
      t.forkedFrom = { threadId: source.id, title: source.title };
      emit(t.id, {
        type: "briefing",
        text: "You are reviewing work done by another AI agent…\n\n--- UNCOMMITTED DIFF ---\ndiff --git a/src/session.spec.ts …",
        trimmedEvents: 0,
        approxTokens: 3200,
      });
      pushThreads();
      void runMockTurn(t);
      return t;
    },
    promoteReview: async (threadId) => {
      const thread = threads.get(threadId);
      if (!thread) throw new Error(`Unknown thread ${threadId}`);
      if (thread.kind !== "review") throw new Error("Only review threads can be promoted");
      thread.kind = "chat";
      thread.permission = "workspace-write";
      thread.updatedAt = new Date().toISOString();
      emit(thread.id, { type: "notice", text: "Changes approved — this review is now a normal write-enabled thread." });
      pushThreads();
      return thread;
    },
    threadStats: async () => ({ filesChanged: 2, additions: 48, deletions: 12 }),
    threadQueue: async () => [],
    removeQueued: async () => undefined,
    moveQueued: async () => undefined,
    resolvePermission: async () => undefined,
    copyResumeCommand: async () => "codex resume mock-session",
    onEvent: (h) => {
      eventHandlers.add(h);
      return () => eventHandlers.delete(h);
    },
    onDelta: (h) => {
      deltaHandlers.add(h);
      return () => deltaHandlers.delete(h);
    },
    onThreads: (h) => {
      threadHandlers.add(h);
      return () => threadHandlers.delete(h);
    },
    onQueue: () => () => undefined,
    onRevealThread: () => () => undefined,
  };
}

// Set only by Stereo's own Electron main process when it loads the window —
// a user-agent check would false-positive in any Electron-based browser.
const inStereoShell = new URLSearchParams(location.search).get("shell") === "stereo";

/** Inside the real app a missing bridge is a bug, never a reason to show fake data. */
export const bridgeFailed = inStereoShell && !window.stereo;
export const stereo: StereoApi = window.stereo ?? createMock();
export const isMock = !window.stereo && !inStereoShell;
