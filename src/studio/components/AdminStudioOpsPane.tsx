"use client";

import {
  Ban,
  Bot,
  Copy,
  Loader2,
  RotateCcw,
  UserRoundCheck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminStudioOpsThread } from "./AdminStudioOpsThread";
import { StudioProfileAvatar } from "./StudioProfileAvatar";
import {
  OpsApprovalsBoard,
  OpsBabysitBar,
  OpsActivityFeed,
  OpsFollowupEditor,
  OpsFollowupsBoard,
  OpsHeadExtraActions,
  OpsKillSwitchBanner,
  OpsMediaRail,
  OpsNotesEditor,
  OpsSettingsExtras,
  OpsStartChatForm,
} from "./AdminStudioOpsExtras";
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
  { id: "followups", label: "Follow-ups" },
  { id: "approvals", label: "Approvals" },
  { id: "settings", label: "Settings" },
];

type ActionTab = "notes" | "followups" | "labels" | "payments" | "media" | "activity";

const ACTION_TABS: Array<{
  id: ActionTab;
  label: string;
}> = [
  { id: "notes", label: "Notes" },
  { id: "followups", label: "Follow-ups" },
  { id: "labels", label: "Labels" },
  { id: "payments", label: "Payments" },
  { id: "media", label: "Media" },
  { id: "activity", label: "Activity" },
];

function paymentStatusTone(p: PaymentRow): string {
  if (p.owner_status === "approved" || p.status === "confirmed") return "is-ok";
  if (p.owner_status === "rejected" || p.status === "failed") return "is-bad";
  if (p.owner_status === "pending") return "is-wait";
  return "";
}

export function AdminStudioOpsPane() {
  const [actionTab, setActionTab] = useState<ActionTab>("notes");
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
    afterMutate,
    linkPhone,
    unlink,
    setAgent,
    setTakeover,
    resetChat,
    setStatus,
    decidePayment,
    threadEpoch,
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
  const agentNotes = String(selected?.notes || "").trim();
  const showPeer = opsTab === "chats" && Boolean(selectedPhone && selected);
  const actionCounts: Record<ActionTab, number> = {
    notes: agentNotes ? 1 : 0,
    followups: selected?.followup_at ? 1 : 0,
    labels: selectedStatuses.length,
    payments: detail?.payments?.length || 0,
    media: detail?.media?.length || 0,
    activity: detail?.activity?.length || 0,
  };

  return (
    <div className={`studio-ops-shell${showPeer ? " has-peer" : ""}`}>
      <div className="studio-ops-main-col">
        <OpsKillSwitchBanner />
        <header className="studio-admin-head studio-ops-subhead">
          <nav className="studio-admin-head-tabs" aria-label="Ops sections">
            {OPS_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`studio-admin-head-tab${opsTab === item.id ? " is-active" : ""}`}
                onClick={() => setOpsTab(item.id)}
              >
                {item.label}
                {item.id === "approvals" && pendingPayments.length > 0 ? (
                  <span className="studio-ops-tab-count" title="Pending approvals">
                    {pendingPayments.length}
                  </span>
                ) : item.id === "chats" && sessions.length > 0 ? (
                  <span className="studio-ops-tab-count">{sessions.length}</span>
                ) : null}
              </button>
            ))}
          </nav>
        </header>

        <div
          className={`studio-ops-main-body${opsTab === "chats" ? " is-ops-chats" : ""}`}
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
                        <span
                          className={`studio-ops-avatar-wrap is-head${
                            selected.presence?.typing
                              ? " is-typing"
                              : selected.presence?.online
                                ? " is-online"
                                : ""
                          }`}
                        >
                          <StudioProfileAvatar
                            size="md"
                            src={sessionAvatarSrc(selected.phone)}
                            displayName={sessionTitle(selected)}
                            name={selected.phone}
                            alt=""
                          />
                          {selected.presence?.typing ||
                          selected.presence?.online ? (
                            <span
                              className={`studio-ops-presence-dot${
                                selected.presence?.typing
                                  ? " is-typing"
                                  : " is-online"
                              }`}
                              aria-hidden
                            />
                          ) : null}
                        </span>
                        <div className="studio-ops-chat-main-peer-copy">
                          <div className="studio-ops-chat-main-peer-title">
                            <strong>{sessionTitle(selected)}</strong>
                            <button
                              type="button"
                              className="studio-composer-circle-btn studio-ops-chat-head-action"
                              title="Copy WhatsApp number"
                              aria-label={`Copy WhatsApp number ${selected.phone_display || selected.phone}`}
                              onClick={() => {
                                void navigator.clipboard
                                  .writeText(
                                    selected.phone_display || selected.phone,
                                  )
                                  .then(() =>
                                    toast.success("WhatsApp number copied"),
                                  )
                                  .catch(() =>
                                    toast.error("Could not copy number"),
                                  );
                              }}
                            >
                              <Copy className="h-3.5 w-3.5" aria-hidden />
                            </button>
                            {selected.working?.sophie ||
                            selected.status === "running" ||
                            (selected.badges || []).includes("sophie") ? (
                              <span
                                className="studio-ops-tag is-sophie is-working"
                                title="Sophie is working"
                              >
                                <Loader2
                                  className="h-2.5 w-2.5 animate-spin"
                                  aria-hidden
                                />
                                <span>Sophie</span>
                              </span>
                            ) : null}
                          </div>
                          {selected.presence?.typing ? (
                            <span className="studio-ops-presence-label">
                              typing…
                            </span>
                          ) : selected.presence?.online ? (
                            <span className="studio-ops-presence-label">
                              online
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="studio-ops-chat-main-actions">
                        <OpsHeadExtraActions session={selected} />
                        <button
                          type="button"
                          className="studio-composer-circle-btn studio-ops-chat-head-action"
                          disabled={!!busy}
                          aria-label="Reset chat context"
                          title="Reset chat context for testing"
                          onClick={() => {
                            const ok = window.confirm(
                              "Reset this chat for testing?\n\nClears Sophie session notes, statuses, follow-ups, local payments, and media. WhatsApp history before now is hidden in Ops. Cannot undo.",
                            );
                            if (!ok) return;
                            void resetChat({ phone: selected.phone });
                          }}
                        >
                          {busy === `reset:${selected.phone}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          className={`studio-composer-circle-btn studio-ops-chat-head-action${selected.agent_enabled ? " is-on" : ""}`}
                          disabled={!!busy}
                          aria-label={
                            selected.agent_enabled
                              ? "Turn Sophie off"
                              : "Turn Sophie on"
                          }
                          aria-pressed={Boolean(selected.agent_enabled)}
                          title={
                            selected.agent_enabled
                              ? "Sophie is on"
                              : "Sophie is off"
                          }
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
                    {selected.context_reset_at ? (
                      <p className="studio-ops-reset-banner studio-muted">
                        Agent context reset. Showing WhatsApp since reset only.
                      </p>
                    ) : null}
                    <OpsBabysitBar session={selected} />
                    <AdminStudioOpsThread
                      key={`${selected.phone}:${threadEpoch}`}
                      phone={selected.phone}
                      humanTakeover={Boolean(selected.human_takeover)}
                    />
                  </>
                )}
              </section>
            </div>
          ) : opsTab === "followups" ? (
            <OpsFollowupsBoard />
          ) : opsTab === "approvals" ? (
            <OpsApprovalsBoard />
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
              <OpsSettingsExtras />
              <OpsStartChatForm />
            </div>
          )}
        </div>
      </div>

      {showPeer && selected ? (
        <aside className="studio-ops-chat-peer" aria-label="Chat actions">
          <div
            className="studio-ops-action-tabs"
            role="tablist"
            aria-label="Chat action panels"
          >
            {ACTION_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={actionTab === tab.id}
                className={`studio-ops-action-tab${actionTab === tab.id ? " is-active" : ""}`}
                onClick={() => setActionTab(tab.id)}
              >
                {tab.label}
                {actionCounts[tab.id] ? (
                  <span>{actionCounts[tab.id]}</span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="studio-ops-chat-peer-scroll">
            {actionTab === "notes" ? (
              <OpsNotesEditor phone={selected.phone} notes={agentNotes} />
            ) : null}

            {actionTab === "followups" ? (
              <OpsFollowupEditor
                phone={selected.phone}
                at={selected.followup_at}
                note={selected.followup_note}
              />
            ) : null}

            {actionTab === "labels" ? (
              <ul className="studio-dm-assign-list studio-ops-label-list">
                {statusCatalog.map((opt) => {
                  const on = selectedStatuses.includes(opt.id);
                  const inputId = `ops-label-${selected.phone}-${opt.id}`;
                  return (
                    <li key={opt.id}>
                      <label
                        htmlFor={inputId}
                        className={`studio-dm-assign-row${on ? " is-on" : ""}`}
                      >
                        <span className="studio-dm-assign-name">{opt.label}</span>
                        <input
                          id={inputId}
                          type="checkbox"
                          className="studio-dm-assign-checkbox"
                          checked={on}
                          onChange={() =>
                            void setStatus({
                              phone: selected.phone,
                              status: opt.id,
                              action: on ? "remove" : "add",
                            }).then(afterMutate)
                          }
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {actionTab === "payments" ? (
              (detail?.payments || []).length === 0 ? (
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
                      {p.owner_status === "pending" && p.agent_accepted ? (
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
              )
            ) : null}

            {actionTab === "media" ? (
              <OpsMediaRail media={detail?.media || []} />
            ) : null}

            {actionTab === "activity" ? (
              <OpsActivityFeed activity={detail?.activity || []} />
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
