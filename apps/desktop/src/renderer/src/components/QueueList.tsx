import type { QueuedMessage } from "@stereo/core";

interface Props {
  items: QueuedMessage[];
  onRemove(id: string): void;
  onMove(id: string, direction: -1 | 1): void;
}

export function QueueList({ items, onRemove, onMove }: Props) {
  if (items.length === 0) return null;
  return (
    <details className="queue-panel" open>
      <summary>{items.length} queued message{items.length === 1 ? "" : "s"}</summary>
      <div className="queue-items">
        {items.map((item, index) => (
          <div className="queue-item" key={item.id}>
            <span className="queue-index">{index + 1}</span>
            <span className="queue-copy">{item.text || item.attachments.map((attachment) => attachment.name).join(", ")}</span>
            <span className="queue-actions">
              <button disabled={index === 0} title="Move earlier" aria-label="Move queued message earlier" onClick={() => onMove(item.id, -1)}>↑</button>
              <button disabled={index === items.length - 1} title="Move later" aria-label="Move queued message later" onClick={() => onMove(item.id, 1)}>↓</button>
              <button className="danger" title="Remove from queue" aria-label="Remove queued message" onClick={() => onRemove(item.id)}>×</button>
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}
