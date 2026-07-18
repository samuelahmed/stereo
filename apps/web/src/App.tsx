import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { StereoCharacter } from "../../../branding/stereo/component/StereoCharacter";

const POSIX_INSTALL_COMMAND = "curl -fsSL https://getstereo.dev/install | sh";
const WINDOWS_INSTALL_COMMAND = "curl.exe -fsSL https://getstereo.dev/install.ps1 | Out-String | iex";
const GITHUB_URL = "https://github.com/samuelahmed/stereo";

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

function InstallCommand({ compact = false }: { compact?: boolean }) {
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
    <div className={`install-command ${compact ? "compact" : ""}`}>
      <span className="prompt" aria-hidden="true">{command === WINDOWS_INSTALL_COMMAND ? ">" : "$"}</span>
      <code>{command}</code>
      <button type="button" onClick={() => void copy()} aria-label={copied ? "Install command copied" : "Copy install command"}>
        <CopyIcon copied={copied} />
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}

function ProductWindow() {
  return (
    <div className="product-window" role="img" aria-label="Stereo showing a Claude conversation in the Stereo repository">
      <div className="window-bar">
        <span className="traffic red" />
        <span className="traffic yellow" />
        <span className="traffic green" />
        <span className="window-name">Stereo</span>
      </div>
      <div className="window-body">
        <aside className="mock-sidebar">
          <div className="mock-brand">
            <StereoCharacter size={29} motion="idle" label="" />
            <strong>stereo</strong>
          </div>
          <div className="mock-new"><span>＋</span> New thread <kbd>⌘N</kbd></div>
          <div className="mock-search">⌕&nbsp;&nbsp;Search threads</div>
          <div className="mock-project"><span>⌄&nbsp;&nbsp;STEREO</span><small>3</small></div>
          <div className="mock-thread active"><i className="claude-dot" /> Refine persistence recovery</div>
          <div className="mock-thread"><i className="codex-dot" /> Trace renderer startup</div>
          <div className="mock-thread"><i className="claude-dot" /> Simplify review handoff</div>
          <div className="mock-settings">Settings <kbd>⌘,</kbd></div>
        </aside>

        <div className="mock-main">
          <div className="mock-header">
            <div className="mock-heading">
              <strong>Refine persistence recovery</strong>
              <span>stereo</span><span>Claude · Opus</span><span>18.4k tokens</span>
            </div>
            <div className="mock-header-right">
              <span className="mock-diff">3 files <i>+84</i> <b>−19</b></span>
              <span>Info</span><span>Fork</span><strong>Review</strong>
            </div>
          </div>

          <div className="mock-transcript">
            <div className="mock-user">
              <span>YOU</span>
              <p>Make startup recovery corruption-safe. Preserve every valid transcript entry and keep the change scoped.</p>
            </div>
            <div className="mock-tools">
              <span className="chevron">⌄</span>
              <strong>6 tool calls</strong>
              <span>store.ts · store.test.ts · pnpm test</span>
            </div>
            <div className="mock-agent">
              <span>CLAUDE</span>
              <p>I changed recovery to validate the append-only log one entry at a time. A partial final write is quarantined while every earlier valid event remains available.</p>
              <div className="mock-result"><CheckIcon /> 38 tests passed</div>
            </div>
          </div>

          <div className="mock-composer">
            <span>Ask a follow-up…</span>
            <small>⌘↵ send</small>
            <b>↑</b>
          </div>
        </div>
      </div>
    </div>
  );
}

const loopStories = [
  {
    label: "Clean",
    surface: "Clean",
    title: "Start with a clean working tree.",
    copy: "Now the boundary is obvious. You know exactly what belongs to the next change, anything can be reverted without archaeology, and the repo is ready to go.",
    extra: null,
    detail: "git status --short  →  no output",
  },
  {
    label: "Build",
    surface: "Build",
    title: "Work in Stereo.",
    copy: "Stereo is designed for this build step: use Claude, Codex, or both to complete one scoped change on one branch. Open as many conversations as the change needs; they all work against the same checkout.",
    extra: "Fork a thread to the other lab when you want a different approach. Or use the built-in Review feature to hand the conversation and current changes to the other harness for a second set of eyes.",
    detail: "one branch  ·  one scoped change  ·  multiple conversations",
  },
  {
    label: "Review",
    surface: "Review",
    title: "Go back to your editor.",
    copy: "Read the diff in whatever review tool you already use. Run the code and your existing tests until you understand and trust the change.",
    extra: null,
    detail: "diff  ·  run  ·  test  ·  understand",
  },
  {
    label: "Commit",
    surface: "Commit",
    title: "Commit however you already do.",
    copy: "Keep what belongs, write the message, and commit from your IDE or CLI. The commit is the checkpoint; the clean tree means the next loop can begin.",
    extra: null,
    detail: "git add  ·  git commit  ·  clean",
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

  const pointerAngle = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return Math.atan2(event.clientY - bounds.top - bounds.height / 2, event.clientX - bounds.left - bounds.width / 2) * 180 / Math.PI;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
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
    <div className="loop-experience">
      <div className="loop-dial-column">
        <div
          className={`loop-dial ${dragging ? "dragging" : ""}`}
          role="group"
          aria-label="Interactive commit loop. Drag the wheel, choose a step, or use the arrow keys."
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); moveBy(1); }
            if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); moveBy(-1); }
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
                <button className={`loop-node ${index === active ? "active" : ""}`} style={style} type="button" key={item.label} onClick={() => moveTo(index)} aria-pressed={index === active}>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
          <div className="loop-core" aria-hidden="true">
            <div key={characterReaction} className={`loop-core-character ${characterReaction > 0 ? "reacting" : ""}`}>
              <StereoCharacter size={82} motion="idle" label="" />
            </div>
            <span>Commit loop</span>
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

const features = [
  {
    number: "01",
    title: "Claude & Codex, one home.",
    copy: "Run Claude and Codex against any repository without changing the native tools underneath.",
    detail: "Two native harnesses. One local interface.",
  },
  {
    number: "02",
    title: "History that stays yours.",
    copy: "Every thread is stored locally as a vendor-neutral transcript you can browse, resume, and carry forward.",
    detail: "The harness session is an accelerator—not the record.",
  },
  {
    number: "03",
    title: "Fork across labs.",
    copy: "Continue any conversation with the other lab, with the context handed over and every trim made visible.",
    detail: "A new perspective without starting over.",
  },
  {
    number: "04",
    title: "Built-in review feature.",
    copy: "Send your context and uncommitted change to the other harness for a second set of eyes, then follow up in the same thread.",
    detail: "One-click review built above both harnesses.",
  },
];

export function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const close = () => setMenuOpen(false);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("resize", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <a className="brand-link" href="#top" aria-label="Stereo home">
          <StereoCharacter size={35} motion="idle" label="" />
          <span>stereo</span>
        </a>
        <nav className={menuOpen ? "open" : ""} aria-label="Primary navigation">
          <a href="#why" onClick={() => setMenuOpen(false)}>Why Stereo</a>
          <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
          <a className="github-nav" href={GITHUB_URL} target="_blank" rel="noreferrer">
            <GitHubIcon /> GitHub
          </a>
        </nav>
        <button className="menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          <span /><span />
        </button>
      </header>

      <main id="main">
        <section className="hero" id="top">
          <div className="hero-copy">
            <h1>Claude & Codex.<br /><em>One window.</em></h1>
            <p className="hero-lede">
              Stereo is a desktop shell for coding harnesses. Run Claude and Codex against your repos, keep permanent vendor-neutral history, and review a change with the other harness in one click.
            </p>
            <p className="subscription-note">Uses your existing Claude and Codex subscriptions.</p>
            <p className="preview-note">Install the early developer preview, or grab the source and hack it into whatever you need.</p>
            <InstallCommand />
            <div className="hero-actions">
              <a className="source-link" href={GITHUB_URL} target="_blank" rel="noreferrer">
                <GitHubIcon /> Get the source <ArrowIcon />
              </a>
              <span>macOS + Windows · runs locally</span>
            </div>
          </div>
          <div className="hero-product">
            <div className="product-halo" aria-hidden="true" />
            <ProductWindow />
          </div>
        </section>

        <section className="why-section" id="why">
          <div className="why-intro">
            <p>We built Stereo because we like programming in a <em>Commit Loop</em>: use Stereo to build one scoped change, review it in your IDE, commit it, and start again from a clean working tree.</p>
          </div>
          <CommitLoop />
        </section>

        <section className="features-section" id="features">
          <div className="features-heading">
            <div>
              <div className="section-kicker">What Stereo adds</div>
              <h2>Built above the harnesses,<br />not instead of them.</h2>
            </div>
            <p>Stereo uses the native CLI subscriptions already signed in on your computer. It gives them one durable interface—and gives you capabilities that live between them.</p>
          </div>

          <div className="features-grid">
            {features.map((feature) => (
              <article className="feature-card" key={feature.number}>
                <span className="feature-number">{feature.number}</span>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
                <small>{feature.detail}</small>
              </article>
            ))}
          </div>

          <div className="preview-cta">
            <div className="cta-character">
              <StereoCharacter size={112} color="#FFFAF1" motion="wink" label="Stereo" />
            </div>
            <div className="cta-copy">
              <span>Open source developer preview</span>
              <h3>Bring both labs into Stereo.</h3>
              <p>Install from the command line, or inspect every line and run it from source.</p>
            </div>
            <div className="cta-actions">
              <InstallCommand compact />
              <a className="source-link" href={GITHUB_URL} target="_blank" rel="noreferrer">
                <GitHubIcon /> View on GitHub <ArrowIcon />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <a className="footer-brand" href="#top">
          <img src={`${import.meta.env.BASE_URL}mark-ink.svg`} alt="" />
          <span>stereo</span>
        </a>
        <p>A shell for coding harnesses.</p>
        <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </div>
  );
}
