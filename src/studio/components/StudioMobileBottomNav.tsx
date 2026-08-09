// @ts-nocheck
"use client";

import { Cloud, Folder, GraduationCap, History, MessageCircle, PanelLeft, Sparkles, Store, X } from "lucide-react";
import { useRef } from "react";

/** Optional context action — Files linked to Create (Generate) or Network (My Assets). */
export const MOBILE_NAV_ACTION = {
  files: { id: "files", label: "Files", Icon: Folder },
  /** Opens Places / Files left-rail sheet — only while Files dock is open. */
  extras: { id: "extras", label: "Extras", Icon: PanelLeft },
  history: { id: "history", label: "History", Icon: History },
};

/** Cancel pointer→action if the finger slides (scroll intent). */
const POINTER_MOVE_CANCEL = 14;

/**
 * Fire primary nav actions on pointerdown so is-active paints immediately.
 * Warm/prefetch runs after activate so it never blocks the tap paint.
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
      onActivate?.();
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          window.setTimeout(() => onIntent?.(), 0);
        });
      } else {
        onIntent?.();
      }
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
      onIntent?.();
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
 * Permanent sections: Feed | Network | Academy | Messages | Create.
 * Generate: Create expands as a dual/linked pill with History (+ Files).
 * Order: Create | History | Files — History sits next to Generate like the
 * credit pill sits next to Create in header tools.
 * Files dock open: Files + Extras (Places); History hidden.
 */
export function StudioMobileBottomNav({
  section,
  onSelect,
  onPrefetch,
  action = null,
  extrasAction = null,
  historyAction = null,
  /** @deprecated use extrasAction */
  placesAction = null,
  tools = null,
}) {
  const filesAction = action?.id === "files" ? action : null;
  const filesAnchor = filesAction?.anchor === "network" ? "network" : "composer";
  const extras = extrasAction || placesAction;
  const FilesIcon = MOBILE_NAV_ACTION.files.Icon;
  const ExtrasIcon = MOBILE_NAV_ACTION.extras.Icon;
  const HistoryIcon = MOBILE_NAV_ACTION.history.Icon;
  const filesOpen = Boolean(filesAction?.active);
  const linkFilesToNetwork = Boolean(filesAction) && filesAnchor === "network";
  const linkFilesToCreate = Boolean(filesAction) && filesAnchor === "composer";
  // Extras only while Files dock is open (Generate or My Assets).
  const showExtras = Boolean(extras) && filesOpen;
  const showHistory = Boolean(historyAction) && !filesOpen;
  const networkLinked =
    section === "network" && (linkFilesToNetwork || showExtras);
  // Always link Create when History is available on Generate — dual pill even
  // if the Files action is briefly unset.
  const createLinked =
    section === "composer" &&
    (showHistory || linkFilesToCreate || showExtras);

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

  const extrasBtn = (linked) =>
    showExtras ? (
      <NavButton
        className={`studio-mobile-nav-btn studio-mobile-nav-extras is-icon-only${extras.active ? " is-active" : ""}${linked ? " is-cluster-slot" : ""}`}
        ariaLabel="Extras"
        title="Places"
        ariaPressed={extras.active ? true : undefined}
        onActivate={() => extras.onClick?.()}
        onIntent={() => onPrefetch?.("places")}
      >
        <ExtrasIcon aria-hidden="true" />
      </NavButton>
    ) : null;

  const historyBtn = (linked) =>
    showHistory ? (
      <NavButton
        className={`studio-mobile-nav-btn studio-mobile-nav-history is-icon-only${historyAction.active ? " is-active" : ""}${linked ? " is-cluster-slot" : ""}`}
        ariaLabel={historyAction.active ? "Close history" : "History"}
        title={historyAction.active ? "Close history" : "History"}
        ariaPressed={historyAction.active ? true : undefined}
        onActivate={() => historyAction.onClick?.()}
        onIntent={() => onPrefetch?.("history")}
      >
        {historyAction.active ? (
          <X aria-hidden="true" />
        ) : (
          <HistoryIcon aria-hidden="true" />
        )}
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
            className={`studio-mobile-nav-cluster is-linked${filesAction?.active || extras?.active ? " is-action-active" : ""}`}
            role="group"
            aria-label={showExtras ? "Creative Network, Files, and Extras" : "Creative Network and Files"}
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
            {extrasBtn(true)}
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
          className={`studio-mobile-nav-btn${section === "academy" ? " is-active" : ""} is-icon-only`}
          ariaCurrent={section === "academy" ? "page" : undefined}
          ariaLabel="Academy"
          title="Academy"
          onActivate={() => onSelect("academy")}
          onIntent={() => onPrefetch?.("academy")}
        >
          <GraduationCap aria-hidden="true" />
        </NavButton>

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
            className={`studio-mobile-nav-cluster is-linked${filesAction?.active || extras?.active || historyAction?.active ? " is-action-active" : ""}`}
            role="group"
            aria-label={
              showExtras
                ? "Create, Files, and Extras"
                : showHistory && linkFilesToCreate
                  ? "Create, History, and Files"
                  : showHistory
                    ? "Create and History"
                    : "Create and Files"
            }
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
            {historyBtn(true)}
            {filesBtn(true)}
            {extrasBtn(true)}
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
