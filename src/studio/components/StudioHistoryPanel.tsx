// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "convex/react";
import {
  ChevronDown,
  Clock3,
  FileText,
  Play,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Music,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { ResizableSideSheet } from "./ResizableSideSheet";

const DEFAULT_OPEN_GROUPS = new Set(["Open", "Today", "Yesterday"]);

function formatHistoryWhen(ts) {
  const diff = Date.now() - ts;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "Just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  const date = new Date(ts);
  const now = new Date();
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function historyGroupLabel(ts) {
  const now = new Date();
  const date = new Date(ts);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const t = date.getTime();
  if (t >= todayStart) return "Today";
  if (t >= todayStart - dayMs) return "Yesterday";
  if (t >= todayStart - 7 * dayMs) return "This week";
  return "Older";
}

function cleanHistoryTitle(thread) {
  const raw = String(thread?.title ?? "").trim();
  if (raw && raw !== "[object Object]" && raw !== "New generation" && raw !== "API generation") {
    return raw;
  }
  const snippet = String(thread?.previewSnippet ?? "").trim();
  if (snippet) return snippet;
  return "Untitled";
}

function isVideoThumbUrl(url) {
  return typeof url === "string" && /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
}

function HistoryChip({ chip }) {
  const kind = String(chip?.kind ?? "file").toLowerCase();
  const thumb = chip?.thumbnailUrl;
  const isVideoThumb = kind === "video" || isVideoThumbUrl(thumb);
  const isImagey = Boolean(thumb) && (kind === "image" || kind === "video" || Boolean(chip?.elementType));
  const Icon =
    kind === "video"
      ? Play
      : kind === "audio"
        ? Music
        : kind === "image" || chip?.elementType
          ? ImageIcon
          : kind === "folder"
            ? Sparkles
            : FileText;

  if (isImagey) {
    return (
      <span className="studio-history-chip studio-history-chip--image" title={chip.label}>
        {isVideoThumb ? (
          <video
            src={thumb}
            className="studio-history-chip-media"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <img src={thumb} alt="" className="studio-history-chip-media" loading="lazy" decoding="async" />
        )}
      </span>
    );
  }

  return (
    <span className="studio-history-chip" title={chip.label}>
      {thumb ? (
        isVideoThumbUrl(thumb) ? (
          <video
            src={thumb}
            className="studio-history-chip-media is-inline"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <img src={thumb} alt="" className="studio-history-chip-media is-inline" loading="lazy" decoding="async" />
        )
      ) : (
        <Icon
          className="studio-history-chip-icon"
          aria-hidden="true"
          {...(kind === "video" ? { strokeWidth: 2.85 } : {})}
        />
      )}
      <span className="studio-history-chip-label">{chip.label}</span>
    </span>
  );
}

function HistoryThreadCard({ thread, active, onSelect }) {
  const when = thread.updatedAt ?? thread._creationTime;
  const title = cleanHistoryTitle(thread);
  const chips = thread.previewChips ?? [];
  const thumbs = (thread.resultThumbs ?? []).filter((item) => item.thumbnailUrl).slice(0, 3);

  return (
    <button
      type="button"
      className={`studio-history-item${active ? " is-active" : ""}`}
      onClick={() => onSelect(thread._id)}
      title={title}
    >
      <span className="studio-history-item-main">
        <span className="studio-history-item-title">{title}</span>
        {thread.previewSnippet && thread.previewSnippet !== title ? (
          <span className="studio-history-item-snippet">{thread.previewSnippet}</span>
        ) : null}
        {chips.length || thumbs.length ? (
          <span className="studio-history-item-chips">
            {thumbs.map((thumb) => (
              <span key={thumb._id} className="studio-history-chip studio-history-chip--image" title="Result">
                {thumb.kind === "video" || isVideoThumbUrl(thumb.thumbnailUrl) ? (
                  <video
                    src={thumb.thumbnailUrl}
                    className="studio-history-chip-media"
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img
                    src={thumb.thumbnailUrl}
                    alt=""
                    className="studio-history-chip-media"
                    loading="lazy"
                    decoding="async"
                  />
                )}
              </span>
            ))}
            {chips.map((chip, index) => (
              <HistoryChip key={`${chip.label}-${index}`} chip={chip} />
            ))}
          </span>
        ) : null}
        <span className="studio-history-item-date">
          <Clock3 className="studio-history-item-date-icon" aria-hidden="true" />
          {formatHistoryWhen(when)}
        </span>
      </span>
    </button>
  );
}

function HistoryGroupSection({
  label,
  count,
  open,
  onToggle,
  items,
  loading,
  hasMore,
  onLoadMore,
  activeThreadId,
  onSelectThread,
}) {
  return (
    <section className={`studio-history-group${open ? " is-open" : ""}`}>
      <button type="button" className="studio-history-group-toggle" aria-expanded={open} onClick={onToggle}>
        <span className="studio-history-group-meta is-start">
          {typeof count === "number" ? <span className="studio-history-group-count">{count}</span> : <span />}
        </span>
        <span className="studio-history-group-label">{label}</span>
        <span className="studio-history-group-meta is-end">
          <ChevronDown className="studio-history-group-chevron" aria-hidden="true" />
        </span>
      </button>
      {open ? (
        <div className="studio-history-group-body">
          {loading && !items.length ? (
            <div className="studio-history-group-loading">
              <Loader2 className="studio-history-spin" aria-hidden="true" />
              <span>Loading…</span>
            </div>
          ) : items.length ? (
            <div className="studio-history-group-items">
              {items.map((thread) => (
                <HistoryThreadCard
                  key={thread._id}
                  thread={thread}
                  active={thread._id === activeThreadId}
                  onSelect={onSelectThread}
                />
              ))}
            </div>
          ) : (
            <p className="studio-history-group-empty">Nothing here yet.</p>
          )}
          {hasMore ? (
            <button type="button" className="studio-history-load-more" onClick={onLoadMore} disabled={loading}>
              {loading ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function useHistoryRange(range, enabled, expiresUnix) {
  const [cursor, setCursor] = useState(undefined);
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);

  const page = useQuery(
    api.generation.listHistoryThreads,
    enabled
      ? {
          range,
          expiresUnix,
          ...(cursor != null ? { cursor } : {}),
          limit: 12,
        }
      : "skip",
  );

  useEffect(() => {
    if (!enabled) {
      setCursor(undefined);
      setItems([]);
      setHasMore(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!page) return;
    setItems((prev) => {
      if (cursor == null) return page.threads;
      const seen = new Set(prev.map((thread) => thread._id));
      return [...prev, ...page.threads.filter((thread) => !seen.has(thread._id))];
    });
    setHasMore(Boolean(page.hasMore));
  }, [page, cursor]);

  function loadMore() {
    if (!page?.nextCursor || !page.hasMore) return;
    setCursor(page.nextCursor);
  }

  return {
    items,
    loading: enabled && page === undefined,
    hasMore,
    loadMore,
  };
}

function HistoryPanelBody({
  openThreadIds,
  indexThreads,
  activeThreadId,
  onSelectThread,
  expiresUnix,
  query,
  setQuery,
  searchRef,
}) {
  const [openGroups, setOpenGroups] = useState(() => new Set(DEFAULT_OPEN_GROUPS));
  const openIdSet = useMemo(() => new Set(openThreadIds.filter(Boolean)), [openThreadIds]);

  const recent = useHistoryRange("recent", true, expiresUnix);
  const weekOpen = openGroups.has("This week");
  const olderOpen = openGroups.has("Older");
  const week = useHistoryRange("this_week", weekOpen, expiresUnix);
  const older = useHistoryRange("older", olderOpen, expiresUnix);

  const indexSorted = useMemo(
    () => [...(indexThreads ?? [])].sort((a, b) => (b.updatedAt ?? b._creationTime) - (a.updatedAt ?? a._creationTime)),
    [indexThreads],
  );

  const counts = useMemo(() => {
    const next = { "This week": 0, Older: 0, Open: 0 };
    for (const thread of indexSorted) {
      const label = historyGroupLabel(thread.updatedAt ?? thread._creationTime);
      if (label === "This week" || label === "Older") next[label] += 1;
      if (openIdSet.has(thread._id)) next.Open += 1;
    }
    return next;
  }, [indexSorted, openIdSet]);

  const openThreads = useMemo(() => {
    const byId = new Map(recent.items.map((thread) => [thread._id, thread]));
    for (const thread of week.items) byId.set(thread._id, thread);
    for (const thread of older.items) byId.set(thread._id, thread);
    for (const thread of indexSorted) {
      if (!byId.has(thread._id)) byId.set(thread._id, thread);
    }
    return openThreadIds.map((id) => byId.get(id)).filter(Boolean);
  }, [openThreadIds, recent.items, week.items, older.items, indexSorted]);

  const q = query.trim().toLowerCase();
  const filterThreads = (list) => {
    if (!q) return list;
    return list.filter((thread) => {
      const title = cleanHistoryTitle(thread).toLowerCase();
      const snippet = String(thread.previewSnippet ?? "").toLowerCase();
      const chipText = (thread.previewChips ?? []).map((chip) => chip.label).join(" ").toLowerCase();
      return title.includes(q) || snippet.includes(q) || chipText.includes(q);
    });
  };

  const todayItems = filterThreads(
    recent.items.filter((thread) => historyGroupLabel(thread.updatedAt ?? thread._creationTime) === "Today"),
  );
  const yesterdayItems = filterThreads(
    recent.items.filter((thread) => historyGroupLabel(thread.updatedAt ?? thread._creationTime) === "Yesterday"),
  );
  const weekItems = filterThreads(week.items);
  const olderItems = filterThreads(older.items);
  const openItems = filterThreads(openThreads);

  function toggleGroup(label) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  const emptyIndex = !(indexThreads?.length || recent.items.length);

  return (
    <>
      <div className="studio-history-search-wrap">
        <Search className="studio-history-search-icon" aria-hidden="true" />
        <input
          ref={searchRef}
          className="studio-history-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search history…"
          aria-label="Search history"
        />
        {query ? (
          <button
            type="button"
            className="studio-history-search-clear"
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            <X aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="studio-history-list">
        {emptyIndex && !recent.loading ? (
          <div className="studio-history-empty">
            <MessageSquare className="studio-history-empty-icon" aria-hidden="true" />
            <p className="studio-history-empty-title">No generations yet</p>
            <p className="studio-history-empty-copy">Your past prompts and results will show up here.</p>
          </div>
        ) : (
          <>
            {openItems.length ? (
              <HistoryGroupSection
                label="Open"
                count={counts.Open}
                open={openGroups.has("Open")}
                onToggle={() => toggleGroup("Open")}
                items={openItems}
                loading={false}
                hasMore={false}
                activeThreadId={activeThreadId}
                onSelectThread={onSelectThread}
              />
            ) : null}

            <HistoryGroupSection
              label="Today"
              count={todayItems.length}
              open={openGroups.has("Today")}
              onToggle={() => toggleGroup("Today")}
              items={todayItems}
              loading={recent.loading}
              hasMore={false}
              activeThreadId={activeThreadId}
              onSelectThread={onSelectThread}
            />

            <HistoryGroupSection
              label="Yesterday"
              count={yesterdayItems.length}
              open={openGroups.has("Yesterday")}
              onToggle={() => toggleGroup("Yesterday")}
              items={yesterdayItems}
              loading={recent.loading}
              hasMore={false}
              activeThreadId={activeThreadId}
              onSelectThread={onSelectThread}
            />

            <HistoryGroupSection
              label="This week"
              count={counts["This week"]}
              open={weekOpen}
              onToggle={() => toggleGroup("This week")}
              items={weekItems}
              loading={week.loading}
              hasMore={!q && week.hasMore}
              onLoadMore={week.loadMore}
              activeThreadId={activeThreadId}
              onSelectThread={onSelectThread}
            />

            <HistoryGroupSection
              label="Older"
              count={counts.Older}
              open={olderOpen}
              onToggle={() => toggleGroup("Older")}
              items={olderItems}
              loading={older.loading}
              hasMore={!q && older.hasMore}
              onLoadMore={older.loadMore}
              activeThreadId={activeThreadId}
              onSelectThread={onSelectThread}
            />
          </>
        )}
      </div>
    </>
  );
}

/** Landing-menu-style bottom overlay: grab handle, peek ↔ full, flick dismiss. */
function HistoryMobileSheet({ onClose, children }) {
  const sheetRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [entered, setEntered] = useState(false);
  const heightRef = useRef(null);
  const dragRef = useRef(null);
  const dragRafRef = useRef(null);
  const metricsRef = useRef({ peek: 280, full: 520, min: 120 });

  const readTokenPx = (el, name, fallback) => {
    if (!el) return fallback;
    const raw = getComputedStyle(el).getPropertyValue(name).trim();
    if (!raw) return fallback;
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;height:${raw}`;
    el.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    probe.remove();
    return h > 0 ? h : fallback;
  };

  const refreshMetrics = () => {
    const sheet = sheetRef.current;
    const root = sheet?.closest?.(".studio-polish") ?? document.documentElement;
    const peek = readTokenPx(root, "--studio-mobile-history-sheet-height", window.innerHeight * 0.55);
    const full = readTokenPx(root, "--studio-mobile-history-sheet-full", window.innerHeight * 0.72);
    metricsRef.current = {
      peek,
      full: Math.max(full, peek + 40),
      min: Math.max(110, peek * 0.42),
    };
    return metricsRef.current;
  };

  const applyHeight = (px) => {
    heightRef.current = px;
    const el = sheetRef.current;
    if (!el) return;
    el.style.height = `${px}px`;
    el.style.maxHeight = `${px}px`;
  };

  useEffect(() => {
    const { peek } = refreshMetrics();
    applyHeight(peek);
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const settleTo = (fromH, target) => {
    const { peek, full } = metricsRef.current;
    setDragging(false);
    setSettling(true);
    applyHeight(fromH);
    window.requestAnimationFrame(() => {
      applyHeight(target);
      setIsFull(target >= full - 8 || (target > peek + (full - peek) * 0.5));
      window.setTimeout(() => setSettling(false), 230);
    });
  };

  const onHandlePointerDown = (event) => {
    if (event.button != null && event.button !== 0) return;
    const { peek, full } = refreshMetrics();
    const startH =
      sheetRef.current?.getBoundingClientRect().height ||
      heightRef.current ||
      peek;
    const now = performance.now();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      startY: event.clientY,
      startH,
      lastY: event.clientY,
      lastT: now,
      vy: 0,
      full,
      peek,
    };
    setSettling(false);
    setDragging(true);
    applyHeight(startH);
  };

  const onHandlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { full, min } = metricsRef.current;
    const now = performance.now();
    const dt = now - drag.lastT;
    if (dt > 0) {
      const instant = (event.clientY - drag.lastY) / dt;
      drag.vy = drag.vy * 0.35 + instant * 0.65;
      drag.lastY = event.clientY;
      drag.lastT = now;
    }
    const dy = event.clientY - drag.startY;
    applyHeight(Math.min(full, Math.max(min, drag.startH - dy)));
    if (dragRafRef.current == null) {
      dragRafRef.current = window.requestAnimationFrame(() => {
        dragRafRef.current = null;
      });
    }
  };

  const onHandlePointerUp = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (dragRafRef.current != null) {
      window.cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    const { peek, full, min } = metricsRef.current;
    const h =
      heightRef.current ??
      sheetRef.current?.getBoundingClientRect().height ??
      peek;
    const mid = (peek + full) / 2;
    const range = Math.max(1, full - peek);
    const dragDown = drag.startH - h;
    const dragUp = h - drag.startH;
    const fromFull = drag.startH >= full - 12;
    const fresh = performance.now() - drag.lastT < 80;
    const vy = fresh ? drag.vy : 0;
    const flickUp = vy < -0.42;
    const flickDown = vy > 0.42;

    if (flickUp || (!fromFull && dragUp > range * 0.22 && h > peek + 8)) {
      settleTo(h, full);
      return;
    }

    if (fromFull) {
      const bigSwipeDown =
        h <= peek * 0.78 ||
        h <= min + 8 ||
        dragDown >= range * 0.55 ||
        (flickDown && dragDown >= range * 0.32);
      if (bigSwipeDown) {
        setDragging(false);
        setSettling(false);
        onClose?.();
        return;
      }
      if (flickDown || dragDown > 18 || h < full - 10) {
        settleTo(h, peek);
        return;
      }
      settleTo(h, full);
      return;
    }

    if (flickDown || h <= peek * 0.72 || h <= min + 8) {
      setDragging(false);
      setSettling(false);
      onClose?.();
      return;
    }
    settleTo(h, h >= mid ? full : peek);
  };

  return (
    <div
      ref={sheetRef}
      className={`studio-history-mobile-sheet${entered ? " is-entered" : " is-entering"}${isFull ? " is-full" : ""}${dragging ? " is-dragging" : ""}${settling ? " is-settling" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="History"
    >
      <div
        className="studio-history-mobile-sheet-handle"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize history"
      >
        <span className="studio-history-mobile-sheet-grab" aria-hidden="true" />
      </div>
      <div className="studio-history-mobile-sheet-body">{children}</div>
    </div>
  );
}

export function StudioHistoryPanel({
  indexThreads = [],
  openThreadIds = [],
  activeThreadId,
  onSelectThread,
  onClose,
  expiresUnix,
  isMobile = false,
}) {
  const [query, setQuery] = useState("");
  const [portalRoot, setPortalRoot] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    setPortalRoot(document.querySelector(".studio-polish") ?? document.body);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const body = (
    <HistoryPanelBody
      openThreadIds={openThreadIds}
      indexThreads={indexThreads}
      activeThreadId={activeThreadId}
      onSelectThread={onSelectThread}
      expiresUnix={expiresUnix}
      query={query}
      setQuery={setQuery}
      searchRef={searchRef}
    />
  );

  if (isMobile) {
    if (!portalRoot) return null;
    return createPortal(
      <HistoryMobileSheet onClose={onClose}>{body}</HistoryMobileSheet>,
      portalRoot,
    );
  }

  return (
    <ResizableSideSheet
      ariaLabel="History"
      backdropLabel="Close history"
      onClose={onClose}
      autoSaveId="studio-history-w"
      defaultSize={25}
      minSize={18}
      maxSize={40}
      panelClassName="studio-history-floating-panel"
    >
      <header className="studio-history-floating-head">
        <h2 className="studio-history-head-title">History</h2>
        <button
          type="button"
          className="cursor-icon-btn cursor-icon-btn-sm studio-panel-close"
          onClick={onClose}
          aria-label="Close history"
        >
          <X aria-hidden="true" />
        </button>
      </header>
      {body}
    </ResizableSideSheet>
  );
}
