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
  Clock,
  Handshake,
  ListFilter,
  MessageSquareText,
  PackageCheck,
  PackageSearch,
  Search,
  ShieldCheck,
  Sparkles,
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
import { formatTtdCents } from "@/studio/lib/money";
import "./public-offers.css";

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
}: {
  back?: { href: string; label: string };
  showBrand?: boolean;
  search?: string;
  onSearchChange?: (value: string) => void;
  filtersOpen?: boolean;
  onToggleFilters?: () => void;
  filterActive?: boolean;
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
            aria-label={filtersOpen ? "Close filters" : "Open filters"}
            aria-expanded={filtersOpen}
            title="Filters"
            onClick={onToggleFilters}
          >
            {filtersOpen ? <X aria-hidden="true" /> : <ListFilter aria-hidden="true" />}
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
    title: "Verified partners",
    copy: "Every creator is identity-checked before they can join the network.",
  },
  {
    icon: ShieldCheck,
    title: "Secure booking",
    copy: "Your credits stay in escrow and release only when you accept the work.",
  },
  {
    icon: PackageCheck,
    title: "Clear delivery",
    copy: "Every package has a defined timeline and a tracked handover in Studio.",
  },
  {
    icon: Handshake,
    title: "Work with, not for",
    copy: "Book partners for scoped work — collaborative, not a freelance bidding board.",
  },
  {
    icon: MessageSquareText,
    title: "Direct in Studio",
    copy: "Briefs, revisions, and delivery stay inside Studio instead of scattered chats.",
  },
  {
    icon: Sparkles,
    title: "Curated quality",
    copy: "Packages are reviewed before they go live so the catalog stays high-signal.",
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
                  Work with verified creative partners. Credits stay secure until
                  you accept the delivery.
                </p>
              </div>
            </section>

            <div className="public-offers-values">
              {VALUE_PROPS.map((value) => (
                <div key={value.title} className="public-offers-value">
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
                        <div className="public-offers-card-top">
                          <div>
                            <h3 className="public-offers-card-title">{offer.title}</h3>
                            <p className="public-offers-card-seller">
                              {offer.sellerBusinessName}
                              {offer.sellerUsername ? ` · @${offer.sellerUsername}` : ""}
                            </p>
                          </div>
                          <span className="public-offers-card-price">
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

function BookPanel({ offerId, slug }: { offerId: Id<"marketplaceOffers">; slug: string }) {
  const router = useRouter();
  const quote = useQuery(api.marketplace.quoteBookOffer, { offerId });
  const book = useMutation(api.marketplace.bookOffer);
  const [busy, setBusy] = useState(false);

  async function onBook() {
    setBusy(true);
    try {
      if (quote && quote.shortfallCredits > 0) {
        toast.message("Top up credits to book this offer");
        router.push(`/?next=${encodeURIComponent(`/creative-network/${slug}/`)}&settings=billing`);
        return;
      }
      const result = await book({ offerId });
      toast.success("Job booked — escrow held");
      router.push(`/?next=${encodeURIComponent("/")}&offers=1`);
      void result;
    } catch (error) {
      const msg = friendlyConvexError(error, "Could not book offer.");
      if (/Insufficient credits/i.test(msg)) {
        toast.message("Top up credits to book this offer");
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
          <div className="public-offers-row">
            <dt>Price</dt>
            <dd>{formatTtdCents(quote.priceCents)}</dd>
          </div>
          <div className="public-offers-row">
            <dt>Credits</dt>
            <dd>{quote.priceCredits}</dd>
          </div>
          <div className="public-offers-row">
            <dt>Your balance</dt>
            <dd>{quote.creditBalance}</dd>
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
          ? `You need ${quote.shortfallCredits} more credits to book this package.`
          : "Credits are held in escrow and only released once you accept the delivery."}
      </p>
    </section>
  );
}

function OfferDetailInner({ slug }: { slug: string }) {
  const offer = useQuery(api.marketplace.getPublicOfferBySlug, { slug });
  const { isAuthenticated } = useConvexAuth();

  if (offer === undefined) {
    return (
      <>
        <OffersTopbar back={{ href: "/creative-network/", label: "All services" }} />
        <main className="public-offers-body is-narrow">
          <OffersState icon={<PackageSearch />} title="Loading service…" />
        </main>
      </>
    );
  }
  if (offer === null) {
    return (
      <>
        <OffersTopbar back={{ href: "/creative-network/", label: "All services" }} />
        <main className="public-offers-body is-narrow">
          <OffersState
            icon={<Store />}
            title="Service not found"
            hint="This package is no longer published. Browse the other creator services instead."
          />
        </main>
      </>
    );
  }

  return (
    <>
      <OffersTopbar back={{ href: "/creative-network/", label: "All services" }} />
      <main className="public-offers-body is-narrow">
        <section className="public-offers-hero">
          <div className="public-offers-hero-copy">
            <p className="public-offers-kicker">Creative Network</p>
            <h1>{offer.title}</h1>
            <p>
              {offer.sellerBusinessName}
              {offer.sellerUsername ? (
                <>
                  {" · "}
                  <Link href={`/u/${offer.sellerUsername}`}>@{offer.sellerUsername}</Link>
                </>
              ) : null}
            </p>
          </div>
          <span className="public-offers-chip">
            <Clock aria-hidden="true" />
            {offer.deliveryDays} day delivery
          </span>
        </section>

        <div className="public-offers-detail">
          <div className="public-offers-detail-main">
            <section className="public-offers-panel">
              <h2>What you get</h2>
              <p className="public-offers-prose">{offer.description}</p>
            </section>
          </div>

          <div className="public-offers-detail-aside">
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

            {isAuthenticated ? (
              <Authenticated>
                <BookPanel offerId={offer._id} slug={offer.slug} />
              </Authenticated>
            ) : (
              <Unauthenticated>
                <section className="public-offers-panel">
                  <h2>Booking</h2>
                  <p className="public-offers-note">
                    Sign in to your Studio account to book this package with credits.
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
        </div>
      </main>
    </>
  );
}

export function PublicOfferDetail({ slug }: { slug: string }) {
  return (
    <ConvexClientProvider>
      <div className="public-offers-route is-plain">
        <OfferDetailInner slug={slug} />
      </div>
    </ConvexClientProvider>
  );
}
