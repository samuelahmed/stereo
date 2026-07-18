import { useEffect, useState } from "react";
import { StereoCharacter } from "../../../branding/stereo/component/StereoCharacter";

const INSTALL_COMMAND = "curl -fsSL https://getstereo.dev/install | sh";
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setCopied(true);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = INSTALL_COMMAND;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      setCopied(true);
    }
  };

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <div className={`install-command ${compact ? "compact" : ""}`}>
      <span className="prompt" aria-hidden="true">$</span>
      <code>{INSTALL_COMMAND}</code>
      <button type="button" onClick={() => void copy()} aria-label={copied ? "Install command copied" : "Copy install command"}>
        <CopyIcon copied={copied} />
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}

const loopSteps = [
  {
    number: "01",
    label: "Build",
    title: "Make one coherent change.",
    copy: "Choose a clear outcome. Work with Claude Code or Codex directly in your checkout, with durable conversations that stay with the project.",
    notes: ["One shared working tree", "Persistent agent context", "Your existing subscriptions"],
  },
  {
    number: "02",
    label: "Review",
    title: "Understand what changed.",
    copy: "Read the diff, run the code, ask follow-ups, or bring in the other lab for a fresh read-only review. Use whatever helps you own the result.",
    notes: ["One-click cross-lab review", "Real tool evidence", "Your editor stays the review surface"],
  },
  {
    number: "03",
    label: "Commit",
    title: "Own the checkpoint.",
    copy: "You decide what belongs, write the message, and make the commit. When the tree is clean again, the next loop can begin.",
    notes: ["No generated commits", "Git remains the undo button", "Clean tree, clear next step"],
  },
];

function ProductWindow() {
  return (
    <div className="product-window" role="img" aria-label="A stylized preview of the Stereo desktop application">
      <div className="window-bar">
        <span className="traffic red" />
        <span className="traffic yellow" />
        <span className="traffic green" />
        <span className="window-title">Stereo · session refresh</span>
        <span className="window-clean"><i /> 2 files changed</span>
      </div>
      <div className="window-body">
        <aside className="mock-sidebar">
          <div className="mock-brand">
            <StereoCharacter size={28} motion="idle" label="" />
            <strong>stereo</strong>
          </div>
          <div className="mock-new"><span>＋</span> New thread</div>
          <div className="mock-project">ACME APP <span>⌄</span></div>
          <div className="mock-thread active"><i className="claude-dot" /> Fix session refresh race</div>
          <div className="mock-thread"><i className="codex-dot" /> Trace auth lifecycle</div>
          <div className="mock-thread muted"><i /> Earlier approach</div>
        </aside>
        <div className="mock-main">
          <div className="mock-header">
            <div>
              <strong>Fix session refresh race</strong>
              <span>Claude · Opus</span>
            </div>
            <div className="mock-actions"><span>Info</span><span>Fork</span><b>Review</b></div>
          </div>
          <div className="mock-transcript">
            <div className="mock-user"><span>YOU</span><p>Fix the flaky session refresh test. Keep the production change small.</p></div>
            <div className="mock-tools">
              <span className="chevron">⌄</span>
              <strong>4 tool calls</strong>
              <span>session.spec.ts · pnpm test</span>
            </div>
            <div className="mock-agent">
              <span>CLAUDE</span>
              <p>I found a race between the refresh timer and teardown. I made the clock deterministic and waited for pending work before restoring timers.</p>
              <div className="mock-result"><CheckIcon /> 21 tests passed</div>
            </div>
          </div>
          <div className="mock-composer"><span>Ask a follow-up…</span><b>↑</b></div>
        </div>
      </div>
    </div>
  );
}

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
          <a href="#loop" onClick={() => setMenuOpen(false)}>The loop</a>
          <a href="#stereo" onClick={() => setMenuOpen(false)}>Why Stereo</a>
          <a href="#preview" onClick={() => setMenuOpen(false)}>Developer preview</a>
          <a className="github-nav" href={GITHUB_URL} target="_blank" rel="noreferrer">
            <GitHubIcon /> GitHub
          </a>
        </nav>
        <button
          className="menu-toggle"
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span /><span />
        </button>
      </header>

      <main id="main">
        <section className="hero" id="top">
          <div className="hero-grid" aria-hidden="true" />
          <div className="hero-copy">
            <div className="eyebrow"><span /> Early developer preview</div>
            <h1>One clear commit<br />at a time.</h1>
            <p className="hero-lede">
              Stereo is the desktop app for the <a href="#loop">Commit Loop</a>. Build with Claude Code or Codex, review the change, commit it yourself, and start clean again.
            </p>
            <InstallCommand />
            <div className="hero-actions">
              <a className="text-link" href={GITHUB_URL} target="_blank" rel="noreferrer">
                <GitHubIcon /> View the source <ArrowIcon />
              </a>
              <span>macOS preview · runs locally</span>
            </div>
          </div>

          <div className="hero-visual" aria-label="The Commit Loop: Build, Review, Commit">
            <div className="visual-orbit orbit-one" aria-hidden="true" />
            <div className="visual-orbit orbit-two" aria-hidden="true" />
            <div className="character-stage">
              <div className="character-shadow" />
              <StereoCharacter size={184} motion="working" label="Stereo character working through the Commit Loop" />
            </div>
            <div className="loop-chip chip-build"><span>01</span> Build</div>
            <div className="loop-chip chip-review"><span>02</span> Review</div>
            <div className="loop-chip chip-commit"><span>03</span> Commit</div>
            <div className="clean-badge"><CheckIcon /> working tree clean</div>
          </div>
        </section>

        <section className="definition" id="loop">
          <div className="section-kicker">The Commit Loop</div>
          <blockquote>
            It begins with a <em>clean working tree</em> and ends with a <em>clean working tree</em>—with one coherent commit between them.
          </blockquote>
          <div className="loop-line" aria-hidden="true">
            <span className="clean-node">Clean</span>
            <i />
            <span>Build</span>
            <i />
            <span>Review</span>
            <i />
            <span>Commit</span>
            <i />
            <span className="clean-node">Clean</span>
          </div>
        </section>

        <section className="steps-section" aria-labelledby="steps-title">
          <div className="section-heading">
            <div>
              <div className="section-kicker">A small, deliberate rhythm</div>
              <h2 id="steps-title">Build. Review. Commit. Repeat.</h2>
            </div>
            <p>Not a rule for everyone. One useful way to keep AI-assisted work focused, legible, and easy to take ownership of.</p>
          </div>
          <div className="steps-grid">
            {loopSteps.map((step) => (
              <article className="step-card" key={step.label}>
                <div className="step-top"><span>{step.number}</span><b>{step.label}</b></div>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
                <ul>
                  {step.notes.map((note) => <li key={note}><CheckIcon /> {note}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="stereo-section" id="stereo">
          <div className="product-copy">
            <div className="section-kicker">Why Stereo</div>
            <h2>You can do this with terminals. Stereo makes it a rhythm.</h2>
            <p>
              Keep Claude Code and Codex conversations together, in the repository they belong to. Switch perspective without rebuilding context. Review the working change without leaving the thread behind.
            </p>
            <div className="feature-list">
              <div><span>01</span><p><strong>Both labs, one window</strong>Persistent threads over the CLI subscriptions you already use.</p></div>
              <div><span>02</span><p><strong>One-click second opinion</strong>Send the transcript and uncommitted diff to either lab, read-only.</p></div>
              <div><span>03</span><p><strong>Your checkout stays real</strong>No hidden branches, generated commits, or separate filesystem reality.</p></div>
            </div>
          </div>
          <ProductWindow />
        </section>

        <section className="approach-section">
          <div className="approach-mark">
            <StereoCharacter size={86} motion="wink" label="Stereo" />
          </div>
          <div className="approach-copy">
            <div className="section-kicker">One approach, on purpose</div>
            <h2>Multiple conversations.<br />One working tree.</h2>
          </div>
          <div className="approach-body">
            <p>
              Some work calls for parallel branches and isolated worktrees. The Commit Loop is for a developer guiding one coherent change, understanding the result, and moving forward in frequent checkpoints.
            </p>
            <p>
              Stereo is designed for that particular rhythm. Your editor remains the place you inspect code. Git remains the place you decide what lasts.
            </p>
          </div>
        </section>

        <section className="preview-section" id="preview">
          <div className="preview-glow" aria-hidden="true" />
          <div className="preview-character">
            <StereoCharacter size={132} color="#FFFAF1" motion="idle" label="Stereo" />
          </div>
          <div className="preview-copy">
            <div className="preview-label">Developer preview</div>
            <h2>Try your next Commit Loop in Stereo.</h2>
            <p>Install from the command line, or inspect every line on GitHub and run it from source. Stereo stays local and uses the Claude Code and Codex subscriptions already on your machine.</p>
            <InstallCommand compact />
            <a className="source-link" href={GITHUB_URL} target="_blank" rel="noreferrer">
              <GitHubIcon /> Read the source before you run it <ArrowIcon />
            </a>
          </div>
        </section>
      </main>

      <footer>
        <a className="footer-brand" href="#top">
          <img src={`${import.meta.env.BASE_URL}mark-ink.svg`} alt="" />
          <span>stereo</span>
        </a>
        <p>Build. Review. Commit. Repeat.</p>
        <div>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
