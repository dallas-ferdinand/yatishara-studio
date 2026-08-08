"use client";

import { useAction } from "convex/react";
import {
  Loader2,
  RefreshCw,
  Smartphone,
  UserRoundCheck,
  Bot,
  Ban,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";

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
  last_inbound_at?: string | null;
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
};

function money(cents: number) {
  return `TT$${(Number(cents || 0) / 100).toFixed(0)}`;
}

export function AdminStudioOpsPane() {
  const deviceStatus = useAction(api.studioCsOpsActions.adminDeviceStatus);
  const deviceEnsure = useAction(api.studioCsOpsActions.adminDeviceEnsure);
  const deviceConnect = useAction(api.studioCsOpsActions.adminDeviceConnect);
  const deviceUnlink = useAction(api.studioCsOpsActions.adminDeviceUnlink);
  const setWebhook = useAction(api.studioCsOpsActions.adminSetWebhook);
  const listSessions = useAction(api.studioCsOpsActions.adminListSessions);
  const setAgent = useAction(api.studioCsOpsActions.adminSetAgent);
  const setTakeover = useAction(api.studioCsOpsActions.adminSetTakeover);
  const listPayments = useAction(api.studioCsOpsActions.adminListPayments);
  const decidePayment = useAction(api.studioCsOpsActions.adminDecidePayment);
  const serviceStatus = useAction(api.studioCsOpsActions.adminServiceStatus);

  const [device, setDevice] = useState<DeviceStatus | null>(null);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [svc, setSvc] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy("refresh");
    try {
      const [d, s, p, st] = await Promise.all([
        deviceStatus({}),
        listSessions({}),
        listPayments({ pending: true }),
        serviceStatus({}),
      ]);
      setDevice(d as DeviceStatus);
      setSessions(((s as { sessions?: SessionRow[] })?.sessions || []) as SessionRow[]);
      setPayments(((p as { payments?: PaymentRow[] })?.payments || []) as PaymentRow[]);
      setSvc(st as Record<string, unknown>);
    } catch (err) {
      toast.error(friendlyConvexError(err, "Could not load Studio Ops"));
    } finally {
      setBusy(null);
    }
  }, [deviceStatus, listSessions, listPayments, serviceStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try {
      const result = await fn();
      if (label === "connect") {
        const r = result as DeviceStatus & {
          qrcode?: { base64?: string };
          base64?: string;
        };
        const b64 =
          (typeof r.qrcode === "string" ? r.qrcode : r.qrcode?.base64) ||
          r.base64 ||
          null;
        setQrSrc(b64 ? (b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`) : null);
        setDevice((prev) => ({ ...(prev || {}), ...(r as DeviceStatus) }));
      } else {
        await refresh();
      }
      toast.success(`${label} done`);
    } catch (err) {
      toast.error(friendlyConvexError(err, `${label} failed`));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="studio-admin-stack">
      <section className="studio-admin-section">
        <div className="studio-admin-section-head">
          <span className="studio-admin-section-title">
            <Smartphone className="h-3.5 w-3.5" aria-hidden /> Sophie device
          </span>
          <button
            type="button"
            className="studio-btn-ghost"
            onClick={() => void refresh()}
            disabled={busy === "refresh"}
          >
            {busy === "refresh" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </button>
        </div>
        <p className="studio-settings-empty" style={{ margin: "0 0 12px" }}>
          Evolution instance <code>yatishara-studio</code> · bot{" "}
          <code>18683377338</code> · agent Sophie. Isolated from ads CS (:8794).
          Reconnect uses status/QR only — do not wipe a live session unless you
          deliberately choose unlink.
        </p>
        <div className="studio-admin-grid-large">
          <div className="studio-admin-metric">
            <div className="studio-admin-metric-label">Connection</div>
            <div className="studio-admin-metric-value">
              {device?.status || (svc ? "service up" : "…")}
            </div>
            <div className="studio-admin-metric-body">
              {device?.open
                ? `Linked${device.phone ? ` · ${device.phone}` : ""}${
                    device.profileName ? ` · ${device.profileName}` : ""
                  }`
                : device?.connecting
                  ? "Connecting — scan QR"
                  : "Not open — track + connect"}
            </div>
          </div>
          <div className="studio-admin-metric">
            <div className="studio-admin-metric-label">Service</div>
            <div className="studio-admin-metric-value">
              {svc?.enabled === false ? "Paused" : "Live"}
            </div>
            <div className="studio-admin-metric-body">
              Port {(svc?.port as number) || 8795} · {String(svc?.instance || "yatishara-studio")}
            </div>
          </div>
        </div>
        <div className="studio-admin-setup-grid" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="studio-btn"
            disabled={!!busy}
            onClick={() => void run("ensure", () => deviceEnsure({}))}
          >
            Track instance
          </button>
          <button
            type="button"
            className="studio-btn"
            disabled={!!busy}
            onClick={() => void run("connect", () => deviceConnect({ logoutFirst: false }))}
          >
            Show QR / connect
          </button>
          <button
            type="button"
            className="studio-btn"
            disabled={!!busy}
            onClick={() => void run("webhook", () => setWebhook({}))}
          >
            Set webhook
          </button>
          <button
            type="button"
            className="studio-btn-ghost"
            disabled={!!busy}
            onClick={() => {
              if (!confirm("Unlink Sophie WA session? You will need to scan QR again.")) return;
              void run("unlink", () => deviceUnlink({}));
            }}
          >
            Unlink device
          </button>
        </div>
        {qrSrc ? (
          <div style={{ marginTop: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt="Scan with WhatsApp to link Sophie"
              width={240}
              height={240}
              style={{ borderRadius: 8, background: "#fff" }}
            />
          </div>
        ) : null}
      </section>

      <section className="studio-admin-section">
        <div className="studio-admin-section-head">
          <span className="studio-admin-section-title">Sessions</span>
        </div>
        {sessions.length === 0 ? (
          <p className="studio-settings-empty">No chats yet.</p>
        ) : (
          <ul className="studio-admin-list">
            {sessions.map((s) => (
              <li key={s.phone} className="studio-admin-list-row">
                <div>
                  <strong>{s.display_name || s.phone}</strong>
                  <div className="studio-muted">
                    {s.phone} · {(s.statuses || [s.cs_status]).filter(Boolean).join(", ")} ·{" "}
                    {s.payment_state || "unpaid"}
                    {s.followup_at ? ` · follow-up ${s.followup_at}` : ""}
                  </div>
                </div>
                <div className="studio-admin-row-actions">
                  <button
                    type="button"
                    className="studio-btn-ghost"
                    title="Agent on/off"
                    onClick={() =>
                      void run("agent", () =>
                        setAgent({
                          phone: s.phone,
                          enabled: !s.agent_enabled,
                        }),
                      )
                    }
                  >
                    <Bot className="h-3.5 w-3.5" />
                    {s.agent_enabled ? "Agent on" : "Agent off"}
                  </button>
                  <button
                    type="button"
                    className="studio-btn-ghost"
                    title="Human takeover"
                    onClick={() =>
                      void run("takeover", () =>
                        setTakeover({
                          phone: s.phone,
                          on: !s.human_takeover,
                        }),
                      )
                    }
                  >
                    {s.human_takeover ? (
                      <Ban className="h-3.5 w-3.5" />
                    ) : (
                      <UserRoundCheck className="h-3.5 w-3.5" />
                    )}
                    {s.human_takeover ? "Takeover" : "Take over"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="studio-admin-section">
        <div className="studio-admin-section-head">
          <span className="studio-admin-section-title">Payment approvals</span>
        </div>
        {payments.length === 0 ? (
          <p className="studio-settings-empty">No pending soft-accepts.</p>
        ) : (
          <ul className="studio-admin-list">
            {payments.map((p) => (
              <li key={p.id} className="studio-admin-list-row">
                <div>
                  <strong>
                    #{p.id} {money(p.amount_cents)} · {p.kind}
                  </strong>
                  <div className="studio-muted">
                    {p.phone} · {p.method || "?"} · {p.status} · owner {p.owner_status}
                    {p.notes ? ` · ${p.notes}` : ""}
                  </div>
                </div>
                <div className="studio-admin-row-actions">
                  <button
                    type="button"
                    className="studio-btn"
                    onClick={() =>
                      void run("approve", () =>
                        decidePayment({ paymentId: p.id, decision: "approve" }),
                      )
                    }
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="studio-btn-ghost"
                    onClick={() =>
                      void run("reject", () =>
                        decidePayment({ paymentId: p.id, decision: "reject" }),
                      )
                    }
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
