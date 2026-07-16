import { useLayoutEffect, useRef, useState } from "react";
import type { Attachment } from "@stereo/core";
import { stereo } from "../bridge";

interface Props {
  draftKey: string;
  placeholder: string;
  running: boolean;
  disabled?: boolean;
  onSubmit(text: string, attachments: Attachment[]): boolean | Promise<boolean>;
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

function loadAttachments(key: string): Attachment[] {
  try {
    return JSON.parse(localStorage.getItem(`stereo:draft-attachments:${key}`) ?? "[]") as Attachment[];
  } catch {
    return [];
  }
}

function isImage(attachment: Attachment): boolean {
  return attachment.mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|heic)$/i.test(attachment.name);
}

/** A durable, auto-growing composer with local file references as agent context. */
export function Composer({ draftKey, placeholder, running, disabled = false, onSubmit, onInterrupt, hint }: Props) {
  const [text, setText] = useState(() => loadDraft(draftKey));
  const [attachments, setAttachments] = useState(() => loadAttachments(draftKey));
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

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
      // Draft persistence is optional.
    }
  };

  const updateAttachments = (next: Attachment[]) => {
    setAttachments(next);
    try {
      if (next.length) localStorage.setItem(`stereo:draft-attachments:${draftKey}`, JSON.stringify(next));
      else localStorage.removeItem(`stereo:draft-attachments:${draftKey}`);
    } catch {
      // Draft persistence is optional.
    }
  };

  const addFiles = (files: FileList | File[]) => {
    if (disabled || submitting) return;
    setAttachmentError(null);
    const added: Attachment[] = [];
    for (const file of Array.from(files)) {
      try {
        const path = stereo.pathForFile(file);
        if (path) added.push({ path, name: file.name, mimeType: file.type, size: file.size });
      } catch {
        // Ignore synthetic/non-disk File objects that cannot be resolved safely.
      }
    }
    if (added.length === 0) {
      setAttachmentError("Those items could not be attached from disk.");
      return;
    }
    const unique = [...attachments];
    for (const attachment of added) {
      if (!unique.some((existing) => existing.path === attachment.path)) unique.push(attachment);
    }
    if (unique.length > 25) {
      setAttachmentError("You can attach up to 25 items at once.");
      unique.length = 25;
    }
    updateAttachments(unique);
  };

  const submit = async () => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || submitting || disabled) return;
    setSubmitting(true);
    try {
      const accepted = await onSubmit(trimmed, attachments);
      if (accepted) {
        updateText("");
        updateAttachments([]);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const hasContent = text.trim().length > 0 || attachments.length > 0;
  const showStop = running && !hasContent;

  return (
    <div className="composer">
      <div
        className={`composer-input ${submitting ? "submitting" : ""} ${dragging ? "dragging" : ""}`}
        onDragEnter={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) {
            dragDepth.current = 0;
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
        }}
      >
        {attachments.length > 0 && (
          <div className="attachment-list" aria-label="Attached files">
            {attachments.map((attachment) => (
              <div className="attachment-chip" key={attachment.path} title={attachment.path}>
                <span className={`attachment-kind ${isImage(attachment) ? "image" : "file"}`} aria-hidden="true">
                  {isImage(attachment) ? "▧" : "◇"}
                </span>
                <span className="attachment-name">{attachment.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${attachment.name}`}
                  onClick={() => updateAttachments(attachments.filter((item) => item.path !== attachment.path))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={textarea}
          value={text}
          placeholder={placeholder}
          disabled={submitting || disabled}
          aria-label="Message"
          onChange={(event) => updateText(event.target.value)}
          onPaste={(event) => {
            const files = event.clipboardData.files;
            if (files.length) addFiles(files);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <input
          ref={picker}
          className="attachment-picker"
          type="file"
          multiple
          tabIndex={-1}
          onChange={(event) => {
            if (event.target.files?.length) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <button className="attach-btn" type="button" title="Attach files" aria-label="Attach files" disabled={disabled || submitting} onClick={() => picker.current?.click()}>
          ＋
        </button>
        {showStop ? (
          <button className="send-btn stop" title="Interrupt (Esc)" aria-label="Interrupt" onClick={onInterrupt}>■</button>
        ) : (
          <button
            className="send-btn"
            title={running ? "Queue message" : "Send message"}
            aria-label={running ? "Queue message" : "Send message"}
            disabled={submitting || disabled || !hasContent}
            onClick={() => void submit()}
          >
            {submitting ? <span className="button-spinner" /> : "↑"}
          </button>
        )}
        {dragging && <div className="drop-target"><span>＋</span> Add to context</div>}
      </div>
      <div className="composer-row">
        <span className={`composer-feedback ${attachmentError ? "error" : ""}`}>
          {attachmentError ?? (attachments.length ? `${attachments.length} item${attachments.length === 1 ? "" : "s"} attached` : running && hasContent ? "This message will run next" : "")}
        </span>
        <span className="composer-hint">
          {hint ?? (running ? "Enter to queue · Esc to interrupt" : "Enter to send · Shift+Enter for a new line")}
        </span>
      </div>
    </div>
  );
}
