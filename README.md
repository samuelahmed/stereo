# ◐ Stereo

**Every AI coding tool is mono. Stereo runs both frontier labs in one window.**

Stereo replaces the terminal in the loop you already run: prompt the agent, read the
diff in your editor, write your own commit message, commit, next task. A thread in
Stereo is a terminal session that never dies — it runs **Claude Code** or **Codex**
(on the subscriptions you already pay for) in any repo directory, edits your working
tree in place, and streams everything the agent does.

## What it does

- **Threads over both CLIs** — token-level streaming, live tool lines, real markdown.
  Esc interrupts; the session survives; send a message to continue.
- **Fork across labs** — every thread is stored as a vendor-neutral transcript, so any
  thread can be duplicated to the other model with a full context handoff (capped at
  ~200k tokens; trims are always visible, never silent).
- **Pre-commit review** — one click runs the rival lab over exactly the uncommitted
  diff you're about to ship, in a fresh review thread you can interrogate.
- **History forever** — every thread from both vendors, saved locally, browsable.
- **Your workflow stays yours** — no worktrees, no generated commits, no merge UI.
  Git is the undo button, your editor is the review surface, commits come from you.

## Architecture

```
packages/core        engine, event-sourced store, briefing compiler, adapters
  src/engine.ts        threads, turns, queueing, interrupt, fork/review
  src/store.ts         threads.json + append-only JSONL transcript per thread
  src/briefing.ts      one compiler, two callers: fork handoffs & session-loss resume
  src/git.ts           read-only diff helpers (never touches the index)
  src/adapters/        claude (Agent SDK, streaming + abort) · codex (exec --json, kill)
apps/desktop         Electron + React
  src/main             window, engine host, IPC
  src/preload          window.stereo bridge
  src/renderer         sidebar · thread view · composer · fork/review menus
```

The transcript is the canonical record; the CLIs' own session ids are only an
accelerator for native resume. Subscription mode hard-strips API-key env vars so
agents always run on CLI logins.

## Development

```sh
pnpm install
pnpm dev        # electron-vite dev, watches main + renderer
pnpm typecheck
pnpm build
```

Opening `http://localhost:5173` in a plain browser shows a design-mode mock (no real
agents, no tokens spent). The real engine only runs inside the Electron shell.
