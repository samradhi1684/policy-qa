"use client";

import { useState, useEffect, useCallback } from "react";

import ChatWindow, { type Message } from "../components/chatWindow";
import InputBar from "../components/inputBar";
import Sidebar from "../components/sideBar";
import EmptyState from "../components/emptyState";
import SourcePane from "../components/sourcePane";

import {
  createChat,
  listChats,
  getChat,
  getMessages,
  queryInChat,
  regenerateAnswer,
  deleteChat,
  renameChat,
  pinChat,
  type Chat,
  type Source,
} from "../lib/api";

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
    useState("dsire");

  const [chats, setChats] =
    useState<Chat[]>([]);

  const [activeChatId, setActiveChatId] =
    useState<string | null>(null);

  const [activeMessages, setActiveMessages] =
    useState<Message[]>([]);

  const [webSearch, setWebSearch] =
  useState(false);

  useEffect(() => {
  console.log(
    "webSearch state:",
    webSearch
  );
}, [webSearch]);

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
    listChats()
      .then(setChats)
      .catch(() => {});
  }, []);



  async function handleNewChat() {
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

          const chat =
            await createChat();

          setChats(
            (prev) => [
              chat,
              ...prev,
            ]
          );

          setActiveChatId(
            chat.id
          );

          chatId =
            chat.id;
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

        try {

          console.log(
            "QUESTION SENT:",
            currentQuestion
          );

          console.log(
            "WEB SEARCH:",
            webSearch
          );

          const response =
            await queryInChat(
              chatId,
              currentQuestion,
              selectedFile || undefined,
              webSearch
            );

          console.log("FULL RESPONSE:", response);
          console.log("DOWNLOAD URL:", response.download_url);
          console.log("DOWNLOAD TYPE:", response.download_type);

          const combinedSources: Source[] = [
            ...(response.sources || []),

            ...((response.web_sources || []).map(
              (w: any, idx: number) => ({
                chunk_id: `web-${idx}`,
                document_id: w.title,
                chunk_text: w.content,

                token_start: 0,
                token_end: 0,

                evidence: w.url,
                score: 1,

                highlight_spans: [],

                is_web: true,
              } as Source))
            ),
          ];

          console.log(
            "DOWNLOAD URL RECEIVED:",
            response.download_url
          );

          setActiveMessages(
            (prev) => [
              ...prev,
              {
                role:
                  "assistant",
                content:
                  response.answer,
                sources:
                  combinedSources,
                created_at:
                  new Date().toISOString(),

                download_url:
                  response.download_url,

                download_type:
                  response.download_type,
              },
            ]
          );

          const updatedChats =
            await listChats();

          setChats(updatedChats);

        } catch {

          setActiveMessages(
            (prev) => [
              ...prev,
              {
                role:
                  "assistant",
                content:
                  "Sorry, something went wrong.",
                created_at:
                    new Date().toISOString(),
              },
            ]
          );

        } finally {
          setLoading(false);
        }
      },
      [
        question,
        loading,
        activeChatId,
        webSearch,
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
            webSearch={webSearch}
            onWebSearchChange={(value) => {
              console.log(
                "checkbox changed:",
                value
              );

              setWebSearch(value);
            }}
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