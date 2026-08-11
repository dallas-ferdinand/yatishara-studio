"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Check, CircleHelp, Loader2, Search, X } from "lucide-react";
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

type TabId = "info" | "media" | "search";

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
  const insight = useQuery(
    api.agentThreads.threadInsight,
    open ? { threadId, search: search.trim() || undefined } : "skip",
  );

  const board = useMemo(
    () => parseBoard(insight?.todosJson),
    [insight?.todosJson],
  );

  const mediaIds = useMemo(
    () => (insight?.media ?? []).map((m) => m.assetId as Id<"assets">).filter(Boolean),
    [insight?.media],
  );
  const mediaAssets = useQuery(
    api.assets.listByIds,
    open && mediaIds.length ? { assetIds: mediaIds, quality: "thumb" as const } : "skip",
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
    { id: "search", label: "Search" },
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

      <nav className="studio-admin-head-tabs" aria-label="Chat panels">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`studio-admin-head-tab${tab === t.id ? " is-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="studio-agent-chat-sidebar-body">
        {tab === "info" ? (
          <div className="studio-agent-sidebar-section">
            <p className="studio-agent-sidebar-kicker">Summary</p>
            <div className="studio-agent-cost-grid">
              <div>
                <strong>
                  {formatTtdFromCredits(insight?.creditsSpent ?? 0, price)}
                </strong>
                <span>Spent</span>
              </div>
              <div>
                <strong>{insight?.turnCount ?? 0}</strong>
                <span>Turns</span>
              </div>
              <div>
                <strong>{insight?.media?.length ?? 0}</strong>
                <span>Media</span>
              </div>
            </div>

            <p className="studio-agent-sidebar-kicker">To-do lists</p>
            {!board.lists.length ? (
              <p className="studio-agent-sidebar-empty">
                No to-do lists yet. Multi-step work will show up here.
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
                            <CircleHelp size={11} aria-hidden="true" />
                            {total}
                          </span>
                          <span className="studio-agent-todo-badge" title="Completed">
                            <Check size={11} aria-hidden="true" />
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
                            <span className="studio-agent-todo-mark" aria-hidden="true">
                              {step.status === "done"
                                ? "✓"
                                : step.status === "doing" && working
                                  ? "…"
                                  : "○"}
                            </span>
                            <span>{step.text}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  );
                })}
              </div>
            )}

            <p className="studio-agent-sidebar-kicker">Recent turns</p>
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
          </div>
        ) : null}

        {tab === "media" ? (
          <div className="studio-agent-sidebar-section">
            {!insight?.media?.length ? (
              <p className="studio-agent-sidebar-empty">
                No generated media in this chat yet.
              </p>
            ) : (
              <ul className="studio-agent-media-list">
                {insight.media.map((item) => {
                  const thumb = thumbById.get(item.assetId);
                  return (
                    <li key={item.assetId}>
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="studio-agent-media-thumb" />
                      ) : (
                        <span className="studio-agent-media-thumb is-empty" />
                      )}
                      <div>
                        <strong>{item.name || item.kind}</strong>
                        <span>
                          {item.kind}
                          {item.toolName
                            ? ` · ${item.toolName.replace(/^studio_/, "")}`
                            : ""}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        {tab === "search" ? (
          <div className="studio-agent-sidebar-section">
            <label className="studio-agent-search-field">
              <Search size={13} aria-hidden="true" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search this chat"
              />
            </label>
            {!search.trim() ? (
              <p className="studio-agent-sidebar-empty">Type to search messages.</p>
            ) : !insight?.searchHits?.length ? (
              <p className="studio-agent-sidebar-empty">No matches.</p>
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
          </div>
        ) : null}
      </div>
    </aside>
  );
}
