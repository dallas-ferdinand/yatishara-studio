"use client";

import { useMutation, useQuery } from "convex/react";
import {
  AlignLeft,
  ArrowLeft,
  CalendarDays,
  FileBadge,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Plus,
  RotateCcw,
  Award,
  Star,
  Tag,
  Trash2,
  Wallet,
  Clock,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CursorSelect } from "@/desk/components/CursorSelect";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { formatTtdCents } from "@/studio/lib/money";
import { IconField, IconTextarea } from "./MarketplaceIconField";
import { SellerAccessApplicationForm } from "./SellerAccessApplicationForm";
import "./marketplace-offers-pane.css";

type MarketplaceOffersPaneProps = {
  onOpenCredits: () => void;
  creditPriceCents?: number;
};

type View =
  | { kind: "home" }
  | { kind: "offer"; offerId: Id<"marketplaceOffers"> }
  | { kind: "job"; jobId: Id<"marketplaceJobs"> }
  | { kind: "create" };

type HomeTab = "offers" | "jobs";
type JobFilter = "all" | "sell" | "buy";
type OfferEditorTab = "details" | "packages" | "media" | "jobs";

const GOOD_STATUSES = new Set(["published", "completed", "approved", "paid"]);
const BAD_STATUSES = new Set([
  "cancelled",
  "refunded",
  "suspended",
  "archived",
]);

function humanStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function StatusChip({ status }: { status: string }) {
  const tone = GOOD_STATUSES.has(status)
    ? " is-good"
    : BAD_STATUSES.has(status)
      ? " is-bad"
      : "";
  return (
    <span className={`marketplace-status-chip${tone}`}>
      {humanStatus(status)}
    </span>
  );
}

function OffersHead({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="studio-admin-head">
      <nav className="studio-admin-head-tabs" aria-label="Offers sections">
        {children}
      </nav>
      {action ? <div className="marketplace-offers-head-action">{action}</div> : null}
    </header>
  );
}

function Section({
  title,
  extras,
  children,
}: {
  title: string;
  extras?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="studio-admin-section">
      <div className="studio-admin-section-head">
        <span className="studio-admin-section-title">{title}</span>
        {extras ? (
          <div className="studio-admin-section-extras">{extras}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function SummaryChip({
  label,
  value,
  body,
}: {
  label: string;
  value: ReactNode;
  body: string;
}) {
  return (
    <article className="marketplace-offers-summary-chip" title={body}>
      <strong className="marketplace-offers-summary-value">{value}</strong>
      <span className="marketplace-offers-summary-label">{label}</span>
    </article>
  );
}

function SummaryRow({ children }: { children: ReactNode }) {
  return <section className="marketplace-offers-summary">{children}</section>;
}

type JobCardModel = {
  _id: Id<"marketplaceJobs">;
  offerTitle: string;
  packageName?: string;
  priceCents: number;
  deliveryDays?: number;
  status: string;
  createdAt: number;
  sideLabel: string;
};

function JobCard({
  job,
  onOpen,
}: {
  job: JobCardModel;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="marketplace-job-card"
      onClick={onOpen}
    >
      <div className="marketplace-job-card-top">
        <div>
          <h3 className="marketplace-job-card-title">{job.offerTitle}</h3>
          <p className="marketplace-job-card-sub">
            {job.sideLabel}
            {job.packageName ? ` · ${job.packageName}` : ""}
          </p>
        </div>
        <span className="marketplace-job-card-price">
          {formatTtdCents(job.priceCents)}
        </span>
      </div>
      <div className="marketplace-job-card-meta">
        <StatusChip status={job.status} />
        {job.deliveryDays != null ? (
          <span className="marketplace-job-chip">
            <Clock aria-hidden="true" />
            {job.deliveryDays} day delivery
          </span>
        ) : null}
        <span className="marketplace-job-chip">
          Booked {new Date(job.createdAt).toLocaleDateString()}
        </span>
      </div>
    </button>
  );
}

function JobsCardGrid({
  jobs,
  onOpen,
}: {
  jobs: JobCardModel[];
  onOpen: (jobId: Id<"marketplaceJobs">) => void;
}) {
  return (
    <ul className="marketplace-job-grid">
      {jobs.map((job) => (
        <li key={job._id}>
          <JobCard job={job} onOpen={() => onOpen(job._id)} />
        </li>
      ))}
    </ul>
  );
}

/** Editable tier, held as strings so partial numeric input never fights the user. */
type PackageDraft = {
  name: string;
  description: string;
  priceTtd: string;
  deliveryDays: string;
  revisions: string;
  features: string;
};

const PACKAGE_PRESET_NAMES = ["Basic", "Standard", "Premium"] as const;

function emptyPackageDraft(index: number): PackageDraft {
  return {
    name: PACKAGE_PRESET_NAMES[index] ?? `Package ${index + 1}`,
    description: "",
    priceTtd: "50",
    deliveryDays: "5",
    revisions: "1",
    features: "",
  };
}

function packageDraftsToArgs(drafts: PackageDraft[]) {
  return drafts.map((draft) => ({
    name: draft.name,
    description: draft.description,
    priceCents: Math.round(Number(draft.priceTtd) * 100),
    deliveryDays: Number(draft.deliveryDays) || 1,
    revisions: Number(draft.revisions) || 0,
    features: draft.features
      .split("\n")
      .map((feature) => feature.trim())
      .filter(Boolean),
  }));
}

function packagesToDrafts(
  packages:
    | Array<{
        name: string;
        description: string;
        priceCents: number;
        deliveryDays: number;
        revisions: number;
        features: string[];
      }>
    | undefined,
): PackageDraft[] {
  return (packages ?? []).map((pkg) => ({
    name: pkg.name,
    description: pkg.description,
    priceTtd: String(pkg.priceCents / 100),
    deliveryDays: String(pkg.deliveryDays),
    revisions: String(pkg.revisions),
    features: pkg.features.join("\n"),
  }));
}

function PackagesEditor({
  drafts,
  onChange,
}: {
  drafts: PackageDraft[];
  onChange: (next: PackageDraft[]) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const safeIndex =
    drafts.length === 0 ? 0 : Math.min(activeIndex, drafts.length - 1);
  const draft = drafts[safeIndex];

  function patch(part: Partial<PackageDraft>) {
    onChange(
      drafts.map((d, i) => (i === safeIndex ? { ...d, ...part } : d)),
    );
  }

  function addPackage() {
    if (drafts.length >= 3) return;
    onChange([...drafts, emptyPackageDraft(drafts.length)]);
    setActiveIndex(drafts.length);
  }

  function removeActive() {
    const next = drafts.filter((_, i) => i !== safeIndex);
    onChange(next);
    setActiveIndex(Math.max(0, safeIndex - 1));
  }

  if (drafts.length === 0) {
    return (
      <div className="marketplace-offers-packages">
        <div className="marketplace-offers-pkg-empty">
          <p className="marketplace-offers-bar-note">
            Flat rate on Details right now. Add up to three tiers — Basic,
            Standard, Premium — each with its own price, delivery, and
            revisions.
          </p>
          <button
            type="button"
            className="marketplace-offers-bar-action"
            onClick={addPackage}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add first package
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="marketplace-offers-packages">
      <div
        className="marketplace-offers-pkg-tabs"
        role="tablist"
        aria-label="Package tiers"
      >
        {drafts.map((pkg, index) => {
          const priceLabel =
            pkg.priceTtd.trim() !== "" && !Number.isNaN(Number(pkg.priceTtd))
              ? formatTtdCents(Math.round(Number(pkg.priceTtd) * 100))
              : "—";
          return (
            <button
              key={index}
              type="button"
              role="tab"
              aria-selected={index === safeIndex}
              className={`marketplace-offers-pkg-tab${index === safeIndex ? " is-active" : ""}`}
              onClick={() => setActiveIndex(index)}
            >
              <strong>{pkg.name.trim() || PACKAGE_PRESET_NAMES[index] || `Tier ${index + 1}`}</strong>
              <span>{priceLabel}</span>
            </button>
          );
        })}
        {drafts.length < 3 ? (
          <button
            type="button"
            className="marketplace-offers-pkg-tab is-add"
            onClick={addPackage}
            aria-label="Add package"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add
          </button>
        ) : null}
      </div>

      {draft ? (
        <div
          className="marketplace-offers-pkg-panel"
          role="tabpanel"
          aria-label={draft.name || `Package ${safeIndex + 1}`}
        >
          <div className="marketplace-offers-package-head">
            <IconField
              icon={FileBadge}
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder={`Name — e.g. ${PACKAGE_PRESET_NAMES[safeIndex] ?? "Custom"}`}
              aria-label="Package name"
            />
            <button
              type="button"
              className="marketplace-offers-bar-action"
              onClick={removeActive}
              aria-label={`Remove ${draft.name || `package ${safeIndex + 1}`}`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <IconTextarea
            icon={AlignLeft}
            value={draft.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="What this tier includes"
            aria-label="Package description"
          />
          <div className="marketplace-optional-row">
            <IconField
              icon={Wallet}
              value={draft.priceTtd}
              onChange={(e) => patch({ priceTtd: e.target.value })}
              placeholder="Price (TTD)"
              aria-label="Package price in TTD"
            />
            <IconField
              icon={CalendarDays}
              value={draft.deliveryDays}
              onChange={(e) => patch({ deliveryDays: e.target.value })}
              placeholder="Delivery days"
              aria-label="Package delivery days"
            />
            <IconField
              icon={RotateCcw}
              value={draft.revisions}
              onChange={(e) => patch({ revisions: e.target.value })}
              placeholder="Revisions"
              aria-label="Package revisions"
            />
          </div>
          <IconTextarea
            icon={Plus}
            value={draft.features}
            onChange={(e) => patch({ features: e.target.value })}
            placeholder={
              "What's included — one per line\ne.g. Source files\nCommercial rights"
            }
            aria-label="Package features"
          />
        </div>
      ) : null}
    </div>
  );
}

type PickerAsset = {
  _id: Id<"assets">;
  name: string;
  kind: string;
  signedThumbnailUrl?: string;
};

function MediaAssetGrid({
  assets,
  isSelected,
  onPick,
  ariaLabel,
}: {
  assets: PickerAsset[];
  isSelected: (id: Id<"assets">) => boolean;
  onPick: (id: Id<"assets">) => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="marketplace-offers-asset-grid"
      role="group"
      aria-label={ariaLabel}
    >
      {assets.map((asset) => {
        const selected = isSelected(asset._id);
        return (
          <button
            key={asset._id}
            type="button"
            className={selected ? "is-selected" : undefined}
            aria-pressed={selected}
            onClick={() => onPick(asset._id)}
            title={asset.name}
          >
            {asset.signedThumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={asset.signedThumbnailUrl} alt="" />
            ) : (
              <span className="marketplace-offers-thumb" aria-hidden="true" />
            )}
            <span>{asset.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function OfferMediaEditor({
  assets,
  coverAssetId,
  sampleAssetIds,
  onCover,
  onToggleSample,
}: {
  assets: PickerAsset[] | undefined;
  coverAssetId: Id<"assets"> | null;
  sampleAssetIds: Id<"assets">[];
  onCover: (id: Id<"assets"> | null) => void;
  onToggleSample: (id: Id<"assets">) => void;
}) {
  if (!assets) {
    return <p className="studio-settings-empty">Loading assets…</p>;
  }
  if (assets.length === 0) {
    return (
      <p className="studio-settings-empty">
        No ready assets yet — upload images or video in Explorer first.
      </p>
    );
  }
  return (
    <div className="marketplace-offers-media">
      <div>
        <p className="marketplace-offers-media-label">
          <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
          Banner — the main image buyers see first
        </p>
        <MediaAssetGrid
          assets={assets}
          ariaLabel="Banner image"
          isSelected={(id) => id === coverAssetId}
          onPick={(id) => onCover(id === coverAssetId ? null : id)}
        />
      </div>
      <div>
        <p className="marketplace-offers-media-label">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Gallery — up to 6 samples, images or video ({sampleAssetIds.length}
          /6)
        </p>
        <MediaAssetGrid
          assets={assets}
          ariaLabel="Gallery samples"
          isSelected={(id) => sampleAssetIds.includes(id)}
          onPick={onToggleSample}
        />
      </div>
    </div>
  );
}

export function MarketplaceOffersPane({
  onOpenCredits,
  creditPriceCents: _creditPriceCents = 50,
}: MarketplaceOffersPaneProps) {
  const [view, setView] = useState<View>({ kind: "home" });
  const [homeTab, setHomeTab] = useState<HomeTab>("offers");
  const [jobFilter, setJobFilter] = useState<JobFilter>("all");
  const [offerEditorTab, setOfferEditorTab] =
    useState<OfferEditorTab>("details");
  const [busy, setBusy] = useState(false);
  const [reapplyRejected, setReapplyRejected] = useState(false);

  const seller = useQuery(api.marketplace.getMySellerStatus);
  const myOffers = useQuery(
    api.marketplace.listMyOffers,
    seller?.status === "approved" ? {} : "skip",
  );
  const sellerJobs = useQuery(
    api.marketplace.listMySellerJobs,
    seller?.status === "approved" ? {} : "skip",
  );
  const buyerJobs = useQuery(api.marketplace.listMyBuyerJobs);

  const cancelSellerRequest = useMutation(api.marketplace.cancelSellerRequest);
  const createOffer = useMutation(api.marketplace.createOffer);
  const setOfferStatus = useMutation(api.marketplace.setOfferStatus);
  const updateOffer = useMutation(api.marketplace.updateOffer);
  const deliverJob = useMutation(api.marketplace.deliverJobAssets);
  const acceptJob = useMutation(api.marketplace.acceptJobDelivery);
  const cancelJob = useMutation(api.marketplace.cancelJobBeforeDelivery);
  const submitReview = useMutation(api.marketplace.submitJobReview);

  const jobDetail = useQuery(
    api.marketplace.getJob,
    view.kind === "job" ? { jobId: view.jobId } : "skip",
  );

  const jobIdForAssets = view.kind === "job" ? view.jobId : null;
  // Asset picker is used for delivering jobs and for offer banner/gallery.
  const assetPickerKey =
    view.kind === "job"
      ? `job:${view.jobId}`
      : view.kind === "create"
        ? "create"
        : view.kind === "offer"
          ? `offer:${view.offerId}`
          : null;
  // Signed-URL window is stamped per view outside render so it stays stable.
  const [assetUrlExpiresUnix, setAssetUrlExpiresUnix] = useState<number | null>(
    null,
  );
  useEffect(() => {
    setAssetUrlExpiresUnix(
      assetPickerKey ? Math.floor(Date.now() / 1000) + 60 * 60 : null,
    );
  }, [assetPickerKey]);

  const recentAssets = useQuery(
    api.assets.listRecentReady,
    assetPickerKey !== null &&
      assetUrlExpiresUnix !== null &&
      (view.kind !== "job" || jobDetail?.job.role === "seller")
      ? { limit: 24, expiresUnix: assetUrlExpiresUnix }
      : "skip",
  );

  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    priceTtd: "50",
    deliveryDays: "5",
    category: "ads",
  });
  const [createPackages, setCreatePackages] = useState<PackageDraft[]>([]);
  const [createCoverAssetId, setCreateCoverAssetId] =
    useState<Id<"assets"> | null>(null);
  const [createSampleAssetIds, setCreateSampleAssetIds] = useState<
    Id<"assets">[]
  >([]);
  const [editForm, setEditForm] = useState<{
    title: string;
    description: string;
    priceTtd: string;
    deliveryDays: string;
    category: string;
    packages: PackageDraft[];
    coverAssetId: Id<"assets"> | null;
    sampleAssetIds: Id<"assets">[];
  } | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Id<"assets">[]>([]);
  const [deliverNote, setDeliverNote] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");

  const selectedOffer = useMemo(() => {
    if (view.kind !== "offer" || !myOffers) return null;
    return myOffers.find((o) => o._id === view.offerId) ?? null;
  }, [view, myOffers]);

  const allJobs = useMemo(() => {
    const sell = (sellerJobs ?? []).map((job) => ({
      ...job,
      _role: "sell" as const,
    }));
    const buy = (buyerJobs ?? []).map((job) => ({
      ...job,
      _role: "buy" as const,
    }));
    return [...sell, ...buy].sort((a, b) => b.createdAt - a.createdAt);
  }, [sellerJobs, buyerJobs]);

  const visibleJobs = useMemo(
    () =>
      jobFilter === "all"
        ? allJobs
        : allJobs.filter((job) => job._role === jobFilter),
    [allJobs, jobFilter],
  );

  useEffect(() => {
    if (!selectedOffer) {
      setEditForm(null);
      return;
    }
    setEditForm({
      title: selectedOffer.title,
      description: selectedOffer.description,
      priceTtd: String(selectedOffer.priceCents / 100),
      deliveryDays: String(selectedOffer.deliveryDays),
      category: selectedOffer.category ?? "",
      packages: packagesToDrafts(selectedOffer.packages),
      coverAssetId: selectedOffer.coverAssetId ?? null,
      sampleAssetIds: selectedOffer.sampleAssetIds ?? [],
    });
  }, [selectedOffer?._id, selectedOffer?.updatedAt]);

  useEffect(() => {
    setSelectedAssetIds([]);
    setDeliverNote("");
    setReviewRating(5);
    setReviewBody("");
  }, [jobIdForAssets]);

  function toggleAsset(id: Id<"assets">) {
    setSelectedAssetIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleCancelSellerRequest() {
    setBusy(true);
    try {
      await cancelSellerRequest({});
      toast.success("Seller request cancelled");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not cancel request."));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateOffer() {
    setBusy(true);
    try {
      const packages = packageDraftsToArgs(createPackages);
      const priceCents =
        packages.length > 0
          ? packages[0].priceCents
          : Math.round(Number(createForm.priceTtd) * 100);
      const offerId = await createOffer({
        title: createForm.title,
        description: createForm.description,
        priceCents,
        deliveryDays:
          packages.length > 0
            ? packages[0].deliveryDays
            : Number(createForm.deliveryDays) || 5,
        category: createForm.category || undefined,
        packages: packages.length > 0 ? packages : undefined,
        coverAssetId: createCoverAssetId ?? undefined,
        sampleAssetIds:
          createSampleAssetIds.length > 0 ? createSampleAssetIds : undefined,
      });
      toast.success("Draft offer created");
      setView({ kind: "offer", offerId });
      setOfferEditorTab("details");
      setCreateForm({
        title: "",
        description: "",
        priceTtd: "50",
        deliveryDays: "5",
        category: "ads",
      });
      setCreatePackages([]);
      setCreateCoverAssetId(null);
      setCreateSampleAssetIds([]);
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not create offer."));
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish(
    offerId: Id<"marketplaceOffers">,
    statusValue: "published" | "paused" | "archived" | "draft",
  ) {
    setBusy(true);
    try {
      await setOfferStatus({ offerId, status: statusValue });
      toast.success(`Offer ${statusValue}`);
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not update offer."));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveOffer() {
    if (!selectedOffer || !editForm) return;
    setBusy(true);
    try {
      const packages = packageDraftsToArgs(editForm.packages);
      await updateOffer({
        offerId: selectedOffer._id,
        title: editForm.title,
        description: editForm.description,
        priceCents:
          packages.length > 0
            ? packages[0].priceCents
            : Math.round(Number(editForm.priceTtd) * 100),
        deliveryDays:
          packages.length > 0
            ? packages[0].deliveryDays
            : Number(editForm.deliveryDays) || 5,
        category: editForm.category || undefined,
        packages: packages.length > 0 ? packages : null,
        coverAssetId: editForm.coverAssetId,
        sampleAssetIds: editForm.sampleAssetIds,
      });
      toast.success("Offer saved");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not save offer."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeliver() {
    if (view.kind !== "job") return;
    if (!selectedAssetIds.length) {
      toast.error("Select one or more assets to deliver.");
      return;
    }
    setBusy(true);
    try {
      await deliverJob({
        jobId: view.jobId,
        assetIds: selectedAssetIds,
        note: deliverNote || undefined,
      });
      toast.success("Delivery submitted");
      setSelectedAssetIds([]);
      setDeliverNote("");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Delivery failed."));
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept() {
    if (view.kind !== "job") return;
    setBusy(true);
    try {
      await acceptJob({ jobId: view.jobId });
      toast.success("Delivery accepted");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Accept failed."));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (view.kind !== "job") return;
    setBusy(true);
    try {
      await cancelJob({ jobId: view.jobId });
      toast.success("Job cancelled; escrow refunded");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Cancel failed."));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitReview() {
    if (view.kind !== "job") return;
    setBusy(true);
    try {
      await submitReview({
        jobId: view.jobId,
        rating: reviewRating,
        body: reviewBody.trim() || undefined,
      });
      toast.success("Thanks — your review is live");
      setReviewBody("");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not submit review."));
    } finally {
      setBusy(false);
    }
  }

  function goHome() {
    setView({ kind: "home" });
    setOfferEditorTab("details");
  }

  function openCreate() {
    setOfferEditorTab("details");
    setView({ kind: "create" });
  }

  function openOffer(offerId: Id<"marketplaceOffers">) {
    setOfferEditorTab("details");
    setView({ kind: "offer", offerId });
  }

  const isApplyFlow =
    seller === undefined || !seller || seller.status !== "approved";

  if (view.kind === "home" && isApplyFlow) {
    if (seller === undefined) {
      return (
        <div className="marketplace-apply-pane">
          <header className="marketplace-apply-head">
            <nav className="studio-admin-head-tabs" aria-label="Offers">
              <span className="studio-admin-head-tab is-active">Offers</span>
            </nav>
          </header>
          <div className="marketplace-apply-body">
            <div className="marketplace-apply-stage">
              <p className="marketplace-status-empty">Loading…</p>
            </div>
          </div>
        </div>
      );
    }
    if (!seller) {
      return <SellerAccessApplicationForm busy={busy} setBusy={setBusy} />;
    }
    if (seller.status === "rejected" && reapplyRejected) {
      return <SellerAccessApplicationForm busy={busy} setBusy={setBusy} />;
    }
    if (seller.status === "rejected") {
      return (
        <div className="marketplace-apply-pane">
          <header className="marketplace-apply-head">
            <nav className="studio-admin-head-tabs" aria-label="Seller status">
              <span className="studio-admin-head-tab is-active">Application rejected</span>
            </nav>
          </header>
          <div className="marketplace-apply-body">
            <div className="marketplace-apply-stage">
              <div className="marketplace-apply-intro">
                <Award
                  className="marketplace-apply-intro-icon"
                  aria-hidden="true"
                />
                <h2>{seller.businessName}</h2>
                <p>
                  {seller.rejectionReason
                    ? `Rejected: ${seller.rejectionReason}`
                    : "Your seller application was rejected."}
                </p>
              </div>
              <div className="marketplace-status-actions">
                <StatusChip status={seller.status} />
                <button
                  type="button"
                  className="marketplace-status-cancel"
                  onClick={() => setReapplyRejected(true)}
                >
                  Apply again
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="marketplace-apply-pane">
        <header className="marketplace-apply-head">
          <nav className="studio-admin-head-tabs" aria-label="Seller status">
            <span className="studio-admin-head-tab is-active">
              {seller.status === "pending" ? "In review" : "Seller access"}
            </span>
          </nav>
        </header>
        <div className="marketplace-apply-body">
          <div className="marketplace-apply-stage">
            <div className="marketplace-apply-intro">
              <Award
                className="marketplace-apply-intro-icon"
                aria-hidden="true"
              />
              <h2>{seller.businessName}</h2>
              <p>
                {seller.status === "pending"
                  ? "In review — you’ll sell once approved."
                  : "Seller access is suspended."}
              </p>
            </div>
            <div className="marketplace-status-actions">
              <StatusChip status={seller.status} />
              {seller.status === "pending" ? (
                <button
                  type="button"
                  className="marketplace-status-cancel"
                  disabled={busy}
                  onClick={() => void handleCancelSellerRequest()}
                >
                  {busy ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : null}
                  Cancel request
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const offers = myOffers ?? [];
  const liveOffers = offers.filter(
    (offer) => offer.status === "published",
  ).length;
  const draftOffers = offers.filter((offer) => offer.status === "draft").length;
  const openJobs = allJobs.filter(
    (job) => job.status === "in_escrow" || job.status === "in_progress",
  ).length;
  const deliveredJobs = allJobs.filter(
    (job) => job.status === "delivered",
  ).length;
  const completedJobs = allJobs.filter(
    (job) => job.status === "completed",
  ).length;
  const jobsLoading = !sellerJobs || !buyerJobs;

  return (
    <div className="studio-admin-panel">
      {view.kind === "home" ? (
        <OffersHead
          action={
            homeTab === "offers" ? (
              <button
                type="button"
                className="marketplace-offers-bar-action"
                onClick={openCreate}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                New offer
              </button>
            ) : (
              <button
                type="button"
                className="marketplace-offers-bar-action"
                onClick={onOpenCredits}
              >
                <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                Balance
              </button>
            )
          }
        >
          <button
            type="button"
            className={`studio-admin-head-tab${homeTab === "offers" ? " is-active" : ""}`}
            onClick={() => setHomeTab("offers")}
          >
            Offers
          </button>
          <button
            type="button"
            className={`studio-admin-head-tab${homeTab === "jobs" ? " is-active" : ""}`}
            onClick={() => setHomeTab("jobs")}
          >
            <Award className="h-3.5 w-3.5" aria-hidden="true" />
            Jobs
          </button>
        </OffersHead>
      ) : view.kind === "create" || view.kind === "offer" ? (
        <OffersHead
          action={
            view.kind === "create" ? (
              <button
                type="button"
                className="marketplace-offers-bar-action"
                disabled={busy || !createForm.title.trim()}
                onClick={() => void handleCreateOffer()}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                Create draft
              </button>
            ) : (
              <button
                type="button"
                className="marketplace-offers-bar-action"
                disabled={busy || !editForm}
                onClick={() => void handleSaveOffer()}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                Save
              </button>
            )
          }
        >
          <button
            type="button"
            className="studio-admin-head-tab"
            onClick={goHome}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back
          </button>
          <button
            type="button"
            className={`studio-admin-head-tab${offerEditorTab === "details" ? " is-active" : ""}`}
            onClick={() => setOfferEditorTab("details")}
          >
            Details
          </button>
          <button
            type="button"
            className={`studio-admin-head-tab${offerEditorTab === "packages" ? " is-active" : ""}`}
            onClick={() => setOfferEditorTab("packages")}
          >
            Packages
          </button>
          <button
            type="button"
            className={`studio-admin-head-tab${offerEditorTab === "media" ? " is-active" : ""}`}
            onClick={() => setOfferEditorTab("media")}
          >
            Media
          </button>
          {view.kind === "offer" ? (
            <button
              type="button"
              className={`studio-admin-head-tab${offerEditorTab === "jobs" ? " is-active" : ""}`}
              onClick={() => setOfferEditorTab("jobs")}
            >
              <Award className="h-3.5 w-3.5" aria-hidden="true" />
              Jobs
            </button>
          ) : null}
        </OffersHead>
      ) : (
        <OffersHead>
          <button
            type="button"
            className="studio-admin-head-tab"
            onClick={goHome}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back
          </button>
          <span className="studio-admin-head-tab is-active">Job</span>
        </OffersHead>
      )}

      <div className="studio-admin-body">
        <div className="studio-admin-workspace">
          {view.kind === "home" && homeTab === "offers" ? (
            <div className="studio-admin-stack">
              <SummaryRow>
                <SummaryChip
                  label="Live"
                  value={liveOffers}
                  body="Published packages buyers can book right now."
                />
                <SummaryChip
                  label="Drafts"
                  value={draftOffers}
                  body="Not visible yet — publish when the copy is ready."
                />
                <SummaryChip
                  label="Open jobs"
                  value={openJobs}
                  body="Booked work in escrow or in progress."
                />
              </SummaryRow>

              <Section title="Your offers">
                <div className="studio-admin-table-wrap">
                  {!myOffers ? (
                    <Loader2 className="m-4 h-4 w-4 animate-spin" />
                  ) : offers.length === 0 ? (
                    <p className="studio-settings-empty marketplace-offers-table-empty">
                      No offers yet — create your first package.
                    </p>
                  ) : (
                    <table className="studio-admin-table">
                      <thead>
                        <tr>
                          <th>Offer</th>
                          <th>Price</th>
                          <th>Delivery</th>
                          <th>Status</th>
                          <th>Public link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {offers.map((offer) => (
                          <tr
                            key={offer._id}
                            onClick={() => openOffer(offer._id)}
                          >
                            <td>
                              <strong>{offer.title}</strong>
                              <span>{offer.category ?? "Uncategorised"}</span>
                            </td>
                            <td>{formatTtdCents(offer.priceCents)}</td>
                            <td>{offer.deliveryDays} days</td>
                            <td>
                              <StatusChip status={offer.status} />
                            </td>
                            <td>
                              <a
                                href={`/creative-network/${offer.slug}/`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                              >
                                /creative-network/{offer.slug}/
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Section>
            </div>
          ) : null}

          {view.kind === "home" && homeTab === "jobs" ? (
            <div className="studio-admin-stack">
              <SummaryRow>
                <SummaryChip
                  label="Open"
                  value={openJobs}
                  body="Payment held until the work is accepted."
                />
                <SummaryChip
                  label="Delivered"
                  value={deliveredJobs}
                  body="Waiting on buyer acceptance or auto-accept."
                />
                <SummaryChip
                  label="Completed"
                  value={completedJobs}
                  body="Escrow released and payout recorded."
                />
              </SummaryRow>

              <Section
                title="Jobs"
                extras={
                  <CursorSelect
                    ariaLabel="Job side"
                    value={jobFilter}
                    onChange={(next) => setJobFilter(next as JobFilter)}
                    options={[
                      { value: "all", label: "All" },
                      { value: "sell", label: "Selling" },
                      { value: "buy", label: "Buying" },
                    ]}
                  />
                }
              >
                {jobsLoading ? (
                  <Loader2 className="m-4 h-4 w-4 animate-spin" />
                ) : visibleJobs.length === 0 ? (
                  <p className="studio-settings-empty marketplace-offers-table-empty">
                    {allJobs.length === 0
                      ? "No jobs yet."
                      : "No jobs on this side of the marketplace."}
                  </p>
                ) : (
                  <JobsCardGrid
                    jobs={visibleJobs.map((job) => ({
                      _id: job._id,
                      offerTitle: job.offerTitle,
                      packageName: job.packageName,
                      priceCents: job.priceCents,
                      deliveryDays: job.deliveryDays,
                      status: job.status,
                      createdAt: job.createdAt,
                      sideLabel:
                        job._role === "sell" ? "Selling" : "Buying",
                    }))}
                    onOpen={(jobId) => setView({ kind: "job", jobId })}
                  />
                )}
              </Section>
            </div>
          ) : null}

          {view.kind === "create" ? (
            <div className="studio-admin-stack">
              {offerEditorTab === "details" ? (
                <Section title="New offer">
                  <div className="studio-admin-card">
                    <div className="marketplace-profile-fields">
                      <IconField
                        icon={FileBadge}
                        value={createForm.title}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            title: e.target.value,
                          }))
                        }
                        placeholder="Title — e.g. 15s cartoon ad pack"
                        aria-label="Title"
                      />
                      <IconTextarea
                        icon={AlignLeft}
                        value={createForm.description}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            description: e.target.value,
                          }))
                        }
                        placeholder="What’s included, revisions, delivery notes"
                        aria-label="Description"
                      />
                      {createPackages.length === 0 ? (
                        <div className="marketplace-optional-row">
                          <IconField
                            icon={Wallet}
                            value={createForm.priceTtd}
                            onChange={(e) =>
                              setCreateForm((f) => ({
                                ...f,
                                priceTtd: e.target.value,
                              }))
                            }
                            placeholder="Price (TTD)"
                            aria-label="Price in TTD"
                          />
                          <IconField
                            icon={CalendarDays}
                            value={createForm.deliveryDays}
                            onChange={(e) =>
                              setCreateForm((f) => ({
                                ...f,
                                deliveryDays: e.target.value,
                              }))
                            }
                            placeholder="Delivery days"
                            aria-label="Delivery days"
                          />
                        </div>
                      ) : (
                        <p className="marketplace-offers-bar-note">
                          Pricing lives on Packages — switch tabs to edit tiers.
                        </p>
                      )}
                      <IconField
                        icon={Tag}
                        value={createForm.category}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            category: e.target.value,
                          }))
                        }
                        placeholder="Category"
                        aria-label="Category"
                      />
                    </div>
                    <div className="marketplace-offers-actions">
                      <button type="button" onClick={goHome}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </Section>
              ) : null}

              {offerEditorTab === "packages" ? (
                <Section title="Packages">
                  <div className="studio-admin-card">
                    <PackagesEditor
                      drafts={createPackages}
                      onChange={setCreatePackages}
                    />
                  </div>
                </Section>
              ) : null}

              {offerEditorTab === "media" ? (
                <Section title="Media">
                  <div className="studio-admin-card">
                    <OfferMediaEditor
                      assets={recentAssets}
                      coverAssetId={createCoverAssetId}
                      sampleAssetIds={createSampleAssetIds}
                      onCover={setCreateCoverAssetId}
                      onToggleSample={(id) =>
                        setCreateSampleAssetIds((prev) =>
                          prev.includes(id)
                            ? prev.filter((x) => x !== id)
                            : prev.length >= 6
                              ? prev
                              : [...prev, id],
                        )
                      }
                    />
                  </div>
                </Section>
              ) : null}
            </div>
          ) : null}

          {view.kind === "offer" && selectedOffer && editForm ? (
            <div className="studio-admin-stack">
              {offerEditorTab === "details" ? (
                <Section
                  title={selectedOffer.title}
                  extras={<StatusChip status={selectedOffer.status} />}
                >
                  <div className="studio-admin-card">
                    <p className="marketplace-offers-link">
                      <a
                        href={`/creative-network/${selectedOffer.slug}/`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        /creative-network/{selectedOffer.slug}/
                      </a>
                    </p>
                    <div className="marketplace-profile-fields">
                      <IconField
                        icon={FileBadge}
                        value={editForm.title}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f ? { ...f, title: e.target.value } : f,
                          )
                        }
                        placeholder="Title"
                        aria-label="Title"
                      />
                      <IconTextarea
                        icon={AlignLeft}
                        value={editForm.description}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f ? { ...f, description: e.target.value } : f,
                          )
                        }
                        placeholder="Description"
                        aria-label="Description"
                      />
                      {editForm.packages.length === 0 ? (
                        <div className="marketplace-optional-row">
                          <IconField
                            icon={Wallet}
                            value={editForm.priceTtd}
                            onChange={(e) =>
                              setEditForm((f) =>
                                f ? { ...f, priceTtd: e.target.value } : f,
                              )
                            }
                            placeholder="Price (TTD)"
                            aria-label="Price in TTD"
                          />
                          <IconField
                            icon={CalendarDays}
                            value={editForm.deliveryDays}
                            onChange={(e) =>
                              setEditForm((f) =>
                                f ? { ...f, deliveryDays: e.target.value } : f,
                              )
                            }
                            placeholder="Delivery days"
                            aria-label="Delivery days"
                          />
                        </div>
                      ) : (
                        <p className="marketplace-offers-bar-note">
                          Pricing lives on Packages — switch tabs to edit tiers.
                        </p>
                      )}
                      <IconField
                        icon={Tag}
                        value={editForm.category}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f ? { ...f, category: e.target.value } : f,
                          )
                        }
                        placeholder="Category"
                        aria-label="Category"
                      />
                    </div>
                    <div className="marketplace-offers-actions">
                      {selectedOffer.status !== "published" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void handlePublish(selectedOffer._id, "published")
                          }
                        >
                          Publish
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void handlePublish(selectedOffer._id, "paused")
                          }
                        >
                          Pause
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void handlePublish(selectedOffer._id, "archived")
                        }
                      >
                        Archive
                      </button>
                    </div>
                  </div>
                </Section>
              ) : null}

              {offerEditorTab === "packages" ? (
                <Section title="Packages">
                  <div className="studio-admin-card">
                    <PackagesEditor
                      drafts={editForm.packages}
                      onChange={(next) =>
                        setEditForm((f) => (f ? { ...f, packages: next } : f))
                      }
                    />
                    <p className="marketplace-offers-bar-note">
                      Package changes apply when you press Save.
                    </p>
                  </div>
                </Section>
              ) : null}

              {offerEditorTab === "media" ? (
                <Section title="Media">
                  <div className="studio-admin-card">
                    <OfferMediaEditor
                      assets={recentAssets}
                      coverAssetId={editForm.coverAssetId}
                      sampleAssetIds={editForm.sampleAssetIds}
                      onCover={(id) =>
                        setEditForm((f) =>
                          f ? { ...f, coverAssetId: id } : f,
                        )
                      }
                      onToggleSample={(id) =>
                        setEditForm((f) =>
                          f
                            ? {
                                ...f,
                                sampleAssetIds: f.sampleAssetIds.includes(id)
                                  ? f.sampleAssetIds.filter((x) => x !== id)
                                  : f.sampleAssetIds.length >= 6
                                    ? f.sampleAssetIds
                                    : [...f.sampleAssetIds, id],
                              }
                            : f,
                        )
                      }
                    />
                  </div>
                </Section>
              ) : null}

              {offerEditorTab === "jobs" ? (
                <Section title="Jobs on this offer">
                  {(sellerJobs ?? []).filter(
                    (j) => j.offerId === selectedOffer._id,
                  ).length === 0 ? (
                    <p className="studio-settings-empty marketplace-offers-table-empty">
                      No bookings on this offer yet.
                    </p>
                  ) : (
                    <JobsCardGrid
                      jobs={(sellerJobs ?? [])
                        .filter((j) => j.offerId === selectedOffer._id)
                        .map((job) => ({
                          _id: job._id,
                          offerTitle: job.offerTitle,
                          packageName: job.packageName,
                          priceCents: job.priceCents,
                          deliveryDays: job.deliveryDays,
                          status: job.status,
                          createdAt: job.createdAt,
                          sideLabel: "Selling",
                        }))}
                      onOpen={(jobId) => setView({ kind: "job", jobId })}
                    />
                  )}
                </Section>
              ) : null}
            </div>
          ) : null}

          {view.kind === "job" ? (
            !jobDetail ? (
              <p className="studio-settings-empty">Loading job…</p>
            ) : (
              <div className="studio-admin-stack">
                <SummaryRow>
                  <SummaryChip
                    label="Price"
                    value={formatTtdCents(jobDetail.job.priceCents)}
                    body={
                      jobDetail.job.role === "seller"
                        ? "Released to you on acceptance."
                        : "Held until you accept delivery."
                    }
                  />
                  {jobDetail.job.packageName ? (
                    <SummaryChip
                      label="Package"
                      value={jobDetail.job.packageName}
                      body="The tier the buyer booked."
                    />
                  ) : null}
                  {jobDetail.job.deliveryDays ? (
                    <SummaryChip
                      label="Delivery"
                      value={`${jobDetail.job.deliveryDays} days`}
                      body={
                        jobDetail.job.revisions != null
                          ? `${jobDetail.job.revisions} revision${jobDetail.job.revisions === 1 ? "" : "s"} included.`
                          : "Promised turnaround for this booking."
                      }
                    />
                  ) : null}
                  <SummaryChip
                    label="Booked"
                    value={new Date(
                      jobDetail.job.createdAt,
                    ).toLocaleDateString()}
                    body={new Date(
                      jobDetail.job.createdAt,
                    ).toLocaleTimeString()}
                  />
                </SummaryRow>

                <Section
                  title={jobDetail.job.offerTitle}
                  extras={
                    <>
                      <span className="marketplace-offers-bar-note">
                        {jobDetail.job.role === "seller" ? "Selling" : "Buying"}
                      </span>
                      <StatusChip status={jobDetail.job.status} />
                    </>
                  }
                >
                  <div className="studio-admin-card">
                    <h3>Timeline</h3>
                    <ol className="marketplace-offers-timeline">
                      {jobDetail.events.map((e) => (
                        <li key={e._id}>
                          <strong>{humanStatus(e.kind)}</strong>
                          {e.message ? <span>{e.message}</span> : null}
                          <time dateTime={new Date(e.createdAt).toISOString()}>
                            {new Date(e.createdAt).toLocaleString()}
                          </time>
                        </li>
                      ))}
                    </ol>
                  </div>
                </Section>

                <Section title="Deliverables">
                  <div className="studio-admin-card">
                    {jobDetail.deliverables.length === 0 ? (
                      <p className="studio-settings-empty">
                        Nothing delivered yet.
                      </p>
                    ) : (
                      <ul className="marketplace-offers-deliverables">
                        {jobDetail.deliverables.map((d) => (
                          <li key={d._id}>
                            {d.signedThumbnailUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={d.signedThumbnailUrl} alt="" />
                            ) : (
                              <span
                                className="marketplace-offers-thumb"
                                aria-hidden="true"
                              />
                            )}
                            <div>
                              {d.signedReadUrl ? (
                                <a
                                  href={d.signedReadUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {d.name ?? d.assetId}
                                </a>
                              ) : (
                                <span>{d.name ?? d.assetId}</span>
                              )}
                              {d.note ? <p>{d.note}</p> : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Section>

                {jobDetail.job.role === "seller" &&
                (jobDetail.job.status === "in_progress" ||
                  jobDetail.job.status === "delivered") ? (
                  <Section
                    title="Submit delivery"
                    extras={
                      selectedAssetIds.length ? (
                        <span className="marketplace-offers-bar-note">
                          {selectedAssetIds.length} selected
                        </span>
                      ) : undefined
                    }
                  >
                    <div className="studio-admin-card">
                      {!recentAssets ? (
                        <p className="studio-settings-empty">Loading assets…</p>
                      ) : recentAssets.length === 0 ? (
                        <p className="studio-settings-empty">
                          No ready assets yet — upload in Explorer first.
                        </p>
                      ) : (
                        <div
                          className="marketplace-offers-asset-grid"
                          role="group"
                          aria-label="Assets"
                        >
                          {recentAssets.map((asset) => {
                            const selected = selectedAssetIds.includes(
                              asset._id,
                            );
                            return (
                              <button
                                key={asset._id}
                                type="button"
                                className={selected ? "is-selected" : undefined}
                                aria-pressed={selected}
                                onClick={() => toggleAsset(asset._id)}
                                title={asset.name}
                              >
                                {asset.signedThumbnailUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={asset.signedThumbnailUrl} alt="" />
                                ) : (
                                  <span
                                    className="marketplace-offers-thumb"
                                    aria-hidden="true"
                                  />
                                )}
                                <span>{asset.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div className="marketplace-profile-fields">
                        <IconField
                          icon={MessageSquare}
                          value={deliverNote}
                          onChange={(e) => setDeliverNote(e.target.value)}
                          placeholder="Note (optional)"
                          aria-label="Delivery note (optional)"
                        />
                      </div>
                      <div className="marketplace-offers-actions">
                        <button
                          type="button"
                          className="is-primary"
                          disabled={busy || selectedAssetIds.length === 0}
                          onClick={() => void handleDeliver()}
                        >
                          Submit delivery
                        </button>
                      </div>
                    </div>
                  </Section>
                ) : null}

                {(jobDetail.job.role === "buyer" &&
                  jobDetail.job.status === "delivered") ||
                jobDetail.job.status === "in_progress" ||
                jobDetail.job.status === "in_escrow" ? (
                  <div className="marketplace-offers-actions">
                    {jobDetail.job.role === "buyer" &&
                    jobDetail.job.status === "delivered" ? (
                      <button
                        type="button"
                        className="is-primary"
                        disabled={busy}
                        onClick={() => void handleAccept()}
                      >
                        Accept delivery
                      </button>
                    ) : null}
                    {jobDetail.job.status === "in_progress" ||
                    jobDetail.job.status === "in_escrow" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleCancel()}
                      >
                        Cancel &amp; refund escrow
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {jobDetail.review ? (
                  <Section
                    title={
                      jobDetail.job.role === "buyer"
                        ? "Your review"
                        : "Buyer review"
                    }
                  >
                    <div className="studio-admin-card">
                      <div
                        className="marketplace-offers-stars"
                        aria-label={`${jobDetail.review.rating} out of 5 stars`}
                      >
                        {([1, 2, 3, 4, 5] as const).map((star) => (
                          <Star
                            key={star}
                            className={`h-4 w-4${star <= jobDetail.review!.rating ? " is-filled" : ""}`}
                            aria-hidden="true"
                          />
                        ))}
                        <span className="marketplace-offers-bar-note">
                          {jobDetail.review.rating}/5 · verified purchase
                        </span>
                      </div>
                      {jobDetail.review.body ? (
                        <p className="marketplace-offers-review-body">
                          {jobDetail.review.body}
                        </p>
                      ) : (
                        <p className="marketplace-offers-bar-note">
                          No written review — stars only.
                        </p>
                      )}
                    </div>
                  </Section>
                ) : null}

                {jobDetail.canReview ? (
                  <Section title="Leave a review">
                    <div className="studio-admin-card">
                      <p className="marketplace-offers-bar-note">
                        Optional — only verified purchases can rate this service.
                      </p>
                      <div
                        className="marketplace-offers-stars is-interactive"
                        role="radiogroup"
                        aria-label="Rating"
                      >
                        {([1, 2, 3, 4, 5] as const).map((star) => (
                          <button
                            key={star}
                            type="button"
                            role="radio"
                            aria-checked={reviewRating === star}
                            aria-label={`${star} star${star === 1 ? "" : "s"}`}
                            className={
                              star <= reviewRating ? "is-filled" : undefined
                            }
                            onClick={() => setReviewRating(star)}
                          >
                            <Star className="h-4 w-4" aria-hidden="true" />
                          </button>
                        ))}
                      </div>
                      <div className="marketplace-profile-fields">
                        <IconTextarea
                          icon={MessageSquare}
                          value={reviewBody}
                          onChange={(e) => setReviewBody(e.target.value)}
                          placeholder="Written review (optional)"
                          aria-label="Written review (optional)"
                        />
                      </div>
                      <div className="marketplace-offers-actions">
                        <button
                          type="button"
                          className="is-primary"
                          disabled={busy}
                          onClick={() => void handleSubmitReview()}
                        >
                          Submit review
                        </button>
                      </div>
                    </div>
                  </Section>
                ) : null}
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
