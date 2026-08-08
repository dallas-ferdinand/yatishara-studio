"use client";

import {
  Bot,
  Eye,
  Loader2,
  UserRound,
} from "lucide-react";
import { PanelSearchBar } from "@/desk/components/PanelSearchBar";
import { StudioProfileAvatar } from "./StudioProfileAvatar";
import {
  sessionAvatarSrc,
  sessionTitle,
  statusLabel,
  useAdminStudioOps,
  whenLabel,
  type SessionRow,
  type StatusOpt,
} from "./AdminStudioOpsContext";
import { OpsFilterPills } from "./AdminStudioOpsExtras";
import "./studio-messages.css";

function statusTone(id: string): string {
  const key = id.toLowerCase();
  if (key.includes("watch")) return "watch";
  if (key.includes("inbound") || key === "new") return "inbound";
  if (key.includes("outbound")) return "outbound";
  if (key.includes("intake")) return "intake";
  if (key.includes("await") || key.includes("payment")) return "await";
  if (key.includes("owner")) return "owner";
  if (key.includes("friend") || key.includes("family")) return "friends";
  if (key.includes("human")) return "human";
  if (key.includes("agent") || key.includes("sophie")) return "agent";
  return "neutral";
}

function MetaBadge({
  kind,
  label,
  spinning = false,
}: {
  kind: string;
  label: string;
  spinning?: boolean;
}) {
  return (
    <span
      className={`studio-ops-tag is-${statusTone(kind)}${spinning ? " is-working" : ""}`}
      title={spinning ? `${label} working` : label}
    >
      {spinning ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden={true} />
      ) : kind === "agent" || kind === "sophie" ? (
        <Bot className="h-2.5 w-2.5" aria-hidden={true} />
      ) : kind === "human" ? (
        <UserRound className="h-2.5 w-2.5" aria-hidden={true} />
      ) : kind === "watch" || statusTone(kind) === "watch" ? (
        <Eye className="h-2 w-2" aria-hidden={true} />
      ) : null}
      <span>{label}</span>
    </span>
  );
}

function OpsConversationRow({
  session,
  active,
  pending,
  statusCatalog,
  onSelect,
}: {
  session: SessionRow;
  active: boolean;
  pending: number;
  statusCatalog: StatusOpt[];
  onSelect: () => void;
}) {
  const title = sessionTitle(session);
  const preview = String(session.preview || "").trim() || "Tap to open";
  const avatarSrc = sessionAvatarSrc(session.phone);
  const running = Boolean(
    session.working?.sophie ||
      session.working?.csr ||
      session.status === "running" ||
      (session.badges || []).includes("sophie"),
  );
  const labels = (session.statuses || session.cs_statuses || []).filter(Boolean);
  const badges = (session.badges || []).filter((b) => b !== "sophie");

  return (
    <button
      type="button"
      className={`studio-ops-chat-card${active ? " is-active" : ""}${pending > 0 ? " is-unread" : ""}`}
      onClick={onSelect}
    >
      <span className="studio-ops-chat-card-avatar">
        <span
          className={`studio-ops-avatar-wrap${
            session.presence?.typing
              ? " is-typing"
              : session.presence?.online
                ? " is-online"
                : ""
          }`}
        >
          <StudioProfileAvatar
            size="md"
            src={avatarSrc}
            displayName={title}
            name={session.phone}
            alt=""
          />
          {session.presence?.typing || session.presence?.online ? (
            <span
              className={`studio-ops-presence-dot${
                session.presence?.typing ? " is-typing" : " is-online"
              }`}
              aria-hidden
            />
          ) : null}
          {Number(session.unanswered_count || 0) > 0 ? (
            <span className="studio-ops-unanswered" aria-label="Unanswered">
              {Math.min(99, Number(session.unanswered_count || 0))}
            </span>
          ) : null}
        </span>
      </span>
      <span className="studio-ops-chat-card-body">
        <span className="studio-ops-chat-card-top">
          <strong title={`${title} · ${session.phone_display || session.phone}`}>
            {title}
          </strong>
          <time>
            {whenLabel(
              session.last_message_at ||
                session.last_inbound_at ||
                session.updated_at,
            )}
          </time>
        </span>
        {running || badges.length > 0 || labels.length > 0 ? (
          <span className="studio-ops-chat-card-chips" aria-label="Labels">
            {running ? (
              <MetaBadge kind="sophie" label="Sophie" spinning />
            ) : null}
            {badges.map((b) => (
              <MetaBadge
                key={b}
                kind={b}
                label={
                  b === "agent"
                    ? "Agent"
                    : b === "human"
                      ? "Human takeover"
                      : b === "watch"
                        ? "Watch"
                        : b
                }
              />
            ))}
            {labels.slice(0, 4).map((id) => (
              <MetaBadge
                key={String(id)}
                kind={String(id)}
                label={statusLabel(String(id), statusCatalog)}
              />
            ))}
          </span>
        ) : null}
        <span className="studio-ops-chat-card-preview">
          <span>{preview}</span>
          {pending > 0 ? (
            <span className="studio-ops-chat-card-dot" aria-label="Needs approval" />
          ) : null}
        </span>
      </span>
    </button>
  );
}

/** Chat list for the Studio left rail — DM bubble rows + Desk-like working tags. */
export function AdminStudioOpsSidebar() {
  const {
    search,
    setSearch,
    chatFilter,
    setChatFilter,
    statusCatalog,
    filteredSessions,
    sessions,
    selectedPhone,
    setSelectedPhone,
    pendingByPhone,
    filterCounts,
  } = useAdminStudioOps();

  return (
    <div className="studio-dm-sidebar studio-ops-rail-sidebar">
      <div className="studio-dm-sidebar-chrome">
        <PanelSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search chats"
          aria-label="Search Sophie chats"
        />

        <OpsFilterPills
          value={chatFilter}
          onChange={setChatFilter}
          counts={filterCounts}
          statusIds={statusCatalog}
        />
      </div>

      <div className="studio-dm-sidebar-body">
        <div className="studio-dm-conversations studio-ops-rail-list">
          {filteredSessions.length === 0 ? (
            <div className="studio-ops-empty-card">
              <strong>{sessions.length ? "No matches" : "No chats yet"}</strong>
              <span>
                {sessions.length
                  ? "Try a different search or label."
                  : "Sophie’s inbound DMs will show here."}
              </span>
            </div>
          ) : (
            filteredSessions.map((s) => (
              <OpsConversationRow
                key={s.phone}
                session={s}
                active={selectedPhone === s.phone}
                pending={pendingByPhone.get(s.phone) || 0}
                statusCatalog={statusCatalog}
                onSelect={() => setSelectedPhone(s.phone)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
