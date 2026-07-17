"use client";

import { useState } from "react";
import type { Source } from "../lib/api";
import { useAuth } from "@/context/AuthContext";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Copy,
  Check,
  Volume2,
  RotateCcw,
  Database,
  Download as DownloadIcon,
  FileText,
} from "lucide-react";

type Props = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  sources?: Source[];
  downloadUrl?: string;
  downloadType?: string;
  onSourceClick?: (sources: Source[], index: number) => void;
  onRegenerate?: () => void;
  file?: string;   // CHANGED: filename of document attached to this message
};

function formatTime(created_at?: string) {
  if (!created_at) return null;
  return new Date(created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Avatar({ role, initial }: { role: "user" | "assistant"; initial: string }) {
  if (role === "assistant") {
    return (
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "var(--primary)",
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
    );
  }

  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: "#c9c5f0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#3a3266",
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

export default function MessageBubble({
  role,
  content,
  created_at,
  sources,
  downloadUrl,
  downloadType,
  onSourceClick,
  onRegenerate,
  file,   // CHANGED: destructured here
}: Props) {
  const { user } = useAuth();
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);

  const userInitial = (user?.username?.charAt(0) || "U").toUpperCase();

  function toggleSpeech() {
    if (typeof window === "undefined") return;

    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = "en-US";
    utterance.rate = 1;
    utterance.onend = () => setSpeaking(false);

    setSpeaking(true);
    speechSynthesis.speak(utterance);
  }

  async function copyText() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  const timeLabel = formatTime(created_at);

  if (role === "user") {
    return (
      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "flex-end",
          alignItems: "flex-end",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            maxWidth: "78%",
          }}
        >
          <div
            style={{
              background: "var(--user-bubble-bg)",
              color: "var(--user-bubble-text)",
              borderRadius: "18px 18px 4px 18px",
              padding: "10px 16px",
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            {/* CHANGED: file chip appears inside the bubble, above the text */}
            {file && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: content ? 8 : 0,
                  background: "rgba(255,255,255,0.18)",
                  borderRadius: 8,
                  padding: "5px 10px",
                  fontSize: 12,
                  width: "fit-content",
                }}
              >
                <FileText size={13} style={{ flexShrink: 0 }} />
                <span
                  style={{
                    maxWidth: 200,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {file}
                </span>
              </div>
            )}
            {content}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 6,
            }}
          >
            <button onClick={copyText} title="Copy" style={iconBtn}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>

            {timeLabel && (
              <span style={{ fontSize: 11, color: "var(--placeholder-text)" }}>
                {timeLabel}
              </span>
            )}
          </div>
        </div>

        <Avatar role="user" initial={userInitial} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <Avatar role="assistant" initial="" />

      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        {/* Answer card */}
        <div
          style={{
            background: "var(--assistant-bubble-bg)",
            borderRadius: "4px 18px 18px 18px",
            padding: "14px 18px",
          }}
        >
          <div
            style={{
              color: "var(--assistant-text)",
              fontSize: 14,
              lineHeight: 1.75,
            }}
          >
            {!downloadUrl && (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ children }) => (
                    <div style={{ overflowX: "auto", margin: "16px 0" }}>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          border: "1px solid var(--input-border)",
                          fontSize: "14px",
                        }}
                      >
                        {children}
                      </table>
                    </div>
                  ),

                  thead: ({ children }) => (
                    <thead style={{ background: "transparent" }}>
                      {children}
                    </thead>
                  ),

                  th: ({ children }) => (
                    <th
                      style={{
                        padding: "12px",
                        border: "1px solid var(--input-border)",
                        textAlign: "left",
                        fontWeight: 600,
                        background: "transparent",
                        color: "var(--foreground)",
                      }}
                    >
                      {children}
                    </th>
                  ),

                  td: ({ children }) => (
                    <td
                      style={{
                        padding: "12px",
                        border: "1px solid var(--input-border)",
                        verticalAlign: "top",
                        color: "var(--foreground)",
                        lineHeight: 1.7,
                      }}
                    >
                      {children}
                    </td>
                  ),

                  p: ({ children }) => (
                    <p style={{ marginBottom: 12 }}>{children}</p>
                  ),

                  ul: ({ children }) => (
                    <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
                      {children}
                    </ul>
                  ),

                  ol: ({ children }) => (
                    <ol style={{ paddingLeft: 24, marginBottom: 12 }}>
                      {children}
                    </ol>
                  ),

                  code: ({ children }) => (
                    <code
                      style={{
                        background: "#ece9fb",
                        padding: "2px 6px",
                        borderRadius: 4,
                      }}
                    >
                      {children}
                    </code>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            )}
          </div>

          {downloadUrl && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 14, color: "var(--assistant-text)" }}>
                Here's your {downloadType?.toUpperCase()}:
              </div>

              <a
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  textDecoration: "none",
                  color: "var(--primary)",
                  fontSize: 13,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <DownloadIcon size={14} />
                Download {downloadType?.toUpperCase()}
              </a>
            </div>
          )}
        </div>

        {/* Actions row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            paddingLeft: 4,
          }}
        >
          <button onClick={copyText} title="Copy" style={iconBtn}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>

          <button
            onClick={toggleSpeech}
            title={speaking ? "Stop" : "Read aloud"}
            style={{ ...iconBtn, opacity: speaking ? 1 : 0.75 }}
          >
            <Volume2 size={15} />
          </button>

          {onRegenerate && (
            <button onClick={onRegenerate} title="Regenerate answer" style={iconBtn}>
              <RotateCcw size={15} />
            </button>
          )}

          {sources && sources.filter(s => s.used).length > 0 && (
            <button
              onClick={() => onSourceClick?.(sources, 0)}
              title="Sources"
              style={iconBtn}
            >
              <Database size={15} />
              Sources ({sources.filter(s => s.used).length})
            </button>
          )}

          {timeLabel && (
            <span style={{ fontSize: 11, color: "var(--placeholder-text)" }}>
              {timeLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  color: "var(--placeholder-text)",
  fontSize: 13,
  padding: 0,
  opacity: 0.8,
  transition: "color 0.15s ease, opacity 0.15s ease",
};
