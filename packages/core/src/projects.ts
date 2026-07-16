import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ConfigScope, ConfigSource, Project, ProjectInspection } from "./types.js";

export function projectId(cwd: string): string {
  return crypto.createHash("sha256").update(path.resolve(cwd)).digest("hex").slice(0, 20);
}

export function makeProject(cwd: string): Project {
  const resolved = path.resolve(cwd);
  const now = new Date().toISOString();
  return {
    id: projectId(resolved),
    name: path.basename(resolved) || resolved,
    cwd: resolved,
    createdAt: now,
    updatedAt: now,
    defaults: { agent: null, permission: null },
  };
}

function readableSummary(file: string): string {
  try {
    const stat = fs.statSync(file);
    if (stat.isDirectory()) return `${fs.readdirSync(file).length} item${fs.readdirSync(file).length === 1 ? "" : "s"}`;
    const content = fs.readFileSync(file, "utf8");
    return `${content.split("\n").length} lines · ${Math.ceil(stat.size / 1024)} KB`;
  } catch {
    return "Not configured";
  }
}

function source(
  id: string,
  harness: ConfigSource["harness"],
  scope: ConfigScope,
  label: string,
  file: string,
): ConfigSource {
  const exists = fs.existsSync(file);
  return { id, harness, scope, label, path: file, exists, summary: readableSummary(file) };
}

/** Read-only, provenance-first view of configuration the native CLIs load. */
export function inspectProject(project: Project): ProjectInspection {
  const home = os.homedir();
  const codexUser = path.join(home, ".codex", "config.toml");
  const codexProject = path.join(project.cwd, ".codex", "config.toml");
  const claudeUser = path.join(home, ".claude", "settings.json");
  const claudeProject = path.join(project.cwd, ".claude", "settings.json");
  const claudeLocal = path.join(project.cwd, ".claude", "settings.local.json");
  const sharedMcp = path.join(project.cwd, ".mcp.json");
  const sources: ConfigSource[] = [
    source("claude-user", "claude", "user", "Claude user settings", claudeUser),
    source("claude-project", "claude", "project", "Claude project settings", claudeProject),
    source("claude-local", "claude", "local", "Claude local settings", claudeLocal),
    source("claude-instructions", "claude", "project", "Claude instructions", path.join(project.cwd, "CLAUDE.md")),
    source("claude-mcp", "claude", "project", "Project MCP servers", sharedMcp),
    source("codex-user", "codex", "user", "Codex user config", codexUser),
    source("codex-project", "codex", "project", "Codex project config", codexProject),
    source("agents-instructions", "shared", "project", "Repository instructions", path.join(project.cwd, "AGENTS.md")),
  ];

  const warnings: string[] = [];
  if (sources.some((item) => item.scope === "local" && item.exists)) warnings.push("Local settings override project settings on this machine.");
  return { project, sources, warnings };
}
