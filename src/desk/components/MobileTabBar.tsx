// @ts-nocheck
"use client";

import { Icon } from "./Icons";
import type { MobileTab } from "@/hooks/use-mobile-layout";

const TABS: { id: MobileTab; label: string; icon: string; iconActive: string }[] = [
  { id: 0, label: "Agent", icon: "chat", iconActive: "chat" },
  { id: 1, label: "Files", icon: "folder", iconActive: "folder" },
  { id: 2, label: "Editor", icon: "editor", iconActive: "editor" },
];

export function MobileTabBar({
  active,
  onChange,
  showEditor = true,
  onOpenPulse,
  onOpenFinance,
  activeAction,
}: {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
  showEditor?: boolean;
  onOpenPulse?: () => void;
  onOpenFinance?: () => void;
  activeAction?: "pulse" | "finance" | null;
}) {
  const tabs = showEditor ? TABS : TABS.filter((t) => t.id !== 2);
  return (
    <nav className="desk-mobile-tabbar" aria-label="Desk sections">
      {tabs.map((tab) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`desk-mobile-tab${selected ? " is-active" : ""}`}
            aria-current={selected ? "page" : undefined}
            onClick={() => onChange(tab.id)}
          >
            <span className="desk-mobile-tab-indicator" aria-hidden />
            <span className="desk-mobile-tab-icon" aria-hidden>
              <Icon name={selected ? tab.iconActive : tab.icon} size={20} />
            </span>
            <span className="desk-mobile-tab-label">{tab.label}</span>
          </button>
        );
      })}
      {onOpenPulse ? (
        <button
          type="button"
          className={`desk-mobile-tab desk-mobile-tab-action${activeAction === "pulse" ? " is-active" : ""}`}
          aria-current={activeAction === "pulse" ? "page" : undefined}
          onClick={onOpenPulse}
        >
          <span className="desk-mobile-tab-indicator" aria-hidden />
          <span className="desk-mobile-tab-icon" aria-hidden>
            <Icon name="infinity" size={20} />
          </span>
          <span className="desk-mobile-tab-label">Pulse</span>
        </button>
      ) : null}
      {onOpenFinance ? (
        <button
          type="button"
          className={`desk-mobile-tab desk-mobile-tab-action${activeAction === "finance" ? " is-active" : ""}`}
          aria-current={activeAction === "finance" ? "page" : undefined}
          onClick={onOpenFinance}
        >
          <span className="desk-mobile-tab-indicator" aria-hidden />
          <span className="desk-mobile-tab-icon" aria-hidden>
            <Icon name="bucket" size={20} />
          </span>
          <span className="desk-mobile-tab-label">Finance</span>
        </button>
      ) : null}
    </nav>
  );
}
