"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  GraduationCap,
  Library,
  Loader2,
  MessageCircle,
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
import { ProfileCommentsPanel } from "./ProfileCommentsPanel";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
import "./studio-creative-network.css";
import "./public-offers.css";
import "./profile-post-viewer.css";

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
    <div className="studio-academy-player">
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
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
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
    setCommentsOpen(false);
  }, [academy.courseId]);

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
              <ul className="public-offers-grid studio-academy-grid">
                {list.map((course) => {
                  const banner = courseBannerUrl(course);
                  return (
                    <li key={course._id}>
                      <button
                        type="button"
                        className="public-offers-card studio-academy-card"
                        onClick={() => academy.openCourse(course._id)}
                      >
                        <div className="public-offers-card-media studio-academy-card-media">
                          {banner ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={banner} alt="" loading="lazy" />
                          ) : (
                            <div className="studio-academy-card-fallback">
                              <GraduationCap aria-hidden="true" />
                            </div>
                          )}
                          {course.owned ? (
                            <span className="studio-academy-card-owned">Owned</span>
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
                              {formatTtdFromCredits(course.priceCredits, price)}
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
              <StudioChatMarkdown
                className="studio-academy-md"
                text={selectedLesson.descriptionMarkdown}
              />
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
              {!owned ? (
                <span className="public-offers-card-price">{priceLabel}</span>
              ) : null}
            </div>
            <div className="studio-academy-body">
              <StudioChatMarkdown
                className="studio-academy-md"
                text={detail.descriptionMarkdown}
              />
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
              onBuy={() => void buy()}
              busy={busy}
              owned={owned}
              priceLabel={priceLabel}
              lessonCount={detail.lessonCount}
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
            <span className="studio-cn-book-bar-price">{priceLabel}</span>
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
              <MessageCircle
                aria-hidden="true"
                fill="currentColor"
                strokeWidth={0}
              />
              <span>{commentCount}</span>
            </button>
            {!owned ? (
              <button
                type="button"
                className="public-offers-btn is-primary studio-cn-book-bar-cta"
                onClick={() => setCheckoutSheetOpen(true)}
              >
                <Zap aria-hidden="true" />
                Buy now
              </button>
            ) : null}
          </div>
        </nav>
        {!owned && checkoutSheetOpen ? (
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
    ) : null;

  if (detailOpen && !isMobile) {
    return (
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
    );
  }

  return (
    <div className="studio-cn-pane studio-academy-pane">
      {head}
      <div className="studio-cn-body is-catalog">
        {body}
        {mobileExtras}
      </div>
    </div>
  );
}
