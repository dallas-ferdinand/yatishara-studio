"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "./Icons";

export function PanelSearchBar({
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
  end = null,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  end?: ReactNode;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="cursor-panel-search shrink-0">
      <Icon name="search" size={14} className="text-cursor-muted shrink-0 pointer-events-none" />
      <input
        type="search"
        enterKeyHint="search"
        placeholder={focused ? "" : placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="cursor-panel-search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setFocused(false)}
        onFocus={() => setFocused(true)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      {end ? <div className="cursor-panel-search-end">{end}</div> : null}
    </div>
  );
}
