"use client";

import { useAction } from "convex/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";

export type OpsTab = "chats" | "followups" | "approvals" | "settings";

export type DeviceStatus = {
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
  enabled?: boolean;
};

export type SessionRow = {
  phone: string;
  phone_display?: string | null;
  display_name?: string | null;
  client_name?: string | null;
  cs_status?: string;
  statuses?: string[];
  cs_statuses?: string[];
  agent_enabled?: number;
  human_takeover?: number;
  payment_state?: string;
  followup_at?: string | null;
  followup_note?: string | null;
  notes?: string | null;
  last_inbound_at?: string | null;
  last_message_at?: string | null;
  updated_at?: string | null;
  preview?: string | null;
  avatar_url?: string | null;
  badges?: string[];
  working?: { sophie?: boolean; csr?: boolean };
  status?: string | null;
  presence?: {
    state?: "typing" | "online" | "offline" | null;
    typing?: boolean;
    online?: boolean;
  } | null;
  unanswered_count?: number;
  needs_owner?: boolean;
  babysit?: {
    enabled?: boolean;
    pending?: { preview?: string; text?: string; createdAt?: string | null } | null;
  } | null;
  babysit_enabled?: number;
  context_reset_at?: string | null;
};

export function sessionTitle(s: SessionRow | null | undefined) {
  if (!s) return "";
  return (
    String(s.client_name || s.display_name || "").trim() ||
    s.phone_display ||
    s.phone
  );
}

export function sessionAvatarSrc(phone: string) {
  const p = String(phone || "").replace(/\D/g, "");
  return p ? `/api/studio-ops/avatar/${encodeURIComponent(p)}` : null;
}

export type PaymentRow = {
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

export type ActivityRow = {
  id: number;
  kind: string;
  body?: string | null;
  created_at?: string;
};

export type StatusOpt = { id: string; label: string };

export type ChatFilterId =
  | "all"
  | "approval"
  | "agent"
  | "human"
  | "watch"
  | "working"
  | "escalated"
  | "unanswered"
  | string;

export type MediaRow = {
  id: number;
  phone: string;
  path: string;
  role?: string | null;
  created_at?: string;
};

type DetailState = {
  session: SessionRow | null;
  statuses: string[];
  activity: ActivityRow[];
  payments: PaymentRow[];
  media: MediaRow[];
};

export function sessionMatchesFilter(
  s: SessionRow,
  filter: ChatFilterId,
  pendingByPhone: Map<string, number>,
) {
  const statuses = s.statuses || s.cs_statuses || [];
  if (filter === "all") return true;
  if (filter === "approval") return pendingByPhone.has(s.phone);
  if (filter === "agent") return Boolean(s.agent_enabled);
  if (filter === "human") return Boolean(s.human_takeover);
  if (filter === "watch")
    return !s.agent_enabled && !s.human_takeover;
  if (filter === "working")
    return Boolean(
      s.working?.sophie ||
        s.status === "running" ||
        (s.badges || []).includes("sophie"),
    );
  if (filter === "escalated")
    return Boolean(s.needs_owner || (s.badges || []).includes("escalated"));
  if (filter === "unanswered") return Number(s.unanswered_count || 0) > 0;
  return statuses.includes(filter) || s.cs_status === filter;
}

export const FALLBACK_STATUSES: StatusOpt[] = [
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

export function extractQr(result: unknown): string | null {
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

export function statusLabel(id: string, catalog: StatusOpt[]) {
  return catalog.find((s) => s.id === id)?.label || id.replace(/_/g, " ");
}

export function whenLabel(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return String(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function money(cents: number) {
  return `TT$${(Number(cents || 0) / 100).toFixed(0)}`;
}

type OpsContextValue = {
  active: boolean;
  opsTab: OpsTab;
  setOpsTab: (tab: OpsTab) => void;
  device: DeviceStatus | null;
  qrSrc: string | null;
  setQrSrc: (src: string | null) => void;
  sessions: SessionRow[];
  pendingPayments: PaymentRow[];
  pendingByPhone: Map<string, number>;
  statusCatalog: StatusOpt[];
  busy: string | null;
  setBusy: (v: string | null) => void;
  search: string;
  setSearch: (v: string) => void;
  chatFilter: ChatFilterId;
  setChatFilter: (v: ChatFilterId) => void;
  selectedPhone: string | null;
  setSelectedPhone: (phone: string | null) => void;
  detail: DetailState | null;
  filteredSessions: SessionRow[];
  refresh: (opts?: { quiet?: boolean }) => Promise<void>;
  loadDetail: (phone: string, opts?: { quiet?: boolean }) => Promise<void>;
  afterMutate: () => Promise<void>;
  linkPhone: () => Promise<void>;
  unlink: () => Promise<void>;
  setAgent: (args: { phone: string; enabled: boolean }) => Promise<unknown>;
  setTakeover: (args: { phone: string; on: boolean }) => Promise<unknown>;
  resetChat: (args: { phone: string }) => Promise<unknown>;
  setStatus: (args: {
    phone: string;
    status: string;
    action?: "add" | "remove" | "set";
  }) => Promise<unknown>;
  decidePayment: (args: {
    paymentId: number;
    decision: "approve" | "reject";
  }) => Promise<unknown>;
  deviceEnsure: () => Promise<unknown>;
  deviceConnect: (args: { logoutFirst?: boolean }) => Promise<unknown>;
  deviceUnlink: () => Promise<unknown>;
  setWebhook: () => Promise<unknown>;
  threadEpoch: number;
  /** Bumps when SSE says this open chat got a new WhatsApp message. */
  threadTick: number;
  filterCounts: Record<string, number>;
  serviceEnabled: boolean;
  followups: SessionRow[];
  loadFollowups: () => Promise<void>;
  setNotes: (args: { phone: string; notes: string }) => Promise<unknown>;
  setFollowup: (args: {
    phone: string;
    atIso?: string;
    note?: string;
    clear?: boolean;
  }) => Promise<unknown>;
  nudge: (args: { phone: string; text?: string }) => Promise<unknown>;
  stopAgent: (args: { phone: string }) => Promise<unknown>;
  setBabysit: (args: { phone: string; enabled: boolean }) => Promise<unknown>;
  approveBabysit: (args: { phone: string }) => Promise<unknown>;
  discardBabysit: (args: { phone: string }) => Promise<unknown>;
  escalate: (args: {
    phone: string;
    on?: boolean;
    message?: string;
  }) => Promise<unknown>;
  startChat: (args: {
    phone: string;
    text?: string;
    displayName?: string;
  }) => Promise<unknown>;
  searchOps: (args: { q: string }) => Promise<unknown>;
  getSettings: () => Promise<unknown>;
  setSettings: (args: {
    autoEnableAgentNewChats?: boolean;
    defaultFollowupDays?: number;
  }) => Promise<unknown>;
};

const OpsContext = createContext<OpsContextValue | null>(null);

export function AdminStudioOpsProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const deviceStatus = useAction(api.studioCsOpsActions.adminDeviceStatus);
  const deviceEnsure = useAction(api.studioCsOpsActions.adminDeviceEnsure);
  const deviceConnect = useAction(api.studioCsOpsActions.adminDeviceConnect);
  const deviceUnlink = useAction(api.studioCsOpsActions.adminDeviceUnlink);
  const setWebhook = useAction(api.studioCsOpsActions.adminSetWebhook);
  const listSessions = useAction(api.studioCsOpsActions.adminListSessions);
  const getSession = useAction(api.studioCsOpsActions.adminGetSession);
  const setAgentAction = useAction(api.studioCsOpsActions.adminSetAgent);
  const setTakeoverAction = useAction(api.studioCsOpsActions.adminSetTakeover);
  const resetChatAction = useAction(api.studioCsOpsActions.adminResetChat);
  const subscribePresenceAction = useAction(
    api.studioCsOpsActions.adminSubscribePresence,
  );
  const setStatusAction = useAction(api.studioCsOpsActions.adminSetStatus);
  const listPayments = useAction(api.studioCsOpsActions.adminListPayments);
  const decidePaymentAction = useAction(
    api.studioCsOpsActions.adminDecidePayment,
  );
  const serviceStatus = useAction(api.studioCsOpsActions.adminServiceStatus);
  const setNotesAction = useAction(api.studioCsOpsActions.adminSetNotes);
  const setFollowupAction = useAction(api.studioCsOpsActions.adminSetFollowup);
  const nudgeAction = useAction(api.studioCsOpsActions.adminNudge);
  const stopAction = useAction(api.studioCsOpsActions.adminStop);
  const setBabysitAction = useAction(api.studioCsOpsActions.adminSetBabysit);
  const approveBabysitAction = useAction(
    api.studioCsOpsActions.adminApproveBabysit,
  );
  const discardBabysitAction = useAction(
    api.studioCsOpsActions.adminDiscardBabysit,
  );
  const escalateAction = useAction(api.studioCsOpsActions.adminEscalate);
  const startChatAction = useAction(api.studioCsOpsActions.adminStartChat);
  const searchOpsAction = useAction(api.studioCsOpsActions.adminSearch);
  const listFollowupsAction = useAction(
    api.studioCsOpsActions.adminListFollowups,
  );
  const getSettingsAction = useAction(api.studioCsOpsActions.adminGetSettings);
  const setSettingsAction = useAction(api.studioCsOpsActions.adminSetSettings);

  const [opsTab, setOpsTab] = useState<OpsTab>("chats");
  const bootedRef = useRef(false);
  const [device, setDevice] = useState<DeviceStatus | null>(null);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [pendingPayments, setPendingPayments] = useState<PaymentRow[]>([]);
  const [followups, setFollowups] = useState<SessionRow[]>([]);
  const [serviceEnabled, setServiceEnabled] = useState(true);
  const [statusCatalog, setStatusCatalog] =
    useState<StatusOpt[]>(FALLBACK_STATUSES);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [chatFilter, setChatFilter] = useState<ChatFilterId>("all");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [threadEpoch, setThreadEpoch] = useState(0);
  const [threadTick, setThreadTick] = useState(0);
  const selectedPhoneRef = useRef<string | null>(null);
  selectedPhoneRef.current = selectedPhone;

  const pendingByPhone = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of pendingPayments) {
      map.set(p.phone, (map.get(p.phone) || 0) + 1);
    }
    return map;
  }, [pendingPayments]);

  const refresh = useCallback(async (opts?: { quiet?: boolean }) => {
    const quiet = Boolean(opts?.quiet);
    if (!quiet) setBusy("refresh");
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
      const nextSessions = ((s as { sessions?: SessionRow[] })?.sessions ||
        []) as SessionRow[];
      setSessions(nextSessions);
      setPendingPayments(
        ((p as { payments?: PaymentRow[] })?.payments || []) as PaymentRow[],
      );
      const statuses = (st as { statuses?: StatusOpt[]; enabled?: boolean } | null)
        ?.statuses;
      if (Array.isArray(statuses) && statuses.length) {
        setStatusCatalog(statuses);
      }
      if (st && typeof st === "object" && "enabled" in st) {
        setServiceEnabled((st as { enabled?: boolean }).enabled !== false);
      }
      const sel = selectedPhoneRef.current;
      if (sel) {
        const row = nextSessions.find((x) => x.phone === sel);
        if (row) {
          setDetail((prev) =>
            prev
              ? {
                  ...prev,
                  session: { ...(prev.session || {}), ...row },
                  statuses: row.statuses || prev.statuses,
                }
              : prev,
          );
        }
      }
      if (!bootedRef.current) {
        bootedRef.current = true;
        if (!next.open) setOpsTab("settings");
      }
    } catch (err) {
      if (!quiet) toast.error(friendlyConvexError(err, "Could not load Ops"));
    } finally {
      if (!quiet) setBusy(null);
    }
  }, [deviceStatus, listSessions, listPayments, serviceStatus]);

  const loadDetail = useCallback(
    async (phone: string, opts?: { quiet?: boolean }) => {
      const quiet = Boolean(opts?.quiet);
      if (!quiet) setBusy(`detail:${phone}`);
      try {
        const raw = (await getSession({ phone })) as {
          session?: SessionRow;
          statuses?: string[];
          activity?: ActivityRow[];
          payments?: PaymentRow[];
          media?: MediaRow[];
        };
        setDetail({
          session: raw.session || null,
          statuses: raw.statuses || [],
          activity: raw.activity || [],
          payments: raw.payments || [],
          media: raw.media || [],
        });
      } catch (err) {
        if (!quiet) {
          toast.error(friendlyConvexError(err, "Could not open chat"));
        }
      } finally {
        if (!quiet) setBusy(null);
      }
    },
    [getSession],
  );

  useEffect(() => {
    if (!active) return;
    void refresh();
  }, [active, refresh]);

  // Slow fallback poll — SSE is primary for live updates.
  useEffect(() => {
    if (!active || opsTab !== "chats") return;
    const id = window.setInterval(() => {
      void refresh({ quiet: true });
    }, 45_000);
    return () => window.clearInterval(id);
  }, [active, opsTab, refresh]);

  // Push-invalidate via Sophie Ops SSE.
  useEffect(() => {
    if (!active || opsTab !== "chats") return;
    let closed = false;
    let es: EventSource | null = null;
    let retryTimer: number | null = null;

    const connect = () => {
      if (closed) return;
      es = new EventSource("/api/studio-ops/events");
      es.onmessage = (ev) => {
        let data: {
          type?: string;
          phone?: string;
          on?: boolean;
          state?: string;
          presence?: SessionRow["presence"];
        } | null = null;
        try {
          data = JSON.parse(String(ev.data || "{}"));
        } catch {
          return;
        }
        if (!data?.type) return;
        const phone = String(data.phone || "").replace(/\D/g, "");
        if (data.type === "presence" && phone) {
          const presence: SessionRow["presence"] = data.presence || {
            state:
              data.state === "typing" ||
              data.state === "online" ||
              data.state === "offline"
                ? data.state
                : null,
            typing: data.state === "typing",
            online: data.state === "typing" || data.state === "online",
          };
          setSessions((prev) =>
            prev.map((s) => (s.phone === phone ? { ...s, presence } : s)),
          );
          if (selectedPhoneRef.current === phone) {
            setDetail((prev) =>
              prev?.session
                ? {
                    ...prev,
                    session: { ...prev.session, presence },
                  }
                : prev,
            );
          }
          return;
        }
        if (data.type === "working" && phone) {
          const on = data.on !== false;
          setSessions((prev) =>
            prev.map((s) => {
              if (s.phone !== phone) return s;
              const badges = (s.badges || []).filter((b) => b !== "sophie");
              if (on) badges.unshift("sophie");
              return {
                ...s,
                working: { ...(s.working || {}), sophie: on },
                status: on ? "running" : "idle",
                badges,
              };
            }),
          );
          if (selectedPhoneRef.current === phone) {
            setDetail((prev) =>
              prev?.session
                ? {
                    ...prev,
                    session: {
                      ...prev.session,
                      working: {
                        ...(prev.session.working || {}),
                        sophie: on,
                      },
                      status: on ? "running" : "idle",
                    },
                  }
                : prev,
            );
          }
          return;
        }
        if (data.type === "message" && phone) {
          void refresh({ quiet: true });
          if (selectedPhoneRef.current === phone) {
            setThreadTick((n) => n + 1);
          }
          if (
            typeof document !== "undefined" &&
            document.visibilityState === "hidden" &&
            typeof Notification !== "undefined" &&
            Notification.permission === "granted"
          ) {
            try {
              new Notification("Sophie Ops", {
                body: "New WhatsApp message",
                tag: `studio-ops-${phone}`,
              });
            } catch {
              /* ignore */
            }
          }
        }
        if (data.type === "babysit" && phone) {
          void refresh({ quiet: true });
        }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (closed) return;
        if (retryTimer) window.clearTimeout(retryTimer);
        retryTimer = window.setTimeout(connect, 2500);
      };
    };

    connect();
    return () => {
      closed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      es?.close();
    };
  }, [active, opsTab, refresh]);

  // Baileys presence subscribe while a chat is open (Desk 25s pattern).
  useEffect(() => {
    if (!active || opsTab !== "chats" || !selectedPhone) return;
    const phone = selectedPhone;
    void subscribePresenceAction({ phone }).catch(() => null);
    const id = window.setInterval(() => {
      void subscribePresenceAction({ phone }).catch(() => null);
    }, 25_000);
    return () => window.clearInterval(id);
  }, [active, opsTab, selectedPhone, subscribePresenceAction]);

  useEffect(() => {
    if (!active || !selectedPhone) {
      if (!selectedPhone) setDetail(null);
      return;
    }
    void loadDetail(selectedPhone);
  }, [active, selectedPhone, loadDetail]);

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (!sessionMatchesFilter(s, chatFilter, pendingByPhone)) return false;
      if (!q) return true;
      const hay = [
        s.client_name,
        s.display_name,
        s.phone,
        s.phone_display,
        s.preview,
        s.payment_state,
        ...(s.statuses || s.cs_statuses || []),
        s.cs_status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sessions, chatFilter, search, pendingByPhone]);

  const filterCounts = useMemo(() => {
    const ids = [
      "all",
      "unanswered",
      "working",
      "watch",
      "agent",
      "human",
      "approval",
      "escalated",
      ...statusCatalog.map((s) => s.id),
    ];
    const out: Record<string, number> = {};
    for (const id of ids) {
      out[id] = sessions.filter((s) =>
        sessionMatchesFilter(s, id, pendingByPhone),
      ).length;
    }
    return out;
  }, [sessions, pendingByPhone, statusCatalog]);

  const loadFollowups = useCallback(async () => {
    try {
      const raw = (await listFollowupsAction({})) as {
        followups?: SessionRow[];
      };
      setFollowups(raw.followups || []);
    } catch (err) {
      toast.error(friendlyConvexError(err, "Could not load follow-ups"));
    }
  }, [listFollowupsAction]);

  useEffect(() => {
    if (!active || opsTab !== "followups") return;
    void loadFollowups();
  }, [active, opsTab, loadFollowups]);

  const afterMutate = useCallback(async () => {
    await refresh();
    if (selectedPhone) await loadDetail(selectedPhone);
    if (opsTab === "followups") await loadFollowups();
  }, [refresh, loadDetail, selectedPhone, opsTab, loadFollowups]);

  const linkPhone = useCallback(async () => {
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
  }, [deviceEnsure, setWebhook, deviceConnect, refresh]);

  const unlink = useCallback(async () => {
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
  }, [deviceUnlink, refresh]);

  const resetChat = useCallback(
    async ({ phone }: { phone: string }) => {
      const p = String(phone || "").replace(/\D/g, "");
      if (!p) throw new Error("phone required");
      if (p !== "18684762078") {
        toast.error("Reset is only available for your test number");
        throw new Error("reset_not_allowed");
      }
      setBusy(`reset:${p}`);
      try {
        const res = (await resetChatAction({ phone: p })) as {
          ok?: boolean;
          error?: string;
        };
        if (res?.ok === false) {
          throw new Error(res.error || "Reset failed");
        }
        setSelectedPhone(null);
        setDetail(null);
        setThreadEpoch((n) => n + 1);
        await afterMutate();
        toast.success("Customer deleted from Ops");
        return res;
      } catch (err) {
        toast.error(friendlyConvexError(err, "Could not reset chat"));
        throw err;
      } finally {
        setBusy(null);
      }
    },
    [resetChatAction, afterMutate],
  );

  const value = useMemo<OpsContextValue>(
    () => ({
      active,
      opsTab,
      setOpsTab,
      device,
      qrSrc,
      setQrSrc,
      sessions,
      pendingPayments,
      pendingByPhone,
      statusCatalog,
      busy,
      setBusy,
      search,
      setSearch,
      chatFilter,
      setChatFilter,
      selectedPhone,
      setSelectedPhone,
      detail,
      filteredSessions,
      refresh,
      loadDetail,
      afterMutate,
      linkPhone,
      unlink,
      setAgent: setAgentAction,
      setTakeover: setTakeoverAction,
      resetChat,
      setStatus: setStatusAction,
      decidePayment: decidePaymentAction,
      deviceEnsure,
      deviceConnect,
      deviceUnlink,
      setWebhook,
      threadEpoch,
      threadTick,
      filterCounts,
      serviceEnabled,
      followups,
      loadFollowups,
      setNotes: setNotesAction,
      setFollowup: setFollowupAction,
      nudge: nudgeAction,
      stopAgent: stopAction,
      setBabysit: setBabysitAction,
      approveBabysit: approveBabysitAction,
      discardBabysit: discardBabysitAction,
      escalate: escalateAction,
      startChat: startChatAction,
      searchOps: searchOpsAction,
      getSettings: getSettingsAction,
      setSettings: setSettingsAction,
    }),
    [
      active,
      opsTab,
      device,
      qrSrc,
      sessions,
      pendingPayments,
      pendingByPhone,
      statusCatalog,
      busy,
      search,
      chatFilter,
      selectedPhone,
      detail,
      filteredSessions,
      refresh,
      loadDetail,
      afterMutate,
      linkPhone,
      unlink,
      setAgentAction,
      setTakeoverAction,
      resetChat,
      setStatusAction,
      decidePaymentAction,
      deviceEnsure,
      deviceConnect,
      deviceUnlink,
      setWebhook,
      threadEpoch,
      threadTick,
      filterCounts,
      serviceEnabled,
      followups,
      loadFollowups,
      setNotesAction,
      setFollowupAction,
      nudgeAction,
      stopAction,
      setBabysitAction,
      approveBabysitAction,
      discardBabysitAction,
      escalateAction,
      startChatAction,
      searchOpsAction,
      getSettingsAction,
      setSettingsAction,
    ],
  );

  return <OpsContext.Provider value={value}>{children}</OpsContext.Provider>;
}

export function useAdminStudioOps() {
  const ctx = useContext(OpsContext);
  if (!ctx) {
    throw new Error("useAdminStudioOps requires AdminStudioOpsProvider");
  }
  return ctx;
}

export function useAdminStudioOpsOptional() {
  return useContext(OpsContext);
}
