import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { StereoCharacter } from "../../../branding/stereo/component/StereoCharacter";

const POSIX_INSTALL_COMMAND = "curl -fsSL https://getstereo.dev/install | sh";
const WINDOWS_INSTALL_COMMAND = "curl.exe -fsSL https://getstereo.dev/install.ps1 | Out-String | iex";
const GITHUB_URL = "https://github.com/samuelahmed/stereo";

/* ---------- Icons ---------- */

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5a9.7 9.7 0 0 0-3.07 18.9c.49.1.67-.2.67-.46v-1.7c-2.73.6-3.3-1.16-3.3-1.16-.45-1.15-1.1-1.46-1.1-1.46-.9-.62.07-.6.07-.6 1 .07 1.52 1.02 1.52 1.02.89 1.52 2.32 1.08 2.89.83.09-.64.35-1.08.63-1.33-2.18-.25-4.47-1.09-4.47-4.85 0-1.07.38-1.95 1.02-2.63-.1-.25-.45-1.25.1-2.6 0 0 .83-.26 2.67 1a9.3 9.3 0 0 1 4.86 0c1.84-1.26 2.67-1 2.67-1 .55 1.35.2 2.35.1 2.6.64.68 1.02 1.56 1.02 2.63 0 3.77-2.3 4.6-4.48 4.84.36.3.67.9.67 1.8v2.65c0 .26.18.57.68.47A9.7 9.7 0 0 0 12 2.5Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3.25 8.2 3.05 3.05 6.45-6.5" />
    </svg>
  );
}

function CopyIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <CheckIcon />
  ) : (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="5.25" y="5.25" width="7.5" height="7.5" rx="1.25" />
      <path d="M10.75 5.25V4.5c0-.7-.55-1.25-1.25-1.25h-6c-.7 0-1.25.55-1.25 1.25v6c0 .7.55 1.25 1.25 1.25h1.75" />
    </svg>
  );
}

/* ---------- Install command ---------- */

function InstallCommand() {
  const [copied, setCopied] = useState(false);
  const [command, setCommand] = useState(POSIX_INSTALL_COMMAND);

  useEffect(() => {
    if (/Windows/i.test(navigator.userAgent)) setCommand(WINDOWS_INSTALL_COMMAND);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = command;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
  };

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <div className="install-command">
      <span className="prompt" aria-hidden="true">{command === WINDOWS_INSTALL_COMMAND ? ">" : "$"}</span>
      <code>{command}</code>
      <button type="button" onClick={() => void copy()} aria-label={copied ? "Install command copied" : "Copy install command"}>
        <CopyIcon copied={copied} />
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}

/* ---------- Product window (accurate mock: Codex reviewing Claude's diff) ---------- */

function ProductWindow() {
  return (
    <div
      className="product-window"
      role="img"
      aria-label="The Stereo app: Codex giving a read-only review of a change built with Claude, in the same window as the Claude threads"
    >
      <div className="window-bar">
        <span className="traffic red" />
        <span className="traffic yellow" />
        <span className="traffic green" />
        <span className="window-name">Stereo</span>
      </div>
      <div className="window-body">
        <aside className="mock-sidebar">
          <div className="mock-brand">
            <StereoCharacter size={30} motion="idle" label="" />
            <strong>stereo</strong>
          </div>
          <div className="mock-new"><span>＋</span> New thread <kbd>⌘N</kbd></div>
          <div className="mock-search">⌕&nbsp;&nbsp;Search threads <kbd>⌘K</kbd></div>
          <div className="mock-project"><span>⌄&nbsp;&nbsp;STEREO</span><small>4</small></div>
          <div className="mock-thread"><i className="dot claude" /> Refine persistence recovery</div>
          <div className="mock-thread active"><i className="dot codex" /> Review: persistence recovery</div>
          <div className="mock-thread"><i className="dot codex pulsing" /> Trace renderer startup</div>
          <div className="mock-thread"><i className="dot claude" /> Simplify briefing compiler</div>
          <div className="mock-settings">Settings <kbd>⌘,</kbd></div>
        </aside>

        <div className="mock-main">
          <div className="mock-header">
            <div className="mock-heading">
              <strong>Review: persistence recovery</strong>
              <em className="mock-badge">Review · Read only</em>
              <span>Codex · High</span>
            </div>
            <div className="mock-header-right">
              <span className="mock-diff">3 files <i>+84</i> <b>−19</b></span>
              <span>Info</span><span>Fork</span><strong>Review</strong>
            </div>
          </div>

          <div className="mock-transcript">
            <div className="mock-briefing">
              <span className="chevron">⌄</span>
              <strong>Briefing</strong>
              <span>uncommitted diff + conversation with Claude · ~18.4k tokens</span>
            </div>
            <div className="mock-agent codex">
              <span>CODEX</span>
              <p>
                Reviewed the diff against the thread’s intent. Two findings, by severity:
              </p>
              <ol>
                <li><b>recover() renames before fsync</b>; a crash in that window can still drop the tail entry the quarantine exists to save. <u>store.ts:214</u></li>
                <li>Low: <code>parseEntry</code> accepts a trailing half-record when the log ends exactly at the buffer boundary. <u>store.ts:171</u></li>
              </ol>
              <p className="mock-close">No style notes. The scoped-change constraint holds.</p>
            </div>
            <div className="mock-hint">Review is read-only · Sending a message lets you enable changes</div>
          </div>

          <div className="mock-composer">
            <span>Ask a follow-up…</span>
            <small>Enter to send · Shift+Enter for a new line</small>
            <b>↑</b>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- The loop ---------- */

const loopStories = [
  {
    label: "Clean",
    surface: "01 · Clean",
    title: "Start from a clean tree.",
    copy: "The boundary is obvious: whatever shows up in the diff belongs to this change, and anything can be reverted without archaeology.",
    extra: null,
    detail: "git status --short  →  no output",
  },
  {
    label: "Build",
    surface: "02 · Build",
    title: "Build the change in Stereo.",
    copy: "Use Claude, Codex, or both to complete one scoped change on one branch. Open as many threads as the change needs; they all work against the same checkout.",
    extra: "Fork a thread to the other lab for a different approach, or use the built-in Review feature to put the second agent on your diff. Approve it and the reviewer can fix its own findings.",
    detail: "one branch  ·  one scoped change  ·  multiple threads",
  },
  {
    label: "Review",
    surface: "03 · Review",
    title: "Read the diff in your editor.",
    copy: "Stereo stays out of this step on purpose. Review with the tools you already trust, and run the change until you understand it.",
    extra: null,
    detail: "diff  ·  run  ·  test  ·  understand",
  },
  {
    label: "Commit",
    surface: "04 · Commit",
    title: "Commit however you already do.",
    copy: "Keep what belongs, write the message, commit from your IDE or CLI. The tree is clean again, and the loop starts over.",
    extra: null,
    detail: "git add  ·  git commit  ·  clean again",
  },
];

function normalizeLoopIndex(index: number) {
  return ((index % loopStories.length) + loopStories.length) % loopStories.length;
}

function CommitLoop() {
  const [active, setActive] = useState(1);
  const [rotation, setRotation] = useState(-90);
  const [dragging, setDragging] = useState(false);
  const [characterReaction, setCharacterReaction] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [inView, setInView] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef(-90);
  const dragRef = useRef<{ angle: number; rotation: number } | null>(null);

  const setLoopRotation = (next: number) => {
    rotationRef.current = next;
    setRotation(next);
  };

  const moveBy = (amount: number) => {
    setCharacterReaction((reaction) => reaction + 1);
    setActive((current) => normalizeLoopIndex(current + amount));
    setLoopRotation(rotationRef.current - amount * 90);
  };

  const moveTo = (index: number) => {
    setCharacterReaction((reaction) => reaction + 1);
    let distance = index - active;
    if (distance > 2) distance -= loopStories.length;
    if (distance < -2) distance += loopStories.length;
    setActive(index);
    setLoopRotation(rotationRef.current - distance * 90);
  };

  /* The wheel turns by itself until the visitor takes over. */
  useEffect(() => {
    const node = rootRef.current;
    if (!node || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.5 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (engaged || !inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => moveBy(1), 4200);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engaged, inView]);

  const pointerAngle = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return Math.atan2(event.clientY - bounds.top - bounds.height / 2, event.clientX - bounds.left - bounds.width / 2) * 180 / Math.PI;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    setEngaged(true);
    if ((event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { angle: pointerAngle(event), rotation: rotationRef.current };
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    let delta = pointerAngle(event) - dragRef.current.angle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    setLoopRotation(dragRef.current.rotation + delta);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const step = Math.round(rotationRef.current / 90);
    const snapped = step * 90;
    dragRef.current = null;
    setDragging(false);
    setCharacterReaction((reaction) => reaction + 1);
    setLoopRotation(snapped);
    setActive(normalizeLoopIndex(-step));
  };

  const story = loopStories[active];

  return (
    <div className="loop-experience" ref={rootRef}>
      <div className="loop-dial-column">
        <div
          className={`loop-dial ${dragging ? "dragging" : ""}`}
          role="group"
          aria-label="The loop Stereo is built for. Drag the wheel, choose a step, or use the arrow keys."
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); setEngaged(true); moveBy(1); }
            if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); setEngaged(true); moveBy(-1); }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          <div className="loop-ring" aria-hidden="true"><i /><i /><i /><i /></div>
          <div className="loop-rotor" style={{ transform: `rotate(${rotation}deg)` }}>
            {loopStories.map((item, index) => {
              const angle = index * 90;
              const style = {
                "--node-angle": `${angle}deg`,
                "--upright-angle": `${-(angle + rotation)}deg`,
              } as CSSProperties;
              return (
                <button className={`loop-node ${index === active ? "active" : ""}`} style={style} type="button" key={item.label} onClick={() => { setEngaged(true); moveTo(index); }} aria-pressed={index === active}>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
          <div className="loop-core" aria-hidden="true">
            <div key={characterReaction} className={`loop-core-character ${characterReaction > 0 ? "reacting" : ""}`}>
              <StereoCharacter size={74} motion="idle" label="" />
            </div>
            <span>The loop</span>
          </div>
        </div>
      </div>

      <div className="loop-story" aria-live="polite">
        <div className="story-surface">{story.surface}</div>
        <div className="story-copy" key={story.label}>
          <h3>{story.title}</h3>
          <p>{story.copy}</p>
          {story.extra && <p>{story.extra}</p>}
          <code>{story.detail}</code>
        </div>
      </div>
    </div>
  );
}

/* ---------- The ledger ---------- */

const doesItems = [
  <>Runs the official <code>claude</code> and <code>codex</code> CLIs, the same agents you already use in the terminal.</>,
  <>Hands your diff and the conversation behind it to the other agent for review. The reviewer starts read-only; approve it and it can fix its own findings in the same thread.</>,
  <>Forks any thread to the other lab with the full context carried over.</>,
  <>Keeps every thread as plain, vendor-neutral JSONL on your disk.</>,
];

const neverItems = [
  <>Never uses API keys or metered tokens. Sign in to each CLI and your existing plans cover everything.</>,
  <>Never makes a worktree, a branch, or a commit. Agents work on your checkout, and you ship it.</>,
  <>Never asks for an account. No server, no telemetry, no hosted anything.</>,
  <>Never costs money. Free and MIT-licensed, and it stays that way.</>,
];

/* ---------- App ---------- */

export function App() {
  return (
    <div className="site-shell">
      <main>
        <header className="masthead">
          <div className="lockup">
            <StereoCharacter size={46} motion="idle" label="" />
            <span>stereo</span>
          </div>
          <h1>
            One agent writes.<br />
            The other reviews.<br />
            <em>You commit.</em>
          </h1>
          <p className="masthead-sub">
            Stereo is a free, open-source desktop app for Claude Code and Codex.
          </p>
          <div className="get">
            <p className="preview-note">Early developer preview</p>
            <InstallCommand />
            <div className="get-row">
              <a className="source-link" href={GITHUB_URL} target="_blank" rel="noreferrer">
                <GitHubIcon /> Get the source <ArrowIcon />
              </a>
              <span className="platforms">macOS · Windows · Linux</span>
            </div>
          </div>
        </header>

        <section className="preview" aria-label="App preview">
          <ProductWindow />
        </section>

        <section className="ledger" aria-label="What Stereo does and never does">
          <div className="ledger-col">
            <h2>What it does</h2>
            <ul>
              {doesItems.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          </div>
          <div className="ledger-col never">
            <h2>What it never does</h2>
            <ul>
              {neverItems.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          </div>
        </section>

        <section className="loop-section" aria-label="The loop Stereo is built for">
          <p className="loop-intro">
            We built Stereo around one loop: start clean, build a change, read the diff, commit. <em>Repeat.</em>
          </p>
          <CommitLoop />
        </section>
      </main>

      <footer>
        <p>
          MIT licensed · Claude is a product of Anthropic and Codex of OpenAI · Stereo is independent of both.
        </p>
      </footer>
    </div>
  );
}
