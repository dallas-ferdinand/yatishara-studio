"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import {
  ArrowDown,
  Check,
  CircleHelp,
  Images,
  ListTodo,
  Loader2,
  MessageSquare,
  MessagesSquare,
  Search,
  Wallet,
  X,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { formatTtdFromCredits } from "@/studio/lib/money";
import { parseBoard } from "./todoBoard";

type AgentChatSidebarProps = {
  threadId: Id<"agentThreads">;
  open: boolean;
  onClose: () => void;
  creditPriceCents?: number | null;
  agentBusy?: boolean;
  variant?: "docked" | "sheet";
  /** Bunny signed URL expiry — required for Media thumbnails. */
  expiresUnix?: number;
};

type TabId = "info" | "media";

/** Wrap query matches like DM search pills — grouped words, no extra spacing. */
function highlightSearchMatches(text: string, query: string): ReactNode {
  const raw = query.trim();
  if (!text || !raw) return text;

  const terms = raw
    .split(/\s+/)
    .map((term) => term.replace(/^[@#]+/, ""))
    .filter((term) => term.length > 0);
  if (terms.length === 0) return text;

  const ranges: Array<{ start: number; end: number }> = [];
  const pushMatches = (pattern: RegExp) => {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
        continue;
      }
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  };

  const phrase = terms
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  pushMatches(new RegExp(phrase, "gi"));
  for (const term of terms) {
    pushMatches(
      new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
    );
  }

  if (ranges.length === 0) return text;

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...range });
      continue;
    }
    const between = text.slice(last.end, range.start);
    if (range.start <= last.end || /^[\s]*$/.test(between)) {
      last.end = Math.max(last.end, range.end);
      continue;
    }
    merged.push({ ...range });
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  merged.forEach((range, index) => {
    if (range.start > cursor) {
      nodes.push(
        <Fragment key={`t-${index}-${cursor}`}>
          {text.slice(cursor, range.start)}
        </Fragment>,
      );
    }
    nodes.push(
      <mark key={`h-${index}-${range.start}`} className="studio-dm-search-hit">
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) {
    nodes.push(<Fragment key={`t-end`}>{text.slice(cursor)}</Fragment>);
  }
  return nodes;
}

function AccordionSection({
  title,
  icon,
  meta,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon?: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="cursor-settings-section studio-agent-sidebar-card is-accordion">
      <button
        type="button"
        className="studio-agent-sidebar-acc-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="studio-settings-card-title">
          {icon ? (
            <span className="studio-dm-peer-section-icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          {title}
        </div>
        <span className="studio-agent-sidebar-acc-meta">
          {meta}
          <ArrowDown
            className={`studio-agent-sidebar-acc-chevron h-3.5 w-3.5${open ? " is-open" : ""}`}
            aria-hidden="true"
          />
        </span>
      </button>
      {open ? <div className="studio-agent-sidebar-card-body">{children}</div> : null}
    </section>
  );
}

export function AgentChatSidebar({
  threadId,
  open,
  onClose,
  creditPriceCents,
  agentBusy,
  variant = "docked",
  expiresUnix,
}: AgentChatSidebarProps) {
  const [tab, setTab] = useState<TabId>("info");
  const [search, setSearch] = useState("");
  const searchNeedle = search.trim();
  const searching = searchNeedle.length > 0;

  const insight = useQuery(
    api.agentThreads.threadInsight,
    open ? { threadId, search: searching ? searchNeedle : undefined } : "skip",
  );

  const board = useMemo(
    () => parseBoard(insight?.todosJson),
    [insight?.todosJson],
  );

  const mediaIds = useMemo(() => {
    const ids: Id<"assets">[] = [];
    const seen = new Set<string>();
    const source = searching
      ? insight?.search?.media ?? []
      : insight?.media ?? [];
    for (const item of source) {
      const id = String(item.assetId || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id as Id<"assets">);
    }
    return ids.slice(0, 40);
  }, [insight?.media, insight?.search?.media, searching]);
  const mediaAssets = useQuery(
    api.assets.listByIds,
    open &&
      mediaIds.length &&
      typeof expiresUnix === "number" &&
      (searching || tab === "media")
      ? { assetIds: mediaIds, quality: "thumb" as const, expiresUnix }
      : "skip",
  );
  const thumbById = useMemo(() => {
    const map = new Map<string, string>();
    for (const asset of mediaAssets ?? []) {
      const url =
        asset.signedThumbnailUrl ||
        asset.signedThumbnailLqipUrl ||
        asset.signedReadUrl ||
        undefined;
      if (url) map.set(String(asset._id), url);
    }
    return map;
  }, [mediaAssets]);

  if (!open) return null;

  const price = creditPriceCents ?? undefined;
  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "info", label: "Info" },
    { id: "media", label: "Media" },
  ];
  const mediaCount = insight?.media?.length ?? 0;
  const turnCount = insight?.turnCount ?? 0;
  const todoCount = board.lists.reduce((n, list) => n + list.steps.length, 0);
  const searchMessages = insight?.search?.messages ?? insight?.searchHits ?? [];
  const searchTodos = insight?.search?.todos ?? [];
  const searchMedia = insight?.search?.media ?? [];
  const searchTurns = insight?.search?.turns ?? [];
  const searchEmpty =
    searching &&
    insight !== undefined &&
    searchMessages.length === 0 &&
    searchTodos.length === 0 &&
    searchMedia.length === 0 &&
    searchTurns.length === 0;

  return (
    <aside
      className={`studio-agent-chat-sidebar${variant === "sheet" ? " is-sheet" : ""}`}
      aria-label="Agent chat info"
    >
      {variant === "sheet" ? (
        <div className="cursor-panel-head cursor-sidebar-head studio-agent-chat-sidebar-head shrink-0">
          <strong>Chat</strong>
          <div className="cursor-panel-head-tools">
            <button
              type="button"
              className="studio-composer-circle-btn studio-agent-sidebar-close"
              aria-label="Close"
              onClick={onClose}
            >
              <X size={13} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="studio-agent-sidebar-toolbar">
        <nav
          className="studio-admin-head-tabs studio-agent-sidebar-tabs"
          aria-label="Chat panels"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`studio-admin-head-tab${tab === t.id && !searching ? " is-active" : ""}`}
              onClick={() => {
                setTab(t.id);
                if (searching) setSearch("");
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="studio-agent-sidebar-toolbar-divider" aria-hidden="true" />
        <label className="studio-agent-sidebar-search">
          <Search size={12} strokeWidth={2.25} aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search messages, to-dos, media…"
            aria-label="Search this chat"
          />
          {searching ? (
            <button
              type="button"
              className="studio-agent-sidebar-search-clear"
              aria-label="Clear search"
              onClick={() => setSearch("")}
            >
              <X size={11} strokeWidth={2.5} aria-hidden="true" />
            </button>
          ) : null}
        </label>
      </div>

      <div className="studio-agent-chat-sidebar-body">
        {searching ? (
          <div className="studio-agent-sidebar-stack">
            {insight === undefined ? (
              <p className="studio-settings-empty">Searching…</p>
            ) : searchEmpty ? (
              <p className="studio-settings-empty">
                No matches across messages, to-dos, media, or turns.
              </p>
            ) : (
              <>
                {searchMessages.length ? (
                  <AccordionSection
                    title="Messages"
                    icon={<MessagesSquare className="h-3 w-3" />}
                    meta={
                      <span className="studio-agent-sidebar-acc-count">
                        {searchMessages.length}
                      </span>
                    }
                  >
                    <ul className="studio-agent-turn-cost-list">
                      {searchMessages.map((hit) => (
                        <li key={String(hit._id)} className="is-search-hit">
                          <span className="studio-agent-search-role">
                            {hit.role}
                          </span>
                          <p>
                            {highlightSearchMatches(hit.content, searchNeedle)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </AccordionSection>
                ) : null}

                {searchTodos.length ? (
                  <AccordionSection
                    title="To-dos"
                    icon={<ListTodo className="h-3 w-3" />}
                    meta={
                      <span className="studio-agent-sidebar-acc-count">
                        {searchTodos.length}
                      </span>
                    }
                  >
                    <ul className="studio-agent-turn-cost-list">
                      {searchTodos.map((todo) => (
                        <li key={todo.id} className="is-search-hit">
                          <span className="studio-agent-search-role">
                            {todo.listTitle}
                          </span>
                          <p>
                            {highlightSearchMatches(todo.text, searchNeedle)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </AccordionSection>
                ) : null}

                {searchMedia.length ? (
                  <AccordionSection
                    title="Media"
                    icon={<Images className="h-3 w-3" />}
                    meta={
                      <span className="studio-agent-sidebar-acc-count">
                        {searchMedia.length}
                      </span>
                    }
                  >
                    <ul className="studio-agent-media-grid">
                      {searchMedia.map((item) => {
                        const thumb = thumbById.get(item.assetId);
                        const sourceLabel = /attach|upload/i.test(
                          item.toolName || "",
                        )
                          ? "Attachment"
                          : "Generation";
                        const label = item.name || item.kind;
                        return (
                          <li
                            key={item.assetId}
                            className="studio-agent-media-tile"
                          >
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={thumb}
                                alt=""
                                className="studio-agent-media-tile-img"
                              />
                            ) : (
                              <span className="studio-agent-media-tile-img is-empty" />
                            )}
                            <div className="studio-agent-media-tile-overlay">
                              <strong>
                                {highlightSearchMatches(label, searchNeedle)}
                              </strong>
                              <span>{sourceLabel}</span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </AccordionSection>
                ) : null}

                {searchTurns.length ? (
                  <AccordionSection
                    title="Turns"
                    icon={<MessageSquare className="h-3 w-3" />}
                    meta={
                      <span className="studio-agent-sidebar-acc-count">
                        {searchTurns.length}
                      </span>
                    }
                  >
                    <ul className="studio-agent-turn-cost-list">
                      {searchTurns.map((run) => (
                        <li key={String(run._id)}>
                          <span className="studio-agent-turn-cost-msg">
                            {highlightSearchMatches(
                              run.userMessage || "(attachments)",
                              searchNeedle,
                            )}
                          </span>
                          <span className="studio-agent-turn-cost-meta">
                            {run.creditsSpent
                              ? formatTtdFromCredits(run.creditsSpent, price)
                              : run.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </AccordionSection>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {!searching && tab === "info" ? (
          <div className="studio-agent-sidebar-stack">
            <section
              className="cursor-settings-section studio-agent-sidebar-card studio-agent-sidebar-summary"
              aria-label="Chat summary"
            >
              <div className="studio-agent-sidebar-summary-hero">
                <Wallet
                  className="studio-agent-sidebar-summary-watermark"
                  aria-hidden="true"
                />
                <div className="studio-agent-sidebar-stat-grid">
                  <div className="studio-agent-sidebar-stat">
                    <Wallet aria-hidden="true" />
                    <strong>
                      {formatTtdFromCredits(insight?.creditsSpent ?? 0, price)}
                    </strong>
                    <span>Spent</span>
                  </div>
                  <div className="studio-agent-sidebar-stat">
                    <MessageSquare aria-hidden="true" />
                    <strong>{turnCount}</strong>
                    <span>Turns</span>
                  </div>
                  <div className="studio-agent-sidebar-stat">
                    <Images aria-hidden="true" />
                    <strong>{mediaCount}</strong>
                    <span>Media</span>
                  </div>
                </div>
              </div>
            </section>

            <AccordionSection
              title="To-do"
              icon={<ListTodo className="h-3 w-3" />}
              meta={
                todoCount ? (
                  <span className="studio-agent-sidebar-acc-count">{todoCount}</span>
                ) : null
              }
            >
              {!board.lists.length ? (
                <p className="studio-settings-empty">
                  No to-do lists yet. Multi-step work shows up here.
                </p>
              ) : (
                <div className="studio-agent-todo-accordions">
                  {board.lists.map((list) => {
                    const isCurrent =
                      list.id === board.activeId ||
                      list.status === "working" ||
                      list.status === "active";
                    const done = list.steps.filter((s) => s.status === "done").length;
                    const total = list.steps.length;
                    const working =
                      agentBusy &&
                      (list.status === "working" || list.id === board.activeId);
                    return (
                      <details
                        key={`${list.id}:${isCurrent ? "open" : "closed"}:${list.status}`}
                        className={`studio-agent-todo-acc is-${list.status}`}
                        open={isCurrent}
                      >
                        <summary>
                          <span className="studio-agent-todo-acc-title">
                            {list.title}
                          </span>
                          <span className="studio-agent-todo-acc-meta">
                            <span className="studio-agent-todo-badge" title="Items">
                              <CircleHelp size={10} aria-hidden="true" />
                              {total}
                            </span>
                            <span
                              className="studio-agent-todo-badge is-done"
                              title="Completed"
                            >
                              <Check size={10} aria-hidden="true" />
                              {done}
                            </span>
                            {working ? (
                              <Loader2
                                size={12}
                                className="animate-spin"
                                aria-label="Working"
                              />
                            ) : null}
                          </span>
                        </summary>
                        <ul className="studio-agent-todo-list">
                          {list.steps.map((step) => (
                            <li
                              key={step.id}
                              className={`is-${step.status}`}
                              data-status={step.status}
                            >
                              <span
                                className={`studio-agent-todo-check is-${
                                  step.status === "done"
                                    ? "done"
                                    : step.status === "doing" && working
                                      ? "doing"
                                      : "pending"
                                }`}
                                aria-hidden="true"
                              >
                                {step.status === "done" ? (
                                  <Check size={10} strokeWidth={2.5} />
                                ) : step.status === "doing" && working ? (
                                  <Loader2 size={10} className="animate-spin" />
                                ) : null}
                              </span>
                              <span className="studio-agent-todo-step-text">
                                {step.text}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    );
                  })}
                </div>
              )}
            </AccordionSection>

            <AccordionSection
              title="Recent turns"
              icon={<MessageSquare className="h-3 w-3" />}
              meta={
                turnCount ? (
                  <span className="studio-agent-sidebar-acc-count">{turnCount}</span>
                ) : null
              }
            >
              {!insight?.runs?.length ? (
                <p className="studio-settings-empty">No turns yet.</p>
              ) : (
                <ul className="studio-agent-turn-cost-list">
                  {(insight?.runs ?? []).slice(0, 12).map((run) => (
                    <li key={String(run._id)}>
                      <span className="studio-agent-turn-cost-msg">
                        {run.userMessage || "(attachments)"}
                      </span>
                      <span className="studio-agent-turn-cost-meta">
                        {run.creditsSpent
                          ? formatTtdFromCredits(run.creditsSpent, price)
                          : run.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </AccordionSection>
          </div>
        ) : null}

        {!searching && tab === "media" ? (
          <AccordionSection
            title="Media"
            icon={<Images className="h-3 w-3" />}
            meta={
              mediaCount ? (
                <span className="studio-agent-sidebar-acc-count">{mediaCount}</span>
              ) : null
            }
          >
            {!insight?.media?.length ? (
              <p className="studio-settings-empty">
                No generated media in this chat yet.
              </p>
            ) : (
              <ul className="studio-agent-media-grid">
                {insight.media.map((item) => {
                  const thumb = thumbById.get(item.assetId);
                  const sourceLabel = /attach|upload/i.test(item.toolName || "")
                    ? "Attachment"
                    : "Generation";
                  return (
                    <li key={item.assetId} className="studio-agent-media-tile">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="studio-agent-media-tile-img" />
                      ) : (
                        <span className="studio-agent-media-tile-img is-empty" />
                      )}
                      <div className="studio-agent-media-tile-overlay">
                        <strong>{item.name || item.kind}</strong>
                        <span>{sourceLabel}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </AccordionSection>
        ) : null}
      </div>
    </aside>
  );
}
