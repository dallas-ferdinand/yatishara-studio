"use client";

import { useEffect, useRef } from "react";
import { playUiSound } from "@/mos-app/sounds.js";

type WatchRow = {
  _id: string;
  kind: string;
  conversationId?: string | null;
  createdAt: number;
};

const CHIME_COOLDOWN_MS = 900;
const FRESH_WINDOW_MS = 45_000;

/**
 * Soft in-app chimes when DMs / followed posts land while Studio is open.
 * Skips: first snapshot, hidden tab (OS push owns that), active open chat.
 */
export function useIncomingAlertChimes(args: {
  rows: WatchRow[] | undefined;
  activeConversationId?: string | null;
  viewingMessages?: boolean;
}) {
  const seededRef = useRef(false);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const lastChimeAtRef = useRef(0);
  const activeConversationIdRef = useRef(args.activeConversationId);
  const viewingMessagesRef = useRef(args.viewingMessages);
  activeConversationIdRef.current = args.activeConversationId;
  viewingMessagesRef.current = args.viewingMessages;

  useEffect(() => {
    const rows = args.rows;
    if (!rows) return;

    if (!seededRef.current) {
      seededRef.current = true;
      seenIdsRef.current = new Set(rows.map((row) => row._id));
      return;
    }

    const seen = seenIdsRef.current;
    const fresh: WatchRow[] = [];
    for (const row of rows) {
      if (seen.has(row._id)) continue;
      seen.add(row._id);
      fresh.push(row);
    }
    if (!fresh.length) return;

    // Cap seen set growth.
    if (seen.size > 200) {
      const keep = new Set(rows.map((row) => row._id));
      seenIdsRef.current = keep;
    }

    if (typeof document !== "undefined" && document.hidden) return;

    const now = Date.now();
    let played = false;
    for (const row of fresh) {
      if (now - row.createdAt > FRESH_WINDOW_MS) continue;

      if (row.kind === "dm_message") {
        if (
          viewingMessagesRef.current &&
          row.conversationId &&
          row.conversationId === activeConversationIdRef.current
        ) {
          continue;
        }
        if (now - lastChimeAtRef.current < CHIME_COOLDOWN_MS) continue;
        playUiSound("message");
        lastChimeAtRef.current = now;
        played = true;
        break;
      }

      if (row.kind === "followed_post") {
        if (now - lastChimeAtRef.current < CHIME_COOLDOWN_MS) continue;
        playUiSound("notify");
        lastChimeAtRef.current = now;
        played = true;
        break;
      }
    }

    // One chime per burst even if mixed kinds arrived together.
    void played;
  }, [args.rows]);
}
