"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import "github-markdown-css/github-markdown-light.css";

type Props = {
  markdown: string;
  highlightedChunk?: string;
};

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function DocumentViewer({
  markdown,
  highlightedChunk,
}: Props) {

const renderedMarkdown = useMemo(() => {
  if (!highlightedChunk) return markdown;

  // take only the first ~250 chars to make matching easier
  const snippet = highlightedChunk
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 250);

  if (!snippet) return markdown;

  const escaped = escapeRegExp(snippet);

  const regex = new RegExp(escaped, "i");

  if (!regex.test(markdown)) {
    return markdown;
  }

  return markdown.replace(
    regex,
    `<mark style="
      background:#ede9fe;
      border-radius:6px;
      padding:2px 4px;
    ">
      $&
    </mark>`
  );
}, [markdown, highlightedChunk]);


  return (
    <div
      style={{
        background: "#f3f4f6",
        padding: 18,
        borderRadius: 12,
      }}
    >

    <div
        style={{
            background: "#fff",
            height: "75vh",
            overflowY: "auto",
            scrollBehavior: "smooth",

            padding: "36px 44px",
            maxWidth: 700,
            margin: "0 auto",

            borderRadius: 12,

            boxShadow: "0 12px 40px rgba(15,23,42,.08)",

            lineHeight: 1.8,

            fontFamily: "Inter, system-ui, sans-serif",
            color: "#111827",
            fontSize: 15,
        }}
        >
        
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[
                rehypeRaw,
                rehypeSanitize,
            ]}
            components={{
            h1: ({ children }) => (
              <h1
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  marginBottom: 24,
                  borderBottom: "1px solid #e5e7eb",
                  paddingBottom: 12,
                }}
              >
                {children}
              </h1>
            ),

            h2: ({ children }) => (
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  marginTop: 36,
                  marginBottom: 16,
                }}
              >
                {children}
              </h2>
            ),

            h3: ({ children }) => (
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  marginTop: 30,
                  marginBottom: 12,
                }}
              >
                {children}
              </h3>
            ),

            p: ({ children }) => (
              <p
                style={{
                  marginBottom: 18,
                  fontSize: 16,
                }}
              >
                {children}
              </p>
            ),

            ul: ({ children }) => (
              <ul
                style={{
                  paddingLeft: 28,
                  marginBottom: 18,
                }}
              >
                {children}
              </ul>
            ),

            ol: ({ children }) => (
              <ol
                style={{
                  paddingLeft: 28,
                  marginBottom: 18,
                }}
              >
                {children}
              </ol>
            ),

            li: ({ children }) => (
              <li
                style={{
                  marginBottom: 8,
                }}
              >
                {children}
              </li>
            ),

            table: ({ children }) => (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  margin: "24px 0",
                }}
              >
                {children}
              </table>
            ),

            th: ({ children }) => (
              <th
                style={{
                  border: "1px solid #e5e7eb",
                  padding: 10,
                  background: "#f9fafb",
                  textAlign: "left",
                }}
              >
                {children}
              </th>
            ),

            td: ({ children }) => (
              <td
                style={{
                  border: "1px solid #e5e7eb",
                  padding: 10,
                }}
              >
                {children}
              </td>
            ),

            img: () => null,

            code({ children }) {
            return (
                <code
                style={{
                    background: "#f3f4f6",
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontFamily: "monospace",
                    fontSize: 14,
                }}
                >
                {children}
                </code>
            );
            },

            pre({ children }) {
            return (
                <pre
                style={{
                    background: "#111827",
                    color: "#fff",
                    padding: 18,
                    borderRadius: 10,
                    overflowX: "auto",
                    margin: "20px 0",
                }}
                >
                {children}
                </pre>
            );
            },

            blockquote({ children }) {
            return (
                <blockquote
                style={{
                    borderLeft: "4px solid #6366f1",
                    paddingLeft: 18,
                    color: "#4b5563",
                    margin: "24px 0",
                    fontStyle: "italic",
                }}
                >
                {children}
                </blockquote>
            );
            },

            a({ href, children }) {
            return (
                <a
                href={href}
                target="_blank"
                rel="noreferrer"
                style={{
                    color: "#4f46e5",
                    textDecoration: "none",
                }}
                >
                {children}
                </a>
            );
            },


            hr() {
            return (
                <hr
                style={{
                    margin: "36px 0",
                    border: "none",
                    borderTop: "1px solid #e5e7eb",
                }}
                />
            );
            },           
            
            mark({ children }) {
            return (
                <mark
                style={{
                    background: "#ede9fe",
                    padding: "2px 4px",
                    borderRadius: 5,
                }}
                >
                {children}
                </mark>
            );
            },


          }}
        >
          {renderedMarkdown}
        </ReactMarkdown>
      </div>
    </div>
  );
}