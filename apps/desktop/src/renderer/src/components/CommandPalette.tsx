import { useEffect, useMemo, useRef, useState } from "react";

export interface PaletteCommand {
  id: string;
  label: string;
  detail: string;
  group: "Conversation" | "Project" | "Harness" | "Stereo";
  shortcut?: string;
  disabled?: boolean;
  run(): void;
}

interface Props {
  commands: PaletteCommand[];
  onClose(): void;
}

export function CommandPalette({ commands, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return commands.filter((command) => !needle || `${command.label} ${command.detail} ${command.group}`.toLowerCase().includes(needle));
  }, [commands, query]);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { setIndex(0); }, [query]);

  const choose = (command: PaletteCommand | undefined) => {
    if (!command || command.disabled) return;
    onClose();
    command.run();
  };

  return (
    <div className="command-backdrop" onPointerDown={onClose}>
      <div className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onPointerDown={(event) => event.stopPropagation()}>
        <div className="command-input-row"><input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a command…" onKeyDown={(event) => { if (event.key === "Escape") onClose(); if (event.key === "ArrowDown") { event.preventDefault(); setIndex((value) => Math.min(filtered.length - 1, value + 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)); } if (event.key === "Enter") choose(filtered[index]); }} /><kbd>esc</kbd></div>
        <div className="command-list">{filtered.map((command, itemIndex) => <button key={command.id} className={itemIndex === index ? "active" : ""} disabled={command.disabled} onMouseEnter={() => setIndex(itemIndex)} onClick={() => choose(command)}><span className="command-group">{command.group}</span><span><strong>{command.label}</strong><small>{command.detail}</small></span>{command.shortcut && <kbd>{command.shortcut}</kbd>}</button>)}{filtered.length === 0 && <div className="command-empty">No matching commands</div>}</div>
      </div>
    </div>
  );
}
