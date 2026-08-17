"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Clock,
  GraduationCap,
  Library,
  ListVideo,
  Loader2,
  Lock,
  MessageCircle,
  Tag,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
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
  paywiseCheckoutTotalCents,
  topUpMinAmountCents,
} from "@/studio/lib/money";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { attachBunnyStreamPlayer } from "@/studio/lib/bunnyPlayerJs";
import { StudioChatMarkdown } from "./StudioChatMarkdown";
import { useStudioAcademy } from "./StudioAcademyContext";
import { AcademyLessonRail } from "./StudioAcademySidebar";
import { ProfileCommentsPanel } from "./ProfileCommentsPanel";
import { MediaLoadFrame, MediaLoadWave } from "./media-load-frame";
import { StudioConfirmOverlay } from "./StudioConfirmOverlay";
import { StudioCnBookSheet } from "./StudioCnBookSheet";
import { WamPayLabel, WamPayMark } from "./WamPayMark";
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

/** Prefer Bunny Optimizer URL; static /academy/*.webp is fallback only. */
function courseBannerUrl(course: {
  slug: string;
  coverUrl?: string;
}): string | undefined {
  return course.coverUrl || localCoverUrl(course.slug);
}

const ACADEMY_HERO_BANNER = "/academy/academy-hero.webp";

/** Studio Sophie CS — deposit / balance chase (CSR-only). */
const STUDIO_CS_WA_E164 = "18683377338";

function studioCsDepositWhatsAppUrl(courseTitle?: string) {
  const title = String(courseTitle || "the course").trim() || "the course";
  const text = `Hi Sophie, I have an inquiry about the deposit / paying the balance for ${title}.`;
  return `https://wa.me/${STUDIO_CS_WA_E164}?text=${encodeURIComponent(text)}`;
}

function formatPlanDueLabel(cents: number) {
  return formatTtdCents(Math.max(0, Math.round(Number(cents) || 0)));
}

function usePreloadAcademyHero() {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = ACADEMY_HERO_BANNER;
    document.head.appendChild(link);
    return () => {
      link.remove();
    };
  }, []);
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
  onWamClick,
  onWhatsAppBalanceClick,
  busy,
  owned,
  partiallyPaid,
  amountDueLabel,
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
  onWamClick?: () => void;
  onWhatsAppBalanceClick?: () => void;
  busy: boolean;
  owned: boolean;
  partiallyPaid?: boolean;
  amountDueLabel?: string;
  priceLabel: string;
  priceShort: string;
  listPriceLabel?: string | null;
  discountLabel?: string | null;
  saleEndsAt?: number | null;
  now: number;
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
    !partiallyPaid &&
    onSale &&
    saleEndsAt != null &&
    Number.isFinite(saleEndsAt) ? (
      <SaleCountdownPanel
        saleEndsAt={saleEndsAt}
        now={now}
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
              {partiallyPaid ? (
                <span className="studio-academy-card-now">
                  {amountDueLabel
                    ? `${amountDueLabel} left`
                    : "Partially paid"}
                </span>
              ) : (
                <>
                  {onSale && listPriceLabel ? (
                    <s className="studio-academy-card-compare">{listPriceLabel}</s>
                  ) : null}
                  <span className="studio-academy-card-now">{priceLabel}</span>
                </>
              )}
            </strong>
            {!owned && !partiallyPaid ? (
              <ul
                className="studio-academy-checkout-chips"
                aria-label="Course access"
              >
                <li>Lifetime access</li>
              </ul>
            ) : null}
            {partiallyPaid ? (
              <ul
                className="studio-academy-checkout-chips"
                aria-label="Deposit status"
              >
                <li>Partially paid</li>
                <li>Finish with Sophie on WhatsApp</li>
              </ul>
            ) : null}
          </div>
        </header>

        {owned ? (
          <p className="studio-academy-checkout-note">You own this course.</p>
        ) : partiallyPaid ? (
          <>
            <p className="studio-academy-checkout-note">
              Your deposit is on file. Course unlocks when the balance is paid
              in full. Message Sophie to pay the rest.
            </p>
            <div className="studio-academy-checkout-actions">
              <button
                type="button"
                className="public-offers-btn is-primary"
                onClick={onWhatsAppBalanceClick}
              >
                <MessageCircle aria-hidden="true" />
                Pay balance on WhatsApp
              </button>
            </div>
          </>
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
                  <dt>Wam fee</dt>
                  <dd>{feeLabel}</dd>
                </div>
              ) : null}
              <div className="studio-academy-checkout-row is-total">
                <dt>Pay now</dt>
                <dd>{totalDueLabel}</dd>
              </div>
            </dl>
            <div className="studio-academy-checkout-wam">
              <button
                type="button"
                className={`studio-settings-topup-pay${busy ? " is-loading" : ""}`}
                disabled={busy}
                onClick={onWamClick}
                aria-busy={busy}
                aria-label={
                  busy
                    ? "Opening Wam"
                    : `Pay ${paywiseTotalShort} with Wam to unlock course`
                }
              >
                {busy ? (
                  <Loader2
                    className="studio-settings-topup-pay-spin"
                    aria-hidden="true"
                  />
                ) : null}
                <span className="studio-settings-topup-pay-label">
                  {busy ? "Opening…" : <WamPayLabel amountShort={paywiseTotalShort} />}
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
            <div className="studio-academy-checkout-wam">
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

const LESSON_SWIPE_MIN_PX = 56;
const LESSON_SWIPE_IGNORE =
  "a[href], input, textarea, select, [role='dialog'], .studio-cn-head, .studio-cn-book-bar, .studio-cn-book-sheet";

function useAcademyLessonSwipe(
  enabled: boolean,
  onSwipe: (dir: "next" | "prev") => void,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{
    x: number;
    y: number;
    axis: "h" | "v" | null;
  } | null>(null);
  const onSwipeRef = useRef(onSwipe);
  const enabledRef = useRef(enabled);
  onSwipeRef.current = onSwipe;
  enabledRef.current = enabled;

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !enabled) return;

    const ignoreTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return true;
      return Boolean(target.closest(LESSON_SWIPE_IGNORE));
    };

    const begin = (x: number, y: number, target: EventTarget | null) => {
      if (!enabledRef.current || ignoreTarget(target)) {
        startRef.current = null;
        return;
      }
      startRef.current = { x, y, axis: null };
    };

    const move = (x: number, y: number, event: Event) => {
      const start = startRef.current;
      if (!start) return;
      const dx = x - start.x;
      const dy = y - start.y;
      if (!start.axis) {
        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
        start.axis = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
        if (start.axis === "v") {
          startRef.current = null;
          return;
        }
      }
      if (start.axis === "h" && event.cancelable) event.preventDefault();
    };

    const end = (x: number) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start || start.axis !== "h") return;
      const dx = x - start.x;
      if (Math.abs(dx) < LESSON_SWIPE_MIN_PX) return;
      onSwipeRef.current(dx < 0 ? "next" : "prev");
      const blockClick = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
      };
      el.addEventListener("click", blockClick, { capture: true, once: true });
      window.setTimeout(
        () => el.removeEventListener("click", blockClick, true),
        400,
      );
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        startRef.current = null;
        return;
      }
      const touch = event.touches[0];
      begin(touch.clientX, touch.clientY, event.target);
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      move(touch.clientX, touch.clientY, event);
    };
    const onTouchEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (!touch) {
        startRef.current = null;
        return;
      }
      end(touch.clientX);
    };
    const onTouchCancel = () => {
      startRef.current = null;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      begin(event.clientX, event.clientY, event.target);
      if (startRef.current && event.target instanceof Element) {
        event.target.setPointerCapture?.(event.pointerId);
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      move(event.clientX, event.clientY, event);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      end(event.clientX);
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      startRef.current = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchCancel, { passive: true });
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [enabled]);

  return hostRef;
}

function BannerStage({
  bannerUrl,
  embedUrl,
  loading,
  onPlay,
  playLabel,
  locked,
  onTimeUpdate,
  onSeekReady,
}: {
  bannerUrl?: string;
  embedUrl: string | null;
  loading: boolean;
  onPlay: () => void;
  playLabel: string;
  /** When true, show cover only (no Studio play chrome — buy to unlock). */
  locked?: boolean;
  onTimeUpdate?: (seconds: number) => void;
  onSeekReady?: (seekTo: ((seconds: number) => void) | null) => void;
}) {
  const [posterReady, setPosterReady] = useState(!bannerUrl);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const togglePlayRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setPosterReady(!bannerUrl);
  }, [bannerUrl]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!embedUrl || !iframe || !onTimeUpdate) {
      togglePlayRef.current = null;
      onSeekReady?.(null);
      return;
    }
    const { dispose, seekTo, togglePlay } = attachBunnyStreamPlayer(
      iframe,
      onTimeUpdate,
    );
    togglePlayRef.current = togglePlay;
    onSeekReady?.(seekTo);
    return () => {
      togglePlayRef.current = null;
      dispose();
      onSeekReady?.(null);
    };
  }, [embedUrl, onSeekReady, onTimeUpdate]);

  return (
    <div className="studio-academy-player-shell">
      <div className="studio-academy-player">
        {embedUrl ? (
          <>
            <iframe
              ref={iframeRef}
              src={embedUrl}
              title={playLabel}
              allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
            <div
              className="studio-academy-player-swipe"
              aria-hidden="true"
              onClick={() => togglePlayRef.current?.()}
            />
          </>
        ) : (
          <>
            {bannerUrl ? (
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
              <div className="studio-academy-player-empty" aria-hidden="true" />
            )}
            {!locked && (posterReady || !bannerUrl) ? (
              <button
                type="button"
                className="studio-academy-player-hit"
                aria-label={playLabel}
                disabled={loading}
                onClick={() => {
                  if (!loading) onPlay();
                }}
              >
                {loading ? (
                  <span className="studio-academy-player-loading">
                    <Loader2 aria-hidden="true" className="animate-spin" />
                  </span>
                ) : null}
              </button>
            ) : null}
            {locked ? (
              <div className="studio-academy-player-locked" aria-hidden="true">
                <Lock />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export function StudioAcademyPane({
  onOpenCredits,
  onWamHandoff,
  onPaymentCelebration,
  creditPriceCents,
  creditBalance,
}: {
  onOpenCredits?: (opts?: { amountCents?: number }) => void;
  onWamHandoff?: (handoff: {
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
  usePreloadAcademyHero();
  const now = useNowTick();
  const { isMobile } = useMobileLayout();
  const catalog = useQuery(api.academy.listPublishedCourses, {});
  const mine = useQuery(api.academy.listMyCourses, {});
  const purchase = useMutation(api.academy.purchaseCourse);
  const startWamCheckout = useAction(api.wamActions.startCheckout);
  const getIntroPlayback = useAction(api.academyActions.getIntroPlayback);
  const getLessonPlayback = useAction(api.academyActions.getLessonPlayback);

  const [busy, setBusy] = useState(false);
  const [purchaseConfirmOpen, setPurchaseConfirmOpen] = useState(false);
  const [introEmbed, setIntroEmbed] = useState<string | null>(null);
  const [lessonEmbed, setLessonEmbed] = useState<string | null>(null);
  const [loadingPlay, setLoadingPlay] = useState(false);
  const [checkoutSheetOpen, setCheckoutSheetOpen] = useState(false);
  const [lessonsSheetOpen, setLessonsSheetOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const clientRequestIdRef = useRef<string | null>(null);
  const videoTimeSecRef = useRef(0);
  const videoTimeHeardRef = useRef(false);
  const seekVideoRef = useRef<((seconds: number) => void) | null>(null);
  const headTabsScrollRef = useRef<HTMLElement | null>(null);
  useHorizontalWheelScroll(headTabsScrollRef);
  useHorizontalScrollFade(headTabsScrollRef);

  const handleVideoTimeUpdate = (seconds: number) => {
    videoTimeHeardRef.current = true;
    videoTimeSecRef.current = seconds;
  };
  const handleSeekReady = (seekTo: ((seconds: number) => void) | null) => {
    seekVideoRef.current = seekTo;
  };
  const getVideoTimeSec = (): number | undefined =>
    videoTimeHeardRef.current ? videoTimeSecRef.current : undefined;
  const seekVideoTo = (seconds: number) => {
    seekVideoRef.current?.(seconds);
  };

  const detail = useQuery(
    api.academy.getCourse,
    academy.courseId ? { courseId: academy.courseId } : "skip",
  );

  useEffect(() => {
    setIntroEmbed(null);
    setLessonEmbed(null);
    setCheckoutSheetOpen(false);
    setLessonsSheetOpen(false);
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
    videoTimeSecRef.current = 0;
    videoTimeHeardRef.current = false;
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
  const paymentPlan = detail?.paymentPlan ?? null;
  const partiallyPaid = Boolean(!owned && paymentPlan?.status === "active");
  const amountDueLabel = partiallyPaid
    ? formatPlanDueLabel(paymentPlan!.amountDueCents)
    : undefined;
  const openDepositWhatsApp = () => {
    const url = studioCsDepositWhatsAppUrl(detail?.title);
    window.open(url, "_blank", "noopener,noreferrer");
  };
  const selectedLesson = academy.lessonId
    ? (detail?.lessons.find((l) => l._id === academy.lessonId) ?? null)
    : null;

  const lessonSwipeIds = useMemo(() => {
    const list = [...(detail?.lessons ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    return [null, ...list.map((lesson) => lesson._id)] as Array<
      Id<"academyLessons"> | null
    >;
  }, [detail?.lessons]);

  const swipeLesson = useCallback(
    (dir: "next" | "prev") => {
      const current = academy.lessonId ?? null;
      const index = lessonSwipeIds.findIndex((id) => id === current);
      if (index < 0) return;
      const next = lessonSwipeIds[index + (dir === "next" ? 1 : -1)];
      if (next === undefined) return;
      academy.setLessonId(next);
    },
    [academy, lessonSwipeIds],
  );

  const lessonSwipeEnabled =
    isMobile &&
    Boolean(detailOpen && detail) &&
    !lessonsSheetOpen &&
    !commentsOpen &&
    !checkoutSheetOpen;

  const lessonSwipe = useAcademyLessonSwipe(lessonSwipeEnabled, swipeLesson);

  // Unlocked playback: mount Bunny Stream embed so the player shows Stream's
  // native thumbnail (not our Storage cover overlay). Locked stays on cover.
  useEffect(() => {
    if (!detail || !academy.courseId) return;
    let cancelled = false;
    const courseId = academy.courseId;
    const lessonId = selectedLesson?._id;
    const lessonHasVideo = Boolean(selectedLesson?.hasVideo);
    const hasIntro = Boolean(detail.hasIntroVideo);

    async function mountBunnyEmbed() {
      if (lessonId) {
        if (!owned || !lessonHasVideo) return;
        setLoadingPlay(true);
        try {
          const playback = await getLessonPlayback({ lessonId });
          if (!cancelled) setLessonEmbed(playback.embedUrl);
        } catch (error) {
          if (!cancelled) {
            toast.error(friendlyConvexError(error, "Could not load lesson"));
          }
        } finally {
          if (!cancelled) setLoadingPlay(false);
        }
        return;
      }

      if (!hasIntro) return;
      setLoadingPlay(true);
      try {
        const playback = await getIntroPlayback({ courseId });
        if (!cancelled) setIntroEmbed(playback.embedUrl);
      } catch (error) {
        if (!cancelled) {
          toast.error(friendlyConvexError(error, "Could not load intro"));
        }
      } finally {
        if (!cancelled) setLoadingPlay(false);
      }
    }

    void mountBunnyEmbed();
    return () => {
      cancelled = true;
    };
  }, [
    academy.courseId,
    detail?._id,
    detail?.hasIntroVideo,
    getIntroPlayback,
    getLessonPlayback,
    owned,
    selectedLesson?._id,
    selectedLesson?.hasVideo,
  ]);

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
    !partiallyPaid &&
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
  const feeCents = 0;
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
    if (!academy.courseId || !detail || needsTopUp || partiallyPaid) return;
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
    if (
      !academy.courseId ||
      owned ||
      partiallyPaid ||
      busy ||
      !detail ||
      needsTopUp
    ) {
      return;
    }
    setPurchaseConfirmOpen(true);
  }

  async function handleWamCheckout() {
    if (
      !academy.courseId ||
      !detail ||
      partiallyPaid ||
      !needsTopUp ||
      busy
    ) {
      return;
    }
    if (!clientRequestIdRef.current) {
      clientRequestIdRef.current = newClientRequestId();
    }
    setBusy(true);
    onWamHandoff?.({
      phase: "preparing",
      amountCents: topUpAmountCents,
    });
    try {
      const result = await startWamCheckout({
        clientRequestId: clientRequestIdRef.current,
        amountCents: topUpAmountCents,
        creditsRequested: topUpCredits,
        reference: `Academy: ${detail.title.slice(0, 60)}`,
        academyCourseId: academy.courseId,
      });
      onWamHandoff?.({
        phase: "redirect",
        amountCents: topUpAmountCents,
        checkoutUrl: result.checkoutUrl,
        paymentId: result.paymentId,
        billing: "academy",
        academyCourse: academy.courseId,
      });
    } catch (error) {
      onWamHandoff?.(null);
      const message = friendlyConvexError(error, "Wam checkout failed");
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
    onWamClick: () => void handleWamCheckout(),
    onWhatsAppBalanceClick: openDepositWhatsApp,
    busy,
    owned,
    partiallyPaid,
    amountDueLabel,
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
      // No autoplay — Bunny Stream thumbnail + native play control.
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
                {list.map((course, index) => {
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
                                  loading={index < 3 ? "eager" : "lazy"}
                                  decoding="async"
                                  fetchPriority={index === 0 ? "high" : undefined}
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
                          ) : course.paymentPlan?.status === "active" ? (
                            <span className="studio-academy-card-owned is-partial">
                              Partially paid
                            </span>
                          ) : null}
                          {comingSoon ? (
                            <span className="studio-academy-card-soon">
                              <Clock aria-hidden="true" />
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
                                  <Clock aria-hidden="true" />
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
    <div
      className={`public-offers-main studio-cn-catalog${
        isMobile ? " is-academy-watch" : ""
      }`}
      ref={lessonSwipe}
    >
      {isMobile ? (
        <div className="studio-academy-watch-player">
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
            locked={!owned}
            onPlay={() => {
              if (!owned) {
                toast.message("Buy the course to watch this lesson");
                return;
              }
              void playLesson();
            }}
            playLabel={`Play ${selectedLesson.title}`}
            onTimeUpdate={handleVideoTimeUpdate}
            onSeekReady={handleSeekReady}
          />
        </div>
      ) : null}
      <div className="public-offers-main-scroll">
        <main className="public-offers-body">
          <div className="studio-academy-detail">
            {!isMobile ? (
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
                locked={!owned}
                onPlay={() => {
                  if (!owned) {
                    toast.message("Buy the course to watch this lesson");
                    return;
                  }
                  void playLesson();
                }}
                playLabel={`Play ${selectedLesson.title}`}
                onTimeUpdate={handleVideoTimeUpdate}
                onSeekReady={handleSeekReady}
              />
            ) : null}
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
    <div
      className={`public-offers-main studio-cn-catalog${
        isMobile ? " is-academy-watch" : ""
      }`}
      ref={lessonSwipe}
    >
      {isMobile ? (
        <div className="studio-academy-watch-player">
          <BannerStage
            bannerUrl={courseBannerUrl({
              slug: detail.slug,
              coverUrl: detail.coverUrl,
            })}
            embedUrl={introEmbed}
            loading={loadingPlay}
            onPlay={() => void playIntro()}
            playLabel="Play course intro"
            onTimeUpdate={handleVideoTimeUpdate}
            onSeekReady={handleSeekReady}
          />
        </div>
      ) : null}
      <div className="public-offers-main-scroll">
        <main className="public-offers-body">
          <div className="studio-academy-detail">
            {!isMobile ? (
              <BannerStage
                bannerUrl={courseBannerUrl({
                  slug: detail.slug,
                  coverUrl: detail.coverUrl,
                })}
                embedUrl={introEmbed}
                loading={loadingPlay}
                onPlay={() => void playIntro()}
                playLabel="Play course intro"
                onTimeUpdate={handleVideoTimeUpdate}
                onSeekReady={handleSeekReady}
              />
            ) : null}
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

  const commentsPanel =
    detailOpen && detail ? (
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
        getVideoTimeSec={commentsLessonId ? getVideoTimeSec : undefined}
        onSeekVideo={commentsLessonId ? seekVideoTo : undefined}
      />
    ) : null;

  // Desktop only — height:100% dock must not sit beside the mobile scroll column
  // or lesson/course descriptions get crushed out of view.
  const commentsDock =
    detailOpen && detail && !isMobile ? (
      <div className="studio-academy-right-dock">
        {!owned ? (
          <div className="studio-academy-checkout-strip">
            <CheckoutDock showHead={false} {...checkoutDockProps} />
          </div>
        ) : null}
        <div className="studio-academy-comments-host">{commentsPanel}</div>
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
          className={`studio-cn-head-tab${
            academy.listTab === "catalog" && !detailOpen
              ? " is-active"
              : detailOpen
                ? " is-chrome-pill"
                : ""
          }`}
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
          {detailOpen ? "Back" : "Courses"}
        </button>
        {detailOpen ? null : (
          <button
            type="button"
            className={`studio-cn-head-tab${academy.listTab === "mine" ? " is-active" : ""}`}
            onClick={() => {
              academy.setListTab("mine");
              academy.backToCatalog();
            }}
          >
            <Library aria-hidden="true" />
            My courses
          </button>
        )}
      </nav>
      {isMobile && detailOpen && academy.courseId ? (
        <div className="studio-cn-head-action">
          <button
            type="button"
            className={`studio-academy-lessons-sheet-btn${lessonsSheetOpen ? " is-active" : ""}`}
            aria-label="Lessons"
            aria-expanded={lessonsSheetOpen}
            aria-pressed={lessonsSheetOpen}
            onClick={() => setLessonsSheetOpen(true)}
          >
            <ListVideo aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </header>
  );

  const mobileExtras =
    isMobile && detailOpen && detail ? (
      <>
        {commentsPanel}
        <StudioCnBookSheet
          open={lessonsSheetOpen}
          onClose={() => setLessonsSheetOpen(false)}
          ariaLabel="Course lessons"
          className="is-academy-lessons"
          backLayerId="academy-lessons-sheet"
        >
          <AcademyLessonRail
            courseId={detail._id}
            onPick={() => setLessonsSheetOpen(false)}
          />
        </StudioCnBookSheet>
        <nav
          className="public-offers-mobile-book-nav studio-cn-book-bar"
          aria-label={
            owned
              ? "Course actions"
              : partiallyPaid
                ? "Pay course balance"
                : "Buy this course"
          }
        >
          {!owned ? (
            <span className="studio-cn-book-bar-price">
              {partiallyPaid ? (
                <span className="studio-academy-card-now">
                  {amountDueLabel
                    ? `${amountDueLabel} left`
                    : "Partially paid"}
                </span>
              ) : (
                <>
                  {listPriceLabel ? (
                    <s className="studio-academy-card-compare studio-cn-book-bar-compare">
                      {listPriceLabel}
                    </s>
                  ) : null}
                  <span className="studio-academy-card-now">
                    {priceShort || priceLabel}
                  </span>
                </>
              )}
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
                onClick={() => {
                  if (partiallyPaid) {
                    openDepositWhatsApp();
                    return;
                  }
                  setCheckoutSheetOpen(true);
                }}
              >
                {partiallyPaid ? (
                  <>
                    <MessageCircle aria-hidden="true" />
                    Pay balance
                  </>
                ) : needsTopUp ? (
                  <>
                    Pay with
                    <WamPayMark />
                  </>
                ) : (
                  <>
                    <Zap aria-hidden="true" />
                    Pay with wallet
                  </>
                )}
              </button>
            ) : null}
          </div>
        </nav>
        {!owned ? (
          <StudioCnBookSheet
            open={checkoutSheetOpen}
            onClose={() => setCheckoutSheetOpen(false)}
            ariaLabel={
              partiallyPaid ? "Course deposit balance" : "Course checkout"
            }
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
