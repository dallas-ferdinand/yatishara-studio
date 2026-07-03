// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef } from "react";
import { blocksForUserMessage } from "@/desk/lib/composer-mentions.js";
import { enhanceMarkdown, renderMarkdownFragment } from "@/desk/lib/markdown-desk.js";
import { InlineUserAttachment } from "./AttachmentChip";

function MarkdownBit({ text }) {
  const ref = useRef(null);
  const html = useMemo(() => renderMarkdownFragment(text), [text]);

  useEffect(() => {
    if (ref.current) enhanceMarkdown(ref.current);
  }, [html]);

  if (!html) return null;
  return (
    <span
      ref={ref}
      className="msg-user-markdown-bit mos-md md-prose"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function UserMessageContent({
  message,
  workspaceId = "mercuryos",
  onOpenAttachment,
}) {
  const attachments = message?.attachments ?? [];
  const blocks = useMemo(() => blocksForUserMessage(message), [message]);
  const byId = useMemo(
    () => new Map(attachments.filter((item) => item?.id).map((item) => [item.id, item])),
    [attachments],
  );

  if (!blocks.length) return null;

  return (
    <div className="msg-user-text msg-user-text--inline">
      {blocks.map((block, index) => {
        if (block.type === "mention") {
          const attachment = byId.get(block.id);
          if (!attachment) return null;
          return (
            <InlineUserAttachment
              key={`${block.id}-${index}`}
              attachment={attachment}
              workspaceId={workspaceId}
              onOpen={onOpenAttachment}
            />
          );
        }
        const value = String(block.value ?? "");
        if (!value.trim()) return null;
        return <MarkdownBit key={`text-${index}`} text={value} />;
      })}
    </div>
  );
}
