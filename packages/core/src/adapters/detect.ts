import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentStatusInfo } from "../types.js";

const run = promisify(execFile);

async function version(bin: string): Promise<string | null> {
  try {
    const { stdout } = await run(bin, ["--version"], { timeout: 10_000 });
    return stdout.trim().split("\n")[0] ?? null;
  } catch {
    return null;
  }
}

export async function detectClaude(): Promise<AgentStatusInfo> {
  const v = await version("claude");
  return {
    agent: "claude",
    installed: v !== null,
    version: v,
    auth: v === null ? null : "Claude login",
  };
}

export async function detectCodex(): Promise<AgentStatusInfo> {
  const v = await version("codex");
  let auth: string | null = null;
  if (v !== null) {
    const authFile = path.join(os.homedir(), ".codex", "auth.json");
    auth = fs.existsSync(authFile) ? "ChatGPT login" : "not logged in";
  }
  return {
    agent: "codex",
    installed: v !== null,
    version: v,
    auth,
  };
}
