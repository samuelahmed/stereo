import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ConfigScope, ConfigSource, ExtensionInfo, Project, ProjectInspection } from "./types.js";

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

function discoverNamedChildren(
  root: string,
  harness: ExtensionInfo["harness"],
  kind: ExtensionInfo["kind"],
): ExtensionInfo[] {
  try {
    return fs.readdirSync(root, { withFileTypes: true }).map((entry) => ({
      id: `${harness}:${kind}:${path.join(root, entry.name)}`,
      harness,
      kind,
      name: entry.name,
      source: path.join(root, entry.name),
      enabled: true,
      detail: entry.isDirectory() ? "Directory" : readableSummary(path.join(root, entry.name)),
    }));
  } catch {
    return [];
  }
}

function configMentions(file: string, pattern: RegExp): boolean {
  try {
    return pattern.test(fs.readFileSync(file, "utf8"));
  } catch {
    return false;
  }
}

function namedMcpServers(file: string, harness: ExtensionInfo["harness"]): ExtensionInfo[] {
  try {
    const content = fs.readFileSync(file, "utf8");
    let names: string[] = [];
    if (file.endsWith(".json")) {
      const parsed = JSON.parse(content) as { mcpServers?: Record<string, unknown> };
      names = Object.keys(parsed.mcpServers ?? {});
    } else {
      names = [...content.matchAll(/^\s*\[mcp_servers\.([^.\]\s]+)\]/gm)].map((match) => match[1]!).filter(Boolean);
    }
    return names.map((name) => ({ id: `${harness}:mcp:${file}:${name}`, harness, kind: "mcp", name, source: file, enabled: true, detail: "Configured MCP server" }));
  } catch {
    return [];
  }
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

  const extensions: ExtensionInfo[] = [
    ...discoverNamedChildren(path.join(home, ".claude", "skills"), "claude", "skill"),
    ...discoverNamedChildren(path.join(project.cwd, ".claude", "skills"), "claude", "skill"),
    ...discoverNamedChildren(path.join(home, ".codex", "skills"), "codex", "skill"),
    ...discoverNamedChildren(path.join(project.cwd, ".codex", "skills"), "codex", "skill"),
    ...discoverNamedChildren(path.join(home, ".codex", "plugins"), "codex", "plugin"),
    ...namedMcpServers(sharedMcp, "claude"),
    ...namedMcpServers(claudeUser, "claude"),
    ...namedMcpServers(claudeProject, "claude"),
    ...namedMcpServers(claudeLocal, "claude"),
    ...namedMcpServers(codexUser, "codex"),
    ...namedMcpServers(codexProject, "codex"),
  ];
  for (const [harness, file] of [["claude", claudeUser], ["claude", claudeProject], ["claude", claudeLocal], ["codex", codexUser], ["codex", codexProject]] as const) {
    if (configMentions(file, /mcp/i) && !extensions.some((item) => item.kind === "mcp" && item.source === file)) extensions.push({ id: `${harness}:mcp:${file}`, harness, kind: "mcp", name: "MCP configuration", source: file, enabled: true, detail: "Defined in configuration" });
    if (configMentions(file, /hook/i)) extensions.push({ id: `${harness}:hook:${file}`, harness, kind: "hook", name: "Hooks", source: file, enabled: true, detail: "Defined in configuration" });
  }
  for (const item of sources.filter((candidate) => candidate.exists && candidate.id.includes("instructions"))) {
    extensions.push({ id: `instruction:${item.path}`, harness: item.harness === "shared" ? "codex" : item.harness, kind: "instruction", name: item.label, source: item.path, enabled: true, detail: item.summary });
  }

  const warnings: string[] = [];
  if (sources.some((item) => item.scope === "local" && item.exists)) warnings.push("Local settings override project settings on this machine.");
  if (!sources.some((item) => item.scope === "project" && item.exists)) warnings.push("No repository-level harness configuration was found; both CLIs use user defaults.");
  return { project, sources, extensions, warnings };
}
