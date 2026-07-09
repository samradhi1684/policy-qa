"use client";

import { useState, useEffect, useCallback, useRef } from "react";

import ChatWindow, { type Message } from "../../components/chatWindow";
import InputBar from "../../components/inputBar";
import Sidebar from "../../components/sideBar";
import EmptyState from "../../components/emptyState";
import SourcePane from "../../components/sourcePane";
import BackButton from "../../components/backButton";

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

const DEFAULT_COUNTRY = "dsire"; // matches the sidebar MODELS ids

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

  const [sourcePaneSources, setSourcePaneSources] = useState<Source[] | null>(
    null
  );
  const [sourcePaneIndex, setSourcePaneIndex] = useState(0);

  // Latest country, readable inside async closures without re-binding.
  const countryRef = useRef(selectedModel);
  countryRef.current = selectedModel;

  /**
   * SECURITY: wipe everything belonging to a session from component state.
   * Called on logout, on bfcache restore without a token, and whenever the
   * token disappears (e.g. logout in another tab). This is what prevents
   * the "press back after logout and see the old account's chats" bug —
   * the page can be restored from the browser's back/forward cache with
   * its old React state intact, so we re-validate on every restore.
   */
  const clearSessionState = useCallback(() => {
    setChats([]);
    setActiveChatId(null);
    setActiveMessages([]);
    setSourcePaneSources(null);
    setChatDocuments([]);
  }, []);

  // Load chats only for authenticated users.
  useEffect(() => {
    if (!ready) return;

    if (!token) {
      clearSessionState();
      return;
    }

    listChats().then(setChats).catch(() => {});
  }, [token, ready, clearSessionState]);

  // Guard against bfcache restores exposing a logged-out session's data.
  useEffect(() => {
    function revalidate() {
      if (!localStorage.getItem("token")) {
        clearSessionState();
      }
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
  }, [clearSessionState]);

  async function handleNewChat() {
    if (!token) {
      // Guest: temporary, in-memory conversation only.
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

    const messages = await getMessages(id);
    setActiveMessages(
      messages.map((m: any) => ({
        role: m.role,
        content: m.content,
        created_at: m.created_at,
      }))
    );

    // Restore this chat's uploaded documents so they show in the UI.
    listChatDocuments(id)
      .then(setChatDocuments)
      .catch(() => setChatDocuments([]));
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

  /**
   * Switching country resets the conversation context so no stale
   * welcome copy, suggestions, or cross-country answers linger.
   */
  function handleModelChange(model: string) {
    if (model === selectedModel) return;
    setSelectedModel(model);
    setActiveChatId(null);
    setActiveMessages([]);
    setSourcePaneSources(null);
    setChatDocuments([]);
    setQuestion("");
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
    const user = activeMessages[index - 1];

    if (
      !assistant ||
      !user ||
      assistant.role !== "assistant" ||
      user.role !== "user"
    ) {
      return;
    }

    setLoading(true);
    setActiveMessages((prev) => {
      const next = [...prev];
      next[index] = { role: "assistant", content: "__loading__", sources: [] };
      return next;
    });

    try {
      const response = await regenerateAnswer(
        activeChatId,
        user.content,
        assistant.sources || []
      );

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

  /**
   * Upload a document into the current chat so it joins retrieval.
   * Guests cannot reach this path (upload is disabled in the input bar).
   */
  async function handleFileSelect(file: File | null) {
    setSelectedFile(file);
    if (!file || !token) return;

    // Ensure there is a persisted chat to attach the document to.
    let chatId = activeChatId;
    if (!chatId || chatId === "guest") {
      const chat = await createChat();
      setChats((prev) => [chat, ...prev]);
      setActiveChatId(chat.id);
      chatId = chat.id;
    }

    setUploadProgress(0);
    try {
      const doc = await uploadChatDocument(chatId, file, setUploadProgress);
      setChatDocuments((prev) => [...prev, doc]);
      setActiveMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `**${doc.name}** was added to this chat. You can now ask questions about it — for example, *"What are the incentives?"*`,
          created_at: new Date().toISOString(),
        },
      ]);
      setSelectedFile(null);
    } catch {
      setActiveMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, that document could not be uploaded.",
          created_at: new Date().toISOString(),
        },
      ]);
      setSelectedFile(null);
    } finally {
      setUploadProgress(null);
    }
  }

  const handleSend = useCallback(
    async (overrideQuestion?: unknown) => {
      const currentQuestion =
        typeof overrideQuestion === "string" ? overrideQuestion : question;

      if (currentQuestion.trim() === "" || loading) return;

      setQuestion("");
      setLoading(true);
      setSourcePaneSources(null);

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

      setActiveMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: currentQuestion,
          created_at: new Date().toISOString(),
        },
      ]);


      // Placeholder assistant message in "thinking" state.
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
        await queryInChatStream(chatId, currentQuestion, countryRef.current, {
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
            }
          };

          onDone: ({ sources }) => {
            setActiveMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (!last || last.role !== "assistant") return prev;
              next[next.length - 1] = { ...last, thinking: false, sources };
              return next;
            });
          },
        },);

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
    [question, loading, activeChatId, token, ]
  );

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "var(--background)",
        overflow: "hidden",
      }}
    >
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
      />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {/* Top bar: consistent back button + guest indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 16px 6px",
            flexShrink: 0,
          }}
        >
          <BackButton fallbackHref="/" />

          {isGuest && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--accent-brown, #8a7357)",
                background: "var(--surface-soft, #faf8f4)",
                border: "1px solid var(--sidebar-border)",
                borderRadius: 999,
                padding: "4px 12px",
              }}
            >
              Guest mode · chats aren’t saved ·{" "}
              <a
                href="/signin"
                style={{ color: "var(--primary)", textDecoration: "none" }}
              >
                Sign in
              </a>
            </span>
          )}

          {chatDocuments.length > 0 && (
            <span
              style={{
                fontSize: 12,
                color: "var(--placeholder-text)",
                marginLeft: "auto",
              }}
            >
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

        <div
          style={{
            padding: "12px 24px 20px",
            background: "var(--background)",
          }}
        >
          <InputBar
            value={question}
            onChange={setQuestion}
            onSend={handleSend}
            loading={loading}
            selectedFile={selectedFile}
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
    </div>
  );
}
