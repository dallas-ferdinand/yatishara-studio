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
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useStickySignedUrlExpiry } from "@/studio/lib/signedUrlExpiry";
import { STUDIO_START_SELLER_APPLY_KEY } from "@/studio/lib/studio-default-tab";

export type CreativeNetworkMode =
  | "network"
  | "my-offers"
  | "my-jobs"
  | "my-assets"
  | "seller-apply";

export type NetworkSortKey = "newest" | "price-asc" | "price-desc" | "fastest";

type OptionFilterDef = {
  id: string;
  label: string;
  anyValue: string;
  anyLabel: string;
  visibleLimit?: number;
  getOptions: (
    offers: Array<{ category?: string | null; deliveryDays: number }>,
  ) => Array<{ value: string; label: string }>;
  matches: (
    offer: { category?: string | null; deliveryDays: number; priceCents: number },
    value: string,
  ) => boolean;
};

export const NETWORK_OPTION_FILTERS: OptionFilterDef[] = [
  {
    id: "category",
    label: "Category",
    anyValue: "all",
    anyLabel: "All categories",
    visibleLimit: 7,
    getOptions: (offers) => {
      const names = new Set<string>();
      for (const offer of offers) {
        const key = offer.category?.trim();
        if (key) names.add(key);
      }
      return [...names]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ value: name, label: name }));
    },
    matches: (offer, value) => offer.category?.trim() === value,
  },
  {
    id: "delivery",
    label: "Delivery time",
    anyValue: "any",
    anyLabel: "Any timeline",
    getOptions: () => [
      { value: "1", label: "Up to 24 hours" },
      { value: "3", label: "Up to 3 days" },
      { value: "7", label: "Up to 7 days" },
      { value: "14", label: "Up to 14 days" },
    ],
    matches: (offer, value) => offer.deliveryDays <= Number(value),
  },
];

export const NETWORK_PRICE_PRESETS = [
  { label: "Under $50", min: "", max: "50" },
  { label: "$50 – $100", min: "50", max: "100" },
  { label: "$100 – $250", min: "100", max: "250" },
  { label: "$250 – $500", min: "250", max: "500" },
  { label: "$500 – $1k", min: "500", max: "1000" },
  { label: "$1k – $2.5k", min: "1000", max: "2500" },
  { label: "$2.5k – $5k", min: "2500", max: "5000" },
  { label: "$5k+", min: "5000", max: "" },
] as const;

const SORT_COMPARATORS: Record<
  NetworkSortKey,
  (a: { publishedAt?: number | null; priceCents: number; deliveryDays: number }, b: typeof a) => number
> = {
  newest: (a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0),
  "price-asc": (a, b) => a.priceCents - b.priceCents,
  "price-desc": (a, b) => b.priceCents - a.priceCents,
  fastest: (a, b) => a.deliveryDays - b.deliveryDays,
};

function parsePriceToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const dollars = Number(cleaned);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

export function networkPriceChipLabel(min: string, max: string): string | null {
  const hasMin = parsePriceToCents(min) !== null;
  const hasMax = parsePriceToCents(max) !== null;
  if (hasMin && hasMax) return `$${min} – $${max}`;
  if (hasMin) return `From $${min}`;
  if (hasMax) return `Up to $${max}`;
  return null;
}

/** Mirror of SellerAccessApplicationForm draft key — keep in sync. */
export const SELLER_ACCESS_DRAFT_KEY = "yatishara.sellerAccess.draft.v3";

export function sellerAccessDraftHasProgress(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(SELLER_ACCESS_DRAFT_KEY);
    if (!raw) return false;
    const draft = JSON.parse(raw) as {
      v?: number;
      stepIndex?: number;
      legalName?: string;
      phone?: string;
      businessName?: string;
      homeAddress?: { street?: string; town?: string };
      idKind1?: string | null;
      idKind2?: string | null;
      docs?: Record<string, unknown>;
    };
    if (draft?.v !== 3) return false;
    if ((draft.stepIndex ?? 0) > 0) return true;
    if (draft.legalName?.trim() || draft.phone?.trim() || draft.businessName?.trim()) {
      return true;
    }
    if (draft.homeAddress?.street?.trim() || draft.homeAddress?.town?.trim()) {
      return true;
    }
    if (draft.idKind1 || draft.idKind2) return true;
    if (draft.docs && Object.values(draft.docs).some(Boolean)) return true;
    return false;
  } catch {
    return false;
  }
}

type CreativeNetworkContextValue = {
  mode: CreativeNetworkMode;
  setMode: (mode: CreativeNetworkMode) => void;
  isSellerApproved: boolean;
  sellerPending: boolean;
  sellerLoading: boolean;
  hasSellerDraft: boolean;
  refreshSellerDraft: () => void;
  selectedOfferId: Id<"marketplaceOffers"> | null;
  setSelectedOfferId: (id: Id<"marketplaceOffers"> | null) => void;
  selectedJobId: Id<"marketplaceJobs"> | null;
  setSelectedJobId: (id: Id<"marketplaceJobs"> | null) => void;
  browseSlug: string | null;
  setBrowseSlug: (slug: string | null) => void;
  search: string;
  setSearch: (value: string) => void;
  optionValues: Record<string, string>;
  setValueFor: (id: string, value: string) => void;
  valueFor: (def: OptionFilterDef) => string;
  priceMin: string;
  setPriceMin: (value: string) => void;
  priceMax: string;
  setPriceMax: (value: string) => void;
  sort: NetworkSortKey;
  setSort: (value: NetworkSortKey) => void;
  closedSections: Record<string, boolean>;
  toggleSection: (id: string) => void;
  expandedSections: Record<string, boolean>;
  setExpandedSections: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  offers: Array<Record<string, unknown>> | undefined;
  filtered: Array<Record<string, unknown>> | undefined;
  facets: Map<string, Map<string, number>> | null;
  hasFilters: boolean;
  clearFilters: () => void;
  activeChips: Array<{ key: string; label: string; clear: () => void }>;
  sellerUsernameFilter: string | null;
};

const CreativeNetworkContext = createContext<CreativeNetworkContextValue | null>(
  null,
);

export function StudioCreativeNetworkProvider({
  children,
  initialSlug = null,
  initialSellerUsername = null,
  onInitialSlugConsumed,
  onInitialSellerConsumed,
}: {
  children: ReactNode;
  initialSlug?: string | null;
  initialSellerUsername?: string | null;
  onInitialSlugConsumed?: () => void;
  onInitialSellerConsumed?: () => void;
}) {
  const seller = useQuery(api.marketplace.getMySellerStatus);
  const mediaExpiresUnix = useStickySignedUrlExpiry();
  const [sellerUsernameFilter, setSellerUsernameFilter] = useState<string | null>(
    initialSellerUsername,
  );
  const allOffers = useQuery(
    api.marketplace.listPublicOffers,
    sellerUsernameFilter ? "skip" : { expiresUnix: mediaExpiresUnix },
  );
  const sellerOffers = useQuery(
    api.marketplace.listPublicOffersByUsername,
    sellerUsernameFilter
      ? { username: sellerUsernameFilter, expiresUnix: mediaExpiresUnix }
      : "skip",
  );
  const offers = sellerUsernameFilter ? sellerOffers : allOffers;

  const [mode, setModeState] = useState<CreativeNetworkMode>("network");
  const [selectedOfferId, setSelectedOfferId] =
    useState<Id<"marketplaceOffers"> | null>(null);
  const [selectedJobId, setSelectedJobId] =
    useState<Id<"marketplaceJobs"> | null>(null);
  const [browseSlug, setBrowseSlug] = useState<string | null>(initialSlug);
  const [search, setSearch] = useState("");
  const [optionValues, setOptionValues] = useState<Record<string, string>>({});
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sort, setSort] = useState<NetworkSortKey>("newest");
  const [closedSections, setClosedSections] = useState<Record<string, boolean>>(
    {},
  );
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({});
  const [hasSellerDraft, setHasSellerDraft] = useState(false);

  const refreshSellerDraft = useCallback(() => {
    setHasSellerDraft(sellerAccessDraftHasProgress());
  }, []);

  useEffect(() => {
    refreshSellerDraft();
  }, [refreshSellerDraft, mode]);

  useEffect(() => {
    if (!initialSlug) return;
    setBrowseSlug(initialSlug);
    setModeState("network");
    onInitialSlugConsumed?.();
  }, [initialSlug, onInitialSlugConsumed]);

  useEffect(() => {
    if (!initialSellerUsername) return;
    setSellerUsernameFilter(initialSellerUsername);
    setModeState("network");
    onInitialSellerConsumed?.();
  }, [initialSellerUsername, onInitialSellerConsumed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(STUDIO_START_SELLER_APPLY_KEY) !== "1") {
        return;
      }
      window.localStorage.removeItem(STUDIO_START_SELLER_APPLY_KEY);
      setModeState("seller-apply");
    } catch {
      /* ignore */
    }
  }, []);

  const isSellerApproved = seller?.status === "approved";
  const sellerPending = seller?.status === "pending";
  const sellerLoading = seller === undefined;

  const setMode = useCallback(
    (next: CreativeNetworkMode) => {
      if (
        (next === "my-offers" || next === "my-jobs" || next === "my-assets") &&
        !isSellerApproved
      ) {
        setModeState("seller-apply");
        return;
      }
      setModeState(next);
      if (next === "network") {
        setSelectedOfferId(null);
        setSelectedJobId(null);
      }
      if (next === "my-offers" || next === "my-assets") setSelectedJobId(null);
      if (next === "my-jobs" || next === "my-assets") setSelectedOfferId(null);
      if (next !== "network") setBrowseSlug(null);
    },
    [isSellerApproved],
  );

  const valueFor = useCallback(
    (def: OptionFilterDef) => optionValues[def.id] ?? def.anyValue,
    [optionValues],
  );
  const setValueFor = useCallback((id: string, value: string) => {
    setOptionValues((prev) => ({ ...prev, [id]: value }));
  }, []);
  const toggleSection = useCallback((id: string) => {
    setClosedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const query = search.trim().toLowerCase();
  const minCents = parsePriceToCents(priceMin);
  const maxCents = parsePriceToCents(priceMax);

  const baseMatch = useMemo(() => {
    return (offer: {
      priceCents: number;
      title: string;
      description: string;
      sellerBusinessName: string;
      sellerUsername?: string | null;
      category?: string | null;
    }) => {
      if (minCents !== null && offer.priceCents < minCents) return false;
      if (maxCents !== null && offer.priceCents > maxCents) return false;
      if (query) {
        const haystack = [
          offer.title,
          offer.description,
          offer.sellerBusinessName,
          offer.sellerUsername ?? "",
          offer.category ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    };
  }, [query, minCents, maxCents]);

  const facets = useMemo(() => {
    if (!offers) return null;
    const base = offers.filter(baseMatch);
    const result = new Map<string, Map<string, number>>();
    for (const def of NETWORK_OPTION_FILTERS) {
      const others = NETWORK_OPTION_FILTERS.filter((d) => d.id !== def.id);
      const pool = base.filter((offer) =>
        others.every((d) => {
          const value = optionValues[d.id] ?? d.anyValue;
          return value === d.anyValue || d.matches(offer, value);
        }),
      );
      const counts = new Map<string, number>();
      counts.set(def.anyValue, pool.length);
      for (const option of def.getOptions(offers)) {
        counts.set(
          option.value,
          pool.filter((offer) => def.matches(offer, option.value)).length,
        );
      }
      result.set(def.id, counts);
    }
    return result;
  }, [offers, baseMatch, optionValues]);

  const filtered = useMemo(() => {
    if (!offers) return undefined;
    const list = offers.filter(
      (offer) =>
        baseMatch(offer) &&
        NETWORK_OPTION_FILTERS.every((def) => {
          const value = optionValues[def.id] ?? def.anyValue;
          return value === def.anyValue || def.matches(offer, value);
        }),
    );
    return [...list].sort(SORT_COMPARATORS[sort]);
  }, [offers, baseMatch, optionValues, sort]);

  const clearFilters = useCallback(() => {
    setSearch("");
    setPriceMin("");
    setPriceMax("");
    setOptionValues({});
    setSellerUsernameFilter(null);
  }, []);

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (sellerUsernameFilter) {
      chips.push({
        key: "seller",
        label: `@${sellerUsernameFilter}`,
        clear: () => setSellerUsernameFilter(null),
      });
    }
    if (search.trim()) {
      chips.push({
        key: "search",
        label: `“${search.trim()}”`,
        clear: () => setSearch(""),
      });
    }
    const priceLabel = networkPriceChipLabel(priceMin, priceMax);
    if (priceLabel) {
      chips.push({
        key: "price",
        label: priceLabel,
        clear: () => {
          setPriceMin("");
          setPriceMax("");
        },
      });
    }
    for (const def of NETWORK_OPTION_FILTERS) {
      const value = optionValues[def.id] ?? def.anyValue;
      if (value === def.anyValue) continue;
      const label =
        def.getOptions(offers ?? []).find((opt) => opt.value === value)
          ?.label ?? value;
      chips.push({
        key: def.id,
        label,
        clear: () => setValueFor(def.id, def.anyValue),
      });
    }
    return chips;
  }, [
    sellerUsernameFilter,
    search,
    priceMin,
    priceMax,
    optionValues,
    offers,
    setValueFor,
  ]);

  const value = useMemo<CreativeNetworkContextValue>(
    () => ({
      mode,
      setMode,
      isSellerApproved,
      sellerPending,
      sellerLoading,
      hasSellerDraft,
      refreshSellerDraft,
      selectedOfferId,
      setSelectedOfferId,
      selectedJobId,
      setSelectedJobId,
      browseSlug,
      setBrowseSlug,
      search,
      setSearch,
      optionValues,
      setValueFor,
      valueFor,
      priceMin,
      setPriceMin,
      priceMax,
      setPriceMax,
      sort,
      setSort,
      closedSections,
      toggleSection,
      expandedSections,
      setExpandedSections,
      offers: offers as Array<Record<string, unknown>> | undefined,
      filtered: filtered as Array<Record<string, unknown>> | undefined,
      facets,
      hasFilters: activeChips.length > 0,
      clearFilters,
      activeChips,
      sellerUsernameFilter,
    }),
    [
      mode,
      setMode,
      isSellerApproved,
      sellerPending,
      sellerLoading,
      hasSellerDraft,
      refreshSellerDraft,
      selectedOfferId,
      selectedJobId,
      browseSlug,
      sellerUsernameFilter,
      search,
      optionValues,
      setValueFor,
      valueFor,
      priceMin,
      priceMax,
      sort,
      closedSections,
      toggleSection,
      expandedSections,
      offers,
      filtered,
      facets,
      activeChips,
      clearFilters,
    ],
  );

  return (
    <CreativeNetworkContext.Provider value={value}>
      {children}
    </CreativeNetworkContext.Provider>
  );
}

export function useCreativeNetwork() {
  const ctx = useContext(CreativeNetworkContext);
  if (!ctx) {
    throw new Error(
      "useCreativeNetwork must be used within StudioCreativeNetworkProvider",
    );
  }
  return ctx;
}

export function useCreativeNetworkOptional() {
  return useContext(CreativeNetworkContext);
}
