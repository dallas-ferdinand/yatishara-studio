"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  CheckCircle2,
  GraduationCap,
  Loader2,
  PauseCircle,
  Plus,
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
  coverUrl?: string;
  bunnyStreamVideoId?: string;
  status: "draft" | "published";
  sortOrder: number;
  purchaseCount: number;
  updatedAt: number;
};

const emptyForm = {
  title: "",
  slug: "",
  descriptionMarkdown: "",
  priceCredits: "100",
  sortOrder: "100",
};

export function AdminAcademyPane() {
  const courses = useQuery(api.academy.adminListCourses, {}) as CourseRow[] | undefined;
  const upsert = useMutation(api.academy.adminUpsertCourse);
  const setStatus = useMutation(api.academy.adminSetCourseStatus);
  const prepareCover = useMutation(api.academy.adminPrepareCoverUpload);
  const commitCover = useAction(api.academyActions.adminCommitCourseCover);
  const createStreamUpload = useAction(api.academyActions.adminCreateStreamUpload);
  const grantCourse = useMutation(api.academy.adminGrantCourse);
  const revokeCourse = useMutation(api.academy.adminRevokeCourse);

  const [selectedId, setSelectedId] = useState<Id<"academyCourses"> | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState("");
  const [grantUserId, setGrantUserId] = useState("");
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => courses?.find((c) => c._id === selectedId) ?? null,
    [courses, selectedId],
  );

  const purchases = useQuery(
    api.academy.adminListCoursePurchases,
    selectedId ? { courseId: selectedId } : "skip",
  );

  function loadCourse(course: CourseRow) {
    setSelectedId(course._id);
    setForm({
      title: course.title,
      slug: course.slug,
      descriptionMarkdown: course.descriptionMarkdown,
      priceCredits: String(course.priceCredits),
      sortOrder: String(course.sortOrder),
    });
    setGrantUserId("");
    setUploadPct(null);
  }

  function startNew() {
    setSelectedId(null);
    setForm(emptyForm);
    setGrantUserId("");
    setUploadPct(null);
  }

  async function saveCourse() {
    setBusy("Saving…");
    try {
      const courseId = await upsert({
        courseId: selectedId ?? undefined,
        title: form.title,
        slug: form.slug || undefined,
        descriptionMarkdown: form.descriptionMarkdown,
        priceCredits: Number(form.priceCredits),
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

  async function togglePublish() {
    if (!selected) return;
    const next = selected.status === "published" ? "draft" : "published";
    setBusy(next === "published" ? "Publishing…" : "Unpublishing…");
    try {
      await setStatus({ courseId: selected._id, status: next });
      toast.success(next === "published" ? "Published" : "Moved to draft");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Status change failed"));
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

  async function onVideoPick(file: File | null) {
    if (!file || !selectedId) {
      toast.error("Save the course first, then upload a video");
      return;
    }
    setBusy("Preparing Stream upload…");
    setUploadPct(0);
    try {
      const creds = await createStreamUpload({
        courseId: selectedId,
        title: form.title || undefined,
      });
      setBusy("Uploading video…");
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
      toast.success("Video uploaded — Bunny will finish processing shortly");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Video upload failed"));
    } finally {
      setBusy("");
      setUploadPct(null);
      if (videoInputRef.current) videoInputRef.current.value = "";
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

  return (
    <div className="studio-admin-stack">
      <section className="studio-admin-section">
        <div className="studio-admin-section-head">
          <span className="studio-admin-section-title">Academy courses</span>
          <div className="studio-admin-section-extras">
            <button type="button" className="cursor-settings-action" onClick={startNew}>
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
          emptyHint="Create a draft, upload a video, then publish."
        >
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Credits</th>
              <th>Buys</th>
              <th>Video</th>
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
                <td>{course.purchaseCount}</td>
                <td>{course.bunnyStreamVideoId ? "Ready" : "—"}</td>
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
              <Loader2 className="h-3.5 w-3.5 animate-spin inline" aria-hidden /> {busy}
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span>Price (credits)</span>
              <input
                className="cursor-input"
                type="number"
                min={1}
                value={form.priceCredits}
                onChange={(e) => setForm((f) => ({ ...f, priceCredits: e.target.value }))}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span>Sort order</span>
              <input
                className="cursor-input"
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
              />
            </label>
          </div>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Description (markdown)</span>
            <textarea
              className="cursor-input"
              rows={10}
              value={form.descriptionMarkdown}
              onChange={(e) =>
                setForm((f) => ({ ...f, descriptionMarkdown: e.target.value }))
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
              Save
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
                    <PauseCircle className="h-3.5 w-3.5" aria-hidden /> Unpublish
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Publish
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
                  <Upload className="h-3.5 w-3.5" aria-hidden /> Cover image
                </button>
                <button
                  type="button"
                  className="cursor-settings-action"
                  onClick={() => videoInputRef.current?.click()}
                  disabled={Boolean(busy)}
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden /> Course video
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
                onChange={(e) => void onVideoPick(e.target.files?.[0] ?? null)}
              />
              <p className="studio-settings-empty" style={{ margin: 0 }}>
                Stream id: {selected?.bunnyStreamVideoId || "not uploaded"}
              </p>
            </div>
          ) : (
            <p className="studio-settings-empty">
              Save the course once before uploading cover or video.
            </p>
          )}
        </div>
      </section>

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
                            toast.error(friendlyConvexError(error, "Revoke failed"));
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
