"use client";

import {
  Ban,
  Bot,
  Clock,
  Loader2,
  NotebookPen,
  RefreshCw,
  Tags,
  UserRoundCheck,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { AdminStudioOpsThread } from "./AdminStudioOpsThread";
import { StudioProfileAvatar } from "./StudioProfileAvatar";
import {
  money,
  sessionAvatarSrc,
  sessionTitle,
  useAdminStudioOps,
  whenLabel,
  type OpsTab,
  type PaymentRow,
} from "./AdminStudioOpsContext";

const OPS_TABS: { id: OpsTab; label: string }[] = [
  { id: "chats", label: "Chats" },
  { id: "settings", label: "Settings" },
];

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

export function AdminStudioOpsPane() {
  const {
    opsTab,
    setOpsTab,
    device,
    qrSrc,
    sessions,
    pendingPayments,
    statusCatalog,
    busy,
    selectedPhone,
    detail,
    notesDraft,
    setNotesDraft,
    followNote,
    setFollowNote,
    refresh,
    afterMutate,
    linkPhone,
    unlink,
    setAgent,
    setTakeover,
    setFollowup,
    setStatus,
    setNotes,
    decidePayment,
  } = useAdminStudioOps();

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
              className={`studio-admin-head-tab${opsTab === item.id ? " is-active" : ""}`}
              onClick={() => setOpsTab(item.id)}
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
        className={`studio-admin-body${opsTab === "chats" ? " is-ops-chats" : ""}`}
      >
        {opsTab === "chats" ? (
          <div
            className={`studio-ops-chats is-rail-layout${selectedPhone ? " has-selected" : ""}`}
          >
            <section className="studio-ops-chat-main" aria-label="Chat">
              {!selectedPhone || !selected ? (
                <div className="studio-ops-empty-card is-center">
                  <strong>Pick a chat</strong>
                  <span>Select someone from the sidebar.</span>
                </div>
              ) : (
                <>
                  <header className="studio-ops-chat-main-head">
                    <div className="studio-ops-chat-main-peer">
                      <StudioProfileAvatar
                        size="md"
                        src={sessionAvatarSrc(selected.phone)}
                        displayName={sessionTitle(selected)}
                        name={selected.phone}
                        alt=""
                      />
                      <div>
                        <strong>{sessionTitle(selected)}</strong>
                        <span className="studio-muted">
                          {selected.phone_display || selected.phone}
                          {selected.payment_state
                            ? ` · ${selected.payment_state}`
                            : ""}
                        </span>
                      </div>
                    </div>
                    <div className="studio-ops-chat-main-actions">
                      <button
                        type="button"
                        className={`studio-composer-circle-btn studio-ops-chat-head-action${selected.agent_enabled ? " is-on" : ""}`}
                        disabled={!!busy}
                        aria-label={
                          selected.agent_enabled ? "Turn Sophie off" : "Turn Sophie on"
                        }
                        aria-pressed={Boolean(selected.agent_enabled)}
                        title={selected.agent_enabled ? "Sophie is on" : "Sophie is off"}
                        onClick={() =>
                          void setAgent({
                            phone: selected.phone,
                            enabled: !selected.agent_enabled,
                          }).then(afterMutate)
                        }
                      >
                        <Bot className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className={`studio-composer-circle-btn studio-ops-chat-head-action${selected.human_takeover ? " is-on is-human" : ""}`}
                        disabled={!!busy}
                        aria-label={
                          selected.human_takeover
                            ? "Return chat to Sophie"
                            : "Take over this chat"
                        }
                        aria-pressed={Boolean(selected.human_takeover)}
                        title={
                          selected.human_takeover
                            ? "Human takeover is on"
                            : "Take over from Sophie"
                        }
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
                      </button>
                    </div>
                  </header>
                  <AdminStudioOpsThread
                    phone={selected.phone}
                    humanTakeover={Boolean(selected.human_takeover)}
                  />
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
