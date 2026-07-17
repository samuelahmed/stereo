import { useEffect } from "react";
import type { AgentId } from "@stereo/core";
import { AGENT_NAME } from "../labels";

export type ReviewAccessDecision = "cancel" | "read-only" | "write";

interface Props {
  agent: AgentId;
  onDecision(decision: ReviewAccessDecision): void;
}

/** One provider-independent gate from safe review into a normal working thread. */
export function ReviewAccessDialog({ agent, onDecision }: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onDecision("cancel");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDecision]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onDecision("cancel");
    }}>
      <div className="modal review-access-modal" role="dialog" aria-modal="true" aria-labelledby="review-access-title">
        <div className="review-access-icon" aria-hidden="true">↗</div>
        <div id="review-access-title" className="modal-title">Allow {AGENT_NAME[agent]} to make changes?</div>
        <div className="modal-copy">
          This review is read-only. Allowing changes converts it into a normal write-enabled thread before your message is sent.
        </div>
        <div className="review-access-note">Access applies to this thread and its current working folder.</div>
        <div className="modal-actions review-access-actions">
          <button className="btn ghost" onClick={() => onDecision("cancel")}>Cancel</button>
          <button className="btn ghost" onClick={() => onDecision("read-only")}>Keep read-only</button>
          <button className="btn primary" autoFocus onClick={() => onDecision("write")}>Allow changes</button>
        </div>
      </div>
    </div>
  );
}
