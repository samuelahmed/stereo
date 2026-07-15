import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentSelection, AgentStatusInfo, DiffStats, EventEnvelope, Settings, Thread as ThreadT } from "@stereo/core";
import { bridgeFailed, isMock, stereo } from "./bridge";
import { AGENT_NAME, agentSummary, formatTokens, otherAgent, shortPath } from "./labels";
import { AgentPicker } from "./components/AgentPicker";
import { Composer } from "./components/Composer";
import { NewThread } from "./components/NewThread";
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

export function App() {
  const [threads, setThreads] = useState<ThreadT[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [eventsByThread, setEventsByThread] = useState<Record<string, EventEnvelope[]>>({});
  const [liveByThread, setLiveByThread] = useState<Record<string, string>>({});
  const [statsByThread, setStatsByThread] = useState<Record<string, DiffStats | null>>({});
  const [agents, setAgents] = useState<Catalog>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [recentDirs, setRecentDirs] = useState<string[]>(loadRecentDirs());
  const [draftCwd, setDraftCwd] = useState<string | null>(recentDirs[0] ?? null);
  const [draftAgent, setDraftAgent] = useState<AgentSelection>({ agent: "claude", model: null, effort: null });
  const [menu, setMenu] = useState<"fork" | "review" | null>(null);
  const [menuAgent, setMenuAgent] = useState<AgentSelection>({ agent: "codex", model: null, effort: null });

  const selected = useMemo(() => threads.find((t) => t.id === selectedId) ?? null, [threads, selectedId]);
  const selectedRef = useRef<ThreadT | null>(null);
  selectedRef.current = selected;

  useEffect(() => {
    void stereo.getSettings().then((s) => {
      setSettings(s);
      setDraftAgent(s.defaultAgent);
    });
    void stereo.detectAgents().then(setAgents);
    void stereo.listThreads().then(setThreads);

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
    });
    const offDelta = stereo.onDelta(({ threadId, text }) => {
      setLiveByThread((prev) => ({ ...prev, [threadId]: (prev[threadId] ?? "") + text }));
    });
    return () => {
      offThreads();
      offEvent();
      offDelta();
    };
  }, []);

  // Esc interrupts the selected thread's running turn — the Claude Code gesture.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const current = selectedRef.current;
      if (e.key === "Escape" && current?.status === "running") {
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
    if (id === null) return;
    void stereo.threadEvents(id).then((history) => {
      setEventsByThread((prev) => {
        const seen = new Set((prev[id] ?? []).map((e) => e.seq));
        const merged = [...(prev[id] ?? []), ...history.filter((e) => !seen.has(e.seq))];
        merged.sort((a, b) => a.seq - b.seq);
        return { ...prev, [id]: merged };
      });
    });
    void stereo.threadStats(id).then((stats) => setStatsByThread((prev) => ({ ...prev, [id]: stats })));
  }, []);

  const pickDir = useCallback(async () => {
    const picked = await stereo.pickDir();
    if (picked) {
      setDraftCwd(picked);
      rememberDir(picked);
    }
  }, [rememberDir]);

  const createFromDraft = useCallback(
    async (text: string) => {
      if (!draftCwd) {
        await pickDir();
        return;
      }
      const thread = await stereo.createThread({ cwd: draftCwd, agent: draftAgent });
      await stereo.sendMessage(thread.id, text);
      rememberDir(draftCwd);
      selectThread(thread.id);
    },
    [draftCwd, draftAgent, pickDir, rememberDir, selectThread],
  );

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
    const thread =
      action === "fork" ? await stereo.forkThread(selected.id, menuAgent) : await stereo.reviewThread(selected.id, menuAgent);
    selectThread(thread.id);
  }, [selected, menu, menuAgent, selectThread]);

  const authModeChange = useCallback(
    (mode: Settings["authMode"]) => {
      if (!settings) return;
      const next = { ...settings, authMode: mode };
      setSettings(next);
      void stereo.setSettings(next);
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
        agents={agents}
        settings={settings}
        onSelect={selectThread}
        onAuthModeChange={authModeChange}
      />
      <div className="main">
        {isMock && <div className="mock-banner">Browser design preview — mock engine. Run the Stereo desktop app for real agents.</div>}
        {selected ? (
          <>
            <div className="thread-header">
              <span className={`status-dot ${selected.agent.agent} ${selected.status === "running" ? "pulse" : ""}`} />
              <span className="title">{selected.title}</span>
              <span className="chip" title={selected.cwd}>
                {shortPath(selected.cwd)}
              </span>
              <span className={`chip agent-chip ${selected.agent.agent}`}>{agentSummary(selected.agent)}</span>
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
                )}
              </div>
            </div>
            <Thread thread={selected} events={eventsByThread[selected.id] ?? []} live={liveByThread[selected.id] ?? ""} />
            <Composer
              placeholder={`Message ${AGENT_NAME[selected.agent.agent]} — it resumes right where the thread left off`}
              running={selected.status === "running"}
              onSubmit={(text) => void stereo.sendMessage(selected.id, text)}
              onInterrupt={() => void stereo.interrupt(selected.id)}
            />
          </>
        ) : (
          <NewThread
            cwd={draftCwd}
            recentDirs={recentDirs}
            agent={draftAgent}
            agents={agents}
            onPickDir={() => void pickDir()}
            onUseDir={(d) => {
              setDraftCwd(d);
              rememberDir(d);
            }}
            onAgentChange={setDraftAgent}
            onSubmit={(text) => void createFromDraft(text)}
          />
        )}
      </div>
    </div>
  );
}
