"use client";

import { Authenticated, Unauthenticated, useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Clock,
  PackageCheck,
  PackageSearch,
  Search,
  ShieldCheck,
  Store,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConvexClientProvider } from "@/app/ConvexClientProvider";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useMercurySidebarLogo } from "@/lib/use-appearance-mode";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { formatTtdCents } from "@/studio/lib/money";
import "./public-offers.css";

function OffersSidebarBrand() {
  const logoSrc = useMercurySidebarLogo();
  return (
    <Link href="/offers" className="public-offers-sidebar-brand">
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
}: {
  back?: { href: string; label: string };
  showBrand?: boolean;
}) {
  const logoSrc = useMercurySidebarLogo();
  return (
    <header className="public-offers-topbar">
      {showBrand ? (
        <Link href="/offers" className="public-offers-brand">
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
              {back.label}
            </Link>
          ) : null}
        </div>
      )}
      <div className="public-offers-topbar-actions">
        {showBrand && back ? (
          <Link href={back.href} className="public-offers-btn is-quiet">
            <ArrowLeft aria-hidden="true" />
            {back.label}
          </Link>
        ) : null}
        <Link href="/" className="public-offers-btn">
          Open Studio
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
] as const;

const PRICE_FILTERS = [
  { value: "any", label: "Any price", min: 0, max: Infinity },
  { value: "under100", label: "Under $100", min: 0, max: 10_000 },
  { value: "100to500", label: "$100 – $500", min: 10_000, max: 50_000 },
  { value: "500to1000", label: "$500 – $1,000", min: 50_000, max: 100_000 },
  { value: "over1000", label: "Over $1,000", min: 100_000, max: Infinity },
] as const;

const DELIVERY_FILTERS = [
  { value: "any", label: "Any timeline", maxDays: Infinity },
  { value: "3", label: "Up to 3 days", maxDays: 3 },
  { value: "7", label: "Up to 7 days", maxDays: 7 },
  { value: "14", label: "Up to 14 days", maxDays: 14 },
] as const;

type PriceFilter = (typeof PRICE_FILTERS)[number]["value"];
type DeliveryFilter = (typeof DELIVERY_FILTERS)[number]["value"];

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="public-offers-filter-group">
      <h3>{title}</h3>
      <div className="public-offers-filter-options">{children}</div>
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
      className={`public-offers-filter-btn${active ? " is-active" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      <span>{label}</span>
      {count !== undefined ? <em>{count}</em> : null}
    </button>
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
  const [category, setCategory] = useState("all");
  const [price, setPrice] = useState<PriceFilter>("any");
  const [delivery, setDelivery] = useState<DeliveryFilter>("any");

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const offer of offers ?? []) {
      const key = offer.category?.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [offers]);

  const filtered = useMemo(() => {
    if (!offers) return undefined;
    const query = search.trim().toLowerCase();
    const priceRange = PRICE_FILTERS.find((p) => p.value === price) ?? PRICE_FILTERS[0];
    const deliveryRange =
      DELIVERY_FILTERS.find((d) => d.value === delivery) ?? DELIVERY_FILTERS[0];
    return offers.filter((offer) => {
      if (category !== "all" && offer.category?.trim() !== category) return false;
      if (offer.priceCents < priceRange.min || offer.priceCents >= priceRange.max) {
        return false;
      }
      if (offer.deliveryDays > deliveryRange.maxDays) return false;
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
    });
  }, [offers, search, category, price, delivery]);

  const hasFilters =
    search.trim() !== "" || category !== "all" || price !== "any" || delivery !== "any";

  function clearFilters() {
    setSearch("");
    setCategory("all");
    setPrice("any");
    setDelivery("any");
  }

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
          <FilterGroup title="Category">
            <FilterOption
              active={category === "all"}
              onClick={() => setCategory("all")}
              label="All categories"
              count={offers?.length}
            />
            {categories.map(([name, count]) => (
              <FilterOption
                key={name}
                active={category === name}
                onClick={() => setCategory(name)}
                label={name}
                count={count}
              />
            ))}
          </FilterGroup>

          <FilterGroup title="Price">
            {PRICE_FILTERS.map((option) => (
              <FilterOption
                key={option.value}
                active={price === option.value}
                onClick={() => setPrice(option.value)}
                label={option.label}
              />
            ))}
          </FilterGroup>

          <FilterGroup title="Delivery time">
            {DELIVERY_FILTERS.map((option) => (
              <FilterOption
                key={option.value}
                active={delivery === option.value}
                onClick={() => setDelivery(option.value)}
                label={option.label}
              />
            ))}
          </FilterGroup>

          {hasFilters ? (
            <button
              type="button"
              className="public-offers-btn is-quiet public-offers-rail-clear"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </aside>

      <div className="public-offers-main">
        <OffersTopbar
          showBrand={false}
          back={sellerUsername ? { href: "/offers", label: "All services" } : undefined}
        />
        <div className="public-offers-main-scroll">
          <main className="public-offers-body">
            <section className="public-offers-hero">
              <div className="public-offers-hero-bg" aria-hidden="true" />
              <div className="public-offers-hero-copy">
                <p className="public-offers-kicker">Yatishara Studio</p>
                <h1>{sellerUsername ? `@${sellerUsername}` : "Creative Network"}</h1>
                <p>
                  Work with verified creative partners on packages priced in TTD.
                  Credits stay secure until you accept the delivery.
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
              </div>

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
                      <Link href={`/offers/${offer.slug}`} className="public-offers-card">
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
        router.push(`/?next=${encodeURIComponent(`/offers/${slug}`)}&settings=billing`);
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
        router.push(`/?next=${encodeURIComponent(`/offers/${slug}`)}&settings=billing`);
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
        <OffersTopbar back={{ href: "/offers", label: "All services" }} />
        <main className="public-offers-body is-narrow">
          <OffersState icon={<PackageSearch />} title="Loading service…" />
        </main>
      </>
    );
  }
  if (offer === null) {
    return (
      <>
        <OffersTopbar back={{ href: "/offers", label: "All services" }} />
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
      <OffersTopbar back={{ href: "/offers", label: "All services" }} />
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
                    href={`/?next=${encodeURIComponent(`/offers/${offer.slug}`)}`}
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
