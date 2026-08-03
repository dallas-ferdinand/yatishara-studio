"use client";

import { useQuery } from "convex/react";
import {
  Check,
  MessageCircle,
  SearchX,
  Share2,
  Tags,
  Users,
  X,
} from "lucide-react";
import {
  createElement,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PanelSearchBar } from "@/desk/components/PanelSearchBar";
import { useHorizontalScrollFade } from "@/desk/lib/use-horizontal-scroll-fade";
import { useHorizontalWheelScroll } from "@/desk/lib/use-horizontal-wheel-scroll";
import { dmLabelIcon } from "@/studio/lib/dmLabelIcons";
import { StudioDmProviderTag } from "./StudioDmProviderTag";
import { StudioProfileAvatar } from "./StudioProfileAvatar";
import "./studio-messages.css";
import "./studio-share-people.css";

export type SharePeoplePeer = {
  userId: Id<"users">;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  sellerTag?: "freelancer" | "business" | null;
};

type StudioSharePeoplePanelProps = {
  itemLabel: string;
  selectedPeers: SharePeoplePeer[];
  onTogglePeer: (peer: SharePeoplePeer) => void;
  onShare: (opts: {
    delivery: "access" | "file";
    permission: "view" | "edit";
  }) => void;
  onCancel: () => void;
  busy?: boolean;
  expiresUnix: number;
  /** When false, hide File delivery (e.g. folders-only selection). */
  allowFileDelivery?: boolean;
};

type LabelId = Id<"dmLabels">;

function SearchResultSection({
  title,
  count,
  icon,
  children,
}: {
  title: string;
  count: number;
  icon: ReactNode;
  children: ReactNode;
}) {
  if (count <= 0) return null;
  return (
    <section className="studio-dm-search-section">
      <header className="studio-dm-search-section-head">
        {icon}
        <strong>{title}</strong>
        <span>{count}</span>
      </header>
      <div className="studio-dm-search-section-body">{children}</div>
    </section>
  );
}

function LabelChip({
  label,
  active,
  onSelect,
}: {
  label: { labelId: LabelId; name: string; icon: string };
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = dmLabelIcon(label.icon);
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`studio-dm-label-chip${active ? " is-active" : ""}`}
      onClick={onSelect}
    >
      {createElement(Icon, { "aria-hidden": true })}
      <span>{label.name}</span>
    </button>
  );
}

/**
 * Files-rail people picker for Share — DM search/labels chrome with multi-select
 * and a top Share CTA (select-mode style).
 */
export function StudioSharePeoplePanel({
  itemLabel,
  selectedPeers,
  onTogglePeer,
  onShare,
  onCancel,
  busy = false,
  expiresUnix,
  allowFileDelivery = true,
}: StudioSharePeoplePanelProps) {
  const [search, setSearch] = useState("");
  const [searchNow] = useState(() => Date.now());
  const deferredSearch = useDeferredValue(search.trim().replace(/^@+/, ""));
  const searching = deferredSearch.length >= 1;
  const [activeLabelId, setActiveLabelId] = useState<LabelId | null>(null);
  const [delivery, setDelivery] = useState<"access" | "file">("access");
  const [permission, setPermission] = useState<"view" | "edit">("view");
  const labelRailRef = useRef<HTMLDivElement | null>(null);
  useHorizontalWheelScroll(labelRailRef);
  useHorizontalScrollFade(labelRailRef);

  const labels = useQuery(api.dmLabels.listMine, {});
  const conversations = useQuery(api.dms.listMyConversations, {
    expiresUnix,
    labelId: activeLabelId ?? undefined,
  });
  const searchResults = useQuery(
    api.dms.searchSidebar,
    searching
      ? {
          query: deferredSearch,
          expiresUnix,
          now: searchNow,
        }
      : "skip",
  );

  const selectedIds = useMemo(
    () => new Set(selectedPeers.map((peer) => peer.userId)),
    [selectedPeers],
  );

  useEffect(() => {
    if (!activeLabelId || labels === undefined) return;
    if (!labels.some((label) => label.labelId === activeLabelId)) {
      setActiveLabelId(null);
    }
  }, [activeLabelId, labels]);

  function toggleFromPerson(person: {
    userId: Id<"users">;
    username: string;
    displayName?: string;
    avatarUrl?: string;
    sellerTag?: "freelancer" | "business" | null;
  }) {
    onTogglePeer({
      userId: person.userId,
      username: person.username,
      displayName: person.displayName,
      avatarUrl: person.avatarUrl,
      sellerTag: person.sellerTag ?? null,
    });
  }

  return (
    <div className="studio-share-people-panel">
      <div className="studio-dm-sidebar-chrome studio-share-people-chrome">
        <PanelSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search people, chats & labels"
          aria-label="Search people, chats, and labels"
        />
        <div className="studio-dm-rail-row">
          <div
            ref={labelRailRef}
            className="studio-dm-label-rail"
            role="tablist"
            aria-label="Labels"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeLabelId === null}
              className={`studio-dm-label-chip${activeLabelId === null ? " is-active" : ""}`}
              onClick={() => setActiveLabelId(null)}
            >
              <Tags aria-hidden="true" />
              <span>All</span>
            </button>
            {(labels ?? []).map((label) => (
              <LabelChip
                key={label.labelId}
                label={label}
                active={activeLabelId === label.labelId}
                onSelect={() =>
                  setActiveLabelId(
                    activeLabelId === label.labelId ? null : label.labelId,
                  )
                }
              />
            ))}
          </div>
        </div>
      </div>

      <div className="studio-share-people-top" role="status">
        <div className="studio-share-people-top-copy">
          <strong>{selectedPeers.length ? `${selectedPeers.length} selected` : "Select people"}</strong>
          <span>Share {itemLabel}</span>
        </div>
        <div className="studio-share-people-top-actions">
          <button
            type="button"
            className="studio-share-people-cancel"
            onClick={onCancel}
            disabled={busy}
          >
            <X aria-hidden="true" />
            Cancel
          </button>
          <button
            type="button"
            className="studio-share-people-confirm"
            onClick={() =>
              onShare({
                delivery: allowFileDelivery ? delivery : "access",
                permission: delivery === "file" ? "view" : permission,
              })
            }
            disabled={busy || selectedPeers.length === 0}
          >
            <Share2 aria-hidden="true" />
            Share
          </button>
        </div>
      </div>

      <div className="studio-share-people-modes" role="group" aria-label="Share type">
        <button
          type="button"
          className={`studio-share-people-mode${delivery === "access" ? " is-active" : ""}`}
          onClick={() => setDelivery("access")}
          disabled={busy}
        >
          Access
        </button>
        {allowFileDelivery ? (
          <button
            type="button"
            className={`studio-share-people-mode${delivery === "file" ? " is-active" : ""}`}
            onClick={() => setDelivery("file")}
            disabled={busy}
          >
            File
          </button>
        ) : null}
      </div>
      {delivery === "access" ? (
        <div className="studio-share-people-modes is-secondary" role="group" aria-label="Permission">
          <button
            type="button"
            className={`studio-share-people-mode${permission === "view" ? " is-active" : ""}`}
            onClick={() => setPermission("view")}
            disabled={busy}
          >
            View
          </button>
          <button
            type="button"
            className={`studio-share-people-mode${permission === "edit" ? " is-active" : ""}`}
            onClick={() => setPermission("edit")}
            disabled={busy}
          >
            Edit
          </button>
          <span className="studio-share-people-mode-hint">
            {permission === "edit"
              ? "Can edit live originals — not delete"
              : "Read, download, copy"}
          </span>
        </div>
      ) : (
        <p className="studio-share-people-mode-hint studio-share-people-mode-hint-block">
          Sends a copy into their Messages folder
        </p>
      )}

      {selectedPeers.length > 0 ? (
        <div className="studio-share-people-selected" aria-label="Selected people">
          {selectedPeers.map((peer) => (
            <button
              key={peer.userId}
              type="button"
              className="studio-share-people-chip"
              onClick={() => onTogglePeer(peer)}
              title={`Remove ${peer.displayName || peer.username}`}
            >
              <StudioProfileAvatar
                size="sm"
                src={peer.avatarUrl}
                displayName={peer.displayName}
                name={peer.username}
                alt=""
              />
              <span>@{peer.username}</span>
              <X aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="studio-dm-sidebar-body studio-share-people-body">
        {searching ? (
          searchResults === undefined ? (
            <div className="studio-dm-scroll-pending" aria-hidden="true" />
          ) : searchResults.people.length === 0 &&
            searchResults.chats.length === 0 &&
            searchResults.labels.length === 0 ? (
            <div className="studio-dm-search-empty">
              <SearchX aria-hidden="true" />
              <strong>No results</strong>
              <span>Try a person or label.</span>
            </div>
          ) : (
            <div className="studio-dm-search-results">
              <SearchResultSection
                title="People & friends"
                count={searchResults.people.length}
                icon={<Users aria-hidden="true" />}
              >
                {searchResults.people.map((person) => {
                  const selected = selectedIds.has(person.userId);
                  return (
                    <button
                      key={person.profileId}
                      type="button"
                      className={`studio-dm-search-result studio-share-people-row${selected ? " is-selected" : ""}`}
                      onClick={() => toggleFromPerson(person)}
                      aria-pressed={selected}
                    >
                      <span className="studio-share-people-check" aria-hidden="true">
                        {selected ? <Check /> : null}
                      </span>
                      <StudioProfileAvatar
                        size="sm"
                        src={person.avatarUrl}
                        displayName={person.displayName}
                        name={person.username}
                        alt=""
                      />
                      <span className="studio-dm-search-result-copy">
                        <strong>
                          <span className="studio-dm-name-text">
                            {person.displayName?.trim() || person.username}
                          </span>
                          <StudioDmProviderTag tag={person.sellerTag} />
                        </strong>
                        <span>@{person.username}</span>
                      </span>
                    </button>
                  );
                })}
              </SearchResultSection>

              <SearchResultSection
                title="Chats"
                count={searchResults.chats.length}
                icon={<MessageCircle aria-hidden="true" />}
              >
                {searchResults.chats.map((chat) => {
                  const selected = selectedIds.has(chat.peer.userId);
                  return (
                    <button
                      key={chat.conversationId}
                      type="button"
                      className={`studio-dm-search-result is-chat studio-share-people-row${selected ? " is-selected" : ""}`}
                      onClick={() =>
                        toggleFromPerson({
                          userId: chat.peer.userId,
                          username: chat.peer.username,
                          displayName: chat.peer.displayName,
                          avatarUrl: chat.peer.avatarUrl,
                          sellerTag: chat.peer.sellerTag,
                        })
                      }
                      aria-pressed={selected}
                    >
                      <span className="studio-share-people-check" aria-hidden="true">
                        {selected ? <Check /> : null}
                      </span>
                      <StudioProfileAvatar
                        size="sm"
                        src={chat.peer.avatarUrl}
                        displayName={chat.peer.displayName}
                        name={chat.peer.username}
                        alt=""
                      />
                      <span className="studio-dm-search-result-copy">
                        <strong>
                          <span className="studio-dm-name-text">
                            {chat.peer.displayName?.trim() || chat.peer.username}
                          </span>
                        </strong>
                        <span>@{chat.peer.username}</span>
                      </span>
                    </button>
                  );
                })}
              </SearchResultSection>

              <SearchResultSection
                title="Labels"
                count={searchResults.labels.length}
                icon={<Tags aria-hidden="true" />}
              >
                {searchResults.labels.map((label) => (
                  <button
                    key={label.labelId}
                    type="button"
                    className="studio-dm-search-result"
                    onClick={() => {
                      setSearch("");
                      setActiveLabelId(label.labelId);
                    }}
                  >
                    {createElement(dmLabelIcon(label.icon), {
                      "aria-hidden": true,
                    })}
                    <span className="studio-dm-search-result-copy">
                      <strong>{label.name}</strong>
                      <span>Open label</span>
                    </span>
                  </button>
                ))}
              </SearchResultSection>
            </div>
          )
        ) : conversations === undefined ? (
          <div className="studio-dm-scroll-pending" aria-hidden="true" />
        ) : (conversations?.length ?? 0) === 0 ? (
          <div className="studio-dm-search-empty">
            <Users aria-hidden="true" />
            <strong>No chats yet</strong>
            <span>Search for someone by username to share.</span>
          </div>
        ) : (
          <div className="studio-dm-chat-list" role="list">
            {conversations.map((row) => {
              const selected = selectedIds.has(row.peer.userId);
              return (
                <button
                  key={row.conversationId}
                  type="button"
                  role="listitem"
                  className={`studio-dm-conversation-row studio-share-people-row${selected ? " is-selected" : ""}`}
                  onClick={() =>
                    toggleFromPerson({
                      userId: row.peer.userId,
                      username: row.peer.username,
                      displayName: row.peer.displayName,
                      avatarUrl: row.peer.avatarUrl ?? undefined,
                      sellerTag: row.peer.sellerTag,
                    })
                  }
                  aria-pressed={selected}
                >
                  <span className="studio-share-people-check" aria-hidden="true">
                    {selected ? <Check /> : null}
                  </span>
                  <StudioProfileAvatar
                    size="sm"
                    src={row.peer.avatarUrl}
                    displayName={row.peer.displayName}
                    name={row.peer.username}
                    alt=""
                  />
                  <span className="studio-dm-conversation-copy">
                    <strong>
                      {row.peer.displayName?.trim() || row.peer.username}
                    </strong>
                    <span>@{row.peer.username}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
