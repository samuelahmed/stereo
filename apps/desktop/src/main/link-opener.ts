import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shell } from "electron";
import type { EditorPreference } from "@stereo/core";

type CodeEditor = Exclude<EditorPreference, "auto" | "system">;

interface FileTarget {
  filePath: string;
  line: number | null;
  column: number | null;
}

interface EditorDefinition {
  label: string;
  command: string;
  macCommands: string[];
  args(location: string): string[];
}

const EDITORS: Record<CodeEditor, EditorDefinition> = {
  vscode: {
    label: "Visual Studio Code",
    command: "code",
    macCommands: ["/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"],
    args: (location) => ["--goto", location],
  },
  cursor: {
    label: "Cursor",
    command: "cursor",
    macCommands: ["/Applications/Cursor.app/Contents/Resources/app/bin/cursor"],
    args: (location) => ["--goto", location],
  },
  zed: {
    label: "Zed",
    command: "zed",
    macCommands: [
      "/Applications/Zed.app/Contents/MacOS/cli",
      "/Applications/Zed.app/Contents/MacOS/zed",
    ],
    args: (location) => [location],
  },
};

const WEB_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function executableOnPath(command: string): string | null {
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];
  for (const directory of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${command}${extension}`);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // Keep looking; desktop apps often inherit a deliberately small PATH.
      }
    }
  }
  return null;
}

function editorExecutable(editor: CodeEditor): string | null {
  const definition = EDITORS[editor];
  const fromPath = executableOnPath(definition.command);
  if (fromPath) return fromPath;
  if (process.platform !== "darwin") return null;
  return definition.macCommands.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function hintedEditor(): CodeEditor | null {
  const hint = `${process.env.VISUAL ?? ""} ${process.env.EDITOR ?? ""} ${process.env.TERM_PROGRAM ?? ""}`.toLowerCase();
  if (hint.includes("cursor")) return "cursor";
  if (hint.includes("zed")) return "zed";
  if (hint.includes("code") || hint.includes("vscode")) return "vscode";
  return null;
}

function autoEditor(): { editor: CodeEditor; executable: string } | null {
  const hint = hintedEditor();
  const order: CodeEditor[] = hint
    ? [hint, ...(["vscode", "cursor", "zed"] as CodeEditor[]).filter((editor) => editor !== hint)]
    : ["vscode", "cursor", "zed"];
  for (const editor of order) {
    const executable = editorExecutable(editor);
    if (executable) return { editor, executable };
  }
  return null;
}

function launch(executable: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function parseLineSuffix(rawPath: string): FileTarget {
  const hashMatch = rawPath.match(/#L(\d+)(?:C(\d+))?$/i);
  if (hashMatch) {
    return {
      filePath: rawPath.slice(0, hashMatch.index),
      line: Number(hashMatch[1]),
      column: hashMatch[2] ? Number(hashMatch[2]) : null,
    };
  }

  const suffixMatch = rawPath.match(/:(\d+)(?::(\d+))?$/);
  if (suffixMatch) {
    return {
      filePath: rawPath.slice(0, suffixMatch.index),
      line: Number(suffixMatch[1]),
      column: suffixMatch[2] ? Number(suffixMatch[2]) : null,
    };
  }
  return { filePath: rawPath, line: null, column: null };
}

function decodeLocalTarget(href: string): FileTarget {
  let decoded: string;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    throw new Error("This file link is malformed");
  }

  if (decoded.startsWith("file://")) {
    const url = new URL(decoded);
    const hash = url.hash;
    url.hash = "";
    return parseLineSuffix(`${fileURLToPath(url)}${hash}`);
  }

  const looksLikeWindowsPath = /^[a-zA-Z]:[\\/]/.test(decoded);
  const scheme = decoded.match(/^([a-zA-Z][a-zA-Z\d+.-]*):/)?.[1];
  if (scheme && !looksLikeWindowsPath) throw new Error(`Unsupported link type: ${scheme}`);
  return parseLineSuffix(decoded);
}

async function resolveWorkspaceFile(cwd: string, href: string): Promise<FileTarget> {
  const parsed = decodeLocalTarget(href);
  const workspace = await fs.promises.realpath(cwd);
  const candidate = path.resolve(workspace, parsed.filePath);

  let realFile: string;
  try {
    realFile = await fs.promises.realpath(candidate);
  } catch {
    throw new Error(`File not found: ${parsed.filePath}`);
  }

  const relative = path.relative(workspace, realFile);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("File links must point inside this thread's working folder");
  }
  const stat = await fs.promises.stat(realFile);
  if (!stat.isFile()) throw new Error(`Not a file: ${parsed.filePath}`);
  return { ...parsed, filePath: realFile };
}

async function openFile(target: FileTarget, preference: EditorPreference): Promise<void> {
  if (preference === "system") {
    const error = await shell.openPath(target.filePath);
    if (error) throw new Error(error);
    return;
  }

  const selected = preference === "auto"
    ? autoEditor()
    : (() => {
        const executable = editorExecutable(preference);
        return executable ? { editor: preference, executable } : null;
      })();

  if (!selected) {
    if (preference !== "auto") throw new Error(`${EDITORS[preference].label} is not installed or its command is unavailable`);
    const error = await shell.openPath(target.filePath);
    if (error) throw new Error(error);
    return;
  }

  const location = target.line === null
    ? target.filePath
    : `${target.filePath}:${target.line}${target.column === null ? "" : `:${target.column}`}`;
  await launch(selected.executable, EDITORS[selected.editor].args(location));
}

export async function openMarkdownLink(cwd: string, href: string, editor: EditorPreference): Promise<void> {
  if (typeof cwd !== "string" || !cwd || typeof href !== "string" || !href) throw new Error("Invalid link");

  let url: URL | null = null;
  try {
    url = new URL(href);
  } catch {
    // Relative and absolute filesystem paths are intentionally not URLs.
  }
  if (url && WEB_PROTOCOLS.has(url.protocol)) {
    await shell.openExternal(url.toString());
    return;
  }

  const target = await resolveWorkspaceFile(cwd, href);
  await openFile(target, editor);
}
