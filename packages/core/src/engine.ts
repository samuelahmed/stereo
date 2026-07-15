import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import type {
  AgentSelection,
  EventEnvelope,
  Settings,
  Thread,
  ThreadEvent,
  TokenUsage,
} from "./types.js";
import type { AgentAdapter, TurnHandle } from "./adapters/types.js";
import { claudeAdapter } from "./adapters/claude.js";
import { codexAdapter } from "./adapters/codex.js";
import { applyAuthModeToProcess } from "./adapters/env.js";
import { buildForkBriefing, buildResumeBriefing, buildReviewBriefing } from "./briefing.js";
import { diffStats, diffText } from "./git.js";
import { ThreadStore } from "./store.js";

const MAX_REVIEW_DIFF_CHARS = 200_000;

function makeAdapter(agent: AgentSelection, settings: Settings): AgentAdapter {
  return agent.agent === "claude" ? claudeAdapter(agent) : codexAdapter(settings.authMode, agent);
}

export interface CreateThreadInput {
  cwd: string;
  agent: AgentSelection;
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
 */
export class Engine extends EventEmitter {
  private threads = new Map<string, Thread>();
  private seq = new Map<string, number>();
  private store: ThreadStore;
  private turns = new Map<string, TurnHandle>();
  private queues = new Map<string, string[]>();

  constructor(
    private settings: Settings,
    dataDir: string,
  ) {
    super();
    applyAuthModeToProcess(settings.authMode);
    this.store = new ThreadStore(dataDir);

    const crashed: string[] = [];
    for (const thread of this.store.loadThreads()) {
      this.threads.set(thread.id, thread);
      this.seq.set(thread.id, this.store.lastSeq(thread.id));
      if (thread.status === "running") {
        // The app quit mid-turn. Both CLIs persist their sessions on disk, so
        // the thread is still resumable — mark the interruption and move on.
        thread.status = "idle";
        crashed.push(thread.id);
      }
    }
    for (const id of crashed) this.emitEvent(id, { type: "interrupted" });
    if (crashed.length > 0) this.store.saveThreads(this.list());
  }

  updateSettings(settings: Settings): void {
    this.settings = settings;
    applyAuthModeToProcess(settings.authMode);
  }

  listThreads(): Thread[] {
    return this.list().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  eventsFor(threadId: string): EventEnvelope[] {
    return this.store.loadEvents(threadId);
  }

  createThread(input: CreateThreadInput): Thread {
    const now = new Date().toISOString();
    const thread: Thread = {
      id: crypto.randomUUID(),
      title: "New thread",
      cwd: input.cwd,
      kind: "chat",
      agent: input.agent,
      status: "idle",
      createdAt: now,
      updatedAt: now,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    this.threads.set(thread.id, thread);
    this.persist();
    return thread;
  }

  /**
   * Send a message. Messages queue like they do in the CLIs: if a turn is
   * running, the message waits and runs next.
   */
  sendMessage(threadId: string, text: string): void {
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error(`Unknown thread ${threadId}`);
    const queue = this.queues.get(threadId) ?? [];
    queue.push(text);
    this.queues.set(threadId, queue);
    void this.pump(threadId);
  }

  interrupt(threadId: string): void {
    this.turns.get(threadId)?.interrupt();
  }

  /** Duplicate a thread to any model. The briefing rides along with the user's next message. */
  forkThread(threadId: string, agent: AgentSelection): Thread {
    const source = this.threads.get(threadId);
    if (!source) throw new Error(`Unknown thread ${threadId}`);
    const compiled = buildForkBriefing(this.eventsFor(threadId), {
      fromAgent: source.agent.agent,
      cwd: source.cwd,
    });
    const thread = this.createThread({ cwd: source.cwd, agent });
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
    const diff = await diffText(source.cwd, MAX_REVIEW_DIFF_CHARS);
    const compiled = buildReviewBriefing(this.eventsFor(threadId), diff, {
      fromAgent: source.agent.agent,
      cwd: source.cwd,
    });
    const thread = this.createThread({ cwd: source.cwd, agent });
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

  private persist(): void {
    this.store.saveThreads(this.list());
    this.emit("threads", this.listThreads());
  }

  private async pump(threadId: string): Promise<void> {
    const thread = this.threads.get(threadId);
    if (!thread || thread.status === "running") return;
    const next = this.queues.get(threadId)?.shift();
    if (next === undefined) return;

    if (thread.title === "New thread") {
      thread.title = next.split("\n")[0]!.slice(0, 80);
    }
    this.emitEvent(threadId, { type: "user-message", text: next });

    let prompt = next;
    if (thread.pendingBriefing) {
      prompt = `${thread.pendingBriefing}\n\n--- USER MESSAGE ---\n\n${next}`;
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
    const adapter = makeAdapter(thread.agent, this.settings);
    const callbacks = {
      onDelta: (text: string) => this.emit("delta", { threadId: thread.id, text }),
      onText: (text: string) => this.emitEvent(thread.id, { type: "agent-text", text }),
      onTool: (name: string, detail: string) => this.emitEvent(thread.id, { type: "tool", name, detail }),
      onUsage: (usage: TokenUsage) => {
        turnUsage = usage;
        thread.usage.inputTokens += usage.inputTokens;
        thread.usage.outputTokens += usage.outputTokens;
      },
    };
    try {
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
