/**
 * Static model/effort catalogs. `null` value/effort = the CLI's own default.
 *
 * These are the source of truth for Claude, and a *fallback* for Codex: the
 * live Codex list is read from the CLI itself (`codex debug models`) during
 * agent detection, so the picker offers exactly the models this install
 * accepts. This static list is only used when that catalog can't be read.
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
  { value: "gpt-5.5", label: "GPT-5.5" },
  { value: "gpt-5.5-codex", label: "GPT-5.5 Codex" },
  { value: "gpt-5.4", label: "GPT-5.4" },
];

export const CODEX_EFFORTS: (string | null)[] = [null, "low", "medium", "high", "xhigh"];
