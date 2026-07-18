import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Apps opened by Launch Services do not inherit the user's interactive shell
 * PATH. Read it once at startup so npm, pnpm, Homebrew, and local CLI installs
 * remain discoverable when Stereo is launched from Finder.
 */
export function restoreMacShellPath(): void {
  if (process.platform !== "darwin") return;

  const configuredShell = process.env.SHELL;
  const shell = configuredShell && path.isAbsolute(configuredShell) && fs.existsSync(configuredShell)
    ? configuredShell
    : "/bin/zsh";

  try {
    const output = execFileSync(shell, ["-ilc", "printf '__STEREO_PATH__=%s\\n' \"$PATH\""], {
      encoding: "utf8",
      env: process.env,
      timeout: 10_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const marker = "__STEREO_PATH__=";
    const line = output
      .split(/\r?\n/)
      .reverse()
      .find((candidate) => candidate.startsWith(marker));
    const resolved = line?.slice(marker.length).trim();
    if (resolved) process.env.PATH = resolved;
  } catch {
    // Keep Electron's inherited PATH. Detection will surface missing harnesses
    // normally instead of making shell startup configuration fatal.
  }
}
