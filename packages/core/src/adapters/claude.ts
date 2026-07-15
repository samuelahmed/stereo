import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentSelection } from "../types.js";
import type { AgentAdapter, TurnCallbacks, TurnHandle, TurnOptions, TurnResult } from "./types.js";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (typeof v === "object" && v !== null ? (v as Rec) : {});

const TOOLS = ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "WebFetch", "WebSearch", "TodoWrite", "NotebookEdit"];

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

export function claudeAdapter(spec: AgentSelection): AgentAdapter {
  return {
    agent: "claude",
    startTurn(prompt: string, opts: TurnOptions, cb: TurnCallbacks): TurnHandle {
      const abort = new AbortController();

      const done = (async (): Promise<TurnResult> => {
        let sessionId = opts.resumeSessionId;
        try {
          const stream = query({
            prompt,
            options: {
              cwd: opts.cwd,
              allowedTools: TOOLS,
              permissionMode: "acceptEdits",
              includePartialMessages: true,
              abortController: abort,
              ...(spec.model ? { model: spec.model } : {}),
              ...(spec.effort ? { extraArgs: { effort: spec.effort } } : {}),
              ...(opts.resumeSessionId ? { resume: opts.resumeSessionId } : {}),
            },
          });

          for await (const raw of stream) {
            const m = rec(raw);

            if (m.type === "system" && m.subtype === "init") {
              if (typeof m.session_id === "string") sessionId = m.session_id;
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
                  cb.onTool(b.name, toolDetail(b.name, b.input));
                }
              }
              continue;
            }

            // Usage is reported once, from the authoritative result message.
            if (m.type === "result") {
              const usage = rec(m.usage);
              if (typeof usage.input_tokens === "number" || typeof usage.output_tokens === "number") {
                cb.onUsage({
                  inputTokens: Number(usage.input_tokens ?? 0),
                  outputTokens: Number(usage.output_tokens ?? 0),
                });
              }
              if (typeof m.session_id === "string") sessionId = m.session_id;
            }
          }
          return { sessionId, interrupted: false };
        } catch (error) {
          // Esc-to-interrupt aborts the query; the CLI session on disk
          // survives, so the next message resumes exactly where we stopped.
          if (abort.signal.aborted) return { sessionId, interrupted: true };
          throw error;
        }
      })();

      return { interrupt: () => abort.abort(), done };
    },
  };
}
