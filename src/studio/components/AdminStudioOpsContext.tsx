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
  notesDraft: string;
  setNotesDraft: (v: string) => void;
  followNote: string;
  setFollowNote: (v: string) => void;
  filteredSessions: SessionRow[];
  refresh: () => Promise<void>;
  loadDetail: (phone: string) => Promise<void>;
  afterMutate: () => Promise<void>;
  linkPhone: () => Promise<void>;
  unlink: () => Promise<void>;
  setAgent: (args: { phone: string; enabled: boolean }) => Promise<unknown>;
  setTakeover: (args: { phone: string; on: boolean }) => Promise<unknown>;
  setFollowup: (args: {
    phone: string;
    atIso?: string;
    note?: string;
    clear?: boolean;
  }) => Promise<unknown>;
  setStatus: (args: {
    phone: string;
    status: string;
    action?: "add" | "remove" | "set";
  }) => Promise<unknown>;
  setNotes: (args: { phone: string; notes: string }) => Promise<unknown>;
  decidePayment: (args: {
    paymentId: number;
    decision: "approve" | "reject";
  }) => Promise<unknown>;
  deviceEnsure: () => Promise<unknown>;
  deviceConnect: (args: { logoutFirst?: boolean }) => Promise<unknown>;
  deviceUnlink: () => Promise<unknown>;
  setWebhook: () => Promise<unknown>;
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
  const setFollowupAction = useAction(api.studioCsOpsActions.adminSetFollowup);
  const setStatusAction = useAction(api.studioCsOpsActions.adminSetStatus);
  const setNotesAction = useAction(api.studioCsOpsActions.adminSetNotes);
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
    if (!active) return;
    void refresh();
  }, [active, refresh]);

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
        s.display_name,
        s.phone,
        s.payment_state,
        ...(s.statuses || []),
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
      notesDraft,
      setNotesDraft,
      followNote,
      setFollowNote,
      filteredSessions,
      refresh,
      loadDetail,
      afterMutate,
      linkPhone,
      unlink,
      setAgent: setAgentAction,
      setTakeover: setTakeoverAction,
      setFollowup: setFollowupAction,
      setStatus: setStatusAction,
      setNotes: setNotesAction,
      decidePayment: decidePaymentAction,
      deviceEnsure,
      deviceConnect,
      deviceUnlink,
      setWebhook,
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
      notesDraft,
      followNote,
      filteredSessions,
      refresh,
      loadDetail,
      afterMutate,
      linkPhone,
      unlink,
      setAgentAction,
      setTakeoverAction,
      setFollowupAction,
      setStatusAction,
      setNotesAction,
      decidePaymentAction,
      deviceEnsure,
      deviceConnect,
      deviceUnlink,
      setWebhook,
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
