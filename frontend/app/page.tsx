"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "../components/logo";
import InputBar from "../components/inputBar";
import { useAuth } from "../context/AuthContext";
import { createChat, queryInChatStream } from "../lib/api";

// Session-storage keys used to hand a pending prompt off across the
// sign-in / sign-up flow (which are separate pages, not a modal, in this
// codebase). /app/chat/page.tsx reads and clears these on mount.
export const PENDING_PROMPT_KEY = "policylens_pending_prompt";
export const PENDING_COUNTRY_KEY = "policylens_pending_country";

const COUNTRIES = [
  { id: "dsire", label: "USA" }, // matches sidebar MODELS id for United States
  { id: "mnre", label: "India" }, // matches sidebar MODELS id for India
];

export default function LandingPage() {
  const router = useRouter();
  const { token, ready } = useAuth();

  const [scrolled, setScrolled] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);

  const [question, setQuestion] = useState("");
  const [country, setCountry] = useState(COUNTRIES[0].id);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 40);

    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    window.addEventListener("scroll", onScroll);
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  /**
   * Replit-style onboarding send behavior:
   * - Authenticated: create the chat now, send the prompt immediately via
   *   the exact same streaming call the chat page uses, then navigate to
   *   the chat interface (which will load the just-created chat's history).
   * - Not authenticated: stash the prompt + selected country and send the
   *   user to the existing sign-in page. After they authenticate, /chat
   *   picks the pending prompt back up and sends it automatically.
   */
  async function handleLandingSend() {
    const trimmed = question.trim();
    if (!trimmed || sending) return;

    if (!ready) return; // avoid racing the initial auth check

    if (!token) {
      try {
        sessionStorage.setItem(PENDING_PROMPT_KEY, trimmed);
        sessionStorage.setItem(PENDING_COUNTRY_KEY, country);
      } catch {
        /* storage unavailable — user will just need to retype after signing in */
      }
      router.push("/signin");
      return;
    }

    setSending(true);
    try {
      const chat = await createChat();

      // Fire-and-forget from the landing page's perspective: we only need
      // the chat to exist and the first message to be underway before we
      // navigate. The chat page reconnects to chat history via getMessages.
      queryInChatStream(chat.id, trimmed, country, {}).catch(() => {});

      router.push(`/chat?chatId=${chat.id}`);
    } catch {
      setSending(false);
    }
  }

  return (
    <div style={{ background: "var(--background)", minHeight: "100vh" }}>
      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <header className={`nav ${scrolled ? "nav-scrolled" : ""}`}>
        <div className="nav-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Logo size={30} />
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)" }}>
              PolicyLens
            </span>
          </div>

          <nav style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <button onClick={() => router.push("/chat")} className="nav-link nav-link-btn">
              Continue as guest
            </button>
            <button onClick={() => router.push("/signin")} className="nav-link nav-link-btn">
              Sign in
            </button>
            <button onClick={() => router.push("/signup")} className="btn-primary btn-sm">
              Create account
            </button>
          </nav>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="hero">
        <div className={`hero-copy hero-centered ${heroVisible ? "in" : ""}`}>
          <h1 className="hero-title">
            Ask policy questions.
            <br />
            <span className="hero-title-serif">
              Get answers you can verify.
            </span>
          </h1>

          <p className="hero-sub">
            PolicyLens reads renewable energy policy documents from the US and India,
            retrieves the most relevant evidence, and generates answers grounded in
            official government sources.
          </p>

          <div className="hero-buttons">
            <button
              onClick={() => router.push("/signup")}
              className="btn-primary btn-lg"
            >
              Create account
            </button>

            <button
              onClick={() => router.push("/chat")}
              className="btn-ghost btn-lg"
            >
              Continue as guest
            </button>
          </div>

          {/* ── Country selection ──────────────────────────────────── */}
          <div className="country-radios" role="radiogroup" aria-label="Country">
            {COUNTRIES.map((c) => (
              <label key={c.id} className="country-radio">
                <input
                  type="radio"
                  name="landing-country"
                  value={c.id}
                  checked={country === c.id}
                  onChange={() => setCountry(c.id)}
                />
                {c.label}
              </label>
            ))}
          </div>

          {/* ── Interactive input bar (reuses the real chat InputBar) ── */}
          <div className="landing-input-wrap">
            <InputBar
              value={question}
              onChange={setQuestion}
              onSend={handleLandingSend}
              loading={sending}
              selectedFile={null}
              onFileSelect={() => {}}
              uploadDisabled
              uploadDisabledReason="Sign in to upload documents"
            />
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="footer">
        <p>
          PolicyLens is an informational tool only. Policy data is sourced
          from official government publications. Always verify with official
          sources before taking action.
        </p>
        <p className="footer-copyright">© 2026 PolicyLens. All rights reserved.</p>
      </footer>

      <style jsx global>{`
        html {
          scroll-behavior: smooth;
        }
      `}</style>

      <style jsx>{`
        /* ── Nav ───────────────────────────────────────────────────── */
        .nav {
          position: sticky;
          top: 0;
          z-index: 40;
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-bottom: 1px solid transparent;
          transition: border-color 0.25s ease, box-shadow 0.25s ease;
        }
        .nav-scrolled {
          border-bottom-color: var(--sidebar-border);
          box-shadow: 0 1px 0 rgba(20, 10, 60, 0.02);
        }
        .nav-inner {
          max-width: 1160px;
          margin: 0 auto;
          padding: 14px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .nav-link {
          font-size: 14px;
          font-weight: 600;
          color: var(--foreground);
          text-decoration: none;
          opacity: 0.75;
          transition: opacity 0.15s ease;
        }
        .nav-link-btn {
          border: none;
          background: none;
          cursor: pointer;
          font-family: inherit;
        }
        .nav-link:hover {
          opacity: 1;
        }

        /* ── Buttons ───────────────────────────────────────────────── */
        .btn-primary {
          border: none;
          background: var(--primary);
          color: #fff;
          font-weight: 700;
          cursor: pointer;
          border-radius: 999px;
          transition: background 0.15s ease, transform 0.15s ease;
          font-family: inherit;
        }
        .btn-primary:hover {
          background: var(--primary-hover);
          transform: translateY(-1px);
        }
        .btn-ghost {
          border: 1px solid var(--sidebar-border);
          background: #fff;
          color: var(--foreground);
          font-weight: 700;
          cursor: pointer;
          border-radius: 999px;
          transition: border-color 0.15s ease, background 0.15s ease;
          font-family: inherit;
        }
        .btn-ghost:hover {
          border-color: var(--primary);
          background: var(--primary-soft);
        }
        .btn-sm {
          padding: 9px 18px;
          font-size: 13px;
        }
        .btn-lg {
          padding: 14px 26px;
          font-size: 15px;
        }

        /* ── Hero ──────────────────────────────────────────────────── */
        .hero {
          max-width: 900px;
          margin: 0 auto;
          min-height: 95vh;
          padding: 80px 32px;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .hero-buttons {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 18px;
          margin-top: 26px;
          flex-wrap: wrap;
        }

        .hero-centered {
          width: 100%;
          text-align: center;
        }
        .hero-copy {
          opacity: 0;
          transform: translateY(14px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        .hero-copy.in {
          opacity: 1;
          transform: translateY(0);
        }
        .hero-title {
          font-size: 48px;
          line-height: 1.12;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: var(--foreground);
          margin: 0 0 20px;
        }
        .hero-title-serif {
          font-family: "Iowan Old Style", "Palatino Linotype", Georgia, ui-serif, serif;
          font-style: italic;
          font-weight: 500;
          color: var(--primary);
        }
        .hero-sub {
          font-size: 17px;
          line-height: 1.65;
          color: var(--placeholder-text);
          max-width: 700px;
          margin: 0 auto 36px;
          text-align: center;
        }

        /* ── Country radios ────────────────────────────────────────── */
        .country-radios {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 22px;
          margin-top: 44px;
          margin-bottom: 14px;
        }
        .country-radio {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 14px;
          font-weight: 600;
          color: var(--foreground);
          cursor: pointer;
        }
        .country-radio input {
          accent-color: var(--primary);
          cursor: pointer;
        }

        /* ── Landing input ─────────────────────────────────────────── */
        .landing-input-wrap {
          margin-top: 6px;
        }

        /* ── Footer ────────────────────────────────────────────────── */
        .footer {
          border-top: 1px solid var(--sidebar-border);
          padding: 32px;
          text-align: center;
        }
        .footer p {
          margin: 0;
          font-size: 12px;
          color: var(--placeholder-text);
          max-width: 560px;
          margin: 0 auto;
          line-height: 1.6;
        }
        .footer-copyright {
          margin-top: 8px !important;
        }

        @media (max-width: 860px) {
          .hero {
            padding-top: 40px;
          }
          .hero-title {
            font-size: 36px;
          }
          .nav-link {
            display: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-copy {
            transition: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}
