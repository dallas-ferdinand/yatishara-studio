"use client";

import { useMutation, useQuery } from "convex/react";
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
  useCallback,
  useDeferredValue,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PanelSearchBar } from "@/desk/components/PanelSearchBar";
import { useLongPress } from "@/desk/hooks/use-long-press";
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
import { StudioProfileAvatar } from "./StudioProfileAvatar";
import {
  StudioDmConversationRow,
  type DmConversationId,
} from "./StudioMessagesPane";
import "./studio-messages.css";

type LabelId = Id<"dmLabels">;

type StudioMessagesSidebarProps = {
  activeConversationId: DmConversationId | null;
  onSelectConversation: (conversationId: DmConversationId) => void;
  onStartChat: (username: string) => void;
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
    };

/** Chat-list rail — replaces the file manager while a Messages tab is active. */
export function StudioMessagesSidebar({
  activeConversationId,
  onSelectConversation,
  onStartChat,
  expiresUnix,
}: StudioMessagesSidebarProps) {
  const [search, setSearch] = useState("");
  const [searchNow] = useState(() => Date.now());
  const deferredSearch = useDeferredValue(search.trim().replace(/^@+/, ""));
  const searching = deferredSearch.length >= 1;
  const [activeLabelId, setActiveLabelId] = useState<LabelId | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<{
    labelId: LabelId;
    name: string;
    icon: string;
  } | null>(null);
  const [assignPeer, setAssignPeer] = useState<{
    userId: Id<"users">;
    label: string;
  } | null>(null);
  const [context, setContext] = useState<ContextTarget | null>(null);

  const labels = useQuery(api.dmLabels.listMine, {});
  const removeLabel = useMutation(api.dmLabels.remove);
  const ackDelivered = useMutation(api.dms.ackDelivered);
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

  // Drop the filter if the active label was deleted.
  useEffect(() => {
    if (!activeLabelId || labels === undefined) return;
    if (!labels.some((label) => label.labelId === activeLabelId)) {
      setActiveLabelId(null);
    }
  }, [activeLabelId, labels]);

  // Delivery ACK while the chat list is open (inbound last message).
  useEffect(() => {
    if (!conversations?.length) return;
    for (const row of conversations) {
      if (row.lastMessageFromMe) continue;
      void ackDelivered({
        conversationId: row.conversationId,
        upToCreatedAt: row.lastMessageAt,
      });
    }
  }, [ackDelivered, conversations]);

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
      peer: { userId: Id<"users">; label: string },
    ) => {
      setContext({
        kind: "chat",
        x: coords.x,
        y: coords.y,
        userId: peer.userId,
        label: peer.label,
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
              setAssignPeer({
                userId: context.userId,
                label: context.label,
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
        />

        <div className="studio-dm-label-rail" role="tablist" aria-label="Labels">
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
              setEditingLabel(null);
              setEditorOpen(true);
            }}
            aria-label="Create label"
          >
            <Plus aria-hidden="true" />
            <span>New</span>
          </button>
        </div>

        <StudioDmLabelEditorDialog
          open={editorOpen}
          variant="overlay"
          labelId={editingLabel?.labelId}
          initialName={editingLabel?.name}
          initialIcon={editingLabel?.icon}
          onClose={() => {
            setEditorOpen(false);
            setEditingLabel(null);
          }}
        />
      </div>

      <div className="studio-dm-sidebar-body">
        {searching ? (
          searchResults === undefined ? (
            <p className="studio-dm-empty">Loading…</p>
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
                        {person.displayName?.trim() || person.username}
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
                  <button
                    key={chat.conversationId}
                    type="button"
                    className="studio-dm-search-result is-chat"
                    onClick={() => {
                      setSearch("");
                      onSelectConversation(chat.conversationId);
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
                        {chat.peer.displayName?.trim() ||
                          `@${chat.peer.username}`}
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
                  </button>
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
                      <span>{message.body}</span>
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
        ) : conversations === undefined ? (
          <p className="studio-dm-empty">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="studio-dm-empty">
            {activeLabelId
              ? "No chats in this label yet. Right-click a chat to add labels."
              : "Search people above or tap Message on a profile."}
          </p>
        ) : (
          <ul className="studio-dm-conversations">
            {conversations.map((row) => (
              <li key={row.conversationId}>
                <StudioDmConversationRow
                  row={row}
                  active={row.conversationId === activeConversationId}
                  onSelect={() => onSelectConversation(row.conversationId)}
                  onContextMenu={(coords) =>
                    openChatMenu(coords, {
                      userId: row.peer.userId,
                      label:
                        row.peer.displayName?.trim() ||
                        `@${row.peer.username}`,
                    })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <StudioDmAssignLabelsDialog
        open={Boolean(assignPeer)}
        peerUserId={assignPeer?.userId ?? null}
        peerLabel={assignPeer?.label ?? ""}
        onClose={() => setAssignPeer(null)}
      />

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
