// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef } from "react";
import { Film, Folder, Image as ImageIcon, Music, Sparkles, FileText } from "lucide-react";
import { enhanceMarkdown, renderMarkdownFragment } from "@/desk/lib/markdown-desk.js";
import { writeExplorerDragData, clearActiveExplorerDrag } from "@/desk/lib/explorer-dnd.js";
import { setChipDragImage } from "@/desk/lib/chip-drag-preview.js";
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

function entryFromPromptRef(refItem, preview) {
  const studioId = refItem?.studioId;
  const path =
    refItem?.path ||
    (studioId
      ? refItem?.elementType
        ? `/Studio/elements/${studioId}`
        : `/Studio/assets/${studioId}`
      : "");
  if (!path) return null;
  const name = refItem?.label ?? refItem?.filename ?? path.split("/").pop() ?? "Reference";
  const kind = preview?.kind ?? refItem?.kind ?? "file";
  return {
    path,
    name,
    type: "file",
    studioKind: refItem?.elementType || path.includes("/elements/") ? "element" : "asset",
    studioId,
    elementType: refItem?.elementType || preview?.elementType,
    kindLabel: kind,
    mediaKind: kind === "image" || kind === "video" || kind === "audio" ? kind : null,
    thumbnailUrl: preview?.thumbnailUrl,
    mediaUrl: preview?.mediaUrl ?? preview?.thumbnailUrl,
  };
}

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
  const dragEntry = entryFromPromptRef(refItem, preview);
  const canDrag = Boolean(dragEntry?.path);

  function handleDragStart(event) {
    if (!canDrag || !dragEntry) return;
    writeExplorerDragData(event.dataTransfer, dragEntry);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copyMove";
    setChipDragImage(event.dataTransfer, {
      label: displayLabel,
      thumbnailUrl: thumb || dragEntry.thumbnailUrl,
      kind: mediaKind || dragEntry.mediaKind || "file",
    });
  }

  function handleDragEnd() {
    clearActiveExplorerDrag();
  }

  const commonProps = {
    className: `studio-chat-chip${imageOnly ? " studio-chat-chip--image-only" : ""}${
      thumb && !imageOnly ? " studio-chat-chip--preview" : ""
    }${canDrag ? " is-draggable" : ""}`,
    title:
      title ??
      (canDrag ? `${displayLabel} · drag into composer` : displayLabel),
    draggable: canDrag,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
  };

  if (imageOnly) {
    return (
      <span {...commonProps}>
        <span className="studio-chat-chip-media-wrap">
          {mediaKind === "video" && !isElement ? (
            <video
              className="studio-chat-chip-media"
              src={preview?.mediaUrl ?? thumb}
              muted
              playsInline
              preload="metadata"
              draggable={false}
            />
          ) : (
            <img className="studio-chat-chip-media" src={thumb} alt="" loading="lazy" draggable={false} />
          )}
        </span>
        <span className="studio-chat-chip-overlay" aria-hidden="true">
          <Icon className="studio-chat-chip-icon" />
        </span>
      </span>
    );
  }

  return (
    <span {...commonProps}>
      {thumb ? (
        <span className="studio-chat-chip-media-wrap">
          <img className="studio-chat-chip-media" src={thumb} alt="" loading="lazy" draggable={false} />
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
  const hasMentions = segments.some((segment) => segment.type === "mention");
  const showInline = refs.length > 0 || hasBody || hasMentions;

  function previewForRef(refItem) {
    return resolveStudioPromptRefPreview(refItem, previewLookup);
  }

  function resolveMentionRef(label) {
    const needle = String(label ?? "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();
    return (
      refs.find(
        (ref) =>
          String(ref.label ?? "")
            .trim()
            .replace(/^@/, "")
            .toLowerCase() === needle,
      ) ?? { label }
    );
  }

  return (
    <div className="studio-chat-prompt">
      {showInline ? (
        <div className="studio-chat-prompt-body msg-user-text--inline">
          {refs.map((ref) => (
            <StudioChatChip
              key={`r-${ref.label}-${ref.path ?? ref.kind ?? ref.studioId ?? ""}`}
              refItem={ref}
              preview={previewForRef(ref)}
              title={[ref.path, ref.notes].filter(Boolean).join(" · ") || ref.label}
            />
          ))}
          {segments.map((segment, index) => {
            if (segment.type === "mention") {
              const refItem = resolveMentionRef(segment.label);
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
