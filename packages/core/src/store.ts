import fs from "node:fs";
import path from "node:path";
import type { EventEnvelope, Project, QueuedMessage, Thread } from "./types.js";

/**
 * Event-sourced persistence. threads.json holds thread metadata (written
 * atomically); each thread's transcript is an append-only JSONL log. The
 * transcript is the canonical, vendor-neutral record — it is what the UI
 * renders, what survives forever, and what fork briefings are compiled from.
 */
export class ThreadStore {
  private threadsFile: string;
  private eventsDir: string;
  private projectsFile: string;
  private queuesFile: string;

  constructor(dir: string) {
    this.threadsFile = path.join(dir, "threads.json");
    this.eventsDir = path.join(dir, "events");
    this.projectsFile = path.join(dir, "projects.json");
    this.queuesFile = path.join(dir, "queues.json");
    fs.mkdirSync(this.eventsDir, { recursive: true });
  }

  loadThreads(): Thread[] {
    try {
      return JSON.parse(fs.readFileSync(this.threadsFile, "utf8")) as Thread[];
    } catch {
      return [];
    }
  }

  saveThreads(threads: Thread[]): void {
    this.atomicJson(this.threadsFile, threads);
  }

  loadProjects(): Project[] {
    return this.readJson<Project[]>(this.projectsFile, []);
  }

  saveProjects(projects: Project[]): void {
    this.atomicJson(this.projectsFile, projects);
  }

  loadQueues(): Record<string, QueuedMessage[]> {
    return this.readJson<Record<string, QueuedMessage[]>>(this.queuesFile, {});
  }

  saveQueues(queues: Map<string, QueuedMessage[]>): void {
    this.atomicJson(this.queuesFile, Object.fromEntries([...queues].filter(([, queue]) => queue.length > 0)));
  }

  appendEvent(envelope: EventEnvelope): void {
    fs.appendFileSync(this.eventsFile(envelope.threadId), `${JSON.stringify(envelope)}\n`);
  }

  loadEvents(threadId: string): EventEnvelope[] {
    try {
      return fs
        .readFileSync(this.eventsFile(threadId), "utf8")
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as EventEnvelope);
    } catch {
      return [];
    }
  }

  lastSeq(threadId: string): number {
    const events = this.loadEvents(threadId);
    return events.at(-1)?.seq ?? 0;
  }

  deleteEvents(threadId: string): void {
    try {
      fs.unlinkSync(this.eventsFile(threadId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private eventsFile(threadId: string): string {
    return path.join(this.eventsDir, `${threadId}.jsonl`);
  }

  private readJson<T>(file: string, fallback: T): T {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as T;
    } catch {
      return fallback;
    }
  }

  private atomicJson(file: string, value: unknown): void {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, file);
  }
}
