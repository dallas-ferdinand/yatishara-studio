// @ts-nocheck
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
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

function tabFromKey(tabs, key) {
  return (tabs ?? []).find((t) => t.key === key) ?? null;
}

function stripTabsEqual(prev, next) {
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
}) {
  const stripRef = useRef(null);
  const newChatRef = useRef(null);
  const tabRefs = useRef(new Map());
  const pendingRef = useRef(null);
  const dragRef = useRef(null);
  const didDragRef = useRef(false);
  const settleTimerRef = useRef(null);

  const [dragUi, setDragUi] = useState(null);

  useHorizontalWheelScroll(stripRef);

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const baseOrder = useMemo(() => (tabs ?? []).map((t) => t.key), [tabs]);

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
      const target = ghostTargetAtInsertIndex(drag.layout, insertIndex);
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

  const finishDrag = useCallback(
    (pointerId) => {
      const drag = dragRef.current;
      if (!drag) return;
      beginSettle(drag, pointerId);
    },
    [beginSettle]
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
    const dragLeadingX = ghostX + TAB_DRAG_LEADING_INSET_PX;

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
      const dragLeadingX = pending.startX - pending.offsetX + TAB_DRAG_LEADING_INSET_PX;

      const captureEl = tabRefs.current.get(pending.key);
      try {
        captureEl?.setPointerCapture?.(pending.pointerId);
      } catch {
        /* ignore */
      }

      const initial = applyDragMove(
        {
          key: pending.key,
          pointerId: pending.pointerId,
          offsetX: pending.offsetX,
          offsetY: pending.offsetY,
          width: pending.width,
          height: pending.height,
          order,
          layout,
          stripIndex: -1,
          lastLeadingX: dragLeadingX,
          ghostYBase: pending.startY - pending.offsetY,
          captureEl,
        },
        e.clientX,
        e.clientY
      );

      dragRef.current = initial;
      pendingRef.current = null;
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

    const next = applyDragMove(active, e.clientX, e.clientY);
    dragRef.current = next;
    setDragUi({
      key: next.key,
      order: next.order,
      insertIndex: next.insertIndex,
      ghostX: next.ghostX,
      ghostY: next.ghostY,
      width: next.width,
      height: next.height,
      mode: next.mode ?? null,
    });
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
  const placeholderAt = dragKey != null ? (dragUi?.insertIndex ?? 0) : -1;

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

  const isDragging = Boolean(dragUi && !dragUi.settling);
  const isSettling = Boolean(dragUi?.settling);

  const ghostTab = dragUi ? tabFromKey(tabs, dragUi.key) : null;

  return (
    <div
      ref={stripRef}
      className={`cursor-unified-tabs${isDragging ? " is-dragging-strip" : ""}${isSettling ? " is-settling-strip" : ""}`}
      role="tablist"
      aria-label="Workspace tabs"
      onPointerMove={onTabPointerMove}
    >
      {stripItems.map((item) => {
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
            className={`cursor-unified-tab${active ? " is-active" : ""}${chatTabClasses ? ` ${chatTabClasses}` : ""}${dragKey === tab.key ? " is-drag-source" : ""}`}
            title={
              tab.kind === "file"
                ? tab.path
                : chatTabTitle
                  ? `${tab.title} — ${chatTabTitle}`
                  : tab.title
            }
            onPointerDown={(e) => onTabPointerDown(tab, e)}
            onPointerUp={(e) => onTabPointerUp(tab, e)}
            onPointerCancel={onTabPointerCancel}
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
            <Icon
              name={workspaceTabIcon(tab)}
              size={13}
              className="text-cursor-muted shrink-0 pointer-events-none"
            />
            <span className="cursor-unified-tab-label pointer-events-none">
              {tab.kind === "file" && tab.dirty ? "• " : ""}
              {tab.title}
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
            ) : (
              <button
                type="button"
                className="cursor-tab-close shrink-0"
                tabIndex={-1}
                title="Close tab"
                aria-label="Close tab"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => onCloseTab(tab, e)}
                onAuxClick={(e) => {
                  e.stopPropagation();
                  onMiddleClose(tab, e);
                }}
              >
                <Icon name="x" size={12} className="pointer-events-none" />
              </button>
            )}
          </div>
        );
      })}
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
      {dragUi && ghostTab ? (
        <div
          className={`cursor-unified-tab-ghost${dragUi.settling ? " is-settling" : ""}`}
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
        </div>
      ) : null}
    </div>
  );
}

export const UnifiedTabStrip = memo(UnifiedTabStripInner, stripTabsEqual);
