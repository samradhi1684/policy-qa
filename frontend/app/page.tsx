"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "../components/logo";
import InputBar from "../components/inputBar";
import { useAuth } from "../context/AuthContext";
import { createChat, queryInChatStream } from "../lib/api";

export const PENDING_PROMPT_KEY  = "policysense_pending_prompt";
export const PENDING_COUNTRY_KEY = "policysense_pending_country";

// India is "coming soon" — dsire is the only live dataset
const COUNTRIES = [
  { id: "dsire", label: "USA",   flag: "🇺🇸", live: true },
  { id: "mnre",  label: "India", flag: "🇮🇳", live: false },
];

const API_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "").replace(/\/+$/, "");

type ModalMode = "signup" | "signin" | null;

export default function LandingPage() {
  const router = useRouter();
  const { token, login, ready } = useAuth();

  const [scrolled,     setScrolled]     = useState(false);
  const [heroVisible,  setHeroVisible]  = useState(false);
  const [question,     setQuestion]     = useState("");
  const [country,      setCountry]      = useState(COUNTRIES[0].id);
  const [sending,      setSending]      = useState(false);
  const [modal,        setModal]        = useState<ModalMode>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 40);
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll);
    return () => { clearTimeout(t); window.removeEventListener("scroll", onScroll); };
  }, []);

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setModal(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  useEffect(() => {
    document.body.style.overflow = modal ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [modal]);

  async function handleLandingSend() {
    const trimmed = question.trim();
    if (!trimmed || sending || !ready) return;

    // India is not live — block send and show a notice
    if (country === "mnre") return;

    if (!token) {
      try {
        sessionStorage.setItem(PENDING_PROMPT_KEY,  trimmed);
        sessionStorage.setItem(PENDING_COUNTRY_KEY, country);
      } catch { /* storage unavailable */ }
      setModal("signup");
      return;
    }

    setSending(true);
    try {
      const chat = await createChat();
      queryInChatStream(chat.id, trimmed, country, {}).catch(() => {});
      router.push(`/chat?chatId=${chat.id}`);
    } catch {
      setSending(false);
    }
  }

  function onAuthSuccess() {
    setModal(null);
    router.push("/chat");
  }

  const indiaSelected = country === "mnre";

  return (
    <div className="page-shell">

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <header className={`nav ${scrolled ? "nav-scrolled" : ""}`}>
        <div className="nav-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Logo size={28} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>
              PolicySense
            </span>
          </div>

          {/* Desktop nav */}
          <nav className="nav-desktop">
            <button onClick={() => router.push("/chat")}    className="nav-link nav-link-btn">Continue as guest</button>
            <button onClick={() => setModal("signin")}      className="nav-link nav-link-btn">Sign in</button>
            <button onClick={() => setModal("signup")}      className="btn-primary btn-sm">Create account</button>
          </nav>

          {/* Mobile hamburger */}
          <button
            className="nav-hamburger"
            onClick={() => setMobileMenuOpen(v => !v)}
            aria-label="Menu"
            aria-expanded={mobileMenuOpen}
          >
            <span className={`ham-line ${mobileMenuOpen ? "ham-open-1" : ""}`} />
            <span className={`ham-line ${mobileMenuOpen ? "ham-open-2" : ""}`} />
            <span className={`ham-line ${mobileMenuOpen ? "ham-open-3" : ""}`} />
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="mobile-menu">
            <button
              onClick={() => { router.push("/chat"); setMobileMenuOpen(false); }}
              className="mobile-menu-item"
            >
              Continue as guest
            </button>
            <button
              onClick={() => { setModal("signin"); setMobileMenuOpen(false); }}
              className="mobile-menu-item"
            >
              Sign in
            </button>
            <button
              onClick={() => { setModal("signup"); setMobileMenuOpen(false); }}
              className="mobile-menu-item mobile-menu-item-primary"
            >
              Create account
            </button>
          </div>
        )}
      </header>

      {/* ── Hero (fills remaining height, content centred) ────────────── */}
      <main className="hero">
        <div className={`hero-copy ${heroVisible ? "in" : ""}`}>

          {/* Title */}
          <h1 className="hero-title">
            Ask policy questions.<br />
            <span className="hero-title-serif">Get answers grounded in official sources.</span>
          </h1>

          {/* Subtitle */}
          <p className="hero-sub">
            Explore renewable energy policies without searching through hundreds of pages. Ask away — PolicySense answers your questions using official policy documents.
          </p>

          {/* ── Country selector ───────────────────────────────────────── */}
          <div className="country-selector-wrap">
            <div className="country-capsule" role="group" aria-label="Select country dataset">
              {COUNTRIES.map((c, i) => {
                const active = country === c.id;
                return (
                  <button
                    key={c.id}
                    className={`capsule-segment ${active ? "capsule-segment-active" : ""} ${!c.live ? "capsule-segment-disabled" : ""}`}
                    onClick={() => setCountry(c.id)}
                    aria-pressed={active}
                  >
                    <span className="country-flag">{c.flag}</span>
                    <span className="country-abbr">{c.id === "dsire" ? "United States of America" : "India"}</span>
                    {!c.live && (
                      <span className="coming-soon-inline">Coming soon</span>
                    )}
                    {i < COUNTRIES.length - 1 && <span className="capsule-divider" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Input zone ─────────────────────────────────────────────── */}
          <div className={`input-zone ${indiaSelected ? "input-zone-disabled" : ""}`}>
            {indiaSelected && (
              <div className="india-notice">
                🇮🇳 India dataset is under construction — coming soon!
              </div>
            )}
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
            <p className="input-hint">
              Press Enter or ↑ to search · Sign in to save chats
            </p>
          </div>

        </div>
      </main>

      {/* ── Footer — pinned to bottom of the page ─────────────────────── */}
      <footer className="footer">
        <span>PolicySense is an informational tool only. Always verify with official sources before taking action.
        © 2026 PolicySense. All rights reserved. </span>
      </footer>

      {/* ── Auth Modal ────────────────────────────────────────────────── */}
      {modal && (
        <AuthModal
          mode={modal}
          onSwitchMode={setModal}
          onClose={() => setModal(null)}
          onSuccess={onAuthSuccess}
          login={login}
        />
      )}

      <style jsx global>{`
        html { scroll-behavior: smooth; }
        @keyframes fadeInBackdrop {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUpModal {
          from { opacity: 0; transform: translateY(18px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>

      <style jsx>{`
        /* ── Shell: three-row column filling the viewport ──────── */
        .page-shell {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--background);
        }

        /* ── Nav ──────────────────────────────────────────── */
        .nav {
          flex-shrink: 0;
          position: sticky; top: 0; z-index: 40;
          background: rgba(255,255,255,0.80);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border-bottom: 1px solid transparent;
          transition: border-color 0.25s, box-shadow 0.25s;
        }
        .nav-scrolled {
          border-bottom-color: var(--sidebar-border);
          box-shadow: 0 1px 0 rgba(20,10,60,0.03);
        }
        .nav-inner {
          max-width: 1160px; margin: 0 auto;
          padding: 14px 32px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .nav-link {
          font-size: 14px; font-weight: 600; color: var(--foreground);
          text-decoration: none; opacity: 0.72;
          transition: opacity 0.15s;
        }
        .nav-link-btn { border: none; background: none; cursor: pointer; font-family: inherit; }
        .nav-link:hover { opacity: 1; }

        /* ── Buttons ──────────────────────────────────────── */
        .btn-primary {
          border: none; background: var(--primary); color: #fff;
          font-weight: 700; cursor: pointer; border-radius: 999px;
          transition: background 0.15s, transform 0.15s; font-family: inherit;
        }
        .btn-primary:hover { background: var(--primary-hover); transform: translateY(-1px); }
        .btn-ghost {
          border: 1.5px solid var(--sidebar-border); background: #fff;
          color: var(--foreground); font-weight: 700; cursor: pointer;
          border-radius: 999px;
          transition: border-color 0.15s, background 0.15s; font-family: inherit;
        }
        .btn-ghost:hover { border-color: var(--primary); background: var(--primary-soft); }
        .btn-sm { padding: 9px 20px; font-size: 13px; }
        .btn-lg { padding: 14px 28px; font-size: 15px; }

        /* ── Hero: grows to fill space between nav and footer ─ */
        .hero {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 56px 32px 40px;
        }
        .hero-copy {
          width: 100%; max-width: 780px;
          text-align: center;
          display: flex; flex-direction: column; align-items: center;
          gap: 0;                 /* gaps controlled per-child with margin */
          opacity: 0; transform: translateY(14px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        .hero-copy.in { opacity: 1; transform: translateY(0); }

        .hero-title {
          font-size: 46px; line-height: 1.12;
          font-weight: 700; letter-spacing: -0.01em;
          color: var(--foreground); margin: 0 0 18px;
        }
        .hero-title-serif {
          font-family: "Iowan Old Style","Palatino Linotype",Georgia,ui-serif,serif;
          font-style: italic; font-weight: 500; color: var(--primary);
        }
        .hero-sub {
          font-size: 16.5px; line-height: 1.65;
          color: var(--placeholder-text);
          max-width: 640px;
          margin: 0 0 40px;
        }

        /* ── Country selector ─────────────────────────────── */
        .country-selector-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
          margin-bottom: 28px;
        }
        .country-capsule {
          display: inline-flex;
          align-items: stretch;
          border-radius: 999px;
          border: 1.5px solid var(--sidebar-border);
          background: #fff;
          overflow: hidden;
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
        }
        .capsule-segment {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 11px 28px;
          border: none;
          background: transparent;
          font-size: 15px; font-weight: 600;
          color: var(--placeholder-text);
          cursor: pointer;
          transition: background 0.18s, color 0.18s;
          font-family: inherit;
          position: relative;
        }
        .capsule-segment:hover:not(.capsule-segment-active) {
          background: var(--primary-soft);
          color: var(--primary);
        }
        .capsule-segment-active {
          background: var(--primary);
          color: #fff;
        }
        .capsule-divider {
          position: absolute;
          right: 0; top: 20%; bottom: 20%;
          width: 1.5px;
          background: var(--sidebar-border);
          pointer-events: none;
        }
        .country-flag { font-size: 18px; line-height: 1; }
        .country-abbr { font-size: 15px; font-weight: 600; }
        .capsule-segment-disabled {
          opacity: 0.72;
          cursor: default;
        }
        .coming-soon-inline {
          font-size: 9px; font-weight: 700;
          color: var(--accent-purple);
          background: var(--accent-purple-soft);
          border: 1px solid var(--accent-purple-border);
          border-radius: 999px;
          padding: 2px 6px;
          letter-spacing: 0.03em;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .capsule-segment-active .coming-soon-inline {
          color: #fff;
          background: rgba(255,255,255,0.22);
          border-color: rgba(255,255,255,0.35);
        }

        /* ── Input zone ───────────────────────────────────── */
        .input-zone {
          width: 100%;
          background: linear-gradient(135deg, #edf5eb 0%, #f3f0fa 100%);
          border: 1.5px solid #c8dfc4;
          border-radius: 22px;
          padding: 18px 18px 12px;
          box-shadow:
            0 4px 20px rgba(77,124,88,0.08),
            0 1px 4px rgba(123,94,168,0.06);
          transition: opacity 0.2s;
        }
        .input-zone-disabled {
          opacity: 0.55;
          pointer-events: none;
        }
        .india-notice {
          font-size: 13px; font-weight: 600;
          color: var(--accent-purple);
          background: var(--accent-purple-soft);
          border: 1px solid var(--accent-purple-border);
          border-radius: 12px;
          padding: 10px 14px;
          margin-bottom: 12px;
          text-align: left;
        }
        .input-hint {
          margin: 9px 0 0;
          font-size: 11.5px;
          color: var(--placeholder-text);
          opacity: 0.72;
        }

        /* ── Footer — always at very bottom ───────────────── */
        .footer {
          flex-shrink: 0;
          padding: 16px 32px;
          border-top: 1px solid var(--sidebar-border);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          flex-wrap: wrap;
          font-size: 11.5px;
          color: var(--placeholder-text);
          opacity: 0.72;
        }
        .footer-sep { opacity: 0.45; }

        /* ── Hamburger ────────────────────────────────────── */
        .nav-hamburger {
          display: none;
          flex-direction: column;
          justify-content: center;
          gap: 5px;
          width: 36px;
          height: 36px;
          padding: 6px;
          border: none;
          background: transparent;
          cursor: pointer;
          border-radius: 8px;
        }
        .nav-hamburger:hover { background: var(--sidebar-hover); }
        .ham-line {
          display: block;
          width: 100%;
          height: 2px;
          background: var(--foreground);
          border-radius: 2px;
          transition: transform 0.22s ease, opacity 0.22s ease;
          transform-origin: center;
        }
        .ham-open-1 { transform: translateY(7px) rotate(45deg); }
        .ham-open-2 { opacity: 0; transform: scaleX(0); }
        .ham-open-3 { transform: translateY(-7px) rotate(-45deg); }

        /* ── Mobile dropdown menu ─────────────────────────── */
        .mobile-menu {
          display: flex;
          flex-direction: column;
          border-top: 1px solid var(--sidebar-border);
          background: rgba(255,255,255,0.96);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          animation: slideDown 0.18s ease;
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .mobile-menu-item {
          width: 100%;
          padding: 15px 24px;
          border: none;
          background: transparent;
          font-family: inherit;
          font-size: 15px;
          font-weight: 600;
          color: var(--foreground);
          text-align: left;
          cursor: pointer;
          border-bottom: 1px solid var(--sidebar-border);
          transition: background 0.15s;
        }
        .mobile-menu-item:last-child { border-bottom: none; }
        .mobile-menu-item:hover { background: var(--primary-soft); }
        .mobile-menu-item-primary {
          color: var(--primary);
        }

        /* ── Responsive ───────────────────────────────────── */
        .nav-desktop { display: flex; align-items: center; gap: 24px; }

        @media (max-width: 640px) {
          .nav-inner { padding: 12px 20px; }
          .nav-desktop { display: none; }
          .nav-hamburger { display: flex; }
          .hero { padding: 32px 18px 24px; }
          .hero-title { font-size: 28px; }
          .hero-sub { font-size: 14.5px; margin-bottom: 28px; }
          .capsule-segment { padding: 9px 16px; font-size: 13px; }
          .country-flag { font-size: 15px; }
          .country-abbr { font-size: 13px; }
          .input-zone { padding: 14px 14px 10px; border-radius: 18px; }
          .input-hint { font-size: 11px; }
          .footer { padding: 12px 18px; font-size: 11px; }
        }
        @media (max-width: 860px) and (min-width: 641px) {
          .hero { padding: 40px 24px 28px; }
          .hero-title { font-size: 34px; }
          .nav-desktop { display: none; }
          .nav-hamburger { display: flex; }
          .nav-inner { padding: 13px 24px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-copy { transition: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Auth Modal
═══════════════════════════════════════════════════════════════ */
type AuthModalProps = {
  mode: ModalMode;
  onSwitchMode: (m: ModalMode) => void;
  onClose: () => void;
  onSuccess: () => void;
  login: (token: string) => Promise<any>;
};

function AuthModal({ mode, onSwitchMode, onClose, onSuccess, login }: AuthModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(34,48,31,0.32)",
        backdropFilter: "blur(7px)", WebkitBackdropFilter: "blur(7px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        animation: "fadeInBackdrop 0.18s ease",
      }}
    >
      <div
        role="dialog" aria-modal="true"
        style={{
          background: "#fff", borderRadius: 28,
          padding: "32px 36px",
          width: "100%", maxWidth: 420,
          boxShadow: "0 24px 64px rgba(0,0,0,0.17), 0 0 0 1px rgba(0,0,0,0.04)",
          position: "relative",
          animation: "slideUpModal 0.20s ease",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose} aria-label="Close"
          style={{
            position: "absolute", top: 16, right: 16,
            background: "#f3f3f3", border: "none", borderRadius: "50%",
            width: 30, height: 30, display: "flex", alignItems: "center",
            justifyContent: "center", cursor: "pointer",
            fontSize: 17, color: "var(--placeholder-text)",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#e2e2e2")}
          onMouseLeave={e => (e.currentTarget.style.background = "#f3f3f3")}
        >×</button>

        {/* Accent bar */}
        <div style={{
          height: 4, borderRadius: 999, marginBottom: 26,
          background: "linear-gradient(90deg, var(--primary) 0%, var(--accent-purple) 100%)",
        }} />

        {mode === "signup"
          ? <SignUpForm  onSwitch={() => onSwitchMode("signin")} onSuccess={onSuccess} login={login} />
          : <SignInForm  onSwitch={() => onSwitchMode("signup")} onSuccess={onSuccess} login={login} />
        }
      </div>
    </div>
  );
}

/* ─── Sign Up Form ─────────────────────────────────────────── */
function SignUpForm({ onSwitch, onSuccess, login }: {
  onSwitch: () => void; onSuccess: () => void; login: (t: string) => Promise<any>;
}) {
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) { setError("Please fill in all fields."); return; }
    setError(null); setBusy(true);
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), username: name.trim(), password }),
      });
      if (!res.ok) { const e = await res.json().catch(() => null); setError(e?.detail || "Could not create account."); return; }
      const data = await res.json();
      await login(data.access_token);
      window.localStorage.setItem("policysense_user_name", name.trim());
      onSuccess();
    } catch { setError("Could not reach the server."); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%" }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px", color: "var(--foreground)" }}>Create account</h2>
      <p style={{ fontSize: 13.5, color: "var(--placeholder-text)", margin: "0 0 22px" }}>Join PolicySense — free forever.</p>
      {error && <p style={{ fontSize: 13, color: "#e5484d", margin: "0 0 12px" }}>{error}</p>}
      <MF label="Name"     type="text"     placeholder="Your name"    value={name}     onChange={setName} />
      <MF label="Email"    type="email"    placeholder="you@email.com" value={email}    onChange={setEmail} />
      <MF label="Password" type="password" placeholder="Min 8 chars"  value={password} onChange={setPassword} />
      <MSB busy={busy} label="Create account" />
      <p style={{ textAlign: "center", fontSize: 13, color: "var(--placeholder-text)", marginTop: 16 }}>
        Already have an account?{" "}
        <button type="button" onClick={onSwitch}
          style={{ border: "none", background: "none", padding: 0, color: "var(--accent-purple)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          Sign in
        </button>
      </p>
    </form>
  );
}

/* ─── Sign In Form ─────────────────────────────────────────── */
function SignInForm({ onSwitch, onSuccess, login }: {
  onSwitch: () => void; onSuccess: () => void; login: (t: string) => Promise<any>;
}) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) { setError("Please enter email and password."); return; }
    setError(null); setBusy(true);
    try {
      const body = new URLSearchParams();
      body.append("username", email.trim()); body.append("password", password);
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
      });
      if (!res.ok) { setError(res.status === 401 ? "Incorrect email or password." : "Something went wrong."); return; }
      const data = await res.json();
      await login(data.access_token);
      onSuccess();
    } catch { setError("Could not reach the server."); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%" }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px", color: "var(--foreground)" }}>Welcome back</h2>
      <p style={{ fontSize: 13.5, color: "var(--placeholder-text)", margin: "0 0 22px" }}>Sign in to your PolicySense account.</p>
      {error && <p style={{ fontSize: 13, color: "#e5484d", margin: "0 0 12px" }}>{error}</p>}
      <MF label="Email"    type="email"    placeholder="you@email.com" value={email}    onChange={setEmail} />
      <MF label="Password" type="password" placeholder="Your password" value={password} onChange={setPassword} />
      <MSB busy={busy} label="Sign in" />
      <p style={{ textAlign: "center", fontSize: 13, color: "var(--placeholder-text)", marginTop: 16 }}>
        Don&apos;t have an account?{" "}
        <button type="button" onClick={onSwitch}
          style={{ border: "none", background: "none", padding: 0, color: "var(--accent-purple)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          Sign up
        </button>
      </p>
    </form>
  );
}

/* ─── Micro components ─────────────────────────────────────── */
function MF({ label, type="text", placeholder, value, onChange }: {
  label: string; type?: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--foreground)", marginBottom: 5 }}>{label}</label>
      <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} required
        style={{
          width: "100%", padding: "11px 14px", borderRadius: 11,
          border: "1.5px solid var(--input-border)", outline: "none",
          fontSize: 14, color: "var(--foreground)", background: "var(--input-bg)", fontFamily: "inherit",
          transition: "border-color 0.15s",
        }}
        onFocus={e => (e.currentTarget.style.borderColor = "var(--accent-purple)")}
        onBlur={e  => (e.currentTarget.style.borderColor = "var(--input-border)")}
      />
    </div>
  );
}

function MSB({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button type="submit" disabled={busy}
      style={{
        width: "100%", padding: "12px 16px", marginTop: 6,
        borderRadius: 11, border: "none",
        background: "linear-gradient(135deg, var(--primary) 0%, var(--accent-purple) 100%)",
        color: "#fff", fontSize: 15, fontWeight: 700,
        cursor: busy ? "default" : "pointer", opacity: busy ? 0.72 : 1,
        transition: "opacity 0.15s, transform 0.15s", fontFamily: "inherit",
      }}
      onMouseEnter={e => { if (!busy) e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; }}
    >
      {busy ? "Please wait…" : label}
    </button>
  );
}
