"use client";

import { Pencil } from "lucide-react";

type Props = {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
};

/** Toolbar Assistance control — icon toggle (on via is-on styles). */
export function AssistanceToggle({ enabled, onChange, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      className={`studio-composer-circle-btn studio-assist-circle-btn${enabled ? " is-on" : ""}`}
      title={enabled ? "Assistance on — guides your brief before generate" : "Assistance off"}
      aria-label="Assistance"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
    >
      <Pencil size={14} strokeWidth={2.25} aria-hidden="true" />
    </button>
  );
}
