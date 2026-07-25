"use client";

import { Authenticated, Unauthenticated, useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowLeft, ArrowUpRight, Clock, HandCoins, PackageSearch, Store, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { ConvexClientProvider } from "@/app/ConvexClientProvider";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useMercurySidebarLogo } from "@/lib/use-appearance-mode";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { formatTtdCents } from "@/studio/lib/money";
import "./public-offers.css";

function OffersTopbar({ back }: { back?: { href: string; label: string } }) {
  const logoSrc = useMercurySidebarLogo();
  return (
    <header className="public-offers-topbar">
      <Link href="/offers" className="public-offers-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="" aria-hidden="true" />
        <strong>Yatishara Studio</strong>
        <span>Offers</span>
      </Link>
      <div className="public-offers-topbar-actions">
        {back ? (
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
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="public-offers-state">
      <span className="public-offers-state-icon">{icon}</span>
      <strong>{title}</strong>
      {hint ? <p>{hint}</p> : null}
    </div>
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
  return (
    <>
      <OffersTopbar
        back={sellerUsername ? { href: "/offers", label: "All offers" } : undefined}
      />
      <main className="public-offers-body">
        <section className="public-offers-hero">
          <div className="public-offers-hero-copy">
            <p className="public-offers-kicker">Marketplace</p>
            <h1>{sellerUsername ? `@${sellerUsername} offers` : "Creator offers"}</h1>
            <p>
              Book packages from approved Studio creators. Prices are in TTD and paid with
              Studio credits held in escrow until you accept the delivery.
            </p>
          </div>
          <span className="public-offers-chip">
            <HandCoins aria-hidden="true" />
            Escrow protected
          </span>
        </section>

        <div className="public-offers-section-head">
          <h2>Published offers</h2>
          {offers ? <span className="public-offers-chip">{offers.length}</span> : null}
        </div>

        {!offers ? (
          <OffersState icon={<PackageSearch />} title="Loading offers…" />
        ) : offers.length === 0 ? (
          <OffersState
            icon={<Store />}
            title="No published offers yet"
            hint={
              sellerUsername
                ? "This creator has no live packages right now."
                : "Creators are still setting up their packages. Check back soon."
            }
          />
        ) : (
          <ul className="public-offers-grid">
            {offers.map((offer) => (
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
      </main>
    </>
  );
}

export function PublicOffersCatalog() {
  return (
    <ConvexClientProvider>
      <div className="public-offers-route">
        <Suspense
          fallback={
            <main className="public-offers-body">
              <OffersState icon={<PackageSearch />} title="Loading offers…" />
            </main>
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
        <OffersTopbar back={{ href: "/offers", label: "All offers" }} />
        <main className="public-offers-body is-narrow">
          <OffersState icon={<PackageSearch />} title="Loading offer…" />
        </main>
      </>
    );
  }
  if (offer === null) {
    return (
      <>
        <OffersTopbar back={{ href: "/offers", label: "All offers" }} />
        <main className="public-offers-body is-narrow">
          <OffersState
            icon={<Store />}
            title="Offer not found"
            hint="This package is no longer published. Browse the other creator offers instead."
          />
        </main>
      </>
    );
  }

  return (
    <>
      <OffersTopbar back={{ href: "/offers", label: "All offers" }} />
      <main className="public-offers-body is-narrow">
        <section className="public-offers-hero">
          <div className="public-offers-hero-copy">
            <p className="public-offers-kicker">Offer</p>
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
      <div className="public-offers-route">
        <OfferDetailInner slug={slug} />
      </div>
    </ConvexClientProvider>
  );
}
