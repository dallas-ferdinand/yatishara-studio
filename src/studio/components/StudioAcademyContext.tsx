"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { DEFAULT_CREDIT_PRICE_CENTS } from "@/studio/lib/money";

export type AcademySortKey = "newest" | "price-asc" | "price-desc";
export type AcademyOwnershipFilter = "all" | "owned" | "not_owned";

export const ACADEMY_PRICE_PRESETS = [
  { label: "Under $50", min: "", max: "50" },
  { label: "$50 – $100", min: "50", max: "100" },
  { label: "$100 – $250", min: "100", max: "250" },
  { label: "$250 – $500", min: "250", max: "500" },
  { label: "$500+", min: "500", max: "" },
] as const;

export type AcademyCatalogCourse = {
  _id: Id<"academyCourses">;
  title: string;
  slug: string;
  blurb: string;
  priceCredits: number;
  coverUrl?: string;
  owned: boolean;
  lessonCount: number;
  sortOrder: number;
  updatedAt: number;
};

export type AcademyLessonSummary = {
  _id: Id<"academyLessons">;
  title: string;
  slug: string;
  blurb: string;
  descriptionMarkdown: string;
  coverUrl?: string;
  hasVideo: boolean;
  sortOrder: number;
  status: "draft" | "published";
};

type AcademyContextValue = {
  listTab: "catalog" | "mine";
  setListTab: (tab: "catalog" | "mine") => void;
  courseId: Id<"academyCourses"> | null;
  setCourseId: (id: Id<"academyCourses"> | null) => void;
  lessonId: Id<"academyLessons"> | null;
  setLessonId: (id: Id<"academyLessons"> | null) => void;
  search: string;
  setSearch: (value: string) => void;
  lessonSearch: string;
  setLessonSearch: (value: string) => void;
  priceMin: string;
  priceMax: string;
  setPriceMin: (value: string) => void;
  setPriceMax: (value: string) => void;
  setPriceRange: (min: string, max: string) => void;
  ownership: AcademyOwnershipFilter;
  setOwnership: (value: AcademyOwnershipFilter) => void;
  sort: AcademySortKey;
  setSort: (value: AcademySortKey) => void;
  clearFilters: () => void;
  hasFilters: boolean;
  creditPriceCents: number;
  openCourse: (id: Id<"academyCourses">) => void;
  backToCatalog: () => void;
  filterCourses: (courses: AcademyCatalogCourse[]) => AcademyCatalogCourse[];
  filterLessons: <T extends { title: string; blurb?: string; descriptionMarkdown?: string }>(
    lessons: T[],
  ) => T[];
};

const AcademyContext = createContext<AcademyContextValue | null>(null);

function parsePriceToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const dollars = Number(cleaned);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

function coursePriceCents(
  priceCredits: number,
  creditPriceCents: number,
): number {
  return Math.round(priceCredits * creditPriceCents);
}

export function StudioAcademyProvider({
  children,
  creditPriceCents = DEFAULT_CREDIT_PRICE_CENTS,
  initialCourseId = null,
  onNavigateCourse,
  onNavigateCatalog,
}: {
  children: ReactNode;
  creditPriceCents?: number;
  initialCourseId?: string | null;
  onNavigateCourse?: (courseId: string) => void;
  onNavigateCatalog?: () => void;
}) {
  const [listTab, setListTab] = useState<"catalog" | "mine">("catalog");
  const [courseId, setCourseId] = useState<Id<"academyCourses"> | null>(
    (initialCourseId as Id<"academyCourses">) || null,
  );
  const [lessonId, setLessonId] = useState<Id<"academyLessons"> | null>(null);

  useEffect(() => {
    if (initialCourseId) {
      setCourseId(initialCourseId as Id<"academyCourses">);
      setLessonId(null);
    }
  }, [initialCourseId]);
  const [search, setSearch] = useState("");
  const [lessonSearch, setLessonSearch] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [ownership, setOwnership] =
    useState<AcademyOwnershipFilter>("all");
  const [sort, setSort] = useState<AcademySortKey>("newest");

  const setPriceRange = useCallback((min: string, max: string) => {
    setPriceMin(min);
    setPriceMax(max);
  }, []);

  const clearFilters = useCallback(() => {
    setSearch("");
    setPriceMin("");
    setPriceMax("");
    setOwnership("all");
    setSort("newest");
  }, []);

  const hasFilters = Boolean(
    search.trim() ||
      priceMin.trim() ||
      priceMax.trim() ||
      ownership !== "all" ||
      sort !== "newest",
  );

  const openCourse = useCallback(
    (id: Id<"academyCourses">) => {
      setCourseId(id);
      setLessonId(null);
      setLessonSearch("");
      onNavigateCourse?.(id);
    },
    [onNavigateCourse],
  );

  const backToCatalog = useCallback(() => {
    setCourseId(null);
    setLessonId(null);
    setLessonSearch("");
    onNavigateCatalog?.();
  }, [onNavigateCatalog]);

  const filterCourses = useCallback(
    (courses: AcademyCatalogCourse[]) => {
      const q = search.trim().toLowerCase();
      const minCents = parsePriceToCents(priceMin);
      const maxCents = parsePriceToCents(priceMax);
      let rows = courses.filter((course) => {
        if (listTab === "mine" && !course.owned) return false;
        if (ownership === "owned" && !course.owned) return false;
        if (ownership === "not_owned" && course.owned) return false;
        if (q) {
          const hay = `${course.title} ${course.blurb}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        const cents = coursePriceCents(course.priceCredits, creditPriceCents);
        if (minCents != null && cents < minCents) return false;
        if (maxCents != null && cents > maxCents) return false;
        return true;
      });
      rows = [...rows].sort((a, b) => {
        if (sort === "price-asc") {
          return (
            coursePriceCents(a.priceCredits, creditPriceCents) -
            coursePriceCents(b.priceCredits, creditPriceCents)
          );
        }
        if (sort === "price-desc") {
          return (
            coursePriceCents(b.priceCredits, creditPriceCents) -
            coursePriceCents(a.priceCredits, creditPriceCents)
          );
        }
        return b.updatedAt - a.updatedAt || a.sortOrder - b.sortOrder;
      });
      return rows;
    },
    [
      search,
      priceMin,
      priceMax,
      ownership,
      sort,
      listTab,
      creditPriceCents,
    ],
  );

  const filterLessons = useCallback(
    <T extends { title: string; blurb?: string; descriptionMarkdown?: string }>(
      lessons: T[],
    ) => {
      const q = lessonSearch.trim().toLowerCase();
      if (!q) return lessons;
      return lessons.filter((lesson) => {
        const hay =
          `${lesson.title} ${lesson.blurb ?? ""} ${lesson.descriptionMarkdown ?? ""}`.toLowerCase();
        return hay.includes(q);
      });
    },
    [lessonSearch],
  );

  const value = useMemo<AcademyContextValue>(
    () => ({
      listTab,
      setListTab,
      courseId,
      setCourseId,
      lessonId,
      setLessonId,
      search,
      setSearch,
      lessonSearch,
      setLessonSearch,
      priceMin,
      priceMax,
      setPriceMin,
      setPriceMax,
      setPriceRange,
      ownership,
      setOwnership,
      sort,
      setSort,
      clearFilters,
      hasFilters,
      creditPriceCents,
      openCourse,
      backToCatalog,
      filterCourses,
      filterLessons,
    }),
    [
      listTab,
      courseId,
      lessonId,
      search,
      lessonSearch,
      priceMin,
      priceMax,
      setPriceRange,
      ownership,
      sort,
      clearFilters,
      hasFilters,
      creditPriceCents,
      openCourse,
      backToCatalog,
      filterCourses,
      filterLessons,
    ],
  );

  return (
    <AcademyContext.Provider value={value}>{children}</AcademyContext.Provider>
  );
}

export function useStudioAcademy() {
  const ctx = useContext(AcademyContext);
  if (!ctx) {
    throw new Error("useStudioAcademy must be used within StudioAcademyProvider");
  }
  return ctx;
}

/** Safe for shell left rail when Academy tab is inactive. */
export function useStudioAcademyOptional() {
  return useContext(AcademyContext);
}
