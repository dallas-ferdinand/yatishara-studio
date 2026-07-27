"use client";

import { useQuery } from "convex/react";
import {
  ArrowDown,
  Briefcase,
  MessageCircle,
  Package,
} from "lucide-react";
import { Fragment } from "react";
import { api } from "../../../convex/_generated/api";
import { PanelSearchBar } from "@/desk/components/PanelSearchBar";
import { StudioProfileAvatar } from "./StudioProfileAvatar";
import {
  NETWORK_OPTION_FILTERS,
  NETWORK_PRICE_PRESETS,
  useCreativeNetwork,
  type NetworkSortKey,
} from "./StudioCreativeNetworkContext";
import "./public-offers.css";
import "./studio-creative-network.css";

const NETWORK_SORT_OPTIONS: Array<{ value: NetworkSortKey; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "fastest", label: "Fastest delivery" },
];

type StudioCreativeNetworkSidebarProps = {
  expiresUnix: number;
  onOpenMessages: () => void;
  /** Opens Messages focused on this username (existing chat flow). */
  onOpenChatWithUsername?: (username: string) => void;
};

function FilterSection({
  title,
  activeCount,
  open,
  onToggle,
  children,
}: {
  title: string;
  activeCount: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`public-offers-filter-group${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="public-offers-filter-head"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>{title}</span>
        {activeCount > 0 ? (
          <em className="public-offers-filter-active">{activeCount}</em>
        ) : null}
        <ArrowDown className="public-offers-filter-caret" aria-hidden="true" />
      </button>
      {open ? <div className="public-offers-filter-options">{children}</div> : null}
    </section>
  );
}

function FilterOption({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      className={`public-offers-filter-btn${active ? " is-active" : ""}${count === 0 && !active ? " is-empty" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      <span>{label}</span>
      {count !== undefined ? <em>{count}</em> : null}
    </button>
  );
}

function NetworkFiltersRail() {
  const cn = useCreativeNetwork();
  const offers = (cn.offers ?? []) as Array<{
    category?: string | null;
    deliveryDays: number;
    priceCents: number;
  }>;

  return (
    <div className="studio-cn-sidebar-body">
      <div className="studio-cn-sidebar-chrome">
        <PanelSearchBar
          value={cn.search}
          onChange={cn.setSearch}
          placeholder="Search services"
          aria-label="Search services"
        />
      </div>
      <div className="studio-cn-rail-scroll public-offers-rail-body">
        <FilterSection
          title="Sort"
          activeCount={cn.sort === "newest" ? 0 : 1}
          open={!cn.closedSections.sort}
          onToggle={() => cn.toggleSection("sort")}
        >
          {NETWORK_SORT_OPTIONS.map((option) => (
            <FilterOption
              key={option.value}
              active={cn.sort === option.value}
              onClick={() => cn.setSort(option.value)}
              label={option.label}
            />
          ))}
        </FilterSection>

        {NETWORK_OPTION_FILTERS.map((def) => {
          const options = def.getOptions(offers);
          const value = cn.valueFor(def);
          const counts = cn.facets?.get(def.id);
          const limit = def.visibleLimit ?? Infinity;
          const expanded = cn.expandedSections[def.id] ?? false;
          const visible =
            expanded || options.length <= limit
              ? options
              : options.slice(0, limit);
          return (
            <Fragment key={def.id}>
              <FilterSection
                title={def.label}
                activeCount={value === def.anyValue ? 0 : 1}
                open={!cn.closedSections[def.id]}
                onToggle={() => cn.toggleSection(def.id)}
              >
                <FilterOption
                  active={value === def.anyValue}
                  onClick={() => cn.setValueFor(def.id, def.anyValue)}
                  label={def.anyLabel}
                  count={counts?.get(def.anyValue)}
                />
                {visible.map((option) => (
                  <FilterOption
                    key={option.value}
                    active={value === option.value}
                    onClick={() => cn.setValueFor(def.id, option.value)}
                    label={option.label}
                    count={counts?.get(option.value)}
                  />
                ))}
                {options.length > limit ? (
                  <button
                    type="button"
                    className="public-offers-filter-more"
                    onClick={() =>
                      cn.setExpandedSections((prev) => ({
                        ...prev,
                        [def.id]: !expanded,
                      }))
                    }
                  >
                    {expanded ? "Show less" : `Show ${options.length - limit} more`}
                  </button>
                ) : null}
              </FilterSection>
            </Fragment>
          );
        })}

        <FilterSection
          title="Price (TTD)"
          activeCount={cn.priceMin || cn.priceMax ? 1 : 0}
          open={!cn.closedSections.price}
          onToggle={() => cn.toggleSection("price")}
        >
          <div className="public-offers-range">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Min"
              value={cn.priceMin}
              onChange={(event) => cn.setPriceMin(event.target.value)}
              aria-label="Minimum price in TTD"
            />
            <span aria-hidden="true">–</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Max"
              value={cn.priceMax}
              onChange={(event) => cn.setPriceMax(event.target.value)}
              aria-label="Maximum price in TTD"
            />
          </div>
          <div className="public-offers-presets">
            {NETWORK_PRICE_PRESETS.map((preset) => {
              const active =
                cn.priceMin === preset.min && cn.priceMax === preset.max;
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={`public-offers-preset${active ? " is-active" : ""}`}
                  aria-pressed={active}
                  onClick={() => {
                    cn.setPriceMin(active ? "" : preset.min);
                    cn.setPriceMax(active ? "" : preset.max);
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </FilterSection>

        {cn.hasFilters ? (
          <button
            type="button"
            className="public-offers-btn is-quiet public-offers-rail-clear"
            onClick={cn.clearFilters}
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MessagesQuickAccess({
  expiresUnix,
  onOpenMessages,
  onOpenChatWithUsername,
}: {
  expiresUnix: number;
  onOpenMessages: () => void;
  onOpenChatWithUsername?: (username: string) => void;
}) {
  const conversations = useQuery(api.dms.listMyConversations, {
    expiresUnix,
  });
  const rows = (conversations ?? []).slice(0, 5);

  return (
    <div className="studio-cn-messages-block">
      <div className="studio-cn-messages-head">
        <strong>Messages</strong>
        <button
          type="button"
          className="studio-cn-messages-open"
          onClick={onOpenMessages}
        >
          Open
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="studio-cn-list-empty" style={{ margin: "4px 0 0" }}>
          No recent chats
        </p>
      ) : (
        rows.map((row) => {
          const label =
            row.peer.displayName?.trim() || `@${row.peer.username}`;
          return (
            <button
              key={row.conversationId}
              type="button"
              className="studio-cn-messages-row"
              onClick={() => {
                if (onOpenChatWithUsername) {
                  onOpenChatWithUsername(row.peer.username);
                } else {
                  onOpenMessages();
                }
              }}
            >
              <StudioProfileAvatar
                size="sm"
                name={label}
                src={row.peer.avatarUrl}
              />
              <span>{label}</span>
              <MessageCircle
                aria-hidden="true"
                className="h-3.5 w-3.5 opacity-50"
              />
            </button>
          );
        })
      )}
    </div>
  );
}

function MyOffersRail({
  expiresUnix,
  onOpenMessages,
  onOpenChatWithUsername,
}: StudioCreativeNetworkSidebarProps) {
  const cn = useCreativeNetwork();
  const myOffers = useQuery(
    api.marketplace.listMyOffers,
    cn.isSellerApproved ? { expiresUnix } : "skip",
  );

  return (
    <div className="studio-cn-sidebar-body">
      <div className="studio-cn-rail-scroll">
        {!myOffers ? (
          <p className="studio-cn-list-empty">Loading offers…</p>
        ) : myOffers.length === 0 ? (
          <p className="studio-cn-list-empty">
            No offers yet. Create one from the main pane.
          </p>
        ) : (
          <div className="studio-cn-list">
            {myOffers.map((offer) => {
              const active = cn.selectedOfferId === offer._id;
              const thumb =
                "bannerThumbUrl" in offer
                  ? (offer as { bannerThumbUrl?: string }).bannerThumbUrl
                  : undefined;
              return (
                <button
                  key={offer._id}
                  type="button"
                  className={`studio-cn-list-item${active ? " is-active" : ""}`}
                  onClick={() => cn.setSelectedOfferId(offer._id)}
                >
                  <span className="studio-cn-list-thumb">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" />
                    ) : (
                      <Package aria-hidden="true" />
                    )}
                  </span>
                  <span className="studio-cn-list-copy">
                    <strong>{offer.title}</strong>
                    <span>{offer.status}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <MessagesQuickAccess
        expiresUnix={expiresUnix}
        onOpenMessages={onOpenMessages}
        onOpenChatWithUsername={onOpenChatWithUsername}
      />
    </div>
  );
}

function MyJobsRail({
  expiresUnix,
  onOpenMessages,
  onOpenChatWithUsername,
}: StudioCreativeNetworkSidebarProps) {
  const cn = useCreativeNetwork();
  const sellerJobs = useQuery(
    api.marketplace.listMySellerJobs,
    cn.isSellerApproved ? {} : "skip",
  );

  return (
    <div className="studio-cn-sidebar-body">
      <div className="studio-cn-rail-scroll">
        {!sellerJobs ? (
          <p className="studio-cn-list-empty">Loading jobs…</p>
        ) : sellerJobs.length === 0 ? (
          <p className="studio-cn-list-empty">No jobs yet.</p>
        ) : (
          <div className="studio-cn-list">
            {sellerJobs.map((job) => {
              const active = cn.selectedJobId === job._id;
              return (
                <button
                  key={job._id}
                  type="button"
                  className={`studio-cn-list-item${active ? " is-active" : ""}`}
                  onClick={() => cn.setSelectedJobId(job._id)}
                >
                  <span className="studio-cn-list-thumb">
                    <Briefcase aria-hidden="true" />
                  </span>
                  <span className="studio-cn-list-copy">
                    <strong>{job.offerTitle || "Job"}</strong>
                    <span>
                      {job.status}
                      {job.packageName ? ` · ${job.packageName}` : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <MessagesQuickAccess
        expiresUnix={expiresUnix}
        onOpenMessages={onOpenMessages}
        onOpenChatWithUsername={onOpenChatWithUsername}
      />
    </div>
  );
}

/** Left rail for the Creative Network Studio tab. */
export function StudioCreativeNetworkSidebar({
  expiresUnix,
  onOpenMessages,
  onOpenChatWithUsername,
}: StudioCreativeNetworkSidebarProps) {
  const cn = useCreativeNetwork();

  return (
    <aside className="studio-cn-sidebar" aria-label="Creative Network">
      {cn.mode === "my-offers" ? (
        <MyOffersRail
          expiresUnix={expiresUnix}
          onOpenMessages={onOpenMessages}
          onOpenChatWithUsername={onOpenChatWithUsername}
        />
      ) : cn.mode === "my-jobs" ? (
        <MyJobsRail
          expiresUnix={expiresUnix}
          onOpenMessages={onOpenMessages}
          onOpenChatWithUsername={onOpenChatWithUsername}
        />
      ) : (
        <NetworkFiltersRail />
      )}
    </aside>
  );
}
