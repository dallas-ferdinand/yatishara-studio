"use client";

import { ArrowUp, Loader2, Pause, Phone, Play } from "lucide-react";
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
import { StudioEmoji } from "@/studio/components/StudioEmoji";
import { useAdminStudioOps } from "./AdminStudioOpsContext";
import "./admin-studio-ops-thread.css";

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
  transcript?: string | null;
  mediaKey?: string | null;
  callStatus?: string | null;
  interactive?: {
    variant?: string;
    body?: string;
    buttons?: Array<{ id?: string; label?: string }>;
    title?: string;
    footer?: string;
    selectedId?: string;
    selectedText?: string;
    rows?: Array<{
      id?: string;
      label?: string;
      description?: string | null;
      section?: string | null;
    }>;
    cards?: Array<{
      title?: string | null;
      body?: string | null;
      footer?: string | null;
      thumbDataUrl?: string | null;
      buttons?: Array<{ id?: string; label?: string }>;
    }>;
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

function messageDate(ts?: number | string | null) {
  if (ts == null || ts === "") return null;
  const n = Number(ts);
  const ms = n > 1e12 ? n : n > 0 ? n * 1000 : Date.parse(String(ts));
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

function messageDayKey(ts?: number | string | null) {
  const d = messageDate(ts);
  if (!d) return "unknown";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function messageDayLabel(ts?: number | string | null) {
  const d = messageDate(ts);
  if (!d) return "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
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

function WaInteractiveBody({
  message,
  caption,
}: {
  message: WaThreadMessage;
  caption: string;
}) {
  const interactive = message.interactive || {};
  const variant = String(interactive.variant || "interactive");
  const cards = Array.isArray(interactive.cards) ? interactive.cards : [];
  const buttons = Array.isArray(interactive.buttons) ? interactive.buttons : [];
  const rows = Array.isArray(interactive.rows) ? interactive.rows : [];

  if (variant === "reply") {
    return (
      <div className="cs-ops-interactive is-reply">
        <span className="cs-ops-interactive-kicker">Tapped</span>
        <WaRichText
          text={interactive.selectedText || interactive.body || caption || "Selection"}
        />
      </div>
    );
  }

  if (variant === "carousel" && cards.length) {
    return (
      <div className="cs-ops-interactive is-carousel">
        {interactive.body ? <WaRichText text={interactive.body} /> : null}
        <div className="cs-ops-interactive-cards" role="list">
          {cards.map((card, index) => (
            <div
              className="cs-ops-interactive-card"
              role="listitem"
              key={`${card.title || card.body || "card"}-${index}`}
            >
              {card.thumbDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.thumbDataUrl}
                  alt={card.title || card.body || `Option ${index + 1}`}
                />
              ) : null}
              <div className="cs-ops-interactive-card-copy">
                {card.title ? <strong>{card.title}</strong> : null}
                {card.body ? <WaRichText text={card.body} /> : null}
                {card.footer ? <em>{card.footer}</em> : null}
              </div>
              {(card.buttons || []).length ? (
                <div className="cs-ops-interactive-btns">
                  {card.buttons!.map((button, buttonIndex) => (
                    <span
                      className="cs-ops-interactive-btn"
                      key={`${button.id || button.label}-${buttonIndex}`}
                    >
                      {button.label || "Button"}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {interactive.footer ? (
          <em className="cs-ops-interactive-footer">{interactive.footer}</em>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`cs-ops-interactive is-${variant}`}>
      {message.thumbDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="cs-ops-interactive-header" src={message.thumbDataUrl} alt="" />
      ) : null}
      {interactive.title ? (
        <strong className="cs-ops-interactive-title">{interactive.title}</strong>
      ) : null}
      {interactive.body ? (
        <WaRichText text={interactive.body} />
      ) : caption && variant !== "list" ? (
        <WaRichText text={caption} />
      ) : null}
      {variant === "list" && rows.length ? (
        <ul className="cs-ops-interactive-list">
          {rows.slice(0, 8).map((row, index) => (
            <li key={`${row.id || row.label}-${index}`}>
              <span>{row.label || "Option"}</span>
              {row.description ? <em>{row.description}</em> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {buttons.length ? (
        <div className="cs-ops-interactive-btns">
          {buttons.map((button, index) => (
            <span
              className="cs-ops-interactive-btn"
              key={`${button.id || button.label}-${index}`}
            >
              {button.label || "Button"}
            </span>
          ))}
        </div>
      ) : null}
      {interactive.footer ? (
        <em className="cs-ops-interactive-footer">{interactive.footer}</em>
      ) : null}
    </div>
  );
}

const REACT_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

/** Studio-DM / Desk CS Ops style voice note player. */
function StudioOpsVnPlayer({
  src,
  seconds = null,
  seedKey = "",
}: {
  src: string;
  seconds?: number | null;
  seedKey?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dur, setDur] = useState(Number(seconds) > 0 ? Number(seconds) : 0);
  const bars = useMemo(() => {
    const key = String(seedKey || src || "vn");
    let seed = 2166136261;
    for (let i = 0; i < key.length; i += 1) {
      seed ^= key.charCodeAt(i);
      seed = Math.imul(seed, 16777619);
    }
    const out: number[] = [];
    for (let i = 0; i < 28; i += 1) {
      seed = Math.imul(seed ^ (seed >>> 13), 1274126177);
      const n = ((seed >>> 0) % 1000) / 1000;
      out.push(0.22 + 0.7 * n);
    }
    return out;
  }, [seedKey, src]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return undefined;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
    };
    const onTime = () => {
      const d = el.duration;
      if (Number.isFinite(d) && d > 0) setDur(d);
      const denom = Number.isFinite(d) && d > 0 ? d : dur || 1;
      setProgress(Math.min(1, (el.currentTime || 0) / denom));
    };
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) setDur(el.duration);
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
    };
  }, [src, dur]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  };

  const clock = (() => {
    const s =
      dur > 0
        ? Math.round(dur)
        : Number(seconds) > 0
          ? Math.round(Number(seconds))
          : 0;
    if (!s) return playing ? "…" : "0:00";
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  })();

  return (
    <div className="cs-ops-vn">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        className={`cs-ops-vn-orb${playing ? " is-playing" : ""}`}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        onClick={toggle}
      >
        {playing ? (
          <Pause className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Play className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
      <div className="cs-ops-vn-wave" aria-hidden="true">
        {bars.map((h, i) => (
          <span
            key={i}
            className="cs-ops-vn-bar"
            style={{
              height: `${Math.round(h * 100)}%`,
              opacity: i / bars.length <= progress ? 1 : 0.35,
            }}
          />
        ))}
      </div>
      <span className="cs-ops-vn-time">{clock}</span>
    </div>
  );
}

function CsWaBubble({
  m,
  onReact,
  reactingId,
}: {
  m: WaThreadMessage;
  onReact?: (messageId: string, emoji: string, fromMe: boolean) => void;
  reactingId?: string | null;
}) {
  const kind = String(m.kind || "text");
  const mediaSrc = m.mediaUrl || m.thumbDataUrl || null;
  const preview = m.thumbDataUrl || mediaSrc;
  const time = msgTime(m.timestamp);
  const caption = String(m.text || "").trim();
  const quotedText = String(m.quotedText || "").trim();
  const quotedId = String(m.quotedMessageId || "").trim();
  const showQuote = !m.fromMe && Boolean(quotedText || quotedId);
  const transcript = String(m.transcript || "").trim();
  const bubbleReactions = Array.isArray(m.reactions)
    ? m.reactions.filter((r) => r?.emoji)
    : [];
  const msgId = String(m.id || "").trim();
  const canReact = Boolean(msgId && onReact);
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
    body = (
      <div className="cs-ops-audio-wrap">
        {mediaSrc ? (
          <StudioOpsVnPlayer
            src={mediaSrc}
            seconds={m.seconds}
            seedKey={msgId || mediaSrc}
          />
        ) : (
          <p className="cs-ops-media-missing">
            {kind === "voice" ? "Voice note unavailable" : "Audio unavailable"}
          </p>
        )}
        {transcript ? (
          <p className="cs-ops-vn-transcript">{transcript}</p>
        ) : null}
      </div>
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
    body = <WaInteractiveBody message={m} caption={caption} />;
  } else {
    body = <WaRichText text={caption || "[message]"} />;
  }

  const showCaption =
    Boolean(caption) &&
    (kind === "image" ||
      kind === "video" ||
      (kind === "document" && caption !== m.fileName));

  const mineEmoji = bubbleReactions.find((r) => r.fromMe)?.emoji || "";

  return (
    <div
      className={`cs-ops-bubble-row${m.fromMe ? " is-mine" : ""}`}
      data-wa-id={m.id || undefined}
    >
      <div className={bubbleClass}>
        {canReact ? (
          <div className="studio-ops-react-strip" role="toolbar" aria-label="React">
            {REACT_EMOJI.map((emoji) => {
              const active = mineEmoji === emoji;
              return (
                <button
                  key={emoji}
                  type="button"
                  className={`studio-ops-react-btn${active ? " is-active" : ""}`}
                  disabled={reactingId === msgId}
                  title={active ? "Remove reaction" : `React ${emoji}`}
                  onClick={() =>
                    onReact?.(msgId, active ? "" : emoji, Boolean(m.fromMe))
                  }
                >
                  <StudioEmoji emoji={emoji} />
                </button>
              );
            })}
          </div>
        ) : null}
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
                  <StudioEmoji emoji={r.emoji} />
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
  const { threadTick, refresh } = useAdminStudioOps();
  const getMessages = useAction(api.studioCsOpsActions.adminGetMessages);
  const sendMessage = useAction(api.studioCsOpsActions.adminSendMessage);
  const sendReaction = useAction(api.studioCsOpsActions.adminSendReaction);
  const [messages, setMessages] = useState<WaThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [reactingId, setReactingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const failCountRef = useRef(0);
  const nearBottomRef = useRef(true);

  const mergeMessages = useCallback((prev: WaThreadMessage[], next: WaThreadMessage[]) => {
    if (!prev.length) return next;
    if (!next.length) return prev;
    const byId = new Map<string, WaThreadMessage>();
    for (const m of prev) {
      const id = String(m.id || "");
      if (id) byId.set(id, m);
    }
    for (const m of next) {
      const id = String(m.id || "");
      if (id) byId.set(id, m);
    }
    const merged = Array.from(byId.values());
    if (merged.length < next.length) return next;
    merged.sort(
      (a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0),
    );
    return merged;
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const raw = (await getMessages({ phone, limit: 400 })) as {
        messages?: WaThreadMessage[];
      };
      const next = Array.isArray(raw?.messages) ? raw.messages : [];
      setMessages((prev) => (quiet ? mergeMessages(prev, next) : next));
      failCountRef.current = 0;
      setStale(false);
    } catch (err) {
      failCountRef.current += 1;
      if (!quiet) {
        toast.error(friendlyConvexError(err, "Could not load WhatsApp thread"));
        setMessages([]);
      } else if (failCountRef.current >= 3) {
        setStale(true);
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [getMessages, phone, mergeMessages]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 45_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!threadTick) return;
    void load(true);
  }, [threadTick, load]);

  const folded = useMemo(() => foldThreadReactions(messages), [messages]);
  const timeline = useMemo(() => {
    const items: Array<
      | { type: "day"; key: string; label: string }
      | { type: "message"; key: string; message: WaThreadMessage }
    > = [];
    let previousDay = "";
    folded.forEach((message, index) => {
      const dayKey = messageDayKey(message.timestamp);
      if (dayKey !== previousDay) {
        const label = messageDayLabel(message.timestamp);
        if (label) items.push({ type: "day", key: `day-${dayKey}-${index}`, label });
        previousDay = dayKey;
      }
      items.push({
        type: "message",
        key: String(message.id || `${message.timestamp}-${index}`),
        message,
      });
    });
    return items;
  }, [folded]);

  useLayoutEffect(() => {
    if (!nearBottomRef.current && !loading) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [timeline.length, phone, loading]);

  async function onReact(messageId: string, emoji: string, fromMe: boolean) {
    if (!messageId) return;
    setReactingId(messageId);
    try {
      await sendReaction({
        phone,
        messageId,
        emoji,
        fromMe,
      });
      await load(true);
      void refresh({ quiet: true });
    } catch (err) {
      toast.error(friendlyConvexError(err, "Reaction failed"));
    } finally {
      setReactingId(null);
    }
  }

  async function onSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await sendMessage({ phone, text });
      setDraft("");
      await load();
      void refresh({ quiet: true });
    } catch (err) {
      toast.error(friendlyConvexError(err, "Send failed"));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="cs-ops-thread studio-ops-wa-thread" aria-label="WhatsApp thread">
      <div
        className="cs-ops-thread-scroll"
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (!el) return;
          nearBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {stale ? (
          <p className="studio-ops-thread-stale studio-muted">
            Thread refresh lagging — retrying…
          </p>
        ) : null}
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
            {timeline.map((item) =>
              item.type === "day" ? (
                <div key={item.key} className="cs-ops-day-sep" role="separator">
                  <span>{item.label}</span>
                </div>
              ) : (
                <CsWaBubble
                  key={item.key}
                  m={item.message}
                  onReact={onReact}
                  reactingId={reactingId}
                />
              ),
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <form
        className="cs-ops-composer"
        title={
          humanTakeover
            ? "Human takeover is on — Sophie is paused."
            : "Sending as staff turns on human takeover and pauses Sophie."
        }
        onSubmit={(e) => {
          e.preventDefault();
          void onSend();
        }}
      >
        <div className="cs-ops-composer-row">
          <textarea
            className="cs-ops-composer-input"
            rows={1}
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
            aria-label={sending ? "Sending message" : "Send message"}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
