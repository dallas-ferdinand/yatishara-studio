// @ts-nocheck
"use client";

import { LayoutGrid, Settings, Sparkles } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const NAV_ITEMS = [
  { id: "files", label: "Files", Icon: LayoutGrid },
  { id: "composer", label: "Create", Icon: Sparkles },
  { id: "settings", label: "Settings", Icon: Settings },
];

export function StudioMobileBottomNav({ section, onSelect, tools = null }) {
  const navRef = useRef(null);
  const sectionsRef = useRef(null);
  const itemRefs = useRef([]);
  const [indicator, setIndicator] = useState({ width: 0, x: 0 });

  const measureIndicator = useCallback(() => {
    const nav = navRef.current;
    const sections = sectionsRef.current;
    const index = NAV_ITEMS.findIndex((item) => item.id === section);
    const button = itemRefs.current[index];
    if (!nav || !sections || !button) return;
    const navRect = nav.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    setIndicator({
      width: buttonRect.width,
      x: buttonRect.left - navRect.left,
    });
  }, [section]);

  useLayoutEffect(() => {
    measureIndicator();
  }, [measureIndicator]);

  useEffect(() => {
    window.addEventListener("resize", measureIndicator);
    return () => window.removeEventListener("resize", measureIndicator);
  }, [measureIndicator]);

  return (
    <nav ref={navRef} className="studio-mobile-bottom-nav" aria-label="Studio mobile sections">
      <span
        className="studio-mobile-nav-indicator"
        style={{
          width: `${indicator.width}px`,
          transform: `translate3d(${indicator.x}px, 0, 0)`,
        }}
        aria-hidden="true"
      />
      <div ref={sectionsRef} className="studio-mobile-nav-sections">
        {NAV_ITEMS.map((item, index) => {
          const Icon = item.Icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              className={`studio-mobile-nav-btn${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => onSelect(item.id)}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      {tools ? <div className="studio-mobile-nav-tools">{tools}</div> : null}
    </nav>
  );
}
