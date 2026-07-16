"use client";

import { useState, useEffect, useCallback, useRef } from "react";

import ChatWindow, { type Message } from "../../components/chatWindow";
import InputBar from "../../components/inputBar";
import Sidebar from "../../components/sideBar";
import EmptyState from "../../components/emptyState";
import SourcePane from "../../components/sourcePane";
import BackButton from "../../components/backButton";
import AuthModal, { type AuthModalMode } from "../../components/authModal";

import { useAuth } from "../../context/AuthContext";

import {
  createChat,
  listChats,
  getMessages,
  queryInChatStream,
  regenerateAnswer,
  deleteChat,
  renameChat,
  pinChat,
  uploadChatDocument,
  listChatDocuments,
  type Chat,
  type ChatDocument,
  type Source,
} from "../../lib/api";

import {
  PENDING_PROMPT_KEY,
  PENDING_COUNTRY_KEY,
} from "../page";

const DEFAULT_COUNTRY = "dsire";

// ─── Guest session persistence ────────────────────────────────────────────────
// sessionStorage survives tab switches but is cleared when the tab is closed.
// AuthContext has been updated to NOT call sessionStorage.clear() so these
// keys are safe across auth lifecycle events.
const GUEST_MESSAGES_KEY = "policysense_guest_messages";
const GUEST_COUNTRY_KEY  = "policysense_guest_country";

function saveGuestSession(messages: Message[], country: string) {
  try {
    sessionStorage.setItem(GUEST_MESSAGES_KEY, JSON.stringify(messages));
    sessionStorage.setItem(GUEST_COUNTRY_KEY, country);
  } catch { /* storage unavailable */ }
}

function loadGuestSession(): { messages: Message[]; country: string } | null {
  try {
    const raw = sessionStorage.getItem(GUEST_MESSAGES_KEY);
    if (!raw) return null;
    const messages: Message[] = JSON.parse(raw);
    if (!Array.isArray(messages) || messages.length === 0) return null;
    const country = sessionStorage.getItem(GUEST_COUNTRY_KEY) ?? DEFAULT_COUNTRY;
    return { messages, country };
  } catch {
    return null;
  }
}

export function clearGuestSession() {
  try {
    sessionStorage.removeItem(GUEST_MESSAGES_KEY);
    sessionStorage.removeItem(GUEST_COUNTRY_KEY);
  } catch { /* ignore */ }
}
// ─────────────────────────────────────────────────────────────────────────────

export default function Home() {
  const { token, isGuest, ready } = useAuth();

  const [question, setQuestion] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [chatDocuments, setChatDocuments] = useState<ChatDocument[]>([]);

  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_COUNTRY);

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<Message[]>([]);

  const [sourcePaneSources, setSourcePaneSources] = useState<Source[] | null>(null);
  const [sourcePaneIndex, setSourcePaneIndex] = useState(0);

  const [authModal, setAuthModal] = useState<AuthModalMode>(null);

  const countryRef = useRef(selectedModel);
  countryRef.current = selectedModel;

  // True once we have attempted to restore a guest session. Using a ref
  // (not state) means the flag survives re-renders without triggering them,
  // and it is never reset by React's reconciler. This guarantees the restore
  // is a strict one-shot even under StrictMode double-invoke.
  const guestRestoreDone = useRef(false);

  // ── ONE-SHOT guest session restore ────────────────────────────────────────
  // Runs after AuthContext finishes its localStorage check (ready === true).
  // Using an empty dep array + early-return guards keeps this truly one-shot:
  // the effect body only does work the very first time ready && !token.
  useEffect(() => {
    if (!ready) return;
    if (token) return;                    // authenticated — handled below
    if (guestRestoreDone.current) return; // already ran once this mount
    guestRestoreDone.current = true;

    const saved = loadGuestSession();
    if (saved) {
      setActiveChatId("guest");
      setActiveMessages(saved.messages);
      setSelectedModel(saved.country);
    }
  }); // <-- intentionally NO dependency array: runs after every render but
      //     the ref gate makes it a true one-shot.

  // ── Persist guest messages on every change ────────────────────────────────
  useEffect(() => {
    if (!ready || token) return;
    if (activeMessages.length === 0) return;
    saveGuestSession(activeMessages, selectedModel);
  }, [activeMessages, selectedModel, token, ready]);

  // ── Load authenticated chats ───────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setChats([]);
      return;
    }
    listChats().then(setChats).catch(() => {});
  }, [token, ready]);

  // ── Pending-prompt handoff (landing → auth → chat) ────────────────────────
  useEffect(() => {
    if (!ready || !token) return;

    let pending: string | null = null;
    let pendingCountry: string | null = null;
    try {
      pending        = sessionStorage.getItem(PENDING_PROMPT_KEY);
      pendingCountry = sessionStorage.getItem(PENDING_COUNTRY_KEY);
      sessionStorage.removeItem(PENDING_PROMPT_KEY);
      sessionStorage.removeItem(PENDING_COUNTRY_KEY);
    } catch {
      return;
    }

    if (!pending) return;
    if (pendingCountry) setSelectedModel(pendingCountry);
    setQuestion(pending);
    setTimeout(() => handleSend(pending), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token]);

  // ── bfcache / focus guard ─────────────────────────────────────────────────
  // Only wipes state when an *authenticated* user's token has disappeared
  // (e.g. logout in another tab). Guest sessions are left alone — the whole
  // point is that they survive tab switches.
  useEffect(() => {
    function revalidate() {
      // If there IS a token in localStorage, auth state is still valid —
      // nothing to do regardless of whether we're authenticated or guest.
      if (localStorage.getItem("token")) return;

      // No token: clear authenticated-user state. Do not touch guest session.
      setChats([]);
      setSourcePaneSources(null);
      setChatDocuments([]);

      // Only blank the messages/chatId if we were actually showing an
      // authenticated chat (activeChatId is a UUID, not "guest").
      setActiveChatId((prev) => {
        if (prev && prev !== "guest") {
          setActiveMessages([]);
          return null;
        }
        return prev; // guest session — leave it untouched
      });
    }

    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) revalidate();
    }

    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", revalidate);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", revalidate);
    };
  }, []);

  // ── Chat action handlers ───────────────────────────────────────────────────

  async function handleNewChat() {
    if (!token) {
      clearGuestSession();
      setActiveChatId("guest");
      setActiveMessages([]);
      setSourcePaneSources(null);
      setChatDocuments([]);
      return;
    }
    const chat = await createChat();
    setChats((prev) => [chat, ...prev]);
    setActiveChatId(chat.id);
    setActiveMessages([]);
    setSourcePaneSources(null);
    setChatDocuments([]);
  }

  async function handleSelectChat(id: string) {
    setActiveChatId(id);
    setSourcePaneSources(null);
    setChatDocuments([]); // clear stale docs immediately while loading
    const [messages, docs] = await Promise.all([
      getMessages(id),
      listChatDocuments(id).catch(() => [] as ChatDocument[]),
    ]);
    setActiveMessages(
      messages.map((m: any) => ({
        role: m.role,
        content: m.content,
        created_at: m.created_at,
      }))
    );
    setChatDocuments(docs);
  }

  async function handleDeleteChat(id: string) {
    await deleteChat(id);
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (activeChatId === id) {
      setActiveChatId(null);
      setActiveMessages([]);
      setSourcePaneSources(null);
      setChatDocuments([]);
    }
  }

  async function handleRenameChat(id: string, newTitle: string) {
    const updated = await renameChat(id, newTitle);
    setChats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c))
    );
  }

  async function handlePinChat(id: string, pinned: boolean) {
    const updated = await pinChat(id, pinned);
    setChats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, pinned: updated.pinned } : c))
    );
  }

  function handleModelChange(model: string) {
    if (model === selectedModel) return;
    setSelectedModel(model);
    setActiveChatId(null);
    setActiveMessages([]);
    setSourcePaneSources(null);
    setChatDocuments([]);
    setQuestion("");
    if (!token) clearGuestSession();
  }

  function handleSourceClick(sources: Source[], index: number) {
    if (sourcePaneSources === sources && sourcePaneIndex === index) {
      setSourcePaneSources(null);
      return;
    }
    setSourcePaneSources(sources);
    setSourcePaneIndex(index);
  }

  async function handleRegenerate(index: number) {
    if (!activeChatId) return;
    const assistant = activeMessages[index];
    const user      = activeMessages[index - 1];
    if (!assistant || !user || assistant.role !== "assistant" || user.role !== "user") return;

    setLoading(true);
    setActiveMessages((prev) => {
      const next = [...prev];
      next[index] = { role: "assistant", content: "__loading__", sources: [] };
      return next;
    });

    try {
      const response = await regenerateAnswer(activeChatId, user.content, assistant.sources || []);
      setActiveMessages((prev) => {
        const next = [...prev];
        next[index] = {
          role: "assistant",
          content: response.answer,
          sources: response.sources,
          created_at: new Date().toISOString(),
        };
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleFileSelect(file: File | null) {
    setSelectedFile(file);
  }

  const handleSend = useCallback(
    async (overrideQuestion?: unknown) => {
      const currentQuestion =
        typeof overrideQuestion === "string" ? overrideQuestion : question;

      if ((currentQuestion.trim() === "" && !selectedFile) || loading) return;

      // If the user attached a file but typed nothing, default to a summary
      // request so the backend always gets a meaningful query to embed against.
      const effectiveQuestion =
        currentQuestion.trim() === "" && selectedFile
          ? "Please summarize this document."
          : currentQuestion;

      setQuestion("");
      setLoading(true);
      setSourcePaneSources(null);

      const fileToUpload = selectedFile;
      setSelectedFile(null);

      let chatId = activeChatId;

      if (!chatId) {
        if (token) {
          const chat = await createChat();
          setChats((prev) => [chat, ...prev]);
          setActiveChatId(chat.id);
          chatId = chat.id;
        } else {
          chatId = "guest";
          setActiveChatId(chatId);
        }
      }

      // Whether this chat already had docs before this turn
      const alreadyHasDocs = chatDocuments.length > 0;

      // IMPORTANT: define BEFORE upload
      let uploadedDocThisTurn = false;

      if (fileToUpload && token && chatId && chatId !== "guest") {
          setUploadProgress(0);

          try {
              const doc = await uploadChatDocument(
                  chatId,
                  fileToUpload,
                  setUploadProgress
              );

              uploadedDocThisTurn = true;

              setChatDocuments((prev) => [...prev, doc]);

          } catch {
              // proceed without uploaded document
          } finally {
              setUploadProgress(null);
          }
      }

      const hasDocument = uploadedDocThisTurn || alreadyHasDocs;

      const priorHistory = activeMessages
        .filter((m: any) => !m.thinking && typeof m.content === "string" && m.content.trim() !== "")
        .map((m: any) => ({ role: m.role, content: m.content }));

      setActiveMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: effectiveQuestion,
          file: fileToUpload?.name,
          created_at: new Date().toISOString(),
        },
      ]);

      setActiveMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "",
          thinking: true,
          created_at: new Date().toISOString(),
        },
      ]);

      try {
        await queryInChatStream(
          chatId,
          effectiveQuestion,
          countryRef.current,
          {
            onThinking: () => {},
            onToken: (tok) => {
              setActiveMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (!last || last.role !== "assistant") return prev;
                next[next.length - 1] = {
                  ...last,
                  thinking: false,
                  content: last.content + tok,
                };
                return next;
              });
            },
            onDone: ({ sources }) => {
              setActiveMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (!last || last.role !== "assistant") return prev;
                next[next.length - 1] = { ...last, thinking: false, sources };
                return next;
              });
            },
          },
          hasDocument,
          priorHistory,
          fileToUpload?.name
        );

        if (token) {
          const updatedChats = await listChats();
          setChats(updatedChats);
        }
      } catch {
        setActiveMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant" && last.thinking) {
            next[next.length - 1] = {
              role: "assistant",
              content: "Sorry, something went wrong.",
              created_at: new Date().toISOString(),
            };
            return next;
          }
          return [
            ...prev,
            {
              role: "assistant",
              content: "Sorry, something went wrong.",
              created_at: new Date().toISOString(),
            },
          ];
        });
      } finally {
        setLoading(false);
      }
    },
    [question, loading, activeChatId, token, activeMessages, selectedFile, chatDocuments]
  );

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--background)", overflow: "hidden" }}>
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        onRenameChat={handleRenameChat}
        onPinChat={handlePinChat}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
        onOpenAuthModal={setAuthModal}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px 6px", flexShrink: 0 }}>
          <BackButton fallbackHref="/" />

          {isGuest && (
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: "var(--accent-brown, #8a7357)",
              background: "var(--surface-soft, #faf8f4)",
              border: "1px solid var(--sidebar-border)",
              borderRadius: 999, padding: "4px 12px",
            }}>
              Guest mode · chats aren't saved ·{" "}
              <button
                onClick={() => setAuthModal("signin")}
                style={{ color: "var(--primary)", textDecoration: "none", background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: "inherit", fontWeight: 600 }}
              >Sign in</button>
            </span>
          )}

          {chatDocuments.length > 0 && (
            <span style={{ fontSize: 12, color: "var(--placeholder-text)", marginLeft: "auto" }}>
              📄 {chatDocuments.map((d) => d.name).join(" · ")}
            </span>
          )}
        </div>

        {activeMessages.length === 0 ? (
          <EmptyState
            selectedModel={selectedModel}
            isGuest={isGuest}
            onQuestionClick={(q) => {
              setQuestion(q);
              setTimeout(() => handleSend(q), 0);
            }}
          />
        ) : (
          <ChatWindow
            messages={activeMessages}
            loading={loading}
            onSourceClick={handleSourceClick}
            onRegenerate={handleRegenerate}
          />
        )}

        <div style={{ padding: "12px 24px 20px", background: "var(--background)" }}>
          <InputBar
            value={question}
            onChange={setQuestion}
            onSend={handleSend}
            loading={loading}
            selectedFile={selectedFile}
            uploadedDocuments={chatDocuments}
            onFileSelect={handleFileSelect}
            uploadDisabled={isGuest}
            uploadDisabledReason="Sign in to upload documents"
            uploadProgress={uploadProgress}
          />
        </div>
      </div>

      {sourcePaneSources && sourcePaneSources.length > 0 && (
        <SourcePane
          sources={sourcePaneSources}
          activeIndex={sourcePaneIndex}
          onSelectSource={setSourcePaneIndex}
          onClose={() => setSourcePaneSources(null)}
        />
      )}

      {authModal && (
        <AuthModal
          mode={authModal}
          onSwitchMode={setAuthModal}
          onClose={() => setAuthModal(null)}
          onSuccess={() => {
            setAuthModal(null);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
