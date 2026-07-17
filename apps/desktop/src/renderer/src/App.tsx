import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentSelection, AgentStatusInfo, Attachment, DiffStats, EventEnvelope, PermissionMode, Project, QueuedMessage, ReadySound, Settings, Thread as ThreadT } from "@stereo/core";
import { defaultAgentSelection } from "@stereo/core/models";
import { bridgeFailed, isMock, stereo } from "./bridge";
import { AGENT_NAME, agentSummary, formatTokens, otherAgent, shortPath } from "./labels";
import { AgentPicker } from "./components/AgentPicker";
import { Composer } from "./components/Composer";
import { CommandPalette, type PaletteCommand } from "./components/CommandPalette";
import { ControlCenter, type ControlTab } from "./components/ControlCenter";
import { NewThread } from "./components/NewThread";
import { QueueList } from "./components/QueueList";
import { ReviewAccessDialog, type ReviewAccessDecision } from "./components/ReviewAccessDialog";
import { Sidebar } from "./components/Sidebar";
import { Thread } from "./components/Thread";

type Catalog = { claude: AgentStatusInfo; codex: AgentStatusInfo } | null;
type ReviewGate = { agent: ThreadT["agent"]["agent"] };

function loadRecentDirs(): string[] {
  try {
    return JSON.parse(localStorage.getItem("stereo:recent-dirs") ?? "[]") as string[];
  } catch {
    return [];
  }
}

function loadSidebarWidth(): number {
  try {
    const stored = Number(localStorage.getItem("stereo:sidebar-width"));
    return Number.isFinite(stored) && stored >= 196 && stored <= 420 ? stored : 248;
  } catch {
    return 248;
  }
}

function readySoundLabel(sound: ReadySound): string {
  if (sound === "prominent") return "Prominent";
  if (sound === "standard") return "Standard";
  return "Off";
}

const COMPOSER_SELECTOR = 'textarea[data-stereo-composer="true"]';
const COMPOSER_FOCUS_BLOCKERS = '[aria-modal="true"], [role="dialog"], [role="menu"], .action-menu';

function isTextEntry(element: Element | null): boolean {
  return element instanceof HTMLElement && element.matches('input, textarea, select, [contenteditable="true"]');
}

/** Focus the visible composer without pulling the transcript or app window around. */
function focusComposer(preserveTextEntry = false): void {
  if (!document.hasFocus() || document.querySelector(COMPOSER_FOCUS_BLOCKERS)) return;
  const composer = document.querySelector<HTMLTextAreaElement>(COMPOSER_SELECTOR);
  if (!composer || composer.disabled) return;
  if (preserveTextEntry && document.activeElement !== composer && isTextEntry(document.activeElement)) return;
  composer.focus({ preventScroll: true });
}

function focusComposerAfterRender(preserveTextEntry = false): void {
  window.requestAnimationFrame(() => focusComposer(preserveTextEntry));
}

export function App() {
  const [threads, setThreads] = useState<ThreadT[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [booting, setBooting] = useState(true);
  const [appError, setAppError] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [eventsByThread, setEventsByThread] = useState<Record<string, EventEnvelope[]>>({});
  const [liveByThread, setLiveByThread] = useState<Record<string, string>>({});
  const [statsByThread, setStatsByThread] = useState<Record<string, DiffStats | null>>({});
  const [queueByThread, setQueueByThread] = useState<Record<string, QueuedMessage[]>>({});
  const [unreadIds, setUnreadIds] = useState<Set<string>>(() => new Set());
  const [agents, setAgents] = useState<Catalog>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [recentDirs, setRecentDirs] = useState<string[]>(loadRecentDirs());
  const [draftCwd, setDraftCwd] = useState<string | null>(recentDirs[0] ?? null);
  const [draftAgent, setDraftAgent] = useState<AgentSelection>(() => defaultAgentSelection("claude"));
  const [draftPermission, setDraftPermission] = useState<PermissionMode>("workspace-write");
  const [menu, setMenu] = useState<"fork" | "review" | null>(null);
  const [menuAgent, setMenuAgent] = useState<AgentSelection>(() => defaultAgentSelection("codex"));
  const [threadAgentDraft, setThreadAgentDraft] = useState<AgentSelection | null>(null);
  const [controlTab, setControlTab] = useState<ControlTab | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [reviewGate, setReviewGate] = useState<ReviewGate | null>(null);
  const reviewGateResolver = useRef<((decision: ReviewAccessDecision) => void) | null>(null);

  const selected = useMemo(() => threads.find((t) => t.id === selectedId) ?? null, [threads, selectedId]);
  const selectedProject = useMemo(() => selected ? projects.find((project) => project.id === selected.projectId) ?? null : null, [projects, selected]);
  const selectedRef = useRef<ThreadT | null>(null);
  selectedRef.current = selected;
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const initialProjectDefaultsApplied = useRef(false);
  const loadedEventThreads = useRef(new Set<string>());
  const loadingEventThreads = useRef(new Set<string>());

  useEffect(() => {
    void Promise.all([
      stereo.getSettings().then((s) => {
        setSettings(s);
        setDraftAgent(s.defaultAgent);
        setDraftPermission(s.defaultPermission);
      }),
      stereo.detectAgents().then(setAgents),
      stereo.listProjects().then(setProjects),
      stereo.listThreads().then((loaded) => {
        setThreads(loaded);
        const remembered = localStorage.getItem("stereo:selected-thread");
        if (remembered && loaded.some((thread) => thread.id === remembered && !thread.archivedAt)) setSelectedId(remembered);
      }),
    ])
      .catch((error) => setAppError(error instanceof Error ? error.message : String(error)))
      .finally(() => setBooting(false));

    const offThreads = stereo.onThreads(setThreads);
    const offEvent = stereo.onEvent((envelope) => {
      setEventsByThread((prev) => {
        const existing = prev[envelope.threadId] ?? [];
        if (existing.some((e) => e.seq === envelope.seq)) return prev;
        return { ...prev, [envelope.threadId]: [...existing, envelope] };
      });
      const t = envelope.event.type;
      // A persisted text block supersedes its streamed deltas; turn boundaries
      // clear any leftover live buffer.
      if (t === "agent-text" || t === "turn-end" || t === "interrupted" || t === "error") {
        setLiveByThread((prev) => {
          if (!(envelope.threadId in prev)) return prev;
          const next = { ...prev };
          delete next[envelope.threadId];
          return next;
        });
      }
      if (envelope.event.type === "diff") {
        const stats = envelope.event.stats;
        setStatsByThread((prev) => ({ ...prev, [envelope.threadId]: stats }));
      }
      // hasFocus() matches the main process's notification gate: a visible but
      // unfocused window still earns the unread dot the notification points at.
      if (["turn-end", "interrupted", "error"].includes(envelope.event.type) &&
        (selectedIdRef.current !== envelope.threadId || !document.hasFocus())) {
        setUnreadIds((previous) => new Set(previous).add(envelope.threadId));
      }
    });
    const offDelta = stereo.onDelta(({ threadId, text }) => {
      setLiveByThread((prev) => ({ ...prev, [threadId]: (prev[threadId] ?? "") + text }));
    });
    const offQueue = stereo.onQueue(({ threadId, queue }) => {
      setQueueByThread((previous) => ({ ...previous, [threadId]: queue }));
    });
    const offRevealThread = stereo.onRevealThread((threadId) => {
      setSelectedId(threadId);
      localStorage.setItem("stereo:selected-thread", threadId);
      setUnreadIds((previous) => {
        const next = new Set(previous);
        next.delete(threadId);
        return next;
      });
    });
    return () => {
      offThreads();
      offEvent();
      offDelta();
      offQueue();
      offRevealThread();
    };
  }, []);

  useEffect(() => {
    if (!appError) return;
    const timer = window.setTimeout(() => setAppError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [appError]);

  useEffect(() => {
    const clearVisible = () => {
      const id = selectedIdRef.current;
      if (!id) return;
      setUnreadIds((previous) => {
        if (!previous.has(id)) return previous;
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
    };
    window.addEventListener("focus", clearVisible);
    return () => window.removeEventListener("focus", clearVisible);
  }, []);

  // Returning to Stereo usually means the user is ready to type. Preserve a
  // deliberate text field (such as thread search), and never reach through an
  // open dialog or menu to the composer underneath it.
  useEffect(() => {
    const onFocus = () => focusComposerAfterRender(true);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") focusComposerAfterRender(true);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    document.title = unreadIds.size ? `(${unreadIds.size}) Stereo` : "Stereo";
  }, [unreadIds]);

  // Esc interrupts the selected thread's running turn — the Claude Code gesture.
  // A dialog or open menu captures Esc for itself: dismissing UI chrome must
  // never kill a running turn.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const current = selectedRef.current;
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setControlTab("app");
        return;
      }
      if (e.key === "Escape" && current?.status === "running" && !document.querySelector('[role="dialog"], [role="menu"]')) {
        void stereo.interrupt(current.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rememberDir = useCallback((dir: string) => {
    setRecentDirs((prev) => {
      const next = [dir, ...prev.filter((d) => d !== dir)].slice(0, 6);
      localStorage.setItem("stereo:recent-dirs", JSON.stringify(next));
      return next;
    });
  }, []);

  const requestReviewAccess = useCallback((thread: ThreadT): Promise<ReviewAccessDecision> => {
    return new Promise((resolve) => {
      reviewGateResolver.current = resolve;
      setReviewGate({ agent: thread.agent.agent });
    });
  }, []);

  const resolveReviewAccess = useCallback((decision: ReviewAccessDecision) => {
    const resolve = reviewGateResolver.current;
    reviewGateResolver.current = null;
    setReviewGate(null);
    resolve?.(decision);
    focusComposerAfterRender();
  }, []);

  useEffect(() => {
    if (booting || !settings || !draftCwd || initialProjectDefaultsApplied.current) return;
    initialProjectDefaultsApplied.current = true;
    const project = projects.find((candidate) => candidate.cwd === draftCwd);
    const agent = project?.defaults.agent ?? settings.defaultAgent;
    const permission = project?.defaults.permission ?? settings.defaultPermission;
    setDraftAgent(agent);
    setDraftPermission(permission === "ask" && agent.agent === "codex" ? "workspace-write" : permission);
  }, [booting, draftCwd, projects, settings]);

  const useDirectory = useCallback((dir: string) => {
    setDraftCwd(dir);
    rememberDir(dir);
    const project = projects.find((candidate) => candidate.cwd === dir);
    const effectiveAgent = project?.defaults.agent ?? settings?.defaultAgent ?? draftAgent;
    const effectivePermission = project?.defaults.permission ?? settings?.defaultPermission ?? draftPermission;
    setDraftAgent(effectiveAgent);
    setDraftPermission(effectivePermission === "ask" && effectiveAgent.agent === "codex" ? "workspace-write" : effectivePermission);
  }, [draftAgent, draftPermission, projects, rememberDir, settings]);

  const selectThread = useCallback((id: string | null) => {
    setSelectedId(id);
    setMenu(null);
    setThreadAgentDraft(null);
    if (id === null) localStorage.removeItem("stereo:selected-thread");
    else localStorage.setItem("stereo:selected-thread", id);
    if (id) setUnreadIds((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
    // Also handles selecting the already-active thread or pressing New Thread
    // while the blank composer is already on screen.
    focusComposerAfterRender();
  }, []);

  useEffect(() => {
    const id = selectedId;
    if (!id) return;
    if (!loadedEventThreads.current.has(id) && !loadingEventThreads.current.has(id)) {
      loadingEventThreads.current.add(id);
      void stereo.threadEvents(id)
        .then((history) => {
          // A large historical transcript is intentionally non-urgent: keep the
          // sidebar and header responsive while React prepares the conversation.
          startTransition(() => {
            setEventsByThread((prev) => {
              const current = prev[id] ?? [];
              const seen = new Set(current.map((e) => e.seq));
              const merged = [...current, ...history.filter((e) => !seen.has(e.seq))];
              merged.sort((a, b) => a.seq - b.seq);
              return { ...prev, [id]: merged };
            });
          });
          loadedEventThreads.current.add(id);
        })
        .catch((error) => setAppError(error instanceof Error ? error.message : String(error)))
        .finally(() => loadingEventThreads.current.delete(id));
    }
    void stereo.threadStats(id)
      .then((stats) => setStatsByThread((prev) => ({ ...prev, [id]: stats })))
      .catch(() => undefined);
    void stereo.threadQueue(id)
      .then((queue) => setQueueByThread((previous) => ({ ...previous, [id]: queue })))
      .catch(() => undefined);
  }, [selectedId]);

  // Repository state belongs in the header and can change outside Stereo, so
  // refresh it while the thread is visible instead of relying on old transcript events.
  useEffect(() => {
    const id = selectedId;
    if (!id) return;
    let active = true;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void stereo.threadStats(id).then((stats) => {
        if (active) setStatsByThread((previous) => ({ ...previous, [id]: stats }));
      }).catch(() => undefined);
    };
    const timer = window.setInterval(refresh, 8_000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [selectedId]);

  const pickDir = useCallback(async () => {
    try {
      const picked = await stereo.pickDir();
      if (picked) {
        useDirectory(picked);
      }
    } catch (error) {
      setAppError(error instanceof Error ? error.message : String(error));
    }
  }, [useDirectory]);

  const createFromDraft = useCallback(
    async (text: string, attachments: Attachment[]): Promise<boolean> => {
      try {
        const cwd = draftCwd ?? (await stereo.pickDir());
        if (!cwd) return false;
        setDraftCwd(cwd);
        const permission = draftAgent.agent === "codex" && draftPermission === "ask" ? "workspace-write" : draftPermission;
        const thread = await stereo.createThread({ cwd, agent: draftAgent, permission });
        void stereo.listProjects().then(setProjects);
        await stereo.sendMessage(thread.id, text, attachments);
        rememberDir(cwd);
        selectThread(thread.id);
        return true;
      } catch (error) {
        setAppError(error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [draftCwd, draftAgent, draftPermission, rememberDir, selectThread],
  );

  const resizeSidebar = useCallback((width: number) => {
    const next = Math.max(196, Math.min(420, Math.round(width)));
    setSidebarWidth(next);
    try {
      localStorage.setItem("stereo:sidebar-width", String(next));
    } catch {
      // Resizing still works for this session when storage is unavailable.
    }
  }, []);

  const renameThread = useCallback(async (thread: ThreadT, title: string) => {
    await stereo.renameThread(thread.id, title);
  }, []);

  const openDirectory = useCallback(async (thread: ThreadT) => {
    try {
      await stereo.openDir(thread.cwd);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const archiveThread = useCallback(async (thread: ThreadT, archived: boolean) => {
    try {
      await stereo.setThreadArchived(thread.id, archived);
      if (archived) {
        setUnreadIds((previous) => {
          const next = new Set(previous);
          next.delete(thread.id);
          return next;
        });
        if (selectedId === thread.id) {
          selectThread(threads.find((candidate) => candidate.id !== thread.id && !candidate.archivedAt)?.id ?? null);
        }
      }
    } catch (error) {
      setAppError(error instanceof Error ? error.message : String(error));
    }
  }, [selectedId, selectThread, threads]);

  const deleteThread = useCallback(async (thread: ThreadT) => {
    await stereo.deleteThread(thread.id);
    loadedEventThreads.current.delete(thread.id);
    loadingEventThreads.current.delete(thread.id);
    if (selectedId === thread.id) {
      selectThread(threads.find((candidate) => candidate.id !== thread.id && !candidate.archivedAt)?.id ?? null);
    }
    setEventsByThread((previous) => {
      const next = { ...previous };
      delete next[thread.id];
      return next;
    });
  }, [selectedId, selectThread, threads]);

  const openMenu = useCallback(
    (which: "fork" | "review") => {
      if (!selected) return;
      if (menu === which) {
        setMenu(null);
        focusComposerAfterRender();
        return;
      }
      setThreadAgentDraft(null);
      setMenuAgent(
        which === "review"
          ? defaultAgentSelection(otherAgent(selected.agent.agent))
          : { ...selected.agent },
      );
      setMenu(which);
    },
    [menu, selected],
  );

  const confirmMenu = useCallback(async () => {
    if (!selected || !menu) return;
    const action = menu;
    setMenu(null);
    try {
      const thread =
        action === "fork" ? await stereo.forkThread(selected.id, menuAgent) : await stereo.reviewThread(selected.id, menuAgent);
      selectThread(thread.id);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : String(error));
    }
  }, [selected, menu, menuAgent, selectThread]);

  const saveThreadAgent = useCallback(async () => {
    if (!selected || !threadAgentDraft) return;
    try {
      await stereo.setThreadAgent(selected.id, threadAgentDraft);
      setThreadAgentDraft(null);
      focusComposerAfterRender();
    } catch (error) {
      setAppError(error instanceof Error ? error.message : String(error));
    }
  }, [selected, threadAgentDraft]);

  const settingsChange = useCallback(
    (next: Settings) => {
      if (!settings) return;
      const previous = settings;
      const requested = next.defaultAgent.agent === "codex" && next.defaultPermission === "ask"
        ? { ...next, defaultPermission: "workspace-write" as const }
        : next;
      // Only sync the new-thread draft with the default that actually changed —
      // toggling an unrelated setting must not clobber an in-progress draft.
      const agentChanged = requested.defaultAgent !== previous.defaultAgent;
      const permissionChanged = requested.defaultPermission !== previous.defaultPermission;
      setSettings(requested);
      if (agentChanged) setDraftAgent(requested.defaultAgent);
      if (permissionChanged) setDraftPermission(requested.defaultPermission);
      void stereo.setSettings(requested)
        .then((normalized) => {
          setSettings(normalized);
          if (agentChanged) setDraftAgent(normalized.defaultAgent);
          if (permissionChanged) setDraftPermission(normalized.defaultPermission);
        })
        .catch((error) => {
          setSettings(previous);
          if (agentChanged) setDraftAgent(previous.defaultAgent);
          if (permissionChanged) setDraftPermission(previous.defaultPermission);
          setAppError(error instanceof Error ? error.message : String(error));
        });
    },
    [settings],
  );

  if (bridgeFailed) {
    return (
      <div className="empty-state" style={{ height: "100%" }}>
        <div className="big" style={{ color: "var(--danger)" }}>
          Engine bridge failed to load
        </div>
        <div>The preload script did not run, so no real agents are connected. Check the terminal running pnpm dev.</div>
      </div>
    );
  }

  const stats = selected ? statsByThread[selected.id] : null;
  const primaryModifier = stereo.platform === "mac" ? "⌘" : "Ctrl+";
  const paletteCommands: PaletteCommand[] = [
    { id: "new", label: "New thread", detail: "Start a conversation in a project", group: "Stereo", shortcut: `${primaryModifier}N`, run: () => selectThread(null) },
    { id: "settings", label: "Settings", detail: "App defaults and local harnesses", group: "Stereo", shortcut: `${primaryModifier},`, run: () => setControlTab("app") },
    { id: "project", label: "Project settings", detail: "Defaults and configuration files", group: "Project", disabled: !selected, run: () => setControlTab("project") },
    { id: "diagnostics", label: "Session diagnostics", detail: "Recovery state and native CLI escape hatch", group: "Harness", disabled: !selected, run: () => setControlTab("session") },
    { id: "fork", label: "Fork conversation", detail: "Continue with another harness", group: "Conversation", disabled: !selected || selected.status === "running", run: () => openMenu("fork") },
    { id: "review", label: "Review working tree", detail: "Choose Claude or Codex for a read-only review", group: "Conversation", disabled: !selected || selected.status === "running", run: () => openMenu("review") },
    { id: "folder", label: "Open working folder", detail: selected?.cwd ?? "No active project", group: "Project", disabled: !selected, run: () => { if (selected) void openDirectory(selected); } },
    { id: "archive", label: selected?.archivedAt ? "Restore thread" : "Archive thread", detail: selected?.archivedAt ? "Return this conversation to its project" : "Hide this conversation without deleting it", group: "Conversation", disabled: !selected || (!selected.archivedAt && selected.status === "running"), run: () => { if (selected) void archiveThread(selected, !selected.archivedAt); } },
  ];

  return (
    <div className="app">
      <Sidebar
        primaryModifier={primaryModifier}
        threads={threads}
        projects={projects}
        selectedId={selectedId}
        unreadIds={unreadIds}
        width={sidebarWidth}
        onWidthChange={resizeSidebar}
        onSelect={selectThread}
        onRename={renameThread}
        onArchive={archiveThread}
        onDelete={deleteThread}
        onOpenDirectory={openDirectory}
        onProjectSettings={(projectId) => {
          const thread = threads.find((candidate) => candidate.projectId === projectId);
          if (thread) {
            selectThread(thread.id);
            setControlTab("project");
          }
        }}
        onSettings={() => setControlTab("app")}
      />
      <div className="main">
        {isMock && <div className="mock-banner">Browser design preview — mock engine. Run the Stereo desktop app for real agents.</div>}
        {!selected && <div className="window-drag-region" aria-hidden="true" />}
        {booting ? (
          <div className="app-loading"><span className="loading-spinner" /> Loading your workspace…</div>
        ) : selected ? (
          <>
            <div className="thread-header">
              <div className="title" title={selected.title}>{selected.title}</div>
              <button className="header-meta repo" title={`Open ${selected.cwd}`} onClick={() => void openDirectory(selected)}>
                {selectedProject?.name ?? shortPath(selected.cwd)}
              </button>
              <span className="header-meta model" title={agentSummary(selected.agent)}>{agentSummary(selected.agent)}</span>
              {selected.kind === "review" && selected.permission === "read-only" && <span className="review-state">Review · Read only</span>}
              <span className="header-meta usage">{formatTokens(selected.usage.inputTokens + selected.usage.outputTokens)} tokens</span>
              <span className="spacer" />
              {stats &&
                (stats.filesChanged === 0 ? (
                  <span className="repo-state clean">Clean</span>
                ) : (
                  <span className="repo-state">
                    {stats.filesChanged} file{stats.filesChanged === 1 ? "" : "s"} <span className="add">+{stats.additions}</span>{" "}
                    <span className="del">−{stats.deletions}</span>
                  </span>
                ))}
              <div className="header-actions">
                <button
                  className="header-action"
                  aria-expanded={Boolean(threadAgentDraft)}
                  onClick={() => {
                    setMenu(null);
                    if (threadAgentDraft) {
                      setThreadAgentDraft(null);
                      focusComposerAfterRender();
                    } else {
                      setThreadAgentDraft({ ...selected.agent });
                    }
                  }}
                >
                  Info
                </button>
                <button className="header-action" disabled={selected.status === "running"} onClick={() => openMenu("fork")}>
                  Fork
                </button>
                <button className={`header-action review ${stats && stats.filesChanged > 0 ? "has-changes" : ""}`} disabled={selected.status === "running"} onClick={() => openMenu("review")}>
                  Review
                </button>
                {threadAgentDraft && (
                  <>
                    <div className="menu-dismiss" onClick={() => { setThreadAgentDraft(null); focusComposerAfterRender(); }} />
                    <div className="action-menu thread-info-menu" role="dialog" aria-label="Thread info">
                      <div className="thread-info-heading">
                        <strong>Thread info</strong>
                        <span>Controls for future turns</span>
                      </div>
                      <div className="thread-info-row">
                        <span>Folder</span>
                        <button title={selected.cwd} onClick={() => void openDirectory(selected)}>{shortPath(selected.cwd)}</button>
                      </div>
                      <div className="thread-info-row">
                        <label htmlFor="thread-access">Access</label>
                        <select
                          id="thread-access"
                          disabled={Boolean(selected.archivedAt)}
                          value={selected.permission}
                          onChange={(event) => void stereo.setThreadPermission(selected.id, event.target.value as PermissionMode).catch((error) => setAppError(error instanceof Error ? error.message : String(error)))}
                        >
                          <option value="workspace-write">Write</option>
                          {selected.agent.agent === "claude" && <option value="ask">Ask before writes</option>}
                          <option value="read-only">Read only</option>
                        </select>
                      </div>
                      <div className="thread-info-row">
                        <label htmlFor="thread-ready-sound">Sound</label>
                        <select
                          id="thread-ready-sound"
                          value={selected.readySound ?? "inherit"}
                          onChange={(event) => {
                            const value = event.target.value;
                            void stereo.setThreadReadySound(selected.id, value === "inherit" ? null : value as ReadySound)
                              .catch((error) => setAppError(error instanceof Error ? error.message : String(error)));
                          }}
                        >
                          <option value="inherit">Use app default ({readySoundLabel(settings?.readySound ?? "off")})</option>
                          <option value="off">Off for this thread</option>
                          <option value="standard">Standard</option>
                          <option value="prominent">Prominent (repeat)</option>
                        </select>
                      </div>
                      <div className="thread-info-row usage-detail">
                        <span>Usage</span>
                        <span>{formatTokens(selected.usage.inputTokens)} in · {formatTokens(selected.usage.outputTokens)} out</span>
                      </div>
                      <div className="thread-info-section">
                        <span>Model</span>
                        <AgentPicker
                          value={threadAgentDraft}
                          onChange={setThreadAgentDraft}
                          agents={agents}
                          allowAgentChange={false}
                          disabled={selected.status === "running" || Boolean(selected.archivedAt) || (queueByThread[selected.id]?.length ?? 0) > 0}
                        />
                      </div>
                      {(selected.status === "running" || (queueByThread[selected.id]?.length ?? 0) > 0) && (
                        <div className="model-menu-note">Finish the running and queued work before changing models.</div>
                      )}
                      {selected.archivedAt && <div className="model-menu-note">Restore this thread before changing its controls.</div>}
                      <div className="model-menu-actions">
                        <button className="btn ghost" onClick={() => { setThreadAgentDraft(null); focusComposerAfterRender(); }}>Close</button>
                        <button
                          className="btn primary"
                          disabled={selected.status === "running" || Boolean(selected.archivedAt) || (queueByThread[selected.id]?.length ?? 0) > 0}
                          onClick={() => void saveThreadAgent()}
                        >
                          Apply model
                        </button>
                      </div>
                      <div className="model-menu-note">Fork the thread to switch between Claude and Codex.</div>
                    </div>
                  </>
                )}
                {menu && (
                  <>
                    <div className="menu-dismiss" onClick={() => { setMenu(null); focusComposerAfterRender(); }} />
                    <div className="action-menu">
                      <div className="action-menu-title">
                        {menu === "fork"
                          ? "Duplicate this thread — full context handoff to any model"
                          : "Review uncommitted work with any model"}
                      </div>
                      <AgentPicker value={menuAgent} onChange={setMenuAgent} agents={agents} />
                      <button className="btn primary" onClick={() => void confirmMenu()}>
                        {menu === "fork" ? `Fork with ${AGENT_NAME[menuAgent.agent]}` : `Review with ${AGENT_NAME[menuAgent.agent]}`}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
            <Thread
              key={selected.id}
              thread={selected}
              events={eventsByThread[selected.id] ?? []}
              live={liveByThread[selected.id] ?? ""}
              onOpenLink={(href) => {
                void stereo.openLink(selected.id, href).catch((error) => {
                  setAppError(error instanceof Error ? error.message : String(error));
                });
              }}
              onResolvePermission={(requestId, allowed) => {
                void stereo.resolvePermission(requestId, allowed).catch((error) => setAppError(error instanceof Error ? error.message : String(error)));
              }}
            />
            {selected.archivedAt ? (
              <div className="archived-thread-bar">
                <div><strong>Archived conversation</strong><span>Restore it to continue working in this thread.</span></div>
                <button className="btn primary" onClick={() => void archiveThread(selected, false)}>Restore thread</button>
              </div>
            ) : (
              <>
                <QueueList
                  items={queueByThread[selected.id] ?? []}
                  onRemove={(messageId) => void stereo.removeQueued(selected.id, messageId)}
                  onMove={(messageId, direction) => void stereo.moveQueued(selected.id, messageId, direction)}
                />
                <Composer
                  key={selected.id}
                  draftKey={`thread:${selected.id}`}
                  placeholder={selected.kind === "review" && selected.permission === "read-only"
                    ? `Ask ${AGENT_NAME[selected.agent.agent]} about the review or request fixes…`
                    : `Message ${AGENT_NAME[selected.agent.agent]}…`}
                  running={selected.status === "running"}
                  hint={selected.kind === "review" && selected.permission === "read-only"
                    ? "Review is read-only · Sending a message lets you enable changes"
                    : undefined}
                  onSubmit={async (text, attachments) => {
                    try {
                      const threadId = selected.id;
                      if (selected.kind === "review" && selected.permission === "read-only") {
                        const decision = await requestReviewAccess(selected);
                        if (decision === "cancel") return false;
                        if (decision === "write") await stereo.promoteReview(threadId);
                      }
                      await stereo.sendMessage(threadId, text, attachments);
                      return true;
                    } catch (error) {
                      setAppError(error instanceof Error ? error.message : String(error));
                      return false;
                    }
                  }}
                  onInterrupt={() => void stereo.interrupt(selected.id)}
                />
              </>
            )}
          </>
        ) : (
          <NewThread
            cwd={draftCwd}
            recentDirs={recentDirs}
            agent={draftAgent}
            permission={draftPermission}
            agents={agents}
            onPickDir={() => void pickDir()}
            onUseDir={(d) => {
              useDirectory(d);
            }}
            onAgentChange={(agent) => {
              setDraftAgent(agent);
              if (agent.agent === "codex" && draftPermission === "ask") setDraftPermission("workspace-write");
            }}
            onPermissionChange={setDraftPermission}
            onSubmit={createFromDraft}
          />
        )}
        {appError && (
          <div className="toast error-toast" role="alert">
            <span>{appError}</span>
            <button onClick={() => { setAppError(null); focusComposerAfterRender(); }} aria-label="Dismiss">×</button>
          </div>
        )}
        {controlTab && settings && <ControlCenter thread={selected} agents={agents} settings={settings} initialTab={controlTab} onSettingsChange={settingsChange} onClose={() => { setControlTab(null); void stereo.listProjects().then(setProjects); focusComposerAfterRender(); }} onError={setAppError} />}
        {paletteOpen && <CommandPalette commands={paletteCommands} onClose={() => { setPaletteOpen(false); focusComposerAfterRender(); }} />}
        {reviewGate && <ReviewAccessDialog agent={reviewGate.agent} onDecision={resolveReviewAccess} />}
      </div>
    </div>
  );
}
