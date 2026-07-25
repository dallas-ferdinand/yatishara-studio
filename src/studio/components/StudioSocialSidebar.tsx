"use client";

import { useQuery } from "convex/react";
import { useDeferredValue, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PanelSearchBar } from "@/desk/components/PanelSearchBar";
import { StudioProfileAvatar } from "./StudioProfileAvatar";
import "./studio-social-sidebar.css";

type SocialPerson = {
  profileId: Id<"profiles">;
  username: string;
  displayName?: string;
  avatarUrl?: string;
};

type StudioSocialSidebarProps = {
  onOpenProfile: (username: string) => void;
  expiresUnix: number;
};

function PersonRow({
  person,
  onOpen,
}: {
  person: SocialPerson;
  onOpen: (username: string) => void;
}) {
  const label = person.displayName?.trim() || person.username;
  return (
    <button
      type="button"
      className="studio-social-person"
      onClick={() => onOpen(person.username)}
    >
      <StudioProfileAvatar
        size="sm"
        src={person.avatarUrl}
        displayName={person.displayName}
        name={person.username}
        alt=""
      />
      <span className="studio-social-person-copy">
        <strong>{label}</strong>
        <span>@{person.username}</span>
      </span>
    </button>
  );
}

function PersonSection({
  title,
  people,
  empty,
  onOpen,
}: {
  title: string;
  people: SocialPerson[] | undefined;
  empty: string;
  onOpen: (username: string) => void;
}) {
  return (
    <section className="studio-social-section">
      <h2 className="studio-social-section-title">{title}</h2>
      {people === undefined ? (
        <p className="studio-social-empty">Loading…</p>
      ) : people.length === 0 ? (
        <p className="studio-social-empty">{empty}</p>
      ) : (
        <ul className="studio-social-list">
          {people.map((person) => (
            <li key={person.profileId}>
              <PersonRow person={person} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function StudioSocialSidebar({
  onOpenProfile,
  expiresUnix,
}: StudioSocialSidebarProps) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().replace(/^@+/, ""));
  const searching = deferredSearch.length >= 1;

  const searchResults = useQuery(
    api.hashtags.suggestPeople,
    searching
      ? { query: deferredSearch, limit: 16, expiresUnix }
      : "skip",
  );
  const following = useQuery(
    api.profiles.listMyFollowing,
    searching ? "skip" : { limit: 40, expiresUnix },
  );
  const suggested = useQuery(
    api.profiles.listPlatformPeople,
    searching ? "skip" : { limit: 60, expiresUnix },
  );

  return (
    <div className="studio-social-sidebar">
      <PanelSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search people"
        aria-label="Search people"
      />
      <div className="studio-social-body">
        {searching ? (
          <PersonSection
            title="People"
            people={searchResults}
            empty="No people match that name."
            onOpen={onOpenProfile}
          />
        ) : (
          <>
            <PersonSection
              title="Following"
              people={following}
              empty="Follow creators to see them here."
              onOpen={onOpenProfile}
            />
            <PersonSection
              title="People"
              people={suggested}
              empty="No other people on the platform yet."
              onOpen={onOpenProfile}
            />
          </>
        )}
      </div>
    </div>
  );
}
