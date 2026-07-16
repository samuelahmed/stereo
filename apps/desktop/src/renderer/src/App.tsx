import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentSelection, AgentStatusInfo, Attachment, DiffStats, EventEnvelope, PermissionMode, QueuedMessage, Settings, Thread as ThreadT } from "@stereo/core";
import { bridgeFailed, isMock, stereo } from "./bridge";
import { AGENT_NAME, agentSummary, formatTokens, otherAgent, shortPath } from "./labels";
import { AgentPicker } from "./components/AgentPicker";
import { Composer } from "./components/Composer";
import { NewThread } from "./components/NewThread";
import { QueueList } from "./components/QueueList";
import { Sidebar } from "./components/Sidebar";
import { Thread } from "./components/Thread";

type Catalog = { claude: AgentStatusInfo; codex: AgentStatusInfo } | null;

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

export function App() {
  const [threads, setThreads] = useState<ThreadT[]>([]);
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
  const [draftAgent, setDraftAgent] = useState<AgentSelection>({ agent: "claude", model: null, effort: null });
  const [draftPermission, setDraftPermission] = useState<PermissionMode>("workspace-write");
  const [menu, setMenu] = useState<"fork" | "review" | null>(null);
  const [menuAgent, setMenuAgent] = useState<AgentSelection>({ agent: "codex", model: null, effort: null });

  const selected = useMemo(() => threads.find((t) => t.id === selectedId) ?? null, [threads, selectedId]);
  const selectedRef = useRef<ThreadT | null>(null);
  selectedRef.current = selected;
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  useEffect(() => {
    void Promise.all([
      stereo.getSettings().then((s) => {
        setSettings(s);
        setDraftAgent(s.defaultAgent);
        setDraftPermission(s.defaultPermission);
      }),
      stereo.detectAgents().then(setAgents),
      stereo.listThreads().then((loaded) => {
        setThreads(loaded);
        const remembered = localStorage.getItem("stereo:selected-thread");
        if (remembered && loaded.some((thread) => thread.id === remembered)) setSelectedId(remembered);
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
    return () => {
      offThreads();
      offEvent();
      offDelta();
      offQueue();
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

  useEffect(() => {
    document.title = unreadIds.size ? `(${unreadIds.size}) Stereo` : "Stereo";
  }, [unreadIds]);

  // Esc interrupts the selected thread's running turn — the Claude Code gesture.
  // A dialog or open menu captures Esc for itself: dismissing UI chrome must
  // never kill a running turn.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const current = selectedRef.current;
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

  const selectThread = useCallback((id: string | null) => {
    setSelectedId(id);
    setMenu(null);
    if (id === null) localStorage.removeItem("stereo:selected-thread");
    else localStorage.setItem("stereo:selected-thread", id);
    if (id) setUnreadIds((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const id = selectedId;
    if (!id) return;
    void stereo.threadEvents(id)
      .then((history) => {
        setEventsByThread((prev) => {
          const seen = new Set((prev[id] ?? []).map((e) => e.seq));
          const merged = [...(prev[id] ?? []), ...history.filter((e) => !seen.has(e.seq))];
          merged.sort((a, b) => a.seq - b.seq);
          return { ...prev, [id]: merged };
        });
      })
      .catch((error) => setAppError(error instanceof Error ? error.message : String(error)));
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
        setDraftCwd(picked);
        rememberDir(picked);
      }
    } catch (error) {
      setAppError(error instanceof Error ? error.message : String(error));
    }
  }, [rememberDir]);

  const createFromDraft = useCallback(
    async (text: string, attachments: Attachment[]): Promise<boolean> => {
      try {
        const cwd = draftCwd ?? (await stereo.pickDir());
        if (!cwd) return false;
        setDraftCwd(cwd);
        const thread = await stereo.createThread({ cwd, agent: draftAgent, permission: draftPermission });
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

  const deleteThread = useCallback(async (thread: ThreadT) => {
    await stereo.deleteThread(thread.id);
    if (selectedId === thread.id) selectThread(threads.find((candidate) => candidate.id !== thread.id)?.id ?? null);
    setEventsByThread((previous) => {
      const next = { ...previous };
      delete next[thread.id];
      return next;
    });
  }, [selectedId, selectThread, threads]);

  const openMenu = useCallback(
    (which: "fork" | "review") => {
      if (!selected) return;
      setMenuAgent(
        which === "review"
          ? { agent: otherAgent(selected.agent.agent), model: null, effort: null }
          : { ...selected.agent },
      );
      setMenu((prev) => (prev === which ? null : which));
    },
    [selected],
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

  const settingsChange = useCallback(
    (next: Settings) => {
      if (!settings) return;
      const previous = settings;
      // Only sync the new-thread draft with the default that actually changed —
      // toggling an unrelated setting must not clobber an in-progress draft.
      const agentChanged = next.defaultAgent !== previous.defaultAgent;
      const permissionChanged = next.defaultPermission !== previous.defaultPermission;
      setSettings(next);
      if (agentChanged) setDraftAgent(next.defaultAgent);
      if (permissionChanged) setDraftPermission(next.defaultPermission);
      void stereo.setSettings(next).catch((error) => {
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

  return (
    <div className="app">
      <Sidebar
        threads={threads}
        selectedId={selectedId}
        unreadIds={unreadIds}
        agents={agents}
        settings={settings}
        width={sidebarWidth}
        onWidthChange={resizeSidebar}
        onSelect={selectThread}
        onRename={renameThread}
        onDelete={deleteThread}
        onOpenDirectory={openDirectory}
        onSettingsChange={settingsChange}
      />
      <div className="main">
        {isMock && <div className="mock-banner">Browser design preview — mock engine. Run the Stereo desktop app for real agents.</div>}
        {booting ? (
          <div className="app-loading"><span className="loading-spinner" /> Loading your workspace…</div>
        ) : selected ? (
          <>
            <div className="thread-header">
              <span className={`status-dot ${selected.agent.agent} ${selected.status === "running" ? "pulse" : ""}`} />
              <span className="title">{selected.title}</span>
              <button className="chip cwd-chip" title={`Open ${selected.cwd}`} onClick={() => void openDirectory(selected)}>
                {shortPath(selected.cwd)}
              </button>
              <span className={`chip agent-chip ${selected.agent.agent}`} title="Harness and model are fixed for this native session. Fork to change them.">{agentSummary(selected.agent)}</span>
              <select
                className="chip permission-select"
                aria-label="Thread access"
                title="Access for future turns in this thread"
                value={selected.permission}
                onChange={(event) => void stereo.setThreadPermission(selected.id, event.target.value as PermissionMode).catch((error) => setAppError(error instanceof Error ? error.message : String(error)))}
              >
                <option value="workspace-write">Write access</option>
                <option value="read-only">Read only</option>
              </select>
              {stats &&
                (stats.filesChanged === 0 ? (
                  <span className="chip diff-chip clean">clean</span>
                ) : (
                  <span className="chip diff-chip">
                    {stats.filesChanged} file{stats.filesChanged === 1 ? "" : "s"} <span className="add">+{stats.additions}</span>{" "}
                    <span className="del">−{stats.deletions}</span>
                  </span>
                ))}
              <span className="spacer" />
              <span className="usage">{formatTokens(selected.usage.inputTokens + selected.usage.outputTokens)} tok</span>
              <div className="header-actions">
                <button className="btn ghost" onClick={() => openMenu("fork")}>
                  ⑂ Fork
                </button>
                <button className="btn" onClick={() => openMenu("review")}>
                  ◐ Review
                </button>
                {menu && (
                  <>
                    <div className="menu-dismiss" onClick={() => setMenu(null)} />
                    <div className="action-menu">
                      <div className="action-menu-title">
                        {menu === "fork"
                          ? "Duplicate this thread — full context handoff to any model"
                          : "Second opinion on the uncommitted diff"}
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
              thread={selected}
              events={eventsByThread[selected.id] ?? []}
              live={liveByThread[selected.id] ?? ""}
              onOpenLink={(href) => {
                void stereo.openLink(selected.id, href).catch((error) => {
                  setAppError(error instanceof Error ? error.message : String(error));
                });
              }}
            />
            <QueueList
              items={queueByThread[selected.id] ?? []}
              onRemove={(messageId) => void stereo.removeQueued(selected.id, messageId)}
              onMove={(messageId, direction) => void stereo.moveQueued(selected.id, messageId, direction)}
            />
            <Composer
              key={selected.id}
              draftKey={`thread:${selected.id}`}
              placeholder={`Message ${AGENT_NAME[selected.agent.agent]} — it resumes right where the thread left off`}
              running={selected.status === "running"}
              onSubmit={async (text, attachments) => {
                try {
                  await stereo.sendMessage(selected.id, text, attachments);
                  return true;
                } catch (error) {
                  setAppError(error instanceof Error ? error.message : String(error));
                  return false;
                }
              }}
              onInterrupt={() => void stereo.interrupt(selected.id)}
            />
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
              setDraftCwd(d);
              rememberDir(d);
            }}
            onAgentChange={setDraftAgent}
            onPermissionChange={setDraftPermission}
            onSubmit={createFromDraft}
          />
        )}
        {appError && (
          <div className="toast error-toast" role="alert">
            <span>{appError}</span>
            <button onClick={() => setAppError(null)} aria-label="Dismiss">×</button>
          </div>
        )}
      </div>
    </div>
  );
}
