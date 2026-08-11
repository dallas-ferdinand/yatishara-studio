"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import {
  Check,
  CircleHelp,
  Images,
  ListTodo,
  Loader2,
  MessageSquare,
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
};

type TabId = "info" | "media";

function Section({
  title,
  icon,
  extras,
  children,
}: {
  title: string;
  icon?: ReactNode;
  extras?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="cursor-settings-section studio-agent-sidebar-card">
      <header className="studio-agent-sidebar-card-head">
        <div className="studio-settings-card-title">
          {icon ? (
            <span className="studio-dm-peer-section-icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          {title}
        </div>
        {extras ? (
          <div className="studio-agent-sidebar-card-extras">{extras}</div>
        ) : null}
      </header>
      <div className="studio-agent-sidebar-card-body">{children}</div>
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
    for (const item of insight?.media ?? []) {
      const id = String(item.assetId || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id as Id<"assets">);
    }
    return ids.slice(0, 40);
  }, [insight?.media]);
  const mediaAssets = useQuery(
    api.assets.listByIds,
    open && !searching && tab === "media" && mediaIds.length
      ? { assetIds: mediaIds, quality: "thumb" as const }
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
            placeholder="Search"
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
          <Section title="Search" icon={<Search className="h-3 w-3" />}>
            {!insight?.searchHits?.length ? (
              <p className="studio-settings-empty">No matches.</p>
            ) : (
              <ul className="studio-agent-search-hits">
                {insight.searchHits.map((hit) => (
                  <li key={String(hit._id)}>
                    <span className="studio-agent-search-role">{hit.role}</span>
                    <p>{hit.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}

        {!searching && tab === "info" ? (
          <div className="studio-agent-sidebar-stack">
            <section
              className="cursor-settings-section studio-agent-sidebar-card"
              aria-label="Chat summary"
            >
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
                  <strong>{insight?.turnCount ?? 0}</strong>
                  <span>Turns</span>
                </div>
                <div className="studio-agent-sidebar-stat">
                  <Images aria-hidden="true" />
                  <strong>{insight?.media?.length ?? 0}</strong>
                  <span>Media</span>
                </div>
              </div>
            </section>

            <Section title="To-do" icon={<ListTodo className="h-3 w-3" />}>
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
            </Section>

            <Section title="Recent turns" icon={<MessageSquare className="h-3 w-3" />}>
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
            </Section>
          </div>
        ) : null}

        {!searching && tab === "media" ? (
          <Section title="Media" icon={<Images className="h-3 w-3" />}>
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
          </Section>
        ) : null}
      </div>
    </aside>
  );
}
