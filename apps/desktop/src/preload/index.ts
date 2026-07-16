import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { AgentSelection, Attachment, EventEnvelope, QueuedMessage, Settings, Thread } from "@stereo/core";

const api = {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (settings: Settings) => ipcRenderer.invoke("settings:set", settings),
  detectAgents: () => ipcRenderer.invoke("agents:detect"),
  pickDir: () => ipcRenderer.invoke("dir:pick"),
  openDir: (directory: string) => ipcRenderer.invoke("dir:open", directory),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  previewFile: (filePath: string) => ipcRenderer.invoke("file:preview", filePath),
  createThread: (input: { cwd: string; agent: AgentSelection; permission?: Thread["permission"] }) => ipcRenderer.invoke("thread:create", input),
  setThreadPermission: (threadId: string, permission: Thread["permission"]) => ipcRenderer.invoke("thread:permission", threadId, permission),
  renameThread: (threadId: string, title: string) => ipcRenderer.invoke("thread:rename", threadId, title),
  deleteThread: (threadId: string) => ipcRenderer.invoke("thread:delete", threadId),
  listThreads: () => ipcRenderer.invoke("thread:list"),
  threadEvents: (threadId: string) => ipcRenderer.invoke("thread:events", threadId),
  sendMessage: (threadId: string, text: string, attachments?: Attachment[]) => ipcRenderer.invoke("thread:send", threadId, text, attachments),
  interrupt: (threadId: string) => ipcRenderer.invoke("thread:interrupt", threadId),
  forkThread: (threadId: string, agent: AgentSelection) => ipcRenderer.invoke("thread:fork", threadId, agent),
  reviewThread: (threadId: string, agent: AgentSelection) => ipcRenderer.invoke("thread:review", threadId, agent),
  threadStats: (threadId: string) => ipcRenderer.invoke("thread:stats", threadId),
  threadQueue: (threadId: string) => ipcRenderer.invoke("thread:queue", threadId),
  removeQueued: (threadId: string, messageId: string) => ipcRenderer.invoke("thread:queue:remove", threadId, messageId),
  moveQueued: (threadId: string, messageId: string, direction: -1 | 1) => ipcRenderer.invoke("thread:queue:move", threadId, messageId, direction),
  onEvent: (handler: (envelope: EventEnvelope) => void) => {
    const listener = (_e: unknown, envelope: EventEnvelope) => handler(envelope);
    ipcRenderer.on("stereo:event", listener);
    return () => ipcRenderer.removeListener("stereo:event", listener);
  },
  onDelta: (handler: (delta: { threadId: string; text: string }) => void) => {
    const listener = (_e: unknown, delta: { threadId: string; text: string }) => handler(delta);
    ipcRenderer.on("stereo:delta", listener);
    return () => ipcRenderer.removeListener("stereo:delta", listener);
  },
  onThreads: (handler: (threads: Thread[]) => void) => {
    const listener = (_e: unknown, threads: Thread[]) => handler(threads);
    ipcRenderer.on("stereo:threads", listener);
    return () => ipcRenderer.removeListener("stereo:threads", listener);
  },
  onQueue: (handler: (payload: { threadId: string; queue: QueuedMessage[] }) => void) => {
    const listener = (_e: unknown, payload: { threadId: string; queue: QueuedMessage[] }) => handler(payload);
    ipcRenderer.on("stereo:queue", listener);
    return () => ipcRenderer.removeListener("stereo:queue", listener);
  },
};

contextBridge.exposeInMainWorld("stereo", api);

export type StereoApi = typeof api;
