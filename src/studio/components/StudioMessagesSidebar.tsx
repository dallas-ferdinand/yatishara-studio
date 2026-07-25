"use client";

import { useMutation, useQuery } from "convex/react";
import { MoreHorizontal, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PanelSearchBar } from "@/desk/components/PanelSearchBar";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { dmLabelIcon } from "@/studio/lib/dmLabelIcons";
import {
  StudioDmAssignLabelsDialog,
  StudioDmLabelEditorDialog,
} from "./StudioDmLabelDialogs";
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

/** Chat-list rail — replaces the file manager while a Messages tab is active. */
export function StudioMessagesSidebar({
  activeConversationId,
  onSelectConversation,
  onStartChat,
  expiresUnix,
}: StudioMessagesSidebarProps) {
  const [search, setSearch] = useState("");
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

  const labels = useQuery(api.dmLabels.listMine, {});
  const removeLabel = useMutation(api.dmLabels.remove);
  const conversations = useQuery(api.dms.listMyConversations, {
    expiresUnix,
    labelId: activeLabelId ?? undefined,
  });
  const searchResults = useQuery(
    api.hashtags.suggestPeople,
    searching ? { query: deferredSearch, limit: 16, expiresUnix } : "skip",
  );

  // Drop the filter if the active label was deleted.
  useEffect(() => {
    if (!activeLabelId || labels === undefined) return;
    if (!labels.some((label) => label.labelId === activeLabelId)) {
      setActiveLabelId(null);
    }
  }, [activeLabelId, labels]);

  return (
    <div className="studio-dm-sidebar">
      <PanelSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search people"
        aria-label="Search people to message"
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
        {(labels ?? []).map((label) => {
          const Icon = dmLabelIcon(label.icon);
          const active = activeLabelId === label.labelId;
          return (
            <div key={label.labelId} className="studio-dm-label-chip-wrap">
              <button
                type="button"
                role="tab"
                aria-selected={active}
                className={`studio-dm-label-chip${active ? " is-active" : ""}`}
                onClick={() =>
                  setActiveLabelId(active ? null : label.labelId)
                }
                title={`${label.name} (${label.memberCount})`}
              >
                <Icon aria-hidden="true" />
                <span>{label.name}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="studio-dm-label-more"
                    aria-label={`${label.name} options`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  sideOffset={4}
                  className="studio-dm-label-menu"
                >
                  <DropdownMenuItem
                    onSelect={() => {
                      setEditingLabel({
                        labelId: label.labelId,
                        name: label.name,
                        icon: label.icon,
                      });
                      setEditorOpen(true);
                    }}
                  >
                    <Pencil aria-hidden="true" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => {
                      if (
                        !window.confirm(
                          `Delete “${label.name}”? People stay in your chats.`,
                        )
                      ) {
                        return;
                      }
                      void removeLabel({ labelId: label.labelId }).catch(
                        (error) => {
                          window.alert(
                            friendlyConvexError(error, "Could not delete label"),
                          );
                        },
                      );
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
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

      <div className="studio-dm-sidebar-body">
        {searching ? (
          searchResults === undefined ? (
            <p className="studio-dm-empty">Loading…</p>
          ) : searchResults.length === 0 ? (
            <p className="studio-dm-empty">No people match that name.</p>
          ) : (
            <ul className="studio-dm-conversations">
              {searchResults.map((person) => (
                <li key={person.profileId}>
                  <button
                    type="button"
                    className="studio-dm-row"
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
                    <span className="studio-dm-row-copy">
                      <span className="studio-dm-row-top">
                        <strong>
                          {person.displayName?.trim() || person.username}
                        </strong>
                      </span>
                      <span className="studio-dm-row-bottom">
                        <span className="studio-dm-row-preview">
                          @{person.username}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : conversations === undefined ? (
          <p className="studio-dm-empty">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="studio-dm-empty">
            {activeLabelId
              ? "No chats in this label yet. Open a chat and tap the tag to add people."
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
                  onEditLabels={() =>
                    setAssignPeer({
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

      <StudioDmLabelEditorDialog
        open={editorOpen}
        labelId={editingLabel?.labelId}
        initialName={editingLabel?.name}
        initialIcon={editingLabel?.icon}
        onClose={() => {
          setEditorOpen(false);
          setEditingLabel(null);
        }}
      />
      <StudioDmAssignLabelsDialog
        open={Boolean(assignPeer)}
        peerUserId={assignPeer?.userId ?? null}
        peerLabel={assignPeer?.label ?? ""}
        onClose={() => setAssignPeer(null)}
      />
    </div>
  );
}
