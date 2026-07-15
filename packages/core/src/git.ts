import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DiffStats } from "./types.js";

const run = promisify(execFile);

/**
 * Read-only git helpers. Stereo never touches the user's index, branches, or
 * commits — VS Code is the review surface and the user owns every commit. So:
 * no `git add`, no `git stash`, nothing that mutates state.
 */
async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd, timeout: 15_000, maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    return (await git(cwd, ["rev-parse", "--is-inside-work-tree"])).trim() === "true";
  } catch {
    return false;
  }
}

async function untrackedFiles(cwd: string): Promise<string[]> {
  const out = await git(cwd, ["ls-files", "--others", "--exclude-standard"]).catch(() => "");
  return out.split("\n").filter((f) => f.trim().length > 0);
}

/** Uncommitted state of the tree (tracked changes vs HEAD + untracked files). */
export async function diffStats(cwd: string): Promise<DiffStats | null> {
  if (!(await isGitRepo(cwd))) return null;
  let filesChanged = 0;
  let additions = 0;
  let deletions = 0;
  try {
    // --numstat is machine-readable: "added<TAB>deleted<TAB>path" per file.
    const out = await git(cwd, ["diff", "--numstat", "HEAD"]);
    for (const line of out.split("\n")) {
      const [a, d] = line.split("\t");
      if (a === undefined || d === undefined) continue;
      filesChanged += 1;
      additions += Number.parseInt(a, 10) || 0;
      deletions += Number.parseInt(d, 10) || 0;
    }
  } catch {
    // Repo with no commits yet: no HEAD to diff against. Untracked still counts.
  }
  const untracked = await untrackedFiles(cwd);
  filesChanged += untracked.length;
  return { filesChanged, additions, deletions };
}

const MAX_UNTRACKED_IN_DIFF = 25;

/** Full uncommitted diff — tracked changes plus untracked files as new-file diffs. */
export async function diffText(cwd: string, maxChars: number): Promise<string> {
  if (!(await isGitRepo(cwd))) return "";
  let text = await git(cwd, ["diff", "--no-color", "HEAD"]).catch(() => "");
  const untracked = await untrackedFiles(cwd);
  for (const file of untracked.slice(0, MAX_UNTRACKED_IN_DIFF)) {
    if (text.length >= maxChars) break;
    // --no-index exits 1 when the files differ, which promisified execFile
    // reports as an error that still carries stdout.
    try {
      text += await git(cwd, ["diff", "--no-color", "--no-index", "--", "/dev/null", file]);
    } catch (error) {
      const stdout = (error as { stdout?: string }).stdout;
      if (typeof stdout === "string") text += stdout;
    }
  }
  if (untracked.length > MAX_UNTRACKED_IN_DIFF) {
    text += `\n[${untracked.length - MAX_UNTRACKED_IN_DIFF} more untracked files omitted]\n`;
  }
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}\n[diff truncated]`;
  }
  return text;
}
