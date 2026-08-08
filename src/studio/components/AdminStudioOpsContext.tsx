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

export type OpsTab = "chats" | "settings";

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

export type ChatFilterId = "all" | "approval" | "agent" | "human" | string;

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

type DetailState = {
  session: SessionRow | null;
  statuses: string[];
  activity: ActivityRow[];
  payments: PaymentRow[];
};

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
  refresh: () => Promise<void>;
  loadDetail: (phone: string) => Promise<void>;
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
  const setStatusAction = useAction(api.studioCsOpsActions.adminSetStatus);
  const listPayments = useAction(api.studioCsOpsActions.adminListPayments);
  const decidePaymentAction = useAction(
    api.studioCsOpsActions.adminDecidePayment,
  );
  const serviceStatus = useAction(api.studioCsOpsActions.adminServiceStatus);

  const [opsTab, setOpsTab] = useState<OpsTab>("chats");
  const bootedRef = useRef(false);
  const [device, setDevice] = useState<DeviceStatus | null>(null);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [pendingPayments, setPendingPayments] = useState<PaymentRow[]>([]);
  const [statusCatalog, setStatusCatalog] =
    useState<StatusOpt[]>(FALLBACK_STATUSES);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [chatFilter, setChatFilter] = useState<ChatFilterId>("all");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [threadEpoch, setThreadEpoch] = useState(0);

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
        if (!next.open) setOpsTab("settings");
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
      } catch (err) {
        toast.error(friendlyConvexError(err, "Could not open chat"));
      } finally {
        setBusy(null);
      }
    },
    [getSession],
  );

  useEffect(() => {
    if (!active) return;
    void refresh();
  }, [active, refresh]);

  // Poll while Sophie is running so CSR-style working badges clear (Desk parity).
  useEffect(() => {
    if (!active || opsTab !== "chats") return;
    const anyRunning = sessions.some(
      (s) =>
        s.working?.sophie ||
        s.status === "running" ||
        (s.badges || []).includes("sophie"),
    );
    if (!anyRunning) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 4000);
    return () => window.clearInterval(id);
  }, [active, opsTab, sessions, refresh]);

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

  const afterMutate = useCallback(async () => {
    await refresh();
    if (selectedPhone) await loadDetail(selectedPhone);
  }, [refresh, loadDetail, selectedPhone]);

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
      setBusy(`reset:${p}`);
      try {
        const res = (await resetChatAction({ phone: p })) as {
          ok?: boolean;
          error?: string;
        };
        if (res?.ok === false) {
          throw new Error(res.error || "Reset failed");
        }
        setThreadEpoch((n) => n + 1);
        await afterMutate();
        toast.success("Chat context reset");
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
