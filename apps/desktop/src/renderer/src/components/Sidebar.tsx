import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentStatusInfo, Project, Settings, Thread } from "@stereo/core";
import { AGENT_NAME, timeAgo } from "../labels";
import { AgentPicker } from "./AgentPicker";

interface Props {
  threads: Thread[];
  projects: Project[];
  selectedId: string | null;
  unreadIds: Set<string>;
  agents: { claude: AgentStatusInfo; codex: AgentStatusInfo } | null;
  settings: Settings | null;
  width: number;
  onWidthChange(width: number): void;
  onSelect(id: string | null): void;
  onRename(thread: Thread, title: string): Promise<void>;
  onArchive(thread: Thread, archived: boolean): Promise<void>;
  onDelete(thread: Thread): Promise<void>;
  onOpenDirectory(thread: Thread): Promise<void>;
  onSettingsChange(settings: Settings): void;
  onProjectSettings(projectId: string): void;
  onCommandPalette(): void;
}

type ThreadAction = { kind: "rename" | "delete"; thread: Thread } | null;
type ContextMenu = { thread: Thread; x: number; y: number } | null;

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
  agents,
  settings,
  width,
  onWidthChange,
  onSelect,
  onRename,
  onArchive,
  onDelete,
  onOpenDirectory,
  onSettingsChange,
  onProjectSettings,
  onCommandPalette,
}: Props) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(loadCollapsedProjects);
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const [mainMenu, setMainMenu] = useState(false);
  const [action, setAction] = useState<ThreadAction>(null);
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, refreshRelativeTimes] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const activeThreads = useMemo(() => threads.filter((thread) => !thread.archivedAt), [threads]);
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
      setMainMenu(false);
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
        setMainMenu(false);
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
              <div key={thread.id} className={`thread-item ${thread.id === selectedId ? "selected" : ""}`} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ thread, x: event.clientX, y: event.clientY }); }}>
                <button className="thread-item-main" onClick={() => onSelect(thread.id)} title={thread.title}>
                  <span className="thread-title"><span className={`status-dot ${thread.agent.agent} ${thread.status === "running" ? "pulse" : ""}`} /><span>{thread.title}</span>{unreadIds.has(thread.id) && <span className="unread-dot" title="Unread completion" />}</span>
                  <span className="meta">{thread.kind === "review" && <span className="kind-badge">review</span>}<span>{AGENT_NAME[thread.agent.agent]}</span><span className="dim right">{timeAgo(thread.updatedAt)}</span></span>
                </button>
                <button className="thread-more" aria-label={`Actions for ${thread.title}`} title="Thread actions" onClick={(event) => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); setContextMenu({ thread, x: rect.right - 180, y: rect.bottom + 4 }); }}>•••</button>
              </div>
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
                    <span className="thread-title"><span className={`status-dot ${thread.agent.agent}`} /><span>{thread.title}</span></span>
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
        <button
          className="main-menu-button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setMainMenu((open) => !open);
          }}
        >
          <span className="menu-status-dots">
            <span className="status-dot claude" />
            <span className="status-dot codex" />
          </span>
          <span>Menu & settings</span>
          <span className="main-menu-chevron">⌃</span>
        </button>
        {mainMenu && settings && (
          <div className="main-menu" role="dialog" aria-label="Menu and settings" onPointerDown={(event) => event.stopPropagation()}>
            <div className="main-menu-heading">Stereo</div>
            <button className="main-menu-action" onClick={() => { onSelect(null); setMainMenu(false); }}>
              <span>New thread</span><kbd>⌘N</kbd>
            </button>
            <button className="main-menu-action" onClick={() => { setMainMenu(false); onCommandPalette(); }}><span>Command palette</span><kbd>⌘⇧P</kbd></button>
            <div className="main-menu-section">
              <div className="main-menu-label">Default harness</div>
              <AgentPicker value={settings.defaultAgent} onChange={(defaultAgent) => onSettingsChange({ ...settings, defaultAgent })} agents={agents} />
            </div>
            <div className="main-menu-section harness-status">
              <div className="main-menu-label">Harnesses</div>
              {agents ? (["claude", "codex"] as const).map((id) => (
                <div className="main-menu-status" key={id}>
                  <span className={`status-dot ${id}`} style={{ opacity: agents[id].installed ? 1 : 0.25 }} />
                  <span>{AGENT_NAME[id]}</span>
                  <span>{agents[id].installed ? agents[id].auth ?? "Ready" : "Not installed"}</span>
                </div>
              )) : <div className="sidebar-loading">Checking local agents…</div>}
            </div>
            <div className="main-menu-section menu-form">
              <label>
                <span>Default access</span>
                <select value={settings.defaultPermission} onChange={(event) => onSettingsChange({ ...settings, defaultPermission: event.target.value as Settings["defaultPermission"] })}>
                  <option value="workspace-write">Workspace write</option>
                  {settings.defaultAgent.agent === "claude" && <option value="ask">Ask before writes</option>}
                  <option value="read-only">Read only</option>
                </select>
              </label>
              <label>
                <span>Open files in</span>
                <select value={settings.editor} onChange={(event) => onSettingsChange({ ...settings, editor: event.target.value as Settings["editor"] })}>
                  <option value="auto">Auto-detect editor</option>
                  <option value="vscode">Visual Studio Code</option>
                  <option value="cursor">Cursor</option>
                  <option value="zed">Zed</option>
                  <option value="system">System default</option>
                </select>
              </label>
              <label className="menu-checkbox">
                <span>Completion notifications</span>
                <input type="checkbox" checked={settings.notifyOnComplete} onChange={(event) => onSettingsChange({ ...settings, notifyOnComplete: event.target.checked })} />
              </label>
            </div>
            <div className="permission-note">Stereo uses the native CLI subscriptions already signed in on this computer. Access is a default for new threads; Claude can also ask before write actions.</div>
            <div className="main-menu-shortcuts"><span>Search threads</span><kbd>⌘K</kbd><span>Session controls</span><kbd>⌘,</kbd><span>Interrupt</span><kbd>Esc</kbd></div>
          </div>
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
