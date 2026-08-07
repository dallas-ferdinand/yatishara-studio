"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowLeft, GraduationCap, Loader2, Play, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { StudioChatMarkdown } from "./StudioChatMarkdown";

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

export function StudioAcademyPane({
  onOpenCredits,
  initialCourseId,
  initialSlug,
}: {
  onOpenCredits?: () => void;
  initialCourseId?: string | null;
  initialSlug?: string | null;
}) {
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

  const list: CatalogCourse[] =
    view === "mine" ? (mine as CatalogCourse[] | undefined) ?? [] : (catalog as CatalogCourse[] | undefined) ?? [];
  const listLoading = view === "mine" ? mine === undefined : catalog === undefined;

  if (view === "detail" && courseId) {
    return (
      <div className="studio-academy-pane">
        <header className="studio-academy-head">
          <button
            type="button"
            className="cursor-settings-action"
            onClick={() => {
              setView("catalog");
              setCourseId(null);
              setEmbedUrl(null);
            }}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
          </button>
          <h1 className="studio-academy-title">{detail?.title || "Course"}</h1>
        </header>

        {!detail ? (
          <div className="studio-settings-empty" style={{ padding: 24 }}>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </div>
        ) : (
          <div className="studio-academy-detail">
            {detail.coverUrl && !embedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="studio-academy-cover"
                src={detail.coverUrl}
                alt=""
              />
            ) : null}

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

            <div className="studio-academy-buy-row">
              {detail.owned ? (
                <span className="studio-academy-owned">Owned · lifetime access</span>
              ) : (
                <>
                  <strong>{detail.priceCredits} credits</strong>
                  <button
                    type="button"
                    className="cursor-settings-action"
                    disabled={busy}
                    onClick={() => void buy()}
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Zap className="h-3.5 w-3.5" aria-hidden />
                    )}
                    Buy course
                  </button>
                  <button
                    type="button"
                    className="cursor-settings-action"
                    onClick={() => onOpenCredits?.()}
                  >
                    Top up
                  </button>
                </>
              )}
            </div>

            <div className="studio-academy-body">
              <StudioChatMarkdown text={detail.descriptionMarkdown} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="studio-academy-pane">
      <header className="studio-academy-head">
        <h1 className="studio-academy-title">
          <GraduationCap className="h-5 w-5" aria-hidden /> Academy
        </h1>
        <div className="studio-academy-tabs">
          <button
            type="button"
            className={`studio-admin-head-tab${view === "catalog" ? " is-active" : ""}`}
            onClick={() => setView("catalog")}
          >
            All courses
          </button>
          <button
            type="button"
            className={`studio-admin-head-tab${view === "mine" ? " is-active" : ""}`}
            onClick={() => setView("mine")}
          >
            My courses
          </button>
        </div>
      </header>

      {listLoading ? (
        <div className="studio-settings-empty" style={{ padding: 24 }}>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </div>
      ) : !list.length ? (
        <div className="studio-settings-empty" style={{ padding: 24 }}>
          {view === "mine"
            ? "You haven’t bought any courses yet."
            : "No published courses yet. Check back soon."}
        </div>
      ) : (
        <div className="studio-academy-grid">
          {list.map((course) => (
            <button
              key={course._id}
              type="button"
              className="studio-academy-card"
              onClick={() => openCourse(course._id)}
            >
              {course.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={course.coverUrl} alt="" />
              ) : (
                <div className="studio-academy-card-fallback" aria-hidden>
                  <GraduationCap />
                </div>
              )}
              <div className="studio-academy-card-body">
                <strong>{course.title}</strong>
                <p>{course.blurb || " "}</p>
                <span>
                  {course.owned ? "Owned" : `${course.priceCredits} credits`}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
