"use client";

import {
  AudioLines,
  ArrowLeft,
  Award,
  BadgeCheck,
  Clock,
  MessageSquareText,
  Package,
  PackageCheck,
  PackageSearch,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Timer,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useHorizontalScrollFade } from "@/desk/lib/use-horizontal-scroll-fade";
import { useHorizontalWheelScroll } from "@/desk/lib/use-horizontal-wheel-scroll";
import { formatTtdCents } from "@/studio/lib/money";
import type { Id } from "../../../convex/_generated/dataModel";
import { MarketplaceOffersPane } from "./MarketplaceOffersPane";
import { SellerAccessApplicationForm } from "./SellerAccessApplicationForm";
import { StudioAssetStoreManagePane } from "./StudioAssetStoreManagePane";
import { StudioOfferDetailEmbed } from "./PublicOffersPages";
import { useCreativeNetwork } from "./StudioCreativeNetworkContext";
import "./public-offers.css";
import "./studio-creative-network.css";

const VALUE_PROPS = [
  {
    icon: BadgeCheck,
    title: "Verified creators",
    copy: "Everyone you can book is identity-checked, so you know who you're hiring.",
  },
  {
    icon: ShieldCheck,
    title: "Your payment is safe",
    copy: "Funds are held until you approve the delivery — then the creator is paid.",
  },
  {
    icon: PackageCheck,
    title: "Know what you get",
    copy: "Every package spells out the scope and timeline before you book.",
  },
  {
    icon: MessageSquareText,
    title: "All in one place",
    copy: "Send your brief, review drafts, and receive files right inside Studio.",
  },
  {
    icon: Timer,
    title: "On-time delivery",
    copy: "Each order has a promised turnaround you can track from booking to handover.",
  },
  {
    icon: Sparkles,
    title: "Quality you can trust",
    copy: "Packages are reviewed before they go live, so the catalog stays high-signal.",
  },
] as const;

type StudioCreativeNetworkPaneProps = {
  onOpenCredits: () => void;
  creditPriceCents?: number;
};

function RatingStars({ value, size = 14 }: { value: number; size?: number }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span
      className="public-offers-stars"
      aria-label={`${value.toFixed(1)} out of 5`}
    >
      {([1, 2, 3, 4, 5] as const).map((star) => {
        const filled = rounded >= star;
        const half = !filled && rounded >= star - 0.5;
        return (
          <Star
            key={star}
            aria-hidden="true"
            className={filled || half ? "is-filled" : undefined}
            style={{ width: size, height: size }}
            fill={filled ? "currentColor" : "none"}
          />
        );
      })}
    </span>
  );
}

function OfferStatsChips({
  ratingAvg,
  ratingCount,
  purchaseCount,
}: {
  ratingAvg: number | null;
  ratingCount: number;
  purchaseCount: number;
}) {
  return (
    <>
      {ratingCount > 0 && ratingAvg != null ? (
        <span className="public-offers-chip">
          <RatingStars value={ratingAvg} />
          <strong>{ratingAvg.toFixed(1)}</strong>
          <em>({ratingCount})</em>
        </span>
      ) : (
        <span className="public-offers-chip">No ratings yet</span>
      )}
      <span className="public-offers-chip">
        {purchaseCount} purchase{purchaseCount === 1 ? "" : "s"}
      </span>
    </>
  );
}

const CN_HERO_BANNER = "/branding/creative-network-banner-4k.webp";

function usePreloadCreativeNetworkHero() {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = CN_HERO_BANNER;
    document.head.appendChild(link);
    return () => {
      link.remove();
    };
  }, []);
}

function NetworkBrowse() {
  const cn = useCreativeNetwork();
  usePreloadCreativeNetworkHero();
  const filtered = cn.filtered as
    | Array<{
        _id: string;
        slug: string;
        title: string;
        description: string;
        sellerBusinessName: string;
        sellerUsername?: string | null;
        priceCents: number;
        deliveryDays: number;
        category?: string | null;
        bannerThumbUrl?: string;
        packages?: unknown[];
        ratingAvg: number | null;
        ratingCount: number;
        purchaseCount: number;
      }>
    | undefined;

  useEffect(() => {
    if (!filtered?.length) return;
    for (const offer of filtered.slice(0, 8)) {
      if (!offer.bannerThumbUrl) continue;
      const img = new Image();
      img.decoding = "async";
      img.src = offer.bannerThumbUrl;
    }
  }, [filtered]);

  const sellerHandle = cn.sellerUsernameFilter;
  const heroTitle = sellerHandle ? `@${sellerHandle}` : "Creative Network";

  if (cn.browseSlug) {
    return (
      <StudioOfferDetailEmbed slug={cn.browseSlug} />
    );
  }

  return (
    <div className="public-offers-main studio-cn-catalog">
      <div className="public-offers-main-scroll">
        <main className="public-offers-body">
          <section className="public-offers-hero">
            <div className="public-offers-hero-bg" aria-hidden="true" />
            <div className="public-offers-hero-copy">
              <h1>{heroTitle}</h1>
              <p>
                Work with verified creative partners. Payment stays secure until
                you accept the delivery.
              </p>
            </div>
          </section>

          <div className="public-offers-values">
            {VALUE_PROPS.map((value) => (
              <div
                key={value.title}
                className="public-offers-value"
                title={value.copy}
              >
                <span className="public-offers-value-icon">
                  <value.icon aria-hidden="true" />
                </span>
                <div>
                  <strong>{value.title}</strong>
                  <p>{value.copy}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="public-offers-results">
            {cn.activeChips.length > 0 ? (
              <div
                className="public-offers-active-chips"
                aria-label="Active filters"
              >
                {cn.activeChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    className="public-offers-active-chip"
                    onClick={chip.clear}
                    title="Remove filter"
                  >
                    <span>{chip.label}</span>
                    <X aria-hidden="true" />
                  </button>
                ))}
                {cn.activeChips.length > 1 ? (
                  <button
                    type="button"
                    className="public-offers-active-clear"
                    onClick={cn.clearFilters}
                  >
                    Clear all
                  </button>
                ) : null}
              </div>
            ) : null}

            {!filtered ? (
              <div className="public-offers-state">
                <PackageSearch aria-hidden="true" />
                <strong>Loading services…</strong>
              </div>
            ) : filtered.length === 0 ? (
              <div className="public-offers-state">
                {cn.hasFilters ? (
                  <Search aria-hidden="true" />
                ) : (
                  <Store aria-hidden="true" />
                )}
                <strong>
                  {cn.hasFilters
                    ? "No matching services"
                    : sellerHandle
                      ? "No live packages right now"
                      : "No published services yet"}
                </strong>
                <p>
                  {cn.hasFilters
                    ? "Nothing fits these filters yet. Try widening your search."
                    : sellerHandle
                      ? "This creator has no live packages right now."
                      : "Creators are still setting up their packages. Check back soon."}
                </p>
                {cn.hasFilters ? (
                  <button
                    type="button"
                    className="public-offers-btn"
                    onClick={cn.clearFilters}
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            ) : (
              <ul className="public-offers-grid">
                {filtered.map((offer, index) => (
                  <li key={offer._id}>
                    <button
                      type="button"
                      className="public-offers-card studio-cn-card-btn"
                      onClick={() => cn.setBrowseSlug(offer.slug)}
                    >
                      {offer.bannerThumbUrl ? (
                        <div
                          className="public-offers-card-media"
                          aria-hidden="true"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={offer.bannerThumbUrl}
                            alt=""
                            loading={index < 8 ? "eager" : "lazy"}
                            fetchPriority={index < 4 ? "high" : "auto"}
                            decoding="async"
                          />
                        </div>
                      ) : null}
                      <div className="public-offers-card-top">
                        <div>
                          <h3 className="public-offers-card-title">
                            {offer.title}
                          </h3>
                          <p className="public-offers-card-seller">
                            {offer.sellerBusinessName}
                            {offer.sellerUsername
                              ? ` · @${offer.sellerUsername}`
                              : ""}
                          </p>
                        </div>
                        <span className="public-offers-card-price">
                          {offer.packages && offer.packages.length > 1 ? (
                            <em>From</em>
                          ) : null}
                          {formatTtdCents(offer.priceCents)}
                        </span>
                      </div>
                      <p className="public-offers-card-desc">
                        {offer.description}
                      </p>
                      <div className="public-offers-card-meta">
                        <span className="public-offers-chip">
                          <Clock aria-hidden="true" />
                          {offer.deliveryDays} day delivery
                        </span>
                        <OfferStatsChips
                          ratingAvg={offer.ratingAvg}
                          ratingCount={offer.ratingCount}
                          purchaseCount={offer.purchaseCount}
                        />
                        {offer.category ? (
                          <span className="public-offers-chip">
                            {offer.category}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export function StudioCreativeNetworkPane({
  onOpenCredits,
  creditPriceCents,
}: StudioCreativeNetworkPaneProps) {
  const cn = useCreativeNetwork();
  const [applyBusy, setApplyBusy] = useState(false);
  const headTabsScrollRef = useRef<HTMLElement | null>(null);
  useHorizontalWheelScroll(headTabsScrollRef);
  useHorizontalScrollFade(headTabsScrollRef);
  const offerOpen = cn.mode === "network" && Boolean(cn.browseSlug);

  const sellerCtaLabel = cn.hasSellerDraft
    ? "Continue seller registration"
    : cn.sellerPending
      ? "Application in review"
      : "Become a seller";

  const bodyClass =
    cn.mode === "network" || cn.mode === "seller-apply"
      ? "studio-cn-body is-catalog"
      : "studio-cn-body";

  function goNetworkTab() {
    if (cn.browseSlug) {
      cn.setBrowseSlug(null);
      return;
    }
    cn.setMode("network");
  }

  return (
    <div className="studio-cn-pane">
      <header className="studio-cn-head">
        {cn.isSellerApproved ? (
          <nav
            ref={headTabsScrollRef}
            className="studio-cn-head-tabs"
            aria-label="Creative Network"
          >
            <button
              type="button"
              className={`studio-cn-head-tab${cn.mode === "network" && !offerOpen ? " is-active" : ""}`}
              onClick={goNetworkTab}
            >
              {offerOpen ? (
                <ArrowLeft aria-hidden="true" />
              ) : (
                <Store aria-hidden="true" />
              )}
              {offerOpen ? "Back to Network" : "Network"}
            </button>
            <button
              type="button"
              className={`studio-cn-head-tab${cn.mode === "my-offers" ? " is-active" : ""}`}
              onClick={() => cn.setMode("my-offers")}
            >
              <Package aria-hidden="true" />
              My offers
            </button>
            <button
              type="button"
              className={`studio-cn-head-tab${cn.mode === "my-jobs" ? " is-active" : ""}`}
              onClick={() => cn.setMode("my-jobs")}
            >
              <Award aria-hidden="true" />
              My jobs
            </button>
            <button
              type="button"
              className={`studio-cn-head-tab${cn.mode === "my-assets" ? " is-active" : ""}`}
              onClick={() => cn.setMode("my-assets")}
            >
              <AudioLines aria-hidden="true" />
              My assets
            </button>
          </nav>
        ) : (
          <nav
            ref={headTabsScrollRef}
            className="studio-cn-head-tabs"
            aria-label="Creative Network"
          >
            <button
              type="button"
              className={`studio-cn-head-tab${cn.mode !== "seller-apply" && !offerOpen ? " is-active" : ""}`}
              onClick={goNetworkTab}
            >
              {offerOpen ? (
                <ArrowLeft aria-hidden="true" />
              ) : (
                <Store aria-hidden="true" />
              )}
              {offerOpen ? "Back to Network" : "Network"}
            </button>
          </nav>
        )}
        <div className="studio-cn-head-action">
          {!cn.isSellerApproved && !cn.sellerLoading ? (
            <button
              type="button"
              className="studio-cn-seller-cta"
              disabled={cn.sellerPending && !cn.hasSellerDraft}
              onClick={() => cn.setMode("seller-apply")}
            >
              {sellerCtaLabel}
            </button>
          ) : null}
        </div>
      </header>

      <div className={bodyClass}>
        {cn.mode === "seller-apply" ? (
          <div className="public-offers-main studio-cn-catalog">
            <div className="public-offers-main-scroll">
              <div className="public-offers-body is-narrow">
                <SellerAccessApplicationForm
                  busy={applyBusy}
                  setBusy={setApplyBusy}
                />
              </div>
            </div>
          </div>
        ) : cn.mode === "my-assets" ? (
          <StudioAssetStoreManagePane />
        ) : cn.mode === "my-offers" || cn.mode === "my-jobs" ? (
          <MarketplaceOffersPane
            onOpenCredits={onOpenCredits}
            creditPriceCents={creditPriceCents}
            embedInNetwork
            homeTab={cn.mode === "my-jobs" ? "jobs" : "offers"}
            hideHomeTabs
            externalOfferId={cn.selectedOfferId}
            externalJobId={cn.selectedJobId}
            onOfferSelect={(id: Id<"marketplaceOffers"> | null) =>
              cn.setSelectedOfferId(id)
            }
            onJobSelect={(id: Id<"marketplaceJobs"> | null) =>
              cn.setSelectedJobId(id)
            }
          />
        ) : (
          <NetworkBrowse />
        )}
      </div>
    </div>
  );
}
