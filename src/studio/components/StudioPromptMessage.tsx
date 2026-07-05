// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef } from "react";
import { Film, Folder, Image as ImageIcon, Music, Sparkles, FileText } from "lucide-react";
import { enhanceMarkdown, renderMarkdownFragment } from "@/desk/lib/markdown-desk.js";
import {
  composerTokenIconKind,
  parseStudioPrompt,
  resolveStudioPromptRefPreview,
} from "@/studio/lib/studio-prompt-display.js";

const ICONS = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  folder: Folder,
  sparkles: Sparkles,
  file: FileText,
};

function StudioChatChip({ refItem, label, title, preview }) {
  const displayLabel = label ?? refItem?.label ?? "Reference";
  const iconKey = composerTokenIconKind({
    ...refItem,
    kind: preview?.kind ?? refItem?.kind,
    elementType: preview?.elementType ?? refItem?.elementType,
  });
  const Icon = ICONS[iconKey] ?? FileText;
  const thumb = preview?.thumbnailUrl;
  const isElement = Boolean(refItem?.elementType || preview?.elementType);
  const mediaKind = String(preview?.kind ?? refItem?.kind ?? "").toLowerCase();
  const imageOnly =
    Boolean(thumb) &&
    (isElement || mediaKind === "image" || mediaKind === "video");

  if (imageOnly) {
    return (
      <span
        className="studio-chat-chip studio-chat-chip--image-only"
        title={title ?? displayLabel}
      >
        <span className="studio-chat-chip-media-wrap">
          {mediaKind === "video" && !isElement ? (
            <video
              className="studio-chat-chip-media"
              src={preview?.mediaUrl ?? thumb}
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            <img className="studio-chat-chip-media" src={thumb} alt="" loading="lazy" />
          )}
        </span>
        <span className="studio-chat-chip-overlay" aria-hidden="true">
          <Icon className="studio-chat-chip-icon" />
        </span>
      </span>
    );
  }

  return (
    <span className={`studio-chat-chip${thumb ? " studio-chat-chip--preview" : ""}`} title={title ?? displayLabel}>
      {thumb ? (
        <span className="studio-chat-chip-media-wrap">
          <img className="studio-chat-chip-media" src={thumb} alt="" loading="lazy" />
        </span>
      ) : (
        <Icon className="studio-chat-chip-icon" aria-hidden="true" />
      )}
      <span className="studio-chat-chip-label">{displayLabel}</span>
    </span>
  );
}

function StudioMarkdownBit({ text }) {
  const ref = useRef(null);
  const html = useMemo(() => renderMarkdownFragment(text), [text]);

  useEffect(() => {
    if (ref.current) enhanceMarkdown(ref.current);
  }, [html]);

  if (!html) return null;
  return (
    <span
      ref={ref}
      className="studio-chat-markdown-bit mos-md md-prose"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function StudioPromptMessage({ prompt, assets = [], elements = [] }) {
  const { refs, segments } = useMemo(() => parseStudioPrompt(prompt), [prompt]);
  const previewLookup = useMemo(
    () => ({ assets, elements }),
    [assets, elements],
  );
  const hasBody = segments.some((segment) => segment.type === "text" && String(segment.value ?? "").trim());

  function previewForRef(refItem) {
    return resolveStudioPromptRefPreview(refItem, previewLookup);
  }

  return (
    <div className="studio-chat-prompt">
      {refs.length ? (
        <div className="studio-chat-prompt-chips" aria-label="References">
          {refs.map((ref) => (
            <StudioChatChip
              key={`${ref.label}-${ref.path ?? ref.kind}`}
              refItem={ref}
              preview={previewForRef(ref)}
              title={[ref.path, ref.notes].filter(Boolean).join(" · ") || ref.label}
            />
          ))}
        </div>
      ) : null}
      {hasBody || segments.some((s) => s.type === "mention") ? (
        <div className="studio-chat-prompt-body msg-user-text--inline">
          {segments.map((segment, index) => {
            if (segment.type === "mention") {
              const refItem = { label: segment.label };
              return (
                <StudioChatChip
                  key={`m-${index}-${segment.label}`}
                  refItem={refItem}
                  preview={previewForRef(refItem)}
                />
              );
            }
            return <StudioMarkdownBit key={`t-${index}`} text={segment.value} />;
          })}
        </div>
      ) : null}
    </div>
  );
}
