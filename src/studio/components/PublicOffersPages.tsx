"use client";

import { Authenticated, Unauthenticated, useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { ConvexClientProvider } from "@/app/ConvexClientProvider";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { formatTtdCents } from "@/studio/lib/money";

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
    <main className="marketplace-public mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-wide opacity-60">Yatishara Studio</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {sellerUsername ? `@${sellerUsername} offers` : "Offers"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm opacity-70">
          Browse creator packages. Booking requires a Studio account and credits (shown in TTD).
        </p>
        {sellerUsername ? (
          <p className="mt-2 text-sm">
            <Link href="/offers" className="underline opacity-70">
              All offers
            </Link>
          </p>
        ) : null}
      </header>
      {!offers ? (
        <p className="text-sm opacity-60">Loading offers…</p>
      ) : offers.length === 0 ? (
        <p className="text-sm opacity-60">No published offers yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {offers.map((offer) => (
            <li key={offer._id}>
              <Link
                href={`/offers/${offer.slug}`}
                className="block rounded-xl border border-black/10 bg-white/70 p-4 transition hover:border-black/25 dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-medium">{offer.title}</h2>
                    <p className="mt-1 text-xs opacity-60">
                      {offer.sellerBusinessName}
                      {offer.sellerUsername ? ` · @${offer.sellerUsername}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium">
                    {formatTtdCents(offer.priceCents)}
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 text-sm opacity-75">{offer.description}</p>
                <p className="mt-3 text-xs opacity-50">{offer.deliveryDays} day delivery</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-10 text-sm opacity-50">
        <Link href="/" className="underline">
          Open Studio
        </Link>
      </p>
    </main>
  );
}

export function PublicOffersCatalog() {
  return (
    <ConvexClientProvider>
      <div className="h-svh overflow-y-auto bg-[radial-gradient(1200px_600px_at_20%_-10%,rgba(255,196,120,.35),transparent),linear-gradient(180deg,#f7f3eb,#efe6d8)] text-stone-900 dark:bg-[radial-gradient(1000px_500px_at_10%_-20%,rgba(80,60,40,.45),transparent),#0c0b0a] dark:text-stone-100">
        <Suspense fallback={<p className="p-10 text-sm opacity-60">Loading…</p>}>
          <OffersCatalogInner />
        </Suspense>
      </div>
    </ConvexClientProvider>
  );
}

function BookButton({ offerId, slug }: { offerId: Id<"marketplaceOffers">; slug: string }) {
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
    <div className="mt-6 flex flex-col gap-2">
      {quote ? (
        <p className="text-sm opacity-70">
          {formatTtdCents(quote.priceCents)} · {quote.priceCredits} credits
          {quote.shortfallCredits > 0
            ? ` · need ${quote.shortfallCredits} more credits`
            : " · balance OK"}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy || (quote != null && !quote.canBook && quote.shortfallCredits === 0)}
        onClick={() => void onBook()}
        className="inline-flex w-fit items-center rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
      >
        {busy ? "Booking…" : quote && quote.shortfallCredits > 0 ? "Top up to book" : "Book offer"}
      </button>
    </div>
  );
}

function OfferDetailInner({ slug }: { slug: string }) {
  const offer = useQuery(api.marketplace.getPublicOfferBySlug, { slug });
  const { isAuthenticated } = useConvexAuth();

  if (offer === undefined) {
    return <p className="p-10 text-sm opacity-60">Loading…</p>;
  }
  if (offer === null) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Offer not found</h1>
        <Link href="/offers" className="mt-4 inline-block text-sm underline">
          Back to offers
        </Link>
      </main>
    );
  }

  return (
    <main className="marketplace-public mx-auto max-w-3xl px-4 py-10">
      <Link href="/offers" className="text-sm opacity-60 underline">
        ← All offers
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{offer.title}</h1>
      <p className="mt-2 text-sm opacity-60">
        {offer.sellerBusinessName}
        {offer.sellerUsername ? (
          <>
            {" · "}
            <Link href={`/u/${offer.sellerUsername}`} className="underline">
              @{offer.sellerUsername}
            </Link>
          </>
        ) : null}
      </p>
      <p className="mt-4 text-lg font-medium">{formatTtdCents(offer.priceCents)}</p>
      <p className="mt-1 text-sm opacity-60">{offer.deliveryDays} day delivery</p>
      <p className="mt-6 whitespace-pre-wrap text-sm leading-relaxed opacity-85">{offer.description}</p>

      {isAuthenticated ? (
        <Authenticated>
          <BookButton offerId={offer._id} slug={offer.slug} />
        </Authenticated>
      ) : (
        <Unauthenticated>
          <div className="mt-6">
            <a
              href={`/?next=${encodeURIComponent(`/offers/${offer.slug}`)}`}
              className="inline-flex rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white dark:bg-stone-100 dark:text-stone-900"
            >
              Sign in to book
            </a>
          </div>
        </Unauthenticated>
      )}
    </main>
  );
}

export function PublicOfferDetail({ slug }: { slug: string }) {
  return (
    <ConvexClientProvider>
      <div className="h-svh overflow-y-auto bg-[radial-gradient(1200px_600px_at_20%_-10%,rgba(255,196,120,.35),transparent),linear-gradient(180deg,#f7f3eb,#efe6d8)] text-stone-900 dark:bg-[radial-gradient(1000px_500px_at_10%_-20%,rgba(80,60,40,.45),transparent),#0c0b0a] dark:text-stone-100">
        <OfferDetailInner slug={slug} />
      </div>
    </ConvexClientProvider>
  );
}
