"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMercuryLogoAssets } from "@/lib/use-appearance-mode";

/** Treat as a single-line / compact bubble when the row is about this short. */
const INLINE_ROW_MAX_HEIGHT_PX = 72;

export function initialsFromUser(user?: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
} | null): string {
  const first = String(user?.firstName ?? "").trim();
  const last = String(user?.lastName ?? "").trim();
  if (first || last) {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "?";
  }
  const name = String(user?.name ?? "").trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  const email = String(user?.email ?? "").trim();
  if (email) return email.slice(0, 2).toUpperCase();
  const phone = String(user?.phone ?? "").trim();
  if (phone) return phone.replace(/\D/g, "").slice(-2) || "?";
  return "?";
}

/** Small glass-circle Yatishara mark — same language as empty-chat logo. */
export function ChatAssistAvatar() {
  const logo = useMercuryLogoAssets(40);
  return (
    <span className="studio-chat-avatar is-assist" aria-hidden="true">
      <span className="studio-chat-avatar-glass">
        <span className="studio-chat-avatar-blur" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo.src}
          srcSet={logo.srcSet}
          sizes={logo.sizes}
          alt=""
          width={28}
          height={28}
          draggable={false}
        />
      </span>
    </span>
  );
}

/** First + last initial avatar for sent user messages. */
export function ChatUserAvatar({ initials = "?" }: { initials?: string }) {
  const label = (initials || "?").slice(0, 2).toUpperCase();
  return (
    <span className="studio-chat-avatar is-user" aria-label={`You, ${label}`} title={label}>
      <span className="studio-chat-avatar-initials">{label}</span>
    </span>
  );
}

/** Avatar beside the bubble (outside), not inside. */
export function ChatMessageRow({
  role,
  avatar,
  children,
}: {
  role: "user" | "assistant";
  avatar: ReactNode;
  children: ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [inline, setInline] = useState(false);

  useEffect(() => {
    const el = rowRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      setInline(el.getBoundingClientRect().height <= INLINE_ROW_MAX_HEIGHT_PX);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={rowRef}
      className={`studio-chat-row is-${role}${inline ? " is-inline" : ""}`}
    >
      <div className="studio-chat-row-avatar">{avatar}</div>
      <div className="studio-chat-row-body">{children}</div>
    </div>
  );
}
