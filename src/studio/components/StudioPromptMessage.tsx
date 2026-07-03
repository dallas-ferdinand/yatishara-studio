// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef } from "react";
import { Film, Folder, Image as ImageIcon, Music, Sparkles, FileText } from "lucide-react";
import { enhanceMarkdown, renderMarkdownFragment } from "@/desk/lib/markdown-desk.js";
import { composerTokenIconKind, parseStudioPrompt } from "@/studio/lib/studio-prompt-display.js";

const ICONS = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  folder: Folder,
  sparkles: Sparkles,
  file: FileText,
};

function StudioChatChip({ refItem, label, title }) {
  const displayLabel = label ?? refItem?.label ?? "Reference";
  const iconKey = composerTokenIconKind(refItem ?? { kind: "file", label: displayLabel });
  const Icon = ICONS[iconKey] ?? FileText;
  return (
    <span className="studio-chat-chip" title={title ?? displayLabel}>
      <Icon className="studio-chat-chip-icon" aria-hidden="true" />
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

export function StudioPromptMessage({ prompt }) {
  const { refs, segments } = useMemo(() => parseStudioPrompt(prompt), [prompt]);
  const hasBody = segments.some((segment) => segment.type === "text" && String(segment.value ?? "").trim());

  return (
    <div className="studio-chat-prompt">
      {refs.length ? (
        <div className="studio-chat-prompt-chips" aria-label="References">
          {refs.map((ref) => (
            <StudioChatChip
              key={`${ref.label}-${ref.path ?? ref.kind}`}
              refItem={ref}
              title={[ref.path, ref.notes].filter(Boolean).join(" · ") || ref.label}
            />
          ))}
        </div>
      ) : null}
      {hasBody || segments.some((s) => s.type === "mention") ? (
        <div className="studio-chat-prompt-body msg-user-text--inline">
          {segments.map((segment, index) => {
            if (segment.type === "mention") {
              return <StudioChatChip key={`m-${index}-${segment.label}`} refItem={{ label: segment.label }} />;
            }
            return <StudioMarkdownBit key={`t-${index}`} text={segment.value} />;
          })}
        </div>
      ) : null}
    </div>
  );
}
