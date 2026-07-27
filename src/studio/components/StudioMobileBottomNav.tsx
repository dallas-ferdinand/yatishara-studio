// @ts-nocheck
"use client";

import { Cloud, Folder, MessageCircle, Sparkles, Store } from "lucide-react";
import { useRef } from "react";

/** Context action in the middle slot — Files on Generate, Messages on Social/CN. */
export const MOBILE_NAV_ACTION = {
  files: { id: "files", label: "Files", Icon: Folder },
  social: { id: "social", label: "Messages", Icon: MessageCircle },
  /** Opens CN Messages/filters rail sheet while Creative Network is active. */
  cnRail: { id: "cnRail", label: "Messages", Icon: MessageCircle },
};

/** Cancel pointer→action if the finger slides (scroll intent). */
const POINTER_MOVE_CANCEL = 14;

/**
 * Fire primary nav actions on pointerdown so is-active paints immediately.
 * onClick remains as keyboard / synthetic fallback when pointer path already ran.
 */
function useInstantTap(onActivate) {
  const handledRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const cancelledRef = useRef(false);

  return {
    onPointerDown: (event) => {
      if (event.button != null && event.button !== 0) return;
      handledRef.current = false;
      cancelledRef.current = false;
      startRef.current = { x: event.clientX, y: event.clientY };
      handledRef.current = true;
      onActivate?.();
    },
    onPointerMove: (event) => {
      if (!handledRef.current || cancelledRef.current) return;
      const dx = Math.abs(event.clientX - startRef.current.x);
      const dy = Math.abs(event.clientY - startRef.current.y);
      if (Math.max(dx, dy) > POINTER_MOVE_CANCEL) {
        cancelledRef.current = true;
      }
    },
    onClick: (event) => {
      if (handledRef.current) {
        event.preventDefault();
        handledRef.current = false;
        return;
      }
      onActivate?.();
    },
  };
}

function NavButton({
  className,
  ariaCurrent,
  ariaLabel,
  ariaPressed,
  title,
  onActivate,
  children,
}) {
  const tap = useInstantTap(onActivate);
  return (
    <button
      type="button"
      className={className}
      aria-current={ariaCurrent}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      title={title}
      {...tap}
    >
      {children}
    </button>
  );
}

export function StudioMobileBottomNav({
  section,
  onSelect,
  action = null,
  tools = null,
}) {
  const actionDef =
    action?.id === "social"
      ? MOBILE_NAV_ACTION.social
      : action?.id === "cnRail"
        ? MOBILE_NAV_ACTION.cnRail
        : action?.id === "files"
          ? MOBILE_NAV_ACTION.files
          : null;
  const ActionIcon = actionDef?.Icon;

  return (
    <nav className="studio-mobile-bottom-nav" aria-label="Studio mobile sections">
      <div className="studio-mobile-nav-sections">
        <NavButton
          className={`studio-mobile-nav-btn${section === "feed" ? " is-active" : ""} is-icon-only`}
          ariaCurrent={section === "feed" ? "page" : undefined}
          ariaLabel="Feed"
          title="Feed"
          onActivate={() => onSelect("feed")}
        >
          <Cloud aria-hidden="true" />
        </NavButton>
        <NavButton
          className={`studio-mobile-nav-btn${section === "network" ? " is-active" : ""} is-icon-only`}
          ariaCurrent={section === "network" ? "page" : undefined}
          ariaLabel="Creative Network"
          title="Creative Network"
          onActivate={() => onSelect("network")}
        >
          <Store aria-hidden="true" />
        </NavButton>
        {actionDef && ActionIcon ? (
          <NavButton
            className={`studio-mobile-nav-btn studio-mobile-nav-action is-icon-only${action?.active ? " is-active" : ""}`}
            ariaLabel={actionDef.label}
            title={actionDef.label}
            ariaPressed={action?.active ? true : undefined}
            onActivate={() => action?.onClick?.()}
          >
            <ActionIcon aria-hidden="true" />
          </NavButton>
        ) : null}
        <NavButton
          className={`studio-mobile-nav-btn${section === "composer" ? " is-active" : ""} is-icon-only`}
          ariaCurrent={section === "composer" ? "page" : undefined}
          ariaLabel="Create"
          title="Create"
          onActivate={() => onSelect("composer")}
        >
          <Sparkles aria-hidden="true" />
        </NavButton>
      </div>
      {tools ? <div className="studio-mobile-nav-tools">{tools}</div> : null}
    </nav>
  );
}
