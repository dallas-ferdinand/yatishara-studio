// @ts-nocheck
"use client";

import { useMemo, useState } from "react";
import { compactChatManual } from "@/desk/lib/agent-run";

const DEFAULT_CONTEXT_LIMIT_TOKENS = 200_000;
const RADIUS = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function textLen(value) {
  return String(value ?? "").length;
}

function blockTextLen(block) {
  if (!block || typeof block !== "object") return 0;
  let total = 0;
  total += textLen(block.content);
  total += textLen(block.text);
  total += textLen(block.output);
  total += textLen(block.message);
  total += textLen(block.title);
  total += textLen(block.body);
  if (Array.isArray(block.items)) {
    for (const item of block.items) {
      total += textLen(item.content ?? item.text ?? item.title);
    }
  }
  if (Array.isArray(block.blocks)) {
    for (const child of block.blocks) total += blockTextLen(child);
  }
  return total;
}

function estimateMessageTokens(messages) {
  let chars = 0;
  for (const message of messages ?? []) {
    chars += textLen(message.content);
    chars += textLen(message.flowHtml) / 3;
    for (const block of message.blocks ?? []) chars += blockTextLen(block);
    for (const attachment of message.attachments ?? []) {
      chars += textLen(attachment.name ?? attachment.label ?? attachment.path);
      chars += Math.min(textLen(attachment.text ?? attachment.content), 24_000);
    }
  }
  return Math.ceil(chars / 4);
}

function formatTokenCount(tokens) {
  if (tokens >= 1000) return `${Math.round(tokens / 100) / 10}k`;
  return String(tokens);
}

export function ContextWindowRing({ messages = [], chatState, chatId, onBump, disabled = false }) {
  const [compacting, setCompacting] = useState(false);
  const tokens = useMemo(() => estimateMessageTokens(messages), [messages]);
  const limit = Number(chatState?.contextLimitTokens) || DEFAULT_CONTEXT_LIMIT_TOKENS;
  const pct = Math.max(0, Math.min(1, limit ? tokens / limit : 0));
  const dashOffset = CIRCUMFERENCE * (1 - pct);
  const pctLabel = `${Math.round(pct * 100)}%`;
  const level = pct >= 0.92 ? "is-critical" : pct >= 0.72 ? "is-warn" : "";
  const title = `Context window: ${pctLabel} (${formatTokenCount(tokens)} / ${formatTokenCount(limit)} tokens est.)`;

  const compact = async () => {
    if (disabled || compacting || !chatId) return;
    setCompacting(true);
    try {
      await compactChatManual(chatState, chatId, onBump);
      onBump?.();
    } finally {
      setCompacting(false);
    }
  };

  return (
    <button
      type="button"
      className={`cursor-toolbar-icon desk-context-ring-btn ${level} ${compacting ? "is-compacting" : ""}`.trim()}
      title={title}
      aria-label={title}
      disabled={disabled || compacting}
      onClick={() => void compact()}
    >
      <span className="desk-context-ring-graphic" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18">
          <circle
            className="desk-context-ring-track"
            cx="9"
            cy="9"
            r={RADIUS}
            fill="none"
            strokeWidth="2"
          />
          <circle
            className="desk-context-ring-fill"
            cx="9"
            cy="9"
            r={RADIUS}
            fill="none"
            strokeWidth="2"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 9 9)"
          />
        </svg>
      </span>
      <span className="desk-context-ring-pct">{pctLabel}</span>
      <span className="sr-only">Context window</span>
    </button>
  );
}
