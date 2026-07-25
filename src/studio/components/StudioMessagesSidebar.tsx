"use client";

import { useQuery } from "convex/react";
import { useDeferredValue, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { PanelSearchBar } from "@/desk/components/PanelSearchBar";
import { StudioProfileAvatar } from "./StudioProfileAvatar";
import {
  StudioDmConversationRow,
  type DmConversationId,
} from "./StudioMessagesPane";
import "./studio-messages.css";

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

  const conversations = useQuery(api.dms.listMyConversations, { expiresUnix });
  const searchResults = useQuery(
    api.hashtags.suggestPeople,
    searching ? { query: deferredSearch, limit: 16, expiresUnix } : "skip",
  );

  return (
    <div className="studio-dm-sidebar">
      <PanelSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search people"
        aria-label="Search people to message"
      />
      <div className="studio-dm-sidebar-body">
        {searching ? (
          <section className="studio-dm-section">
            <h2 className="studio-dm-section-title">Start a chat</h2>
            {searchResults === undefined ? (
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
                        <span className="studio-dm-row-preview">
                          @{person.username}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section className="studio-dm-section">
            <h2 className="studio-dm-section-title">Chats</h2>
            {conversations === undefined ? (
              <p className="studio-dm-empty">Loading…</p>
            ) : conversations.length === 0 ? (
              <p className="studio-dm-empty">
                No chats yet. Search people above or tap Message on a profile.
              </p>
            ) : (
              <ul className="studio-dm-conversations">
                {conversations.map((row) => (
                  <li key={row.conversationId}>
                    <StudioDmConversationRow
                      row={row}
                      active={row.conversationId === activeConversationId}
                      onSelect={() => onSelectConversation(row.conversationId)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
