"use client";

import { ChatMessageRow } from "./ChatMessageAvatars";

type Props = {
  message?: string;
};

export function AssistantMessage({ message }: Props) {
  if (!message?.trim()) return null;
  return (
    <ChatMessageRow role="assistant">
      <article className="studio-chat-bubble is-assistant">
        <p className="studio-chat-text" style={{ whiteSpace: "pre-wrap" }}>
          {message}
        </p>
      </article>
    </ChatMessageRow>
  );
}
