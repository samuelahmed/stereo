import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import {
  Engine,
  detectClaude,
  detectCodex,
  type AgentSelection,
  type Attachment,
  type EventEnvelope,
  type EditorPreference,
  type QueuedMessage,
  type Settings,
  type Thread,
} from "@stereo/core";
import { openMarkdownLink } from "./link-opener.js";

const DEFAULT_SETTINGS: Settings = {
  authMode: "subscription",
  defaultAgent: { agent: "claude", model: null, effort: null },
  defaultPermission: "workspace-write",
  editor: "auto",
  notifyOnComplete: false,
};

const EDITOR_PREFERENCES = new Set<EditorPreference>(["auto", "vscode", "cursor", "zed", "system"]);

function normalizeSettings(saved: Partial<Settings>): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...saved };
  return { ...merged, editor: EDITOR_PREFERENCES.has(merged.editor) ? merged.editor : "auto" };
}

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings(): Settings {
  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(settingsPath(), "utf8")) as Partial<Settings>);
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

// The renderer may only preview files the user actually attached: paths are
// approved when the preload resolves a real dropped/picked file, when a
// message is sent with attachments, or when persisted history mentions them.
// This keeps "file:preview" from being an arbitrary-file read primitive.
const previewablePaths = new Set<string>();

function approveAttachments(attachments: Attachment[] | undefined): void {
  for (const attachment of attachments ?? []) {
    if (typeof attachment?.path === "string" && attachment.path) previewablePaths.add(attachment.path);
  }
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 880,
    minHeight: 560,
    title: "Stereo",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
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

  win.webContents.on("did-finish-load", () => {
    void win?.webContents
      .executeJavaScript("typeof window.stereo")
      .then((t: string) => console.log(`[stereo] engine bridge in renderer: ${t}`));
  });

  // The shell=stereo marker lets the renderer distinguish "running inside the
  // real app with a broken bridge" (hard error) from "running in a plain
  // browser" (design mock). Only this process can set it.
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}?shell=stereo`);
  } else {
    void win.loadFile(path.join(import.meta.dirname, "../renderer/index.html"), { query: { shell: "stereo" } });
  }
}

void app.whenReady().then(() => {
  const settings = loadSettings();
  engine = new Engine(settings, path.join(app.getPath("userData"), "data"));
  engine.on("event", (envelope: EventEnvelope) => {
    win?.webContents.send("stereo:event", envelope);
    if (envelope.event.type === "turn-end" && loadSettings().notifyOnComplete && !win?.isFocused() && Notification.isSupported()) {
      const thread = engine.listThreads().find((candidate) => candidate.id === envelope.threadId);
      const notification = new Notification({ title: thread?.title ?? "Stereo", body: `${thread?.agent.agent === "codex" ? "Codex" : "Claude"} finished working` });
      notification.on("click", () => {
        win?.show();
        win?.focus();
      });
      notification.show();
    }
  });
  engine.on("delta", (delta: { threadId: string; text: string }) => win?.webContents.send("stereo:delta", delta));
  engine.on("threads", (threads: Thread[]) => win?.webContents.send("stereo:threads", threads));
  engine.on("queue", (payload: { threadId: string; queue: QueuedMessage[] }) => win?.webContents.send("stereo:queue", payload));

  ipcMain.handle("settings:get", () => loadSettings());
  ipcMain.handle("settings:set", (_e, next: Settings) => {
    const settings = normalizeSettings(next);
    saveSettings(settings);
    engine.updateSettings(settings);
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

  ipcMain.handle("thread:create", (_e, input: { cwd: string; agent: AgentSelection; permission?: Thread["permission"] }) => engine.createThread(input));
  ipcMain.handle("thread:permission", (_e, threadId: string, permission: Thread["permission"]) => engine.setThreadPermission(threadId, permission));
  ipcMain.handle("thread:rename", (_e, threadId: string, title: string) => engine.renameThread(threadId, title));
  ipcMain.handle("thread:delete", (_e, threadId: string) => engine.deleteThread(threadId));
  ipcMain.handle("thread:list", () => engine.listThreads());
  ipcMain.handle("thread:events", (_e, threadId: string) => {
    const events = engine.eventsFor(threadId);
    for (const envelope of events) {
      if (envelope.event.type === "user-message") approveAttachments(envelope.event.attachments);
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
  ipcMain.handle("thread:stats", (_e, threadId: string) => engine.stats(threadId));
  ipcMain.handle("thread:queue", (_e, threadId: string) => engine.queuedFor(threadId));
  ipcMain.handle("thread:queue:remove", (_e, threadId: string, messageId: string) => engine.removeQueued(threadId, messageId));
  ipcMain.handle("thread:queue:move", (_e, threadId: string, messageId: string, direction: -1 | 1) =>
    engine.moveQueued(threadId, messageId, direction),
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
