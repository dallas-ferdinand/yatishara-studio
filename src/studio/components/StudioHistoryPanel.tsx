// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, MessageSquare, Search, X } from "lucide-react";
import { ResizableSideSheet } from "./ResizableSideSheet";

const GROUP_ORDER = ["Today", "Yesterday", "This week", "Older"];

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
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const t = date.getTime();
  if (t >= today) return "Today";
  if (t >= today - dayMs) return "Yesterday";
  if (t >= today - 7 * dayMs) return "This week";
  return "Older";
}

export function StudioHistoryPanel({ threads = [], activeThreadId, onSelectThread, onClose }) {
  const [query, setQuery] = useState("");
  const searchRef = useRef(null);

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

  const sorted = useMemo(
    () => [...threads].sort((a, b) => (b.updatedAt ?? b._creationTime) - (a.updatedAt ?? a._creationTime)),
    [threads],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((thread) => (thread.title || "Untitled generation").toLowerCase().includes(q));
  }, [sorted, query]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const thread of filtered) {
      const label = historyGroupLabel(thread.updatedAt ?? thread._creationTime);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(thread);
    }
    return GROUP_ORDER.filter((group) => map.has(group)).map((group) => ({
      label: group,
      items: map.get(group),
    }));
  }, [filtered]);

  const totalLabel = threads.length === 1 ? "1 thread" : `${threads.length} threads`;

  return (
    <ResizableSideSheet
      ariaLabel="Generation history"
      backdropLabel="Close history"
      onClose={onClose}
      autoSaveId="studio-history-w"
      defaultSize={25}
      minSize={18}
      maxSize={40}
      panelClassName="studio-history-floating-panel"
    >
      <header className="studio-history-floating-head">
          <div className="studio-history-head-copy">
            <h2 className="studio-history-head-title">History</h2>
            <p className="studio-history-head-meta">{totalLabel}</p>
          </div>
          <button type="button" className="cursor-icon-btn cursor-icon-btn-sm" onClick={onClose} aria-label="Close history">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="studio-history-search-wrap">
          <Search className="studio-history-search-icon" aria-hidden="true" />
          <input
            ref={searchRef}
            className="studio-history-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search generations…"
            aria-label="Search generation history"
          />
          {query ? (
            <button
              type="button"
              className="studio-history-search-clear"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div className="studio-history-list">
          {!threads.length ? (
            <div className="studio-history-empty">
              <MessageSquare className="studio-history-empty-icon" aria-hidden="true" />
              <p className="studio-history-empty-title">No generations yet</p>
              <p className="studio-history-empty-copy">Your past prompts and results will show up here.</p>
            </div>
          ) : !filtered.length ? (
            <div className="studio-history-empty">
              <Search className="studio-history-empty-icon" aria-hidden="true" />
              <p className="studio-history-empty-title">No matches</p>
              <p className="studio-history-empty-copy">Try a different search term.</p>
            </div>
          ) : (
            grouped.map((group) => (
              <section key={group.label} className="studio-history-group">
                <h3 className="studio-history-group-label">{group.label}</h3>
                <div className="studio-history-group-items">
                  {group.items.map((thread) => {
                    const when = thread.updatedAt ?? thread._creationTime;
                    const title = thread.title?.trim() || "Untitled generation";
                    const active = thread._id === activeThreadId;
                    return (
                      <button
                        key={thread._id}
                        type="button"
                        className={`studio-history-item${active ? " is-active" : ""}`}
                        onClick={() => onSelectThread(thread._id)}
                        title={title}
                      >
                        <span className="studio-history-item-icon" aria-hidden="true">
                          <MessageSquare className="h-3.5 w-3.5" />
                        </span>
                        <span className="studio-history-item-body">
                          <span className="studio-history-item-title">{title}</span>
                          <span className="studio-history-item-date">
                            <Clock3 className="studio-history-item-date-icon" aria-hidden="true" />
                            {formatHistoryWhen(when)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
    </ResizableSideSheet>
  );
}
