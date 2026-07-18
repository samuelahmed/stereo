import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, Notification, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import {
  Engine,
  detectClaude,
  detectCodex,
  type AgentSelection,
  type AssistantArtifact,
  type Attachment,
  type EventEnvelope,
  type EditorPreference,
  type QueuedMessage,
  type ReadySound,
  type Project,
  type Settings,
  type Thread,
  defaultAgentSelection,
  normalizeAgentSelection,
} from "@stereo/core";
import { openMarkdownLink } from "./link-opener.js";

app.setName("Stereo");

function applicationIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(app.getAppPath(), "resources", "icon.png");
}

const DEFAULT_SETTINGS: Settings = {
  defaultAgent: defaultAgentSelection("claude"),
  defaultPermission: "workspace-write",
  editor: "auto",
  notifyOnComplete: false,
  readySound: "off",
};

const EDITOR_PREFERENCES = new Set<EditorPreference>(["auto", "vscode", "cursor", "zed", "system"]);
const READY_SOUNDS = new Set<ReadySound>(["off", "standard", "prominent"]);
type SavedSettings = Partial<Settings> & { soundOnComplete?: boolean };

function normalizeSettings(saved: SavedSettings): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...saved };
  const defaultAgent = normalizeAgentSelection(merged.defaultAgent);
  const readySound = saved.readySound && READY_SOUNDS.has(saved.readySound)
    ? saved.readySound
    : saved.soundOnComplete
      ? "standard"
      : "off";
  return {
    defaultAgent,
    editor: EDITOR_PREFERENCES.has(merged.editor) ? merged.editor : "auto",
    defaultPermission: defaultAgent.agent === "codex" && merged.defaultPermission === "ask" ? "workspace-write" : merged.defaultPermission,
    notifyOnComplete: Boolean(merged.notifyOnComplete),
    readySound,
  };
}

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings(): Settings {
  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(settingsPath(), "utf8")) as SavedSettings);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: Settings): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

let engine: Engine;
let win: BrowserWindow | null = null;
let pendingRevealThreadId: string | null = null;
const liveNotifications = new Set<Notification>();

function sendToRenderer(channel: string, payload: unknown): void {
  if (!win || win.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

function revealThread(threadId: string): void {
  pendingRevealThreadId = threadId;
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (!win.webContents.isLoadingMainFrame()) {
    sendToRenderer("stereo:reveal-thread", threadId);
    pendingRevealThreadId = null;
  }
}

function playReadySound(readySound: ReadySound): void {
  if (readySound === "off") return;
  shell.beep();
  if (readySound === "prominent") setTimeout(() => shell.beep(), 700);
}

function showNotice(title: string, body: string, threadId?: string, force = false): void {
  const settings = loadSettings();
  const thread = threadId ? engine.listThreads().find((candidate) => candidate.id === threadId) : null;
  const readySound = thread?.readySound ?? settings.readySound;
  if (!settings.notifyOnComplete && readySound === "off") return;

  // A local beep is deliberately separate from Notification Center. It works
  // in unsigned development builds and needs no notification permission.
  playReadySound(readySound);

  // Sound is an explicit completion preference and should work even while the
  // Stereo window is focused. Only OS notifications and window flashing are
  // suppressed when the result is already visible in the foreground.
  if (!force && win && !win.isDestroyed() && win.isFocused()) return;

  if (settings.notifyOnComplete && Notification.isSupported()) {
    const notification = new Notification({ title, body, silent: true });
    liveNotifications.add(notification);
    const release = () => liveNotifications.delete(notification);
    notification.once("close", release);
    notification.once("failed", release);
    if (threadId) notification.on("click", () => revealThread(threadId));
    notification.show();
  }

  if (!force) {
    if (win && !win.isDestroyed()) win.flashFrame(true);
    else if (process.platform === "darwin") app.dock?.bounce("informational");
  }
}

function noticeFor(envelope: EventEnvelope): { title: string; body: string } | null {
  const thread = engine.listThreads().find((candidate) => candidate.id === envelope.threadId);
  if (!thread) return null;
  const agent = thread.agent.agent === "codex" ? "Codex" : "Claude";
  switch (envelope.event.type) {
    case "turn-end":
      // A turn ending is not completion when another user message is queued.
      if (engine.queuedFor(envelope.threadId).length > 0) return null;
      return { title: thread.title, body: `${agent} finished — ready for your review` };
    case "permission-request":
      return { title: `${thread.title} needs you`, body: `${agent} is waiting for approval to continue` };
    case "error":
      return { title: `${thread.title} stopped`, body: `${agent} hit an error and needs your attention` };
    default:
      return null;
  }
}

// The renderer may only preview files the user attached or files the engine
// imported into managed assistant-artifact storage. This keeps "file:preview"
// from becoming an arbitrary-file read primitive.
const previewablePaths = new Set<string>();

function approveAttachments(attachments: Attachment[] | undefined): void {
  for (const attachment of attachments ?? []) {
    if (typeof attachment?.path === "string" && attachment.path) previewablePaths.add(attachment.path);
  }
}

function approveArtifact(artifact: AssistantArtifact | undefined): void {
  if (typeof artifact?.path === "string" && artifact.path) previewablePaths.add(artifact.path);
}

function createWindow(): void {
  const browserWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 880,
    minHeight: 560,
    title: "Stereo",
    icon: applicationIconPath(),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : process.platform === "win32" ? "hidden" : "default",
    titleBarOverlay: process.platform === "win32"
      ? { color: "#131316", symbolColor: "#ececef", height: 42 }
      : false,
    backgroundColor: "#131316",
    webPreferences: {
      preload: path.join(import.meta.dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // ESM preload scripts cannot load in a sandboxed renderer; without this
      // the bridge silently fails and the UI falls back to the design mock.
      sandbox: false,
    },
  });
  win = browserWindow;

  browserWindow.webContents.on("did-finish-load", () => {
    void browserWindow.webContents
      .executeJavaScript("typeof window.stereo")
      .then((t: string) => console.log(`[stereo] engine bridge in renderer: ${t}`));
    if (pendingRevealThreadId) {
      browserWindow.webContents.send("stereo:reveal-thread", pendingRevealThreadId);
      pendingRevealThreadId = null;
    }
  });
  browserWindow.on("closed", () => {
    if (win === browserWindow) win = null;
  });
  browserWindow.on("focus", () => browserWindow.flashFrame(false));

  // The shell=stereo marker lets the renderer distinguish "running inside the
  // real app with a broken bridge" (hard error) from "running in a plain
  // browser" (design mock). Only this process can set it.
  if (process.env.ELECTRON_RENDERER_URL) {
    void browserWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}?shell=stereo`);
  } else {
    void browserWindow.loadFile(path.join(import.meta.dirname, "../renderer/index.html"), { query: { shell: "stereo" } });
  }
}

void app.whenReady().then(() => {
  if (process.platform === "darwin") app.dock?.setIcon(applicationIconPath());
  if (process.platform === "win32") Menu.setApplicationMenu(null);
  const settings = loadSettings();
  engine = new Engine(settings, path.join(app.getPath("userData"), "data"));
  engine.on("event", (envelope: EventEnvelope) => {
    if (envelope.event.type === "assistant-artifact") approveArtifact(envelope.event.artifact);
    sendToRenderer("stereo:event", envelope);
    const notice = noticeFor(envelope);
    if (notice) showNotice(notice.title, notice.body, envelope.threadId);
  });
  engine.on("delta", (delta: { threadId: string; text: string }) => sendToRenderer("stereo:delta", delta));
  engine.on("threads", (threads: Thread[]) => sendToRenderer("stereo:threads", threads));
  engine.on("queue", (payload: { threadId: string; queue: QueuedMessage[] }) => sendToRenderer("stereo:queue", payload));

  ipcMain.handle("settings:get", () => loadSettings());
  ipcMain.handle("settings:set", (_e, next: Settings) => {
    const settings = normalizeSettings(next);
    saveSettings(settings);
    engine.updateSettings(settings);
    return settings;
  });
  ipcMain.handle("notifications:test", () => {
    const settings = loadSettings();
    if (!settings.notifyOnComplete && settings.readySound === "off") throw new Error("Turn on notifications or sound first");
    showNotice("Stereo is ready", "You'll be notified when work is ready for you.", undefined, true);
  });

  ipcMain.handle("agents:detect", async () => {
    const [claude, codex] = await Promise.all([detectClaude(), detectCodex()]);
    return { claude, codex };
  });

  ipcMain.handle("dir:pick", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle("dir:open", async (_e, directory: string) => {
    const error = await shell.openPath(directory);
    if (error) throw new Error(error);
  });
  ipcMain.handle("project:list", () => engine.listProjects());
  ipcMain.handle("project:inspect", (_e, projectId: string) => engine.inspectProject(projectId));
  ipcMain.handle("project:update", (_e, projectId: string, update: Pick<Project, "name" | "defaults">) => engine.updateProject(projectId, update));
  ipcMain.handle("project:source:open", async (_e, projectId: string, sourceId: string) => {
    const source = engine.inspectProject(projectId).sources.find((candidate) => candidate.id === sourceId);
    if (!source?.exists) throw new Error("That configuration source does not exist");
    const error = await shell.openPath(source.path);
    if (error) throw new Error(error);
  });
  ipcMain.handle("link:open", (_e, threadId: string, href: string) => {
    const thread = engine.listThreads().find((candidate) => candidate.id === threadId);
    if (!thread) throw new Error("This link belongs to a thread that no longer exists");
    return openMarkdownLink(thread.cwd, href, loadSettings().editor);
  });
  // Sent by the preload whenever it resolves a real on-disk File the user
  // dropped, pasted, or picked — synthetic Files never resolve to a path.
  ipcMain.on("file:approve", (_e, filePath: string) => {
    if (typeof filePath === "string" && filePath) previewablePaths.add(filePath);
  });
  ipcMain.handle("file:preview", async (_e, filePath: string) => {
    if (typeof filePath !== "string" || !previewablePaths.has(filePath)) return null;
    const mimeByExtension: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
    };
    const mime = mimeByExtension[path.extname(filePath).toLowerCase()];
    if (!mime) return null;
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile() || stat.size > 15 * 1024 * 1024) return null;
    const data = await fs.promises.readFile(filePath);
    return `data:${mime};base64,${data.toString("base64")}`;
  });

  ipcMain.handle("thread:create", (_e, input: { cwd: string; projectId?: string; agent: AgentSelection; permission?: Thread["permission"] }) => engine.createThread(input));
  ipcMain.handle("thread:permission", (_e, threadId: string, permission: Thread["permission"]) => engine.setThreadPermission(threadId, permission));
  ipcMain.handle("thread:ready-sound", (_e, threadId: string, readySound: ReadySound | null) => engine.setThreadReadySound(threadId, readySound));
  ipcMain.handle("thread:agent", (_e, threadId: string, agent: AgentSelection) => engine.setThreadAgent(threadId, agent));
  ipcMain.handle("thread:rename", (_e, threadId: string, title: string) => engine.renameThread(threadId, title));
  ipcMain.handle("thread:archive", (_e, threadId: string, archived: boolean) => engine.setThreadArchived(threadId, archived));
  ipcMain.handle("thread:delete", (_e, threadId: string) => engine.deleteThread(threadId));
  ipcMain.handle("thread:list", () => engine.listThreads());
  ipcMain.handle("thread:events", (_e, threadId: string) => {
    const events = engine.eventsFor(threadId);
    for (const envelope of events) {
      if (envelope.event.type === "user-message") approveAttachments(envelope.event.attachments);
      if (envelope.event.type === "assistant-artifact") approveArtifact(envelope.event.artifact);
    }
    return events;
  });
  ipcMain.handle("thread:send", (_e, threadId: string, text: string, attachments?: Attachment[]) => {
    approveAttachments(attachments);
    return engine.sendMessage(threadId, text, attachments);
  });
  ipcMain.handle("thread:interrupt", (_e, threadId: string) => engine.interrupt(threadId));
  ipcMain.handle("thread:fork", (_e, threadId: string, agent: AgentSelection) => engine.forkThread(threadId, agent));
  ipcMain.handle("thread:review", (_e, threadId: string, agent: AgentSelection) => engine.reviewThread(threadId, agent));
  ipcMain.handle("thread:review:promote", (_e, threadId: string) => engine.promoteReview(threadId));
  ipcMain.handle("thread:stats", (_e, threadId: string) => engine.stats(threadId));
  ipcMain.handle("thread:queue", (_e, threadId: string) => engine.queuedFor(threadId));
  ipcMain.handle("thread:queue:remove", (_e, threadId: string, messageId: string) => engine.removeQueued(threadId, messageId));
  ipcMain.handle("thread:queue:move", (_e, threadId: string, messageId: string, direction: -1 | 1) =>
    engine.moveQueued(threadId, messageId, direction),
  );
  ipcMain.handle("session:permission", (_e, requestId: string, allowed: boolean) => engine.resolvePermission(requestId, allowed));
  ipcMain.handle("session:copy-resume", (_e, threadId: string) => {
    const command = engine.nativeResumeCommand(threadId);
    if (!command) throw new Error("This thread does not have a native session yet");
    clipboard.writeText(command);
    return command;
  });

  createWindow();
  engine.resumeQueued();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
