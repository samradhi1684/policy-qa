"use client";

import { useEffect, useRef } from "react";
import MessageBubble from "./messageBubble";
import type { Source } from "../lib/api";

export type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  created_at?: string;

  download_url?: string;
  download_type?: string;

  // True while the assistant message exists but no tokens have arrived
  // yet (retrieval/rerank in progress) — shows the "thinking" dots.
  // Once the first token streams in, the caller flips this to false and
  // content starts rendering incrementally.
  thinking?: boolean;
};

type Props = {
  messages: Message[];
  loading: boolean;
  onSourceClick: (
    sources: Source[],
    index: number
  ) => void;
  onRegenerate: (
    index: number
  ) => void;
};

export default function ChatWindow({
  messages,
  loading,
  onSourceClick,
  onRegenerate,
}: Props) {

  console.log(
    "CHAT WINDOW MESSAGES:",
    messages
  );

  const bottomRef =
    useRef<HTMLDivElement>(
      null
    );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  const regenerating =
    messages.some(
      (m) =>
        m.content ===
        "__loading__"
    );

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding:
          "24px 16px 8px",
      }}
    >
      <div
        style={{
          maxWidth: 680,
          margin:
            "0 auto",
          display:
            "flex",
          flexDirection:
            "column",
          gap: 24,
        }}
      >

        {/* Hide the regenerate placeholder; render everything else, using
            the thinking dots in place of a MessageBubble for whichever
            assistant message has no tokens yet. */}
        {messages
          .filter(
            (msg) =>
              msg.content !==
              "__loading__"
          )
          .map(
            (msg, i) =>
              msg.thinking ? (
                <ThinkingDots key={i} />
              ) : (
                <MessageBubble
                  key={i}
                  role={
                    msg.role
                  }
                  content={
                    msg.content
                  }
                  created_at={
                    msg.created_at
                  }
                  sources={
                    msg.sources
                  }

                  downloadUrl={
                    msg.download_url
                  }

                  downloadType={
                    msg.download_type
                  }

                  onSourceClick={
                    onSourceClick
                  }
                  onRegenerate={() =>
                    onRegenerate(
                      i
                    )
                  }
                />
              )
          )}

        {/* Typing dots for the regenerate flow (uses the "__loading__"
            placeholder + global `loading`, rather than a per-message
            thinking flag like the streaming send flow does). */}
        {loading &&
          messages.some(
            (m) => m.content === "__loading__"
          ) && <ThinkingDots />}

        <div
          ref={
            bottomRef
          }
        />
      </div>

      <style>{`
        @keyframes bounce {
          0%,80%,100%{
            transform:translateY(0);
            opacity:0.4;
          }
          40%{
            transform:translateY(-5px);
            opacity:1;
          }
        }
      `}</style>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      {/* Assistant avatar */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "var(--accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingTop: 8,
        }}
      >
        <span style={{ fontSize: 13, color: "var(--placeholder-text)" }}>
          Thinking
        </span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--placeholder-text)",
                display: "inline-block",
                animation: "bounce 1.2s infinite",
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}