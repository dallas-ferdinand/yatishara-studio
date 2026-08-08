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

function extractQr(result: unknown): string | null {
  const r = result as DeviceStatus & {
    qrcode?: { base64?: string } | string;
    base64?: string;
  };
  const b64 =
    (typeof r.qrcode === "string" ? r.qrcode : r.qrcode?.base64) ||
    r.base64 ||
    null;
  if (!b64) return null;
  return b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`;
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

  const [device, setDevice] = useState<DeviceStatus | null>(null);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy("refresh");
    try {
      const [d, s, p] = await Promise.all([
        deviceStatus({}),
        listSessions({}),
        listPayments({ pending: true }),
      ]);
      const next = d as DeviceStatus;
      setDevice(next);
      if (next.open) setQrSrc(null);
      setSessions(
        ((s as { sessions?: SessionRow[] })?.sessions || []) as SessionRow[],
      );
      setPayments(
        ((p as { payments?: PaymentRow[] })?.payments || []) as PaymentRow[],
      );
    } catch (err) {
      toast.error(friendlyConvexError(err, "Could not load Ops"));
    } finally {
      setBusy(null);
    }
  }, [deviceStatus, listSessions, listPayments]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
        toast.message("No QR yet — refresh in a few seconds");
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

  const linked = Boolean(device?.open);
  const statusLabel = linked
    ? "Linked"
    : device?.connecting || qrSrc
      ? "Scan QR"
      : "Not linked";

  return (
    <div className="studio-admin-stack">
      <section className="studio-admin-section">
        <div className="studio-admin-section-head">
          <span className="studio-admin-section-title">
            <Smartphone className="h-3.5 w-3.5" aria-hidden /> Sophie
          </span>
          <div className="studio-admin-section-extras">
            <button
              type="button"
              className="cursor-settings-action"
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
        </div>

        <div className="studio-admin-list-row" style={{ alignItems: "center" }}>
          <div>
            <strong>{statusLabel}</strong>
            <div className="studio-muted">
              {device?.hint || "+1 868 337-7338"}
              {linked && device?.profileName ? ` · ${device.profileName}` : ""}
            </div>
          </div>
          <div className="studio-admin-row-actions">
            {!linked ? (
              <button
                type="button"
                className="cursor-settings-action"
                disabled={!!busy}
                onClick={() => void linkPhone()}
              >
                {busy === "link" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {qrSrc ? "Refresh QR" : "Link WhatsApp"}
              </button>
            ) : null}
          </div>
        </div>

        {qrSrc && !linked ? (
          <div style={{ marginTop: 4 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt="Scan with WhatsApp to link Sophie"
              width={220}
              height={220}
              style={{ borderRadius: 8, background: "#fff" }}
            />
          </div>
        ) : null}

        <details>
          <summary className="studio-settings-empty" style={{ cursor: "pointer" }}>
            Advanced
          </summary>
          <div className="studio-admin-row-actions" style={{ marginTop: 8 }}>
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
      </section>

      {sessions.length > 0 ? (
        <section className="studio-admin-section">
          <div className="studio-admin-section-head">
            <span className="studio-admin-section-title">Sessions</span>
          </div>
          <ul className="studio-admin-list">
            {sessions.map((s) => (
              <li key={s.phone} className="studio-admin-list-row">
                <div>
                  <strong>{s.display_name || s.phone}</strong>
                  <div className="studio-muted">
                    {(s.statuses || [s.cs_status]).filter(Boolean).join(", ") ||
                      "new"}
                    {" · "}
                    {s.payment_state || "unpaid"}
                  </div>
                </div>
                <div className="studio-admin-row-actions">
                  <button
                    type="button"
                    className="cursor-settings-action"
                    onClick={() =>
                      void setAgent({
                        phone: s.phone,
                        enabled: !s.agent_enabled,
                      }).then(refresh)
                    }
                  >
                    <Bot className="h-3.5 w-3.5" />
                    {s.agent_enabled ? "On" : "Off"}
                  </button>
                  <button
                    type="button"
                    className="cursor-settings-action"
                    onClick={() =>
                      void setTakeover({
                        phone: s.phone,
                        on: !s.human_takeover,
                      }).then(refresh)
                    }
                  >
                    {s.human_takeover ? (
                      <Ban className="h-3.5 w-3.5" />
                    ) : (
                      <UserRoundCheck className="h-3.5 w-3.5" />
                    )}
                    {s.human_takeover ? "Human" : "Take over"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {payments.length > 0 ? (
        <section className="studio-admin-section">
          <div className="studio-admin-section-head">
            <span className="studio-admin-section-title">Approvals</span>
          </div>
          <ul className="studio-admin-list">
            {payments.map((p) => (
              <li key={p.id} className="studio-admin-list-row">
                <div>
                  <strong>
                    {money(p.amount_cents)} · {p.kind}
                  </strong>
                  <div className="studio-muted">
                    {p.phone}
                    {p.notes ? ` · ${p.notes}` : ""}
                  </div>
                </div>
                <div className="studio-admin-row-actions">
                  <button
                    type="button"
                    className="cursor-settings-action"
                    onClick={() =>
                      void decidePayment({
                        paymentId: p.id,
                        decision: "approve",
                      }).then(refresh)
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
                      }).then(refresh)
                    }
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
