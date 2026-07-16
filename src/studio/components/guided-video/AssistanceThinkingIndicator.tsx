"use client";

import { ChatAssistAvatar, ChatMessageRow } from "./ChatMessageAvatars";

/** Compact inline “AI is working” bubble — scribbling pencil only. */
export function AssistanceThinkingIndicator() {
  return (
    <ChatMessageRow role="assistant" avatar={<ChatAssistAvatar />}>
      <article
        className="studio-chat-bubble is-assistant is-thinking"
        aria-live="polite"
        aria-label="Assistance is thinking"
      >
        <div className="studio-assist-thinking is-pencil-only">
          <span className="studio-assist-thinking-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none">
              <g className="studio-assist-pencil">
                <path
                  d="M14 34.5l2.2-7.4 16.4-16.4a2.2 2.2 0 013.1 0l2.1 2.1a2.2 2.2 0 010 3.1L21.4 32.3 14 34.5z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
                <path
                  d="M30.4 12.8l4.8 4.8"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
                <path
                  d="M16.2 27.2l4.6 4.6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  opacity="0.55"
                />
                <path
                  className="studio-assist-pencil-tip"
                  d="M14 34.5l3.6-1.1"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </g>
              <g
                className="studio-assist-scribble"
                stroke="currentColor"
                strokeLinecap="round"
                fill="none"
              >
                <path
                  className="studio-assist-scribble-a"
                  d="M10 38c3.2-.8 5.6.6 8.2.2"
                  strokeWidth="1.5"
                />
                <path
                  className="studio-assist-scribble-b"
                  d="M12 40.2c2.8-.6 5.4.5 8 .1"
                  strokeWidth="1.35"
                />
                <path
                  className="studio-assist-scribble-c"
                  d="M14 42c2.4-.5 4.6.4 7 0"
                  strokeWidth="1.2"
                />
              </g>
            </svg>
          </span>
        </div>
      </article>
    </ChatMessageRow>
  );
}
