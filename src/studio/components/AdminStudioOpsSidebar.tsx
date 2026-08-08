"use client";

import {
  ArrowDown,
  Bot,
  Eye,
  Loader2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PanelSearchBar } from "@/desk/components/PanelSearchBar";
import { Icon } from "@/desk/components/Icons";
import { StudioProfileAvatar } from "./StudioProfileAvatar";
import {
  sessionAvatarSrc,
  sessionTitle,
  statusLabel,
  useAdminStudioOps,
  whenLabel,
  type ChatFilterId,
  type SessionRow,
  type StatusOpt,
} from "./AdminStudioOpsContext";
import { OpsFilterPills } from "./AdminStudioOpsExtras";
import "./studio-messages.css";

const META_FILTERS: { id: ChatFilterId; label: string }[] = [
  { id: "all", label: "All chats" },
  { id: "unanswered", label: "Unanswered" },
  { id: "working", label: "Working" },
  { id: "watch", label: "Watch" },
  { id: "approval", label: "Needs approval" },
  { id: "escalated", label: "Escalated" },
  { id: "agent", label: "Agent on" },
  { id: "human", label: "Human takeover" },
];

function OpsChatFilter({
  value,
  onChange,
  statuses,
}: {
  value: ChatFilterId;
  onChange: (value: ChatFilterId) => void;
  statuses: StatusOpt[];
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const options = [
    ...META_FILTERS,
    ...statuses.map((s) => ({ id: s.id, label: s.label })),
  ];
  const active = options.find((o) => o.id === value) || options[0]!;
  const filtered = value !== "all";

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="desk-explorer-type-filter studio-dm-chat-filter" ref={wrapRef}>
      <button
        type="button"
        className={`desk-explorer-type-filter-trigger${filtered ? " is-active" : ""}${open ? " is-open" : ""}`}
        title={filtered ? `Filter: ${active.label}` : "Filter chats"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={filtered ? `Filter: ${active.label}` : "Filter chats"}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Icon name="sliders" size={13} />
        <span>{active.label}</span>
        <ArrowDown className="cursor-select-arrow" aria-hidden={true} />
      </button>
      {filtered ? (
        <button
          type="button"
          className="desk-explorer-type-filter-clear"
          title="Clear filter"
          aria-label="Clear filter"
          onClick={(event) => {
            event.stopPropagation();
            onChange("all");
            setOpen(false);
          }}
        >
          <X aria-hidden={true} />
        </button>
      ) : null}
      {open ? (
        <div
          className="cursor-dropdown cursor-dropdown-down is-end desk-explorer-type-filter-menu studio-dm-chat-filter-menu"
          role="menu"
        >
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="menuitemradio"
              aria-checked={value === opt.id}
              className={`cursor-dropdown-item${value === opt.id ? " active" : ""}`}
              onClick={() => {
                onChange(opt.id);
                setOpen(false);
              }}
            >
              <Tags className="h-3.5 w-3.5" aria-hidden={true} />
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

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

        <div className="studio-dm-rail-row">
          <OpsChatFilter
            value={chatFilter}
            onChange={setChatFilter}
            statuses={statusCatalog}
          />
        </div>
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
