"use client";

import { useMutation, useQuery, useQueries } from "convex/react";
import {
  MessageCircle,
  MessagesSquare,
  Pencil,
  Plus,
  SearchX,
  Tags,
  Trash2,
  Users,
} from "lucide-react";
import {
  createElement,
  Fragment,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
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
import { useLongPress } from "@/desk/hooks/use-long-press";
import type { StudioFeedSharePayload } from "@/studio/lib/studioFeedShare";
import {
  feedShareDragTypes,
  readFeedShareDataTransfer,
  setPendingDmFeedShare,
} from "@/studio/lib/studioFeedShare";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { dmLabelIcon } from "@/studio/lib/dmLabelIcons";
import {
  StudioDmAssignLabelsDialog,
  StudioDmLabelEditorDialog,
} from "./StudioDmLabelDialogs";
import {
  StudioDmContextMenu,
  type StudioDmContextMenuItem,
} from "./StudioDmContextMenu";
import {
  StudioDmChatFilter,
  type StudioDmChatFilterId,
} from "./StudioDmChatFilter";
import { StudioDmProviderTag } from "./StudioDmProviderTag";
import { StudioProfileAvatar } from "./StudioProfileAvatar";
import {
  StudioDmConversationRow,
  type DmConversationId,
} from "./StudioMessagesPane";
import {
  bindDmCacheOwner,
  dmLiveOrCached,
  readDmConversations,
  rememberDmConversations,
  rememberDmMessages,
} from "@/studio/lib/dmClientCache";
import "./studio-messages.css";

type LabelId = Id<"dmLabels">;

type StudioMessagesSidebarProps = {
  activeConversationId: DmConversationId | null;
  onSelectConversation: (conversationId: DmConversationId) => void;
  onStartChat: (username: string) => void;
  /** Open the full Messages workspace tab (left-rail list chrome). */
  onOpenFullMessages?: () => void;
  expiresUnix: number;
};

type ContextTarget =
  | {
      kind: "label";
      x: number;
      y: number;
      labelId: LabelId;
      name: string;
      icon: string;
    }
  | {
      kind: "chat";
      x: number;
      y: number;
      userId: Id<"users">;
      label: string;
      avatarUrl?: string | null;
    };

/** Chat-list rail — replaces the file manager while a Messages tab is active. */
export function StudioMessagesSidebar({
  activeConversationId,
  onSelectConversation,
  onStartChat,
  onOpenFullMessages,
  expiresUnix,
}: StudioMessagesSidebarProps) {
  const [search, setSearch] = useState("");
  const [searchNow] = useState(() => Date.now());
  const deferredSearch = useDeferredValue(search.trim().replace(/^@+/, ""));
  const searching = deferredSearch.length >= 1;
  const [activeLabelId, setActiveLabelId] = useState<LabelId | null>(null);
  const [chatFilter, setChatFilter] = useState<StudioDmChatFilterId>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<{
    labelId: LabelId;
    name: string;
    icon: string;
  } | null>(null);
  const [assignPeer, setAssignPeer] = useState<{
    userId: Id<"users">;
    label: string;
    avatarUrl?: string | null;
  } | null>(null);
  const [context, setContext] = useState<ContextTarget | null>(null);

  const labelRailRef = useRef<HTMLDivElement | null>(null);
  useHorizontalWheelScroll(labelRailRef);
  useHorizontalScrollFade(labelRailRef);

  const me = useQuery(api.users.current, {});
  const cacheReady = Boolean(me?.userId);
  useLayoutEffect(() => {
    bindDmCacheOwner(me?.userId ?? null);
  }, [me?.userId]);
  const [signedExpiresUnix, setSignedExpiresUnix] = useState(expiresUnix);
  useEffect(() => {
    setSignedExpiresUnix(expiresUnix);
  }, [expiresUnix]);
  useEffect(() => {
    const id = window.setInterval(() => {
      setSignedExpiresUnix(Math.floor(Date.now() / 1000) + 60 * 60 * 12);
    }, 45 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);
  const labels = useQuery(api.dmLabels.listMine, {});
  const removeLabel = useMutation(api.dmLabels.remove);
  const ackDelivered = useMutation(api.dms.ackDelivered);
  const conversationsLive = useQuery(api.dms.listMyConversations, {
    expiresUnix: signedExpiresUnix,
    labelId: activeLabelId ?? undefined,
  });
  useEffect(() => {
    if (!cacheReady) return;
    rememberDmConversations(conversationsLive, activeLabelId);
  }, [activeLabelId, cacheReady, conversationsLive]);
  const { data: conversations, pending: conversationsPending } = dmLiveOrCached(
    conversationsLive,
    cacheReady ? readDmConversations(activeLabelId) : null,
  );

  // Warm recent threads so opening a chat paints instantly (Convex + client cache).
  const warmMessageQueries = useMemo(() => {
    if (!conversations?.length) return {};
    const queries: Record<
      string,
      {
        query: typeof api.dms.listMessages;
        args: { conversationId: DmConversationId; expiresUnix: number };
      }
    > = {};
    for (const row of conversations.slice(0, 8)) {
      queries[`dm:${row.conversationId}`] = {
        query: api.dms.listMessages,
        args: { conversationId: row.conversationId, expiresUnix: signedExpiresUnix },
      };
    }
    return queries;
  }, [conversations, signedExpiresUnix]);
  const warmMessageResults = useQueries(warmMessageQueries);
  useEffect(() => {
    if (!cacheReady) return;
    for (const [key, result] of Object.entries(warmMessageResults)) {
      if (result === undefined || result instanceof Error) continue;
      const conversationId = key.slice("dm:".length) as DmConversationId;
      rememberDmMessages(conversationId, result);
    }
  }, [cacheReady, warmMessageResults]);

  const searchResults = useQuery(
    api.dms.searchSidebar,
    searching
      ? {
          query: deferredSearch,
          expiresUnix: signedExpiresUnix,
          now: searchNow,
        }
      : "skip",
  );

  const handleFeedShareDrop = useCallback(
    (conversationId: DmConversationId, payload: StudioFeedSharePayload) => {
      // Attach like a photo draft — user can type a note, then send.
      setPendingDmFeedShare({ conversationId, payload });
      onSelectConversation(conversationId);
    },
    [onSelectConversation],
  );

  // Drop the filter if the active label was deleted.
  useEffect(() => {
    if (!activeLabelId || labels === undefined) return;
    if (!labels.some((label) => label.labelId === activeLabelId)) {
      setActiveLabelId(null);
    }
  }, [activeLabelId, labels]);

  // Delivery ACK while the chat list is open (inbound last message).
  // Only against live Convex rows — never session-cache leftovers.
  useEffect(() => {
    if (conversationsPending || !conversations?.length) return;
    for (const row of conversations) {
      if (row.lastMessageFromMe) continue;
      void ackDelivered({
        conversationId: row.conversationId,
        upToCreatedAt: row.lastMessageAt,
      });
    }
  }, [ackDelivered, conversations, conversationsPending]);

  const filteredConversations = useMemo(() => {
    if (!conversations) return conversations;
    switch (chatFilter) {
      case "unread":
        return conversations.filter((row) => row.unread);
      case "read":
        return conversations.filter((row) => !row.unread);
      case "online":
        return conversations.filter((row) => row.peerOnline);
      case "awaiting":
        return conversations.filter(
          (row) => row.lastMessageFromMe && row.lastMessageReceipt !== "read",
        );
      default:
        return conversations;
    }
  }, [conversations, chatFilter]);

  const openLabelMenu = useCallback(
    (
      coords: { x: number; y: number },
      label: { labelId: LabelId; name: string; icon: string },
    ) => {
      setContext({
        kind: "label",
        x: coords.x,
        y: coords.y,
        labelId: label.labelId,
        name: label.name,
        icon: label.icon,
      });
    },
    [],
  );

  const openChatMenu = useCallback(
    (
      coords: { x: number; y: number },
      peer: {
        userId: Id<"users">;
        label: string;
        avatarUrl?: string | null;
      },
    ) => {
      setContext({
        kind: "chat",
        x: coords.x,
        y: coords.y,
        userId: peer.userId,
        label: peer.label,
        avatarUrl: peer.avatarUrl,
      });
    },
    [],
  );

  const contextItems: StudioDmContextMenuItem[] = context
    ? context.kind === "label"
      ? [
          {
            key: "edit",
            label: "Edit",
            icon: <Pencil aria-hidden="true" />,
            onSelect: () => {
              setAssignPeer(null);
              setEditingLabel({
                labelId: context.labelId,
                name: context.name,
                icon: context.icon,
              });
              setEditorOpen(true);
            },
          },
          {
            key: "delete",
            label: "Delete",
            icon: <Trash2 aria-hidden="true" />,
            danger: true,
            onSelect: () => {
              if (
                !window.confirm(
                  `Delete “${context.name}”? People stay in your chats.`,
                )
              ) {
                return;
              }
              void removeLabel({ labelId: context.labelId }).catch((error) => {
                window.alert(
                  friendlyConvexError(error, "Could not delete label"),
                );
              });
            },
          },
        ]
      : [
          {
            key: "labels",
            label: "Labels",
            icon: <Tags aria-hidden="true" />,
            onSelect: () => {
              setEditorOpen(false);
              setEditingLabel(null);
              setAssignPeer({
                userId: context.userId,
                label: context.label,
                avatarUrl: context.avatarUrl,
              });
            },
          },
        ]
    : [];

  return (
    <div className="studio-dm-sidebar">
      <div className="studio-dm-sidebar-chrome">
        <PanelSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search people, chats & messages"
          aria-label="Search people, chats, messages, and labels"
          end={
            onOpenFullMessages ? (
              <button
                type="button"
                className="studio-composer-circle-btn studio-dm-open-full"
                aria-label="Open Messages"
                title="Open Messages"
                onClick={onOpenFullMessages}
              >
                <MessagesSquare size={13} strokeWidth={2.25} aria-hidden="true" />
              </button>
            ) : null
          }
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
                onMenu={openLabelMenu}
              />
            ))}
            <button
              type="button"
              className="studio-dm-label-chip is-add"
              onClick={() => {
                setAssignPeer(null);
                setEditingLabel(null);
                setEditorOpen(true);
              }}
              aria-label="Create label"
            >
              <Plus aria-hidden="true" />
              <span>New</span>
            </button>
          </div>
          <StudioDmChatFilter value={chatFilter} onChange={setChatFilter} />
        </div>
      </div>

      <div className="studio-dm-sidebar-body">
        {editorOpen ? (
          <StudioDmLabelEditorDialog
            open
            variant="inline"
            labelId={editingLabel?.labelId}
            initialName={editingLabel?.name}
            initialIcon={editingLabel?.icon}
            onClose={() => {
              setEditorOpen(false);
              setEditingLabel(null);
            }}
          />
        ) : assignPeer ? (
          <StudioDmAssignLabelsDialog
            open
            variant="inline"
            peerUserId={assignPeer.userId}
            peerLabel={assignPeer.label}
            peerAvatarUrl={assignPeer.avatarUrl}
            onClose={() => setAssignPeer(null)}
          />
        ) : searching ? (
          searchResults === undefined ? (
            <div className="studio-dm-scroll-pending" aria-hidden="true" />
          ) : searchResults.people.length === 0 &&
            searchResults.chats.length === 0 &&
            searchResults.messages.length === 0 &&
            searchResults.labels.length === 0 ? (
            <div className="studio-dm-search-empty">
              <SearchX aria-hidden="true" />
              <strong>No results</strong>
              <span>Try a person, label, or words from a message.</span>
            </div>
          ) : (
            <div className="studio-dm-search-results">
              <SearchResultSection
                title="People & friends"
                count={searchResults.people.length}
                icon={<Users aria-hidden="true" />}
              >
                {searchResults.people.map((person) => (
                  <button
                    key={person.profileId}
                    type="button"
                    className="studio-dm-search-result"
                    onClick={() => {
                      setSearch("");
                      onStartChat(person.username);
                    }}
                  >
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
                    <span className="studio-dm-search-badges">
                      {person.following ? (
                        <span className="studio-dm-search-badge">Following</span>
                      ) : null}
                      {person.hasChat ? (
                        <span className="studio-dm-search-badge">Chat</span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </SearchResultSection>

              <SearchResultSection
                title="Chats"
                count={searchResults.chats.length}
                icon={<MessageCircle aria-hidden="true" />}
              >
                {searchResults.chats.map((chat) => (
                  <FeedShareDropTarget
                    key={chat.conversationId}
                    className="studio-dm-search-result is-chat"
                    onActivate={() => {
                      setSearch("");
                      onSelectConversation(chat.conversationId);
                    }}
                    onFeedShareDrop={(payload) => {
                      handleFeedShareDrop(chat.conversationId, payload);
                      setSearch("");
                    }}
                  >
                    <span className="studio-dm-row-avatar-wrap">
                      <StudioProfileAvatar
                        size="sm"
                        src={chat.peer.avatarUrl}
                        displayName={chat.peer.displayName}
                        name={chat.peer.username}
                        alt=""
                      />
                      {chat.peerOnline ? (
                        <span
                          className="studio-dm-online-dot"
                          aria-label="Online"
                        />
                      ) : null}
                    </span>
                    <span className="studio-dm-search-result-copy">
                      <strong>
                        <span className="studio-dm-name-text">
                          {chat.peer.displayName?.trim() ||
                            `@${chat.peer.username}`}
                        </span>
                        <StudioDmProviderTag tag={chat.peer.sellerTag} />
                      </strong>
                      <span>
                        {chat.lastMessagePreview || "Tap to start chatting"}
                      </span>
                    </span>
                    <time>{searchTimeLabel(chat.lastMessageAt)}</time>
                    {chat.labels.length > 0 ? (
                      <span className="studio-dm-search-result-labels">
                        {chat.labels.map((label) => (
                          <span key={label.labelId}>
                            {createElement(dmLabelIcon(label.icon), {
                              "aria-hidden": true,
                            })}
                            {label.name}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </FeedShareDropTarget>
                ))}
              </SearchResultSection>

              <SearchResultSection
                title="Messages"
                count={searchResults.messages.length}
                icon={<MessagesSquare aria-hidden="true" />}
              >
                {searchResults.messages.map((message) => (
                  <button
                    key={message.messageId}
                    type="button"
                    className="studio-dm-search-result is-message"
                    onClick={() => {
                      setSearch("");
                      onSelectConversation(message.conversationId);
                    }}
                  >
                    <StudioProfileAvatar
                      size="sm"
                      src={message.peer.avatarUrl}
                      displayName={message.peer.displayName}
                      name={message.peer.username}
                      alt=""
                    />
                    <span className="studio-dm-search-result-copy">
                      <strong>
                        {message.fromMe
                          ? `You → ${message.peer.displayName?.trim() || `@${message.peer.username}`}`
                          : message.peer.displayName?.trim() ||
                            `@${message.peer.username}`}
                      </strong>
                      <span>
                        {highlightSearchMatches(message.body, deferredSearch)}
                      </span>
                    </span>
                    <time>{searchTimeLabel(message.createdAt)}</time>
                  </button>
                ))}
              </SearchResultSection>

              <SearchResultSection
                title="Labels"
                count={searchResults.labels.length}
                icon={<Tags aria-hidden="true" />}
              >
                {searchResults.labels.map((label) => {
                  return (
                    <button
                      key={label.labelId}
                      type="button"
                      className="studio-dm-search-result is-label"
                      onClick={() => {
                        setActiveLabelId(label.labelId);
                        setSearch("");
                      }}
                    >
                      <span className="studio-dm-search-label-icon">
                        {createElement(dmLabelIcon(label.icon), {
                          "aria-hidden": true,
                        })}
                      </span>
                      <span className="studio-dm-search-result-copy">
                        <strong>{label.name}</strong>
                        <span>
                          {label.memberCount}{" "}
                          {label.memberCount === 1 ? "chat" : "chats"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </SearchResultSection>
            </div>
          )
        ) : conversations == null ? (
          <div className="studio-dm-scroll-pending" aria-hidden="true" />
        ) : conversations.length === 0 ? (
          <p className="studio-dm-empty">
            {activeLabelId
              ? "No chats in this label yet. Right-click a chat to add labels."
              : "Search people above or tap Message on a profile."}
          </p>
        ) : !filteredConversations || filteredConversations.length === 0 ? (
          <p className="studio-dm-empty">
            {chatFilter === "unread"
              ? "No unread chats — you’re all caught up."
              : chatFilter === "online"
                ? "Nobody’s online right now."
                : chatFilter === "awaiting"
                  ? "No chats awaiting a reply."
                  : "No chats match this filter."}
          </p>
        ) : (
          <ul className="studio-dm-conversations">
            {filteredConversations.map((row) => (
              <li key={row.conversationId}>
                <StudioDmConversationRow
                  row={row}
                  active={row.conversationId === activeConversationId}
                  onSelect={() => onSelectConversation(row.conversationId)}
                  onFeedShareDrop={(conversationId, payload) => {
                    handleFeedShareDrop(conversationId, payload);
                  }}
                  onContextMenu={(coords) =>
                    openChatMenu(coords, {
                      userId: row.peer.userId,
                      label:
                        row.peer.displayName?.trim() ||
                        `@${row.peer.username}`,
                      avatarUrl: row.peer.avatarUrl,
                    })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {context ? (
        <StudioDmContextMenu
          x={context.x}
          y={context.y}
          items={contextItems}
          onClose={() => setContext(null)}
        />
      ) : null}
    </div>
  );
}

/** Wrap query matches like composer selection pills — grouped words, no extra spacing. */
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

  // Prefer contiguous phrase spans so multi-word queries paint as one group.
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
    // Merge overlapping / adjacent / whitespace-only gaps (group words).
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

function searchTimeLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

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
  if (count === 0) return null;
  return (
    <section className="studio-dm-search-section">
      <header className="studio-dm-search-section-head">
        <span>
          {icon}
          {title}
        </span>
        <strong>{count}</strong>
      </header>
      <div className="studio-dm-search-section-list">{children}</div>
    </section>
  );
}

function LabelChip({
  label,
  active,
  onSelect,
  onMenu,
}: {
  label: { labelId: LabelId; name: string; icon: string; memberCount: number };
  active: boolean;
  onSelect: () => void;
  onMenu: (
    coords: { x: number; y: number },
    label: { labelId: LabelId; name: string; icon: string },
  ) => void;
}) {
  const { longPressHandlers, longPressFired, clearLongPressFired } =
    useLongPress((coords) => {
      onMenu(coords, {
        labelId: label.labelId,
        name: label.name,
        icon: label.icon,
      });
    });

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`studio-dm-label-chip${active ? " is-active" : ""}`}
      title={`${label.name} (${label.memberCount})`}
      {...longPressHandlers}
      onClick={() => {
        if (longPressFired()) {
          clearLongPressFired();
          return;
        }
        onSelect();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu(
          { x: event.clientX, y: event.clientY },
          {
            labelId: label.labelId,
            name: label.name,
            icon: label.icon,
          },
        );
      }}
    >
      {createElement(dmLabelIcon(label.icon), { "aria-hidden": true })}
      <span>{label.name}</span>
    </button>
  );
}

/** Chat search row that also accepts feed post/comment drops. */
function FeedShareDropTarget({
  className,
  children,
  onActivate,
  onFeedShareDrop,
}: {
  className?: string;
  children: ReactNode;
  onActivate: () => void;
  onFeedShareDrop: (payload: StudioFeedSharePayload) => void;
}) {
  const [dropActive, setDropActive] = useState(false);
  const selectHandledRef = useRef(false);
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const pointerMovedRef = useRef(false);
  return (
    <button
      type="button"
      className={`${className ?? ""}${dropActive ? " is-feed-drop" : ""}`}
      onPointerDown={(event) => {
        if (event.button != null && event.button !== 0) return;
        selectHandledRef.current = false;
        pointerMovedRef.current = false;
        pointerStartRef.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerMove={(event) => {
        if (pointerMovedRef.current) return;
        const dx = Math.abs(event.clientX - pointerStartRef.current.x);
        const dy = Math.abs(event.clientY - pointerStartRef.current.y);
        if (Math.max(dx, dy) > 14) pointerMovedRef.current = true;
      }}
      onPointerUp={(event) => {
        if (event.button != null && event.button !== 0) return;
        if (pointerMovedRef.current) return;
        selectHandledRef.current = true;
        onActivate();
      }}
      onClick={() => {
        if (selectHandledRef.current) {
          selectHandledRef.current = false;
          return;
        }
        onActivate();
      }}
      onDragEnter={(event) => {
        if (!feedShareDragTypes(Array.from(event.dataTransfer.types))) return;
        event.preventDefault();
        setDropActive(true);
      }}
      onDragOver={(event) => {
        if (!feedShareDragTypes(Array.from(event.dataTransfer.types))) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDropActive(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDropActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDropActive(false);
        const payload = readFeedShareDataTransfer(event.dataTransfer);
        if (!payload) return;
        onFeedShareDrop(payload);
      }}
    >
      {children}
    </button>
  );
}
