"use client";

import { Loader2, Phone } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAction } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { Icon } from "@/desk/components/Icons";

export type WaThreadMessage = {
  id?: string | null;
  fromMe?: boolean;
  timestamp?: number | string | null;
  kind?: string;
  text?: string | null;
  fileName?: string | null;
  mimetype?: string | null;
  seconds?: number | null;
  thumbDataUrl?: string | null;
  mediaUrl?: string | null;
  hasMedia?: boolean;
  mediaUnavailable?: boolean;
  location?: { lat?: number; lng?: number; address?: string; live?: boolean } | null;
  contactName?: string | null;
  quotedText?: string | null;
  quotedMessageId?: string | null;
  reaction?: { targetId?: string; emoji?: string; removed?: boolean } | null;
  reactions?: Array<{ emoji: string; fromMe?: boolean }>;
  callStatus?: string | null;
  interactive?: {
    body?: string;
    buttons?: Array<{ id?: string; label?: string }>;
    title?: string;
  } | null;
};

function msgTime(ts?: number | string | null) {
  if (ts == null || ts === "") return "";
  const n = Number(ts);
  const ms = n > 1e12 ? n : n > 0 ? n * 1000 : Date.parse(String(ts));
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function mapsUrl(loc?: { lat?: number; lng?: number } | null) {
  if (loc?.lat == null || loc?.lng == null) return null;
  return `https://maps.google.com/?q=${loc.lat},${loc.lng}`;
}

function WaRichText({ text }: { text: string }) {
  const parts = String(text || "").split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g);
  return (
    <p className="studio-ops-wa-text">
      {parts.map((part, i) => {
        if (/^\*[^*\n]+\*$/.test(part)) return <strong key={i}>{part.slice(1, -1)}</strong>;
        if (/^_[^_\n]+_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
        if (/^~[^~\n]+~$/.test(part)) return <s key={i}>{part.slice(1, -1)}</s>;
        if (/^`[^`\n]+`$/.test(part)) return <code key={i}>{part.slice(1, -1)}</code>;
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

function foldThreadReactions(messages: WaThreadMessage[]) {
  const byTarget = new Map<string, Array<{ emoji: string; fromMe: boolean }>>();
  const out: WaThreadMessage[] = [];
  for (const m of messages) {
    if (String(m?.kind || "") !== "reaction") {
      out.push(m);
      continue;
    }
    const targetId = String(m?.reaction?.targetId || "").trim();
    if (!targetId) continue;
    const emoji = String(m?.reaction?.emoji ?? m?.text ?? "").trim();
    const removed = Boolean(m?.reaction?.removed) || !emoji;
    const prev = byTarget.get(targetId) || [];
    const next = prev.filter((r) => Boolean(r.fromMe) !== Boolean(m.fromMe));
    if (!removed) next.push({ emoji, fromMe: Boolean(m.fromMe) });
    byTarget.set(targetId, next);
  }
  return out.map((m) => {
    const id = String(m?.id || "").trim();
    if (!id) return m;
    const reactions = byTarget.get(id);
    if (!reactions?.length) return m;
    return { ...m, reactions };
  });
}

function CsWaBubble({ m }: { m: WaThreadMessage }) {
  const kind = String(m.kind || "text");
  const mediaSrc = m.mediaUrl || m.thumbDataUrl || null;
  const preview = m.thumbDataUrl || mediaSrc;
  const time = msgTime(m.timestamp);
  const caption = String(m.text || "").trim();
  const quotedText = String(m.quotedText || "").trim();
  const quotedId = String(m.quotedMessageId || "").trim();
  const showQuote = !m.fromMe && Boolean(quotedText || quotedId);
  const bubbleReactions = Array.isArray(m.reactions)
    ? m.reactions.filter((r) => r?.emoji)
    : [];
  const bubbleClass = [
    "cs-ops-bubble",
    kind === "image" || kind === "sticker" || kind === "video" ? "is-media" : "",
    kind === "sticker" ? "is-sticker" : "",
    kind === "voice" || kind === "audio" ? "is-audio" : "",
    kind === "system" || kind === "call" ? "is-system" : "",
    kind === "call" ? "is-call" : "",
    kind === "interactive" ? "is-interactive" : "",
    bubbleReactions.length ? "has-reactions" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (kind === "system" || kind === "call") {
    const callLabel =
      caption ||
      (m.callStatus === "offer" ? "Call attempt" : "Missed voice call");
    return (
      <div className={`cs-ops-bubble-row is-system${kind === "call" ? " is-call" : ""}`}>
        <div className={bubbleClass}>
          <p>
            {kind === "call" ? (
              <>
                <Phone className="inline h-3 w-3 mr-1" aria-hidden />
                {callLabel}
              </>
            ) : (
              callLabel || "System message"
            )}
          </p>
        </div>
      </div>
    );
  }

  if (kind === "reaction") return null;

  let body: ReactNode = null;
  if (kind === "image" || kind === "sticker") {
    body = preview ? (
      <a
        className="cs-ops-media-link"
        href={mediaSrc || preview}
        target="_blank"
        rel="noreferrer"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview}
          alt={caption || (kind === "sticker" ? "Sticker" : "Image")}
          className="cs-ops-media-img"
        />
      </a>
    ) : (
      <p className="cs-ops-media-missing">
        {kind === "sticker" ? "Sticker unavailable" : "Photo unavailable"}
      </p>
    );
  } else if (kind === "video") {
    body = mediaSrc ? (
      <video
        className="cs-ops-media-video"
        src={mediaSrc}
        poster={m.thumbDataUrl || undefined}
        controls
        playsInline
        preload="metadata"
      />
    ) : preview ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={preview} alt={caption || "Video"} className="cs-ops-media-img" />
    ) : (
      <p className="cs-ops-media-missing">Video unavailable</p>
    );
  } else if (kind === "voice" || kind === "audio") {
    body = mediaSrc ? (
      <div className="cs-ops-audio-wrap">
        <audio className="cs-ops-audio" src={mediaSrc} controls preload="metadata" />
      </div>
    ) : (
      <p className="cs-ops-media-missing">
        {kind === "voice" ? "Voice note unavailable" : "Audio unavailable"}
      </p>
    );
  } else if (kind === "document") {
    const docInner = (
      <>
        <span className="cs-ops-doc-icon" aria-hidden="true">
          <Icon name="file" size={14} />
        </span>
        <span className="cs-ops-doc-meta">
          <strong>{m.fileName || caption || "Document"}</strong>
          {m.mimetype ? <em>{m.mimetype}</em> : null}
        </span>
      </>
    );
    body = mediaSrc ? (
      <a
        className="cs-ops-doc-link"
        href={mediaSrc}
        target="_blank"
        rel="noreferrer"
        download={m.fileName || undefined}
      >
        {docInner}
      </a>
    ) : (
      <div className="cs-ops-doc-link">{docInner}</div>
    );
  } else if (kind === "location") {
    const href = mapsUrl(m.location);
    body = href ? (
      <a className="cs-ops-loc-link" href={href} target="_blank" rel="noreferrer">
        <strong>{caption || "Location"}</strong>
        {m.location?.address ? <em>{m.location.address}</em> : null}
      </a>
    ) : (
      <p>{caption || "Location"}</p>
    );
  } else if (kind === "contact") {
    body = (
      <div className="cs-ops-contact">
        <strong>{m.contactName || caption || "Contact"}</strong>
        <em>Contact card</em>
      </div>
    );
  } else if (kind === "interactive") {
    body = (
      <div className="cs-ops-interactive">
        <WaRichText text={caption || m.interactive?.body || "Message"} />
        {(m.interactive?.buttons || []).length ? (
          <div className="cs-ops-interactive-btns">
            {m.interactive!.buttons!.map((b, i) => (
              <span key={b.id || i} className="cs-ops-interactive-btn">
                {b.label || "Button"}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  } else {
    body = <WaRichText text={caption || "[message]"} />;
  }

  const showCaption =
    Boolean(caption) &&
    (kind === "image" ||
      kind === "video" ||
      (kind === "document" && caption !== m.fileName));

  return (
    <div
      className={`cs-ops-bubble-row${m.fromMe ? " is-mine" : ""}`}
      data-wa-id={m.id || undefined}
    >
      <div className={bubbleClass}>
        <div className="cs-ops-bubble-body">
          {showQuote ? (
            <div className="cs-ops-wa-quote">
              <span className="cs-ops-wa-quote-bar" aria-hidden="true" />
              <span className="cs-ops-wa-quote-text">
                {quotedText || "Earlier message"}
              </span>
            </div>
          ) : null}
          {body}
          {showCaption ? <WaRichText text={caption} /> : null}
        </div>
        <div className="cs-ops-bubble-foot">
          {bubbleReactions.length ? (
            <div className="cs-ops-bubble-reactions" aria-label="Reactions">
              {bubbleReactions.map((r, i) => (
                <span
                  key={`${r.emoji}-${i}`}
                  className={`cs-ops-bubble-reaction${r.fromMe ? " is-mine" : ""}`}
                >
                  {r.emoji}
                </span>
              ))}
            </div>
          ) : null}
          <time className="cs-ops-bubble-meta">{time}</time>
        </div>
      </div>
    </div>
  );
}

export function AdminStudioOpsThread({
  phone,
  humanTakeover,
}: {
  phone: string;
  humanTakeover?: boolean;
}) {
  const getMessages = useAction(api.studioCsOpsActions.adminGetMessages);
  const sendMessage = useAction(api.studioCsOpsActions.adminSendMessage);
  const [messages, setMessages] = useState<WaThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = (await getMessages({ phone, limit: 400 })) as {
        messages?: WaThreadMessage[];
      };
      setMessages(Array.isArray(raw?.messages) ? raw.messages : []);
    } catch (err) {
      toast.error(friendlyConvexError(err, "Could not load WhatsApp thread"));
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [getMessages, phone]);

  useEffect(() => {
    void load();
  }, [load]);

  const folded = useMemo(() => foldThreadReactions(messages), [messages]);

  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [folded.length, phone, loading]);

  async function onSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await sendMessage({ phone, text });
      setDraft("");
      await load();
    } catch (err) {
      toast.error(friendlyConvexError(err, "Send failed"));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="cs-ops-thread studio-ops-wa-thread" aria-label="WhatsApp thread">
      <div className="cs-ops-thread-scroll" ref={scrollRef}>
        {loading ? (
          <div className="cs-ops-thread-empty" aria-busy="true" aria-label="Loading thread">
            <Loader2 className="h-5 w-5 animate-spin cs-ops-thread-load-spin" />
          </div>
        ) : folded.length === 0 ? (
          <div className="cs-ops-thread-empty">
            <p>No WhatsApp messages yet.</p>
          </div>
        ) : (
          <div className="cs-ops-thread-messages">
            {folded.map((m, i) => (
              <CsWaBubble key={m.id || `${m.timestamp}-${i}`} m={m} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <form
        className="cs-ops-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void onSend();
        }}
      >
        {!humanTakeover ? (
          <p className="cs-ops-composer-hint">
            Sending as staff turns on human takeover (Sophie pauses).
          </p>
        ) : (
          <p className="cs-ops-composer-hint">Human takeover on — Sophie won’t reply.</p>
        )}
        <div className="cs-ops-composer-row">
          <textarea
            className="cs-ops-composer-input"
            rows={2}
            value={draft}
            placeholder="Message on WhatsApp…"
            disabled={sending}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSend();
              }
            }}
          />
          <button
            type="submit"
            className="cs-ops-composer-send"
            disabled={sending || !draft.trim()}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
