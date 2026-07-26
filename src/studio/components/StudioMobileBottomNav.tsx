// @ts-nocheck
"use client";

import { Cloud, Folder, Sparkles, Users } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Context action in the middle slot — Files on Generate, People on Social. */
export const MOBILE_NAV_ACTION = {
  files: { id: "files", label: "Files", Icon: Folder },
  social: { id: "social", label: "People", Icon: Users },
};

export function StudioMobileBottomNav({
  section,
  onSelect,
  action = null,
  tools = null,
}) {
  const navRef = useRef(null);
  const sectionsRef = useRef(null);
  const itemRefs = useRef({});
  const [indicator, setIndicator] = useState({ width: 0, x: 0 });

  const measureIndicator = useCallback(() => {
    const nav = navRef.current;
    const sections = sectionsRef.current;
    const button = section ? itemRefs.current[section] : null;
    if (!nav || !sections || !button) {
      setIndicator((prev) =>
        prev.width === 0 && prev.x === 0 ? prev : { width: 0, x: 0 },
      );
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const width = buttonRect.width;
    const x = buttonRect.left - navRect.left;
    setIndicator((prev) =>
      prev.width === width && prev.x === x ? prev : { width, x },
    );
  }, [section]);

  useLayoutEffect(() => {
    measureIndicator();
  }, [measureIndicator, action?.id, action?.active]);

  useEffect(() => {
    window.addEventListener("resize", measureIndicator);
    return () => window.removeEventListener("resize", measureIndicator);
  }, [measureIndicator]);

  const actionDef =
    action?.id === "social"
      ? MOBILE_NAV_ACTION.social
      : action?.id === "files"
        ? MOBILE_NAV_ACTION.files
        : null;
  const ActionIcon = actionDef?.Icon;

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
        <button
          ref={(node) => {
            itemRefs.current.feed = node;
          }}
          type="button"
          className={`studio-mobile-nav-btn${section === "feed" ? " is-active" : ""} is-icon-only`}
          aria-current={section === "feed" ? "page" : undefined}
          aria-label="Feed"
          title="Feed"
          onClick={() => onSelect("feed")}
        >
          <Cloud aria-hidden="true" />
        </button>
        {actionDef && ActionIcon ? (
          <button
            ref={(node) => {
              itemRefs.current[actionDef.id] = node;
            }}
            type="button"
            className={`studio-mobile-nav-btn studio-mobile-nav-action${action?.active ? " is-active" : ""}`}
            aria-label={actionDef.label}
            title={actionDef.label}
            aria-pressed={action?.active ? true : undefined}
            onClick={() => action?.onClick?.()}
          >
            <ActionIcon aria-hidden="true" />
            <span>{actionDef.label}</span>
          </button>
        ) : null}
        <button
          ref={(node) => {
            itemRefs.current.composer = node;
          }}
          type="button"
          className={`studio-mobile-nav-btn${section === "composer" ? " is-active" : ""}`}
          aria-current={section === "composer" ? "page" : undefined}
          aria-label="Create"
          title="Create"
          onClick={() => onSelect("composer")}
        >
          <Sparkles aria-hidden="true" />
          <span>Create</span>
        </button>
      </div>
      {tools ? <div className="studio-mobile-nav-tools">{tools}</div> : null}
    </nav>
  );
}
