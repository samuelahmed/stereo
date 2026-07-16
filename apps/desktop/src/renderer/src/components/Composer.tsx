import { useLayoutEffect, useRef, useState } from "react";

interface Props {
  draftKey: string;
  placeholder: string;
  running: boolean;
  disabled?: boolean;
  onSubmit(text: string): boolean | Promise<boolean>;
  onInterrupt?(): void;
  hint?: string;
}

function loadDraft(key: string): string {
  try {
    return localStorage.getItem(`stereo:draft:${key}`) ?? "";
  } catch {
    return "";
  }
}

/** A durable, auto-growing composer. Enter sends and Shift+Enter adds a line. */
export function Composer({ draftKey, placeholder, running, disabled = false, onSubmit, onInterrupt, hint }: Props) {
  const [text, setText] = useState(() => loadDraft(draftKey));
  const [submitting, setSubmitting] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "0";
    element.style.height = `${Math.min(220, Math.max(62, element.scrollHeight))}px`;
  }, [text]);

  const updateText = (next: string) => {
    setText(next);
    try {
      if (next) localStorage.setItem(`stereo:draft:${draftKey}`, next);
      else localStorage.removeItem(`stereo:draft:${draftKey}`);
    } catch {
      // Draft persistence is a convenience; private storage failures should not block composing.
    }
  };

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting || disabled) return;
    setSubmitting(true);
    try {
      const accepted = await onSubmit(trimmed);
      if (accepted) updateText("");
    } finally {
      setSubmitting(false);
    }
  };

  const showStop = running && text.trim().length === 0;

  return (
    <div className="composer">
      <div className={`composer-input ${submitting ? "submitting" : ""}`}>
        <textarea
          ref={textarea}
          value={text}
          placeholder={placeholder}
          disabled={submitting || disabled}
          aria-label="Message"
          onChange={(event) => updateText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        {showStop ? (
          <button className="send-btn stop" title="Interrupt (Esc)" aria-label="Interrupt" onClick={onInterrupt}>
            ■
          </button>
        ) : (
          <button
            className="send-btn"
            title={running ? "Queue message" : "Send message"}
            aria-label={running ? "Queue message" : "Send message"}
            disabled={submitting || disabled || text.trim().length === 0}
            onClick={() => void submit()}
          >
            {submitting ? <span className="button-spinner" /> : "↑"}
          </button>
        )}
      </div>
      <div className="composer-row">
        {running && text.trim() && <span className="queue-note">This message will run next</span>}
        <span className="composer-hint">
          {hint ?? (running ? "Enter to queue · Esc to interrupt" : "Enter to send · Shift+Enter for a new line")}
        </span>
      </div>
    </div>
  );
}
