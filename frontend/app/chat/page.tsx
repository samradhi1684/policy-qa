"use client";

import { useState, useEffect, useCallback } from "react";

import ChatWindow, { type Message } from "../../components/chatWindow";
import InputBar from "../../components/inputBar";
import Sidebar from "../../components/sideBar";
import EmptyState from "../../components/emptyState";
import SourcePane from "../../components/sourcePane";

import {
  createChat,
  listChats,
  getMessages,
  queryInChatStream,
  regenerateAnswer,
  deleteChat,
  renameChat,
  pinChat,
  type Chat,
  type Source,
} from "../../lib/api";

export default function Home() {

  const [question, setQuestion] =
    useState("");

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

    useEffect(() => {
      console.log(
        "selectedFile:",
        selectedFile
      );
    }, [selectedFile]);

  const [loading, setLoading] =
    useState(false);

  const [sidebarOpen, setSidebarOpen] =
    useState(true);

  const [selectedModel, setSelectedModel] =
    useState("usa");

  const [chats, setChats] =
    useState<Chat[]>([]);

  const [activeChatId, setActiveChatId] =
    useState<string | null>(null);

  const [activeMessages, setActiveMessages] =
    useState<Message[]>([]);


  const [
    sourcePaneSources,
    setSourcePaneSources
  ] = useState<Source[] | null>(
    null
  );

  const [
    sourcePaneIndex,
    setSourcePaneIndex
  ] = useState(0);

  
    useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
        setChats([]);
        return;
    }

    listChats()
        .then(setChats)
        .catch(() => {});
    }, []);



  
    async function handleNewChat() {
    const token = localStorage.getItem("token");

    if (!token) {
        setActiveChatId("guest");
        setActiveMessages([]);
        setSourcePaneSources(null);
        return;
    }

    const chat = await createChat();

    setChats((prev) => [
        chat,
        ...prev,
    ]);

    setActiveChatId(chat.id);

    setActiveMessages([]);
    setSourcePaneSources(null);
    }


  async function handleSelectChat(id: string) {
    setActiveChatId(id);
    setSourcePaneSources(null);

    const messages = await getMessages(id);

    const formatted: Message[] = [];

    for (const m of messages) {
      formatted.push({
        role: m.role,
        content: m.content,
        created_at: m.created_at,
      });
    }

    setActiveMessages(formatted);
  }

  async function handleDeleteChat(
    id: string
  ) {

    await deleteChat(id);

    setChats((prev) =>
      prev.filter(
        (c) =>
          c.id !== id
      )
    );

    if (
      activeChatId === id
    ) {
      setActiveChatId(null);
      setActiveMessages([]);
      setSourcePaneSources(
        null
      );
    }
  }

  async function handleRenameChat(
    id: string,
    newTitle: string
  ) {

    const updated =
      await renameChat(
        id,
        newTitle
      );

    setChats((prev) =>
      prev.map((c) =>

        c.id === id
          ? {
              ...c,
              title: updated.title,
            }
          : c
      )
    );
  }

  async function handlePinChat(
    id: string,
    pinned: boolean
  ) {

    const updated =
      await pinChat(
        id,
        pinned
      );

  setChats((prev) =>
    prev.map((c) =>
      c.id === id
        ? {
            ...c,
            pinned: updated.pinned,
          }
        : c
    )
  );
  }

  function handleSourceClick(
    sources: Source[],
    index: number
  ) {
    if (
      sourcePaneSources === sources &&
      sourcePaneIndex === index
    ) {
      setSourcePaneSources(null);
      return;
    }

    setSourcePaneSources(
      sources
    );

    setSourcePaneIndex(
      index
    );
  }

  async function handleRegenerate(
    index: number
  ) {

    if (!activeChatId)
      return;

    const assistant =
      activeMessages[index];

    const user =
      activeMessages[
        index - 1
      ];

    if (
      !assistant ||
      !user ||
      assistant.role !==
        "assistant" ||
      user.role !==
        "user"
    ) {
      return;
    }

    setLoading(true);
    // remove old assistant answer
    setActiveMessages(
      (prev) => {

        const next =
          [...prev];

        next[index] = {
          role:
            "assistant",
          content:
            "__loading__",
          sources: [],
        };

        return next;
      }
    );
    try {

      const response =
        await regenerateAnswer(
          activeChatId,
          user.content,
          assistant.sources || []
        );

      setActiveMessages(
        (prev) => {
          const next = [...prev];

          next[index] = {
            role: "assistant",
            content: response.answer,
            sources: response.sources,
            created_at:
              new Date().toISOString(),
          };

          return next;
        }
      );

    } finally {
      setLoading(false);
    }
  }

  const handleSend =
    useCallback(
      async (
          overrideQuestion?: any
      ) => {
        console.log(
          "overrideQuestion =",
          overrideQuestion
        );
      const currentQuestion =
        typeof overrideQuestion ===
        "string"
          ? overrideQuestion
          : question;

        console.log(
          "currentQuestion:",
          currentQuestion
        );

        console.log(
          "type:",
          typeof currentQuestion
        );

        if (
          currentQuestion.trim() === "" ||
          loading
        ) {
          return;
        }
          

        setQuestion("");
        setSelectedFile(null);
        setLoading(true);
        setSourcePaneSources(
          null
        );

        let chatId =
          activeChatId;

        
        if (!chatId) {

        const token = localStorage.getItem("token");

        if (token) {

            const chat = await createChat();

            setChats((prev) => [
            chat,
            ...prev,
            ]);

            setActiveChatId(chat.id);

            chatId = chat.id;

        } else {

            chatId = "guest";
            setActiveChatId(chatId);

        }
        }


        setActiveMessages(
          (prev) => [
            ...prev,
            {
              role: "user",
              content: currentQuestion,
              created_at:
                new Date().toISOString(),
            },
          ]
        );

        // File-upload mode still uses the non-streaming /query endpoint
        // (see lib/api.ts: queryInChat) since the backend only streams the
        // plain-RAG path today. Everything below is the plain-RAG,
        // token-by-token streaming path.
        if (selectedFile) {
          const { queryInChat } = await import("../../lib/api");

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
            const response = await queryInChat(
              chatId,
              currentQuestion,
              selectedFile,
            );

            setActiveMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = {
                role: "assistant",
                content: response.answer,
                sources: response.sources,
                created_at: new Date().toISOString(),
                download_url: response.download_url,
                download_type: response.download_type,
              };
              return next;
            });

            const updatedChats = await listChats();
            setChats(updatedChats);
          } catch {
            setActiveMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = {
                role: "assistant",
                content: "Sorry, something went wrong.",
                created_at: new Date().toISOString(),
              };
              return next;
            });
          } finally {
            setLoading(false);
          }

          return;
        }

        // Push a placeholder assistant message that starts in "thinking"
        // state (dots, no text). As SSE events arrive it flips out of
        // thinking and its content grows token by token.
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
            currentQuestion,
            {
              onThinking: () => {
                // Already showing the thinking placeholder from above;
                // nothing to do, but kept as an explicit hook in case the
                // UI wants a distinct "retrieving sources" label later.
              },

              onToken: (token) => {
                setActiveMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];

                  if (!last || last.role !== "assistant") return prev;

                  next[next.length - 1] = {
                    ...last,
                    thinking: false,
                    content: last.content + token,
                  };

                  return next;
                });
              },

              onDone: ({ sources }) => {
                setActiveMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];

                  if (!last || last.role !== "assistant") return prev;

                  next[next.length - 1] = {
                    ...last,
                    thinking: false,
                    sources,
                  };

                  return next;
                });
              },
            }
          );

          
            if (localStorage.getItem("token")) {
                const updatedChats = await listChats();
                setChats(updatedChats);
            }

        } catch {

          setActiveMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];

            // Replace the (still empty/thinking) placeholder with an
            // error message rather than appending a new one.
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
      [
        question,
        loading,
        activeChatId,
      ]
    );

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background:
          "var(--background)",
        overflow:
          "hidden",
      }}
    >
      <Sidebar
        chats={chats}
        activeChatId={
          activeChatId
        }
        isOpen={
          sidebarOpen
        }
        onToggle={() =>
          setSidebarOpen(
            (v) => !v
          )
        }
        onNewChat={
          handleNewChat
        }
        onSelectChat={
          handleSelectChat
        }
        onDeleteChat={
          handleDeleteChat
        }
        onRenameChat={
          handleRenameChat
        }
        onPinChat={
          handlePinChat
        }
        selectedModel={
          selectedModel
        }
        onModelChange={
          setSelectedModel
        }
      />

      <div
        style={{
          flex: 1,
          display:
            "flex",
          flexDirection:
            "column",
          overflow:
            "hidden",
          minWidth: 0,
        }}
      >
        {activeMessages.length ===
        0 ? (
          <EmptyState
            selectedModel={
              selectedModel
            }
            onQuestionClick={(
              q
            ) => {
              setQuestion(q);

              setTimeout(
                () =>
                  handleSend(
                    q
                  ),
                0
              );
            }}
          />
        ) : (
          <ChatWindow
            messages={
              activeMessages
            }
            loading={
              loading
            }
            onSourceClick={
              handleSourceClick
            }
            onRegenerate={
              handleRegenerate
            }
          />
        )}

        <div
          style={{
            padding:
              "12px 24px 20px",
            background:
              "var(--background)",
          }}
        >
          <InputBar
            value={question}
            onChange={setQuestion}
            onSend={handleSend}
            loading={loading}
            selectedFile={selectedFile}
            onFileSelect={setSelectedFile}
  
            
          />
        </div>
      </div>

      {sourcePaneSources &&
        sourcePaneSources.length >
          0 && (
          <SourcePane
            sources={
              sourcePaneSources
            }
            activeIndex={
              sourcePaneIndex
            }
            onSelectSource={
              setSourcePaneIndex
            }
            onClose={() =>
              setSourcePaneSources(
                null
              )
            }
          />
        )}
    </div>
  );
}