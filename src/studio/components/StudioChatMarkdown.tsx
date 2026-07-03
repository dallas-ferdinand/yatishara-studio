// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef } from "react";
import { enhanceMarkdown, renderMarkdown } from "@/desk/lib/markdown-desk.js";

export function StudioChatMarkdown({ text, className = "studio-chat-text" }) {
  const ref = useRef(null);
  const html = useMemo(() => renderMarkdown(text), [text]);

  useEffect(() => {
    if (ref.current) enhanceMarkdown(ref.current);
  }, [html]);

  if (!String(text ?? "").trim()) return null;
  return (
    <div
      ref={ref}
      className={`${className} studio-chat-markdown mos-md md-prose`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
