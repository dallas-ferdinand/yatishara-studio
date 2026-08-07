"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  GraduationCap,
  Library,
  Loader2,
  Lock,
  Play,
  ShoppingBag,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useHorizontalScrollFade } from "@/desk/lib/use-horizontal-scroll-fade";
import { useHorizontalWheelScroll } from "@/desk/lib/use-horizontal-wheel-scroll";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  DEFAULT_CREDIT_PRICE_CENTS,
  formatTtdFromCredits,
} from "@/studio/lib/money";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { StudioChatMarkdown } from "./StudioChatMarkdown";
import { useStudioAcademy } from "./StudioAcademyContext";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
import "./studio-creative-network.css";
import "./public-offers.css";

function demoCoverUrl(slug: string): string | undefined {
  if (!slug.startsWith("demo-")) return undefined;
  return `/academy/${slug}.webp`;
}

function courseBannerUrl(course: {
  slug: string;
  coverUrl?: string;
}): string | undefined {
  return course.coverUrl || demoCoverUrl(course.slug);
}

function CheckoutDock({
  showHead,
  onBuy,
  busy,
  owned,
  priceLabel,
  lessonCount,
}: {
  showHead: boolean;
  onBuy: () => void;
  busy: boolean;
  owned: boolean;
  priceLabel: string;
  lessonCount: number;
}) {
  const body = (
    <div className="public-offers-rail-detail">
      <section className="public-offers-panel">
        <h2>Checkout</h2>
        <p className="public-offers-price">{priceLabel}</p>
        <dl className="public-offers-rows">
          <div className="public-offers-row">
            <dt>Access</dt>
            <dd>Lifetime</dd>
          </div>
          <div className="public-offers-row">
            <dt>Lessons</dt>
            <dd>{lessonCount}</dd>
          </div>
        </dl>
        {owned ? (
          <p className="public-offers-note">You own this course.</p>
        ) : (
          <button
            type="button"
            className="public-offers-btn is-primary is-block"
            disabled={busy}
            onClick={onBuy}
          >
            {busy ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <ShoppingBag aria-hidden="true" />
            )}
            Buy course
          </button>
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
    <div className="studio-academy-banner-stage">
      {bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bannerUrl} alt="" className="studio-academy-banner-img" />
      ) : (
        <div className="studio-academy-banner-fallback">
          <GraduationCap aria-hidden="true" />
        </div>
      )}
      <button
        type="button"
        className="studio-academy-banner-play"
        onClick={onPlay}
        disabled={loading}
        aria-label={playLabel}
      >
        {loading ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Play aria-hidden="true" fill="currentColor" />
        )}
      </button>
    </div>
  );
}

export function StudioAcademyPane({
  onOpenCredits,
  creditPriceCents,
}: {
  onOpenCredits?: () => void;
  creditPriceCents?: number;
}) {
  const price = creditPriceCents ?? DEFAULT_CREDIT_PRICE_CENTS;
  const academy = useStudioAcademy();
  const { isMobile } = useMobileLayout();
  const catalog = useQuery(api.academy.listPublishedCourses, {});
  const mine = useQuery(api.academy.listMyCourses, {});
  const purchase = useMutation(api.academy.purchaseCourse);
  const getIntroPlayback = useAction(api.academyActions.getIntroPlayback);
  const getLessonPlayback = useAction(api.academyActions.getLessonPlayback);

  const [busy, setBusy] = useState(false);
  const [introEmbed, setIntroEmbed] = useState<string | null>(null);
  const [lessonEmbed, setLessonEmbed] = useState<string | null>(null);
  const [loadingPlay, setLoadingPlay] = useState(false);
  const [checkoutSheetOpen, setCheckoutSheetOpen] = useState(false);
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
  }, [academy.courseId]);

  useEffect(() => {
    setLessonEmbed(null);
  }, [academy.lessonId]);

  useEffect(() => {
    if (!detail?.owned || !detail.lessons.length) return;
    if (academy.lessonId) return;
    academy.setLessonId(detail.lessons[0]._id);
  }, [detail, academy.lessonId, academy.setLessonId]);

  const listSource =
    academy.listTab === "mine"
      ? ((mine as typeof catalog) ?? [])
      : ((catalog as typeof catalog) ?? []);
  const list = academy.filterCourses(listSource ?? []);
  const listLoading =
    academy.listTab === "mine" ? mine === undefined : catalog === undefined;
  const detailOpen = Boolean(academy.courseId);
  const owned = Boolean(detail?.owned);
  const selectedLesson =
    detail?.lessons.find((l) => l._id === academy.lessonId) ??
    detail?.lessons[0] ??
    null;
  const priceLabel = detail
    ? formatTtdFromCredits(detail.priceCredits, price)
    : "";

  async function buy() {
    if (!academy.courseId) return;
    setBusy(true);
    try {
      await purchase({ courseId: academy.courseId });
      toast.success("Course unlocked");
      setCheckoutSheetOpen(false);
    } catch (error) {
      const message = friendlyConvexError(error, "Purchase failed");
      toast.error(message);
      if (/not enough balance|top up/i.test(message)) {
        onOpenCredits?.();
      }
    } finally {
      setBusy(false);
    }
  }

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
                <Loader2 className="animate-spin" aria-hidden="true" />
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
              <ul className="public-offers-grid">
                {list.map((course) => {
                  const banner = courseBannerUrl(course);
                  return (
                    <li key={course._id}>
                      <button
                        type="button"
                        className="public-offers-card"
                        onClick={() => academy.openCourse(course._id)}
                      >
                        {banner ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            className="public-offers-card-media"
                            src={banner}
                            alt=""
                          />
                        ) : (
                          <div className="public-offers-card-media studio-academy-card-fallback">
                            <GraduationCap aria-hidden="true" />
                          </div>
                        )}
                        <div className="public-offers-card-body">
                          <div className="public-offers-card-top">
                            <strong className="public-offers-card-title">
                              {course.title}
                            </strong>
                            <span className="public-offers-card-price">
                              {formatTtdFromCredits(course.priceCredits, price)}
                            </span>
                          </div>
                          <p className="public-offers-card-desc">
                            {course.blurb}
                          </p>
                          <div className="public-offers-card-meta">
                            <span>
                              {course.owned ? "Owned" : "Yatishara Academy"}
                            </span>
                            <span>
                              {course.lessonCount} lesson
                              {course.lessonCount === 1 ? "" : "s"}
                            </span>
                          </div>
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
            <Loader2 className="animate-spin" aria-hidden="true" />
            <strong>Loading course…</strong>
          </div>
        </main>
      </div>
    </div>
  ) : owned && selectedLesson ? (
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
              embedUrl={lessonEmbed}
              loading={loadingPlay}
              onPlay={() => void playLesson()}
              playLabel={`Play ${selectedLesson.title}`}
            />
            <div className="studio-academy-detail-top">
              <div>
                <h1 className="studio-academy-detail-title">
                  {selectedLesson.title}
                </h1>
                <p className="studio-academy-detail-sub">
                  {detail.title} · Lesson
                </p>
              </div>
            </div>
            <div className="studio-academy-body">
              <StudioChatMarkdown text={selectedLesson.descriptionMarkdown} />
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
                  {detail.hasIntroVideo
                    ? "Free intro · buy for full lessons"
                    : "Course overview"}
                </p>
              </div>
              <span className="public-offers-card-price">{priceLabel}</span>
            </div>
            <div className="studio-academy-body">
              <StudioChatMarkdown text={detail.descriptionMarkdown} />
            </div>
            {detail.lessons.length ? (
              <section className="studio-academy-lesson-teasers">
                <h2>Lessons</h2>
                <ul>
                  {detail.lessons.map((lesson, index) => (
                    <li key={lesson._id}>
                      <Lock aria-hidden="true" />
                      <span>
                        <strong>
                          {index + 1}. {lesson.title}
                        </strong>
                        <small>{lesson.blurb}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );

  const checkoutSidebar = detail ? (
    <CheckoutDock
      showHead
      onBuy={() => void buy()}
      busy={busy}
      owned={owned}
      priceLabel={priceLabel}
      lessonCount={detail.lessonCount}
    />
  ) : null;

  let body = catalogMain;
  if (detailOpen) {
    if (owned || isMobile) {
      body = courseMain;
    } else {
      body = (
        <PanelGroup
          direction="horizontal"
          autoSaveId="studio-academy-checkout-h"
          className="studio-cn-offer-panels h-full min-h-0 min-w-0 overflow-hidden"
        >
          <Panel
            id="studio-academy-main"
            order={1}
            defaultSize={68}
            minSize={48}
            className="min-h-0 min-w-0"
          >
            {courseMain}
          </Panel>
          <PanelResizeHandle className="cursor-resize" />
          <Panel
            id="studio-academy-checkout"
            order={2}
            defaultSize={32}
            minSize={22}
            maxSize={42}
            className="studio-cn-book-panel min-h-0 min-w-0 h-full overflow-hidden"
          >
            {checkoutSidebar}
          </Panel>
        </PanelGroup>
      );
    }
  }

  return (
    <div className="studio-cn-pane studio-academy-pane">
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

      <div className="studio-cn-body is-catalog">
        {body}
        {isMobile && detailOpen && detail && !owned ? (
          <>
            <nav
              className="public-offers-mobile-book-nav studio-cn-book-bar"
              aria-label="Buy this course"
            >
              <span className="studio-cn-book-bar-price">{priceLabel}</span>
              <div className="studio-cn-book-bar-actions">
                <button
                  type="button"
                  className="public-offers-btn is-primary studio-cn-book-bar-cta"
                  onClick={() => setCheckoutSheetOpen(true)}
                >
                  <Zap aria-hidden="true" />
                  Buy now
                </button>
              </div>
            </nav>
            {checkoutSheetOpen ? (
              <div
                className="studio-cn-book-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="Course checkout"
              >
                <button
                  type="button"
                  className="studio-cn-book-sheet-backdrop"
                  aria-label="Close checkout"
                  onClick={() => setCheckoutSheetOpen(false)}
                />
                <div className="studio-cn-book-sheet-panel">
                  <div className="studio-cn-book-sheet-handle" aria-hidden="true">
                    <span className="studio-cn-book-sheet-grab" />
                  </div>
                  <div className="studio-cn-book-sheet-body">
                    <CheckoutDock
                      showHead={false}
                      onBuy={() => void buy()}
                      busy={busy}
                      owned={owned}
                      priceLabel={priceLabel}
                      lessonCount={detail.lessonCount}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
