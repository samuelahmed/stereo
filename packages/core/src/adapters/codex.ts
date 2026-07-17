import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import type { AgentSelection, PermissionMode, TokenUsage } from "../types.js";
import type { AgentAdapter, TurnCallbacks, TurnHandle, TurnOptions, TurnResult } from "./types.js";
import { childEnv } from "./env.js";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (typeof v === "object" && v !== null ? (v as Rec) : {});

const GENERATED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const MAX_GENERATED_IMAGE_BYTES = 15 * 1024 * 1024;

interface GeneratedImageSnapshot {
  path: string;
  fingerprint: string;
  modifiedAt: number;
}

function codexHome(): string {
  const configured = process.env.CODEX_HOME;
  return configured && path.isAbsolute(configured) ? configured : path.join(os.homedir(), ".codex");
}

function generatedImagesDir(sessionId: string): string | null {
  // Session ids are provider data. Refuse separators before using one as a
  // directory component so a malformed event cannot broaden the scan.
  if (!sessionId || path.basename(sessionId) !== sessionId || sessionId.includes("\\")) return null;
  return path.join(codexHome(), "generated_images", sessionId);
}

function generatedImageSnapshot(sessionId: string): GeneratedImageSnapshot[] {
  const directory = generatedImagesDir(sessionId);
  if (!directory) return [];
  let realRoot: string;
  let realDirectory: string;
  let names: string[];
  try {
    realRoot = fs.realpathSync(path.dirname(directory));
    const directoryStat = fs.lstatSync(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) return [];
    realDirectory = fs.realpathSync(directory);
    if (path.dirname(realDirectory) !== realRoot) return [];
    names = fs.readdirSync(realDirectory);
  } catch {
    return [];
  }

  const snapshots: GeneratedImageSnapshot[] = [];
  for (const name of names) {
    if (!GENERATED_IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase())) continue;
    const candidate = path.join(realDirectory, name);
    try {
      const stat = fs.lstatSync(candidate);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_GENERATED_IMAGE_BYTES) continue;
      const realFile = fs.realpathSync(candidate);
      const relative = path.relative(realDirectory, realFile);
      if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) continue;
      snapshots.push({
        path: realFile,
        fingerprint: `${stat.size}:${stat.mtimeMs}`,
        modifiedAt: stat.mtimeMs,
      });
    } catch {
      // A file may still be moving into place while generation completes.
    }
  }
  return snapshots.sort((a, b) => a.modifiedAt - b.modifiedAt || a.path.localeCompare(b.path));
}

function specArgs(spec: AgentSelection): string[] {
  const args: string[] = [];
  if (spec.model) args.push("-m", spec.model);
  if (spec.effort) args.push("-c", `model_reasoning_effort=${JSON.stringify(spec.effort)}`);
  return args;
}

/** Human-readable one-liner for a codex item. */
function itemDetail(item: Rec): string {
  if (typeof item.command === "string") return item.command.slice(0, 200);
  if (typeof item.query === "string") return item.query.slice(0, 200);
  if (Array.isArray(item.changes)) {
    const paths = (item.changes as unknown[]).map((c) => String(rec(c).path ?? "")).filter(Boolean);
    return paths.slice(0, 4).join(", ") + (paths.length > 4 ? ` +${paths.length - 4} more` : "");
  }
  if (typeof item.tool === "string") return item.tool;
  return "";
}

/**
 * Runs `codex exec --json` and folds the JSONL event stream into the turn
 * callbacks. Event shapes have drifted across Codex releases, so extraction is
 * duck-typed: any object carrying {input_tokens, output_tokens} counts as
 * usage; any completed item with agent text counts as a message. Codex has no
 * token-level deltas — item-level events are its native liveness, same as its
 * own CLI shows.
 */
export function codexAdapter(spec: AgentSelection, permission: PermissionMode): AgentAdapter {
  if (permission === "ask") throw new Error("Interactive approvals are not available through Codex exec yet");
  return {
    agent: "codex",
    startTurn(prompt: string, opts: TurnOptions, cb: TurnCallbacks): TurnHandle {
      const base = ["exec", "--json", "--color", "never", "-C", opts.cwd, "--skip-git-repo-check", ...specArgs(spec)];
      const sandbox = ["-s", permission === "read-only" ? "read-only" : "workspace-write"];
      const args = opts.resumeSessionId
        ? [...base, ...sandbox, "resume", opts.resumeSessionId, prompt]
        : [...base, ...sandbox, prompt];

      const child = spawn("codex", args, {
        cwd: opts.cwd,
        env: childEnv(),
        stdio: ["ignore", "pipe", "pipe"],
      });

      let interrupted = false;
      let sessionLost = false;
      let observedSessionId = opts.resumeSessionId;
      let generatedBefore = new Map<string, string>();
      const emittedArtifacts = new Set<string>();

      const beginArtifactScan = (sessionId: string): void => {
        if (observedSessionId === sessionId && generatedBefore.size > 0) return;
        observedSessionId = sessionId;
        generatedBefore = new Map(generatedImageSnapshot(sessionId).map((file) => [file.path, file.fingerprint]));
      };
      if (opts.resumeSessionId) beginArtifactScan(opts.resumeSessionId);

      const emitGeneratedArtifacts = (): void => {
        if (!observedSessionId) return;
        for (const file of generatedImageSnapshot(observedSessionId)) {
          if (generatedBefore.get(file.path) === file.fingerprint || emittedArtifacts.has(file.path)) continue;
          emittedArtifacts.add(file.path);
          cb.onArtifact(file.path);
        }
      };

      const done = new Promise<TurnResult>((resolve, reject) => {
        let threadId = opts.resumeSessionId;
        let usage: TokenUsage | null = null;
        let turnError: string | null = null;
        let stderrTail = "";

        const scanForUsage = (node: unknown): void => {
          const r = rec(node);
          if (typeof r.input_tokens === "number" && typeof r.output_tokens === "number") {
            usage = { inputTokens: r.input_tokens, outputTokens: r.output_tokens };
            return;
          }
          for (const value of Object.values(r)) {
            if (typeof value === "object" && value !== null) scanForUsage(value);
          }
        };

        const handleEvent = (event: Rec): void => {
          const id = event.thread_id ?? rec(event.thread).id ?? event.session_id;
          if (typeof id === "string") {
            if (opts.resumeSessionId && id !== opts.resumeSessionId && !sessionLost) {
              // Codex started a different thread than the one we asked it to
              // resume — the old rollout is gone. Stop before tokens are spent;
              // the engine rebuilds context from the transcript and retries.
              sessionLost = true;
              child.kill("SIGTERM");
              return;
            }
            threadId = id;
            if (observedSessionId !== id) beginArtifactScan(id);
          }

          if (event.type === "error" && typeof event.message === "string") turnError = event.message;
          if (event.type === "turn.failed") {
            const msg = rec(event.error).message;
            turnError = typeof msg === "string" ? msg : "codex turn failed";
          }

          const item = rec(event.item);
          const itemType = item.item_type ?? item.type;
          const phase = String(event.type ?? "");
          if (typeof itemType === "string") {
            if ((itemType === "agent_message" || itemType === "assistant_message") && phase.endsWith("completed")) {
              if (typeof item.text === "string" && item.text.trim()) {
                cb.onText(item.text);
              }
            } else if (itemType.includes("command") && phase.endsWith("started")) {
              // Show commands as they start, not after they finish — live feel.
              cb.onTool("bash", itemDetail(item));
            } else if (
              (itemType.includes("patch") || itemType.includes("file") || itemType.includes("search") || itemType.includes("tool")) &&
              phase.endsWith("completed")
            ) {
              cb.onTool(itemType.includes("search") ? "search" : "edit", itemDetail(item));
            }
          }
          scanForUsage(event);
        };

        createInterface({ input: child.stdout }).on("line", (line) => {
          const trimmed = line.trim();
          if (!trimmed.startsWith("{")) return;
          try {
            handleEvent(rec(JSON.parse(trimmed)));
          } catch {
            // non-JSON noise on stdout; ignore
          }
        });

        child.stderr.on("data", (chunk: Buffer) => {
          stderrTail = (stderrTail + chunk.toString()).slice(-2000);
        });

        child.on("error", reject);
        child.on("close", (code) => {
          // Built-in image generation currently persists files under the
          // native Codex session but does not expose them as ordinary text or
          // tool items in `codex exec --json`. Import only files added by this
          // turn; the engine copies them into Stereo-managed storage.
          emitGeneratedArtifacts();
          if (sessionLost) {
            resolve({ sessionId: undefined, interrupted: false, sessionLost: true });
          } else if (interrupted) {
            // Codex persists its rollout incrementally, so the thread on disk
            // survives the kill and `codex exec resume` continues it.
            resolve({ sessionId: threadId, interrupted: true });
          } else if (turnError !== null) {
            reject(new Error(`codex turn failed: ${turnError}`));
          } else if (code !== 0) {
            reject(new Error(`codex exited with code ${code}: ${stderrTail}`));
          } else {
            if (usage) cb.onUsage(usage);
            resolve({ sessionId: threadId, interrupted: false });
          }
        });
      });

      return {
        interrupt: () => {
          interrupted = true;
          child.kill("SIGTERM");
        },
        done,
      };
    },
  };
}
