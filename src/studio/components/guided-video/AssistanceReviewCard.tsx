"use client";

import { useState } from "react";
import { ChatAssistAvatar, ChatMessageRow } from "./ChatMessageAvatars";

type BriefPayload = {
  subject?: string;
  objective?: string;
  audience?: string;
  keyMessage?: string;
  offer?: string;
  platform?: string;
  hook?: string;
  setting?: string;
  visualDirection?: string;
  notes?: string;
  brand?: {
    productFidelity?: string;
    logo?: string;
    ctaMode?: string;
    ctaText?: string;
    contactValue?: string;
    offerText?: string;
  };
  audio?: {
    voiceover?: string;
    sfx?: string;
    music?: string;
    voiceoverCopy?: string;
    musicMood?: string;
    sfxNotes?: string;
  };
  production?: {
    durationSeconds?: number;
    aspectRatio?: string;
    resolution?: string;
    quality?: string;
    styleSheetElementId?: string;
    referenceIntent?: string;
    scriptType?: string;
    elementType?: string;
    skipPromptEnhancement?: boolean;
  };
  timedBeats?: Array<{ startSec: number; endSec: number; action: string; camera?: string }>;
};

export type ReviewReference = {
  role: string;
  label: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  kind?: string;
};

type Props = {
  mode?: "image" | "video" | "script" | "element";
  videoType?: string;
  status?: string;
  message?: string;
  payload: BriefPayload;
  warnings?: string[];
  estimatedCredits?: number;
  creditPriceLabel?: string;
  styleSheetLabel?: string;
  referenceSummary?: string[];
  references?: ReviewReference[];
  generationError?: string;
  readOnly?: boolean;
  busy?: boolean;
  onApprove?: () => Promise<void> | void;
};

function displayValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value == null || value === "") return "—";
  return String(value);
}

function roleLabel(role: string) {
  const map: Record<string, string> = {
    product: "Product",
    logo: "Logo",
    style: "Style",
    reference: "Reference",
    supporting: "Reference",
    start_frame: "Start frame",
  };
  return map[role] ?? role.replace(/_/g, " ");
}

export function AssistanceReviewCard({
  mode = "video",
  videoType,
  status,
  payload,
  warnings = [],
  estimatedCredits,
  creditPriceLabel,
  styleSheetLabel,
  referenceSummary = [],
  references = [],
  generationError,
  readOnly,
  busy,
  onApprove,
}: Props) {
  const [error, setError] = useState("");

  async function approve() {
    if (!onApprove) return;
    setError("");
    try {
      await onApprove();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start generation.");
    }
  }

  const productionRows = (
    mode === "video"
      ? [
          [
            "Duration",
            payload.production?.durationSeconds
              ? `${payload.production.durationSeconds}s`
              : undefined,
          ],
          ["Format", payload.production?.aspectRatio],
          ["Resolution", payload.production?.resolution],
        ]
      : mode === "image"
        ? [
            ["Format", payload.production?.aspectRatio],
            ["Resolution", payload.production?.resolution],
            ["Quality", payload.production?.quality],
          ]
        : mode === "script"
          ? [["Script type", payload.production?.scriptType]]
          : [["Element type", payload.production?.elementType]]
  ).filter(([, value]) => value != null && value !== "");

  const summaryRows = [
    ["Offer", payload.offer || payload.brand?.offerText],
    ["Message", payload.keyMessage],
    ["Look", payload.visualDirection],
    [
      payload.brand?.ctaMode === "contact" ? "Contact" : "Action",
      payload.brand?.contactValue || payload.brand?.ctaText,
    ],
  ].filter(
    ([, value], index, rows) =>
      typeof value === "string" &&
      value.trim().length > 0 &&
      rows.findIndex(([, candidate]) => candidate === value) === index,
  );
  const hasStyleSheet = Boolean(styleSheetLabel && styleSheetLabel !== "None");
  const visualRefs = references.filter(
    (ref) => ref.thumbnailUrl || ref.mediaUrl || ref.label,
  );
  const modeTitle =
    mode === "image"
      ? "Image"
      : mode === "video"
        ? videoType === "hypermotion_ad"
          ? "Hypermotion video"
          : "Video"
        : mode === "script"
          ? "Script"
          : "Element";
  const headline =
    payload.subject?.trim() ||
    payload.offer?.trim() ||
    payload.keyMessage?.trim() ||
    `Ready to create your ${modeTitle.toLowerCase()}`;

  return (
    <ChatMessageRow role="assistant" avatar={<ChatAssistAvatar />}>
    <article className="studio-assist-card studio-assist-review-card" aria-live="polite">
      <header className="studio-assist-review-hero">
        <p className="studio-chat-kicker">Ready to create</p>
        <h3 className="studio-assist-review-title">{headline}</h3>
      </header>

      {visualRefs.length || hasStyleSheet ? (
        <section className="studio-assist-review-section studio-assist-review-visuals">
          <p className="studio-assist-section-label">
            {visualRefs.length
              ? `${visualRefs.length} visual ${visualRefs.length === 1 ? "reference" : "references"}`
              : "Style"}
          </p>
          {visualRefs.length ? (
            <ul className="studio-assist-ref-grid">
              {visualRefs.map((ref, index) => {
                const thumb = ref.thumbnailUrl || ref.mediaUrl;
                const key = `${ref.role}-${ref.label}-${index}`;
                return (
                  <li key={key} className="studio-assist-ref-tile">
                    <div className="studio-assist-ref-media">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" loading="lazy" />
                      ) : (
                        <span className="studio-assist-ref-fallback" aria-hidden="true">
                          {roleLabel(ref.role).slice(0, 1)}
                        </span>
                      )}
                    </div>
                    <div className="studio-assist-ref-meta">
                      <span className="studio-assist-ref-role">{roleLabel(ref.role)}</span>
                      <span className="studio-assist-ref-name" title={ref.label}>
                        {ref.label}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {hasStyleSheet ? (
            <p className="studio-assist-style-pill">Style sheet · {styleSheetLabel}</p>
          ) : null}
          {!visualRefs.length && referenceSummary.length ? (
            <p className="studio-assist-ref-fallback-text">{referenceSummary.join(" · ")}</p>
          ) : null}
        </section>
      ) : null}

      {summaryRows.length ? (
        <section className="studio-assist-review-section">
          <dl className="studio-assist-review-summary">
            {summaryRows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{displayValue(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {productionRows.length ? (
        <section className="studio-assist-review-section">
          <p className="studio-assist-section-label">Settings</p>
          <div className="studio-assist-settings-chips">
            {productionRows.map(([label, value]) => (
              <span key={String(label)} className="studio-assist-setting-chip">
                <em>{label}</em>
                {displayValue(value)}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {warnings.length ? (
        <div className="studio-assist-notes is-warn">
          <p className="studio-assist-section-label">Warnings</p>
          <ul>
            {warnings.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <footer className="studio-assist-review-footer">
        {generationError || error ? (
          <p className="studio-assist-card-error" role="alert">
            {generationError || error}
          </p>
        ) : null}

        {!readOnly ? (
          <div className="studio-assist-card-actions">
            <button
              type="button"
              className="studio-generate-btn studio-assist-primary-btn studio-assist-generate-btn"
              disabled={busy || !onApprove}
              onClick={() => void approve()}
            >
              <span className="studio-assist-generate-label">
                {busy ? "Starting…" : "Generate"}
              </span>
              <span className="studio-assist-generate-cost">
                {creditPriceLabel ??
                  (estimatedCredits != null ? `${estimatedCredits} credits` : "Review approved")}
              </span>
            </button>
          </div>
        ) : (
          <p className="studio-assist-locked-note">
            {status === "done"
              ? mode === "script"
                ? "Script ready — opened in Studio."
                : mode === "element"
                  ? "Element ready — opened in Studio."
                  : "Generation complete."
              : status === "failed"
                ? "Generation failed. Review the error above."
                : status === "generating"
                  ? `${modeTitle} generation is in progress.`
                  : status === "approved"
                    ? `${modeTitle} generation is approved and starting.`
                    : "Earlier review — the latest confirmation appears below."}
          </p>
        )}
      </footer>
    </article>
    </ChatMessageRow>
  );
}
