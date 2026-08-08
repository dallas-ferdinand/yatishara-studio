"use client";

/**
 * Extra Ops boards + controls ported from Desk CS Ops (Academy-safe subset).
 */
import { Baby, Bell, CalendarClock, CreditCard, FileText, ImageIcon, Loader2, OctagonX, StickyNote, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useHorizontalScrollFade } from "@/desk/lib/use-horizontal-scroll-fade";
import { useHorizontalWheelScroll } from "@/desk/lib/use-horizontal-wheel-scroll";
import {
  money,
  sessionTitle,
  useAdminStudioOps,
  whenLabel,
  type PaymentRow,
  type SessionRow,
} from "./AdminStudioOpsContext";

function OpsEmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof StickyNote;
  title: string;
  body: string;
}) {
  return (
    <div className="studio-ops-empty-state" role="status">
      <Icon aria-hidden />
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

export function OpsKillSwitchBanner() {
  const { serviceEnabled } = useAdminStudioOps();
  if (serviceEnabled) return null;
  return (
    <div className="studio-ops-kill-banner" role="status">
      Sophie is globally paused (kill switch). Agent replies are off until
      enabled.
    </div>
  );
}

export function OpsFilterPills({
  value,
  onChange,
  counts,
  statusIds,
}: {
  value: string;
  onChange: (id: string) => void;
  counts: Record<string, number>;
  statusIds: Array<{ id: string; label: string }>;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  useHorizontalWheelScroll(railRef);
  useHorizontalScrollFade(railRef);
  const pills = [
    { id: "all", label: "All" },
    { id: "unanswered", label: "Unanswered" },
    { id: "working", label: "Working" },
    { id: "watch", label: "Watch" },
    { id: "agent", label: "Agent" },
    { id: "human", label: "Human" },
    { id: "approval", label: "Approvals" },
    { id: "escalated", label: "Escalated" },
    ...statusIds.slice(0, 6),
  ];
  return (
    <div
      ref={railRef}
      className="studio-ops-filter-pills"
      role="toolbar"
      aria-label="Chat filters"
    >
      {pills.map((p) => {
        const n = counts[p.id] || 0;
        return (
          <button
            key={p.id}
            type="button"
            className={`studio-ops-filter-pill${value === p.id ? " is-active" : ""}`}
            onClick={() => onChange(p.id)}
          >
            <span>{p.label}</span>
            <em>{n}</em>
          </button>
        );
      })}
    </div>
  );
}

export function OpsBabysitBar({ session }: { session: SessionRow }) {
  const { approveBabysit, discardBabysit, afterMutate, busy } =
    useAdminStudioOps();
  const pending = session.babysit?.pending;
  if (!pending) return null;
  return (
    <div className="studio-ops-babysit-bar">
      <div className="studio-ops-babysit-draft">
        <p>{pending.preview || pending.text}</p>
        <div className="studio-ops-babysit-actions">
          <button
            type="button"
            className="cursor-settings-action"
            disabled={!!busy}
            onClick={() =>
              void approveBabysit({ phone: session.phone })
                .then(afterMutate)
                .then(() => toast.success("Approved & sent"))
            }
          >
            Approve
          </button>
          <button
            type="button"
            className="cursor-settings-action"
            disabled={!!busy}
            onClick={() =>
              void discardBabysit({ phone: session.phone })
                .then(afterMutate)
                .then(() => toast.message("Draft discarded"))
            }
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}

export function OpsHeadExtraActions({ session }: { session: SessionRow }) {
  const { nudge, stopAgent, escalate, setBabysit, afterMutate, busy } =
    useAdminStudioOps();
  const running = Boolean(
    session.working?.sophie || session.status === "running",
  );
  const babysitOn = Boolean(
    session.babysit?.enabled || session.babysit_enabled,
  );
  return (
    <>
      <button
        type="button"
        className={`studio-composer-circle-btn studio-ops-chat-head-action${babysitOn ? " is-on" : ""}`}
        disabled={!!busy}
        title={
          babysitOn
            ? "Babysit on — approve before send"
            : "Babysit off — toggle to approve before send"
        }
        aria-label={babysitOn ? "Turn babysit off" : "Turn babysit on"}
        aria-pressed={babysitOn}
        onClick={() =>
          void setBabysit({ phone: session.phone, enabled: !babysitOn }).then(
            afterMutate,
          )
        }
      >
        <Baby className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="studio-composer-circle-btn studio-ops-chat-head-action"
        disabled={!!busy}
        title="Nudge Sophie"
        aria-label="Nudge Sophie"
        onClick={() =>
          void nudge({ phone: session.phone })
            .then(afterMutate)
            .then(() => toast.success("Sophie nudged"))
            .catch(() => null)
        }
      >
        <Zap className="h-3.5 w-3.5" />
      </button>
      {running ? (
        <button
          type="button"
          className="studio-composer-circle-btn studio-ops-chat-head-action"
          disabled={!!busy}
          title="Stop Sophie"
          aria-label="Stop Sophie"
          onClick={() =>
            void stopAgent({ phone: session.phone })
              .then(afterMutate)
              .then(() => toast.message("Sophie stopped"))
              .catch(() => null)
          }
        >
          <OctagonX className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <button
        type="button"
        className={`studio-composer-circle-btn studio-ops-chat-head-action${session.needs_owner ? " is-on" : ""}`}
        disabled={!!busy}
        title={session.needs_owner ? "Clear escalation" : "Mark needs owner"}
        aria-label="Escalate"
        onClick={() =>
          void escalate({
            phone: session.phone,
            on: !session.needs_owner,
          }).then(afterMutate)
        }
      >
        <Bell className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

export function OpsFollowupsBoard() {
  const { followups, loadFollowups, setSelectedPhone, setOpsTab, busy } =
    useAdminStudioOps();
  useEffect(() => {
    void loadFollowups();
  }, [loadFollowups]);
  return (
    <div className="studio-ops-board">
      <header className="studio-ops-board-head">
        <strong>Follow-ups</strong>
        <button
          type="button"
          className="cursor-settings-action"
          disabled={!!busy}
          onClick={() => void loadFollowups()}
        >
          Refresh
        </button>
      </header>
      {followups.length === 0 ? (
        <OpsEmptyState
          icon={CalendarClock}
          title="No follow-ups"
          body="When Sophie schedules a follow-up, it shows up here."
        />
      ) : (
        <ul className="studio-ops-board-list">
          {followups.map((s) => (
            <li key={s.phone}>
              <button
                type="button"
                onClick={() => {
                  setSelectedPhone(s.phone);
                  setOpsTab("chats");
                }}
              >
                <strong>{sessionTitle(s)}</strong>
                <span>{whenLabel(s.followup_at)}</span>
                <em>{s.followup_note || "—"}</em>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OpsApprovalsBoard() {
  const {
    pendingPayments,
    decidePayment,
    afterMutate,
    setSelectedPhone,
    setOpsTab,
    busy,
  } = useAdminStudioOps();
  return (
    <div className="studio-ops-board">
      <header className="studio-ops-board-head">
        <strong>Payment approvals</strong>
      </header>
      {pendingPayments.length === 0 ? (
        <OpsEmptyState
          icon={CreditCard}
          title="No approvals waiting"
          body="Payment receipts Sophie flags for review will land here."
        />
      ) : (
        <ul className="studio-ops-board-list">
          {pendingPayments.map((p: PaymentRow) => (
            <li key={p.id}>
              <div className="studio-ops-approval-row">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPhone(p.phone);
                    setOpsTab("chats");
                  }}
                >
                  <strong>{p.phone}</strong>
                  <span>
                    {money(p.amount_cents)} · {p.kind}
                  </span>
                </button>
                <div>
                  <button
                    type="button"
                    className="cursor-settings-action"
                    disabled={!!busy}
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
                    disabled={!!busy}
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OpsNotesPanel({ notes }: { notes: string }) {
  const text = String(notes || "").trim();
  if (!text) {
    return (
      <OpsEmptyState
        icon={StickyNote}
        title="No notes yet"
        body="Sophie and the agent write notes here — there’s no manual create."
      />
    );
  }
  return (
    <div className="studio-ops-readout" aria-label="Owner notes">
      <p>{text}</p>
    </div>
  );
}

export function OpsFollowupPanel({
  at,
  note,
}: {
  at?: string | null;
  note?: string | null;
}) {
  if (!at) {
    return (
      <OpsEmptyState
        icon={CalendarClock}
        title="No follow-up set"
        body="Follow-ups are scheduled by Sophie — open the Follow-ups board to see what’s due."
      />
    );
  }
  return (
    <div className="studio-ops-readout" aria-label="Follow-up">
      <strong>{whenLabel(at)}</strong>
      <p>{String(note || "").trim() || "No note on this follow-up."}</p>
    </div>
  );
}

export function OpsActivityFeed({
  activity,
}: {
  activity: Array<{ id: number; kind: string; body?: string | null; created_at?: string }>;
}) {
  if (!activity.length) {
    return (
      <OpsEmptyState
        icon={FileText}
        title="No activity yet"
        body="Inbound actions, tool runs, and status changes will show up here."
      />
    );
  }
  return (
    <ul className="studio-ops-activity-list">
      {activity.map((a) => (
        <li key={a.id}>
          <strong>{a.kind}</strong>
          <span>{whenLabel(a.created_at)}</span>
          <p>{a.body || "—"}</p>
        </li>
      ))}
    </ul>
  );
}

export function OpsMediaRail({
  media,
}: {
  media: Array<{ id: number; path: string; role?: string | null }>;
}) {
  if (!media.length) {
    return (
      <OpsEmptyState
        icon={ImageIcon}
        title="No media saved"
        body="Receipts and attachments Sophie saves for this chat appear here."
      />
    );
  }
  return (
    <ul className="studio-ops-media-list">
      {media.map((m) => (
        <li key={m.id}>
          <span>{m.role || "file"}</span>
          <code title={m.path}>{m.path.split("/").pop()}</code>
        </li>
      ))}
    </ul>
  );
}

export function OpsPaymentsEmpty() {
  return (
    <OpsEmptyState
      icon={CreditCard}
      title="No payments yet"
      body="When a customer sends a receipt or Sophie logs a payment attempt, it shows here."
    />
  );
}

export function OpsStartChatForm() {
  const { startChat, afterMutate, setSelectedPhone, setOpsTab, busy } =
    useAdminStudioOps();
  const [phone, setPhone] = useState("");
  const [brief, setBrief] = useState("");
  return (
    <div className="studio-ops-editor">
      <strong>Start chat</strong>
      <input
        value={phone}
        placeholder="WhatsApp number"
        onChange={(e) => setPhone(e.target.value)}
      />
      <textarea
        value={brief}
        rows={3}
        placeholder="Optional brief for Sophie…"
        onChange={(e) => setBrief(e.target.value)}
      />
      <button
        type="button"
        className="cursor-settings-action"
        disabled={!!busy || phone.replace(/\D/g, "").length < 8}
        onClick={() =>
          void startChat({ phone, text: brief || undefined })
            .then(afterMutate)
            .then(() => {
              setSelectedPhone(phone.replace(/\D/g, ""));
              setOpsTab("chats");
              toast.success("Chat started");
            })
        }
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Start + nudge Sophie
      </button>
    </div>
  );
}

export function OpsSettingsExtras() {
  const { getSettings, setSettings, busy } = useAdminStudioOps();
  const [autoEnable, setAutoEnable] = useState(true);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void getSettings()
      .then((raw) => {
        const s = (raw as { settings?: Record<string, string> })?.settings || {};
        setAutoEnable(String(s.auto_enable_agent_new_chats || "1") !== "0");
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [getSettings]);

  return (
    <div className="studio-ops-editor">
      <strong>Agent defaults</strong>
      {!loaded ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <label className="studio-ops-babysit-toggle">
          <input
            type="checkbox"
            checked={autoEnable}
            disabled={!!busy}
            onChange={(e) => {
              const next = e.target.checked;
              setAutoEnable(next);
              void setSettings({ autoEnableAgentNewChats: next }).then(() =>
                toast.success("Settings saved"),
              );
            }}
          />
          Auto-enable Sophie on new chats
        </label>
      )}
      <label className="studio-ops-babysit-toggle">
        <input
          type="checkbox"
          checked={
            typeof Notification !== "undefined" &&
            Notification.permission === "granted"
          }
          onChange={() => {
            if (typeof Notification === "undefined") return;
            void Notification.requestPermission().then((p) => {
              toast.message(
                p === "granted"
                  ? "Browser alerts on when tab is hidden"
                  : "Notifications blocked",
              );
            });
          }}
        />
        Browser alerts for inbound (hidden tab)
      </label>
    </div>
  );
}
