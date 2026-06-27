// @ts-nocheck
"use client";

import { Icon } from "./Icons";

export function PanelSearchBar({ value, onChange, placeholder, "aria-label": ariaLabel }) {
  return (
    <div className="cursor-panel-search shrink-0">
      <Icon name="search" size={14} className="text-cursor-muted shrink-0 pointer-events-none" />
      <input
        type="search"
        enterKeyHint="search"
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="cursor-panel-search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
    </div>
  );
}
