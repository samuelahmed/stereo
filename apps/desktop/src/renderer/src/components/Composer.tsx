import { useState } from "react";

interface Props {
  placeholder: string;
  running: boolean;
  onSubmit(text: string): void;
  onInterrupt?(): void;
  hint?: string;
}

/**
 * Enter sends, Shift+Enter makes a newline. While a turn runs, messages still
 * send — they queue, like in the CLIs — and the button becomes a stop control
 * when there's nothing to send. Esc interrupts (handled globally in App).
 */
export function Composer({ placeholder, running, onSubmit, onInterrupt, hint }: Props) {
  const [text, setText] = useState("");

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText("");
  };

  const showStop = running && text.trim().length === 0;

  return (
    <div className="composer">
      <div className="composer-input">
        <textarea
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {showStop ? (
          <button className="send-btn stop" title="Interrupt (Esc)" aria-label="Interrupt" onClick={onInterrupt}>
            ◼
          </button>
        ) : (
          <button
            className="send-btn"
            title="Send"
            aria-label="Send"
            disabled={text.trim().length === 0}
            onClick={submit}
          >
            ↑
          </button>
        )}
      </div>
      <div className="composer-row">
        <span className="composer-hint">
          {hint ?? (running ? "Enter to queue · Esc to interrupt" : "Enter to send · Shift+Enter for a new line")}
        </span>
      </div>
    </div>
  );
}
