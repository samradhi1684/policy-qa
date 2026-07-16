const BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://127.0.0.1:8000";

export type Source = {
  chunk_id: string;
  document_id: string;
  title?: string;
  used?: boolean;
  score: number;
  chunk_text: string;

  // semantic evidence extracted by backend
  evidence: string;

  // original chunk token range
  token_start: number;
  token_end: number;

  // NEW: exact highlight offsets
  highlight_spans: {
    start: number;
    end: number;
  }[];
};

export type Message = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;

  download_url?: string;
  download_type?: string;
};

export type ChatMessage = {
  question: string;
  answer: string;
  sources: Source[];
};

export type Chat = {
  id: string;
  title: string;
  created_at: string;
  user_id?: string;
  pinned: boolean
};

export async function createChat(): Promise<Chat> {
  const token =
    localStorage.getItem("token");

  const res = await fetch(
    `${BASE}/chats`,
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    throw new Error(
      "Failed to create chat"
    );
  }

  return res.json();
}

export async function listChats(): Promise<Chat[]> {
  const token = localStorage.getItem("token");

  const res = await fetch(
    `${BASE}/chats`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    throw new Error("Failed to list chats");
  }

  return res.json();
}

export async function getChat(chatId: string): Promise<Chat> {
  const token = localStorage.getItem("token");

  const res = await fetch(
    `${BASE}/chats/${chatId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) throw new Error("Failed to get chat");

  return res.json();
}
export interface WebSource {
  url: string;
  title: string;
  content: string;
  score?: number;
}
export async function queryInChat(
  chatId: string,
  question: string,
  file?: File,
  webSearch: boolean = false,
  country: string = "dsire",
  history?: { role: string; content: string }[]
): Promise<{
  answer: string;
  sources: Source[];

  download_url?: string;
  download_type?: string;
}> {
  const token =
    localStorage.getItem("token");

  // Document mode with file upload
  if (file) {
    const formData =
      new FormData();

    formData.append(
      "question",
      question
    );

    formData.append(
      "file",
      file
    );

    formData.append(
      "web_search",
      String(webSearch)
    );

    formData.append("country", country);

    if (!token && history && history.length > 0) {
      formData.append("client_history", JSON.stringify(history));
    }

    const res =
      await fetch(
        `${BASE}/chats/${chatId}/query`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${token}`,
          },
          body: formData,
        }
      );

    if (!res.ok) {
      throw new Error(
        "Failed to query"
      );
    }

    return res.json();
  }

  // RAG mode with optional web search
  const formData = new FormData();

  formData.append(
    "question",
    question
  );

  formData.append(
    "web_search",
    String(webSearch)
  );

  formData.append("country", country);

  if (!token && history && history.length > 0) {
    formData.append("client_history", JSON.stringify(history));
  }

  const res = await fetch(
    `${BASE}/chats/${chatId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  if (!res.ok) {
    throw new Error(
      "Failed to query"
    );
  }

  return res.json();
}


export async function deleteChat(chatId: string): Promise<void> {
  const token = localStorage.getItem("token");

  const res = await fetch(
    `${BASE}/chats/${chatId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) throw new Error("Failed to delete chat");
}

export async function renameChat(
  chatId: string,
  title: string
): Promise<Chat> {
  const token = localStorage.getItem("token");

  const res = await fetch(
    `${BASE}/chats/${chatId}/rename`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title }),
    }
  );

  if (!res.ok) {
    throw new Error("Failed to rename chat");
  }

  return res.json();
}

export async function pinChat(
  chatId: string,
  pinned: boolean
): Promise<Chat> {
  const token = localStorage.getItem("token");

  const res = await fetch(
    `${BASE}/chats/${chatId}/pin`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ pinned }),
    }
  );

  if (!res.ok) throw new Error("Failed to pin chat");

  return res.json();
}

export async function searchChats(
  query: string
): Promise<Chat[]> {

  const token =
    localStorage.getItem("token");

  const res = await fetch(
    `${BASE}/chats/search?q=${encodeURIComponent(query)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok)
    throw new Error("Failed to search chats");

  return res.json();
}

export async function exportChat(
  chatId: string,
  format: "txt" | "md" | "pdf"
) {
  const token =
    localStorage.getItem(
      "token"
    );

  const response =
    await fetch(
      `${BASE}/chats/${chatId}/export?format=${format}`,
      {
        headers: {
          Authorization:
            `Bearer ${token}`,
        },
      }
    );

  if (!response.ok) {
    throw new Error(
      "Export failed"
    );
  }

  return response.blob();
}

export async function regenerateAnswer(
  chatId: string,
  question: string,
  sources: Source[]
): Promise<{
  answer: string;
  sources: Source[];
  web_sources?: WebSource[];
}> {

  const token =
    localStorage.getItem("token");

  const res = await fetch(
    `${BASE}/chats/${chatId}/regenerate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        question,
        sources,
      }),
    }
  );

  if (!res.ok)
    throw new Error("Failed to regenerate");

  return res.json();
}


export async function queryInChatStream(
  chatId: string,
  question: string,
  country: string,
  handlers: {
    onThinking?: () => void;
    onToken?: (token: string) => void;
    onDone?: (payload: {
      sources: Source[];
      title?: string | null;
    }) => void;
    onError?: (err: unknown) => void;
  },
  history?: { role: string; content: string }[]
): Promise<void> {

  const token = localStorage.getItem("token");

  const formData = new FormData();
  formData.append("question", question);
  formData.append("country", country);

  // Guests have no DB-backed chat/messages row on the backend, so without
  // this the router/planner never see prior turns and follow-ups like
  // "what are the rounds involved in it?" can never be resolved. Only
  // needed (and only sent) when there's no logged-in user — authenticated
  // chats get their history from the DB server-side.
  if (!token && history && history.length > 0) {
    formData.append("client_history", JSON.stringify(history));
  }


  const res = await fetch(
    `${BASE}/chats/${chatId}/query/stream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  if (!res.ok || !res.body) {
    const err = new Error("Failed to stream response");
    handlers.onError?.(err);
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const rawEvent of events) {

      const line = rawEvent
        .split("\n")
        .find((l) => l.startsWith("data: "));

      if (!line) continue;

      let payload: any;

      try {
        payload = JSON.parse(line.slice(6));
      } catch {
        continue;
      }

      if (payload.status === "thinking") {
        handlers.onThinking?.();
      }
      else if (typeof payload.token === "string") {
        handlers.onToken?.(payload.token);
      }
      else if (payload.done) {
        handlers.onDone?.({
          sources: payload.sources || [],
          title: payload.title,
        });
      }
    }
  }
}


export async function getMessages(chatId: string) {
  const token = localStorage.getItem("token");

  const res = await fetch(
    `${BASE}/chats/${chatId}/messages`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    throw new Error("Failed to get messages");
  }

  return res.json();
}

export async function fetchDocument(
  documentId: string
): Promise<string> {
  const token = localStorage.getItem("token");

  const res = await fetch(
    `${BASE}/document/${encodeURIComponent(documentId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    throw new Error("Failed to fetch document");
  }

  const data = await res.json();

  return data.markdown;
}
export type ChatDocument = {
  id: string;
  name: string;
  chat_id: string;
  num_chunks: number;
  created_at?: string;
};

/**
 * Upload a document into a chat session so it participates in retrieval.
 * Uses XHR (not fetch) so real upload progress can be reported.
 * Requires an authenticated session — guests cannot upload.
 */
export function uploadChatDocument(
  chatId: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<ChatDocument> {
  const token = localStorage.getItem("token");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/chats/${chatId}/documents`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid upload response"));
        }
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send((() => { const fd = new FormData(); fd.append("file", file); return fd; })());
  });
}

export async function listChatDocuments(
  chatId: string
): Promise<ChatDocument[]> {
  const token = localStorage.getItem("token");

  const res = await fetch(`${BASE}/chats/${chatId}/documents`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error("Failed to list documents");
  return res.json();
}

/**
 * Resolve human-readable titles for a set of document ids.
 * The backend caches generated titles, so repeat calls are cheap.
 */
export async function fetchDocumentTitles(
  documentIds: string[]
): Promise<Record<string, string>> {
  if (documentIds.length === 0) return {};

  const res = await fetch(`${BASE}/document/titles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_ids: documentIds }),
  });

  if (!res.ok) throw new Error("Failed to fetch document titles");
  const data = await res.json();
  return data.titles ?? {};
}