import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs";
import path from "node:path";
import type { AgentSelection, PermissionMode } from "../types.js";
import { resolveCommand } from "./command.js";
import type { AgentAdapter, TurnCallbacks, TurnHandle, TurnOptions, TurnResult } from "./types.js";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (typeof v === "object" && v !== null ? (v as Rec) : {});

const READ_TOOLS = ["Read", "Glob", "Grep", "WebFetch", "WebSearch", "TodoWrite"];
const WRITE_TOOLS = ["Edit", "Write", "Bash", "NotebookEdit"];
const TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];

function claudeExecutable(): string | null {
  const resolved = resolveCommand("claude");
  if (!resolved || process.platform !== "win32" || !/\.(?:cmd|bat)$/i.test(resolved)) return resolved;

  // The SDK launches the supplied path directly, so a Windows npm .cmd shim
  // cannot be used here. Point it at the shim's adjacent JS entrypoint; the
  // SDK recognizes .js and launches it with Node itself.
  const npmEntrypoint = path.join(path.dirname(resolved), "node_modules", "@anthropic-ai", "claude-code", "cli.js");
  return fs.existsSync(npmEntrypoint) ? npmEntrypoint : resolved;
}

/** Human-readable one-liner for a tool call — what Claude Code's own UI shows. */
function toolDetail(name: string, input: unknown): string {
  const r = rec(input);
  switch (name) {
    case "Bash":
      return String(r.command ?? "").slice(0, 200);
    case "Read":
    case "Edit":
    case "Write":
      return String(r.file_path ?? "");
    case "NotebookEdit":
      return String(r.notebook_path ?? "");
    case "Glob":
    case "Grep":
      return String(r.pattern ?? "");
    case "WebFetch":
      return String(r.url ?? "");
    case "WebSearch":
      return String(r.query ?? "");
    case "TodoWrite":
      return "updated plan";
    default: {
      const first = Object.values(r).find((v) => typeof v === "string");
      return typeof first === "string" ? first.slice(0, 120) : "";
    }
  }
}

export function claudeAdapter(spec: AgentSelection, permission: PermissionMode): AgentAdapter {
  return {
    agent: "claude",
    startTurn(prompt: string, opts: TurnOptions, cb: TurnCallbacks): TurnHandle {
      // Use the same native Claude CLI that Settings detects. The SDK's
      // optional platform binary is not dependable once pnpm dependencies are
      // packaged into asar, and could be omitted from a release artifact.
      const executable = claudeExecutable();
      if (!executable) {
        throw new Error("Claude CLI was not found. Install Claude Code, then restart Stereo so it can detect the new executable.");
      }
      const abort = new AbortController();
      let endInput: () => void = () => {};
      const inputDone = new Promise<void>((resolve) => {
        endInput = resolve;
      });

      // Streaming-input mode: the message goes out immediately, but the input
      // stream stays open until the turn finishes. That is what makes the
      // SDK's graceful interrupt() available — the same Esc the interactive
      // CLI has — which finalizes the session file so the next turn can
      // actually resume it. A hard abort mid-turn leaves a session the CLI
      // silently refuses to resume.
      async function* input(): AsyncGenerator<SDKUserMessage> {
        yield { type: "user", message: { role: "user", content: prompt }, parent_tool_use_id: null } as SDKUserMessage;
        await inputDone;
      }

      const q = query({
        prompt: input(),
        options: {
          cwd: opts.cwd,
          // Read-only must hold even if plan mode's own enforcement doesn't:
          // allowedTools entries are allow rules that pre-approve tools, so a
          // read-only turn must never list Bash/Edit/Write there, and
          // disallowedTools hard-blocks them at the harness level.
          allowedTools: permission === "workspace-write" ? TOOLS : READ_TOOLS,
          ...(permission === "read-only" ? { disallowedTools: WRITE_TOOLS } : {}),
          permissionMode: permission === "read-only" ? "plan" : permission === "ask" ? "default" : "acceptEdits",
          ...(permission === "ask" ? {
            canUseTool: async (toolName: string, toolInput: Record<string, unknown>, permissionOptions: { title?: string; description?: string; toolUseID: string }) => {
              const allowed = await cb.onPermission(
                toolName,
                toolInput,
                permissionOptions.title ?? permissionOptions.description ?? toolDetail(toolName, toolInput),
              );
              return allowed
                ? { behavior: "allow" as const, updatedInput: toolInput, toolUseID: permissionOptions.toolUseID }
                : { behavior: "deny" as const, message: "The user denied this action.", toolUseID: permissionOptions.toolUseID };
            },
          } : {}),
          includePartialMessages: true,
          abortController: abort,
          pathToClaudeCodeExecutable: executable,
          ...(spec.model ? { model: spec.model } : {}),
          ...(spec.effort ? { extraArgs: { effort: spec.effort } } : {}),
          ...(opts.resumeSessionId ? { resume: opts.resumeSessionId } : {}),
        },
      });

      let interruptRequested = false;
      let sessionLost = false;

      const done = (async (): Promise<TurnResult> => {
        let sessionId = opts.resumeSessionId;
        let receivedMessage = false;
        let receivedResult = false;
        try {
          for await (const raw of q) {
            const m = rec(raw);
            receivedMessage = true;

            if (m.type === "system" && m.subtype === "init") {
              const sid = typeof m.session_id === "string" ? m.session_id : undefined;
              if (opts.resumeSessionId && sid && sid !== opts.resumeSessionId) {
                // The CLI couldn't load the old session and silently started a
                // fresh one instead of resuming. Bail out before tokens are
                // spent — the engine rebuilds context from the transcript and
                // retries.
                sessionLost = true;
                endInput();
                abort.abort();
                return { sessionId: undefined, interrupted: false, sessionLost: true };
              }
              if (sid) sessionId = sid;
              continue;
            }

            // Token-level liveness: partial-message events carry raw API
            // stream deltas. Only text deltas matter for the live buffer.
            if (m.type === "stream_event") {
              const e = rec(m.event);
              if (e.type === "content_block_delta") {
                const d = rec(e.delta);
                if (d.type === "text_delta" && typeof d.text === "string") cb.onDelta(d.text);
              }
              continue;
            }

            // Completed assistant messages are the persisted record: full text
            // blocks and tool calls with their complete input.
            if (m.type === "assistant") {
              const inner = rec(m.message);
              const content = Array.isArray(inner.content) ? (inner.content as unknown[]) : [];
              for (const rawBlock of content) {
                const b = rec(rawBlock);
                if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
                  cb.onText(b.text);
                } else if (b.type === "tool_use" && typeof b.name === "string") {
                  cb.onTool({
                    callId: typeof b.id === "string" ? b.id : undefined,
                    name: b.name,
                    detail: toolDetail(b.name, b.input),
                    input: b.input,
                    phase: "started",
                  });
                }
              }
              continue;
            }

            // Claude reports tool results as user content blocks. Pair them
            // with their tool_use call so Stereo can stay concise by default
            // without throwing away the underlying engineering evidence.
            if (m.type === "user") {
              const inner = rec(m.message);
              const content = Array.isArray(inner.content) ? (inner.content as unknown[]) : [];
              for (const rawBlock of content) {
                const b = rec(rawBlock);
                if (b.type !== "tool_result") continue;
                cb.onTool({
                  callId: typeof b.tool_use_id === "string" ? b.tool_use_id : undefined,
                  name: "Tool",
                  detail: "",
                  output: b.is_error === undefined ? b.content : { content: b.content, isError: b.is_error },
                  phase: "completed",
                });
              }
              continue;
            }

            // Usage is reported once, from the authoritative result message.
            if (m.type === "result") {
              receivedResult = true;
              const usage = rec(m.usage);
              if (typeof usage.input_tokens === "number" || typeof usage.output_tokens === "number") {
                cb.onUsage({
                  inputTokens: Number(usage.input_tokens ?? 0),
                  outputTokens: Number(usage.output_tokens ?? 0),
                });
              }
              if (typeof m.session_id === "string") sessionId = m.session_id;
              // Turn is complete — release the input stream so the CLI exits.
              endInput();
              if (m.subtype !== "success" || m.is_error === true) {
                const errors = Array.isArray(m.errors)
                  ? m.errors.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
                  : [];
                const detail = errors.join("\n") || (typeof m.result === "string" ? m.result.trim() : "");
                throw new Error(detail || `Claude turn failed (${String(m.subtype ?? "unknown error")})`);
              }
            }
          }
          if (!receivedResult) {
            throw new Error(receivedMessage
              ? "Claude exited before completing the turn. Check that your Claude CLI is up to date and signed in."
              : "Claude could not start. Check that your Claude CLI is installed, up to date, and signed in.");
          }
          return { sessionId, interrupted: interruptRequested };
        } catch (error) {
          if (sessionLost) return { sessionId: undefined, interrupted: false, sessionLost: true };
          // Only an explicit user request is an interruption. Treating a
          // closed/aborted SDK process as one hid launch and packaging errors.
          if (interruptRequested) return { sessionId, interrupted: true };
          throw error;
        } finally {
          endInput();
        }
      })();

      return {
        interrupt: () => {
          interruptRequested = true;
          // Graceful interrupt keeps the session resumable; hard abort only if
          // the control request itself fails (e.g. the process already died).
          void q
            .interrupt()
            .catch(() => abort.abort())
            .finally(() => endInput());
        },
        done,
      };
    },
  };
}
