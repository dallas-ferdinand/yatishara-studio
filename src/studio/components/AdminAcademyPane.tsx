"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  CheckCircle2,
  GraduationCap,
  Loader2,
  PauseCircle,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CursorTable } from "@/desk/components/CursorTable";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { tusUploadFile } from "@/studio/lib/tusUpload";

type CourseRow = {
  _id: Id<"academyCourses">;
  title: string;
  slug: string;
  descriptionMarkdown: string;
  priceCredits: number;
  listPriceCredits?: number;
  salePriceCredits?: number;
  saleEndsAt?: number;
  coverUrl?: string;
  introBunnyStreamVideoId?: string;
  bunnyStreamVideoId?: string;
  lessonCount: number;
  status: "draft" | "published" | "coming_soon";
  sortOrder: number;
  purchaseCount: number;
  updatedAt: number;
};

type LessonRow = {
  _id: Id<"academyLessons">;
  title: string;
  slug: string;
  descriptionMarkdown: string;
  coverUrl?: string;
  bunnyStreamVideoId?: string;
  status: "draft" | "published";
  sortOrder: number;
};

const emptyCourseForm = {
  title: "",
  slug: "",
  descriptionMarkdown: "",
  priceCredits: "100",
  listPriceCredits: "",
  salePriceCredits: "",
  saleEndsAt: "",
  sortOrder: "100",
};

const emptyLessonForm = {
  title: "",
  slug: "",
  descriptionMarkdown: "",
  sortOrder: "10",
};

export function AdminAcademyPane() {
  const courses = useQuery(api.academy.adminListCourses, {}) as
    | CourseRow[]
    | undefined;
  const upsert = useMutation(api.academy.adminUpsertCourse);
  const setStatus = useMutation(api.academy.adminSetCourseStatus);
  const prepareCover = useMutation(api.academy.adminPrepareCoverUpload);
  const commitCover = useAction(api.academyActions.adminCommitCourseCover);
  const createStreamUpload = useAction(api.academyActions.adminCreateStreamUpload);
  const upsertLesson = useMutation(api.academy.adminUpsertLesson);
  const setLessonStatus = useMutation(api.academy.adminSetLessonStatus);
  const deleteLesson = useMutation(api.academy.adminDeleteLesson);
  const commitLessonCover = useAction(api.academyActions.adminCommitLessonCover);
  const createLessonStreamUpload = useAction(
    api.academyActions.adminCreateLessonStreamUpload,
  );
  const grantCourse = useMutation(api.academy.adminGrantCourse);
  const revokeCourse = useMutation(api.academy.adminRevokeCourse);

  const [selectedId, setSelectedId] = useState<Id<"academyCourses"> | null>(
    null,
  );
  const [selectedLessonId, setSelectedLessonId] =
    useState<Id<"academyLessons"> | null>(null);
  const [form, setForm] = useState(emptyCourseForm);
  const [lessonForm, setLessonForm] = useState(emptyLessonForm);
  const [busy, setBusy] = useState("");
  const [grantUserId, setGrantUserId] = useState("");
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const lessonVideoInputRef = useRef<HTMLInputElement>(null);
  const lessonCoverInputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => courses?.find((c) => c._id === selectedId) ?? null,
    [courses, selectedId],
  );

  const lessons = useQuery(
    api.academy.adminListLessons,
    selectedId ? { courseId: selectedId } : "skip",
  ) as LessonRow[] | undefined;

  const selectedLesson = useMemo(
    () => lessons?.find((l) => l._id === selectedLessonId) ?? null,
    [lessons, selectedLessonId],
  );

  const purchases = useQuery(
    api.academy.adminListCoursePurchases,
    selectedId ? { courseId: selectedId } : "skip",
  );

  function loadCourse(course: CourseRow) {
    setSelectedId(course._id);
    setSelectedLessonId(null);
    setLessonForm(emptyLessonForm);
    setForm({
      title: course.title,
      slug: course.slug,
      descriptionMarkdown: course.descriptionMarkdown,
      priceCredits: String(course.priceCredits),
      listPriceCredits:
        course.listPriceCredits != null ? String(course.listPriceCredits) : "",
      salePriceCredits:
        course.salePriceCredits != null ? String(course.salePriceCredits) : "",
      saleEndsAt: course.saleEndsAt
        ? new Date(course.saleEndsAt).toISOString().slice(0, 10)
        : "",
      sortOrder: String(course.sortOrder),
    });
    setGrantUserId("");
    setUploadPct(null);
  }

  function loadLesson(lesson: LessonRow) {
    setSelectedLessonId(lesson._id);
    setLessonForm({
      title: lesson.title,
      slug: lesson.slug,
      descriptionMarkdown: lesson.descriptionMarkdown,
      sortOrder: String(lesson.sortOrder),
    });
  }

  function startNew() {
    setSelectedId(null);
    setSelectedLessonId(null);
    setForm(emptyCourseForm);
    setLessonForm(emptyLessonForm);
    setGrantUserId("");
    setUploadPct(null);
  }

  function startNewLesson() {
    setSelectedLessonId(null);
    setLessonForm(emptyLessonForm);
  }

  async function saveCourse() {
    setBusy("Saving…");
    try {
      const listRaw = form.listPriceCredits.trim();
      const saleRaw = form.salePriceCredits.trim();
      const endsRaw = form.saleEndsAt.trim();
      const saleEndsAt = endsRaw
        ? Date.parse(`${endsRaw}T04:00:00.000Z`)
        : null;
      const courseId = await upsert({
        courseId: selectedId ?? undefined,
        title: form.title,
        slug: form.slug || undefined,
        descriptionMarkdown: form.descriptionMarkdown,
        priceCredits: Number(form.priceCredits),
        listPriceCredits: listRaw ? Number(listRaw) : undefined,
        salePriceCredits: saleRaw ? Number(saleRaw) : undefined,
        saleEndsAt:
          endsRaw && Number.isFinite(saleEndsAt) ? saleEndsAt : null,
        sortOrder: Number(form.sortOrder) || 100,
      });
      setSelectedId(courseId);
      toast.success(selectedId ? "Course updated" : "Course created");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Save failed"));
    } finally {
      setBusy("");
    }
  }

  async function saveLesson() {
    if (!selectedId) {
      toast.error("Save the course first");
      return;
    }
    setBusy("Saving lesson…");
    try {
      const lessonId = await upsertLesson({
        lessonId: selectedLessonId ?? undefined,
        courseId: selectedId,
        title: lessonForm.title,
        slug: lessonForm.slug || undefined,
        descriptionMarkdown: lessonForm.descriptionMarkdown,
        sortOrder: Number(lessonForm.sortOrder) || 10,
      });
      setSelectedLessonId(lessonId);
      toast.success(selectedLessonId ? "Lesson updated" : "Lesson created");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Lesson save failed"));
    } finally {
      setBusy("");
    }
  }

  async function togglePublish() {
    if (!selected) return;
    const next =
      selected.status === "draft"
        ? "coming_soon"
        : selected.status === "coming_soon"
          ? "published"
          : "draft";
    const label =
      next === "published"
        ? "Publishing…"
        : next === "coming_soon"
          ? "Coming soon…"
          : "Unpublishing…";
    setBusy(label);
    try {
      await setStatus({ courseId: selected._id, status: next });
      toast.success(
        next === "published"
          ? "Published"
          : next === "coming_soon"
            ? "Marked coming soon"
            : "Moved to draft",
      );
    } catch (error) {
      toast.error(friendlyConvexError(error, "Status change failed"));
    } finally {
      setBusy("");
    }
  }

  async function toggleLessonPublish() {
    if (!selectedLesson) return;
    const next = selectedLesson.status === "published" ? "draft" : "published";
    setBusy(next === "published" ? "Publishing lesson…" : "Unpublishing lesson…");
    try {
      await setLessonStatus({ lessonId: selectedLesson._id, status: next });
      toast.success(next === "published" ? "Lesson published" : "Lesson draft");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Lesson status failed"));
    } finally {
      setBusy("");
    }
  }

  async function onCoverPick(file: File | null) {
    if (!file || !selectedId) {
      toast.error("Save the course first, then upload a cover");
      return;
    }
    setBusy("Uploading cover…");
    try {
      const uploadUrl = await prepareCover({});
      const put = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      if (!put.ok) throw new Error("Cover staging failed");
      const { storageId } = (await put.json()) as { storageId: string };
      await commitCover({
        courseId: selectedId,
        storageId: storageId as Id<"_storage">,
        filename: file.name,
        mimeType: file.type || "image/jpeg",
        byteSize: file.size,
      });
      toast.success("Cover uploaded");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Cover upload failed"));
    } finally {
      setBusy("");
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  async function onIntroVideoPick(file: File | null) {
    if (!file || !selectedId) {
      toast.error("Save the course first, then upload an intro video");
      return;
    }
    setBusy("Preparing Stream upload…");
    setUploadPct(0);
    try {
      const creds = await createStreamUpload({
        courseId: selectedId,
        title: `${form.title || "Course"} intro`,
      });
      setBusy("Uploading intro…");
      await tusUploadFile({
        file,
        endpoint: creds.tusEndpoint,
        headers: {
          AuthorizationSignature: creds.signature,
          AuthorizationExpire: String(creds.expirationTime),
          VideoId: creds.videoId,
          LibraryId: creds.libraryId,
        },
        onProgress: (ratio) => setUploadPct(Math.round(ratio * 100)),
      });
      toast.success("Intro uploaded — Bunny will finish processing shortly");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Intro upload failed"));
    } finally {
      setBusy("");
      setUploadPct(null);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  }

  async function onLessonCoverPick(file: File | null) {
    if (!file || !selectedLessonId) {
      toast.error("Save the lesson first, then upload a banner");
      return;
    }
    setBusy("Uploading lesson banner…");
    try {
      const uploadUrl = await prepareCover({});
      const put = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      if (!put.ok) throw new Error("Banner staging failed");
      const { storageId } = (await put.json()) as { storageId: string };
      await commitLessonCover({
        lessonId: selectedLessonId,
        storageId: storageId as Id<"_storage">,
        filename: file.name,
        mimeType: file.type || "image/jpeg",
        byteSize: file.size,
      });
      toast.success("Lesson banner uploaded");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Lesson banner failed"));
    } finally {
      setBusy("");
      if (lessonCoverInputRef.current) lessonCoverInputRef.current.value = "";
    }
  }

  async function onLessonVideoPick(file: File | null) {
    if (!file || !selectedLessonId) {
      toast.error("Save the lesson first, then upload a video");
      return;
    }
    setBusy("Preparing lesson Stream upload…");
    setUploadPct(0);
    try {
      const creds = await createLessonStreamUpload({
        lessonId: selectedLessonId,
        title: lessonForm.title || undefined,
      });
      setBusy("Uploading lesson video…");
      await tusUploadFile({
        file,
        endpoint: creds.tusEndpoint,
        headers: {
          AuthorizationSignature: creds.signature,
          AuthorizationExpire: String(creds.expirationTime),
          VideoId: creds.videoId,
          LibraryId: creds.libraryId,
        },
        onProgress: (ratio) => setUploadPct(Math.round(ratio * 100)),
      });
      toast.success("Lesson video uploaded");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Lesson video failed"));
    } finally {
      setBusy("");
      setUploadPct(null);
      if (lessonVideoInputRef.current) lessonVideoInputRef.current.value = "";
    }
  }

  async function onGrant() {
    if (!selectedId || !grantUserId.trim()) return;
    setBusy("Granting…");
    try {
      await grantCourse({
        courseId: selectedId,
        userId: grantUserId.trim() as Id<"users">,
      });
      toast.success("Access granted");
      setGrantUserId("");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Grant failed"));
    } finally {
      setBusy("");
    }
  }

  const rows = courses ?? [];
  const lessonRows = lessons ?? [];
  const introId =
    selected?.introBunnyStreamVideoId || selected?.bunnyStreamVideoId;

  return (
    <div className="studio-admin-stack">
      <section className="studio-admin-section">
        <div className="studio-admin-section-head">
          <span className="studio-admin-section-title">Academy courses</span>
          <div className="studio-admin-section-extras">
            <button
              type="button"
              className="cursor-settings-action"
              onClick={startNew}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New course
            </button>
          </div>
        </div>
        <CursorTable
          ariaLabel="Academy courses"
          loading={courses === undefined}
          empty={courses !== undefined && !rows.length}
          emptyIcon={<GraduationCap />}
          emptyTitle="No courses yet"
          emptyHint="Create a draft, add intro + lessons, then publish."
        >
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Credits</th>
              <th>Lessons</th>
              <th>Intro</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((course) => (
              <tr
                key={course._id}
                className={course._id === selectedId ? "is-selected" : undefined}
                style={{ cursor: "pointer" }}
                onClick={() => loadCourse(course)}
              >
                <td>
                  <strong>{course.title}</strong>
                  <span>{course.slug}</span>
                </td>
                <td>{course.status}</td>
                <td>{course.priceCredits}</td>
                <td>{course.lessonCount}</td>
                <td>
                  {course.introBunnyStreamVideoId || course.bunnyStreamVideoId
                    ? "Ready"
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </CursorTable>
      </section>

      <section className="studio-admin-section">
        <div className="studio-admin-section-head">
          <span className="studio-admin-section-title">
            {selectedId ? "Edit course" : "New course"}
          </span>
          {busy ? (
            <span className="studio-settings-empty" style={{ margin: 0 }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin inline" aria-hidden />{" "}
              {busy}
              {uploadPct != null ? ` ${uploadPct}%` : ""}
            </span>
          ) : null}
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Title</span>
            <input
              className="cursor-input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Slug</span>
            <input
              className="cursor-input"
              value={form.slug}
              placeholder="auto from title"
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            />
          </label>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            <label style={{ display: "grid", gap: 4 }}>
              <span>Price (credits)</span>
              <input
                className="cursor-input"
                type="number"
                min={1}
                value={form.priceCredits}
                onChange={(e) =>
                  setForm((f) => ({ ...f, priceCredits: e.target.value }))
                }
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span>Sort order</span>
              <input
                className="cursor-input"
                type="number"
                value={form.sortOrder}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sortOrder: e.target.value }))
                }
              />
            </label>
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}
          >
            <label style={{ display: "grid", gap: 4 }}>
              <span>List price (credits)</span>
              <input
                className="cursor-input"
                type="number"
                min={1}
                value={form.listPriceCredits}
                placeholder="optional"
                onChange={(e) =>
                  setForm((f) => ({ ...f, listPriceCredits: e.target.value }))
                }
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span>Sale price (credits)</span>
              <input
                className="cursor-input"
                type="number"
                min={1}
                value={form.salePriceCredits}
                placeholder="optional"
                onChange={(e) =>
                  setForm((f) => ({ ...f, salePriceCredits: e.target.value }))
                }
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span>Sale ends (YYYY-MM-DD AST)</span>
              <input
                className="cursor-input"
                type="date"
                value={form.saleEndsAt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, saleEndsAt: e.target.value }))
                }
              />
            </label>
          </div>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Overview (markdown)</span>
            <textarea
              className="cursor-input"
              rows={8}
              value={form.descriptionMarkdown}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  descriptionMarkdown: e.target.value,
                }))
              }
            />
          </label>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className="cursor-settings-action"
              onClick={() => void saveCourse()}
              disabled={Boolean(busy)}
            >
              Save course
            </button>
            {selected ? (
              <button
                type="button"
                className="cursor-settings-action"
                onClick={() => void togglePublish()}
                disabled={Boolean(busy)}
              >
                {selected.status === "published" ? (
                  <>
                    <PauseCircle className="h-3.5 w-3.5" aria-hidden />{" "}
                    Unpublish
                  </>
                ) : selected.status === "coming_soon" ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Publish
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Coming
                    soon
                  </>
                )}
              </button>
            ) : null}
          </div>

          {selectedId ? (
            <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
              {selected?.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.coverUrl}
                  alt=""
                  style={{
                    width: 160,
                    height: 90,
                    objectFit: "cover",
                    borderRadius: 8,
                  }}
                />
              ) : null}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  className="cursor-settings-action"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={Boolean(busy)}
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden /> Course banner
                </button>
                <button
                  type="button"
                  className="cursor-settings-action"
                  onClick={() => videoInputRef.current?.click()}
                  disabled={Boolean(busy)}
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden /> Intro video
                </button>
              </div>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void onCoverPick(e.target.files?.[0] ?? null)}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                hidden
                onChange={(e) =>
                  void onIntroVideoPick(e.target.files?.[0] ?? null)
                }
              />
              <p className="studio-settings-empty" style={{ margin: 0 }}>
                Intro Stream id: {introId || "not uploaded"}
              </p>
            </div>
          ) : (
            <p className="studio-settings-empty">
              Save the course once before uploading banner or intro.
            </p>
          )}
        </div>
      </section>

      {selectedId ? (
        <section className="studio-admin-section">
          <div className="studio-admin-section-head">
            <span className="studio-admin-section-title">Lessons</span>
            <div className="studio-admin-section-extras">
              <button
                type="button"
                className="cursor-settings-action"
                onClick={startNewLesson}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                New lesson
              </button>
            </div>
          </div>
          <CursorTable
            ariaLabel="Course lessons"
            loading={lessons === undefined}
            empty={lessons !== undefined && !lessonRows.length}
            emptyIcon={<GraduationCap />}
            emptyTitle="No lessons"
            emptyHint="Add lessons with banner, video, and description."
          >
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Sort</th>
                <th>Video</th>
              </tr>
            </thead>
            <tbody>
              {lessonRows.map((lesson) => (
                <tr
                  key={lesson._id}
                  className={
                    lesson._id === selectedLessonId ? "is-selected" : undefined
                  }
                  style={{ cursor: "pointer" }}
                  onClick={() => loadLesson(lesson)}
                >
                  <td>
                    <strong>{lesson.title}</strong>
                    <span>{lesson.slug}</span>
                  </td>
                  <td>{lesson.status}</td>
                  <td>{lesson.sortOrder}</td>
                  <td>{lesson.bunnyStreamVideoId ? "Ready" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </CursorTable>

          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span>Lesson title</span>
              <input
                className="cursor-input"
                value={lessonForm.title}
                onChange={(e) =>
                  setLessonForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span>Lesson slug</span>
              <input
                className="cursor-input"
                value={lessonForm.slug}
                placeholder="auto from title"
                onChange={(e) =>
                  setLessonForm((f) => ({ ...f, slug: e.target.value }))
                }
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span>Sort order</span>
              <input
                className="cursor-input"
                type="number"
                value={lessonForm.sortOrder}
                onChange={(e) =>
                  setLessonForm((f) => ({ ...f, sortOrder: e.target.value }))
                }
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span>Lesson description (markdown)</span>
              <textarea
                className="cursor-input"
                rows={6}
                value={lessonForm.descriptionMarkdown}
                onChange={(e) =>
                  setLessonForm((f) => ({
                    ...f,
                    descriptionMarkdown: e.target.value,
                  }))
                }
              />
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                className="cursor-settings-action"
                onClick={() => void saveLesson()}
                disabled={Boolean(busy)}
              >
                Save lesson
              </button>
              {selectedLesson ? (
                <>
                  <button
                    type="button"
                    className="cursor-settings-action"
                    onClick={() => void toggleLessonPublish()}
                    disabled={Boolean(busy)}
                  >
                    {selectedLesson.status === "published"
                      ? "Unpublish lesson"
                      : "Publish lesson"}
                  </button>
                  <button
                    type="button"
                    className="cursor-settings-action"
                    onClick={() => lessonCoverInputRef.current?.click()}
                    disabled={Boolean(busy)}
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden /> Lesson banner
                  </button>
                  <button
                    type="button"
                    className="cursor-settings-action"
                    onClick={() => lessonVideoInputRef.current?.click()}
                    disabled={Boolean(busy)}
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden /> Lesson video
                  </button>
                  <button
                    type="button"
                    className="cursor-settings-action"
                    onClick={() => {
                      void (async () => {
                        try {
                          await deleteLesson({ lessonId: selectedLesson._id });
                          setSelectedLessonId(null);
                          setLessonForm(emptyLessonForm);
                          toast.success("Lesson deleted");
                        } catch (error) {
                          toast.error(
                            friendlyConvexError(error, "Delete failed"),
                          );
                        }
                      })();
                    }}
                    disabled={Boolean(busy)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
                  </button>
                </>
              ) : null}
            </div>
            <input
              ref={lessonCoverInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) =>
                void onLessonCoverPick(e.target.files?.[0] ?? null)
              }
            />
            <input
              ref={lessonVideoInputRef}
              type="file"
              accept="video/*"
              hidden
              onChange={(e) =>
                void onLessonVideoPick(e.target.files?.[0] ?? null)
              }
            />
            {selectedLesson ? (
              <p className="studio-settings-empty" style={{ margin: 0 }}>
                Lesson Stream id:{" "}
                {selectedLesson.bunnyStreamVideoId || "not uploaded"}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {selectedId ? (
        <section className="studio-admin-section">
          <div className="studio-admin-section-head">
            <span className="studio-admin-section-title">Purchases / grants</span>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input
              className="cursor-input"
              placeholder="User id to grant"
              value={grantUserId}
              onChange={(e) => setGrantUserId(e.target.value)}
            />
            <button
              type="button"
              className="cursor-settings-action"
              onClick={() => void onGrant()}
              disabled={Boolean(busy) || !grantUserId.trim()}
            >
              Grant access
            </button>
          </div>
          <CursorTable
            ariaLabel="Course purchases"
            loading={purchases === undefined}
            empty={purchases !== undefined && !purchases.length}
            emptyIcon={<GraduationCap />}
            emptyTitle="No purchases"
            emptyHint="Buyers and admin grants show up here."
          >
            <thead>
              <tr>
                <th>User</th>
                <th>Credits</th>
                <th>When</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(purchases ?? []).map((row) => (
                <tr key={row._id}>
                  <td>
                    <strong>{row.userLabel}</strong>
                    <span>{row.granted ? "Admin grant" : "Purchase"}</span>
                  </td>
                  <td>{row.priceCredits}</td>
                  <td>{new Date(row.purchasedAt).toLocaleString()}</td>
                  <td>
                    <button
                      type="button"
                      className="cursor-settings-action"
                      onClick={() => {
                        void (async () => {
                          try {
                            await revokeCourse({ purchaseId: row._id });
                            toast.success("Access revoked");
                          } catch (error) {
                            toast.error(
                              friendlyConvexError(error, "Revoke failed"),
                            );
                          }
                        })();
                      }}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </CursorTable>
        </section>
      ) : null}
    </div>
  );
}
