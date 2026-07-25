"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Ban,
  Briefcase,
  Check,
  ExternalLink,
  Loader2,
  NotebookPen,
  Plus,
  Tags,
  UserRound,
  X,
} from "lucide-react";
import {
  createElement,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
    setPortalRoot(document.querySelector(".studio-polish") as HTMLElement | null);
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

  const showJobsTab = useMemo(() => {
    if (jobsWithPeer === undefined || offers === undefined) return true;
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
    { id: "notes", label: "Notes", icon: <NotebookPen aria-hidden="true" /> },
    ...(showJobsTab
      ? [
          {
            id: "jobs" as const,
            label: "Jobs",
            icon: <Briefcase aria-hidden="true" />,
          },
        ]
      : []),
    { id: "labels", label: "Labels", icon: <Tags aria-hidden="true" /> },
    { id: "about", label: "About", icon: <UserRound aria-hidden="true" /> },
  ];

  const body = (
    <>
      {error ? <p className="studio-dm-peer-error">{error}</p> : null}

      {tab === "notes" ? (
        <div className="studio-dm-peer-notes">
          <div className="studio-dm-peer-note-composer">
            <textarea
              value={noteDraft}
              rows={2}
              placeholder="Add a private note…"
              aria-label="Add a private note"
              onChange={(event) => setNoteDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void handleAddNote();
                }
              }}
            />
            <button
              type="button"
              className="studio-dm-peer-note-add"
              disabled={busy || !noteDraft.trim()}
              onClick={() => void handleAddNote()}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>Add</span>
            </button>
          </div>
          {notes === undefined ? (
            <p className="studio-dm-peer-empty">Loading…</p>
          ) : notes.length === 0 ? (
            <p className="studio-dm-peer-empty">
              Private notes only you can see. Capture context over time.
            </p>
          ) : (
            <ul className="studio-dm-peer-note-list">
              {notes.map((note) => (
                <li key={note.noteId} className="studio-dm-peer-note">
                  {editingNoteId === note.noteId ? (
                    <>
                      <textarea
                        value={editingBody}
                        rows={3}
                        aria-label="Edit note"
                        onChange={(event) => setEditingBody(event.target.value)}
                      />
                      <div className="studio-dm-peer-note-actions">
                        <button
                          type="button"
                          onClick={() => void handleSaveEdit()}
                          disabled={busy || !editingBody.trim()}
                        >
                          Save
                        </button>
                        <button
                          type="button"
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
                      <p>{note.body}</p>
                      <div className="studio-dm-peer-note-meta">
                        <time dateTime={new Date(note.createdAt).toISOString()}>
                          {noteTimeLabel(note.createdAt)}
                          {note.updatedAt > note.createdAt ? " · edited" : ""}
                        </time>
                        <span className="studio-dm-peer-note-actions">
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
        <div className="studio-dm-peer-jobs">
          {jobDetailId && jobDetail?.job ? (
            <div className="studio-dm-peer-job-detail">
              <button
                type="button"
                className="studio-dm-peer-back"
                onClick={() => setJobDetailId(null)}
              >
                <ArrowLeft aria-hidden="true" />
                <span>Back</span>
              </button>
              <strong>{jobDetail.job.offerTitle}</strong>
              <span className="studio-dm-peer-job-status">
                {JOB_STATUS_LABEL[jobDetail.job.status] ?? jobDetail.job.status}
              </span>
              <dl className="studio-dm-peer-job-facts">
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
                  className="studio-dm-peer-action"
                  onClick={onOpenOffersJobs}
                >
                  <ExternalLink aria-hidden="true" />
                  <span>Open in Offers</span>
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {(jobsWithPeer?.asBuyer.length ?? 0) > 0 ? (
                <section className="studio-dm-peer-section">
                  <header>My orders from them</header>
                  <ul>
                    {jobsWithPeer!.asBuyer.map((job) => (
                      <li key={job._id}>
                        <button
                          type="button"
                          className="studio-dm-peer-job-row"
                          onClick={() => setJobDetailId(job._id)}
                        >
                          <strong>{job.offerTitle}</strong>
                          <span>
                            {JOB_STATUS_LABEL[job.status] ?? job.status} ·{" "}
                            {creditsLabel(job.priceCredits)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {(offers?.length ?? 0) > 0 ? (
                <section className="studio-dm-peer-section">
                  <header>Request a job</header>
                  <ul>
                    {offers!.map((offer) => (
                      <li key={offer._id} className="studio-dm-peer-offer-row">
                        <div>
                          <strong>{offer.title}</strong>
                          <span>
                            from {centsLabel(offer.priceCents)} ·{" "}
                            {offer.deliveryDays}d
                          </span>
                        </div>
                        <button
                          type="button"
                          className="studio-dm-peer-book"
                          disabled={busy}
                          onClick={() => void handleBook(offer._id)}
                        >
                          {bookingOfferId === offer._id ? (
                            <Loader2
                              className="h-3.5 w-3.5 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            "Book"
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {(jobsWithPeer?.asSeller.length ?? 0) > 0 ? (
                <section className="studio-dm-peer-section">
                  <header>Their orders from me</header>
                  {jobsWithPeer?.sellerTotals ? (
                    <p className="studio-dm-peer-totals">
                      {jobsWithPeer.sellerTotals.jobCount} job
                      {jobsWithPeer.sellerTotals.jobCount === 1 ? "" : "s"} ·{" "}
                      {creditsLabel(jobsWithPeer.sellerTotals.totalCredits)}{" "}
                      lifetime
                    </p>
                  ) : null}
                  <ul>
                    {jobsWithPeer!.asSeller.map((job) => (
                      <li key={job._id}>
                        <button
                          type="button"
                          className="studio-dm-peer-job-row"
                          onClick={() => setJobDetailId(job._id)}
                        >
                          <strong>{job.offerTitle}</strong>
                          <span>
                            {JOB_STATUS_LABEL[job.status] ?? job.status} ·{" "}
                            {creditsLabel(job.priceCredits)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {onOpenOffersJobs ? (
                    <button
                      type="button"
                      className="studio-dm-peer-action is-ghost"
                      onClick={onOpenOffersJobs}
                    >
                      <ExternalLink aria-hidden="true" />
                      <span>Manage in Offers</span>
                    </button>
                  ) : null}
                </section>
              ) : null}

              {jobsWithPeer !== undefined &&
              offers !== undefined &&
              jobsWithPeer.asBuyer.length === 0 &&
              jobsWithPeer.asSeller.length === 0 &&
              offers.length === 0 ? (
                <p className="studio-dm-peer-empty">No jobs with this person.</p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {tab === "labels" ? (
        <div className="studio-dm-peer-labels">
          <button
            type="button"
            className="studio-dm-peer-action is-ghost"
            onClick={() => setLabelEditorOpen(true)}
          >
            <Plus aria-hidden="true" />
            <span>New label</span>
          </button>
          {panel === undefined ? (
            <p className="studio-dm-peer-empty">Loading…</p>
          ) : panel === null ? (
            <p className="studio-dm-peer-empty">Profile unavailable.</p>
          ) : panel.labels.length === 0 ? (
            <p className="studio-dm-peer-empty">
              No labels yet. Create one to organize this chat.
            </p>
          ) : (
            <ul className="studio-dm-peer-label-list" role="listbox" aria-multiselectable>
              {panel.labels.map((label) => (
                <li key={label.labelId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={label.assigned}
                    className={`studio-dm-peer-label-row${label.assigned ? " is-on" : ""}`}
                    onClick={() =>
                      void handleToggleLabel(label.labelId, label.assigned)
                    }
                  >
                    <span className="studio-dm-peer-label-check" aria-hidden="true">
                      {label.assigned ? <Check /> : null}
                    </span>
                    {createElement(dmLabelIcon(label.icon), {
                      "aria-hidden": true,
                    })}
                    <span>{label.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <StudioDmLabelEditorDialog
            open={labelEditorOpen}
            variant="modal"
            onClose={() => setLabelEditorOpen(false)}
          />
        </div>
      ) : null}

      {tab === "about" ? (
        <div className="studio-dm-peer-about">
          {panel === undefined ? (
            <p className="studio-dm-peer-empty">Loading…</p>
          ) : panel === null ? (
            <p className="studio-dm-peer-empty">Profile unavailable.</p>
          ) : (
            <>
              <div className="studio-dm-peer-about-identity">
                <StudioProfileAvatar
                  size="md"
                  src={panel.peer.avatarUrl}
                  displayName={panel.peer.displayName}
                  name={panel.peer.username}
                  alt=""
                />
                <div>
                  <strong>
                    {panel.peer.displayName?.trim() ||
                      `@${panel.peer.username}`}
                    <StudioDmProviderTag tag={panel.sellerTag} />
                  </strong>
                  <span>@{panel.peer.username}</span>
                  {panel.businessName ? (
                    <span className="studio-dm-peer-biz">{panel.businessName}</span>
                  ) : null}
                </div>
              </div>
              {panel.peer.bio ? (
                <p className="studio-dm-peer-bio">{panel.peer.bio}</p>
              ) : null}
              <dl className="studio-dm-peer-stats">
                <div>
                  <dt>Followers</dt>
                  <dd>{panel.social.followerCount}</dd>
                </div>
                <div>
                  <dt>Following</dt>
                  <dd>{panel.social.followingCount}</dd>
                </div>
                <div>
                  <dt>Posts</dt>
                  <dd>{panel.social.postCount}</dd>
                </div>
              </dl>
              {panel.sellerStats ? (
                <dl className="studio-dm-peer-stats is-seller">
                  <div>
                    <dt>Jobs done</dt>
                    <dd>{panel.sellerStats.completedJobs}</dd>
                  </div>
                  <div>
                    <dt>Rating</dt>
                    <dd>
                      {panel.sellerStats.ratingAverage != null
                        ? `${panel.sellerStats.ratingAverage} (${panel.sellerStats.ratingCount})`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Offers</dt>
                    <dd>{panel.sellerStats.publishedOfferCount}</dd>
                  </div>
                </dl>
              ) : null}
              {panel.contactLinks.length > 0 ? (
                <ul className="studio-dm-peer-contacts">
                  {panel.contactLinks.map((link) => (
                    <li key={`${link.type}:${link.value}`}>
                      <a href={link.href} target="_blank" rel="noreferrer">
                        {link.label || link.type}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="studio-dm-peer-about-actions">
                <button
                  type="button"
                  className="studio-dm-peer-action"
                  onClick={() => onOpenProfile?.(panel.peer.username)}
                >
                  <UserRound aria-hidden="true" />
                  <span>Open profile</span>
                </button>
                <button
                  type="button"
                  className={`studio-dm-peer-action${panel.blocked ? "" : " is-danger"}`}
                  disabled={busy}
                  onClick={() => void handleBlockToggle()}
                >
                  <Ban aria-hidden="true" />
                  <span>{panel.blocked ? "Unblock" : "Block"}</span>
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </>
  );

  const header = (
    <header className="cursor-panel-head cursor-sidebar-head studio-dm-peer-head justify-between">
      <nav className="studio-dm-peer-tabs" role="tablist" aria-label="Peer panel">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className={`studio-dm-peer-tab${tab === item.id ? " is-active" : ""}`}
            aria-selected={tab === item.id}
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
      <button
        type="button"
        className="cursor-icon-btn cursor-icon-btn-sm studio-panel-close"
        onClick={onClose}
        aria-label="Close peer panel"
      >
        <X aria-hidden="true" />
      </button>
    </header>
  );

  const panelNode = (
    <aside className="studio-dm-peer-sidebar" aria-label="Chat details">
      {header}
      <div className="studio-dm-peer-body">{body}</div>
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
            <X aria-hidden="true" />
          </button>
        </div>
        <nav
          className="studio-dm-peer-tabs is-mobile"
          role="tablist"
          aria-label="Peer panel"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              className={`studio-dm-peer-tab${tab === item.id ? " is-active" : ""}`}
              aria-selected={tab === item.id}
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
        <div className="studio-mobile-app-menu-body studio-dm-peer-body">
          {body}
        </div>
      </div>,
      portalRoot,
    );
  }

  return panelNode;
}
