"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fetchDocument,
  fetchDocumentTitles,
  type Source,
} from "../lib/api";
import DocumentViewer from "./documentViewer";
import { X, FileText, Globe, ExternalLink, ChevronDown } from "lucide-react";

type Props = {
  sources: Source[];
  activeIndex: number;
  onSelectSource: (index: number) => void;
  onClose: () => void;
};

type Category = "all" | "docs" | "web";

const PAGE_SIZE = 4;

// Show exactly the sources the model actually cited in its answer; the
// remaining retrieval/reranker candidates are hidden behind an explicit
// "Show retrieved passages" toggle rather than presented as evidence.
function defaultVisibleCount(list: Source[]): number {
  const used = list.filter((s) => s.used).length;
  return used > 0 ? used : Math.min(1, list.length);
}

export default function SourcePane({
  sources,
  activeIndex,
  onSelectSource,
  onClose,
}: Props) {
  const [category, setCategory] = useState<Category>("all");
  const [visibleCount, setVisibleCount] = useState(() =>
    defaultVisibleCount(sources)
  );
  const [expandedIndex, setExpandedIndex] = useState<number | null>(
    activeIndex ?? null
  );

  const [documents, setDocuments] = useState<
    Record<string, string>
  >({});

  // Which expanded card the user explicitly opened the full document for.
  const [fullDocOpen, setFullDocOpen] = useState<Record<string, boolean>>({});

  // Human-readable titles resolved (and cached) by the backend.
  const [titles, setTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    const ids = Array.from(
      new Set(
        sources
          .filter((s) => !(s as any).is_web)
          .map((s) => s.document_id)
      )
    ).filter((id) => !(id in titles));

    if (ids.length === 0) return;

    fetchDocumentTitles(ids)
      .then((t) => setTitles((prev) => ({ ...prev, ...t })))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources]);

  function displayTitle(s: Source): string {
    if ((s as any).is_web) return s.document_id;
    if (s.document_id.startsWith("upload-")) {
      // Uploaded docs: title comes from the backend but also lives in
      // the session store.  Fall back to a clean "Uploaded document" label.
      return titles[s.document_id] ?? "Uploaded document";
    }
    // Corpus docs: show a loading hint while the async LLM title resolves.
    return titles[s.document_id] ?? "Loading title…";
  }

  const DEFAULT_PANEL_WIDTH = 950;

  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);

  const resizing = useRef(false);

  const filtered = useMemo(() => {
    if (category === "all") return sources;
    if (category === "web") return sources.filter((s) => (s as any).is_web);
    return sources.filter((s) => !(s as any).is_web);
  }, [sources, category]);

  function selectCategory(next: Category, nextList: Source[]) {
    setCategory(next);
    setVisibleCount(defaultVisibleCount(nextList));
  }

  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visible.length;

  function handleToggle(index: number, sourceGlobalIndex: number) {
    setExpandedIndex((prev) => (prev === index ? null : index));
    onSelectSource(sourceGlobalIndex);
  }


  useEffect(() => {
    if (expandedIndex === null) return;

    const src = sources[expandedIndex];
    if (!src) return;
    if ((src as any).is_web) return;

    // Only load the full markdown after the user explicitly clicks
    // "Open full document" — the initial expanded view shows just the
    // highlighted cited section.
    if (!fullDocOpen[src.chunk_id]) return;
    if (documents[src.document_id]) return;

    fetchDocument(src.document_id)
      .then((markdown) => {
        setDocuments((prev) => ({
          ...prev,
          [src.document_id]: markdown,
        }));
      })
      .catch(console.error);
  }, [expandedIndex, sources, documents, fullDocOpen]);


  useEffect(() => {
  function onMouseMove(e: MouseEvent) {
    if (!resizing.current) return;

    const width = window.innerWidth - e.clientX;

    setPanelWidth(
      Math.max(
        650,
        Math.min(1400, width)
      )
    );
  }

  function onMouseUp() {
    resizing.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  window.addEventListener(
    "mousemove",
    onMouseMove
  );

  window.addEventListener(
    "mouseup",
    onMouseUp
  );

  return () => {
    window.removeEventListener(
      "mousemove",
      onMouseMove
    );

    window.removeEventListener(
      "mouseup",
      onMouseUp
    );
  };
  }, []);

  function sourcesToText(): string {
    return sources
      .map((s, i) => {
        const title = displayTitle(s);
        const desc = (s as any).is_web ? s.chunk_text : s.evidence;
        const link = (s as any).is_web ? s.evidence : "";
        return `${i + 1}. ${title}\n${desc || ""}${link ? `\n${link}` : ""}\n`;
      })
      .join("\n");
  }

  function exportTxt() {
    downloadBlob(sourcesToText(), "sources.txt", "text/plain");
  }

  function exportMarkdown() {
    const md = sources
      .map((s, i) => {
        const title = displayTitle(s);
        const desc = (s as any).is_web ? s.chunk_text : s.evidence;
        const link = (s as any).is_web ? s.evidence : "";
        return `**${i + 1}. ${title}**\n\n${desc || ""}${
          link ? `\n\n[Open source](${link})` : ""
        }\n`;
      })
      .join("\n---\n\n");
    downloadBlob(md, "sources.md", "text/markdown");
  }

  function exportPdf() {
    const win = window.open("", "_blank");
    if (!win) return;
    const rows = sources
      .map((s, i) => {
        const title = displayTitle(s);
        const desc = (s as any).is_web ? s.chunk_text : s.evidence;
        return `<h3>${i + 1}. ${escapeHtml(title)}</h3><p>${escapeHtml(
          desc || ""
        )}</p>`;
      })
      .join("<hr/>");
    win.document.write(
      `<html><head><title>Sources</title></head><body>${rows}</body></html>`
    );
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div
      style={{
        width: panelWidth,
        position: "relative",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderLeft: "1px solid var(--sidebar-border)",
        background: "var(--sources-bg)",
        overflow: "hidden",
      }}
    >

    <div
      onMouseDown={() => {
        resizing.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onDoubleClick={() => setPanelWidth(DEFAULT_PANEL_WIDTH)}
      style={{
        position: "absolute",
        left: -5,
        top: 0,
        bottom: 0,
        width: 10,
        cursor: "col-resize",
        zIndex: 100,
        background: "#e5e7eb",
      }}
    />


      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 18px 12px",
          flexShrink: 0,
        }}
      >
        <span
          style={{ fontSize: 18, fontWeight: 700, color: "var(--primary)" }}
        >
          Supporting evidence ({sources.filter((s) => s.used).length || 1})
        </span>
        <button
          onClick={onClose}
          title="Close"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--placeholder-text)",
            padding: "4px",
            borderRadius: 8,
            display: "flex",
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Category tabs */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          padding: "0 18px 14px",
          flexShrink: 0,
        }}
      >
        <TabPill
          active={category === "all"}
          label="All"
          onClick={() => selectCategory("all", sources)}
        />
        <TabPill
          active={category === "docs"}
          label="Documents"
          icon={<FileText size={13} />}
          onClick={() =>
            selectCategory(
              "docs",
              sources.filter((s) => !(s as any).is_web)
            )
          }
        />
        <TabPill
          active={category === "web"}
          label="Web Links"
          icon={<Globe size={13} />}
          onClick={() =>
            selectCategory(
              "web",
              sources.filter((s) => (s as any).is_web)
            )
          }
        />
      </div>

      {/* Source list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px" }}>
        {visible.map((src) => {
          const globalIndex = sources.indexOf(src);
          const isWeb = Boolean((src as any).is_web);
          const isExpanded = expandedIndex === globalIndex;
          const description = isWeb ? src.chunk_text : cleanChunkText(src.evidence || src.chunk_text);

          return (
            <div
              key={src.chunk_id}
              style={{
                border: "1px solid var(--sidebar-border)",
                borderRadius: 14,
                padding: "14px 14px",
                marginBottom: 10,
                background: "#fff",
                cursor: "pointer",
              }}
              onClick={() => handleToggle(globalIndex, globalIndex)}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--foreground)",
                      }}
                    >
                      {displayTitle(src)}
                    </span>

                    {src.used && <UsedBadge />}

                    <TypeBadge isWeb={isWeb} />
                    <ScoreBadge score={src.score} />
                    
                  </div>

                
                </div>

                {isWeb ? (
                  <a
                    href={src.evidence}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flexShrink: 0,
                      color: "var(--primary)",
                      display: "flex",
                      padding: 4,
                    }}
                  >
                    <ExternalLink size={16} />
                  </a>
                ) : (
                  <ChevronDown
                    size={16}
                    style={{
                      flexShrink: 0,
                      color: "var(--placeholder-text)",
                      transform: isExpanded
                        ? "rotate(180deg)"
                        : "rotate(0deg)",
                      transition: "transform .15s",
                    }}
                  />
                )}
              </div>

              {isExpanded && !isWeb && (
                <div
                  style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: "1px solid var(--sidebar-border)",
                  }}
                >
                  {!fullDocOpen[src.chunk_id] ? (
                    <>
                      {/* Cited section only, with evidence highlighted */}
                      <div
                        style={{
                          fontSize: 13,
                          lineHeight: 1.7,
                          color: "var(--foreground)",
                          whiteSpace: "pre-wrap",
                        }}
                        dangerouslySetInnerHTML={{
                          __html: buildHighlightedChunk(
                            cleanChunkText(src.chunk_text),
                            src.highlight_spans || []
                          ),
                        }}
                      />

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFullDocOpen((prev) => ({
                            ...prev,
                            [src.chunk_id]: true,
                          }));
                        }}
                        style={{
                          marginTop: 10,
                          padding: "7px 14px",
                          borderRadius: 10,
                          border: "1px solid var(--primary-soft-border)",
                          background: "var(--primary-soft)",
                          color: "var(--primary)",
                          fontSize: 12.5,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Open full document
                      </button>
                    </>
                  ) : (
                    <div onClick={(e) => e.stopPropagation()}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          marginBottom: 8,
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setFullDocOpen((prev) => ({
                              ...prev,
                              [src.chunk_id]: false,
                            }));
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "5px 12px",
                            borderRadius: 10,
                            border: "1px solid var(--sidebar-border)",
                            background: "#fff",
                            color: "var(--placeholder-text)",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          <X size={13} /> Close document
                        </button>
                      </div>
                      <DocumentViewer
                        markdown={
                          documents[src.document_id] ??
                          "# Loading document..."
                        }
                        highlightedChunk={src.chunk_text}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {remaining > 0 && (
          <button
            onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: 12,
              border: "none",
              background: "var(--primary-soft)",
              color: "var(--primary)",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            Show {remaining} more retrieved passage{remaining > 1 ? "s" : ""} →
          </button>
        )}
      </div>

      {/* Footer export */}
      <div
        style={{
          borderTop: "1px solid var(--sidebar-border)",
          padding: "12px 18px",
          fontSize: 12,
          color: "var(--placeholder-text)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span>Export sources as:</span>
        <button onClick={exportPdf} style={exportLinkStyle}>
          PDF
        </button>
        ·
        <button onClick={exportMarkdown} style={exportLinkStyle}>
          Markdown
        </button>
        ·
        <button onClick={exportTxt} style={exportLinkStyle}>
          TXT
        </button>
      </div>
    </div>
  );
}

const exportLinkStyle: React.CSSProperties = {
  border: "none",
  background: "none",
  color: "var(--primary)",
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
  padding: 0,
};

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Tab pill ───────────────────────────────────────────────────────────────

function TabPill({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 14px",
        borderRadius: 999,
        border: `1px solid ${active ? "var(--primary)" : "var(--sidebar-border)"}`,
        background: active ? "var(--primary)" : "transparent",
        color: active ? "#fff" : "var(--foreground)",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Type / score badges ──────────────────────────────────────────────────────

function UsedBadge() {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.03em",
        padding: "2px 7px",
        borderRadius: 6,
        background: "var(--badge-used-bg, #eaf5ec)",
        color: "var(--badge-used-text, #2f7d43)",
      }}
    >
      CITED
    </span>
  );
}

function TypeBadge({ isWeb }: { isWeb: boolean }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.03em",
        padding: "2px 7px",
        borderRadius: 6,
        background: isWeb ? "var(--badge-web-bg)" : "var(--badge-guide-bg)",
        color: isWeb ? "var(--badge-web-text)" : "var(--badge-guide-text)",
      }}
    >
      {isWeb ? "WEB" : "DOC"}
    </span>
  );
}


function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "#16a34a" : pct >= 60 ? "#ca8a04" : "#dc2626";
  const bg = pct >= 80 ? "#f0fdf4" : pct >= 60 ? "#fefce8" : "#fef2f2";
  const border = pct >= 80 ? "#bbf7d0" : pct >= 60 ? "#fde68a" : "#fecaca";
  return (
    <span
      style={{
        flexShrink: 0,
        padding: "2px 7px",
        borderRadius: 999,
        background: bg,
        border: `1px solid ${border}`,
        fontSize: 10,
        fontWeight: 700,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {pct}% match
    </span>
  );
}

// ── Highlight evidence inside the full chunk ──────────────────────────────────

function buildHighlightedChunk(
  chunkText: string,
  highlights: { start: number; end: number }[]
): string {
  if (!highlights.length) {
    return escapeHtml(chunkText);
  }

  const sorted = [...highlights]
    .filter((h) => h.start >= 0 && h.end > h.start)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];

  for (const h of sorted) {
    const last = merged[merged.length - 1];
    if (last && h.start <= last.end) {
      last.end = Math.max(last.end, h.end);
    } else {
      merged.push({ ...h });
    }
  }

  let result = "";
  let current = 0;

  for (const h of merged) {
    result += escapeHtml(chunkText.slice(current, h.start));
    result += `<mark style="background:#ede9fe;border-radius:3px;padding:1px 3px;font-weight:500;color:#4c1d95;">${escapeHtml(chunkText.slice(h.start, h.end))}</mark>`;
    current = h.end;
  }

  result += escapeHtml(chunkText.slice(current));
  return result;
}

function cleanChunkText(text: string): string {
  return text
    // Remove markdown headings (# ## ### etc.)
    .replace(/^#{1,6}\s*/gm, "")
    // Remove image/link markdown artifacts like ![](...) and [](...)
    .replace(/!?\[.*?\]\(.*?\)/g, "")
    // Collapse runs of whitespace/newlines into single spaces
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
