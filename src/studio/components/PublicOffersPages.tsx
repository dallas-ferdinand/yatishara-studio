"use client";

import { Authenticated, Unauthenticated, useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowUpNarrowWide,
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  Check,
  Clock,
  ListFilter,
  MessageSquareText,
  PackageCheck,
  PackageSearch,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Timer,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConvexClientProvider } from "@/app/ConvexClientProvider";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useMercurySidebarLogo } from "@/lib/use-appearance-mode";
import { CursorSelect } from "@/desk/components/CursorSelect";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { formatTtdCents, formatTtdFromCredits } from "@/studio/lib/money";
import "./public-offers.css";

function RatingStars({
  value,
  size = 14,
}: {
  value: number;
  size?: number;
}) {
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

function OfferReviewsList({ offerId }: { offerId: Id<"marketplaceOffers"> }) {
  const reviews = useQuery(api.marketplace.listPublicOfferReviews, {
    offerId,
    limit: 20,
  });
  if (reviews === undefined) {
    return (
      <section className="public-offers-panel">
        <h2>Reviews</h2>
        <p className="public-offers-note">Loading reviews…</p>
      </section>
    );
  }
  if (reviews.length === 0) {
    return (
      <section className="public-offers-panel">
        <h2>Reviews</h2>
        <p className="public-offers-note">
          No verified reviews yet — ratings come from completed purchases only.
        </p>
      </section>
    );
  }
  return (
    <section className="public-offers-panel">
      <h2>Reviews</h2>
      <ul className="public-offers-reviews">
        {reviews.map((review) => (
          <li key={review._id} className="public-offers-review">
            <div className="public-offers-review-head">
              <RatingStars value={review.rating} />
              <strong>{review.buyerDisplayName}</strong>
              <time dateTime={new Date(review.createdAt).toISOString()}>
                {new Date(review.createdAt).toLocaleDateString()}
              </time>
            </div>
            {review.packageName ? (
              <p className="public-offers-review-pkg">{review.packageName} package</p>
            ) : null}
            {review.body ? (
              <p className="public-offers-prose">{review.body}</p>
            ) : (
              <p className="public-offers-note">Stars only — no written review.</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function OffersSidebarBrand() {
  const logoSrc = useMercurySidebarLogo();
  return (
    <Link href="/creative-network/" className="public-offers-sidebar-brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoSrc} alt="" aria-hidden="true" />
      <span className="public-offers-sidebar-brand-text">
        <strong>Creative Network</strong>
      </span>
    </Link>
  );
}

function OffersTopbar({
  back,
  showBrand = true,
  search,
  onSearchChange,
  filtersOpen,
  onToggleFilters,
  filterActive = false,
  filterTitle = "Filters",
}: {
  back?: { href: string; label: string };
  showBrand?: boolean;
  search?: string;
  onSearchChange?: (value: string) => void;
  filtersOpen?: boolean;
  onToggleFilters?: () => void;
  filterActive?: boolean;
  filterTitle?: string;
}) {
  const logoSrc = useMercurySidebarLogo();
  const showInlineSearch = typeof search === "string" && onSearchChange;

  return (
    <header className="public-offers-topbar">
      {showBrand ? (
        <Link href="/creative-network/" className="public-offers-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} alt="" aria-hidden="true" />
          <strong>Yatishara Studio</strong>
          <span>Creative Network</span>
        </Link>
      ) : (
        <div className="public-offers-topbar-title">
          {back ? (
            <Link href={back.href} className="public-offers-btn is-quiet">
              <ArrowLeft aria-hidden="true" />
              <span className="public-offers-btn-label">{back.label}</span>
            </Link>
          ) : (
            <div className="public-offers-topbar-mobile-brand">
              <OffersSidebarBrand />
            </div>
          )}
        </div>
      )}

      {showInlineSearch ? (
        <label className="public-offers-topbar-search">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search services"
            aria-label="Search services"
          />
        </label>
      ) : null}

      <div className="public-offers-topbar-actions">
        {showBrand && back ? (
          <Link href={back.href} className="public-offers-btn is-quiet">
            <ArrowLeft aria-hidden="true" />
            <span className="public-offers-btn-label">{back.label}</span>
          </Link>
        ) : null}
        {onToggleFilters ? (
          <button
            type="button"
            className={`public-offers-btn is-icon public-offers-topbar-filter${filtersOpen ? " is-active" : ""}${filterActive ? " has-filters" : ""}`}
            aria-label={filtersOpen ? `Close ${filterTitle.toLowerCase()}` : `Open ${filterTitle.toLowerCase()}`}
            aria-expanded={filtersOpen}
            title={filterTitle}
            onClick={onToggleFilters}
          >
            {filtersOpen ? (
              <X aria-hidden="true" />
            ) : filterTitle === "Book" ? (
              <Wallet aria-hidden="true" />
            ) : (
              <ListFilter aria-hidden="true" />
            )}
            {filterActive && !filtersOpen ? (
              <em className="public-offers-filter-dot" aria-hidden="true" />
            ) : null}
          </button>
        ) : null}
        <Link
          href="/"
          className="public-offers-btn is-icon"
          aria-label="Open Studio"
          title="Open Studio"
        >
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}

function OffersState({
  icon,
  title,
  hint,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="public-offers-state">
      <span className="public-offers-state-icon">{icon}</span>
      <strong>{title}</strong>
      {hint ? <p>{hint}</p> : null}
      {action}
    </div>
  );
}

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

/** Minimal shape the filter registry needs — every public offer satisfies it. */
type FilterableOffer = {
  priceCents: number;
  deliveryDays: number;
  category?: string;
  publishedAt?: number;
};

type SearchableOffer = FilterableOffer & {
  title: string;
  description: string;
  sellerBusinessName: string;
  sellerUsername?: string;
};

type OptionFilterDef = {
  id: string;
  label: string;
  anyValue: string;
  anyLabel: string;
  /** How many options render before "Show all" kicks in. */
  visibleLimit?: number;
  getOptions: (offers: FilterableOffer[]) => { value: string; label: string }[];
  matches: (offer: FilterableOffer, value: string) => boolean;
};

/**
 * Adding a new sidebar filter = one entry here. Facet counts, active chips,
 * clearing, and collapse state all derive from this registry.
 */
const OPTION_FILTERS: OptionFilterDef[] = [
  {
    id: "category",
    label: "Category",
    anyValue: "all",
    anyLabel: "All categories",
    visibleLimit: 7,
    getOptions: (offers) => {
      const names = new Set<string>();
      for (const offer of offers) {
        const key = offer.category?.trim();
        if (key) names.add(key);
      }
      return [...names]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ value: name, label: name }));
    },
    matches: (offer, value) => offer.category?.trim() === value,
  },
  {
    id: "delivery",
    label: "Delivery time",
    anyValue: "any",
    anyLabel: "Any timeline",
    getOptions: () => [
      { value: "1", label: "Up to 24 hours" },
      { value: "3", label: "Up to 3 days" },
      { value: "7", label: "Up to 7 days" },
      { value: "14", label: "Up to 14 days" },
    ],
    matches: (offer, value) => offer.deliveryDays <= Number(value),
  },
];

const PRICE_PRESETS = [
  { label: "Under $50", min: "", max: "50" },
  { label: "$50 – $100", min: "50", max: "100" },
  { label: "$100 – $250", min: "100", max: "250" },
  { label: "$250 – $500", min: "250", max: "500" },
  { label: "$500 – $1k", min: "500", max: "1000" },
  { label: "$1k – $2.5k", min: "1000", max: "2500" },
  { label: "$2.5k – $5k", min: "2500", max: "5000" },
  { label: "$5k+", min: "5000", max: "" },
] as const;

type SortKey = "newest" | "price-asc" | "price-desc" | "fastest";

const SORT_COMPARATORS: Record<
  SortKey,
  (a: FilterableOffer, b: FilterableOffer) => number
> = {
  newest: (a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0),
  "price-asc": (a, b) => a.priceCents - b.priceCents,
  "price-desc": (a, b) => b.priceCents - a.priceCents,
  fastest: (a, b) => a.deliveryDays - b.deliveryDays,
};

const SORT_SELECT_OPTIONS = [
  { value: "newest", label: "Newest", icon: <CalendarDays /> },
  { value: "price-asc", label: "Price: low to high", icon: <ArrowUpNarrowWide /> },
  { value: "price-desc", label: "Price: high to low", icon: <ArrowDownWideNarrow /> },
  { value: "fastest", label: "Fastest delivery", icon: <Timer /> },
];

/** "250" or "$1,250.50" → cents; empty/garbage → null (no bound). */
function parsePriceToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const dollars = Number(cleaned);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

function priceChipLabel(min: string, max: string): string | null {
  const hasMin = parsePriceToCents(min) !== null;
  const hasMax = parsePriceToCents(max) !== null;
  if (hasMin && hasMax) return `$${min} – $${max}`;
  if (hasMin) return `From $${min}`;
  if (hasMax) return `Up to $${max}`;
  return null;
}

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

function CatalogFiltersBody({
  offers,
  setValueFor,
  valueFor,
  facets,
  closedSections,
  toggleSection,
  expandedSections,
  setExpandedSections,
  priceMin,
  setPriceMin,
  priceMax,
  setPriceMax,
  hasFilters,
  clearFilters,
}: {
  offers: FilterableOffer[] | undefined;
  setValueFor: (id: string, value: string) => void;
  valueFor: (def: OptionFilterDef) => string;
  facets: Map<string, Map<string, number>> | null;
  closedSections: Record<string, boolean>;
  toggleSection: (id: string) => void;
  expandedSections: Record<string, boolean>;
  setExpandedSections: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  priceMin: string;
  setPriceMin: (value: string) => void;
  priceMax: string;
  setPriceMax: (value: string) => void;
  hasFilters: boolean;
  clearFilters: () => void;
}) {
  return (
    <>
      {OPTION_FILTERS.map((def) => {
        const options = def.getOptions(offers ?? []);
        const value = valueFor(def);
        const counts = facets?.get(def.id);
        const limit = def.visibleLimit ?? Infinity;
        const expanded = expandedSections[def.id] ?? false;
        const visible =
          expanded || options.length <= limit ? options : options.slice(0, limit);
        return (
          <Fragment key={def.id}>
            <FilterSection
              title={def.label}
              activeCount={value === def.anyValue ? 0 : 1}
              open={!closedSections[def.id]}
              onToggle={() => toggleSection(def.id)}
            >
              <FilterOption
                active={value === def.anyValue}
                onClick={() => setValueFor(def.id, def.anyValue)}
                label={def.anyLabel}
                count={counts?.get(def.anyValue)}
              />
              {visible.map((option) => (
                <FilterOption
                  key={option.value}
                  active={value === option.value}
                  onClick={() =>
                    setValueFor(
                      def.id,
                      value === option.value ? def.anyValue : option.value,
                    )
                  }
                  label={option.label}
                  count={counts?.get(option.value)}
                />
              ))}
              {options.length > limit ? (
                <button
                  type="button"
                  className="public-offers-show-more"
                  onClick={() =>
                    setExpandedSections((prev) => ({
                      ...prev,
                      [def.id]: !expanded,
                    }))
                  }
                >
                  {expanded ? "Show less" : `Show all (${options.length})`}
                </button>
              ) : null}
            </FilterSection>
            {def.id === "category" ? (
              <FilterSection
                title="Price (TTD)"
                activeCount={priceChipLabel(priceMin, priceMax) ? 1 : 0}
                open={!closedSections.price}
                onToggle={() => toggleSection("price")}
              >
                <div className="public-offers-range">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={priceMin}
                    onChange={(event) => setPriceMin(event.target.value)}
                    placeholder="Min"
                    aria-label="Minimum price in TTD"
                  />
                  <span aria-hidden="true">–</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={priceMax}
                    onChange={(event) => setPriceMax(event.target.value)}
                    placeholder="Max"
                    aria-label="Maximum price in TTD"
                  />
                </div>
                <div className="public-offers-presets">
                  {PRICE_PRESETS.map((preset) => {
                    const active =
                      priceMin === preset.min && priceMax === preset.max;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        className={`public-offers-preset${active ? " is-active" : ""}`}
                        aria-pressed={active}
                        onClick={() => {
                          setPriceMin(active ? "" : preset.min);
                          setPriceMax(active ? "" : preset.max);
                        }}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </FilterSection>
            ) : null}
          </Fragment>
        );
      })}

      {hasFilters ? (
        <button
          type="button"
          className="public-offers-btn is-quiet public-offers-rail-clear"
          onClick={clearFilters}
        >
          Clear filters
        </button>
      ) : null}
    </>
  );
}

function OffersCatalogInner() {
  const searchParams = useSearchParams();
  const sellerUsername = searchParams.get("u")?.replace(/^@/, "").trim() || undefined;
  const allOffers = useQuery(
    api.marketplace.listPublicOffers,
    sellerUsername ? "skip" : {},
  );
  const sellerOffers = useQuery(
    api.marketplace.listPublicOffersByUsername,
    sellerUsername ? { username: sellerUsername } : "skip",
  );
  const offers = sellerUsername ? sellerOffers : allOffers;

  const [search, setSearch] = useState("");
  const [optionValues, setOptionValues] = useState<Record<string, string>>({});
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [closedSections, setClosedSections] = useState<Record<string, boolean>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const valueFor = (def: OptionFilterDef) => optionValues[def.id] ?? def.anyValue;
  const setValueFor = (id: string, value: string) =>
    setOptionValues((prev) => ({ ...prev, [id]: value }));
  const toggleSection = (id: string) =>
    setClosedSections((prev) => ({ ...prev, [id]: !prev[id] }));

  const query = search.trim().toLowerCase();
  const minCents = parsePriceToCents(priceMin);
  const maxCents = parsePriceToCents(priceMax);

  const baseMatch = useMemo(() => {
    return (offer: SearchableOffer) => {
      if (minCents !== null && offer.priceCents < minCents) return false;
      if (maxCents !== null && offer.priceCents > maxCents) return false;
      if (query) {
        const haystack = [
          offer.title,
          offer.description,
          offer.sellerBusinessName,
          offer.sellerUsername ?? "",
          offer.category ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    };
  }, [query, minCents, maxCents]);

  // Faceted counts: each group is counted against every *other* active filter,
  // so numbers always answer "what would I get if I picked this?".
  const facets = useMemo(() => {
    if (!offers) return null;
    const base = offers.filter(baseMatch);
    const result = new Map<string, Map<string, number>>();
    for (const def of OPTION_FILTERS) {
      const others = OPTION_FILTERS.filter((d) => d.id !== def.id);
      const pool = base.filter((offer) =>
        others.every((d) => {
          const value = optionValues[d.id] ?? d.anyValue;
          return value === d.anyValue || d.matches(offer, value);
        }),
      );
      const counts = new Map<string, number>();
      counts.set(def.anyValue, pool.length);
      for (const option of def.getOptions(offers)) {
        counts.set(
          option.value,
          pool.filter((offer) => def.matches(offer, option.value)).length,
        );
      }
      result.set(def.id, counts);
    }
    return result;
  }, [offers, baseMatch, optionValues]);

  const filtered = useMemo(() => {
    if (!offers) return undefined;
    const list = offers.filter(
      (offer) =>
        baseMatch(offer) &&
        OPTION_FILTERS.every((def) => {
          const value = optionValues[def.id] ?? def.anyValue;
          return value === def.anyValue || def.matches(offer, value);
        }),
    );
    return [...list].sort(SORT_COMPARATORS[sort]);
  }, [offers, baseMatch, optionValues, sort]);

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (search.trim()) {
      chips.push({
        key: "search",
        label: `“${search.trim()}”`,
        clear: () => setSearch(""),
      });
    }
    const priceLabel = priceChipLabel(priceMin, priceMax);
    if (priceLabel) {
      chips.push({
        key: "price",
        label: priceLabel,
        clear: () => {
          setPriceMin("");
          setPriceMax("");
        },
      });
    }
    for (const def of OPTION_FILTERS) {
      const value = optionValues[def.id] ?? def.anyValue;
      if (value === def.anyValue) continue;
      const label =
        def.getOptions(offers ?? []).find((opt) => opt.value === value)?.label ?? value;
      chips.push({
        key: def.id,
        label,
        clear: () => setValueFor(def.id, def.anyValue),
      });
    }
    return chips;
  }, [search, priceMin, priceMax, optionValues, offers]);

  const hasFilters = activeChips.length > 0;

  function clearFilters() {
    setSearch("");
    setPriceMin("");
    setPriceMax("");
    setOptionValues({});
  }

  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    const onResize = () => {
      if (window.matchMedia("(min-width: 861px)").matches) {
        setFiltersOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      document.body.style.overflow = previous;
    };
  }, [filtersOpen]);

  const filterBodyProps = {
    offers: offers as FilterableOffer[] | undefined,
    setValueFor,
    valueFor,
    facets,
    closedSections,
    toggleSection,
    expandedSections,
    setExpandedSections,
    priceMin,
    setPriceMin,
    priceMax,
    setPriceMax,
    hasFilters,
    clearFilters,
  };

  return (
    <div className="public-offers-shell">
      <aside className="public-offers-rail" aria-label="Filter services">
        <div className="public-offers-rail-head">
          <OffersSidebarBrand />
        </div>
        <label className="public-offers-rail-search">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search services"
            aria-label="Search services"
          />
        </label>
        <div className="public-offers-rail-body">
          <CatalogFiltersBody {...filterBodyProps} />
        </div>
      </aside>

      <div className="public-offers-main">
        <OffersTopbar
          showBrand={false}
          back={sellerUsername ? { href: "/creative-network/", label: "All services" } : undefined}
          search={search}
          onSearchChange={setSearch}
          filtersOpen={filtersOpen}
          onToggleFilters={() => setFiltersOpen((open) => !open)}
          filterActive={hasFilters}
        />
        <div className="public-offers-main-scroll">
          <main className="public-offers-body">
            <section className="public-offers-hero">
              <div className="public-offers-hero-bg" aria-hidden="true" />
              <div className="public-offers-hero-copy">
                <h1>{sellerUsername ? `@${sellerUsername}` : "Creative Network"}</h1>
                <p>
                  Work with verified creative partners. Payment stays secure until
                  you accept the delivery.
                </p>
              </div>
            </section>

            <div className="public-offers-values">
              {VALUE_PROPS.map((value) => (
                <div key={value.title} className="public-offers-value" title={value.copy}>
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
              <div className="public-offers-section-head">
                <h2>Services</h2>
                {filtered ? <span className="public-offers-chip">{filtered.length}</span> : null}
                <div className="public-offers-sort">
                  <CursorSelect
                    value={sort}
                    options={SORT_SELECT_OPTIONS}
                    onChange={(value) => setSort(value as SortKey)}
                    ariaLabel="Sort services"
                    align="end"
                  />
                </div>
              </div>

              {activeChips.length > 0 ? (
                <div className="public-offers-active-chips" aria-label="Active filters">
                  {activeChips.map((chip) => (
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
                  {activeChips.length > 1 ? (
                    <button
                      type="button"
                      className="public-offers-active-clear"
                      onClick={clearFilters}
                    >
                      Clear all
                    </button>
                  ) : null}
                </div>
              ) : null}

              {!filtered ? (
                <OffersState icon={<PackageSearch />} title="Loading services…" />
              ) : filtered.length === 0 ? (
                hasFilters ? (
                  <OffersState
                    icon={<Search />}
                    title="No matching services"
                    hint="Nothing fits these filters yet. Try widening your search."
                    action={
                      <button type="button" className="public-offers-btn" onClick={clearFilters}>
                        Clear filters
                      </button>
                    }
                  />
                ) : (
                  <OffersState
                    icon={<Store />}
                    title="No published services yet"
                    hint={
                      sellerUsername
                        ? "This creator has no live packages right now."
                        : "Creators are still setting up their packages. Check back soon."
                    }
                  />
                )
              ) : (
                <ul className="public-offers-grid">
                  {filtered.map((offer) => (
                    <li key={offer._id}>
                      <Link href={`/creative-network/${offer.slug}/`} className="public-offers-card">
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
                              {offer.sellerUsername ? ` · @${offer.sellerUsername}` : ""}
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
                          <OfferStatsChips
                            ratingAvg={offer.ratingAvg}
                            ratingCount={offer.ratingCount}
                            purchaseCount={offer.purchaseCount}
                          />
                          {offer.category ? (
                            <span className="public-offers-chip">{offer.category}</span>
                          ) : null}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </main>
        </div>
      </div>

      {filtersOpen ? (
        <div
          className="public-offers-filters-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
        >
          <button
            type="button"
            className="public-offers-filters-backdrop"
            aria-label="Dismiss filters"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="public-offers-filters-panel">
            <div className="public-offers-filters-head">
              <strong>Filters</strong>
              <button
                type="button"
                className="public-offers-btn is-icon is-quiet"
                aria-label="Close filters"
                onClick={() => setFiltersOpen(false)}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="public-offers-filters-body">
              <CatalogFiltersBody {...filterBodyProps} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PublicOffersCatalog() {
  return (
    <ConvexClientProvider>
      <div className="public-offers-route">
        <Suspense
          fallback={
            <div className="public-offers-shell">
              <aside className="public-offers-rail" aria-hidden="true">
                <div className="public-offers-rail-head">
                  <OffersSidebarBrand />
                </div>
              </aside>
              <div className="public-offers-main">
                <OffersTopbar showBrand={false} />
                <div className="public-offers-main-scroll">
                  <main className="public-offers-body">
                    <OffersState icon={<PackageSearch />} title="Loading services…" />
                  </main>
                </div>
              </div>
            </div>
          }
        >
          <OffersCatalogInner />
        </Suspense>
      </div>
    </ConvexClientProvider>
  );
}

function BookPanel({
  offerId,
  slug,
  packageIndex,
}: {
  offerId: Id<"marketplaceOffers">;
  slug: string;
  packageIndex?: number;
}) {
  const router = useRouter();
  const quote = useQuery(api.marketplace.quoteBookOffer, { offerId, packageIndex });
  const book = useMutation(api.marketplace.bookOffer);
  const [busy, setBusy] = useState(false);

  async function onBook() {
    setBusy(true);
    try {
      if (quote && quote.shortfallCredits > 0) {
        toast.message("Top up your balance to book this package");
        router.push(`/?next=${encodeURIComponent(`/creative-network/${slug}/`)}&settings=billing`);
        return;
      }
      const result = await book({ offerId, packageIndex });
      toast.success("Job booked — payment held until you accept delivery");
      router.push(`/?next=${encodeURIComponent("/")}&offers=1`);
      void result;
    } catch (error) {
      const msg = friendlyConvexError(error, "Could not book offer.");
      if (/Insufficient credits/i.test(msg)) {
        toast.message("Top up your balance to book this package");
        router.push(`/?next=${encodeURIComponent(`/creative-network/${slug}/`)}&settings=billing`);
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="public-offers-panel">
      <h2>Booking</h2>
      {quote ? (
        <dl className="public-offers-rows">
          {quote.packageName ? (
            <div className="public-offers-row">
              <dt>Package</dt>
              <dd>{quote.packageName}</dd>
            </div>
          ) : null}
          <div className="public-offers-row">
            <dt>Price</dt>
            <dd>{formatTtdCents(quote.priceCents)}</dd>
          </div>
          <div className="public-offers-row">
            <dt>Delivery</dt>
            <dd>{quote.deliveryDays} days</dd>
          </div>
          <div className="public-offers-row">
            <dt>Your balance</dt>
            <dd>{formatTtdFromCredits(quote.creditBalance, quote.creditPriceCents)}</dd>
          </div>
        </dl>
      ) : null}
      <button
        type="button"
        disabled={busy || (quote != null && !quote.canBook && quote.shortfallCredits === 0)}
        onClick={() => void onBook()}
        className="public-offers-btn is-primary is-block"
      >
        <Wallet aria-hidden="true" />
        {busy ? "Booking…" : quote && quote.shortfallCredits > 0 ? "Top up to book" : "Book offer"}
      </button>
      <p className="public-offers-note">
        {quote && quote.shortfallCredits > 0
          ? `You need ${formatTtdFromCredits(quote.shortfallCredits, quote.creditPriceCents)} more to book this package.`
          : "Payment is held until you accept the delivery."}
      </p>
    </section>
  );
}

type GalleryItem = {
  kind: string;
  name?: string;
  url?: string;
  thumbnailUrl?: string;
};

function OfferGallery({ items }: { items: GalleryItem[] }) {
  const [index, setIndex] = useState(0);
  const active = items[Math.min(index, items.length - 1)];
  if (!active) return null;
  return (
    <section className="public-offers-gallery" aria-label="Work samples">
      <div className="public-offers-gallery-stage">
        {active.kind === "video" && active.url ? (
          <video key={active.url} src={active.url} controls playsInline preload="metadata" />
        ) : active.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={active.url} alt={active.name ?? "Work sample"} />
        ) : null}
      </div>
      {items.length > 1 ? (
        <div className="public-offers-gallery-thumbs" role="tablist" aria-label="Gallery items">
          {items.map((item, i) => (
            <button
              key={`${item.url ?? i}`}
              type="button"
              role="tab"
              aria-selected={i === index}
              className={i === index ? "is-active" : undefined}
              onClick={() => setIndex(i)}
              title={item.name}
            >
              {item.thumbnailUrl ?? item.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.thumbnailUrl ?? item.url} alt="" loading="lazy" />
              ) : null}
              {item.kind === "video" ? <span className="public-offers-gallery-badge">▶</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

type OfferPackageView = {
  name: string;
  description: string;
  priceCents: number;
  deliveryDays: number;
  revisions: number;
  features: string[];
};

function PackagePicker({
  packages,
  index,
  onIndex,
}: {
  packages: OfferPackageView[];
  index: number;
  onIndex: (i: number) => void;
}) {
  const active = packages[index] ?? packages[0];
  return (
    <section className="public-offers-panel">
      <h2>Packages</h2>
      <div className="public-offers-tiers" role="tablist" aria-label="Packages">
        {packages.map((pkg, i) => (
          <button
            key={pkg.name + i}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`public-offers-tier${i === index ? " is-active" : ""}`}
            onClick={() => onIndex(i)}
          >
            <strong>{pkg.name}</strong>
            <span>{formatTtdCents(pkg.priceCents)}</span>
          </button>
        ))}
      </div>
      {active ? (
        <div className="public-offers-tier-detail">
          {active.description ? (
            <p className="public-offers-prose">{active.description}</p>
          ) : null}
          <dl className="public-offers-rows">
            <div className="public-offers-row">
              <dt>Delivery</dt>
              <dd>{active.deliveryDays} days</dd>
            </div>
            <div className="public-offers-row">
              <dt>Revisions</dt>
              <dd>{active.revisions}</dd>
            </div>
          </dl>
          {active.features.length > 0 ? (
            <ul className="public-offers-features">
              {active.features.map((feature) => (
                <li key={feature}>
                  <Check aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function OfferDetailInner({ slug }: { slug: string }) {
  const offer = useQuery(api.marketplace.getPublicOfferBySlug, { slug });
  const { isAuthenticated } = useConvexAuth();
  const [pkgIndex, setPkgIndex] = useState(0);
  const [bookSheetOpen, setBookSheetOpen] = useState(false);
  const packages = offer?.packages ?? [];
  const hasPackages = packages.length > 0;
  const activePkg = hasPackages
    ? (packages[Math.min(pkgIndex, packages.length - 1)] ?? packages[0])
    : null;

  useEffect(() => {
    if (!bookSheetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBookSheetOpen(false);
    };
    const onResize = () => {
      if (window.matchMedia("(min-width: 861px)").matches) {
        setBookSheetOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      document.body.style.overflow = previous;
    };
  }, [bookSheetOpen]);

  const sidebarBody =
    offer && offer !== null ? (
      <div className="public-offers-rail-detail">
        {hasPackages ? (
          <PackagePicker
            packages={packages}
            index={pkgIndex}
            onIndex={setPkgIndex}
          />
        ) : (
          <section className="public-offers-panel">
            <h2>Package</h2>
            <p className="public-offers-price">{formatTtdCents(offer.priceCents)}</p>
            <dl className="public-offers-rows">
              <div className="public-offers-row">
                <dt>Delivery</dt>
                <dd>{offer.deliveryDays} days</dd>
              </div>
              {offer.category ? (
                <div className="public-offers-row">
                  <dt>Category</dt>
                  <dd>{offer.category}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        )}

        {isAuthenticated ? (
          <Authenticated>
            <BookPanel
              offerId={offer._id}
              slug={offer.slug}
              packageIndex={hasPackages ? pkgIndex : undefined}
            />
          </Authenticated>
        ) : (
          <Unauthenticated>
            <section className="public-offers-panel">
              <h2>Booking</h2>
              <p className="public-offers-note">
                Sign in to your Studio account to book this package in TTD.
              </p>
              <a
                href={`/?next=${encodeURIComponent(`/creative-network/${offer.slug}/`)}`}
                className="public-offers-btn is-primary is-block"
              >
                <Wallet aria-hidden="true" />
                Sign in to book
              </a>
            </section>
          </Unauthenticated>
        )}
      </div>
    ) : null;

  if (offer === undefined) {
    return (
      <div className="public-offers-shell">
        <aside className="public-offers-rail" aria-label="Book this service">
          <div className="public-offers-rail-head">
            <OffersSidebarBrand />
          </div>
          <div className="public-offers-rail-body">
            <p className="public-offers-note" style={{ padding: "0 12px" }}>
              Loading…
            </p>
          </div>
        </aside>
        <div className="public-offers-main">
          <OffersTopbar
            showBrand={false}
            back={{ href: "/creative-network/", label: "All services" }}
          />
          <div className="public-offers-main-scroll">
            <main className="public-offers-body">
              <OffersState icon={<PackageSearch />} title="Loading service…" />
            </main>
          </div>
        </div>
      </div>
    );
  }

  if (offer === null) {
    return (
      <div className="public-offers-shell">
        <aside className="public-offers-rail" aria-label="Book this service">
          <div className="public-offers-rail-head">
            <OffersSidebarBrand />
          </div>
          <div className="public-offers-rail-body">
            <p className="public-offers-note" style={{ padding: "0 12px" }}>
              This package is no longer published.
            </p>
          </div>
        </aside>
        <div className="public-offers-main">
          <OffersTopbar
            showBrand={false}
            back={{ href: "/creative-network/", label: "All services" }}
          />
          <div className="public-offers-main-scroll">
            <main className="public-offers-body">
              <OffersState
                icon={<Store />}
                title="Service not found"
                hint="This package is no longer published. Browse the other creator services instead."
              />
            </main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="public-offers-shell">
      <aside className="public-offers-rail" aria-label="Book this service">
        <div className="public-offers-rail-head">
          <OffersSidebarBrand />
        </div>
        <div className="public-offers-rail-nav">
          <Link href="/creative-network/" className="public-offers-rail-back">
            <ArrowLeft aria-hidden="true" />
            All services
          </Link>
        </div>
        <div className="public-offers-rail-body">{sidebarBody}</div>
      </aside>

      <div className="public-offers-main">
        <OffersTopbar
          showBrand={false}
          back={{ href: "/creative-network/", label: "All services" }}
          filtersOpen={bookSheetOpen}
          onToggleFilters={() => setBookSheetOpen((open) => !open)}
          filterActive={hasPackages}
          filterTitle="Book"
        />
        <div className="public-offers-main-scroll">
          <main className="public-offers-body">
            {offer.gallery && offer.gallery.length > 0 ? (
              <OfferGallery items={offer.gallery} />
            ) : null}

            <section className="public-offers-detail-intro">
              <div className="public-offers-detail-intro-copy">
                {offer.category ? (
                  <p className="public-offers-kicker">{offer.category}</p>
                ) : (
                  <p className="public-offers-kicker">Creative Network</p>
                )}
                <h1>{offer.title}</h1>
                <p>
                  {offer.sellerBusinessName}
                  {offer.sellerUsername ? (
                    <>
                      {" · "}
                      <Link href={`/u/${offer.sellerUsername}`}>
                        @{offer.sellerUsername}
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="public-offers-detail-intro-meta">
                <span className="public-offers-chip">
                  <Clock aria-hidden="true" />
                  {(activePkg?.deliveryDays ?? offer.deliveryDays)} day delivery
                </span>
                <span className="public-offers-chip">
                  {hasPackages && packages.length > 1 ? "From " : ""}
                  {formatTtdCents(activePkg?.priceCents ?? offer.priceCents)}
                </span>
                <OfferStatsChips
                  ratingAvg={offer.ratingAvg}
                  ratingCount={offer.ratingCount}
                  purchaseCount={offer.purchaseCount}
                />
              </div>
            </section>

            <section className="public-offers-panel">
              <h2>What you get</h2>
              <p className="public-offers-prose">{offer.description}</p>
            </section>

            <OfferReviewsList offerId={offer._id} />
          </main>
        </div>
      </div>

      {bookSheetOpen ? (
        <div
          className="public-offers-filters-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Packages and booking"
        >
          <button
            type="button"
            className="public-offers-filters-backdrop"
            aria-label="Dismiss booking"
            onClick={() => setBookSheetOpen(false)}
          />
          <div className="public-offers-filters-panel">
            <div className="public-offers-filters-head">
              <strong>Book</strong>
              <button
                type="button"
                className="public-offers-btn is-icon is-quiet"
                aria-label="Close booking"
                onClick={() => setBookSheetOpen(false)}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="public-offers-filters-body">{sidebarBody}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PublicOfferDetail({ slug }: { slug: string }) {
  return (
    <ConvexClientProvider>
      <div className="public-offers-route">
        <OfferDetailInner slug={slug} />
      </div>
    </ConvexClientProvider>
  );
}
