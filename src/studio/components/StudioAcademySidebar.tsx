"use client";

import { useQuery } from "convex/react";
import { ArrowDown, MessageCircle } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PanelSearchBar } from "@/desk/components/PanelSearchBar";
import {
  ACADEMY_PRICE_PRESETS,
  useStudioAcademyOptional,
  type AcademyOwnershipFilter,
  type AcademySortKey,
} from "./StudioAcademyContext";
import "./public-offers.css";
import "./studio-creative-network.css";

function formatCommentCount(value: number): string {
  if (value >= 1_000_000)
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000)
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}
const SORT_OPTIONS: Array<{ value: AcademySortKey; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
];

const OWNERSHIP_OPTIONS: Array<{
  value: AcademyOwnershipFilter;
  label: string;
}> = [
  { value: "all", label: "All courses" },
  { value: "owned", label: "Owned" },
  { value: "not_owned", label: "Not owned" },
];

function FilterSection({
  title,
  activeCount,
  open,
  onToggle,
  children,
}: {
  title: string;
  activeCount: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`public-offers-filter-group${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="public-offers-filter-head"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>{title}</span>
        {activeCount > 0 ? (
          <em className="public-offers-filter-active">{activeCount}</em>
        ) : null}
        <ArrowDown className="public-offers-filter-caret" aria-hidden="true" />
      </button>
      {open ? <div className="public-offers-filter-options">{children}</div> : null}
    </section>
  );
}

function FilterOption({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`public-offers-filter-btn${active ? " is-active" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      <span>{label}</span>
    </button>
  );
}

function CatalogFilters() {
  const academy = useStudioAcademyOptional();
  if (!academy) return null;

  const priceActive =
    (academy.priceMin.trim() ? 1 : 0) + (academy.priceMax.trim() ? 1 : 0);
  const ownershipActive = academy.ownership !== "all" ? 1 : 0;
  const sortActive = academy.sort === "newest" ? 0 : 1;

  return (
    <div className="studio-cn-sidebar-body">
      <div className="studio-cn-sidebar-chrome">
        <PanelSearchBar
          value={academy.search}
          onChange={academy.setSearch}
          placeholder="Search courses"
          aria-label="Search courses"
        />
      </div>
      <div className="studio-cn-rail-scroll public-offers-rail-body">
        <FilterSection
          title="Price (TTD)"
          activeCount={priceActive}
          open={!academy.closedSections.price}
          onToggle={() => academy.toggleSection("price")}
        >
          <div className="public-offers-range">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Min"
              value={academy.priceMin}
              onChange={(e) => academy.setPriceMin(e.target.value)}
              aria-label="Minimum price TTD"
            />
            <span aria-hidden="true">–</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Max"
              value={academy.priceMax}
              onChange={(e) => academy.setPriceMax(e.target.value)}
              aria-label="Maximum price TTD"
            />
          </div>
          <div className="public-offers-presets">
            {ACADEMY_PRICE_PRESETS.map((preset) => {
              const active =
                academy.priceMin === preset.min &&
                academy.priceMax === preset.max;
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={`public-offers-preset${active ? " is-active" : ""}`}
                  aria-pressed={active}
                  onClick={() =>
                    academy.setPriceRange(
                      active ? "" : preset.min,
                      active ? "" : preset.max,
                    )
                  }
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </FilterSection>

        <FilterSection
          title="Ownership"
          activeCount={ownershipActive}
          open={!academy.closedSections.ownership}
          onToggle={() => academy.toggleSection("ownership")}
        >
          {OWNERSHIP_OPTIONS.map((opt) => (
            <FilterOption
              key={opt.value}
              active={academy.ownership === opt.value}
              onClick={() => academy.setOwnership(opt.value)}
              label={opt.label}
            />
          ))}
        </FilterSection>

        <FilterSection
          title="Sort"
          activeCount={sortActive}
          open={!academy.closedSections.sort}
          onToggle={() => academy.toggleSection("sort")}
        >
          {SORT_OPTIONS.map((opt) => (
            <FilterOption
              key={opt.value}
              active={academy.sort === opt.value}
              onClick={() => academy.setSort(opt.value)}
              label={opt.label}
            />
          ))}
        </FilterSection>

        {academy.hasFilters ? (
          <button
            type="button"
            className="public-offers-btn is-quiet public-offers-rail-clear"
            onClick={academy.clearFilters}
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}

function LessonRail({
  courseId,
}: {
  courseId: Id<"academyCourses">;
}) {
  const academy = useStudioAcademyOptional();
  const detail = useQuery(api.academy.getCourse, { courseId });

  if (!academy) return null;

  const lessons = academy.filterLessons(detail?.lessons ?? []);
  const courseBanner = detail?.coverUrl;
  const introActive = academy.lessonId === null;
  const introCount = detail?.commentCount ?? 0;
  const q = academy.lessonSearch.trim().toLowerCase();
  const showIntro =
    !q ||
    `${detail?.title ?? ""} ${detail?.blurb ?? ""} intro`.toLowerCase().includes(
      q,
    );

  return (
    <div className="studio-cn-sidebar-body">
      <div className="studio-cn-sidebar-chrome">
        <PanelSearchBar
          value={academy.lessonSearch}
          onChange={academy.setLessonSearch}
          placeholder="Search lessons"
          aria-label="Search lessons"
        />
      </div>
      <div className="studio-cn-rail-scroll public-offers-rail-body">
        {!detail ? (
          <p className="studio-cn-list-empty">Loading lessons…</p>
        ) : !showIntro && lessons.length === 0 ? (
          <p className="studio-cn-list-empty">No lessons match</p>
        ) : (
          <ul className="studio-academy-lesson-list">
            {showIntro ? (
              <li>
                <button
                  type="button"
                  className={`studio-academy-lesson-row${introActive ? " is-active" : ""}`}
                  onClick={() => academy.setLessonId(null)}
                >
                  <span
                    className="studio-academy-lesson-thumb"
                    aria-hidden="true"
                  >
                    {courseBanner ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={courseBanner} alt="" />
                    ) : (
                      <span className="studio-academy-lesson-num">0</span>
                    )}
                  </span>
                  <span className="studio-academy-lesson-meta">
                    <strong>{detail.title}</strong>
                    <small>Intro</small>
                  </span>
                  <span
                    className="studio-academy-lesson-comments"
                    aria-label={`${formatCommentCount(introCount)} comments`}
                  >
                    <MessageCircle
                      aria-hidden="true"
                      fill="currentColor"
                      strokeWidth={0}
                    />
                    <span>{formatCommentCount(introCount)}</span>
                  </span>
                </button>
              </li>
            ) : null}
            {lessons.map((lesson, index) => {
              const active = academy.lessonId === lesson._id;
              const count = lesson.commentCount ?? 0;
              return (
                <li key={lesson._id}>
                  <button
                    type="button"
                    className={`studio-academy-lesson-row${active ? " is-active" : ""}`}
                    onClick={() => academy.setLessonId(lesson._id)}
                  >
                    <span
                      className="studio-academy-lesson-thumb"
                      aria-hidden="true"
                    >
                      {lesson.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={lesson.coverUrl} alt="" />
                      ) : (
                        <span className="studio-academy-lesson-num">
                          {index + 1}
                        </span>
                      )}
                    </span>
                    <span className="studio-academy-lesson-meta">
                      <strong>{lesson.title}</strong>
                      <small>{lesson.blurb || "Lesson"}</small>
                    </span>
                    <span
                      className="studio-academy-lesson-comments"
                      aria-label={`${formatCommentCount(count)} comments`}
                    >
                      <MessageCircle
                        aria-hidden="true"
                        fill="currentColor"
                        strokeWidth={0}
                      />
                      <span>{formatCommentCount(count)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Left rail for Academy — same shell as CN: one studio-cn-sidebar, no nested
 * public-offers-rail (that class is a full page column, not an in-shell rail).
 */
export function StudioAcademySidebar() {
  const academy = useStudioAcademyOptional();

  let body: React.ReactNode;
  if (!academy) {
    body = (
      <div className="studio-cn-sidebar-body">
        <div className="studio-cn-rail-scroll public-offers-rail-body">
          <p className="studio-cn-list-empty">Open Academy to browse courses</p>
        </div>
      </div>
    );
  } else if (academy.courseId) {
    body = <LessonRail courseId={academy.courseId} />;
  } else {
    body = <CatalogFilters />;
  }

  return (
    <aside className="studio-cn-sidebar" aria-label="Academy">
      {body}
    </aside>
  );
}
