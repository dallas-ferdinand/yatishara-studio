"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Award,
  Ban,
  Briefcase,
  Building2,
  ChevronRight,
  CircleDollarSign,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  Link2,
  Loader2,
  Mail,
  NotebookPen,
  Package,
  Phone,
  Plus,
  Star,
  Tags,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { dmLabelIcon } from "@/studio/lib/dmLabelIcons";
import { StudioDmLabelEditorDialog } from "./StudioDmLabelDialogs";
import { StudioDmProviderTag } from "./StudioDmProviderTag";
import { StudioProfileAvatar } from "./StudioProfileAvatar";

type PeerTab = "notes" | "jobs" | "labels" | "about";

type StudioDmPeerSidebarProps = {
  peerUserId: Id<"users">;
  peerUsername: string;
  open: boolean;
  onClose: () => void;
  onOpenProfile?: (username: string) => void;
  onOpenOffersJobs?: () => void;
  /** Desktop docked panel vs mobile sheet. */
  variant?: "docked" | "sheet";
};

const JOB_STATUS_LABEL: Record<string, string> = {
  pending_payment: "Pending payment",
  in_escrow: "In escrow",
  in_progress: "In progress",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

function noteTimeLabel(value: number): string {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function creditsLabel(credits: number): string {
  return `${credits.toLocaleString()} credit${credits === 1 ? "" : "s"}`;
}

function centsLabel(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
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
            <span className="studio-dm-peer-section-icon" aria-hidden="true">
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

/** Job status → chip tone so live work reads apart from finished/cancelled. */
function jobStatusTone(status: string): string {
  if (status === "completed") return "is-done";
  if (status === "cancelled" || status === "refunded") return "is-off";
  if (status === "pending_payment") return "is-wait";
  return "is-live";
}

function JobCard({
  title,
  status,
  priceCredits,
  onOpen,
}: {
  title: string;
  status: string;
  priceCredits: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="studio-dm-peer-job-card"
      onClick={onOpen}
    >
      <span className="studio-dm-peer-card-head">
        <span className="studio-dm-peer-card-title">{title}</span>
        <ChevronRight
          className="studio-dm-peer-card-chevron"
          aria-hidden="true"
        />
      </span>
      <span className="studio-dm-peer-chips">
        <span className={`studio-dm-peer-chip ${jobStatusTone(status)}`}>
          {JOB_STATUS_LABEL[status] ?? status}
        </span>
        <span className="studio-dm-peer-chip">
          <CircleDollarSign aria-hidden="true" />
          {creditsLabel(priceCredits)}
        </span>
      </span>
    </button>
  );
}

function contactLinkIcon(type: string) {
  switch (type) {
    case "email":
      return Mail;
    case "phone":
      return Phone;
    case "website":
      return Globe;
    default:
      return Link2;
  }
}

export function StudioDmPeerSidebar({
  peerUserId,
  peerUsername,
  open,
  onClose,
  onOpenProfile,
  onOpenOffersJobs,
  variant = "docked",
}: StudioDmPeerSidebarProps) {
  const { isMobile } = useMobileLayout();
  const [expiresUnix] = useState(
    () => Math.floor(Date.now() / 1000) + 60 * 60 * 12,
  );
  const [tab, setTab] = useState<PeerTab>("notes");
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [jobDetailId, setJobDetailId] = useState<Id<"marketplaceJobs"> | null>(
    null,
  );
  const [labelEditorOpen, setLabelEditorOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNoteId, setEditingNoteId] =
    useState<Id<"dmPeerNotes"> | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bookingOfferId, setBookingOfferId] =
    useState<Id<"marketplaceOffers"> | null>(null);

  const panel = useQuery(
    api.dmPeerPanel.peerPanel,
    open ? { peerUserId, expiresUnix } : "skip",
  );
  const notes = useQuery(
    api.dmPeerPanel.listNotes,
    open ? { peerUserId } : "skip",
  );
  const jobsWithPeer = useQuery(
    api.marketplace.listJobsWithPeer,
    open ? { peerUserId } : "skip",
  );
  const offers = useQuery(
    api.marketplace.listPublicOffersByUsername,
    open && peerUsername ? { username: peerUsername } : "skip",
  );
  const jobDetail = useQuery(
    api.marketplace.getJob,
    open && jobDetailId ? { jobId: jobDetailId } : "skip",
  );

  const addNote = useMutation(api.dmPeerPanel.addNote);
  const updateNote = useMutation(api.dmPeerPanel.updateNote);
  const deleteNote = useMutation(api.dmPeerPanel.deleteNote);
  const blockPeer = useMutation(api.dmPeerPanel.block);
  const unblockPeer = useMutation(api.dmPeerPanel.unblock);
  const setPeerLabels = useMutation(api.dmLabels.setPeerLabels);
  const bookOffer = useMutation(api.marketplace.bookOffer);

  useEffect(() => {
    setPortalRoot(
      document.querySelector(".studio-polish") as HTMLElement | null,
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    setJobDetailId(null);
    setEditingNoteId(null);
    setError("");
  }, [peerUserId]);

  // Keep hidden until both queries resolve — showing it optimistically makes the
  // Jobs tab flash in and then disappear for peers who have no jobs/offers.
  const showJobsTab = useMemo(() => {
    if (jobsWithPeer === undefined || offers === undefined) return false;
    return (
      (offers?.length ?? 0) > 0 ||
      (jobsWithPeer?.asBuyer.length ?? 0) > 0 ||
      (jobsWithPeer?.asSeller.length ?? 0) > 0
    );
  }, [jobsWithPeer, offers]);

  useEffect(() => {
    if (!showJobsTab && tab === "jobs") setTab("notes");
  }, [showJobsTab, tab]);

  const assignedLabelIds = useMemo(
    () =>
      (panel?.labels ?? [])
        .filter((label) => label.assigned)
        .map((label) => label.labelId),
    [panel?.labels],
  );

  async function handleAddNote() {
    const body = noteDraft.trim();
    if (!body || busy) return;
    setBusy(true);
    setError("");
    try {
      await addNote({ peerUserId, body });
      setNoteDraft("");
    } catch (err) {
      setError(friendlyConvexError(err, "Could not save note"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit() {
    if (!editingNoteId || busy) return;
    const body = editingBody.trim();
    if (!body) return;
    setBusy(true);
    setError("");
    try {
      await updateNote({ noteId: editingNoteId, body });
      setEditingNoteId(null);
      setEditingBody("");
    } catch (err) {
      setError(friendlyConvexError(err, "Could not update note"));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleLabel(labelId: Id<"dmLabels">, assigned: boolean) {
    const next = assigned
      ? assignedLabelIds.filter((id) => id !== labelId)
      : [...assignedLabelIds, labelId];
    setError("");
    try {
      await setPeerLabels({ peerUserId, labelIds: next });
    } catch (err) {
      setError(friendlyConvexError(err, "Could not update labels"));
    }
  }

  async function handleBook(offerId: Id<"marketplaceOffers">) {
    if (busy) return;
    setBusy(true);
    setBookingOfferId(offerId);
    setError("");
    try {
      await bookOffer({ offerId });
    } catch (err) {
      setError(friendlyConvexError(err, "Could not book offer"));
    } finally {
      setBusy(false);
      setBookingOfferId(null);
    }
  }

  async function handleBlockToggle() {
    if (!panel || busy) return;
    setBusy(true);
    setError("");
    try {
      if (panel.blocked) {
        await unblockPeer({ peerUserId });
      } else if (
        window.confirm(
          `Block @${panel.peer.username}? They won’t be able to message you.`,
        )
      ) {
        await blockPeer({ peerUserId });
      }
    } catch (err) {
      setError(friendlyConvexError(err, "Could not update block"));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const tabs: Array<{ id: PeerTab; label: string; icon: ReactNode }> = [
    {
      id: "notes",
      label: "Notes",
      icon: <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />,
    },
    ...(showJobsTab
      ? [
          {
            id: "jobs" as const,
            label: "Jobs",
            icon: <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />,
          },
        ]
      : []),
    {
      id: "labels",
      label: "Labels",
      icon: <Tags className="h-3.5 w-3.5" aria-hidden="true" />,
    },
    {
      id: "about",
      label: "About",
      icon: <UserRound className="h-3.5 w-3.5" aria-hidden="true" />,
    },
  ];

  const tabNav = (
    <nav className="studio-admin-head-tabs" aria-label="Peer panel">
      {tabs.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`studio-admin-head-tab${tab === item.id ? " is-active" : ""}`}
          onClick={() => {
            setTab(item.id);
            setJobDetailId(null);
          }}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );

  const body = (
    <>
      {error ? <p className="studio-dm-peer-error">{error}</p> : null}

      {tab === "notes" ? (
        <div className="studio-dm-peer-stack">
          <div className="studio-dm-peer-composer">
            <textarea
              className="cursor-input"
              value={noteDraft}
              rows={3}
              placeholder="Add a private note…"
              aria-label="Add a private note"
              onChange={(event) => setNoteDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey) return;
                if (event.nativeEvent.isComposing) return;
                event.preventDefault();
                void handleAddNote();
              }}
            />
            <button
              type="button"
              className="cursor-settings-action studio-dm-peer-add-note"
              disabled={busy || !noteDraft.trim()}
              onClick={() => void handleAddNote()}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>Add note</span>
            </button>
          </div>
          {notes === undefined ? (
            <p className="studio-settings-empty">Loading…</p>
          ) : notes.length === 0 ? (
            <p className="studio-settings-empty">
              Private notes only you can see. Capture context over time.
            </p>
          ) : (
            <ul className="studio-dm-peer-list">
              {notes.map((note) => (
                <li key={note.noteId} className="studio-dm-peer-plate">
                  {editingNoteId === note.noteId ? (
                    <>
                      <textarea
                        className="cursor-input"
                        value={editingBody}
                        rows={3}
                        aria-label="Edit note"
                        onChange={(event) => setEditingBody(event.target.value)}
                      />
                      <div className="studio-dm-peer-inline-actions">
                        <button
                          type="button"
                          className="cursor-settings-action"
                          onClick={() => void handleSaveEdit()}
                          disabled={busy || !editingBody.trim()}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="cursor-settings-action muted"
                          onClick={() => {
                            setEditingNoteId(null);
                            setEditingBody("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="studio-dm-peer-note-body">{note.body}</p>
                      <div className="studio-dm-peer-meta">
                        <time dateTime={new Date(note.createdAt).toISOString()}>
                          {noteTimeLabel(note.createdAt)}
                          {note.updatedAt > note.createdAt ? " · edited" : ""}
                        </time>
                        <span className="studio-dm-peer-meta-actions">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNoteId(note.noteId);
                              setEditingBody(note.body);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="is-danger"
                            onClick={() => {
                              if (!window.confirm("Delete this note?")) return;
                              void deleteNote({ noteId: note.noteId }).catch(
                                (err) =>
                                  setError(
                                    friendlyConvexError(
                                      err,
                                      "Could not delete note",
                                    ),
                                  ),
                              );
                            }}
                          >
                            Delete
                          </button>
                        </span>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "jobs" ? (
        <div className="studio-dm-peer-stack">
          {jobDetailId && jobDetail?.job ? (
            <Section
              title="Job"
              extras={
                <button
                  type="button"
                  className="studio-dm-peer-text-btn"
                  onClick={() => setJobDetailId(null)}
                >
                  <ArrowLeft aria-hidden="true" />
                  Back
                </button>
              }
            >
              <div className="studio-dm-peer-plate">
                <div className="studio-dm-peer-card-head">
                  <strong className="studio-dm-peer-title">
                    {jobDetail.job.offerTitle}
                  </strong>
                  <span
                    className={`studio-dm-peer-chip ${jobStatusTone(jobDetail.job.status)}`}
                  >
                    {JOB_STATUS_LABEL[jobDetail.job.status] ??
                      jobDetail.job.status}
                  </span>
                </div>
                <dl className="studio-dm-peer-facts">
                  <div>
                    <dt>Price</dt>
                    <dd>{creditsLabel(jobDetail.job.priceCredits)}</dd>
                  </div>
                  {jobDetail.job.packageName ? (
                    <div>
                      <dt>Package</dt>
                      <dd>{jobDetail.job.packageName}</dd>
                    </div>
                  ) : null}
                  {jobDetail.job.deliveryDays != null ? (
                    <div>
                      <dt>Delivery</dt>
                      <dd>{jobDetail.job.deliveryDays}d</dd>
                    </div>
                  ) : null}
                </dl>
                {onOpenOffersJobs ? (
                  <button
                    type="button"
                    className="cursor-settings-action"
                    onClick={onOpenOffersJobs}
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Open in Offers</span>
                  </button>
                ) : null}
              </div>
            </Section>
          ) : (
            <>
              {(jobsWithPeer?.asBuyer.length ?? 0) > 0 ? (
                <Section
                  title="My orders from them"
                  icon={<Award className="h-3 w-3" aria-hidden="true" />}
                >
                  <ul className="studio-dm-peer-list">
                    {jobsWithPeer!.asBuyer.map((job) => (
                      <li key={job._id}>
                        <JobCard
                          title={job.offerTitle}
                          status={job.status}
                          priceCredits={job.priceCredits}
                          onOpen={() => setJobDetailId(job._id)}
                        />
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}

              {(offers?.length ?? 0) > 0 ? (
                <Section
                  title="Request a job"
                  icon={<Package className="h-3 w-3" aria-hidden="true" />}
                >
                  <ul className="studio-dm-peer-list">
                    {offers!.map((offer) => (
                      <li key={offer._id} className="studio-dm-peer-offer-card">
                        <div className="studio-dm-peer-card-head">
                          <span className="studio-dm-peer-card-title">
                            {offer.title}
                          </span>
                          <button
                            type="button"
                            className="studio-dm-peer-book"
                            disabled={busy}
                            onClick={() => void handleBook(offer._id)}
                          >
                            {bookingOfferId === offer._id ? (
                              <Loader2
                                className="h-3 w-3 animate-spin"
                                aria-hidden="true"
                              />
                            ) : (
                              "Book"
                            )}
                          </button>
                        </div>
                        <div className="studio-dm-peer-chips">
                          <span className="studio-dm-peer-chip">
                            <CircleDollarSign aria-hidden="true" />
                            from {centsLabel(offer.priceCents)}
                          </span>
                          <span className="studio-dm-peer-chip">
                            <Clock aria-hidden="true" />
                            {offer.deliveryDays}d delivery
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}

              {(jobsWithPeer?.asSeller.length ?? 0) > 0 ? (
                <Section
                  title="Their orders from me"
                  icon={<Briefcase className="h-3 w-3" aria-hidden="true" />}
                  extras={
                    jobsWithPeer?.sellerTotals ? (
                      <span className="studio-dm-peer-chip">
                        {jobsWithPeer.sellerTotals.jobCount} ·{" "}
                        {creditsLabel(jobsWithPeer.sellerTotals.totalCredits)}
                      </span>
                    ) : null
                  }
                >
                  <ul className="studio-dm-peer-list">
                    {jobsWithPeer!.asSeller.map((job) => (
                      <li key={job._id}>
                        <JobCard
                          title={job.offerTitle}
                          status={job.status}
                          priceCredits={job.priceCredits}
                          onOpen={() => setJobDetailId(job._id)}
                        />
                      </li>
                    ))}
                  </ul>
                  {onOpenOffersJobs ? (
                    <button
                      type="button"
                      className="cursor-settings-action muted"
                      onClick={onOpenOffersJobs}
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Manage in Offers</span>
                    </button>
                  ) : null}
                </Section>
              ) : null}

              {jobsWithPeer !== undefined &&
              offers !== undefined &&
              jobsWithPeer.asBuyer.length === 0 &&
              jobsWithPeer.asSeller.length === 0 &&
              offers.length === 0 ? (
                <p className="studio-settings-empty">
                  No jobs with this person.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {tab === "labels" ? (
        labelEditorOpen ? (
          <StudioDmLabelEditorDialog
            open
            variant="inline"
            onClose={() => setLabelEditorOpen(false)}
          />
        ) : (
          <div className="studio-dm-peer-stack">
            {panel === undefined ? (
              <p className="studio-settings-empty">Loading…</p>
            ) : panel === null ? (
              <p className="studio-settings-empty">Profile unavailable.</p>
            ) : (
              <ul className="studio-dm-assign-list">
                <li>
                  <button
                    type="button"
                    className="studio-dm-assign-row studio-dm-peer-new-label"
                    onClick={() => setLabelEditorOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="studio-dm-assign-name">New label</span>
                  </button>
                </li>
                {panel.labels.map((label) => {
                  const Icon = dmLabelIcon(label.icon);
                  const inputId = `dm-peer-label-${label.labelId}`;
                  return (
                    <li key={label.labelId}>
                      <label
                        htmlFor={inputId}
                        className={`studio-dm-assign-row${label.assigned ? " is-on" : ""}`}
                      >
                        <span className="studio-dm-assign-icon" aria-hidden="true">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="studio-dm-assign-name">
                          {label.name}
                        </span>
                        <input
                          id={inputId}
                          type="checkbox"
                          className="studio-dm-assign-checkbox"
                          checked={label.assigned}
                          onChange={() =>
                            void handleToggleLabel(label.labelId, label.assigned)
                          }
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )
      ) : null}

      {tab === "about" ? (
        <div className="studio-dm-peer-stack">
          {panel === undefined ? (
            <p className="studio-settings-empty">Loading…</p>
          ) : panel === null ? (
            <p className="studio-settings-empty">Profile unavailable.</p>
          ) : (
            <>
              <div className="studio-dm-peer-plate studio-dm-peer-identity">
                <StudioProfileAvatar
                  size="md"
                  src={panel.peer.avatarUrl}
                  displayName={panel.peer.displayName}
                  name={panel.peer.username}
                  alt=""
                />
                <div className="studio-dm-peer-identity-copy">
                  <strong>
                    <span className="studio-dm-name-text">
                      {panel.peer.displayName?.trim() ||
                        `@${panel.peer.username}`}
                    </span>
                    <StudioDmProviderTag tag={panel.sellerTag} />
                  </strong>
                  <span className="studio-dm-peer-handle">
                    @{panel.peer.username}
                  </span>
                  {panel.businessName ? (
                    <span className="studio-dm-peer-biz">
                      <Building2 aria-hidden="true" />
                      <span className="studio-dm-name-text">
                        {panel.businessName}
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>
              {panel.peer.bio ? (
                <p className="studio-dm-peer-bio">{panel.peer.bio}</p>
              ) : null}

              <Section
                title="Social"
                icon={<Users className="h-3 w-3" aria-hidden="true" />}
              >
                <div className="studio-dm-peer-stat-grid">
                  <div className="studio-dm-peer-plate studio-dm-peer-stat">
                    <Users aria-hidden="true" />
                    <strong>{panel.social.followerCount}</strong>
                    <span>Followers</span>
                  </div>
                  <div className="studio-dm-peer-plate studio-dm-peer-stat">
                    <UserRound aria-hidden="true" />
                    <strong>{panel.social.followingCount}</strong>
                    <span>Following</span>
                  </div>
                  <div className="studio-dm-peer-plate studio-dm-peer-stat">
                    <FileText aria-hidden="true" />
                    <strong>{panel.social.postCount}</strong>
                    <span>Posts</span>
                  </div>
                </div>
              </Section>

              {panel.sellerStats ? (
                <Section
                  title="Seller"
                  icon={<Briefcase className="h-3 w-3" aria-hidden="true" />}
                >
                  <div className="studio-dm-peer-stat-grid">
                    <div className="studio-dm-peer-plate studio-dm-peer-stat">
                      <Briefcase aria-hidden="true" />
                      <strong>{panel.sellerStats.completedJobs}</strong>
                      <span>Jobs done</span>
                    </div>
                    <div className="studio-dm-peer-plate studio-dm-peer-stat">
                      <Star aria-hidden="true" />
                      <strong>
                        {panel.sellerStats.ratingAverage != null
                          ? `${panel.sellerStats.ratingAverage}`
                          : "—"}
                      </strong>
                      <span>Rating</span>
                    </div>
                    <div className="studio-dm-peer-plate studio-dm-peer-stat">
                      <Package aria-hidden="true" />
                      <strong>{panel.sellerStats.publishedOfferCount}</strong>
                      <span>Offers</span>
                    </div>
                  </div>
                </Section>
              ) : null}

              {panel.contactLinks.length > 0 ? (
                <Section
                  title="Contact"
                  icon={<Link2 className="h-3 w-3" aria-hidden="true" />}
                >
                  <ul className="studio-dm-peer-list studio-dm-peer-contact-list">
                    {panel.contactLinks.map((link) => {
                      const Icon = contactLinkIcon(link.type);
                      return (
                        <li key={`${link.type}:${link.value}`}>
                          <a
                            className="studio-dm-assign-row"
                            href={link.href}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <span
                              className="studio-dm-assign-icon"
                              aria-hidden="true"
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <span className="studio-dm-assign-name">
                              {link.label || link.type}
                            </span>
                            <span className="studio-dm-peer-contact-value">
                              {link.value}
                            </span>
                            <ExternalLink
                              className="studio-dm-peer-contact-out"
                              aria-hidden="true"
                            />
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </Section>
              ) : null}

              <div className="studio-dm-peer-about-actions">
                <button
                  type="button"
                  className="cursor-settings-action"
                  onClick={() => onOpenProfile?.(panel.peer.username)}
                >
                  <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Open profile</span>
                </button>
                <button
                  type="button"
                  className={`cursor-settings-action${panel.blocked ? " muted" : ""}`}
                  disabled={busy}
                  onClick={() => void handleBlockToggle()}
                >
                  <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{panel.blocked ? "Unblock" : "Block"}</span>
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </>
  );

  const panelNode = (
    <aside
      className="studio-dm-peer-sidebar flex h-full w-full min-w-0 flex-col border-l border-cursor-border-soft"
      aria-label="Chat details"
    >
      <div className="cursor-panel-head cursor-sidebar-head justify-between shrink-0">
        {tabNav}
        <button
          type="button"
          className="cursor-icon-btn cursor-icon-btn-sm studio-panel-close"
          onClick={onClose}
          aria-label="Close peer panel"
        >
          ×
        </button>
      </div>
      <div
        className={`studio-dm-peer-body${tab === "labels" && labelEditorOpen ? " is-flush" : ""}`}
      >
        {body}
      </div>
    </aside>
  );

  if (variant === "sheet" || isMobile) {
    if (!portalRoot) return null;
    return createPortal(
      <div
        className="studio-mobile-app-menu-sheet studio-dm-peer-mobile-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Chat details"
      >
        <div className="studio-mobile-app-menu-head">
          <h2 className="studio-mobile-app-menu-title">Chat details</h2>
          <button
            type="button"
            className="studio-mobile-app-menu-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="studio-dm-peer-mobile-tabs">{tabNav}</div>
        <div
          className={`studio-mobile-app-menu-body studio-dm-peer-body${tab === "labels" && labelEditorOpen ? " is-flush" : ""}`}
        >
          {body}
        </div>
      </div>,
      portalRoot,
    );
  }

  return panelNode;
}
