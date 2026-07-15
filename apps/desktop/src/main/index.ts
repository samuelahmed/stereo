import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import {
  Engine,
  detectClaude,
  detectCodex,
  type AgentSelection,
  type EventEnvelope,
  type Settings,
  type Thread,
} from "@stereo/core";

const DEFAULT_SETTINGS: Settings = {
  authMode: "subscription",
  defaultAgent: { agent: "claude", model: null, effort: null },
};

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(fs.readFileSync(settingsPath(), "utf8")) as Partial<Settings>) };
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
  engine.on("event", (envelope: EventEnvelope) => win?.webContents.send("stereo:event", envelope));
  engine.on("delta", (delta: { threadId: string; text: string }) => win?.webContents.send("stereo:delta", delta));
  engine.on("threads", (threads: Thread[]) => win?.webContents.send("stereo:threads", threads));

  ipcMain.handle("settings:get", () => loadSettings());
  ipcMain.handle("settings:set", (_e, next: Settings) => {
    saveSettings(next);
    engine.updateSettings(next);
  });

  ipcMain.handle("agents:detect", async () => {
    const [claude, codex] = await Promise.all([detectClaude(), detectCodex()]);
    return { claude, codex };
  });

  ipcMain.handle("dir:pick", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle("thread:create", (_e, input: { cwd: string; agent: AgentSelection }) => engine.createThread(input));
  ipcMain.handle("thread:list", () => engine.listThreads());
  ipcMain.handle("thread:events", (_e, threadId: string) => engine.eventsFor(threadId));
  ipcMain.handle("thread:send", (_e, threadId: string, text: string) => engine.sendMessage(threadId, text));
  ipcMain.handle("thread:interrupt", (_e, threadId: string) => engine.interrupt(threadId));
  ipcMain.handle("thread:fork", (_e, threadId: string, agent: AgentSelection) => engine.forkThread(threadId, agent));
  ipcMain.handle("thread:review", (_e, threadId: string, agent: AgentSelection) => engine.reviewThread(threadId, agent));
  ipcMain.handle("thread:stats", (_e, threadId: string) => engine.stats(threadId));

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
