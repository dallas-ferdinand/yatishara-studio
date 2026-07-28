// @ts-nocheck
"use client";

import { Cloud, Folder, History, MessageCircle, Sparkles, Store } from "lucide-react";
import { useRef } from "react";

/** Optional context action — Files linked to Create (Generate) or Network (My Assets). */
export const MOBILE_NAV_ACTION = {
  files: { id: "files", label: "Files", Icon: Folder },
  history: { id: "history", label: "History", Icon: History },
};

/** Cancel pointer→action if the finger slides (scroll intent). */
const POINTER_MOVE_CANCEL = 14;

/**
 * Fire primary nav actions on pointerdown so is-active paints immediately.
 * onClick remains as keyboard / synthetic fallback when pointer path already ran.
 */
function useInstantTap(onActivate, onIntent) {
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
      onIntent?.();
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
      onIntent?.();
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
  onIntent,
  children,
}) {
  const tap = useInstantTap(onActivate, onIntent);
  return (
    <button
      type="button"
      className={className}
      aria-current={ariaCurrent}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      title={title}
      onPointerEnter={() => onIntent?.()}
      {...tap}
    >
      {children}
    </button>
  );
}

/**
 * Permanent sections: Feed | Network | Messages | Create.
 * On Generate, Create expands into a linked pill with Files (+ History) to the right.
 */
export function StudioMobileBottomNav({
  section,
  onSelect,
  onPrefetch,
  action = null,
  historyAction = null,
  tools = null,
}) {
  const filesAction = action?.id === "files" ? action : null;
  const filesAnchor = filesAction?.anchor === "network" ? "network" : "composer";
  const FilesIcon = MOBILE_NAV_ACTION.files.Icon;
  const HistoryIcon = MOBILE_NAV_ACTION.history.Icon;
  const linkFilesToNetwork = Boolean(filesAction) && filesAnchor === "network";
  const linkFilesToCreate = Boolean(filesAction) && filesAnchor === "composer";
  const networkLinked = linkFilesToNetwork && section === "network";
  const createLinked =
    section === "composer" && (linkFilesToCreate || Boolean(historyAction));

  const filesBtn = (linked) =>
    filesAction ? (
      <NavButton
        className={`studio-mobile-nav-btn studio-mobile-nav-action is-icon-only${filesAction.active ? " is-active" : ""}${linked ? " is-cluster-slot" : ""}`}
        ariaLabel="Files"
        title="Files"
        ariaPressed={filesAction.active ? true : undefined}
        onActivate={() => filesAction.onClick?.()}
        onIntent={() => onPrefetch?.("files")}
      >
        <FilesIcon aria-hidden="true" />
      </NavButton>
    ) : null;

  const historyBtn = (linked) =>
    historyAction ? (
      <NavButton
        className={`studio-mobile-nav-btn studio-mobile-nav-history is-icon-only${historyAction.active ? " is-active" : ""}${linked ? " is-cluster-slot" : ""}`}
        ariaLabel="History"
        title="History"
        ariaPressed={historyAction.active ? true : undefined}
        onActivate={() => historyAction.onClick?.()}
        onIntent={() => onPrefetch?.("history")}
      >
        <HistoryIcon aria-hidden="true" />
      </NavButton>
    ) : null;

  return (
    <nav className="studio-mobile-bottom-nav" aria-label="Studio mobile sections">
      <div className="studio-mobile-nav-sections">
        <NavButton
          className={`studio-mobile-nav-btn${section === "feed" ? " is-active" : ""} is-icon-only`}
          ariaCurrent={section === "feed" ? "page" : undefined}
          ariaLabel="Feed"
          title="Feed"
          onActivate={() => onSelect("feed")}
          onIntent={() => onPrefetch?.("feed")}
        >
          <Cloud aria-hidden="true" />
        </NavButton>

        {networkLinked ? (
          <div
            className={`studio-mobile-nav-cluster is-linked${filesAction.active ? " is-action-active" : ""}`}
            role="group"
            aria-label="Creative Network and Files"
          >
            <NavButton
              className={`studio-mobile-nav-btn is-icon-only is-cluster-slot is-active`}
              ariaCurrent="page"
              ariaLabel="Creative Network"
              title="Creative Network"
              onActivate={() => onSelect("network")}
              onIntent={() => onPrefetch?.("network")}
            >
              <Store aria-hidden="true" />
            </NavButton>
            {filesBtn(true)}
          </div>
        ) : (
          <NavButton
            className={`studio-mobile-nav-btn${section === "network" ? " is-active" : ""} is-icon-only`}
            ariaCurrent={section === "network" ? "page" : undefined}
            ariaLabel="Creative Network"
            title="Creative Network"
            onActivate={() => onSelect("network")}
            onIntent={() => onPrefetch?.("network")}
          >
            <Store aria-hidden="true" />
          </NavButton>
        )}

        <NavButton
          className={`studio-mobile-nav-btn${section === "messages" ? " is-active" : ""} is-icon-only`}
          ariaCurrent={section === "messages" ? "page" : undefined}
          ariaLabel="Messages"
          title="Messages"
          onActivate={() => onSelect("messages")}
          onIntent={() => onPrefetch?.("messages")}
        >
          <MessageCircle aria-hidden="true" />
        </NavButton>

        {createLinked ? (
          <div
            className={`studio-mobile-nav-cluster is-linked${filesAction?.active || historyAction?.active ? " is-action-active" : ""}`}
            role="group"
            aria-label="Create, Files, and History"
          >
            <NavButton
              className={`studio-mobile-nav-btn is-icon-only is-cluster-slot is-active`}
              ariaCurrent="page"
              ariaLabel="Create"
              title="Create"
              onActivate={() => onSelect("composer")}
              onIntent={() => onPrefetch?.("composer")}
            >
              <Sparkles aria-hidden="true" />
            </NavButton>
            {filesBtn(true)}
            {historyBtn(true)}
          </div>
        ) : (
          <NavButton
            className={`studio-mobile-nav-btn${section === "composer" ? " is-active" : ""} is-icon-only`}
            ariaCurrent={section === "composer" ? "page" : undefined}
            ariaLabel="Create"
            title="Create"
            onActivate={() => onSelect("composer")}
            onIntent={() => onPrefetch?.("composer")}
          >
            <Sparkles aria-hidden="true" />
          </NavButton>
        )}
      </div>
      {tools ? <div className="studio-mobile-nav-tools">{tools}</div> : null}
    </nav>
  );
}
