/**
 * Static model/effort catalogs. `null` value/effort = the CLI's own default.
 *
 * These are the source of truth for Claude, and the known public catalog for
 * Codex. Codex also reads the live list from the CLI itself (`codex debug
 * models`) during agent detection, then merges it with this list so newly
 * documented model IDs remain selectable when an installed CLI catalog lags.
 *
 * This module must stay dependency-free (no node imports) — the renderer
 * imports it directly.
 */
export const CLAUDE_MODELS: { value: string | null; label: string }[] = [
  { value: null, label: "CLI default" },
  { value: "fable", label: "Fable 5" },
  { value: "opus", label: "Opus 4.8" },
  { value: "sonnet", label: "Sonnet 5" },
  { value: "haiku", label: "Haiku 4.5" },
];

export const CLAUDE_EFFORTS: (string | null)[] = [null, "low", "medium", "high", "xhigh", "max"];

/** Fallback only — the live list comes from `codex debug models`. */
export const CODEX_MODELS: { value: string | null; label: string }[] = [
  { value: null, label: "CLI default" },
  { value: "gpt-5.6", label: "GPT-5.6" },
  { value: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
  { value: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
  { value: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
  { value: "gpt-5.5", label: "GPT-5.5" },
  { value: "gpt-5.4", label: "GPT-5.4" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
];

export const CODEX_EFFORTS: (string | null)[] = [null, "low", "medium", "high", "xhigh"];
