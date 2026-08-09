"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  GraduationCap,
  Library,
  Loader2,
  Lock,
  MessageCircle,
  Tag,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState, Fragment } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useHorizontalScrollFade } from "@/desk/lib/use-horizontal-scroll-fade";
import { useHorizontalWheelScroll } from "@/desk/lib/use-horizontal-wheel-scroll";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  DEFAULT_CREDIT_PRICE_CENTS,
  creditsFromAmountCents,
  creditsToCents,
  formatTtdCents,
  formatTtdFromCredits,
  formatTtdShort,
  paywiseCardFeeCents,
  paywiseCheckoutTotalCents,
  topUpMinAmountCents,
} from "@/studio/lib/money";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { StudioChatMarkdown } from "./StudioChatMarkdown";
import { useStudioAcademy } from "./StudioAcademyContext";
import { ProfileCommentsPanel } from "./ProfileCommentsPanel";
import { MediaLoadFrame, MediaLoadWave } from "./media-load-frame";
import { StudioConfirmOverlay } from "./StudioConfirmOverlay";
import { StudioCnBookSheet } from "./StudioCnBookSheet";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
import "./studio-creative-network.css";
import "./public-offers.css";
import "./profile-post-viewer.css";
import "./media-load-frame.css";

function localCoverUrl(slug: string): string | undefined {
  const map: Record<string, string> = {
    "ad-side-hustle": "/academy/ad-side-hustle.webp",
    "short-films-studio": "/academy/short-films-studio.webp",
    "cinematic-film-mastery": "/academy/cinematic-film-mastery.webp",
  };
  if (map[slug]) return map[slug];
  if (!slug.startsWith("demo-")) return undefined;
  return `/academy/${slug}.webp`;
}

function courseBannerUrl(course: {
  slug: string;
  coverUrl?: string;
}): string | undefined {
  return localCoverUrl(course.slug) || course.coverUrl;
}

function useNowTick(intervalMs = 1_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function saleCountdownParts(saleEndsAt: number, now = Date.now()) {
  const ms = Math.max(0, Number(saleEndsAt) - now);
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const minMs = 60 * 1000;
  return {
    ended: ms <= 0,
    days: Math.floor(ms / dayMs),
    hours: Math.floor((ms % dayMs) / hourMs),
    mins: Math.floor((ms % hourMs) / minMs),
    secs: Math.floor((ms % minMs) / 1000),
  };
}

/** Human countdown for chips / receipt fallback. */
function formatSaleRemaining(saleEndsAt: number, now = Date.now()): string | null {
  const parts = saleCountdownParts(saleEndsAt, now);
  if (parts.ended) return null;
  if (parts.days >= 2) return `${parts.days} days left`;
  if (parts.days === 1) {
    return parts.hours > 0 ? `1 day ${parts.hours}h left` : "1 day left";
  }
  if (parts.hours >= 1) {
    return parts.mins > 0
      ? `${parts.hours}h ${parts.mins}m left`
      : `${parts.hours}h left`;
  }
  if (parts.mins >= 1) return `${parts.mins}m ${parts.secs}s left`;
  return `${Math.max(1, parts.secs)}s left`;
}

function saleDiscountCredits(
  priceCredits: number,
  compareAtCredits?: number | null,
): number | null {
  if (compareAtCredits == null || compareAtCredits <= priceCredits) return null;
  return compareAtCredits - priceCredits;
}

function salePercentOff(
  priceCredits: number,
  compareAtCredits?: number | null,
): number | null {
  if (compareAtCredits == null || compareAtCredits <= priceCredits) return null;
  const pct = Math.round(
    ((compareAtCredits - priceCredits) / compareAtCredits) * 100,
  );
  return pct >= 1 ? pct : null;
}

/** Drop a leading #/## heading that just repeats the course title. */
function academyBodyMarkdown(md: string, title: string): string {
  let text = String(md || "").replace(/^\uFEFF/, "").trim();
  const name = String(title || "").trim();
  if (!text || !name) return text;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  text = text.replace(
    new RegExp(`^#{1,3}[ \\t]+${escaped}[ \\t]*\\n+`, "i"),
    "",
  );
  return text.trim();
}

function SaleCountdownPanel({
  saleEndsAt,
  now,
  compact = false,
}: {
  saleEndsAt: number;
  now: number;
  compact?: boolean;
}) {
  const parts = saleCountdownParts(saleEndsAt, now);
  if (parts.ended) return null;
  const units =
    parts.days > 0
      ? [
          { value: parts.days, label: "d" },
          { value: parts.hours, label: "h" },
          { value: parts.mins, label: "m" },
        ]
      : [
          { value: parts.hours, label: "h" },
          { value: parts.mins, label: "m" },
          { value: parts.secs, label: "s" },
        ];
  const spoken = formatSaleRemaining(saleEndsAt, now) || "ending soon";
  return (
    <div
      className={`studio-academy-sale-pan${compact ? " is-compact" : ""}`}
      aria-label={`Sale ends in ${spoken}`}
    >
      <span className="studio-academy-sale-pan-kicker">Sale ends in</span>
      <div className="studio-academy-sale-pan-units">
        {units.map((unit, index) => (
          <Fragment key={unit.label}>
            {index > 0 ? (
              <span className="studio-academy-sale-pan-sep" aria-hidden="true">
                :
              </span>
            ) : null}
            <span className="studio-academy-sale-pan-unit">
              <strong>
                {String(unit.value).padStart(2, "0")}
                <span>{unit.label}</span>
              </strong>
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function newClientRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `academy-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function CheckoutDock({
  showHead,
  onBuyClick,
  onPaywiseClick,
  busy,
  owned,
  priceLabel,
  priceShort,
  listPriceLabel,
  discountLabel,
  saleEndsAt,
  now,
  needsTopUp,
  balanceLabel,
  topUpLabel,
  feeCents,
  totalDueCents,
}: {
  showHead: boolean;
  onBuyClick: () => void;
  onPaywiseClick?: () => void;
  busy: boolean;
  owned: boolean;
  priceLabel: string;
  priceShort: string;
  listPriceLabel?: string | null;
  discountLabel?: string | null;
  saleEndsAt?: number | null;
  now?: number;
  needsTopUp: boolean;
  balanceLabel: string;
  topUpLabel: string;
  feeCents: number;
  totalDueCents: number;
}) {
  const paywiseTotalShort = formatTtdShort(totalDueCents);
  const totalDueLabel = formatTtdCents(totalDueCents);
  const feeLabel = formatTtdShort(feeCents);
  const onSale = Boolean(listPriceLabel && discountLabel);
  const countdown =
    !owned &&
    onSale &&
    saleEndsAt != null &&
    Number.isFinite(saleEndsAt) ? (
      <SaleCountdownPanel
        saleEndsAt={saleEndsAt}
        now={now ?? Date.now()}
        compact
      />
    ) : null;
  const body = (
    <div className="public-offers-rail-detail">
      <section className="studio-academy-checkout" aria-label="Course checkout">
        <header className="studio-academy-checkout-hero">
          <GraduationCap
            className="studio-academy-checkout-hero-icon"
            aria-hidden="true"
          />
          <div className="studio-academy-checkout-hero-copy">
            <strong className="studio-academy-checkout-amount">
              {onSale && listPriceLabel ? (
                <s className="studio-academy-card-compare">{listPriceLabel}</s>
              ) : null}
              <span className="studio-academy-card-now">{priceLabel}</span>
            </strong>
            {!owned ? (
              <ul
                className="studio-academy-checkout-chips"
                aria-label="Course access"
              >
                <li>Lifetime access</li>
              </ul>
            ) : null}
          </div>
        </header>

        {owned ? (
          <p className="studio-academy-checkout-note">You own this course.</p>
        ) : needsTopUp ? (
          <>
            {countdown}
            <dl className="studio-academy-checkout-receipt">
              <div className="studio-academy-checkout-row">
                <dt>Wallet</dt>
                <dd>{balanceLabel}</dd>
              </div>
              <div className="studio-academy-checkout-row">
                <dt>Top up</dt>
                <dd>{topUpLabel}</dd>
              </div>
              {feeCents > 0 ? (
                <div className="studio-academy-checkout-row is-muted">
                  <dt>PayWise fee</dt>
                  <dd>{feeLabel}</dd>
                </div>
              ) : null}
              <div className="studio-academy-checkout-row is-total">
                <dt>Pay now</dt>
                <dd>{totalDueLabel}</dd>
              </div>
            </dl>
            <div className="studio-academy-checkout-paywise">
              <button
                type="button"
                className={`studio-settings-topup-pay${busy ? " is-loading" : ""}`}
                disabled={busy}
                onClick={onPaywiseClick}
                aria-busy={busy}
                aria-label={
                  busy
                    ? "Opening PayWise"
                    : `Pay ${paywiseTotalShort} with PayWise to unlock course`
                }
              >
                {busy ? (
                  <Loader2
                    className="studio-settings-topup-pay-spin"
                    aria-hidden="true"
                  />
                ) : null}
                <span className="studio-settings-topup-pay-label">
                  {busy
                    ? "Opening PayWise…"
                    : `Pay ${paywiseTotalShort} with PayWise`}
                </span>
              </button>
              <p className="studio-settings-topup-secure">
                <Lock aria-hidden="true" />
                <span>secure · unlocks after payment</span>
              </p>
            </div>
          </>
        ) : (
          <>
            {countdown}
            <div className="studio-academy-checkout-paywise">
              <button
                type="button"
                className={`studio-settings-topup-pay is-theme${busy ? " is-loading" : ""}`}
                disabled={busy}
                onClick={onBuyClick}
                aria-busy={busy}
                aria-label={
                  busy
                    ? "Opening checkout"
                    : `Pay ${priceShort} with wallet to unlock course`
                }
              >
                {busy ? (
                  <Loader2
                    className="studio-settings-topup-pay-spin"
                    aria-hidden="true"
                  />
                ) : null}
                <span className="studio-settings-topup-pay-label">
                  {busy ? "Opening…" : `Pay ${priceShort} with wallet`}
                </span>
              </button>
              <p className="studio-settings-topup-secure">
                <Lock aria-hidden="true" />
                <span>secure · unlocks right away</span>
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );

  if (!showHead) return body;

  return (
    <aside className="studio-cn-book-sidebar" aria-label="Course checkout">
      <div className="studio-cn-book-sidebar-head cursor-panel-head cursor-sidebar-head shrink-0">
        <strong>Buy</strong>
      </div>
      <div className="studio-cn-book-sidebar-body">{body}</div>
    </aside>
  );
}

function BannerStage({
  bannerUrl,
  embedUrl,
  loading,
  onPlay,
  playLabel,
}: {
  bannerUrl?: string;
  embedUrl: string | null;
  loading: boolean;
  onPlay: () => void;
  playLabel: string;
}) {
  const [posterReady, setPosterReady] = useState(!bannerUrl);

  useEffect(() => {
    setPosterReady(!bannerUrl);
  }, [bannerUrl]);

  if (embedUrl) {
    return (
      <div className="studio-academy-player">
        <iframe
          src={embedUrl}
          title={playLabel}
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="studio-academy-player">
      {bannerUrl && !posterReady ? (
        <MediaLoadFrame
          kind="image"
          src={bannerUrl}
          cacheKey={`academy-banner:${bannerUrl}`}
          ratio="fill"
          className="studio-academy-player-cover"
          loaderSize="lg"
        >
          {({ onLoad, onError }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bannerUrl}
              alt=""
              decoding="async"
              onLoad={(event) => {
                onLoad(event);
                setPosterReady(true);
              }}
              onError={() => {
                onError();
                setPosterReady(true);
              }}
            />
          )}
        </MediaLoadFrame>
      ) : (
        <>
          {/* Placeholder until Bunny Stream intros/lessons are live. */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            className="studio-academy-player-video"
            controls
            playsInline
            preload="metadata"
            poster={bannerUrl}
            src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
            title={playLabel}
            onPlay={() => {
              if (!loading) onPlay();
            }}
          />
        </>
      )}
    </div>
  );
}

export function StudioAcademyPane({
  onOpenCredits,
  onPaywiseHandoff,
  onPaymentCelebration,
  creditPriceCents,
  creditBalance,
}: {
  onOpenCredits?: (opts?: { amountCents?: number }) => void;
  onPaywiseHandoff?: (handoff: {
    phase: "preparing" | "redirect";
    amountCents: number;
    checkoutUrl?: string;
  } | null) => void;
  onPaymentCelebration?: (celebration: {
    phase: "confirming" | "success";
    kind?: "academy";
    academyUnlocked?: boolean;
    amountCents?: number | null;
    creditsGranted?: number | null;
  } | null) => void;
  creditPriceCents?: number;
  creditBalance?: number;
}) {
  const price = creditPriceCents ?? DEFAULT_CREDIT_PRICE_CENTS;
  const academy = useStudioAcademy();
  const now = useNowTick();
  const { isMobile } = useMobileLayout();
  const catalog = useQuery(api.academy.listPublishedCourses, {});
  const mine = useQuery(api.academy.listMyCourses, {});
  const purchase = useMutation(api.academy.purchaseCourse);
  const startPaywiseCheckout = useAction(api.paywiseActions.startCheckout);
  const getIntroPlayback = useAction(api.academyActions.getIntroPlayback);
  const getLessonPlayback = useAction(api.academyActions.getLessonPlayback);

  const [busy, setBusy] = useState(false);
  const [purchaseConfirmOpen, setPurchaseConfirmOpen] = useState(false);
  const [introEmbed, setIntroEmbed] = useState<string | null>(null);
  const [lessonEmbed, setLessonEmbed] = useState<string | null>(null);
  const [loadingPlay, setLoadingPlay] = useState(false);
  const [checkoutSheetOpen, setCheckoutSheetOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const clientRequestIdRef = useRef<string | null>(null);
  const headTabsScrollRef = useRef<HTMLElement | null>(null);
  useHorizontalWheelScroll(headTabsScrollRef);
  useHorizontalScrollFade(headTabsScrollRef);

  const detail = useQuery(
    api.academy.getCourse,
    academy.courseId ? { courseId: academy.courseId } : "skip",
  );

  useEffect(() => {
    setIntroEmbed(null);
    setLessonEmbed(null);
    setCheckoutSheetOpen(false);
    setPurchaseConfirmOpen(false);
    setCommentsOpen(false);
    clientRequestIdRef.current = null;
  }, [academy.courseId]);

  // Coming soon / draft courses return null — bounce to catalog.
  useEffect(() => {
    if (!academy.courseId || detail === undefined) return;
    if (detail === null) academy.backToCatalog();
  }, [academy.courseId, detail, academy]);

  useEffect(() => {
    setLessonEmbed(null);
    if (academy.lessonId) {
      setIntroEmbed(null);
    }
  }, [academy.lessonId]);

  const listSource =
    academy.listTab === "mine"
      ? ((mine as typeof catalog) ?? [])
      : ((catalog as typeof catalog) ?? []);
  const list = academy.filterCourses(listSource ?? []);
  const listLoading =
    academy.listTab === "mine" ? mine === undefined : catalog === undefined;
  const detailOpen = Boolean(academy.courseId);
  const owned = Boolean(detail?.owned);
  const selectedLesson = academy.lessonId
    ? (detail?.lessons.find((l) => l._id === academy.lessonId) ?? null)
    : null;
  const commentsLessonId =
    owned && academy.lessonId ? academy.lessonId : undefined;
  const commentsSidebarTitle =
    commentsLessonId && selectedLesson
      ? selectedLesson.title
      : (detail?.title ?? "Comments");
  const commentsSidebarAvatar =
    commentsLessonId && selectedLesson
      ? selectedLesson.coverUrl || courseBannerUrl(detail!)
      : detail
        ? courseBannerUrl(detail)
        : undefined;
  const priceLabel = detail
    ? formatTtdFromCredits(detail.priceCredits, price)
    : "";
  const priceShort = detail
    ? formatTtdShort(creditsToCents(detail.priceCredits, price))
    : "";
  const detailDiscountCredits =
    detail && detail.onSale
      ? saleDiscountCredits(detail.priceCredits, detail.compareAtCredits)
      : null;
  const listPriceLabel =
    detailDiscountCredits != null && detail?.compareAtCredits != null
      ? formatTtdShort(creditsToCents(detail.compareAtCredits, price))
      : null;
  const discountLabel =
    detailDiscountCredits != null
      ? formatTtdShort(creditsToCents(detailDiscountCredits, price))
      : null;

  const balance = Number(creditBalance ?? 0);
  const priceCredits = detail?.priceCredits ?? 0;
  const needsTopUp =
    Boolean(detail) &&
    !owned &&
    Number.isFinite(balance) &&
    priceCredits > 0 &&
    balance < priceCredits;
  const shortfallCredits = needsTopUp
    ? Math.max(0, priceCredits - balance)
    : 0;
  const topUpAmountCents = needsTopUp
    ? Math.max(
        topUpMinAmountCents(price),
        creditsToCents(shortfallCredits, price),
      )
    : 0;
  const topUpCredits = creditsFromAmountCents(topUpAmountCents, price);
  const topUpLabel = formatTtdCents(topUpAmountCents);
  const balanceLabel = formatTtdFromCredits(balance, price);
  const feeCents = paywiseCardFeeCents(topUpAmountCents);
  const totalDueCents = paywiseCheckoutTotalCents(topUpAmountCents);

  useEffect(() => {
    if (commentsLessonId && selectedLesson) {
      setCommentCount(selectedLesson.commentCount ?? 0);
      return;
    }
    if (detail?.commentCount != null) {
      setCommentCount(detail.commentCount);
    }
  }, [
    detail?.commentCount,
    academy.courseId,
    commentsLessonId,
    selectedLesson?.commentCount,
    selectedLesson?._id,
  ]);

  async function buy() {
    if (!academy.courseId || !detail || needsTopUp) return;
    setBusy(true);
    try {
      await purchase({ courseId: academy.courseId });
      setPurchaseConfirmOpen(false);
      setCheckoutSheetOpen(false);
      onPaymentCelebration?.({
        phase: "success",
        kind: "academy",
        academyUnlocked: true,
        amountCents: creditsToCents(detail.priceCredits, price),
        creditsGranted: detail.priceCredits,
      });
    } catch (error) {
      toast.error(friendlyConvexError(error, "Purchase failed"));
    } finally {
      setBusy(false);
    }
  }

  function handleBuyClick() {
    if (!academy.courseId || owned || busy || !detail || needsTopUp) return;
    setPurchaseConfirmOpen(true);
  }

  async function handlePaywiseCheckout() {
    if (!academy.courseId || !detail || !needsTopUp || busy) return;
    if (!clientRequestIdRef.current) {
      clientRequestIdRef.current = newClientRequestId();
    }
    setBusy(true);
    onPaywiseHandoff?.({
      phase: "preparing",
      amountCents: topUpAmountCents,
    });
    try {
      const result = await startPaywiseCheckout({
        clientRequestId: clientRequestIdRef.current,
        amountCents: topUpAmountCents,
        creditsRequested: topUpCredits,
        reference: `Academy: ${detail.title.slice(0, 60)}`,
        academyCourseId: academy.courseId,
      });
      onPaywiseHandoff?.({
        phase: "redirect",
        amountCents: topUpAmountCents,
        checkoutUrl: result.checkoutUrl,
      });
    } catch (error) {
      onPaywiseHandoff?.(null);
      const message = friendlyConvexError(error, "PayWise checkout failed");
      toast.error(message);
      if (/phone|email|first and last name|account details/i.test(message)) {
        onOpenCredits?.();
      }
      clientRequestIdRef.current = null;
      setBusy(false);
    }
  }

  const checkoutDockProps = {
    onBuyClick: handleBuyClick,
    onPaywiseClick: () => void handlePaywiseCheckout(),
    busy,
    owned,
    priceLabel,
    priceShort,
    listPriceLabel,
    discountLabel,
    saleEndsAt: detail?.onSale ? detail.saleEndsAt : null,
    now,
    needsTopUp,
    balanceLabel,
    topUpLabel,
    feeCents,
    totalDueCents,
  };

  async function playIntro() {
    if (!academy.courseId) return;
    setLoadingPlay(true);
    try {
      const playback = await getIntroPlayback({ courseId: academy.courseId });
      setIntroEmbed(playback.embedUrl);
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not load intro"));
    } finally {
      setLoadingPlay(false);
    }
  }

  async function playLesson() {
    if (!selectedLesson) return;
    setLoadingPlay(true);
    try {
      const playback = await getLessonPlayback({ lessonId: selectedLesson._id });
      setLessonEmbed(playback.embedUrl);
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not load lesson"));
    } finally {
      setLoadingPlay(false);
    }
  }

  const catalogMain = (
    <div className="public-offers-main studio-cn-catalog">
      <div className="public-offers-main-scroll">
        <main className="public-offers-body">
          <section className="public-offers-hero">
            <div
              className="public-offers-hero-bg studio-academy-hero-bg"
              aria-hidden="true"
            />
            <GraduationCap
              className="public-offers-hero-icon"
              aria-hidden="true"
              strokeWidth={1.25}
            />
            <div className="public-offers-hero-copy">
              <h1>{academy.listTab === "mine" ? "My courses" : "Academy"}</h1>
              <p>
                {academy.listTab === "mine"
                  ? "Your courses. Open them anytime from here."
                  : "Learn the skills you need to make professional videos like a director, with AI in Studio."}
              </p>
            </div>
          </section>

          <div className="public-offers-results">
            {listLoading ? (
              <div className="public-offers-state">
                <MediaLoadWave size="lg" />
                <strong>Loading courses…</strong>
              </div>
            ) : !list.length ? (
              <div className="public-offers-state">
                <GraduationCap aria-hidden="true" />
                <strong>
                  {academy.listTab === "mine"
                    ? "No courses yet"
                    : "No courses match"}
                </strong>
                <p>
                  {academy.listTab === "mine"
                    ? "Browse Academy when you’re ready to pick one up."
                    : "Try clearing filters or check back soon."}
                </p>
              </div>
            ) : (
              <ul className="public-offers-grid studio-academy-grid">
                {list.map((course) => {
                  const banner = courseBannerUrl(course);
                  const comingSoon = Boolean(course.comingSoon);
                  const compareAt = course.compareAtCredits;
                  const percentOff =
                    !comingSoon && course.onSale
                      ? salePercentOff(course.priceCredits, compareAt)
                      : null;
                  return (
                    <li key={course._id}>
                      <button
                        type="button"
                        className={
                          comingSoon
                            ? "public-offers-card studio-academy-card studio-academy-card--soon"
                            : "public-offers-card studio-academy-card"
                        }
                        disabled={comingSoon}
                        aria-disabled={comingSoon}
                        onClick={() => {
                          if (comingSoon) return;
                          academy.openCourse(course._id);
                        }}
                      >
                        <div className="public-offers-card-media studio-academy-card-media">
                          {banner ? (
                            <MediaLoadFrame
                              kind="image"
                              src={banner}
                              cacheKey={`academy-card:${course._id}`}
                              ratio="fill"
                              className="studio-academy-card-frame"
                              loaderSize="md"
                              loaderRing
                            >
                              {({ onLoad, onError }) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={banner}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  onLoad={onLoad}
                                  onError={onError}
                                />
                              )}
                            </MediaLoadFrame>
                          ) : (
                            <div className="studio-academy-card-fallback">
                              <GraduationCap aria-hidden="true" />
                            </div>
                          )}
                          {course.owned ? (
                            <span className="studio-academy-card-owned">Owned</span>
                          ) : null}
                          {comingSoon ? (
                            <span className="studio-academy-card-soon">
                              <Lock aria-hidden="true" />
                              Coming soon
                            </span>
                          ) : percentOff != null ? (
                            <span className="studio-academy-card-sale">
                              <Tag aria-hidden="true" />
                              {percentOff}% off
                            </span>
                          ) : null}
                        </div>
                        <div className="public-offers-card-body studio-academy-card-body">
                          <strong className="public-offers-card-title">
                            {course.title}
                          </strong>
                          <p className="public-offers-card-desc">
                            {course.blurb}
                          </p>
                          <div className="studio-academy-card-foot">
                            <span className="public-offers-card-price">
                              {compareAt != null &&
                              compareAt > course.priceCredits ? (
                                <>
                                  <s className="studio-academy-card-compare">
                                    {formatTtdShort(
                                      creditsToCents(compareAt, price),
                                    )}
                                  </s>
                                  <span className="studio-academy-card-now">
                                    {formatTtdFromCredits(
                                      course.priceCredits,
                                      price,
                                    )}
                                  </span>
                                </>
                              ) : (
                                formatTtdFromCredits(course.priceCredits, price)
                              )}
                            </span>
                            <span className="studio-academy-card-meta-tag">
                              {comingSoon ? (
                                <>
                                  <Lock aria-hidden="true" />
                                  Coming soon
                                </>
                              ) : (
                                `${course.lessonCount} lesson${
                                  course.lessonCount === 1 ? "" : "s"
                                }`
                              )}
                            </span>
                          </div>
                          {course.onSale && course.saleEndsAt ? (
                            <SaleCountdownPanel
                              saleEndsAt={course.saleEndsAt}
                              now={now}
                              compact
                            />
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </main>
      </div>
    </div>
  );

  const courseMain = !detail ? (
    <div className="public-offers-main studio-cn-catalog">
      <div className="public-offers-main-scroll">
        <main className="public-offers-body">
          <div className="public-offers-state">
            <MediaLoadWave size="lg" />
            <strong>Loading course…</strong>
          </div>
        </main>
      </div>
    </div>
  ) : selectedLesson ? (
    <div className="public-offers-main studio-cn-catalog">
      <div className="public-offers-main-scroll">
        <main className="public-offers-body">
          <div className="studio-academy-detail">
            <BannerStage
              bannerUrl={
                selectedLesson.coverUrl ||
                courseBannerUrl({
                  slug: detail.slug,
                  coverUrl: detail.coverUrl,
                })
              }
              embedUrl={owned ? lessonEmbed : null}
              loading={loadingPlay}
              onPlay={() => {
                if (!owned) {
                  toast.message("Buy the course to watch this lesson");
                  return;
                }
                void playLesson();
              }}
              playLabel={`Play ${selectedLesson.title}`}
            />
            <div className="studio-academy-detail-top">
              <div>
                <h1 className="studio-academy-detail-title">
                  {selectedLesson.title}
                </h1>
                <p className="studio-academy-detail-sub">
                  {owned
                    ? `${detail.title} · Lesson`
                    : `${detail.title} · Buy to unlock`}
                </p>
              </div>
            </div>
            <div className={`studio-academy-body${!owned ? " is-locked" : ""}`}>
              <div className="studio-academy-body-clip">
                <StudioChatMarkdown
                  className="studio-academy-md"
                  text={academyBodyMarkdown(
                    selectedLesson.descriptionMarkdown,
                    selectedLesson.title,
                  )}
                />
              </div>
              {!owned ? (
                <div className="studio-academy-lock-overlay" aria-hidden="true">
                  <span className="studio-academy-lock-badge">
                    <Lock aria-hidden="true" />
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </main>
      </div>
    </div>
  ) : (
    <div className="public-offers-main studio-cn-catalog">
      <div className="public-offers-main-scroll">
        <main className="public-offers-body">
          <div className="studio-academy-detail">
            <BannerStage
              bannerUrl={courseBannerUrl({
                slug: detail.slug,
                coverUrl: detail.coverUrl,
              })}
              embedUrl={introEmbed}
              loading={loadingPlay}
              onPlay={() => void playIntro()}
              playLabel="Play course intro"
            />
            <div className="studio-academy-detail-top">
              <div>
                <h1 className="studio-academy-detail-title">{detail.title}</h1>
                <p className="studio-academy-detail-sub">
                  {owned
                    ? "Intro"
                    : detail.hasIntroVideo
                      ? "Free intro · buy for full lessons"
                      : "Course overview"}
                </p>
              </div>
            </div>
            <div className={`studio-academy-body${!owned ? " is-locked" : ""}`}>
              <div className="studio-academy-body-clip">
                <StudioChatMarkdown
                  className="studio-academy-md"
                  text={academyBodyMarkdown(
                    detail.descriptionMarkdown,
                    detail.title,
                  )}
                />
              </div>
              {!owned ? (
                <div className="studio-academy-lock-overlay" aria-hidden="true">
                  <span className="studio-academy-lock-badge">
                    <Lock aria-hidden="true" />
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </main>
      </div>
    </div>
  );

  const commentsDock =
    detailOpen && detail ? (
      <div className="studio-academy-right-dock">
        {!owned && !isMobile ? (
          <div className="studio-academy-checkout-strip">
            <CheckoutDock
              showHead={false}
              {...checkoutDockProps}
            />
          </div>
        ) : null}
        <div className="studio-academy-comments-host">
          <ProfileCommentsPanel
            key={
              commentsLessonId
                ? `lesson-${commentsLessonId}`
                : `course-${detail._id}`
            }
            courseId={detail._id}
            lessonId={commentsLessonId}
            chrome="sidebar"
            open={isMobile ? commentsOpen : true}
            onClose={() => setCommentsOpen(false)}
            commentCount={commentCount}
            onCommentCountChange={setCommentCount}
            sidebarTitle={commentsSidebarTitle}
            sidebarAvatarUrl={commentsSidebarAvatar}
            locked={!owned}
          />
        </div>
      </div>
    ) : null;

  let body = catalogMain;
  if (detailOpen) {
    body = courseMain;
  }

  const head = (
    <header className="studio-cn-head">
      <nav
        ref={headTabsScrollRef}
        className="studio-cn-head-tabs"
        aria-label="Academy"
      >
        <button
          type="button"
          className={`studio-cn-head-tab${academy.listTab === "catalog" && !detailOpen ? " is-active" : ""}`}
          onClick={() => {
            if (detailOpen) {
              academy.backToCatalog();
              return;
            }
            academy.setListTab("catalog");
          }}
        >
          {detailOpen ? (
            <ArrowLeft aria-hidden="true" />
          ) : (
            <GraduationCap aria-hidden="true" />
          )}
          {detailOpen ? "Back to Academy" : "Courses"}
        </button>
        <button
          type="button"
          className={`studio-cn-head-tab${academy.listTab === "mine" && !detailOpen ? " is-active" : ""}`}
          onClick={() => {
            academy.setListTab("mine");
            academy.backToCatalog();
          }}
        >
          <Library aria-hidden="true" />
          My courses
        </button>
      </nav>
    </header>
  );

  const mobileExtras =
    isMobile && detailOpen && detail ? (
      <>
        {commentsDock}
        <nav
          className="public-offers-mobile-book-nav studio-cn-book-bar"
          aria-label={owned ? "Course actions" : "Buy this course"}
        >
          {!owned ? (
            <span className="studio-cn-book-bar-price">
              {listPriceLabel ? (
                <s className="studio-academy-card-compare studio-cn-book-bar-compare">
                  {listPriceLabel}
                </s>
              ) : null}
              <span className="studio-academy-card-now">{priceShort || priceLabel}</span>
            </span>
          ) : (
            <span className="studio-cn-book-bar-price">Discussion</span>
          )}
          <div className="studio-cn-book-bar-actions">
            <button
              type="button"
              className="studio-cn-book-bar-msg is-with-count"
              aria-label={
                commentCount
                  ? `Comments, ${commentCount}`
                  : "Open comments"
              }
              onClick={() => setCommentsOpen(true)}
            >
              <MessageCircle aria-hidden="true" strokeWidth={2} />
              <span>{commentCount}</span>
            </button>
            {!owned ? (
              <button
                type="button"
                className="public-offers-btn is-primary studio-cn-book-bar-cta"
                onClick={() => setCheckoutSheetOpen(true)}
              >
                <Zap aria-hidden="true" />
                {needsTopUp ? "Pay with PayWise" : "Pay with wallet"}
              </button>
            ) : null}
          </div>
        </nav>
        {!owned ? (
          <StudioCnBookSheet
            open={checkoutSheetOpen}
            onClose={() => setCheckoutSheetOpen(false)}
            ariaLabel="Course checkout"
            className="is-academy-checkout"
            backLayerId="academy-checkout-sheet"
            fitContent
          >
            <CheckoutDock showHead={false} {...checkoutDockProps} />
          </StudioCnBookSheet>
        ) : null}
      </>
    ) : null;

  const purchaseConfirmPortal =
    typeof document !== "undefined"
      ? createPortal(
          <StudioConfirmOverlay
            open={purchaseConfirmOpen}
            title="Confirm purchase"
            body={
              detail
                ? `Pay ${priceLabel} from your Studio wallet balance to unlock ${detail.title} for life.`
                : `Pay ${priceLabel} from your Studio wallet balance.`
            }
            icon={GraduationCap}
            confirmLabel={`Pay ${priceLabel}`}
            cancelLabel="Cancel"
            busy={busy}
            onCancel={() => {
              if (!busy) setPurchaseConfirmOpen(false);
            }}
            onConfirm={() => void buy()}
          />,
          document.body,
        )
      : null;

  if (detailOpen && !isMobile) {
    return (
      <>
        <div className="studio-cn-pane studio-academy-pane is-with-right-rail">
          <PanelGroup
            direction="horizontal"
            autoSaveId="studio-academy-comments-pane-h"
            className="studio-cn-pane-split studio-cn-offer-panels h-full min-h-0 min-w-0 overflow-hidden"
          >
            <Panel
              id="studio-academy-main-col"
              order={1}
              defaultSize={72}
              minSize={52}
              className="min-h-0 min-w-0"
            >
              <div className="studio-cn-main-col">
                {head}
                <div className="studio-cn-body is-catalog">{courseMain}</div>
              </div>
            </Panel>
            <PanelResizeHandle className="cursor-resize" />
            <Panel
              id="studio-academy-comments-rail"
              order={2}
              defaultSize={28}
              minSize={20}
              maxSize={36}
              className="studio-cn-book-panel studio-academy-comments-panel studio-cn-right-rail min-h-0 min-w-0 h-full overflow-hidden"
            >
              {commentsDock}
            </Panel>
          </PanelGroup>
        </div>
        {purchaseConfirmPortal}
      </>
    );
  }

  return (
    <>
      <div className="studio-cn-pane studio-academy-pane">
        {head}
        <div className="studio-cn-body is-catalog">
          {body}
          {mobileExtras}
        </div>
      </div>
      {purchaseConfirmPortal}
    </>
  );
}
