"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  GraduationCap,
  Library,
  Loader2,
  Play,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { DEFAULT_CREDIT_PRICE_CENTS, formatTtdFromCredits } from "@/studio/lib/money";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { StudioChatMarkdown } from "./StudioChatMarkdown";
import "./studio-creative-network.css";
import "./public-offers.css";

type CatalogCourse = {
  _id: Id<"academyCourses">;
  title: string;
  slug: string;
  blurb: string;
  priceCredits: number;
  coverUrl?: string;
  owned: boolean;
  sortOrder: number;
  updatedAt: number;
};

/** Static demo banners under /public/academy/{slug}.webp */
function demoCoverUrl(slug: string): string | undefined {
  if (!slug.startsWith("demo-")) return undefined;
  return `/academy/${slug}.webp`;
}

function courseBannerUrl(course: { slug: string; coverUrl?: string }): string | undefined {
  return course.coverUrl || demoCoverUrl(course.slug);
}

export function StudioAcademyPane({
  onOpenCredits,
  creditPriceCents,
  initialCourseId,
  initialSlug,
}: {
  onOpenCredits?: () => void;
  creditPriceCents?: number;
  initialCourseId?: string | null;
  initialSlug?: string | null;
}) {
  const price = creditPriceCents ?? DEFAULT_CREDIT_PRICE_CENTS;
  const catalog = useQuery(api.academy.listPublishedCourses, {});
  const mine = useQuery(api.academy.listMyCourses, {});
  const purchase = useMutation(api.academy.purchaseCourse);
  const getPlayback = useAction(api.academyActions.getCoursePlayback);

  const [view, setView] = useState<"catalog" | "mine" | "detail">("catalog");
  const [courseId, setCourseId] = useState<Id<"academyCourses"> | null>(
    (initialCourseId as Id<"academyCourses">) || null,
  );
  const [busy, setBusy] = useState(false);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [loadingPlay, setLoadingPlay] = useState(false);
  const headTabsScrollRef = useRef<HTMLElement | null>(null);

  const detail = useQuery(
    api.academy.getCourse,
    courseId
      ? { courseId }
      : initialSlug
        ? { slug: initialSlug }
        : "skip",
  );

  useEffect(() => {
    if (initialCourseId) {
      setCourseId(initialCourseId as Id<"academyCourses">);
      setView("detail");
    } else if (initialSlug) {
      setView("detail");
    }
  }, [initialCourseId, initialSlug]);

  useEffect(() => {
    if (detail?._id && !courseId) setCourseId(detail._id);
  }, [detail, courseId]);

  useEffect(() => {
    setEmbedUrl(null);
  }, [courseId]);

  function openCourse(id: Id<"academyCourses">) {
    setCourseId(id);
    setView("detail");
    setEmbedUrl(null);
  }

  function backToList() {
    setView("catalog");
    setCourseId(null);
    setEmbedUrl(null);
  }

  async function buy() {
    if (!courseId) return;
    setBusy(true);
    try {
      await purchase({ courseId });
      toast.success("Course unlocked — lifetime access");
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

  async function loadPlayer() {
    if (!courseId) return;
    setLoadingPlay(true);
    try {
      const playback = await getPlayback({ courseId });
      setEmbedUrl(playback.embedUrl);
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not load video"));
    } finally {
      setLoadingPlay(false);
    }
  }

  const listTab = view === "mine" ? "mine" : "catalog";
  const list: CatalogCourse[] =
    listTab === "mine"
      ? ((mine as CatalogCourse[] | undefined) ?? [])
      : ((catalog as CatalogCourse[] | undefined) ?? []);
  const listLoading = listTab === "mine" ? mine === undefined : catalog === undefined;
  const detailOpen = view === "detail" && Boolean(courseId);
  const detailBanner = detail
    ? courseBannerUrl({ slug: detail.slug, coverUrl: detail.coverUrl })
    : undefined;

  return (
    <div className="studio-cn-pane studio-academy-pane">
      <header className="studio-cn-head">
        <nav
          ref={headTabsScrollRef}
          className="studio-cn-head-tabs"
          aria-label="Academy"
        >
          {detailOpen ? (
            <button
              type="button"
              className="studio-cn-head-tab is-active"
              onClick={backToList}
            >
              <ArrowLeft aria-hidden="true" />
              Back to Academy
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`studio-cn-head-tab${listTab === "catalog" ? " is-active" : ""}`}
                onClick={() => {
                  setView("catalog");
                  setCourseId(null);
                }}
              >
                <GraduationCap aria-hidden="true" />
                Courses
              </button>
              <button
                type="button"
                className={`studio-cn-head-tab${listTab === "mine" ? " is-active" : ""}`}
                onClick={() => {
                  setView("mine");
                  setCourseId(null);
                }}
              >
                <Library aria-hidden="true" />
                My courses
              </button>
            </>
          )}
        </nav>
      </header>

      <div className="studio-cn-body is-catalog">
        {detailOpen ? (
          <div className="public-offers-main studio-cn-catalog">
            <div className="public-offers-main-scroll">
              <main className="public-offers-body is-narrow">
                {!detail ? (
                  <div className="public-offers-state">
                    <Loader2 className="animate-spin" aria-hidden="true" />
                    <strong>Loading course…</strong>
                  </div>
                ) : (
                  <div className="studio-academy-detail">
                    {detailBanner && !embedUrl ? (
                      <div className="studio-academy-banner" aria-hidden="true">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={detailBanner} alt="" />
                      </div>
                    ) : null}

                    <div className="studio-academy-detail-top">
                      <div>
                        <h1 className="studio-academy-detail-title">{detail.title}</h1>
                        <p className="studio-academy-detail-sub">
                          {detail.owned ? "Owned · lifetime access" : "Lifetime access"}
                        </p>
                      </div>
                      <span className="public-offers-card-price">
                        {formatTtdFromCredits(detail.priceCredits, price)}
                      </span>
                    </div>

                    {detail.owned && detail.hasVideo ? (
                      <div className="studio-academy-player">
                        {embedUrl ? (
                          <iframe
                            src={embedUrl}
                            title={detail.title}
                            loading="lazy"
                            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                            allowFullScreen
                          />
                        ) : (
                          <button
                            type="button"
                            className="studio-academy-play-cta"
                            disabled={loadingPlay}
                            onClick={() => void loadPlayer()}
                          >
                            {loadingPlay ? (
                              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                            ) : (
                              <Play className="h-5 w-5" aria-hidden />
                            )}
                            Watch course
                          </button>
                        )}
                      </div>
                    ) : null}

                    {!detail.owned ? (
                      <div className="studio-academy-buy-row">
                        <button
                          type="button"
                          className="public-offers-btn"
                          disabled={busy}
                          onClick={() => void buy()}
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Zap className="h-3.5 w-3.5" aria-hidden />
                          )}
                          Buy · {formatTtdFromCredits(detail.priceCredits, price)}
                        </button>
                        <button
                          type="button"
                          className="cursor-settings-action"
                          onClick={() => onOpenCredits?.()}
                        >
                          Top up
                        </button>
                      </div>
                    ) : null}

                    <div className="studio-academy-body">
                      <StudioChatMarkdown text={detail.descriptionMarkdown} />
                    </div>
                  </div>
                )}
              </main>
            </div>
          </div>
        ) : (
          <div className="public-offers-main studio-cn-catalog">
            <div className="public-offers-main-scroll">
              <main className="public-offers-body">
                <section className="public-offers-hero">
                  <div className="public-offers-hero-bg studio-academy-hero-bg" aria-hidden="true" />
                  <div className="public-offers-hero-copy">
                    <h1>{listTab === "mine" ? "My courses" : "Academy"}</h1>
                    <p>
                      {listTab === "mine"
                        ? "Courses you own — lifetime access, ready when you are."
                        : "Learn production skills inside Studio. Pay once, keep forever."}
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
                        {listTab === "mine"
                          ? "No courses yet"
                          : "No published courses yet"}
                      </strong>
                      <p>
                        {listTab === "mine"
                          ? "Buy a course from Academy to unlock lifetime access."
                          : "New courses are on the way. Check back soon."}
                      </p>
                    </div>
                  ) : (
                    <ul className="public-offers-grid">
                      {list.map((course, index) => {
                        const banner = courseBannerUrl(course);
                        return (
                          <li key={course._id}>
                            <button
                              type="button"
                              className="public-offers-card studio-cn-card-btn"
                              onClick={() => openCourse(course._id)}
                            >
                              {banner ? (
                                <div
                                  className="public-offers-card-media"
                                  aria-hidden="true"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={banner}
                                    alt=""
                                    loading={index < 8 ? "eager" : "lazy"}
                                    fetchPriority={index < 4 ? "high" : "auto"}
                                    decoding="async"
                                  />
                                </div>
                              ) : (
                                <div
                                  className="public-offers-card-media studio-academy-card-fallback"
                                  aria-hidden="true"
                                >
                                  <GraduationCap />
                                </div>
                              )}
                              <div className="public-offers-card-top">
                                <div>
                                  <h3 className="public-offers-card-title">
                                    {course.title}
                                  </h3>
                                  <p className="public-offers-card-seller">
                                    {course.owned ? "Owned" : "Yatishara Academy"}
                                  </p>
                                </div>
                                <span className="public-offers-card-price">
                                  {formatTtdFromCredits(course.priceCredits, price)}
                                </span>
                              </div>
                              {course.blurb.trim() ? (
                                <p className="public-offers-card-desc">{course.blurb}</p>
                              ) : null}
                              <div className="public-offers-card-meta">
                                <span className="public-offers-chip">
                                  Lifetime access
                                </span>
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
        )}
      </div>
    </div>
  );
}
