import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentStatusInfo, Settings, Thread } from "@stereo/core";
import { AGENT_NAME, shortPath, timeAgo } from "../labels";

interface Props {
  threads: Thread[];
  selectedId: string | null;
  agents: { claude: AgentStatusInfo; codex: AgentStatusInfo } | null;
  settings: Settings | null;
  width: number;
  onWidthChange(width: number): void;
  onSelect(id: string | null): void;
  onRename(thread: Thread, title: string): Promise<void>;
  onDelete(thread: Thread): Promise<void>;
  onOpenDirectory(thread: Thread): Promise<void>;
  onAuthModeChange(mode: Settings["authMode"]): void;
}

type ThreadAction = { kind: "rename" | "delete"; thread: Thread } | null;
type ContextMenu = { thread: Thread; x: number; y: number } | null;

export function Sidebar({
  threads,
  selectedId,
  agents,
  settings,
  width,
  onWidthChange,
  onSelect,
  onRename,
  onDelete,
  onOpenDirectory,
  onAuthModeChange,
}: Props) {
  const [query, setQuery] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const [action, setAction] = useState<ThreadAction>(null);
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, refreshRelativeTimes] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const filteredThreads = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return threads;
    return threads.filter((thread) =>
      `${thread.title} ${thread.cwd} ${AGENT_NAME[thread.agent.agent]}`.toLowerCase().includes(normalized),
    );
  }, [query, threads]);

  useEffect(() => {
    const dismiss = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        onSelect(null);
      }
      if (event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onSelect]);

  useEffect(() => {
    const timer = window.setInterval(() => refreshRelativeTimes((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!action) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) setAction(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [action, pending]);

  useEffect(() => {
    if (action) requestAnimationFrame(() => titleRef.current?.focus());
  }, [action]);

  const openAction = (kind: "rename" | "delete", thread: Thread) => {
    setContextMenu(null);
    setAction({ kind, thread });
    setTitle(thread.title);
    setActionError(null);
  };

  const confirmAction = async () => {
    if (!action || pending) return;
    setPending(true);
    setActionError(null);
    try {
      if (action.kind === "rename") await onRename(action.thread, title);
      else await onDelete(action.thread);
      setAction(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  };

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const onMove = (moveEvent: PointerEvent) => onWidthChange(startWidth + moveEvent.clientX - startX);
    const onUp = () => {
      document.body.classList.remove("resizing-sidebar");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    document.body.classList.add("resizing-sidebar");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <aside className="sidebar" style={{ width }} aria-label="Threads">
      <div className="brand-row">
        <div className="brand">
          <span className="brand-glyph">◐</span> Stereo
        </div>
        <span className="shortcut-hint">⌘K</span>
      </div>
      <button className="new-thread" onClick={() => onSelect(null)}>
        <span>＋</span> New thread <span className="new-thread-shortcut">⌘N</span>
      </button>
      <div className="thread-search-wrap">
        <span className="search-icon" aria-hidden="true">⌕</span>
        <input
          ref={searchRef}
          className="thread-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setQuery("");
              event.currentTarget.blur();
            }
          }}
          placeholder="Search threads"
          aria-label="Search threads"
        />
        {query && <button className="search-clear" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
      </div>
      <div className="thread-list">
        {filteredThreads.map((thread) => (
          <div
            key={thread.id}
            className={`thread-item ${thread.id === selectedId ? "selected" : ""}`}
            onContextMenu={(event) => {
              event.preventDefault();
              setContextMenu({ thread, x: event.clientX, y: event.clientY });
            }}
          >
            <button className="thread-item-main" onClick={() => onSelect(thread.id)} title={thread.title}>
              <span className="thread-title">
                <span className={`status-dot ${thread.agent.agent} ${thread.status === "running" ? "pulse" : ""}`} />
                <span>{thread.title}</span>
              </span>
              <span className="meta">
                {thread.kind === "review" && <span className="kind-badge">review</span>}
                <span>{AGENT_NAME[thread.agent.agent]}</span>
                <span className="dim">{shortPath(thread.cwd)}</span>
                <span className="dim right">{timeAgo(thread.updatedAt)}</span>
              </span>
            </button>
            <button
              className="thread-more"
              aria-label={`Actions for ${thread.title}`}
              title="Thread actions"
              onClick={(event) => {
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                setContextMenu({ thread, x: rect.right - 180, y: rect.bottom + 4 });
              }}
            >
              •••
            </button>
          </div>
        ))}
        {threads.length === 0 && <div className="thread-list-empty">Your conversations will appear here.</div>}
        {threads.length > 0 && filteredThreads.length === 0 && (
          <div className="thread-list-empty">No threads match “{query}”.</div>
        )}
      </div>
      <div className="sidebar-footer">
        {agents ? (
          (["claude", "codex"] as const).map((id) => {
            const agent = agents[id];
            return (
              <div key={id} className="agent-badge">
                <span className={`status-dot ${id}`} style={{ opacity: agent.installed ? 1 : 0.25 }} />
                <span>{AGENT_NAME[id]}</span>
                <span className="dim">{agent.installed ? (agent.auth ?? "ready") : "not installed"}</span>
              </div>
            );
          })
        ) : (
          <div className="sidebar-loading">Checking local agents…</div>
        )}
        {settings && (
          <label className="auth-toggle">
            <span>Billing</span>
            <select value={settings.authMode} onChange={(event) => onAuthModeChange(event.target.value as Settings["authMode"])}>
              <option value="subscription">Subscription</option>
              <option value="api-key">API key</option>
            </select>
          </label>
        )}
      </div>

      <div
        className="sidebar-resizer"
        role="separator"
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={startResize}
        onDoubleClick={() => onWidthChange(248)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") onWidthChange(width - 12);
          if (event.key === "ArrowRight") onWidthChange(width + 12);
        }}
      />

      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 194)), top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 174)) }}
          onPointerDown={(event) => event.stopPropagation()}
          role="menu"
        >
          <button role="menuitem" onClick={() => { onSelect(contextMenu.thread.id); setContextMenu(null); }}>Open</button>
          <button role="menuitem" onClick={() => { void onOpenDirectory(contextMenu.thread); setContextMenu(null); }}>Open working folder</button>
          <button role="menuitem" onClick={() => openAction("rename", contextMenu.thread)}>Rename…</button>
          <div className="context-separator" />
          <button
            role="menuitem"
            className="danger"
            disabled={contextMenu.thread.status === "running"}
            title={contextMenu.thread.status === "running" ? "Stop this thread before deleting it" : undefined}
            onClick={() => openAction("delete", contextMenu.thread)}
          >
            Delete thread…
          </button>
        </div>
      )}

      {action && (
        <div className="modal-backdrop" onPointerDown={() => !pending && setAction(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="thread-action-title" onPointerDown={(event) => event.stopPropagation()}>
            <div className="modal-title" id="thread-action-title">{action.kind === "rename" ? "Rename thread" : "Delete thread?"}</div>
            {action.kind === "rename" ? (
              <input
                ref={titleRef}
                className="modal-input"
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void confirmAction();
                  if (event.key === "Escape") setAction(null);
                }}
              />
            ) : (
              <div className="modal-copy">“{action.thread.title}” and its complete transcript will be permanently removed.</div>
            )}
            {actionError && <div className="modal-error">{actionError}</div>}
            <div className="modal-actions">
              <button className="btn ghost" disabled={pending} onClick={() => setAction(null)}>Cancel</button>
              <button
                className={`btn ${action.kind === "delete" ? "danger" : "primary"}`}
                disabled={pending || (action.kind === "rename" && !title.trim())}
                onClick={() => void confirmAction()}
              >
                {pending ? "Working…" : action.kind === "rename" ? "Save" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
