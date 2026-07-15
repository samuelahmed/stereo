import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentStatusInfo } from "../types.js";
import { CLAUDE_EFFORTS, CLAUDE_MODELS, CODEX_EFFORTS, CODEX_MODELS } from "../catalog.js";

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
  const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);
  return {
    agent: "claude",
    installed: v !== null,
    version: v,
    auth: v === null ? null : hasApiKey ? "API key in env" : "Claude login",
    models: CLAUDE_MODELS,
    efforts: CLAUDE_EFFORTS,
  };
}

// Reasoning levels, ordered lightest→heaviest, so a per-model union renders sensibly.
const EFFORT_ORDER = ["minimal", "low", "medium", "high", "xhigh"];

interface CodexDebugModel {
  slug?: unknown;
  display_name?: unknown;
  visibility?: unknown;
  supported_reasoning_levels?: unknown;
}

/**
 * Ask the codex CLI for its own model catalog so the picker offers exactly the
 * models this install accepts — never a stale or invalid hardcoded id. `codex
 * debug models` prints one JSON document; we keep only user-visible entries
 * and take the union of their supported reasoning levels for the effort list.
 * Returns null on any failure so the caller falls back to the static catalog.
 */
async function codexCatalog(): Promise<Pick<AgentStatusInfo, "models" | "efforts"> | null> {
  try {
    const { stdout } = await run("codex", ["debug", "models"], { timeout: 15_000, maxBuffer: 64 * 1024 * 1024 });
    const parsed = JSON.parse(stdout) as { models?: CodexDebugModel[] };
    const visible = (parsed.models ?? []).filter(
      (m): m is CodexDebugModel & { slug: string } => m.visibility === "list" && typeof m.slug === "string",
    );
    if (visible.length === 0) return null;

    const models = [
      { value: null as string | null, label: "CLI default" },
      ...visible.map((m) => ({ value: m.slug, label: typeof m.display_name === "string" ? m.display_name : m.slug })),
    ];

    const seen = new Set<string>();
    for (const m of visible) {
      const levels = Array.isArray(m.supported_reasoning_levels) ? m.supported_reasoning_levels : [];
      for (const lvl of levels) {
        const effort = (lvl as { effort?: unknown }).effort;
        if (typeof effort === "string") seen.add(effort);
      }
    }
    const efforts: (string | null)[] = [null, ...EFFORT_ORDER.filter((e) => seen.has(e))];

    return { models, efforts: efforts.length > 1 ? efforts : CODEX_EFFORTS };
  } catch {
    return null;
  }
}

export async function detectCodex(): Promise<AgentStatusInfo> {
  const v = await version("codex");
  let auth: string | null = null;
  if (v !== null) {
    const authFile = path.join(os.homedir(), ".codex", "auth.json");
    auth = fs.existsSync(authFile) ? "ChatGPT login" : "not logged in";
  }
  const catalog = v !== null ? await codexCatalog() : null;
  return {
    agent: "codex",
    installed: v !== null,
    version: v,
    auth,
    // Live CLI catalog first, then any statically-known models it doesn't
    // list — newly documented model IDs stay selectable when the installed
    // CLI's catalog lags behind.
    models: catalog ? mergeModels(catalog.models, CODEX_MODELS) : CODEX_MODELS,
    efforts: catalog?.efforts ?? CODEX_EFFORTS,
  };
}

function mergeModels(
  live: { value: string | null; label: string }[],
  fallback: { value: string | null; label: string }[],
): { value: string | null; label: string }[] {
  const seen = new Set(live.map((m) => m.value));
  return [...live, ...fallback.filter((m) => !seen.has(m.value))];
}
