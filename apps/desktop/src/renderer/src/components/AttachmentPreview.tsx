import { useEffect, useState } from "react";
import type { Attachment } from "@stereo/core";
import { stereo } from "../bridge";

export function attachmentIsImage(attachment: Attachment): boolean {
  return attachment.mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|heic)$/i.test(attachment.name);
}

export function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!attachmentIsImage(attachment)) return;
    let active = true;
    void stereo.previewFile(attachment.path).then((preview) => {
      if (!active) return;
      if (preview) setSrc(preview);
      else setFailed(true);
    }).catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [attachment]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  if (!attachmentIsImage(attachment) || failed) return <span className="attachment-file-icon" aria-hidden="true">◇</span>;
  if (!src) return <span className="attachment-file-icon image" aria-hidden="true">▧</span>;
  return (
    <>
      <button className="attachment-thumbnail" type="button" title={`Preview ${attachment.name}`} onClick={() => setOpen(true)}>
        <img src={src} alt="" onError={() => setFailed(true)} />
      </button>
      {open && (
        <div className="image-preview-backdrop" role="dialog" aria-modal="true" aria-label={`Preview of ${attachment.name}`} onClick={() => setOpen(false)}>
          <div className="image-preview" onClick={(event) => event.stopPropagation()}>
            <img src={src} alt={attachment.name} />
            <div className="image-preview-bar"><span>{attachment.name}</span><button onClick={() => setOpen(false)} aria-label="Close preview">×</button></div>
          </div>
        </div>
      )}
    </>
  );
}
