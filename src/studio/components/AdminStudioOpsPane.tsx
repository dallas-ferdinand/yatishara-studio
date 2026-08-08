"use client";

import { useAction } from "convex/react";
import {
  ArrowDown,
  Ban,
  Bot,
  Clock,
  Loader2,
  NotebookPen,
  RefreshCw,
  Tags,
  UserRoundCheck,
  Wallet,
  X,
} from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { PanelSearchBar } from "@/desk/components/PanelSearchBar";
import { Icon } from "@/desk/components/Icons";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";

type OpsTab = "chats" | "settings";

type DeviceStatus = {
  ok?: boolean;
  instance?: string;
  bot?: string;
  hint?: string;
  status?: string;
  open?: boolean;
  connecting?: boolean;
  phone?: string | null;
  profileName?: string | null;
  agentName?: string;
  state?: string;
  qr?: string | null;
  qrcode?: { base64?: string; pairingCode?: string } | string;
  base64?: string;
};

type SessionRow = {
  phone: string;
  display_name?: string | null;
  cs_status?: string;
  statuses?: string[];
  agent_enabled?: number;
  human_takeover?: number;
  payment_state?: string;
  followup_at?: string | null;
  followup_note?: string | null;
  notes?: string | null;
  last_inbound_at?: string | null;
  updated_at?: string | null;
};

type PaymentRow = {
  id: number;
  phone: string;
  amount_cents: number;
  kind: string;
  method?: string | null;
  status: string;
  owner_status: string;
  notes?: string | null;
  course_id?: string | null;
  agent_accepted?: number;
  created_at?: string | null;
};

type ActivityRow = {
  id: number;
  kind: string;
  body?: string | null;
  created_at?: string;
};

type StatusOpt = { id: string; label: string };

type ChatFilterId = "all" | "approval" | "agent" | "human" | string;

const OPS_TABS: { id: OpsTab; label: string }[] = [
  { id: "chats", label: "Chats" },
  { id: "settings", label: "Settings" },
];

/** Short Studio Sophie label set (not ads CS). */
const FALLBACK_STATUSES: StatusOpt[] = [
  { id: "new", label: "New" },
  { id: "intake", label: "Intake" },
  { id: "awaiting_payment", label: "Awaiting pay" },
  { id: "waiting_client", label: "Waiting" },
  { id: "paid", label: "Paid" },
  { id: "signup", label: "Signup" },
  { id: "verified", label: "Verified" },
  { id: "course_unlocked", label: "Course unlocked" },
  { id: "topped_up", label: "Topped up" },
  { id: "human_takeover", label: "Human" },
  { id: "done", label: "Done" },
  { id: "cold", label: "Cold" },
];

const META_FILTERS: { id: ChatFilterId; label: string }[] = [
  { id: "all", label: "All chats" },
  { id: "approval", label: "Needs approval" },
  { id: "agent", label: "Agent on" },
  { id: "human", label: "Human takeover" },
];

function money(cents: number) {
  return `TT$${(Number(cents || 0) / 100).toFixed(0)}`;
}

function extractQr(result: unknown): string | null {
  const r = result as DeviceStatus & {
    qr?: string | null;
    qrcode?: { base64?: string } | string;
    base64?: string;
  };
  const raw =
    r.qr ||
    (typeof r.qrcode === "string" ? r.qrcode : r.qrcode?.base64) ||
    r.base64 ||
    null;
  if (!raw) return null;
  return raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;
}

function statusLabel(id: string, catalog: StatusOpt[]) {
  return catalog.find((s) => s.id === id)?.label || id.replace(/_/g, " ");
}

function whenLabel(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return String(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function paymentStatusTone(p: PaymentRow): string {
  if (p.owner_status === "approved" || p.status === "confirmed") return "is-ok";
  if (p.owner_status === "rejected" || p.status === "failed") return "is-bad";
  if (p.owner_status === "pending") return "is-wait";
  return "";
}

function Section({
  title,
  icon,
  extras,
  children,
}: {
  title: string;
  icon?: ReactNode;
  extras?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="studio-admin-section">
      <div className="studio-admin-section-head">
        <span className="studio-admin-section-title">
          {icon ? (
            <span className="studio-ops-peer-section-icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          {title}
        </span>
        {extras ? (
          <div className="studio-admin-section-extras">{extras}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

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
  const options = useMemo(
    () => [
      ...META_FILTERS,
      ...statuses.map((s) => ({ id: s.id, label: s.label })),
    ],
    [statuses],
  );
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
    <div className="desk-explorer-type-filter studio-ops-chat-filter" ref={wrapRef}>
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
          className="cursor-dropdown cursor-dropdown-down is-end desk-explorer-type-filter-menu"
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

export function AdminStudioOpsPane() {
  const deviceStatus = useAction(api.studioCsOpsActions.adminDeviceStatus);
  const deviceEnsure = useAction(api.studioCsOpsActions.adminDeviceEnsure);
  const deviceConnect = useAction(api.studioCsOpsActions.adminDeviceConnect);
  const deviceUnlink = useAction(api.studioCsOpsActions.adminDeviceUnlink);
  const setWebhook = useAction(api.studioCsOpsActions.adminSetWebhook);
  const listSessions = useAction(api.studioCsOpsActions.adminListSessions);
  const getSession = useAction(api.studioCsOpsActions.adminGetSession);
  const setAgent = useAction(api.studioCsOpsActions.adminSetAgent);
  const setTakeover = useAction(api.studioCsOpsActions.adminSetTakeover);
  const setFollowup = useAction(api.studioCsOpsActions.adminSetFollowup);
  const setStatus = useAction(api.studioCsOpsActions.adminSetStatus);
  const setNotes = useAction(api.studioCsOpsActions.adminSetNotes);
  const listPayments = useAction(api.studioCsOpsActions.adminListPayments);
  const decidePayment = useAction(api.studioCsOpsActions.adminDecidePayment);
  const serviceStatus = useAction(api.studioCsOpsActions.adminServiceStatus);

  const [tab, setTab] = useState<OpsTab>("chats");
  const bootedRef = useRef(false);
  const [device, setDevice] = useState<DeviceStatus | null>(null);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [pendingPayments, setPendingPayments] = useState<PaymentRow[]>([]);
  const [statusCatalog, setStatusCatalog] =
    useState<StatusOpt[]>(FALLBACK_STATUSES);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [chatFilter, setChatFilter] = useState<ChatFilterId>("all");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    session: SessionRow | null;
    statuses: string[];
    activity: ActivityRow[];
    payments: PaymentRow[];
  } | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [followNote, setFollowNote] = useState("");

  const pendingByPhone = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of pendingPayments) {
      map.set(p.phone, (map.get(p.phone) || 0) + 1);
    }
    return map;
  }, [pendingPayments]);

  const refresh = useCallback(async () => {
    setBusy("refresh");
    try {
      const [d, s, p, st] = await Promise.all([
        deviceStatus({}),
        listSessions({}),
        listPayments({ pending: true }),
        serviceStatus({}).catch(() => null),
      ]);
      const next = d as DeviceStatus;
      setDevice(next);
      if (next.open) setQrSrc(null);
      setSessions(
        ((s as { sessions?: SessionRow[] })?.sessions || []) as SessionRow[],
      );
      setPendingPayments(
        ((p as { payments?: PaymentRow[] })?.payments || []) as PaymentRow[],
      );
      const statuses = (st as { statuses?: StatusOpt[] } | null)?.statuses;
      if (Array.isArray(statuses) && statuses.length) {
        setStatusCatalog(statuses);
      }
      if (!bootedRef.current) {
        bootedRef.current = true;
        if (!next.open) setTab("settings");
      }
    } catch (err) {
      toast.error(friendlyConvexError(err, "Could not load Ops"));
    } finally {
      setBusy(null);
    }
  }, [deviceStatus, listSessions, listPayments, serviceStatus]);

  const loadDetail = useCallback(
    async (phone: string) => {
      setBusy(`detail:${phone}`);
      try {
        const raw = (await getSession({ phone })) as {
          session?: SessionRow;
          statuses?: string[];
          activity?: ActivityRow[];
          payments?: PaymentRow[];
        };
        setDetail({
          session: raw.session || null,
          statuses: raw.statuses || [],
          activity: raw.activity || [],
          payments: raw.payments || [],
        });
        setNotesDraft(raw.session?.notes || "");
        setFollowNote(raw.session?.followup_note || "");
      } catch (err) {
        toast.error(friendlyConvexError(err, "Could not open chat"));
      } finally {
        setBusy(null);
      }
    },
    [getSession],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedPhone) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedPhone);
  }, [selectedPhone, loadDetail]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const statuses = s.statuses || [];
      if (chatFilter === "approval") {
        if (!pendingByPhone.has(s.phone)) return false;
      } else if (chatFilter === "agent") {
        if (!s.agent_enabled) return false;
      } else if (chatFilter === "human") {
        if (!s.human_takeover) return false;
      } else if (chatFilter !== "all") {
        if (!statuses.includes(chatFilter) && s.cs_status !== chatFilter) {
          return false;
        }
      }
      if (!deferredSearch) return true;
      const hay = [
        s.display_name,
        s.phone,
        s.payment_state,
        ...(s.statuses || []),
        s.cs_status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(deferredSearch);
    });
  }, [sessions, chatFilter, deferredSearch, pendingByPhone]);

  async function linkPhone() {
    setBusy("link");
    try {
      await deviceEnsure({});
      try {
        await setWebhook({});
      } catch {
        /* webhook can retry later */
      }
      const result = await deviceConnect({ logoutFirst: false });
      const qr = extractQr(result);
      setQrSrc(qr);
      setDevice((prev) => ({ ...(prev || {}), ...(result as DeviceStatus) }));
      if (!qr) {
        await refresh();
        toast.message("No QR yet — try again in a few seconds");
      }
    } catch (err) {
      toast.error(friendlyConvexError(err, "Could not show QR"));
    } finally {
      setBusy(null);
    }
  }

  async function unlink() {
    if (!confirm("Unlink Sophie’s WhatsApp? You’ll need to scan QR again.")) {
      return;
    }
    setBusy("unlink");
    try {
      await deviceUnlink({});
      setQrSrc(null);
      await refresh();
      toast.success("Unlinked");
    } catch (err) {
      toast.error(friendlyConvexError(err, "Unlink failed"));
    } finally {
      setBusy(null);
    }
  }

  async function afterMutate() {
    await refresh();
    if (selectedPhone) await loadDetail(selectedPhone);
  }

  const linked = Boolean(device?.open);
  const showingQr = Boolean(qrSrc) && !linked;
  const statusClass = linked ? "is-linked" : showingQr ? "is-scan" : "";
  const statusLabelText = linked
    ? "Linked"
    : showingQr
      ? "Scan QR"
      : "Not linked";
  const phoneLine = [
    device?.hint || "+1 868 337-7338",
    linked && device?.profileName ? device.profileName : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const selected =
    detail?.session ||
    sessions.find((s) => s.phone === selectedPhone) ||
    null;
  const selectedStatuses =
    detail?.statuses || selected?.statuses || ([] as string[]);

  return (
    <div className="studio-ops-shell">
      <header className="studio-admin-head">
        <nav className="studio-admin-head-tabs" aria-label="Ops sections">
          {OPS_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`studio-admin-head-tab${tab === item.id ? " is-active" : ""}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              {item.id === "chats" && pendingPayments.length > 0 ? (
                <span className="studio-ops-tab-count" title="Pending approvals">
                  {pendingPayments.length}
                </span>
              ) : item.id === "chats" && sessions.length > 0 ? (
                <span className="studio-ops-tab-count">{sessions.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="studio-admin-section-extras" style={{ paddingRight: 8 }}>
          <button
            type="button"
            className="studio-ops-icon-btn"
            onClick={() => void refresh()}
            disabled={busy === "refresh"}
            aria-label="Refresh"
          >
            {busy === "refresh" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </header>

      <div
        className={`studio-admin-body${tab === "chats" ? " is-ops-chats" : ""}`}
      >
        {tab === "chats" ? (
          <div
            className={`studio-ops-chats${selectedPhone ? " has-selected" : ""}`}
          >
            <aside className="studio-ops-chat-rail" aria-label="Chat list">
              <div className="studio-ops-chat-rail-toolbar">
                <PanelSearchBar
                  value={search}
                  onChange={setSearch}
                  placeholder="Search chats"
                  aria-label="Search chats"
                  end={
                    <OpsChatFilter
                      value={chatFilter}
                      onChange={setChatFilter}
                      statuses={statusCatalog}
                    />
                  }
                />
              </div>
              <ul className="studio-ops-chat-list">
                {filteredSessions.length === 0 ? (
                  <li className="studio-ops-empty-card">
                    <strong>
                      {sessions.length ? "No matches" : "No chats yet"}
                    </strong>
                    <span>
                      {sessions.length
                        ? "Try a different search or filter."
                        : "Sophie’s inbound DMs will show here."}
                    </span>
                  </li>
                ) : (
                  filteredSessions.map((s) => {
                    const labels = (s.statuses || [s.cs_status]).filter(Boolean);
                    const pending = pendingByPhone.get(s.phone) || 0;
                    return (
                      <li key={s.phone}>
                        <button
                          type="button"
                          className={`studio-ops-chat-row${selectedPhone === s.phone ? " is-active" : ""}`}
                          onClick={() => setSelectedPhone(s.phone)}
                        >
                          <div className="studio-ops-chat-row-top">
                            <strong title={s.display_name || s.phone}>
                              {s.display_name || s.phone}
                            </strong>
                            <time>
                              {whenLabel(s.last_inbound_at || s.updated_at)}
                            </time>
                          </div>
                          <div className="studio-ops-chat-row-meta">
                            <span>
                              {s.payment_state || "unpaid"}
                              {s.human_takeover ? " · human" : ""}
                              {!s.agent_enabled ? " · agent off" : ""}
                            </span>
                            {pending > 0 ? (
                              <span className="studio-ops-chip is-wait">
                                {pending} approval
                                {pending === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </div>
                          {labels.length ? (
                            <div className="studio-ops-chat-row-tags">
                              {labels.slice(0, 3).map((id) => (
                                <span key={id} className="studio-ops-chip">
                                  {statusLabel(String(id), statusCatalog)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </aside>

            <section className="studio-ops-chat-main" aria-label="Chat">
              {!selectedPhone || !selected ? (
                <div className="studio-ops-empty-card is-center">
                  <strong>Pick a chat</strong>
                  <span>Select someone from the list to see activity.</span>
                </div>
              ) : (
                <>
                  <header className="studio-ops-chat-main-head">
                    <div>
                      <strong>{selected.display_name || selected.phone}</strong>
                      <span className="studio-muted">
                        {selected.phone}
                        {selected.payment_state
                          ? ` · ${selected.payment_state}`
                          : ""}
                      </span>
                    </div>
                    <div className="studio-ops-chat-main-actions">
                      <button
                        type="button"
                        className="cursor-settings-action"
                        disabled={!!busy}
                        onClick={() =>
                          void setAgent({
                            phone: selected.phone,
                            enabled: !selected.agent_enabled,
                          }).then(afterMutate)
                        }
                      >
                        <Bot className="h-3.5 w-3.5" />
                        {selected.agent_enabled ? "Agent on" : "Agent off"}
                      </button>
                      <button
                        type="button"
                        className="cursor-settings-action"
                        disabled={!!busy}
                        onClick={() =>
                          void setTakeover({
                            phone: selected.phone,
                            on: !selected.human_takeover,
                          }).then(afterMutate)
                        }
                      >
                        {selected.human_takeover ? (
                          <Ban className="h-3.5 w-3.5" />
                        ) : (
                          <UserRoundCheck className="h-3.5 w-3.5" />
                        )}
                        {selected.human_takeover ? "Human" : "Take over"}
                      </button>
                    </div>
                  </header>
                  <div className="studio-ops-activity">
                    {(detail?.activity || []).length === 0 ? (
                      <p className="studio-ops-empty">No activity yet.</p>
                    ) : (
                      <ul className="studio-ops-activity-list">
                        {(detail?.activity || []).map((a) => (
                          <li key={a.id}>
                            <span className="studio-ops-chip">{a.kind}</span>
                            <div>
                              <p>{a.body || "—"}</p>
                              <time>{whenLabel(a.created_at)}</time>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </section>

            <aside
              className="studio-ops-chat-peer"
              aria-label="Chat actions"
              hidden={!selectedPhone || !selected}
            >
              {selectedPhone && selected ? (
                <div className="studio-ops-chat-peer-scroll">
                  <Section
                    title="Notes"
                    icon={<NotebookPen className="h-3.5 w-3.5" />}
                    extras={
                      <button
                        type="button"
                        className="cursor-settings-action"
                        disabled={!!busy}
                        onClick={() =>
                          void setNotes({
                            phone: selected.phone,
                            notes: notesDraft,
                          })
                            .then(afterMutate)
                            .then(() => toast.success("Notes saved"))
                            .catch((err) =>
                              toast.error(
                                friendlyConvexError(err, "Could not save notes"),
                              ),
                            )
                        }
                      >
                        Save
                      </button>
                    }
                  >
                    <textarea
                      className="studio-ops-notes"
                      rows={4}
                      value={notesDraft}
                      placeholder="Internal notes for this lead…"
                      onChange={(e) => setNotesDraft(e.target.value)}
                    />
                  </Section>

                  <Section
                    title="Follow-ups"
                    icon={<Clock className="h-3.5 w-3.5" />}
                  >
                    {selected.followup_at ? (
                      <div className="studio-ops-followup-card">
                        <strong>{whenLabel(selected.followup_at)}</strong>
                        <p className="studio-muted">
                          {selected.followup_note || "Scheduled by Sophie / ops"}
                        </p>
                        <button
                          type="button"
                          className="cursor-settings-action"
                          onClick={() =>
                            void setFollowup({
                              phone: selected.phone,
                              clear: true,
                            }).then(afterMutate)
                          }
                        >
                          Clear
                        </button>
                      </div>
                    ) : (
                      <p className="studio-muted studio-ops-peer-hint">
                        No follow-up scheduled.
                      </p>
                    )}
                    <div className="studio-ops-followup-form">
                      <input
                        type="text"
                        className="studio-ops-input"
                        placeholder="Note for Sophie…"
                        value={followNote}
                        onChange={(e) => setFollowNote(e.target.value)}
                      />
                      <div className="studio-ops-followup-actions">
                        <button
                          type="button"
                          className="cursor-settings-action"
                          onClick={() => {
                            const at = new Date(
                              Date.now() + 60 * 60 * 1000,
                            ).toISOString();
                            void setFollowup({
                              phone: selected.phone,
                              atIso: at,
                              note: followNote || "Check in",
                            }).then(afterMutate);
                          }}
                        >
                          +1h
                        </button>
                        <button
                          type="button"
                          className="cursor-settings-action"
                          onClick={() => {
                            const d = new Date();
                            d.setDate(d.getDate() + 1);
                            d.setHours(10, 0, 0, 0);
                            void setFollowup({
                              phone: selected.phone,
                              atIso: d.toISOString(),
                              note: followNote || "Follow up tomorrow",
                            }).then(afterMutate);
                          }}
                        >
                          Tomorrow
                        </button>
                      </div>
                    </div>
                  </Section>

                  <Section title="Labels" icon={<Tags className="h-3.5 w-3.5" />}>
                    <div className="studio-ops-label-grid">
                      {statusCatalog.map((opt) => {
                        const on = selectedStatuses.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            className={`studio-ops-chip-btn${on ? " is-on" : ""}`}
                            onClick={() =>
                              void setStatus({
                                phone: selected.phone,
                                status: opt.id,
                                action: on ? "remove" : "add",
                              }).then(afterMutate)
                            }
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </Section>

                  <Section
                    title="Payments"
                    icon={<Wallet className="h-3.5 w-3.5" />}
                  >
                    {(detail?.payments || []).length === 0 ? (
                      <p className="studio-muted studio-ops-peer-hint">
                        No payment attempts yet.
                      </p>
                    ) : (
                      <ul className="studio-ops-pay-list">
                        {(detail?.payments || []).map((p) => (
                          <li
                            key={p.id}
                            className={`studio-ops-pay-row ${paymentStatusTone(p)}`}
                          >
                            <div>
                              <strong>
                                {money(p.amount_cents)} · {p.kind}
                              </strong>
                              <div className="studio-muted">
                                {[
                                  p.method || "—",
                                  `status ${p.status}`,
                                  `owner ${p.owner_status}`,
                                  p.course_id ? `course ${p.course_id}` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                              {p.notes ? (
                                <div className="studio-muted">{p.notes}</div>
                              ) : null}
                            </div>
                            {p.owner_status === "pending" &&
                            p.agent_accepted ? (
                              <div className="studio-admin-row-actions">
                                <button
                                  type="button"
                                  className="cursor-settings-action"
                                  onClick={() =>
                                    void decidePayment({
                                      paymentId: p.id,
                                      decision: "approve",
                                    }).then(afterMutate)
                                  }
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="cursor-settings-action"
                                  onClick={() =>
                                    void decidePayment({
                                      paymentId: p.id,
                                      decision: "reject",
                                    }).then(afterMutate)
                                  }
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span
                                className={`studio-ops-chip ${paymentStatusTone(p)}`}
                              >
                                {p.owner_status}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>
                </div>
              ) : null}
            </aside>
          </div>
        ) : (
          <div className="studio-ops-settings">
            <div className="studio-ops-device">
              <div className="studio-ops-device-copy">
                <span className={`studio-ops-status ${statusClass}`}>
                  {statusLabelText}
                </span>
                <p className="studio-ops-device-title">
                  {linked ? "WhatsApp connected" : "Link Sophie’s WhatsApp"}
                </p>
                <p className="studio-ops-device-phone">{phoneLine}</p>
              </div>

              {!linked ? (
                <button
                  type="button"
                  className="studio-ops-primary"
                  disabled={!!busy}
                  onClick={() => void linkPhone()}
                >
                  {busy === "link" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {showingQr ? "Refresh QR" : "Link WhatsApp"}
                </button>
              ) : null}

              {showingQr ? (
                <div className="studio-ops-qr">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrSrc!} alt="Scan with WhatsApp to link Sophie" />
                  <p className="studio-ops-qr-hint">
                    WhatsApp → Linked devices → Scan
                  </p>
                </div>
              ) : null}

              <details className="studio-ops-advanced">
                <summary>Advanced</summary>
                <div className="studio-ops-advanced-body">
                  <button
                    type="button"
                    className="cursor-settings-action"
                    disabled={!!busy}
                    onClick={() => void unlink()}
                  >
                    Unlink
                  </button>
                </div>
              </details>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
