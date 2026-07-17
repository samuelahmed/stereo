import { useEffect, useMemo, useRef, useState } from "react";
import type { Project, Thread } from "@stereo/core";
import { AGENT_NAME, timeAgo } from "../labels";
import { StereoBrandCharacter } from "./StereoBrandCharacter";

interface Props {
  threads: Thread[];
  projects: Project[];
  selectedId: string | null;
  unreadIds: Set<string>;
  width: number;
  onWidthChange(width: number): void;
  onSelect(id: string | null): void;
  onRename(thread: Thread, title: string): Promise<void>;
  onArchive(thread: Thread, archived: boolean): Promise<void>;
  onDelete(thread: Thread): Promise<void>;
  onOpenDirectory(thread: Thread): Promise<void>;
  onProjectSettings(projectId: string): void;
  onSettings(): void;
}

type ThreadAction = { kind: "rename" | "delete"; thread: Thread } | null;
type ContextMenu = { thread: Thread; x: number; y: number } | null;

const SWIPE_LIMIT = 92;
const SWIPE_ARCHIVE_THRESHOLD = 48;

interface SwipeableThreadRowProps {
  thread: Thread;
  selected: boolean;
  unread: boolean;
  onSelect(): void;
  onArchive(): Promise<void>;
  onContextMenu(x: number, y: number): void;
  onMore(x: number, y: number): void;
}

function SwipeableThreadRow({
  thread,
  selected,
  unread,
  onSelect,
  onArchive,
  onContextMenu,
  onMore,
}: SwipeableThreadRowProps) {
  const [offset, setOffsetState] = useState(0);
  const [dragging, setDragging] = useState(false);
  const offsetRef = useRef(0);
  const pendingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const suppressClickTimerRef = useRef<number | null>(null);
  const wheelTimerRef = useRef<number | null>(null);
  const pointerRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    startOffset: number;
    axis: "horizontal" | "vertical" | null;
  } | null>(null);

  const setOffset = (next: number) => {
    const clamped = Math.max(-SWIPE_LIMIT, Math.min(0, next));
    offsetRef.current = clamped;
    setOffsetState(clamped);
  };

  const archive = () => {
    if (pendingRef.current || thread.status === "running") {
      setOffset(0);
      return;
    }
    pendingRef.current = true;
    setDragging(false);
    setOffset(-SWIPE_LIMIT);
    void onArchive().finally(() => {
      pendingRef.current = false;
      setOffset(0);
    });
  };

  const finishSwipe = () => {
    setDragging(false);
    if (offsetRef.current <= -SWIPE_ARCHIVE_THRESHOLD) archive();
    else setOffset(0);
  };

  useEffect(() => () => {
    if (wheelTimerRef.current !== null) window.clearTimeout(wheelTimerRef.current);
    if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current);
  }, []);

  return (
    <div className={`thread-swipe-shell ${thread.status === "running" ? "swipe-disabled" : ""}`}>
      <div className="thread-swipe-action" aria-hidden="true">
        <span>Archive</span>
      </div>
      <div
        className={`thread-item ${selected ? "selected" : ""} ${dragging ? "swiping" : ""}`}
        style={{ transform: `translateX(${offset}px)` }}
        onContextMenu={(event) => {
          event.preventDefault();
          onContextMenu(event.clientX, event.clientY);
        }}
        onPointerDown={(event) => {
          if (thread.status === "running" || !event.isPrimary || event.button !== 0) return;
          pointerRef.current = {
            id: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startOffset: offsetRef.current,
            axis: null,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const gesture = pointerRef.current;
          if (!gesture || gesture.id !== event.pointerId) return;
          const deltaX = event.clientX - gesture.startX;
          const deltaY = event.clientY - gesture.startY;
          if (!gesture.axis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= 5) {
            gesture.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
            if (gesture.axis === "horizontal") setDragging(true);
          }
          if (gesture.axis !== "horizontal") return;
          event.preventDefault();
          setOffset(gesture.startOffset + deltaX);
        }}
        onPointerUp={(event) => {
          const gesture = pointerRef.current;
          if (!gesture || gesture.id !== event.pointerId) return;
          pointerRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          if (gesture.axis === "horizontal") {
            suppressClickRef.current = true;
            suppressClickTimerRef.current = window.setTimeout(() => {
              suppressClickRef.current = false;
              suppressClickTimerRef.current = null;
            }, 250);
            finishSwipe();
          }
        }}
        onPointerCancel={() => {
          pointerRef.current = null;
          setDragging(false);
          setOffset(0);
        }}
        onWheel={(event) => {
          if (thread.status === "running" || Math.abs(event.deltaX) < 1 || Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.2) return;
          event.preventDefault();
          event.stopPropagation();
          setDragging(true);
          setOffset(offsetRef.current - event.deltaX);
          if (wheelTimerRef.current !== null) window.clearTimeout(wheelTimerRef.current);
          wheelTimerRef.current = window.setTimeout(() => {
            wheelTimerRef.current = null;
            finishSwipe();
          }, 140);
        }}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return;
          suppressClickRef.current = false;
          if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current);
          suppressClickTimerRef.current = null;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <button className="thread-item-main" onClick={onSelect} title={thread.title}>
          <span className="thread-title">
            {thread.status === "running" && <span className={`thread-running-dot ${thread.agent.agent}`} title={`${AGENT_NAME[thread.agent.agent]} is working`} />}
            <span>{thread.title}</span>
            {unread && <span className="unread-dot" title="Unread completion" />}
          </span>
          <span className="meta"><span>{AGENT_NAME[thread.agent.agent]}{thread.kind === "review" ? " · Review" : ""}</span><span className="dim right">{timeAgo(thread.updatedAt)}</span></span>
        </button>
        <button className="thread-more" aria-label={`Actions for ${thread.title}`} title="Thread actions" onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          onMore(rect.right - 180, rect.bottom + 4);
        }}>•••</button>
      </div>
    </div>
  );
}

function loadCollapsedProjects(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem("stereo:collapsed-projects") ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveCollapsedProjects(projects: Set<string>): void {
  try {
    localStorage.setItem("stereo:collapsed-projects", JSON.stringify([...projects]));
  } catch {
    // Collapse still works for this window when storage is unavailable.
  }
}

export function Sidebar({
  threads,
  projects,
  selectedId,
  unreadIds,
  width,
  onWidthChange,
  onSelect,
  onRename,
  onArchive,
  onDelete,
  onOpenDirectory,
  onProjectSettings,
  onSettings,
}: Props) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(loadCollapsedProjects);
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const [action, setAction] = useState<ThreadAction>(null);
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, refreshRelativeTimes] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const activeThreads = useMemo(() => threads.filter((thread) => !thread.archivedAt), [threads]);
  const brandIsWorking = activeThreads.some((thread) => thread.status === "running");
  const brandMotion = brandIsWorking ? "working" : "none";
  const archivedThreads = useMemo(() => threads.filter((thread) => thread.archivedAt), [threads]);
  const filteredThreads = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return activeThreads;
    return activeThreads.filter((thread) =>
      `${thread.title} ${thread.cwd} ${AGENT_NAME[thread.agent.agent]}`.toLowerCase().includes(normalized),
    );
  }, [activeThreads, query]);
  const filteredArchivedThreads = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return archivedThreads;
    return archivedThreads.filter((thread) =>
      `${thread.title} ${thread.cwd} ${AGENT_NAME[thread.agent.agent]}`.toLowerCase().includes(normalized),
    );
  }, [archivedThreads, query]);
  const selectedProjectId = useMemo(() => activeThreads.find((thread) => thread.id === selectedId)?.projectId, [activeThreads, selectedId]);
  const groupedThreads = useMemo(() => {
    const known = new Map(projects.map((project) => [project.id, project]));
    const groups = new Map<string, { project: Project; threads: Thread[] }>();
    for (const thread of filteredThreads) {
      const project = known.get(thread.projectId) ?? {
        id: thread.projectId,
        name: thread.cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? thread.cwd,
        cwd: thread.cwd,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        defaults: { agent: null, permission: null },
      };
      const group = groups.get(project.id) ?? { project, threads: [] };
      group.threads.push(thread);
      groups.set(project.id, group);
    }
    return [...groups.values()].sort((a, b) => {
      if (a.project.id === selectedProjectId) return -1;
      if (b.project.id === selectedProjectId) return 1;
      return (b.threads[0]?.updatedAt ?? "").localeCompare(a.threads[0]?.updatedAt ?? "");
    });
  }, [filteredThreads, projects, selectedProjectId]);

  const toggleProject = (projectId: string) => {
    setCollapsedProjects((previous) => {
      const next = new Set(previous);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      saveCollapsedProjects(next);
      return next;
    });
  };

  useEffect(() => {
    if (!selectedProjectId || !collapsedProjects.has(selectedProjectId)) return;
    setCollapsedProjects((previous) => {
      const next = new Set(previous);
      next.delete(selectedProjectId);
      saveCollapsedProjects(next);
      return next;
    });
  }, [selectedProjectId]);

  useEffect(() => {
    const dismiss = () => {
      setContextMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        onSelect(null);
      }
      if (event.key === "Escape") {
        setContextMenu(null);
      }
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
        <div className="brand" aria-label={brandIsWorking ? "Stereo is working" : "Stereo is idle"}>
          <StereoBrandCharacter motion={brandMotion} />
          <span>stereo</span>
        </div>
        <span className="shortcut-hint">⌘K</span>
      </div>
      <button className="new-thread" onClick={() => onSelect(null)}>
        <span>＋</span> New thread <span className="new-thread-shortcut">⌘N</span>
      </button>
      <div className="thread-search-wrap">
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
        {groupedThreads.map(({ project, threads: projectThreads }) => (
          <section className="project-group" key={project.id}>
            <div className="project-group-heading">
              <button className="project-collapse" aria-expanded={!collapsedProjects.has(project.id)} onClick={() => toggleProject(project.id)} title={project.cwd}>
                <span className={`project-chevron ${collapsedProjects.has(project.id) ? "collapsed" : ""}`} />
                <span>{project.name}</span>
                <small>{projectThreads.length}</small>
              </button>
              <button className="project-more" aria-label={`Settings for ${project.name}`} title="Project settings" onClick={() => onProjectSettings(project.id)}>•••</button>
            </div>
            {(!collapsedProjects.has(project.id) || query.trim()) && projectThreads.map((thread) => (
              <SwipeableThreadRow
                key={thread.id}
                thread={thread}
                selected={thread.id === selectedId}
                unread={unreadIds.has(thread.id)}
                onSelect={() => onSelect(thread.id)}
                onArchive={() => onArchive(thread, true)}
                onContextMenu={(x, y) => setContextMenu({ thread, x, y })}
                onMore={(x, y) => setContextMenu({ thread, x, y })}
              />
            ))}
          </section>
        ))}
        {activeThreads.length === 0 && archivedThreads.length === 0 && <div className="thread-list-empty">Your conversations will appear here.</div>}
        {activeThreads.length > 0 && filteredThreads.length === 0 && !showArchived && (
          <div className="thread-list-empty">No threads match “{query}”.</div>
        )}
        {archivedThreads.length > 0 && (
          <section className="archive-section">
            <button className="archive-heading" aria-expanded={showArchived} onClick={() => setShowArchived((open) => !open)}>
              <span className={`project-chevron ${showArchived ? "" : "collapsed"}`} />
              <span>Archived</span>
              <small>{archivedThreads.length}</small>
            </button>
            {showArchived && filteredArchivedThreads.map((thread) => {
              const projectName = projects.find((project) => project.id === thread.projectId)?.name;
              return (
                <div key={thread.id} className={`thread-item archived ${thread.id === selectedId ? "selected" : ""}`} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ thread, x: event.clientX, y: event.clientY }); }}>
                  <button className="thread-item-main" onClick={() => onSelect(thread.id)} title={thread.title}>
                    <span className="thread-title"><span>{thread.title}</span></span>
                    <span className="meta"><span>{projectName ?? AGENT_NAME[thread.agent.agent]}</span><span className="dim right">{timeAgo(thread.archivedAt ?? thread.updatedAt)}</span></span>
                  </button>
                  <button className="thread-more" aria-label={`Actions for ${thread.title}`} title="Thread actions" onClick={(event) => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); setContextMenu({ thread, x: rect.right - 180, y: rect.bottom + 4 }); }}>•••</button>
                </div>
              );
            })}
            {showArchived && filteredArchivedThreads.length === 0 && <div className="thread-list-empty compact">No archived threads match.</div>}
          </section>
        )}
      </div>
      <div className="sidebar-footer">
        <button className="settings-button" onClick={onSettings}>
          <span>Settings</span>
          <kbd>⌘,</kbd>
        </button>
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
          style={{ left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 194)), top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 246)) }}
          onPointerDown={(event) => event.stopPropagation()}
          role="menu"
        >
          <button role="menuitem" onClick={() => { onSelect(contextMenu.thread.id); setContextMenu(null); }}>Open</button>
          <button role="menuitem" onClick={() => { void onOpenDirectory(contextMenu.thread); setContextMenu(null); }}>Open working folder</button>
          <button role="menuitem" onClick={() => { onProjectSettings(contextMenu.thread.projectId); setContextMenu(null); }}>Project settings…</button>
          <button role="menuitem" onClick={() => openAction("rename", contextMenu.thread)}>Rename…</button>
          <button
            role="menuitem"
            disabled={!contextMenu.thread.archivedAt && contextMenu.thread.status === "running"}
            title={!contextMenu.thread.archivedAt && contextMenu.thread.status === "running" ? "Stop this thread before archiving it" : undefined}
            onClick={() => {
              const thread = contextMenu.thread;
              setContextMenu(null);
              void onArchive(thread, !thread.archivedAt);
            }}
          >
            {contextMenu.thread.archivedAt ? "Restore thread" : "Archive thread"}
          </button>
          <div className="context-separator" />
          <button
            role="menuitem"
            className="danger"
            disabled={contextMenu.thread.status === "running"}
            title={contextMenu.thread.status === "running" ? "Stop this thread before deleting it" : undefined}
            onClick={() => openAction("delete", contextMenu.thread)}
          >
            Delete permanently…
          </button>
        </div>
      )}

      {action && (
        <div className="modal-backdrop" onPointerDown={() => !pending && setAction(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="thread-action-title" onPointerDown={(event) => event.stopPropagation()}>
            <div className="modal-title" id="thread-action-title">{action.kind === "rename" ? "Rename thread" : "Delete thread permanently?"}</div>
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
