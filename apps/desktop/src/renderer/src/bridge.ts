import type {
  AgentSelection,
  Attachment,
  AgentStatusInfo,
  DiffStats,
  EventEnvelope,
  QueuedMessage,
  Settings,
  Thread,
  ThreadEvent,
} from "@stereo/core";
import { CLAUDE_EFFORTS, CLAUDE_MODELS, CODEX_EFFORTS, CODEX_MODELS } from "@stereo/core/catalog";

export interface StereoApi {
  getSettings(): Promise<Settings>;
  setSettings(settings: Settings): Promise<void>;
  detectAgents(): Promise<{ claude: AgentStatusInfo; codex: AgentStatusInfo }>;
  pickDir(): Promise<string | null>;
  openDir(directory: string): Promise<void>;
  openLink(threadId: string, href: string): Promise<void>;
  pathForFile(file: File): string;
  previewFile(filePath: string): Promise<string | null>;
  createThread(input: { cwd: string; agent: AgentSelection; permission?: Thread["permission"] }): Promise<Thread>;
  setThreadPermission(threadId: string, permission: Thread["permission"]): Promise<Thread>;
  renameThread(threadId: string, title: string): Promise<Thread>;
  deleteThread(threadId: string): Promise<void>;
  listThreads(): Promise<Thread[]>;
  threadEvents(threadId: string): Promise<EventEnvelope[]>;
  sendMessage(threadId: string, text: string, attachments?: Attachment[]): Promise<void>;
  interrupt(threadId: string): Promise<void>;
  forkThread(threadId: string, agent: AgentSelection): Promise<Thread>;
  reviewThread(threadId: string, agent: AgentSelection): Promise<Thread>;
  threadStats(threadId: string): Promise<DiffStats | null>;
  threadQueue(threadId: string): Promise<QueuedMessage[]>;
  removeQueued(threadId: string, messageId: string): Promise<void>;
  moveQueued(threadId: string, messageId: string, direction: -1 | 1): Promise<void>;
  onEvent(handler: (envelope: EventEnvelope) => void): () => void;
  onDelta(handler: (delta: { threadId: string; text: string }) => void): () => void;
  onThreads(handler: (threads: Thread[]) => void): () => void;
  onQueue(handler: (payload: { threadId: string; queue: QueuedMessage[] }) => void): () => void;
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

/**
 * Outside Electron (plain browser during UI development) window.stereo is
 * absent; this mock simulates a full thread lifecycle — streaming deltas, tool
 * lines, diff markers — so the interface can be exercised end to end without
 * spending anyone's tokens.
 */
function createMock(): StereoApi {
  let settings: Settings = {
    authMode: "subscription",
    defaultAgent: { agent: "claude", model: null, effort: null },
    defaultPermission: "workspace-write",
    editor: "auto",
    notifyOnComplete: false,
  };
  const threads = new Map<string, Thread>();
  const events = new Map<string, EventEnvelope[]>();
  const seq = new Map<string, number>();
  const eventHandlers = new Set<(e: EventEnvelope) => void>();
  const deltaHandlers = new Set<(d: { threadId: string; text: string }) => void>();
  const threadHandlers = new Set<(t: Thread[]) => void>();

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
      kind: "chat",
      agent,
      permission,
      status: "idle",
      createdAt: now,
      updatedAt: now,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    threads.set(id, thread);
    events.set(id, []);
    return thread;
  };

  const runMockTurn = async (thread: Thread) => {
    thread.status = "running";
    thread.updatedAt = new Date().toISOString();
    pushThreads();
    await wait(350);
    emit(thread.id, { type: "tool", name: "Read", detail: "src/session.spec.ts" });
    await wait(420);
    emit(thread.id, { type: "tool", name: "Grep", detail: "refreshToken" });
    await wait(420);
    emit(thread.id, { type: "tool", name: "Edit", detail: "src/session.spec.ts" });
    await wait(380);
    emit(thread.id, { type: "tool", name: "Bash", detail: "pnpm test session" });
    await wait(600);
    // Stream the reply token-ish chunk by chunk, then persist the whole block.
    for (let i = 0; i < MOCK_REPLY.length; i += 7) {
      deltaHandlers.forEach((h) => h({ threadId: thread.id, text: MOCK_REPLY.slice(i, i + 7) }));
      await wait(12);
    }
    emit(thread.id, { type: "agent-text", text: MOCK_REPLY });
    thread.usage.inputTokens += 31_000;
    thread.usage.outputTokens += 4200;
    emit(thread.id, { type: "turn-end", usage: { inputTokens: 31_000, outputTokens: 4200 } });
    emit(thread.id, { type: "diff", stats: { filesChanged: 2, additions: 48, deletions: 12 }, clean: false });
    thread.status = "idle";
    thread.updatedAt = new Date().toISOString();
    pushThreads();
  };

  return {
    getSettings: async () => settings,
    setSettings: async (next) => {
      settings = next;
    },
    detectAgents: async () => ({
      claude: {
        agent: "claude",
        installed: true,
        version: "2.1.198 (mock)",
        auth: "Claude login",
        models: CLAUDE_MODELS,
        efforts: CLAUDE_EFFORTS,
      },
      codex: {
        agent: "codex",
        installed: true,
        version: "codex-cli 0.137.0 (mock)",
        auth: "ChatGPT login",
        models: CODEX_MODELS,
        efforts: CODEX_EFFORTS,
      },
    }),
    pickDir: async () => "/Users/you/acme-app",
    openDir: async () => undefined,
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
      thread.permission = permission;
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
      t.title = `⑂ ${source.title}`;
      t.forkedFrom = { threadId: source.id, title: source.title };
      emit(t.id, {
        type: "briefing",
        text: "You are taking over an ongoing coding session…\n\n## User\nFix the flaky session test\n\n## Claude Code\nStubbed the clock, awaited the refresh…",
        trimmedEvents: 0,
        approxTokens: 1840,
      });
      pushThreads();
      return t;
    },
    reviewThread: async (threadId, agent) => {
      const source = threads.get(threadId)!;
      const t = makeThread(source.cwd, agent);
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
    threadStats: async () => ({ filesChanged: 2, additions: 48, deletions: 12 }),
    threadQueue: async () => [],
    removeQueued: async () => undefined,
    moveQueued: async () => undefined,
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
  };
}

// Set only by Stereo's own Electron main process when it loads the window —
// a user-agent check would false-positive in any Electron-based browser.
const inStereoShell = new URLSearchParams(location.search).get("shell") === "stereo";

/** Inside the real app a missing bridge is a bug, never a reason to show fake data. */
export const bridgeFailed = inStereoShell && !window.stereo;
export const stereo: StereoApi = window.stereo ?? createMock();
export const isMock = !window.stereo && !inStereoShell;
