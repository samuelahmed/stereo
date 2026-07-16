import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AGENT_MODELS } from "../models.js";
import type { AgentModelInfo, AgentStatusInfo } from "../types.js";

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
    models: AGENT_MODELS.claude.map((model) => ({ ...model, efforts: [...model.efforts] })),
  };
}

type CodexCatalogModel = {
  slug?: unknown;
  visibility?: unknown;
  supported_reasoning_levels?: Array<{ effort?: unknown }>;
};

async function codexModels(): Promise<AgentModelInfo[]> {
  const fallback = AGENT_MODELS.codex.map((model) => ({ ...model, efforts: [...model.efforts] }));
  try {
    const { stdout } = await run("codex", ["debug", "models"], { timeout: 10_000, maxBuffer: 2 * 1024 * 1024 });
    const parsed = JSON.parse(stdout) as CodexCatalogModel[] | { models?: CodexCatalogModel[] };
    const catalog = Array.isArray(parsed) ? parsed : parsed.models;
    if (!Array.isArray(catalog)) return fallback;
    return fallback.map((model) => {
      const detected = catalog.find((candidate) => candidate.slug === model.id && candidate.visibility !== "hide");
      if (!detected) return model;
      const supported = (detected.supported_reasoning_levels ?? [])
        .map((level) => level.effort)
        .filter((effort): effort is string => typeof effort === "string" && model.efforts.includes(effort));
      return supported.length > 0 ? { ...model, efforts: supported } : model;
    });
  } catch {
    return fallback;
  }
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
    models: v === null ? AGENT_MODELS.codex.map((model) => ({ ...model, efforts: [...model.efforts] })) : await codexModels(),
  };
}
