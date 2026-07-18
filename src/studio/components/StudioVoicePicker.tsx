"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowDownWideNarrow,
  Bookmark,
  BookmarkCheck,
  Pause,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import {
  AudioPlayerProvider,
  useAudioPlayer,
} from "@/components/ui/audio-player";
import { MediaLoadWave } from "@/studio/components/media-load-frame";
import {
  orbSeedForVoice,
  StudioOrbAvatar,
} from "@/studio/components/StudioOrbPlayButton";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import "./studio-voice-picker.css";

export type StudioVoiceSelection = {
  voiceId: string;
  publicOwnerId: string;
  name: string;
  description?: string;
  previewUrl?: string;
  imageUrl?: string;
  language?: string;
  accent?: string;
  gender?: string;
  age?: string;
  useCase?: string;
  /** ElevenLabs category: premade works on free; professional/copied need paid. */
  category?: string;
};

const SORT_OPTIONS = [
  { value: "trending", label: "Trending" },
  { value: "latest", label: "Latest" },
  { value: "most_users", label: "Most users" },
  { value: "character_usage", label: "Character usage" },
];

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "hi", label: "Hindi" },
];

const ACCENT_OPTIONS = [
  { value: "american", label: "American" },
  { value: "british", label: "British" },
  { value: "australian", label: "Australian" },
  { value: "indian", label: "Indian" },
  { value: "irish", label: "Irish" },
  { value: "scottish", label: "Scottish" },
  { value: "south african", label: "South African" },
];

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "neutral", label: "Neutral" },
];

const AGE_OPTIONS = [
  { value: "young", label: "Young" },
  { value: "middle_aged", label: "Middle aged" },
  { value: "old", label: "Old" },
];

const CATEGORY_OPTIONS = [
  { value: "narration", label: "Narration" },
  { value: "conversational", label: "Conversational" },
  { value: "characters", label: "Characters" },
  { value: "social_media", label: "Social media" },
  { value: "entertainment", label: "Entertainment" },
  { value: "advertisement", label: "Advertisement" },
  { value: "educational", label: "Educational" },
];

type ExploreVoice = StudioVoiceSelection & {
  featured?: boolean;
  clonedByCount?: number;
  category?: string;
};

type FilterKey = "language" | "accent" | "category" | "gender" | "age";
type MenuKey = "sort" | "advanced" | FilterKey | null;

type Props = {
  selectedVoiceId?: string | null;
  onSelect: (voice: StudioVoiceSelection) => void;
  onClose: () => void;
};

function optionLabel(
  options: Array<{ value: string; label: string }>,
  value: string,
): string | null {
  if (!value) return null;
  return options.find((option) => option.value === value)?.label ?? value;
}

function isConnectionBlip(error: unknown): boolean {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /connection lost while action|connection lost/i.test(raw);
}

async function withActionRetries<T>(
  run: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!isConnectionBlip(error) || attempt === attempts - 1) throw error;
      await new Promise((resolve) =>
        window.setTimeout(resolve, 350 * (attempt + 1)),
      );
    }
  }
  throw lastError;
}

export function StudioVoicePicker(props: Props) {
  return (
    <AudioPlayerProvider>
      <StudioVoicePickerInner {...props} />
    </AudioPlayerProvider>
  );
}

function StudioVoicePickerInner({ selectedVoiceId, onSelect, onClose }: Props) {
  const exploreVoices = useAction(api.audioActions.exploreVoices);
  const saveVoice = useMutation(api.savedVoices.save);
  const removeVoice = useMutation(api.savedVoices.remove);
  const savedVoices = useQuery(api.savedVoices.list, {});
  const player = useAudioPlayer();
  const pausePreview = player.pause;

  const [tab, setTab] = useState<"explore" | "mine">("explore");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState("trending");
  const [libraryVoicesAvailable, setLibraryVoicesAvailable] = useState(false);
  const [language, setLanguage] = useState("");
  const [accent, setAccent] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [category, setCategory] = useState("");
  const [minNoticePeriodDays, setMinNoticePeriodDays] = useState<number | null>(null);
  const [includeCustomRates, setIncludeCustomRates] = useState<boolean | null>(null);
  const [includeLiveModerated, setIncludeLiveModerated] = useState<boolean | null>(null);
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [voices, setVoices] = useState<ExploreVoice[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [
    debouncedSearch,
    sort,
    language,
    accent,
    gender,
    age,
    category,
    minNoticePeriodDays,
    includeCustomRates,
    includeLiveModerated,
  ]);

  useEffect(() => {
    if (tab !== "explore") return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    void withActionRetries(() =>
      exploreVoices({
        search: debouncedSearch || undefined,
        sort,
        language: language || undefined,
        accent: accent.trim() || undefined,
        gender: gender || undefined,
        age: age || undefined,
        category: category || undefined,
        page,
        pageSize: 24,
        minNoticePeriodDays: minNoticePeriodDays ?? undefined,
        includeCustomRates: includeCustomRates ?? undefined,
        includeLiveModerated: includeLiveModerated ?? undefined,
      }),
    )
      .then((result) => {
        if (cancelled) return;
        setVoices((prev) => (page === 0 ? result.voices : [...prev, ...result.voices]));
        setHasMore(result.hasMore);
        setLibraryVoicesAvailable(Boolean(result.libraryVoicesAvailable));
        setLoadError(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(true);
        if (page === 0) setVoices([]);
        toast.error("Couldn't load voices. Tap retry.");
        console.error("Studio voice explore failed", error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    tab,
    exploreVoices,
    debouncedSearch,
    sort,
    language,
    accent,
    gender,
    age,
    category,
    page,
    minNoticePeriodDays,
    includeCustomRates,
    includeLiveModerated,
    reloadToken,
  ]);

  useEffect(() => {
    return () => {
      pausePreview();
    };
  }, [pausePreview]);

  useEffect(() => {
    if (!openMenu) return;
    const onDoc = (event: MouseEvent) => {
      if (toolbarRef.current?.contains(event.target as Node)) return;
      setOpenMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  const savedIds = useMemo(
    () => new Set((savedVoices ?? []).map((voice) => voice.voiceId)),
    [savedVoices],
  );

  const mineRows: ExploreVoice[] = useMemo(
    () =>
      (savedVoices ?? []).map((voice) => ({
        voiceId: voice.voiceId,
        publicOwnerId: voice.publicOwnerId,
        name: voice.name,
        description: voice.description,
        previewUrl: voice.previewUrl,
        imageUrl: voice.imageUrl,
        language: voice.language,
        accent: voice.accent,
        gender: voice.gender,
        age: voice.age,
        useCase: voice.useCase,
        category: voice.category,
      })),
    [savedVoices],
  );

  const filteredMine = useMemo(() => {
    const usable = libraryVoicesAvailable
      ? mineRows
      : mineRows.filter(
          (voice) => (voice.category ?? "").trim().toLowerCase() === "premade",
        );
    const q = debouncedSearch.toLowerCase();
    if (!q) return usable;
    return usable.filter(
      (voice) =>
        voice.name.toLowerCase().includes(q) ||
        voice.description?.toLowerCase().includes(q),
    );
  }, [mineRows, debouncedSearch, libraryVoicesAvailable]);

  const rows = tab === "explore" ? voices : filteredMine;
  const advancedActive =
    minNoticePeriodDays != null ||
    includeCustomRates === true ||
    includeLiveModerated === true;

  const filters: Array<{
    key: FilterKey;
    label: string;
    value: string;
    display: string | null;
    options: Array<{ value: string; label: string }>;
    setValue: (next: string) => void;
  }> = [
    {
      key: "language",
      label: "Languages",
      value: language,
      display: optionLabel(LANGUAGE_OPTIONS, language),
      options: LANGUAGE_OPTIONS,
      setValue: setLanguage,
    },
    {
      key: "accent",
      label: "Accent",
      value: accent,
      display: optionLabel(ACCENT_OPTIONS, accent) ?? (accent || null),
      options: ACCENT_OPTIONS,
      setValue: setAccent,
    },
    {
      key: "category",
      label: "Category",
      value: category,
      display: optionLabel(CATEGORY_OPTIONS, category),
      options: CATEGORY_OPTIONS,
      setValue: setCategory,
    },
    {
      key: "gender",
      label: "Gender",
      value: gender,
      display: optionLabel(GENDER_OPTIONS, gender),
      options: GENDER_OPTIONS,
      setValue: setGender,
    },
    {
      key: "age",
      label: "Age",
      value: age,
      display: optionLabel(AGE_OPTIONS, age),
      options: AGE_OPTIONS,
      setValue: setAge,
    },
  ];

  function stopPreview() {
    player.pause();
  }

  function togglePreview(voice: ExploreVoice) {
    if (!voice.previewUrl) {
      toast.error("No preview available for this voice.");
      return;
    }
    if (player.isItemActive(voice.voiceId) && player.isPlaying) {
      player.pause();
      return;
    }
    void player
      .play({
        id: voice.voiceId,
        src: voice.previewUrl,
        data: voice,
      })
      .catch(() => {
        toast.error("Could not play voice preview.");
      });
  }

  async function toggleSave(voice: ExploreVoice) {
    try {
      if (savedIds.has(voice.voiceId)) {
        await removeVoice({ voiceId: voice.voiceId });
        toast.success("Removed from My Voices");
      } else {
        await saveVoice({
          voiceId: voice.voiceId,
          publicOwnerId: voice.publicOwnerId,
          name: voice.name,
          description: voice.description,
          previewUrl: voice.previewUrl,
          imageUrl: voice.imageUrl,
          language: voice.language,
          accent: voice.accent,
          gender: voice.gender,
          age: voice.age,
          useCase: voice.useCase,
          category: voice.category,
        });
        toast.success("Saved to My Voices");
      }
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not update My Voices."));
    }
  }

  return (
    <div className="studio-voice-picker">
      <div className="studio-voice-picker-tabs" role="tablist" aria-label="Voice library">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "explore"}
          className={`studio-voice-picker-tab${tab === "explore" ? " is-active" : ""}`}
          onClick={() => setTab("explore")}
        >
          Explore
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "mine"}
          className={`studio-voice-picker-tab${tab === "mine" ? " is-active" : ""}`}
          onClick={() => setTab("mine")}
        >
          My Voices
        </button>
      </div>

      <div className="studio-voice-picker-toolbar" ref={toolbarRef}>
        <div className="studio-voice-picker-search-row">
          <label className="studio-voice-picker-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Start typing to search..."
            />
            {search ? (
              <button type="button" aria-label="Clear search" onClick={() => setSearch("")}>
                <X size={13} aria-hidden="true" />
              </button>
            ) : null}
          </label>
          {tab === "explore" ? (
            <div className="studio-voice-picker-menu-wrap">
              <button
                type="button"
                className={`studio-voice-picker-icon-square${openMenu === "sort" ? " is-open" : ""}`}
                title="Sort"
                aria-label="Sort voices"
                aria-expanded={openMenu === "sort"}
                onClick={() => setOpenMenu((current) => (current === "sort" ? null : "sort"))}
              >
                <ArrowDownWideNarrow size={15} aria-hidden="true" />
              </button>
              {openMenu === "sort" ? (
                <div className="studio-voice-picker-menu" role="listbox" aria-label="Sort">
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={sort === option.value}
                      className={`studio-voice-picker-menu-item${sort === option.value ? " is-active" : ""}`}
                      onClick={() => {
                        setSort(option.value);
                        setOpenMenu(null);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {tab === "explore" ? (
          <div className="studio-voice-picker-filter-row">
            {filters.map((filter) => {
              const active = Boolean(filter.value);
              const menuOpen = openMenu === filter.key;
              return (
                <div key={filter.key} className="studio-voice-picker-menu-wrap">
                  <button
                    type="button"
                    className={`studio-voice-picker-filter-chip${active ? " is-active" : ""}${menuOpen ? " is-open" : ""}`}
                    aria-expanded={menuOpen}
                    onClick={() =>
                      setOpenMenu((current) => (current === filter.key ? null : filter.key))
                    }
                  >
                    {active ? null : <Plus size={12} aria-hidden="true" />}
                    <span>{filter.display ?? filter.label}</span>
                    {active ? (
                      <span
                        className="studio-voice-picker-filter-clear"
                        role="button"
                        tabIndex={0}
                        aria-label={`Clear ${filter.label}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          filter.setValue("");
                          setOpenMenu(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          event.stopPropagation();
                          filter.setValue("");
                          setOpenMenu(null);
                        }}
                      >
                        <X size={11} aria-hidden="true" />
                      </span>
                    ) : null}
                  </button>
                  {menuOpen ? (
                    <div className="studio-voice-picker-menu" role="listbox" aria-label={filter.label}>
                      {filter.key === "accent" ? (
                        <label className="studio-voice-picker-accent-input">
                          <span>Custom accent</span>
                          <input
                            type="text"
                            value={accent}
                            placeholder="e.g. Caribbean"
                            onChange={(event) => setAccent(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") setOpenMenu(null);
                            }}
                          />
                        </label>
                      ) : null}
                      {filter.options.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={filter.value === option.value}
                          className={`studio-voice-picker-menu-item${filter.value === option.value ? " is-active" : ""}`}
                          onClick={() => {
                            filter.setValue(option.value);
                            setOpenMenu(null);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}

            <div className="studio-voice-picker-menu-wrap">
              <button
                type="button"
                className={`studio-voice-picker-icon-square${openMenu === "advanced" ? " is-open" : ""}${advancedActive ? " is-active" : ""}`}
                title="More filters"
                aria-label="More filters"
                aria-expanded={openMenu === "advanced"}
                onClick={() =>
                  setOpenMenu((current) => (current === "advanced" ? null : "advanced"))
                }
              >
                <SlidersHorizontal size={15} aria-hidden="true" />
              </button>
              {openMenu === "advanced" ? (
                <div className="studio-voice-picker-menu is-advanced" role="dialog" aria-label="More filters">
                  <label className="studio-voice-picker-advanced-field">
                    <span>Notice period (days)</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="Any"
                      value={minNoticePeriodDays ?? ""}
                      onChange={(event) => {
                        const raw = event.target.value;
                        setMinNoticePeriodDays(raw === "" ? null : Number(raw));
                      }}
                    />
                  </label>
                  <label className="studio-voice-picker-check">
                    <input
                      type="checkbox"
                      checked={includeCustomRates === true}
                      onChange={(event) =>
                        setIncludeCustomRates(event.target.checked ? true : null)
                      }
                    />
                    <span>Include custom rates</span>
                  </label>
                  <label className="studio-voice-picker-check">
                    <input
                      type="checkbox"
                      checked={includeLiveModerated === true}
                      onChange={(event) =>
                        setIncludeLiveModerated(event.target.checked ? true : null)
                      }
                    />
                    <span>Include live moderation</span>
                  </label>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="studio-voice-picker-list" role="listbox" aria-label="Voices">
        {loading && page === 0 ? (
          <div className="studio-voice-picker-empty is-loading" role="status" aria-label="Loading voices">
            <MediaLoadWave size="md" />
          </div>
        ) : null}
        {!loading && loadError && tab === "explore" && !rows.length ? (
          <div className="studio-voice-picker-empty">
            <span>Couldn&apos;t load voices.</span>
            <button
              type="button"
              className="studio-voice-picker-more"
              onClick={() => setReloadToken((value) => value + 1)}
            >
              Retry
            </button>
          </div>
        ) : null}
        {!loading && !loadError && !rows.length ? (
          <div className="studio-voice-picker-empty">
            {tab === "mine"
              ? "No saved voices yet. Explore and bookmark one."
              : "No voices match these filters."}
          </div>
        ) : null}
        {rows.map((voice) => {
          const active = selectedVoiceId === voice.voiceId;
          const saved = savedIds.has(voice.voiceId);
          const playing = player.isItemActive(voice.voiceId) && player.isPlaying;
          return (
            <div
              key={`${voice.voiceId}-${voice.publicOwnerId}`}
              className={`studio-voice-picker-row${active ? " is-selected" : ""}`}
              role="option"
              aria-selected={active}
            >
              <button
                type="button"
                className="studio-voice-picker-row-main"
                onClick={() => {
                  onSelect(voice);
                  stopPreview();
                  onClose();
                }}
              >
                <span
                  className="studio-voice-picker-avatar"
                  aria-hidden="true"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    togglePreview(voice);
                  }}
                >
                  <StudioOrbAvatar
                    playing={playing}
                    seed={orbSeedForVoice(voice.voiceId, voice.name)}
                  />
                </span>
                <span className="studio-voice-picker-meta">
                  <strong>{voice.name}</strong>
                  <span>
                    {[voice.language, voice.accent, voice.gender, voice.useCase]
                      .filter(Boolean)
                      .join(" · ") || voice.description || "Voice"}
                  </span>
                </span>
              </button>
              <div className="studio-voice-picker-row-actions">
                <button
                  type="button"
                  className="studio-voice-picker-icon-btn"
                  title={playing ? "Pause preview" : "Play preview"}
                  aria-label={playing ? "Pause preview" : "Play preview"}
                  onClick={() => togglePreview(voice)}
                >
                  {playing ? (
                    <Pause size={14} fill="currentColor" strokeWidth={0} />
                  ) : (
                    <Play size={14} fill="currentColor" strokeWidth={0} />
                  )}
                </button>
                <button
                  type="button"
                  className={`studio-voice-picker-icon-btn${saved ? " is-saved" : ""}`}
                  title={saved ? "Remove from My Voices" : "Save to My Voices"}
                  aria-label={saved ? "Remove from My Voices" : "Save to My Voices"}
                  onClick={() => void toggleSave(voice)}
                >
                  {saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                </button>
              </div>
            </div>
          );
        })}
        {tab === "explore" && hasMore ? (
          <button
            type="button"
            className="studio-voice-picker-more"
            disabled={loading}
            onClick={() => setPage((value) => value + 1)}
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
