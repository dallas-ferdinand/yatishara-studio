"use client";

import { useQuery } from "convex/react";
import { ArrowDown, ArrowLeft } from "lucide-react";
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
      className={`public-offers-filter-option${active ? " is-active" : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function CatalogFilters() {
  const academy = useStudioAcademyOptional();
  if (!academy) return null;

  const priceActive =
    (academy.priceMin.trim() ? 1 : 0) + (academy.priceMax.trim() ? 1 : 0);
  const ownershipActive = academy.ownership !== "all" ? 1 : 0;

  return (
    <div className="studio-cn-sidebar public-offers-rail">
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
          open
          onToggle={() => undefined}
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
          open
          onToggle={() => undefined}
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

        <FilterSection title="Sort" activeCount={0} open onToggle={() => undefined}>
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
    </div>
  );
}

function OwnedLessonRail({
  courseId,
}: {
  courseId: Id<"academyCourses">;
}) {
  const academy = useStudioAcademyOptional();
  const detail = useQuery(api.academy.getCourse, { courseId });

  if (!academy) return null;

  const lessons = academy.filterLessons(detail?.lessons ?? []);

  return (
    <div className="studio-cn-sidebar studio-academy-lesson-rail">
      <div className="studio-academy-lesson-rail-head">
        <button
          type="button"
          className="studio-cn-head-tab"
          onClick={() => academy.backToCatalog()}
        >
          <ArrowLeft aria-hidden="true" />
          Back
        </button>
        <strong className="studio-academy-lesson-rail-title">
          {detail?.title ?? "Course"}
        </strong>
      </div>
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
          ) : lessons.length === 0 ? (
            <p className="studio-cn-list-empty">No lessons match</p>
          ) : (
            <ul className="studio-academy-lesson-list">
              {lessons.map((lesson, index) => {
                const active = academy.lessonId === lesson._id;
                return (
                  <li key={lesson._id}>
                    <button
                      type="button"
                      className={`studio-academy-lesson-row${active ? " is-active" : ""}`}
                      onClick={() => academy.setLessonId(lesson._id)}
                    >
                      <span className="studio-academy-lesson-num" aria-hidden="true">
                        {index + 1}
                      </span>
                      <span className="studio-academy-lesson-meta">
                        <strong>{lesson.title}</strong>
                        <small>{lesson.blurb || "Lesson"}</small>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function UnownedOutlineRail({
  courseId,
}: {
  courseId: Id<"academyCourses">;
}) {
  const academy = useStudioAcademyOptional();
  const detail = useQuery(api.academy.getCourse, { courseId });
  if (!academy) return null;

  return (
    <div className="studio-cn-sidebar studio-academy-lesson-rail">
      <div className="studio-academy-lesson-rail-head">
        <button
          type="button"
          className="studio-cn-head-tab"
          onClick={() => academy.backToCatalog()}
        >
          <ArrowLeft aria-hidden="true" />
          Back
        </button>
        <strong className="studio-academy-lesson-rail-title">
          {detail?.title ?? "Course"}
        </strong>
      </div>
      <div className="studio-cn-sidebar-body">
        <div className="studio-cn-rail-scroll public-offers-rail-body">
          <p className="studio-cn-list-empty" style={{ marginBottom: 8 }}>
            Lessons unlock after checkout
          </p>
          <ul className="studio-academy-lesson-list">
            {(detail?.lessons ?? []).map((lesson, index) => (
              <li key={lesson._id}>
                <div className="studio-academy-lesson-row is-locked">
                  <span className="studio-academy-lesson-num" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="studio-academy-lesson-meta">
                    <strong>{lesson.title}</strong>
                    <small>{lesson.blurb}</small>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * Left rail for Academy — catalog filters, or lesson list when a course is open.
 */
export function StudioAcademySidebar() {
  const academy = useStudioAcademyOptional();
  const detail = useQuery(
    api.academy.getCourse,
    academy?.courseId ? { courseId: academy.courseId } : "skip",
  );

  if (!academy) {
    return (
      <div className="studio-cn-sidebar public-offers-rail">
        <div className="public-offers-rail-body" style={{ padding: "10px" }}>
          <p className="studio-cn-list-empty">Open Academy to browse courses</p>
        </div>
      </div>
    );
  }

  if (academy.courseId && detail?.owned) {
    return <OwnedLessonRail courseId={academy.courseId} />;
  }
  if (academy.courseId) {
    return <UnownedOutlineRail courseId={academy.courseId} />;
  }
  return <CatalogFilters />;
}
