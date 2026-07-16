"use client";

import type { ReactNode } from "react";

/** Full-width chat row without avatar rails or connector lines. */
export function ChatMessageRow({
  role,
  children,
}: {
  role: "user" | "assistant";
  children: ReactNode;
}) {
  return (
    <div className={`studio-chat-row is-${role} is-avatarless`}>
      <div className="studio-chat-row-body">{children}</div>
    </div>
  );
}
