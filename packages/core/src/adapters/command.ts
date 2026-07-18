import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const WINDOWS_SHIM = Symbol("windows-command-shim");
type TaggedChild = ChildProcess & { [WINDOWS_SHIM]?: boolean };

function pathKey(env: NodeJS.ProcessEnv): string {
  return Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
}

function searchDirectories(env: NodeJS.ProcessEnv): string[] {
  const home = os.homedir();
  const key = pathKey(env);
  const directories = (env[key] ?? "").split(path.delimiter).filter(Boolean);
  const add = (directory: string | undefined) => {
    if (directory) directories.push(directory);
  };

  if (process.platform === "win32") {
    add(env.APPDATA ? path.join(env.APPDATA, "npm") : undefined);
    add(env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "Programs") : undefined);
    // Claude's native Windows installer uses ~/.local/bin. GUI apps often
    // inherit a stale PATH (or no shell PATH at all), so search it explicitly.
    add(path.join(home, ".local", "bin"));
  } else {
    add(path.join(home, ".local", "bin"));
    add(path.join(home, ".npm-global", "bin"));
    add(path.join(home, ".bun", "bin"));
    add(path.join(home, ".volta", "bin"));
    add(path.join(home, ".local", "share", "fnm", "aliases", "default", "bin"));
    add("/usr/local/bin");
    if (process.platform === "darwin") add("/opt/homebrew/bin");
    if (process.platform === "linux") add("/snap/bin");

    const nvmVersions = path.join(env.NVM_DIR ?? path.join(home, ".nvm"), "versions", "node");
    try {
      const versions = fs.readdirSync(nvmVersions).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const version of versions) add(path.join(nvmVersions, version, "bin"));
    } catch {
      // NVM is optional.
    }
  }

  const seen = new Set<string>();
  return directories.filter((directory) => {
    const normalized = process.platform === "win32" ? directory.toLowerCase() : directory;
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function optionsWithSearchPath(options: SpawnOptions): SpawnOptions {
  const env = { ...(options.env ?? process.env) };
  env[pathKey(env)] = searchDirectories(env).join(path.delimiter);
  return { ...options, env };
}

function optionsForExecutable(options: SpawnOptions, resolved: string): SpawnOptions {
  if (!path.isAbsolute(resolved)) return options;
  const env = { ...(options.env ?? process.env) };
  const key = pathKey(env);
  const directory = path.dirname(resolved);
  const existing = (env[key] ?? "").split(path.delimiter).filter((candidate) => candidate !== directory);
  env[key] = [directory, ...existing].join(path.delimiter);
  return { ...options, env };
}

function executable(command: string, env: NodeJS.ProcessEnv): string {
  if (path.isAbsolute(command) || command.includes("/") || command.includes("\\")) return command;
  const extensions = process.platform === "win32"
    ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""];
  const hasExtension = process.platform === "win32" && path.extname(command).length > 0;
  for (const directory of searchDirectories(env)) {
    const candidates = hasExtension
      ? [path.join(directory, command)]
      : extensions.map((extension) => path.join(directory, `${command}${extension}`));
    for (const candidate of candidates) {
      try {
        fs.accessSync(candidate, process.platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK);
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // Keep searching the augmented desktop-app PATH.
      }
    }
  }
  return command;
}

/** Resolve a command using the desktop app's augmented PATH. */
export function resolveCommand(command: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const resolved = executable(command, optionsWithSearchPath({ env }).env ?? env);
  return path.isAbsolute(resolved) ? resolved : null;
}

// cmd.exe metacharacters, per Rob van der Woude's list — the same set
// cross-spawn escapes. Includes the space so an unquoted shim path with
// spaces survives cmd.exe's /s quote stripping.
const CMD_META_CHARS = /([()\][%!^"`<>&|;, *?])/g;

/** Caret-escape a batch-file path for the cmd.exe command line. */
function escapeCmdCommand(command: string): string {
  return command.replace(CMD_META_CHARS, "^$1");
}

/**
 * Escape one argument for a batch file run through `cmd.exe /d /s /c`.
 * First apply CommandLineToArgvW backslash/quote rules, then caret-escape
 * twice: a batch file's command line passes through cmd.exe's parser twice
 * (once for the shim invocation, once inside the shim's own expansion).
 * This is cross-spawn's escaping algorithm with the classical backslash
 * regexes: they double ALL trailing backslashes (cross-spawn 7.0.6's
 * ReDoS-hardened variants leave an unterminated quote for two or more), and
 * their worst-case quadratic backtracking is irrelevant here because every
 * argument is a short, locally sourced flag, model name, or validated
 * session id.
 */
function escapeCmdArgument(argument: string): string {
  let escaped = argument.replace(/(\\*)"/g, '$1$1\\"');
  escaped = escaped.replace(/(\\*)$/, "$1$1");
  escaped = `"${escaped}"`;
  return escaped.replace(CMD_META_CHARS, "^$1").replace(CMD_META_CHARS, "^$1");
}

/**
 * Spawn a native command without a shell on Unix. On Windows, npm exposes CLI
 * packages as .cmd shims, which CreateProcess cannot execute directly; route
 * only those shims through cmd.exe. The whole invocation is built as a single
 * pre-escaped command line passed verbatim: letting Node quote the pieces
 * breaks under `/s` (cmd strips the first and last quote on the line, so a
 * shim path containing a space — any `C:\Users\First Last\...` npm prefix —
 * stops parsing at the space) and leaves cmd metacharacters in arguments
 * uninterpreted-by-Node but live-in-cmd. Callers should keep arguments
 * structured and must not build a command string themselves.
 */
export function spawnCommand(command: string, args: string[], options: SpawnOptions): ChildProcess {
  const searchOptions = optionsWithSearchPath(options);
  const resolved = executable(command, searchOptions.env ?? process.env);
  const spawnOptions = optionsForExecutable(searchOptions, resolved);
  if (process.platform !== "win32" || !/\.(?:cmd|bat)$/i.test(resolved)) return spawn(resolved, args, spawnOptions);
  const commandLine = [escapeCmdCommand(path.normalize(resolved)), ...args.map(escapeCmdArgument)].join(" ");
  const child = spawn(
    process.env.ComSpec ?? "cmd.exe",
    ["/d", "/s", "/c", `"${commandLine}"`],
    { ...spawnOptions, windowsVerbatimArguments: true },
  ) as TaggedChild;
  child[WINDOWS_SHIM] = true;
  return child;
}

/** Terminate the command and, for a Windows shim, its spawned process tree. */
export function terminateCommand(child: ChildProcess): void {
  if (process.platform === "win32" && (child as TaggedChild)[WINDOWS_SHIM] && child.pid) {
    const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
    killer.once("error", () => child.kill("SIGTERM"));
    killer.unref();
    return;
  }
  child.kill("SIGTERM");
}

export async function commandOutput(
  command: string,
  args: string[],
  options: SpawnOptions & { timeout?: number; maxBuffer?: number } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    const maxBuffer = options.maxBuffer ?? 1024 * 1024;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve(Buffer.concat(stdout).toString("utf8"));
    };
    const collect = (target: Buffer[], chunk: Buffer) => {
      if (settled) return;
      outputBytes += chunk.length;
      if (outputBytes > maxBuffer) {
        terminateCommand(child);
        finish(new Error(`${command} produced more than ${maxBuffer} bytes`));
        return;
      }
      target.push(chunk);
    };
    child.stdout?.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr?.on("data", (chunk: Buffer) => collect(stderr, chunk));
    child.once("error", finish);
    child.once("close", (code, signal) => {
      if (code === 0) finish();
      else finish(new Error(`${command} exited with ${code ?? signal ?? "an unknown status"}: ${Buffer.concat(stderr).toString("utf8").trim()}`));
    });
    const timer = options.timeout
      ? setTimeout(() => {
          terminateCommand(child);
          finish(new Error(`${command} timed out after ${options.timeout}ms`));
        }, options.timeout)
      : null;
  });
}
