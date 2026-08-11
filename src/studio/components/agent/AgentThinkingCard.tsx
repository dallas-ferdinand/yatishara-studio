"use client";

import { Loader2 } from "lucide-react";

type AgentThinkingCardProps = {
  label?: string;
};

/** MercuryOS-style live thinking wash — used while inspecting media / idle progress. */
export function AgentThinkingCard({ label = "Thinking" }: AgentThinkingCardProps) {
  return (
    <div className="studio-agent-thinking" role="status" aria-live="polite">
      <span className="studio-agent-thinking-icon" aria-hidden="true">
        <Loader2 size={13} className="animate-spin" />
      </span>
      <span className="studio-agent-thinking-label">{label}</span>
    </div>
  );
}
