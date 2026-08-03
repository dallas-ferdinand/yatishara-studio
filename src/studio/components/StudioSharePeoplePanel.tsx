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
import { createPortal } from "react-dom";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PanelSearchBar } from "@/desk/components/PanelSearchBar";
import { useHorizontalScrollFade } from "@/desk/lib/use-horizontal-scroll-fade";
import { useHorizontalWheelScroll } from "@/desk/lib/use-horizontal-wheel-scroll";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
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

function ShareConfirmMenu({
  delivery,
  setDelivery,
  permission,
  setPermission,
  allowFileDelivery,
  busy,
  onConfirm,
  onDismiss,
  asSheet,
}: {
  delivery: "access" | "file";
  setDelivery: (v: "access" | "file") => void;
  permission: "view" | "edit";
  setPermission: (v: "view" | "edit") => void;
  allowFileDelivery: boolean;
  busy: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
  asSheet: boolean;
}) {
  return (
    <div
      className={`studio-share-confirm-menu${asSheet ? " is-sheet" : " is-dropdown"}`}
      role="dialog"
      aria-label="Choose share type"
    >
      {asSheet ? (
        <div className="studio-share-confirm-sheet-grab" aria-hidden="true" />
      ) : null}
      <p className="studio-share-confirm-title">Share as</p>
      <div className="studio-share-confirm-modes" role="group" aria-label="Share type">
        <button
          type="button"
          className={`studio-share-confirm-mode${delivery === "access" ? " is-active" : ""}`}
          onClick={() => setDelivery("access")}
          disabled={busy}
        >
          Access
        </button>
        {allowFileDelivery ? (
          <button
            type="button"
            className={`studio-share-confirm-mode${delivery === "file" ? " is-active" : ""}`}
            onClick={() => setDelivery("file")}
            disabled={busy}
          >
            File
          </button>
        ) : null}
      </div>
      {delivery === "access" ? (
        <>
          <div className="studio-share-confirm-modes" role="group" aria-label="Permission">
            <button
              type="button"
              className={`studio-share-confirm-mode${permission === "view" ? " is-active" : ""}`}
              onClick={() => setPermission("view")}
              disabled={busy}
            >
              View
            </button>
            <button
              type="button"
              className={`studio-share-confirm-mode${permission === "edit" ? " is-active" : ""}`}
              onClick={() => setPermission("edit")}
              disabled={busy}
            >
              Edit
            </button>
          </div>
          <p className="studio-share-confirm-hint">
            {permission === "edit"
              ? "Can edit live originals — not delete"
              : "Read, download, copy"}
          </p>
        </>
      ) : (
        <p className="studio-share-confirm-hint">
          Sends a copy into their Messages folder
        </p>
      )}
      <div className="studio-share-confirm-actions">
        <button
          type="button"
          className="studio-share-confirm-dismiss"
          onClick={onDismiss}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className="studio-share-confirm-submit"
          onClick={onConfirm}
          disabled={busy}
        >
          Confirm
        </button>
      </div>
    </div>
  );
}

/**
 * Files-rail people picker for Share — DM search/labels chrome with multi-select
 * and a compact header + confirm dropdown/sheet for Access/File.
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
  const isMobile = useMobileLayout();
  const [search, setSearch] = useState("");
  const [searchNow] = useState(() => Date.now());
  const deferredSearch = useDeferredValue(search.trim().replace(/^@+/, ""));
  const searching = deferredSearch.length >= 1;
  const [activeLabelId, setActiveLabelId] = useState<LabelId | null>(null);
  const [delivery, setDelivery] = useState<"access" | "file">("access");
  const [permission, setPermission] = useState<"view" | "edit">("view");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const shareBtnRef = useRef<HTMLButtonElement | null>(null);
  const confirmMenuRef = useRef<HTMLDivElement | null>(null);
  const [confirmPos, setConfirmPos] = useState({ top: 0, left: 0 });
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

  useEffect(() => {
    if (!confirmOpen || isMobile) return;
    const btn = shareBtnRef.current;
    if (!btn) return;
    const place = () => {
      const rect = btn.getBoundingClientRect();
      const width = 240;
      const left = Math.min(
        Math.max(8, rect.right - width),
        window.innerWidth - width - 8,
      );
      setConfirmPos({ top: rect.bottom + 4, left });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [confirmOpen, isMobile]);

  useEffect(() => {
    if (!confirmOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (isMobile) return;
      const t = e.target as Node;
      if (shareBtnRef.current?.contains(t)) return;
      if (confirmMenuRef.current?.contains(t)) return;
      setConfirmOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [confirmOpen, isMobile]);

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

  function runConfirm() {
    onShare({
      delivery: allowFileDelivery ? delivery : "access",
      permission: delivery === "file" ? "view" : permission,
    });
    setConfirmOpen(false);
  }

  const confirmOverlay = confirmOpen
    ? isMobile
      ? createPortal(
          <>
            <button
              type="button"
              className="studio-share-confirm-backdrop"
              aria-label="Dismiss"
              onClick={() => setConfirmOpen(false)}
            />
            <ShareConfirmMenu
              delivery={delivery}
              setDelivery={setDelivery}
              permission={permission}
              setPermission={setPermission}
              allowFileDelivery={allowFileDelivery}
              busy={busy}
              onConfirm={runConfirm}
              onDismiss={() => setConfirmOpen(false)}
              asSheet
            />
          </>,
          document.querySelector(".studio-polish") ?? document.body,
        )
      : createPortal(
          <div
            ref={confirmMenuRef}
            className="studio-share-confirm-dropdown-anchor"
            style={{ top: confirmPos.top, left: confirmPos.left }}
          >
            <ShareConfirmMenu
              delivery={delivery}
              setDelivery={setDelivery}
              permission={permission}
              setPermission={setPermission}
              allowFileDelivery={allowFileDelivery}
              busy={busy}
              onConfirm={runConfirm}
              onDismiss={() => setConfirmOpen(false)}
              asSheet={false}
            />
          </div>,
          document.body,
        )
    : null;

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
          <strong>
            {selectedPeers.length
              ? `${selectedPeers.length} selected`
              : "Select people"}
          </strong>
          <span>Share {itemLabel}</span>
        </div>
        <div className="studio-share-people-top-actions">
          <button
            type="button"
            className="studio-share-people-icon-btn is-close"
            onClick={onCancel}
            disabled={busy}
            title="Close"
            aria-label="Close"
          >
            <X aria-hidden="true" />
          </button>
          <button
            ref={shareBtnRef}
            type="button"
            className="studio-share-people-icon-btn is-share"
            onClick={() => {
              if (busy || selectedPeers.length === 0) return;
              setConfirmOpen((open) => !open);
            }}
            disabled={busy || selectedPeers.length === 0}
            title="Share"
            aria-label="Share"
            aria-expanded={confirmOpen}
            aria-haspopup="dialog"
          >
            <Share2 aria-hidden="true" />
            <span>Share</span>
          </button>
        </div>
      </div>

      {confirmOverlay}

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
                      className={`studio-dm-row studio-share-people-bubble${selected ? " is-active" : ""}`}
                      onClick={() => toggleFromPerson(person)}
                      aria-pressed={selected}
                    >
                      <span className="studio-dm-row-main">
                        <span className="studio-dm-row-avatar-wrap">
                          <StudioProfileAvatar
                            size="sm"
                            src={person.avatarUrl}
                            displayName={person.displayName}
                            name={person.username}
                            alt=""
                          />
                        </span>
                        <span className="studio-dm-row-copy">
                          <strong>
                            <span className="studio-dm-name-text">
                              {person.displayName?.trim() || person.username}
                            </span>
                            <StudioDmProviderTag tag={person.sellerTag} />
                          </strong>
                          <span>@{person.username}</span>
                        </span>
                        {selected ? (
                          <span className="studio-share-people-bubble-check" aria-hidden="true">
                            <Check />
                          </span>
                        ) : null}
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
                      className={`studio-dm-row studio-share-people-bubble${selected ? " is-active" : ""}`}
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
                      <span className="studio-dm-row-main">
                        <span className="studio-dm-row-avatar-wrap">
                          <StudioProfileAvatar
                            size="sm"
                            src={chat.peer.avatarUrl}
                            displayName={chat.peer.displayName}
                            name={chat.peer.username}
                            alt=""
                          />
                        </span>
                        <span className="studio-dm-row-copy">
                          <strong>
                            <span className="studio-dm-name-text">
                              {chat.peer.displayName?.trim() || chat.peer.username}
                            </span>
                          </strong>
                          <span>@{chat.peer.username}</span>
                        </span>
                        {selected ? (
                          <span className="studio-share-people-bubble-check" aria-hidden="true">
                            <Check />
                          </span>
                        ) : null}
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
          <ul className="studio-dm-conversations studio-share-people-chat-list">
            {conversations.map((row) => {
              const selected = selectedIds.has(row.peer.userId);
              return (
                <li key={row.conversationId}>
                  <button
                    type="button"
                    className={`studio-dm-row studio-share-people-bubble${selected ? " is-active" : ""}`}
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
                    <span className="studio-dm-row-main">
                      <span className="studio-dm-row-avatar-wrap">
                        <StudioProfileAvatar
                          size="sm"
                          src={row.peer.avatarUrl}
                          displayName={row.peer.displayName}
                          name={row.peer.username}
                          alt=""
                        />
                      </span>
                      <span className="studio-dm-row-copy">
                        <strong>
                          {row.peer.displayName?.trim() || row.peer.username}
                        </strong>
                        <span>@{row.peer.username}</span>
                      </span>
                      {selected ? (
                        <span className="studio-share-people-bubble-check" aria-hidden="true">
                          <Check />
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
