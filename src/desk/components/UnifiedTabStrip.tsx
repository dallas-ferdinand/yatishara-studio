// @ts-nocheck
"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons";
import {
  TAB_DRAG_LEADING_INSET_PX,
  TAB_DRAG_SETTLE_MS,
  TAB_DRAG_START_PX,
  arraysEqual,
  captureStripLayout,
  ghostTargetAtInsertIndex,
  orderWithInsertion,
  resolveDragOrder,
} from "@/desk/lib/chrome-tab-drag";
import { useHorizontalWheelScroll } from "@/desk/lib/use-horizontal-wheel-scroll";
import { workspaceTabIcon } from "@/desk/lib/file-kind";
import { displayEntryPath } from "@/desk/lib/display-path";

function tabFromKey(tabs, key) {
  return (tabs ?? []).find((t) => t.key === key) ?? null;
}

function stripTabsEqual(prev, next) {
  if (prev.disableDrag !== next.disableDrag) return false;
  if (prev.activeKey !== next.activeKey) return false;
  const a = prev.tabs ?? [];
  const b = next.tabs ?? [];
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].key !== b[i].key ||
      a[i].title !== b[i].title ||
      a[i].status !== b[i].status ||
      a[i].tabSignal !== b[i].tabSignal ||
      a[i].previewUrl !== b[i].previewUrl ||
      a[i].previewInitials !== b[i].previewInitials ||
      a[i].previewAvatarStyle?.background !== b[i].previewAvatarStyle?.background ||
      a[i].previewAvatarStyle?.color !== b[i].previewAvatarStyle?.color ||
      Boolean(a[i].dirty) !== Boolean(b[i].dirty) ||
      Boolean(a[i].loading) !== Boolean(b[i].loading)
    ) {
      return false;
    }
  }
  return true;
}

function UnifiedTabStripInner({
  tabs,
  activeKey,
  onSelect,
  onClose,
  onReorder,
  onSetTabOrder,
  onNewChat,
  disableDrag = false,
}) {
  const stripRef = useRef(null);
  const newChatRef = useRef(null);
  const tabRefs = useRef(new Map());
  const pendingRef = useRef(null);
  const dragRef = useRef(null);
  const didDragRef = useRef(false);
  const dragFrameRef = useRef(0);
  const dragPointRef = useRef(null);
  const flipRectsRef = useRef(null);
  const settleTimerRef = useRef(null);
  const enterTimerRef = useRef(null);
  const previousOrderRef = useRef(null);

  const [dragUi, setDragUi] = useState(null);
  const [enteringKey, setEnteringKey] = useState(null);

  useHorizontalWheelScroll(stripRef);

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const baseOrder = useMemo(() => (tabs ?? []).map((t) => t.key), [tabs]);

  const captureFlipRects = useCallback(() => {
    const rects = new Map();
    for (const [key, el] of tabRefs.current.entries()) {
      if (!el?.getBoundingClientRect) continue;
      const rect = el.getBoundingClientRect();
      rects.set(key, { left: rect.left, top: rect.top });
    }
    flipRectsRef.current = rects;
  }, []);

  useEffect(() => {
    if (disableDrag) return;
    const previousOrder = previousOrderRef.current;
    if (previousOrder && baseOrder.length > previousOrder.length) {
      const addedKey = baseOrder.find((key) => !previousOrder.includes(key));
      if (addedKey) {
        if (enterTimerRef.current != null) {
          window.clearTimeout(enterTimerRef.current);
        }
        setEnteringKey(addedKey);
        enterTimerRef.current = window.setTimeout(() => {
          setEnteringKey(null);
          enterTimerRef.current = null;
        }, 360);
      }
    }
    previousOrderRef.current = baseOrder;
  }, [baseOrder, disableDrag]);

  useEffect(() => {
    return () => {
      if (enterTimerRef.current != null) {
        window.clearTimeout(enterTimerRef.current);
      }
      if (dragFrameRef.current) {
        window.cancelAnimationFrame(dragFrameRef.current);
      }
    };
  }, []);

  const commitOrder = useCallback(
    (order) => {
      if (!order?.length || arraysEqual(order, baseOrder)) return;
      if (onSetTabOrder) {
        onSetTabOrder(order);
        return;
      }
      if (!onReorder || order.length < 2) return;
      const from = baseOrder.find((k, i) => order[i] !== k);
      const to = order[order.indexOf(from)];
      if (from && to && from !== to) onReorder(from, to);
    },
    [baseOrder, onReorder, onSetTabOrder]
  );

  const releasePointer = useCallback((pointerId, drag) => {
    const el = drag?.captureEl ?? tabRefs.current.get(drag?.key);
    try {
      el?.releasePointerCapture?.(pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current != null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  const completeSettle = useCallback(
    (order) => {
      clearSettleTimer();
      if (dragFrameRef.current) {
        window.cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = 0;
      }
      dragPointRef.current = null;
      if (order) commitOrder(order);
      dragRef.current = null;
      pendingRef.current = null;
      didDragRef.current = false;
      setDragUi(null);
    },
    [clearSettleTimer, commitOrder]
  );

  const beginSettle = useCallback(
    (drag, pointerId) => {
      releasePointer(pointerId, drag);
      dragRef.current = null;
      pendingRef.current = null;

      const insertIndex = drag.insertIndex ?? 0;
      const placeholderEl = stripRef.current?.querySelector(".cursor-unified-tab-placeholder");
      const placeholderRect = placeholderEl?.getBoundingClientRect?.();
      const target = placeholderRect
        ? { x: placeholderRect.left, y: placeholderRect.top }
        : ghostTargetAtInsertIndex(drag.layout, insertIndex);
      const fromX = drag.ghostX;
      const fromY = drag.ghostY;
      const toX = target.x;
      const toY = target.y;
      const near =
        Math.hypot(fromX - toX, fromY - toY) < 3;

      const baseUi = {
        key: drag.key,
        order: drag.order,
        insertIndex,
        width: drag.width,
        height: drag.height,
        layout: drag.layout,
      };

      if (near) {
        completeSettle(drag.order);
        return;
      }

      setDragUi({
        ...baseUi,
        ghostX: fromX,
        ghostY: fromY,
        settling: false,
      });

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setDragUi({
            ...baseUi,
            ghostX: toX,
            ghostY: toY,
            settling: true,
          });
        });
      });

      clearSettleTimer();
      settleTimerRef.current = window.setTimeout(() => {
        completeSettle(drag.order);
      }, TAB_DRAG_SETTLE_MS + 80);
    },
    [clearSettleTimer, completeSettle, releasePointer, tabs]
  );

  const onGhostSettleEnd = useCallback(
    (e) => {
      if (e.propertyName !== "transform") return;
      if (!dragUi?.settling) return;
      completeSettle(dragUi.order);
    },
    [completeSettle, dragUi]
  );

  useEffect(() => () => clearSettleTimer(), [clearSettleTimer]);

  useEffect(() => {
    if (!dragUi) return;
    const watchdog = window.setTimeout(() => {
      if (dragRef.current || dragUi) completeSettle(dragUi.order ?? baseOrder);
    }, 2800);
    return () => window.clearTimeout(watchdog);
  }, [dragUi, baseOrder, completeSettle]);

  useEffect(() => {
    const resetDrag = () => {
      if (dragRef.current) {
        completeSettle(dragRef.current.order ?? baseOrder);
        return;
      }
      pendingRef.current = null;
      didDragRef.current = false;
    };
    window.addEventListener("blur", resetDrag);
    return () => window.removeEventListener("blur", resetDrag);
  }, [baseOrder, completeSettle]);

  const applyDragMove = useCallback((state, clientX, clientY) => {
    const stripRect = stripRef.current?.getBoundingClientRect();
    if (!stripRect) return state;

    let maxGhostX = stripRect.right - state.width;
    const newChatLeft = state.layout?.newChatLeft;
    if (typeof newChatLeft === "number") {
      maxGhostX = Math.min(maxGhostX, newChatLeft - 2);
    }

    const ghostX = clamp(clientX - state.offsetX, stripRect.left, maxGhostX);
    const ghostY = clamp(
      state.ghostYBase ?? clientY - state.offsetY,
      stripRect.top,
      stripRect.bottom - state.height
    );
    const stripLeft = state.layout?.stripLeft ?? state.layout?.anchorLeft ?? stripRect.left;
    const scrollLeft = state.layout?.scrollLeft ?? stripRef.current?.scrollLeft ?? 0;
    const dragLeadingX = ghostX - stripLeft + scrollLeft + TAB_DRAG_LEADING_INSET_PX;

    const resolved = resolveDragOrder({
      order: state.order,
      draggedKey: state.key,
      dragLeadingX,
      layout: state.layout,
      lastStripIndex: state.stripIndex ?? -1,
      lastLeadingX: state.lastLeadingX ?? dragLeadingX,
    });

    return {
      ...state,
      order: resolved.order,
      stripIndex: resolved.stripIndex,
      insertIndex: resolved.insertIndex,
      lastLeadingX: resolved.leadingX,
      ghostX,
      ghostY,
      lastClientX: clientX,
      lastClientY: clientY,
    };
  }, []);

  const flushDragFrame = useCallback(() => {
    dragFrameRef.current = 0;
    const point = dragPointRef.current;
    const active = dragRef.current;
    if (!point || !active) return;

    const next = applyDragMove(active, point.x, point.y);
    dragRef.current = next;

    const orderChanged = !arraysEqual(next.order, active.order);
    const insertChanged = next.insertIndex !== active.insertIndex;
    if (orderChanged || insertChanged) {
      captureFlipRects();
    }

    setDragUi((current) => {
      if (
        current &&
        current.key === next.key &&
        current.insertIndex === next.insertIndex &&
        current.ghostX === next.ghostX &&
        current.ghostY === next.ghostY &&
        current.width === next.width &&
        current.height === next.height &&
        arraysEqual(current.order, next.order)
      ) {
        return current;
      }
      return {
        key: next.key,
        order: next.order,
        insertIndex: next.insertIndex,
        ghostX: next.ghostX,
        ghostY: next.ghostY,
        width: next.width,
        height: next.height,
        mode: next.mode ?? null,
      };
    });
  }, [applyDragMove, captureFlipRects]);

  const queueDragFrame = useCallback(
    (clientX, clientY) => {
      dragPointRef.current = { x: clientX, y: clientY };
      if (dragFrameRef.current) return;
      dragFrameRef.current = window.requestAnimationFrame(flushDragFrame);
    },
    [flushDragFrame]
  );

  const finishDrag = useCallback(
    (pointerId) => {
      let drag = dragRef.current;
      if (!drag) return;
      if (dragFrameRef.current) {
        window.cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = 0;
      }
      const point = dragPointRef.current;
      if (point) {
        const next = applyDragMove(drag, point.x, point.y);
        if (!arraysEqual(next.order, drag.order) || next.insertIndex !== drag.insertIndex) {
          captureFlipRects();
        }
        dragRef.current = next;
        drag = next;
      }
      dragPointRef.current = null;
      beginSettle(drag, pointerId);
    },
    [applyDragMove, beginSettle, captureFlipRects]
  );

  const onTabPointerDown = (tab, e) => {
    if (e.button !== 0) return;
    if (e.target.closest?.(".cursor-tab-close")) return;
    const el = tabRefs.current.get(tab.key);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    pendingRef.current = {
      key: tab.key,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      pointerId: e.pointerId,
    };
    didDragRef.current = false;
  };

  const onTabPointerMove = (e) => {
    const pending = pendingRef.current;
    const drag = dragRef.current;
    if (!pending && !drag) return;
    if (pending && pending.pointerId !== e.pointerId) return;
    if (drag && drag.pointerId !== e.pointerId) return;

    if (pending && !drag) {
      const dx = e.clientX - pending.startX;
      const dy = e.clientY - pending.startY;
      if (Math.hypot(dx, dy) < TAB_DRAG_START_PX) return;

      didDragRef.current = true;
      const order = [...baseOrder];
      const layout = captureStripLayout(
        stripRef.current,
        order.length,
        "[data-tab-key]",
        newChatRef.current
      );

      const captureEl = tabRefs.current.get(pending.key);
      const tabRect = captureEl?.getBoundingClientRect?.();
      const offsetX = tabRect ? e.clientX - tabRect.left : pending.offsetX;
      const offsetY = tabRect ? e.clientY - tabRect.top : pending.offsetY;
      const width = tabRect?.width ?? pending.width;
      const height = tabRect?.height ?? pending.height;
      try {
        captureEl?.setPointerCapture?.(pending.pointerId);
      } catch {
        /* ignore */
      }

      const initial = applyDragMove(
        {
          key: pending.key,
          pointerId: pending.pointerId,
          offsetX,
          offsetY,
          width,
          height,
          order,
          layout,
          stripIndex: -1,
          lastLeadingX: tabRect
            ? tabRect.left - (layout.stripLeft ?? layout.anchorLeft ?? tabRect.left) + (layout.scrollLeft ?? 0) + TAB_DRAG_LEADING_INSET_PX
            : pending.startX - pending.offsetX + TAB_DRAG_LEADING_INSET_PX,
          ghostYBase: tabRect?.top ?? pending.startY - pending.offsetY,
          captureEl,
        },
        e.clientX,
        e.clientY
      );

      dragRef.current = initial;
      pendingRef.current = null;
      captureFlipRects();
      setDragUi({
        key: initial.key,
        order: initial.order,
        insertIndex: initial.insertIndex,
        ghostX: initial.ghostX,
        ghostY: initial.ghostY,
        width: initial.width,
        height: initial.height,
        mode: initial.mode ?? null,
      });
      return;
    }

    const active = dragRef.current;
    if (!active) return;
    queueDragFrame(e.clientX, e.clientY);
  };

  const onTabPointerUp = (tab, e) => {
    if (e.button !== 0) return;
    if (e.target.closest?.(".cursor-tab-close")) return;
    if (dragRef.current?.pointerId === e.pointerId) {
      finishDrag(e.pointerId);
      return;
    }
    if (pendingRef.current?.pointerId === e.pointerId) {
      pendingRef.current = null;
    }
  };

  const onTabPointerCancel = (e) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      didDragRef.current = false;
      finishDrag(e.pointerId);
      return;
    }
    pendingRef.current = null;
  };

  const onCloseTab = (tab, e) => {
    e.stopPropagation();
    e.preventDefault();
    pendingRef.current = null;
    didDragRef.current = false;
    onClose(tab.key);
  };

  const onMiddleClose = (tab, e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    onClose(tab.key);
  };

  useEffect(() => {
    const onDocPointerUp = () => {
      if (dragRef.current) {
        finishDrag(dragRef.current.pointerId);
        return;
      }
      pendingRef.current = null;
      window.setTimeout(() => {
        didDragRef.current = false;
      }, 0);
    };
    document.addEventListener("pointerup", onDocPointerUp);
    document.addEventListener("pointercancel", onDocPointerUp);
    return () => {
      document.removeEventListener("pointerup", onDocPointerUp);
      document.removeEventListener("pointercancel", onDocPointerUp);
    };
  }, [finishDrag]);

  const dragKey = dragUi?.key ?? null;
  const displayOrder = dragUi?.order ?? baseOrder;
  const isDragging = Boolean(dragUi && !dragUi.settling);
  const isSettling = Boolean(dragUi?.settling);
  const placeholderAt = dragKey != null ? (dragUi?.insertIndex ?? 0) : -1;
  const draggingFirstTab = dragKey != null && baseOrder[0] === dragKey;

  const stripItems = useMemo(() => {
    const items = [];
    const keys = dragKey ? displayOrder.filter((k) => k !== dragKey) : displayOrder;
    for (let i = 0; i <= keys.length; i++) {
      if (placeholderAt === i) items.push({ kind: "placeholder", key: "__tab_placeholder__" });
      if (i < keys.length) {
        const tab = tabFromKey(tabs, keys[i]);
        if (tab) items.push({ kind: "tab", key: tab.key, tab });
      }
    }
    return items;
  }, [displayOrder, dragKey, placeholderAt, tabs]);

  const ghostTab = dragUi ? tabFromKey(tabs, dragUi.key) : null;

  useLayoutEffect(() => {
    if (disableDrag) return;
    const previousRects = flipRectsRef.current;
    if (!previousRects?.size) return;
    flipRectsRef.current = null;

    const animated = [];
    for (const [key, el] of tabRefs.current.entries()) {
      const prev = previousRects.get(key);
      if (!prev || !el?.getBoundingClientRect) continue;
      const next = el.getBoundingClientRect();
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;

      el.style.transition = "none";
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      animated.push(el);
    }

    if (!animated.length) return;

    const frame = window.requestAnimationFrame(() => {
      for (const el of animated) {
        el.style.transition = "transform 260ms cubic-bezier(0.2, 0.92, 0.28, 1)";
        el.style.transform = "";
      }
    });

    const cleanup = window.setTimeout(() => {
      window.cancelAnimationFrame(frame);
      for (const el of animated) {
        el.style.transition = "";
        el.style.transform = "";
      }
    }, 320);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(cleanup);
    };
  }, [stripItems, disableDrag]);

  const ghostLayer =
    !disableDrag && dragUi && ghostTab && typeof document !== "undefined"
      ? createPortal(
          <div
            className={`cursor-unified-tab-ghost${dragUi.settling ? " is-settling" : ""}${draggingFirstTab ? " is-first-drag" : ""}`}
            style={{
              width: dragUi.width,
              height: dragUi.height,
              transform: `translate3d(${dragUi.ghostX}px, ${dragUi.ghostY}px, 0)`,
            }}
            onTransitionEnd={onGhostSettleEnd}
            aria-hidden
          >
            <Icon
              name={workspaceTabIcon(ghostTab)}
              size={13}
              className="text-cursor-muted shrink-0"
            />
            <span className="cursor-unified-tab-label">
              {ghostTab.kind === "file" && ghostTab.dirty ? "• " : ""}
              {ghostTab.title}
            </span>
          </div>,
          document.body
        )
      : null;

  const tabCount = stripItems.filter((item) => item.kind === "tab").length;

  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const pinLeft = () => {
      el.scrollLeft = 0;
    };
    // Tabs start on the left; only nudge when the active tab is off-screen.
    if (activeKey && tabCount > 0) {
      const activeEl = tabRefs.current.get(activeKey);
      if (activeEl) {
        activeEl.scrollIntoView?.({ inline: "nearest", block: "nearest" });
        return;
      }
    }
    pinLeft();
    const raf = window.requestAnimationFrame(pinLeft);
    return () => window.cancelAnimationFrame(raf);
  }, [baseOrder, activeKey, tabCount]);

  return (
    <>
    <div
      className={`cursor-unified-tabs${disableDrag ? " is-compact" : ""}${isDragging ? " is-dragging-strip" : ""}${isSettling ? " is-settling-strip" : ""}`}
      style={tabCount > 0 ? ({ "--tab-count": tabCount } as React.CSSProperties) : undefined}
    >
      <div
        ref={stripRef}
        className="cursor-unified-tabs-scroll"
        role="tablist"
        aria-label="Workspace tabs"
        onPointerMove={disableDrag ? undefined : onTabPointerMove}
      >
      {stripItems.map((item, itemIndex) => {
        if (item.kind === "placeholder") {
          return (
            <div
              key={item.key}
              className="cursor-unified-tab-placeholder"
              aria-hidden
            />
          );
        }

        const tab = item.tab;
        const tabVisualIndex = stripItems
          .slice(0, itemIndex)
          .filter((candidate) => candidate.kind === "tab").length;
        const chatTabClasses =
          tab.kind === "chat" ? tab.tabClasses ?? "" : "";
        const chatDotClass = tab.kind === "chat" ? tab.tabDotClass ?? "" : "";
        const chatTabTitle =
          tab.kind === "chat" && tab.tabTitle ? tab.tabTitle : null;
        const showLiveDot =
          tab.kind === "chat" &&
          (tab.status === "streaming" ||
            tab.status === "awaiting" ||
            tab.status === "error");
        const active = tab.key === activeKey;
        const previewUrl = tab.previewUrl;
        const showPreview = Boolean(previewUrl || tab.previewInitials);
        return (
          <div
            key={tab.key}
            ref={(el) => {
              if (el) tabRefs.current.set(tab.key, el);
              else tabRefs.current.delete(tab.key);
            }}
            role="tab"
            tabIndex={active ? 0 : -1}
            data-tab-key={tab.key}
            data-tab-signal={tab.kind === "chat" ? tab.tabSignal ?? "" : undefined}
            aria-selected={active}
            className={`cursor-unified-tab${active ? " is-active" : ""}${showPreview ? " has-preview" : ""}${chatTabClasses ? ` ${chatTabClasses}` : ""}${dragKey === tab.key ? " is-drag-source" : ""}${!disableDrag && enteringKey === tab.key ? " is-entering" : ""}`}
            style={{
              "--tab-stack": tabCount - tabVisualIndex,
              "--tab-overlap-inset": tabVisualIndex > 0 ? "12px" : "0px",
            } as React.CSSProperties}
            title={
              tab.kind === "file"
                ? displayEntryPath(tab)
                : chatTabTitle
                  ? `${tab.title} — ${chatTabTitle}`
                  : tab.title
            }
            onPointerDown={disableDrag ? undefined : (e) => onTabPointerDown(tab, e)}
            onPointerUp={disableDrag ? undefined : (e) => onTabPointerUp(tab, e)}
            onPointerCancel={disableDrag ? undefined : onTabPointerCancel}
            onAuxClick={(e) => onMiddleClose(tab, e)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(tab.key);
              }
            }}
            onClick={(e) => {
              if (e.target.closest?.(".cursor-tab-close")) return;
              if (didDragRef.current) {
                didDragRef.current = false;
                e.preventDefault();
                return;
              }
              onSelect(tab.key);
            }}
          >
            {tab.previewUrl ? (
              <span className="cursor-unified-tab-preview shrink-0 pointer-events-none" aria-hidden="true">
                {tab.previewKind === "video" ? (
                  <video src={tab.previewUrl} muted playsInline preload="metadata" />
                ) : (
                  <img src={tab.previewUrl} alt="" loading="lazy" />
                )}
              </span>
            ) : tab.previewInitials ? (
              <span
                className="cursor-unified-tab-preview is-initials shrink-0 pointer-events-none"
                aria-hidden="true"
                style={tab.previewAvatarStyle || undefined}
              >
                {tab.previewInitials}
              </span>
            ) : (
              <Icon
                name={workspaceTabIcon(tab)}
                size={13}
                className="text-cursor-muted shrink-0 pointer-events-none"
              />
            )}
            <span className="cursor-unified-tab-label pointer-events-none">
              {tab.kind === "file" && tab.dirty ? "• " : ""}
              {typeof tab.title === "string" || typeof tab.title === "number"
                ? tab.title
                : String(tab.title ?? "Untitled")}
            </span>
            {showLiveDot ? (
              <span
                className={`cursor-live-dot shrink-0 pointer-events-none ${chatDotClass}`.trim()}
                title={chatTabTitle ?? (tab.status === "error" ? "Run failed" : "Agent active")}
              />
            ) : null}
            {tab.loading || tab.saving ? (
              <span className="chat-spin shrink-0 pointer-events-none">
                <Icon name="loader" size={12} />
              </span>
            ) : null}
            <button
              type="button"
              className="cursor-tab-close shrink-0"
              tabIndex={0}
              title="Close tab"
              aria-label="Close tab"
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => onCloseTab(tab, e)}
              onAuxClick={(e) => {
                e.stopPropagation();
                onMiddleClose(tab, e);
              }}
            >
              <Icon name="x" size={12} className="pointer-events-none" />
            </button>
          </div>
        );
      })}
      </div>
      {onNewChat ? (
        <button
          ref={newChatRef}
          type="button"
          className={`cursor-unified-tab cursor-unified-tab-new${isDragging ? " is-strip-new-during-drag" : ""}`}
          title="New chat"
          aria-label="New chat"
          onClick={onNewChat}
        >
          <Icon name="plus" size={14} />
        </button>
      ) : null}
    </div>
    {ghostLayer}
    </>
  );
}

export const UnifiedTabStrip = memo(UnifiedTabStripInner, stripTabsEqual);
