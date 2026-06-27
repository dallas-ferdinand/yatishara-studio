// @ts-nocheck
"use client";

import { Icon } from "./Icons";

export function MobileShellHeader({
  title,
  onBack,
  backLabel = "Back",
  backIcon = "chevL",
  actions,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  backIcon?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="desk-mobile-header">
      {onBack ? (
        <button
          type="button"
          className="desk-mobile-header-btn desk-mobile-header-back"
          onClick={onBack}
          aria-label={backLabel}
        >
          <Icon name={backIcon} size={18} />
        </button>
      ) : null}
      <div className="desk-mobile-header-title-wrap">
        <span className="desk-mobile-header-title truncate">{title}</span>
      </div>
      {actions ? <div className="desk-mobile-header-end">{actions}</div> : null}
    </header>
  );
}
