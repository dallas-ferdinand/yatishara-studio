"use client";

import {
  Award,
  CalendarDays,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Clock,
  PackageSearch,
  Search,
  Store,
  Timer,
  X,
} from "lucide-react";
import { useState } from "react";
import { CursorSelect } from "@/desk/components/CursorSelect";
import { formatTtdCents } from "@/studio/lib/money";
import type { Id } from "../../../convex/_generated/dataModel";
import { MarketplaceOffersPane } from "./MarketplaceOffersPane";
import { SellerAccessApplicationForm } from "./SellerAccessApplicationForm";
import { StudioOfferDetailEmbed } from "./PublicOffersPages";
import {
  useCreativeNetwork,
  type NetworkSortKey,
} from "./StudioCreativeNetworkContext";
import "./public-offers.css";
import "./studio-creative-network.css";

const SORT_SELECT_OPTIONS = [
  { value: "newest", label: "Newest", icon: <CalendarDays /> },
  { value: "price-asc", label: "Price: low to high", icon: <ArrowUpNarrowWide /> },
  { value: "price-desc", label: "Price: high to low", icon: <ArrowDownWideNarrow /> },
  { value: "fastest", label: "Fastest delivery", icon: <Timer /> },
];

type StudioCreativeNetworkPaneProps = {
  onOpenCredits: () => void;
  creditPriceCents?: number;
};

function NetworkBrowse() {
  const cn = useCreativeNetwork();
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

  if (cn.browseSlug) {
    return (
      <StudioOfferDetailEmbed
        slug={cn.browseSlug}
        onBack={() => cn.setBrowseSlug(null)}
      />
    );
  }

  return (
    <div className="studio-cn-browse">
      <section className="studio-cn-browse-hero">
        <h1>Creative Network</h1>
        <p>
          Work with verified creative partners. Payment stays secure until you
          accept the delivery.
        </p>
      </section>

      <div className="studio-cn-browse-toolbar">
        <h2>Services</h2>
        {filtered ? (
          <span className="public-offers-chip">{filtered.length}</span>
        ) : null}
        <div className="public-offers-sort" style={{ marginLeft: "auto" }}>
          <CursorSelect
            value={cn.sort}
            options={SORT_SELECT_OPTIONS}
            onChange={(value) => cn.setSort(value as NetworkSortKey)}
            ariaLabel="Sort services"
            align="end"
          />
        </div>
      </div>

      {cn.activeChips.length > 0 ? (
        <div className="public-offers-active-chips" aria-label="Active filters">
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
          {cn.hasFilters ? <Search aria-hidden="true" /> : <Store aria-hidden="true" />}
          <strong>
            {cn.hasFilters ? "No matching services" : "No published services yet"}
          </strong>
          <p>
            {cn.hasFilters
              ? "Nothing fits these filters yet. Try widening your search."
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
          {filtered.map((offer) => (
            <li key={offer._id}>
              <button
                type="button"
                className="public-offers-card studio-cn-card-btn"
                onClick={() => cn.setBrowseSlug(offer.slug)}
              >
                {offer.bannerThumbUrl ? (
                  <div className="public-offers-card-media" aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={offer.bannerThumbUrl} alt="" loading="lazy" />
                  </div>
                ) : null}
                <div className="public-offers-card-top">
                  <div>
                    <h3 className="public-offers-card-title">{offer.title}</h3>
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
                <p className="public-offers-card-desc">{offer.description}</p>
                <div className="public-offers-card-meta">
                  <span className="public-offers-chip">
                    <Clock aria-hidden="true" />
                    {offer.deliveryDays} day delivery
                  </span>
                  {offer.category ? (
                    <span className="public-offers-chip">{offer.category}</span>
                  ) : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StudioCreativeNetworkPane({
  onOpenCredits,
  creditPriceCents,
}: StudioCreativeNetworkPaneProps) {
  const cn = useCreativeNetwork();
  const [applyBusy, setApplyBusy] = useState(false);

  const sellerCtaLabel = cn.hasSellerDraft
    ? "Continue seller registration"
    : cn.sellerPending
      ? "Application in review"
      : "Become a seller";

  return (
    <div className="studio-cn-pane">
      <header className="studio-cn-head">
        {cn.isSellerApproved ? (
          <nav className="studio-cn-head-tabs" aria-label="Creative Network">
            <button
              type="button"
              className={`studio-cn-head-tab${cn.mode === "network" ? " is-active" : ""}`}
              onClick={() => cn.setMode("network")}
            >
              Network
            </button>
            <button
              type="button"
              className={`studio-cn-head-tab${cn.mode === "my-offers" ? " is-active" : ""}`}
              onClick={() => cn.setMode("my-offers")}
            >
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
          </nav>
        ) : (
          <nav className="studio-cn-head-tabs" aria-label="Creative Network">
            <button
              type="button"
              className={`studio-cn-head-tab${cn.mode !== "seller-apply" ? " is-active" : ""}`}
              onClick={() => cn.setMode("network")}
            >
              Network
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

      <div className="studio-cn-body">
        {cn.mode === "seller-apply" ? (
          <SellerAccessApplicationForm
            busy={applyBusy}
            setBusy={setApplyBusy}
          />
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
