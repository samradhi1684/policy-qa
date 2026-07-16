"use client";

import { useRef, useEffect, useState } from "react";
import { Paperclip, Mic, Square, ArrowUp, FileText } from "lucide-react";
import type { ChatDocument } from "../lib/api";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSend: (question?: string) => void;
  loading?: boolean;
  selectedFile: File | null;
  uploadedDocuments?: ChatDocument[];
  onFileSelect: (file: File | null) => void;
  /** Guests can't upload documents; shows an explanatory tooltip instead. */
  uploadDisabled?: boolean;
  uploadDisabledReason?: string;
  /** 0-100 while an upload is in flight, null otherwise. */
  uploadProgress?: number | null;
};

const BASE =
  (process.env.NEXT_PUBLIC_BACKEND_URL ??
    "http://127.0.0.1:8000").replace(/\/+$/, "");

export default function InputBar({
  value,
  onChange,
  onSend,
  loading,
  selectedFile,
  uploadedDocuments,
  onFileSelect,
  uploadDisabled = false,
  uploadDisabledReason = "Sign in to upload documents",
  uploadProgress = null,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [recording, setRecording] = useState(false);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("audio", blob, "audio.webm");

        try {
          const res = await fetch(`${BASE}/chats/transcribe`, {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            throw new Error("Transcription failed");
          }

          const data = await res.json();
          onChange(data.text || "");
        } catch (err) {
          console.error(err);
          alert("Speech transcription failed");
        }
      };

      recorder.start();
      setRecording(true);
    } catch (err) {
      console.error(err);
      alert("Microphone access denied");
    }
  }

  // CHANGED: also allow send when a file is selected (even with empty text)
  const canSend = (value.trim().length > 0 || selectedFile !== null) && !loading;


  console.log("=== InputBar Render ===");
  console.log("selectedFile:", selectedFile);
  console.log("uploadedDocuments:", uploadedDocuments);
  console.log("canSend:", canSend);

  return (
    <div
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        width: "100%",
      }}
    >

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "var(--input-bg)",
          border: "1px solid var(--input-border)",
          borderRadius: "26px",
          padding: "8px 10px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.md,.txt"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelect(file);
            // Reset so the same file can be re-selected after removal
            e.target.value = "";
          }}
        />

        <button
          type="button"
          onClick={() => {
            if (uploadDisabled) return;
            fileInputRef.current?.click();
          }}
          disabled={uploadDisabled}
          title={uploadDisabled ? uploadDisabledReason : "Attach document"}
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            border: "none",
            background: "transparent",
            cursor: uploadDisabled ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--placeholder-text)",
            opacity: uploadDisabled ? 0.4 : 1,
            flexShrink: 0,
          }}
        >
          <Paperclip size={18} />
        </button>

        {/* CHANGED: added × button to remove the file before sending */}
        {selectedFile ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              color: "var(--primary)",
              background: "var(--primary-soft)",
              borderRadius: "999px",
              padding: "4px 10px",
              maxWidth: 140,
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <FileText size={12} />

            <span
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {selectedFile.name}
            </span>

            {uploadProgress !== null && uploadProgress < 100 && (
              <span>{uploadProgress}%</span>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                onFileSelect(null);
              }}
              style={{
                marginLeft: 2,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--primary)",
                padding: 0,
                fontSize: 15,
              }}
            >
              ×
            </button>
          </div>
        ) : (
          uploadedDocuments?.[0] && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: "var(--primary)",
                background: "var(--primary-soft)",
                borderRadius: "999px",
                padding: "4px 10px",
                maxWidth: 140,
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <FileText size={12} />

              <span
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {uploadedDocuments[0].name}
              </span>
            </div>
          )
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about renewable energy policy..."
          rows={1}
          style={{
            flex: 1,
            resize: "none",
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 15,
            color: "var(--foreground)",
            lineHeight: 1.6,
            maxHeight: 200,
            overflowY: "auto",
            fontFamily: "inherit",
          }}
        />

        <button
          onClick={toggleRecording}
          title={recording ? "Stop recording" : "Voice input"}
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            border: "none",
            background: recording ? "#ef4444" : "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: recording ? "#fff" : "var(--placeholder-text)",
            flexShrink: 0,
            transition: "background 0.15s",
          }}
        >
          {recording ? <Square size={16} fill="currentColor" /> : <Mic size={18} />}
        </button>

        <button
          onClick={() => onSend()}
          disabled={!canSend}
          title="Send"
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            border: "none",
            background: canSend ? "var(--send-btn-bg)" : "#e3ece0",
            cursor: canSend ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: canSend ? "var(--send-btn-text)" : "#9db296",
            flexShrink: 0,
            transition: "all 0.15s",
          }}
        >
          <ArrowUp size={18} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
