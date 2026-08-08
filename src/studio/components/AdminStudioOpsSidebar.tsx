"use client";

import {
  ArrowDown,
  Bot,
  Eye,
  Loader2,
  RefreshCw,
  Tags,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PanelSearchBar } from "@/desk/components/PanelSearchBar";
import { Icon } from "@/desk/components/Icons";
import { useHorizontalScrollFade } from "@/desk/lib/use-horizontal-scroll-fade";
import { useHorizontalWheelScroll } from "@/desk/lib/use-horizontal-wheel-scroll";
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
import "./studio-messages.css";

const META_FILTERS: { id: ChatFilterId; label: string }[] = [
  { id: "all", label: "All chats" },
  { id: "approval", label: "Needs approval" },
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
      className={`studio-ops-meta-badge is-${kind}${spinning ? " is-working" : ""}`}
      title={spinning ? `${label} working` : label}
    >
      {spinning ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden={true} />
      ) : kind === "agent" ? (
        <Bot className="h-2.5 w-2.5" aria-hidden={true} />
      ) : kind === "human" ? (
        <UserRound className="h-2.5 w-2.5" aria-hidden={true} />
      ) : kind === "watch" ? (
        <Eye className="h-2.5 w-2.5" aria-hidden={true} />
      ) : (
        <Bot className="h-2.5 w-2.5" aria-hidden={true} />
      )}
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
      className={`studio-dm-row studio-ops-dm-row${active ? " is-active" : ""}${pending > 0 ? " is-unread" : ""}`}
      onClick={onSelect}
    >
      <span className="studio-dm-row-main">
        <span className="studio-dm-row-avatar-wrap">
          <StudioProfileAvatar
            size="sm"
            src={avatarSrc}
            displayName={title}
            name={session.phone}
            alt=""
          />
        </span>
        <span className="studio-dm-row-copy">
          <span className="studio-dm-row-top">
            <strong title={`${title} · ${session.phone_display || session.phone}`}>
              <span className="studio-dm-name-text">{title}</span>
            </strong>
            <time>
              {whenLabel(
                session.last_message_at ||
                  session.last_inbound_at ||
                  session.updated_at,
              )}
            </time>
          </span>
          <span className="studio-dm-row-bottom">
            <span className="studio-dm-row-preview">{preview}</span>
            {pending > 0 ? (
              <span className="studio-dm-unread-dot" aria-label="Needs approval" />
            ) : null}
          </span>
          {running || badges.length > 0 ? (
            <span className="studio-ops-row-badges">
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
                        ? "Human"
                        : b === "watch"
                          ? "Watch"
                          : b
                  }
                />
              ))}
            </span>
          ) : null}
        </span>
      </span>
      {labels.length > 0 ? (
        <span className="studio-dm-row-labels" aria-label="Labels">
          {labels.slice(0, 4).map((id) => (
            <span key={String(id)} className="studio-dm-row-label" title={String(id)}>
              {statusLabel(String(id), statusCatalog)}
            </span>
          ))}
        </span>
      ) : null}
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
    busy,
    refresh,
  } = useAdminStudioOps();

  const labelRailRef = useRef<HTMLDivElement | null>(null);
  useHorizontalWheelScroll(labelRailRef);
  useHorizontalScrollFade(labelRailRef);

  const labelChips: StatusOpt[] = [
    { id: "all", label: "All" },
    ...statusCatalog.slice(0, 8),
  ];

  return (
    <div className="studio-dm-sidebar studio-ops-rail-sidebar">
      <div className="studio-dm-sidebar-chrome">
        <PanelSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search chats"
          aria-label="Search Sophie chats"
          end={
            <button
              type="button"
              className="studio-composer-circle-btn studio-dm-open-full"
              aria-label="Refresh chats"
              title="Refresh"
              disabled={busy === "refresh"}
              onClick={() => void refresh()}
            >
              {busy === "refresh" ? (
                <Loader2 size={13} strokeWidth={2.25} className="animate-spin" />
              ) : (
                <RefreshCw size={13} strokeWidth={2.25} aria-hidden="true" />
              )}
            </button>
          }
        />

        <div className="studio-dm-rail-row">
          <div
            ref={labelRailRef}
            className="studio-dm-label-rail"
            role="tablist"
            aria-label="Labels"
          >
            {labelChips.map((chip) => {
              const isAll = chip.id === "all";
              const on = isAll ? chatFilter === "all" : chatFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  className={`studio-dm-label-chip${on ? " is-active" : ""}`}
                  onClick={() => setChatFilter(isAll ? "all" : chip.id)}
                >
                  {isAll ? <Tags aria-hidden="true" /> : null}
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </div>
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
