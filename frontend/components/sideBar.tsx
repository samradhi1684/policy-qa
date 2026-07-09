"use client";

import { useState, useRef, useEffect } from "react";
import { searchChats, exportChat, type Chat } from "../lib/api";
import {
  PanelLeft,
  Plus,
  MoreVertical,
  MoreHorizontal,
  Pin,
  Pencil,
  Trash2,
  Search,
  Download,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";

const MODELS = [
  { id: "dsire", label: "United States", flag: "🇺🇸" },
  { id: "mnre", label: "India", flag: "🇮🇳" },
];

type Props = {
  chats: Chat[];
  activeChatId: string | null;
  isOpen: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, newTitle: string) => void;
  onPinChat: (id: string, pinned: boolean) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
};

type MenuState = { chatId: string; x: number; y: number } | null;

export default function Sidebar({
  chats,
  activeChatId,
  isOpen,
  onToggle,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onRenameChat,
  onPinChat,
  selectedModel,
  onModelChange,
}: Props) {
  const { user, token, logout } = useAuth();
  const isGuest = !token;
  const [menu, setMenu] = useState<MenuState>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Chat[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedModelObj =
    MODELS.find((m) => m.id === selectedModel) ?? MODELS[0];

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  useEffect(() => {
    if (renamingId) renameRef.current?.focus();
  }, [renamingId]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const runSearch = async () => {
      if (!searchTerm.trim()) {
        setSearchResults(chats);
        return;
      }

      try {
        const results = await searchChats(searchTerm);
        setSearchResults(results);
      } catch (err) {
        console.error("Search failed", err);
      }
    };

    const timer = setTimeout(runSearch, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, chats]);

  function openMenu(e: React.MouseEvent, chatId: string) {
    e.stopPropagation();
    e.preventDefault();
    setMenu({ chatId, x: e.clientX, y: e.clientY });
  }

  function startRename(chatId: string) {
    const chat = chats.find((c) => c.id === chatId);
    setRenameValue(chat?.title ?? "");
    setRenamingId(chatId);
    setMenu(null);
  }

  function commitRename(chatId: string) {
    if (renameValue.trim()) onRenameChat(chatId, renameValue.trim());
    setRenamingId(null);
  }

  async function handleExport(chatId: string, format: "txt" | "md" | "pdf") {
    try {
      const blob = await exportChat(chatId, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chat.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMenu(null);
    } catch (err) {
      console.error(err);
    }
  }

  const filteredChats = searchTerm.trim() ? searchResults : chats;
  const pinned = filteredChats.filter((c) => c.pinned);
  const unpinned = filteredChats.filter((c) => !c.pinned);

  const initial = (user?.username?.charAt(0) || "U").toUpperCase();

  return (
    <>
      <aside
        style={{
          width: isOpen ? "268px" : "0px",
          minWidth: isOpen ? "268px" : "0px",
          background: "var(--sidebar-bg)",
          borderRight: "1px solid var(--sidebar-border)",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: isOpen ? "10px" : "0px",
          overflow: "hidden",
          transition: "width 0.2s, min-width 0.2s, padding 0.2s",
        }}
      >
        <div
          style={{
            width: "248px",
            display: "flex",
            flexDirection: "column",
            height: "100%",
          }}
        >
          {/* Top row: avatar + collapse */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "2px 4px 12px",
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "var(--primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {initial}
            </div>

            <button
              onClick={onToggle}
              title="Collapse sidebar"
              style={{
                padding: "6px",
                borderRadius: "8px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "var(--foreground)",
                display: "flex",
                alignItems: "center",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background =
                  "var(--sidebar-hover)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background =
                  "transparent")
              }
            >
              <PanelLeft size={18} />
            </button>
          </div>

          {/* Model selector pill */}
          <div style={{ position: "relative", marginBottom: "14px" }}>
            <button
              onClick={() => setModelOpen((v) => !v)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "9px 14px",
                borderRadius: "999px",
                border: "none",
                background: "var(--primary)",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 700,
                color: "#fff",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15 }}>{selectedModelObj.flag}</span>
                <span>{selectedModelObj.label}</span>
              </span>

              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                style={{
                  transform: modelOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                  opacity: 0.9,
                  flexShrink: 0,
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {modelOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  right: 0,
                  background: "#fff",
                  border: "1px solid var(--sidebar-border)",
                  borderRadius: "14px",
                  boxShadow: "var(--shadow-md)",
                  zIndex: 50,
                  overflow: "hidden",
                }}
              >
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onModelChange(m.id);
                      setModelOpen(false);
                    }}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 14px",
                      border: "none",
                      background:
                        selectedModel === m.id
                          ? "var(--sidebar-active)"
                          : "#fff",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--foreground)",
                    }}
                  >
                    <span>{m.flag}</span>
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Nav: Search / New chat / More */}
          <div style={{ marginBottom: "10px" }}>
            {searchOpen ? (
              <div style={{ position: "relative", marginBottom: "6px" }}>
                <Search
                  size={14}
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--placeholder-text)",
                  }}
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search chats"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onBlur={() => {
                    if (!searchTerm.trim()) setSearchOpen(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "9px 12px 9px 34px",
                    borderRadius: "10px",
                    border: "1px solid var(--primary-soft-border)",
                    background: "var(--primary-soft)",
                    fontSize: "13px",
                    color: "var(--foreground)",
                    outline: "none",
                  }}
                />
              </div>
            ) : !isGuest ? (
              <NavItem
                icon={<Search size={16} />}
                label="Search Chats"
                onClick={() => setSearchOpen(true)}
              />
            ) : null}

            <NavItem
              icon={<Plus size={16} />}
              label="New Chat"
              onClick={onNewChat}
            />

            <NavItem
              icon={<MoreHorizontal size={16} />}
              label="More"
              onClick={() => {}}
              muted
            />
          </div>

          {/* Chat list */}
          <div style={{ flex: 1, overflowY: "auto", paddingTop: 4 }}>
            {isGuest ? (
              <div
                style={{
                  margin: "8px 6px",
                  padding: "14px 12px",
                  border: "1px dashed var(--sidebar-border)",
                  borderRadius: 12,
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  color: "var(--placeholder-text)",
                }}
              >
                <strong style={{ color: "var(--foreground)" }}>
                  Guest mode
                </strong>
                <br />
                Chat history, renaming, search and document uploads are only
                available with an account.
                <a
                  href="/signin"
                  style={{
                    display: "block",
                    marginTop: 10,
                    color: "var(--primary)",
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  Sign in to save your chats →
                </a>
              </div>
            ) : filteredChats.length === 0 ? (
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--placeholder-text)",
                  padding: "4px 10px",
                }}
              >
                {searchTerm ? "No matching chats" : "No chats yet"}
              </p>
            ) : (
              <>
                {pinned.length > 0 && (
                  <>
                    <SectionLabel>Pinned</SectionLabel>
                    {pinned.map((chat) => (
                      <ChatRow
                        key={chat.id}
                        chat={chat}
                        isActive={chat.id === activeChatId}
                        isRenaming={renamingId === chat.id}
                        renameValue={renameValue}
                        renameRef={renameRef}
                        onSelect={() => onSelectChat(chat.id)}
                        onOpenMenu={(e) => openMenu(e, chat.id)}
                        onRenameChange={setRenameValue}
                        onRenameCommit={() => commitRename(chat.id)}
                      />
                    ))}
                  </>
                )}

                {unpinned.length > 0 && (
                  <>
                    <SectionLabel>Recents</SectionLabel>
                    {unpinned.map((chat) => (
                      <ChatRow
                        key={chat.id}
                        chat={chat}
                        isActive={chat.id === activeChatId}
                        isRenaming={renamingId === chat.id}
                        renameValue={renameValue}
                        renameRef={renameRef}
                        onSelect={() => onSelectChat(chat.id)}
                        onOpenMenu={(e) => openMenu(e, chat.id)}
                        onRenameChange={setRenameValue}
                        onRenameCommit={() => commitRename(chat.id)}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </div>

          {/* User profile */}
          <div
            style={{
              borderTop: "1px solid var(--sidebar-border)",
              paddingTop: "8px",
              marginTop: "8px",
            }}
          >
            <button
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 10px",
                borderRadius: "10px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background =
                  "var(--sidebar-hover)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background =
                  "transparent")
              }
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: "var(--primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {initial}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--foreground)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {user?.username ?? "Guest"}
                </span>

                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--placeholder-text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {user?.email}
                </span>
              </div>
            </button>

            
            {isGuest ? (
              <button
                onClick={() => window.location.href = "/signup"}
                style={{
                  width: "100%",
                  marginTop: "6px",
                  padding: "10px",
                  borderRadius: "10px",
                  border: "none",
                  background: "var(--primary)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                Create an Account
              </button>
            ) : (
              <button
                onClick={() => {
                  logout();
                  window.location.replace("/signin");
                }}
                style={{
                  width: "100%",
                  marginTop: "6px",
                  padding: "8px",
                  borderRadius: "10px",
                  border: "1px solid var(--sidebar-border)",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: "13px",
                  color: "#ef4444",
                }}
              >
                Logout
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Expand button shown when sidebar is closed */}
      {!isOpen && (
        <button
          onClick={onToggle}
          title="Open sidebar"
          style={{
            position: "fixed",
            left: "12px",
            top: "12px",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            border: "1px solid var(--sidebar-border)",
            background: "var(--sidebar-bg)",
            color: "var(--foreground)",
            cursor: "pointer",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <PanelLeft size={18} />
        </button>
      )}

      {/* Context menu */}
      {menu && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: menu.y,
            left: menu.x,
            zIndex: 100,
            minWidth: "190px",
            borderRadius: "14px",
            border: "1px solid var(--sidebar-border)",
            background: "#fff",
            padding: "6px 0",
            fontSize: "14px",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {(() => {
            const chat = chats.find((c) => c.id === menu.chatId);
            if (!chat) return null;
            return (
              <>
                <ContextMenuItem
                  icon={<Pin size={15} />}
                  label={chat.pinned ? "Unpin" : "Pin Chat"}
                  onClick={() => {
                    onPinChat(menu.chatId, !chat.pinned);
                    setMenu(null);
                  }}
                />
                <ContextMenuItem
                  icon={<Pencil size={15} />}
                  label="Rename Chat"
                  onClick={() => startRename(menu.chatId)}
                />
                <div
                  style={{
                    margin: "4px 0",
                    borderTop: "1px solid var(--sidebar-border)",
                  }}
                />
                <ContextMenuItem
                  icon={<Trash2 size={15} />}
                  label="Delete Chat"
                  onClick={() => {
                    onDeleteChat(menu.chatId);
                    setMenu(null);
                  }}
                  danger
                />
                <ExportMenuItem
                  onExportTxt={() => handleExport(menu.chatId, "txt")}
                  onExportMd={() => handleExport(menu.chatId, "md")}
                  onExportPdf={() => handleExport(menu.chatId, "pdf")}
                />
              </>
            );
          })()}
        </div>
      )}
    </>
  );
}

// ── NavItem ──────────────────────────────────────────────────────────────────

function NavItem({
  icon,
  label,
  onClick,
  muted,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "9px 10px",
        borderRadius: "10px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: 500,
        color: muted ? "var(--placeholder-text)" : "var(--foreground)",
        marginBottom: "2px",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLButtonElement).style.background =
          "var(--sidebar-hover)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLButtonElement).style.background =
          "transparent")
      }
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: "11px",
        fontWeight: 700,
        color: "var(--placeholder-text)",
        padding: "10px 10px 6px",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {children}
    </p>
  );
}

// ── ChatRow ───────────────────────────────────────────────────────────────────

type ChatRowProps = {
  chat: Chat;
  isActive: boolean;
  isRenaming: boolean;
  renameValue: string;
  renameRef: React.RefObject<HTMLInputElement | null>;
  onSelect: () => void;
  onOpenMenu: (e: React.MouseEvent) => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
};

function ChatRow({
  chat,
  isActive,
  isRenaming,
  renameValue,
  renameRef,
  onSelect,
  onOpenMenu,
  onRenameChange,
  onRenameCommit,
}: ChatRowProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        borderRadius: "10px",
        marginBottom: "2px",
        background: isActive
          ? "var(--sidebar-active)"
          : hovered
          ? "var(--sidebar-hover)"
          : "transparent",
      }}
    >
      <button
        onClick={onSelect}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          padding: "8px 10px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
        }}
      >
        {isRenaming ? (
          <input
            ref={renameRef}
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onBlur={onRenameCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") onRenameCommit();
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              borderRadius: "6px",
              border: "1px solid var(--primary-soft-border)",
              padding: "2px 6px",
              fontSize: "13px",
              outline: "none",
            }}
          />
        ) : (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "14px",
              color: isActive ? "var(--primary)" : "var(--foreground)",
              fontWeight: isActive ? 600 : 400,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {chat.pinned && (
              <Pin size={11} style={{ flexShrink: 0, opacity: 0.5 }} />
            )}
            {chat.title}
          </span>
        )}
      </button>

      {!isRenaming && (hovered || isActive) && (
        <button
          onClick={onOpenMenu}
          title="Options"
          style={{
            marginRight: "6px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "26px",
            height: "26px",
            borderRadius: "8px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "var(--foreground)",
            opacity: 0.6,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "rgba(109,95,240,0.12)";
            (e.currentTarget as HTMLButtonElement).style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "transparent";
            (e.currentTarget as HTMLButtonElement).style.opacity = "0.6";
          }}
        >
          <MoreVertical size={15} />
        </button>
      )}
    </div>
  );
}

// ── ContextMenuItem ───────────────────────────────────────────────────────────

function ContextMenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "9px 14px",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        fontSize: "14px",
        color: danger ? "#ef4444" : "var(--foreground)",
        background: hovered
          ? danger
            ? "#fff1f1"
            : "var(--sidebar-hover)"
          : "transparent",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ── ExportMenuItem (Export Chat with nested TXT/Markdown/PDF) ────────────────

function ExportMenuItem({
  onExportTxt,
  onExportMd,
  onExportPdf,
}: {
  onExportTxt: () => void;
  onExportMd: () => void;
  onExportPdf: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
          padding: "9px 14px",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontSize: "14px",
          color: "var(--foreground)",
          background: hovered || open ? "var(--sidebar-hover)" : "transparent",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Download size={15} />
          Export Chat
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          style={{ opacity: 0.6 }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "calc(100% + 4px)",
            minWidth: "150px",
            borderRadius: "12px",
            border: "1px solid var(--sidebar-border)",
            background: "#fff",
            padding: "6px 0",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <ContextMenuItem icon={null} label="TXT" onClick={onExportTxt} />
          <ContextMenuItem icon={null} label="Markdown" onClick={onExportMd} />
          <ContextMenuItem icon={null} label="PDF" onClick={onExportPdf} />
        </div>
      )}
    </div>
  );
}
