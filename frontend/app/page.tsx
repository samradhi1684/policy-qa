"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "../components/logo";
import InputBar from "../components/inputBar";
import { useAuth } from "../context/AuthContext";
import { createChat, queryInChatStream } from "../lib/api";

// ─── Session-storage keys ────────────────────────────────────────────────────
// Used to hand a pending prompt across page navigations (sign-in / sign-up).
// /app/chat/page.tsx reads + clears these on mount after authentication.
export const PENDING_PROMPT_KEY  = "policysense_pending_prompt";
export const PENDING_COUNTRY_KEY = "policysense_pending_country";

const COUNTRIES = [
  { id: "dsire", label: "USA 🇺🇸" },
  { id: "mnre",  label: "India 🇮🇳" },
];

const API_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "").replace(/\/+$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────
type ModalMode = "signup" | "signin" | null;

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const router  = useRouter();
  const { token, login, ready } = useAuth();

  const [scrolled,     setScrolled]     = useState(false);
  const [heroVisible,  setHeroVisible]  = useState(false);
  const [question,     setQuestion]     = useState("");
  const [country,      setCountry]      = useState(COUNTRIES[0].id);
  const [sending,      setSending]      = useState(false);
  const [modal,        setModal]        = useState<ModalMode>(null);

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 40);
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll);
    return () => { clearTimeout(t); window.removeEventListener("scroll", onScroll); };
  }, []);

  // Close modal on Escape
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setModal(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  // Lock body scroll when modal open
  useEffect(() => {
    document.body.style.overflow = modal ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [modal]);

  async function handleLandingSend() {
    const trimmed = question.trim();
    if (!trimmed || sending || !ready) return;

    if (!token) {
      // Stash so modal → chat can auto-send after login
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

  // After successful auth inside the modal, go to chat (pending prompt consumed there)
  function onAuthSuccess() {
    setModal(null);
    router.push("/chat");
  }

  return (
    <div style={{ background: "var(--background)", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className={`nav ${scrolled ? "nav-scrolled" : ""}`}>
        <div className="nav-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Logo size={30} />
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)" }}>
              PolicySense
            </span>
          </div>
          <nav style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <button onClick={() => router.push("/chat")}         className="nav-link nav-link-btn">Continue as guest</button>
            <button onClick={() => setModal("signin")}           className="nav-link nav-link-btn">Sign in</button>
            <button onClick={() => setModal("signup")}           className="btn-primary btn-sm">Create account</button>
          </nav>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="hero">
        <div className={`hero-copy hero-centered ${heroVisible ? "in" : ""}`}>

          <h1 className="hero-title">
            Ask policy questions.
            <br />
            <span className="hero-title-serif">Get answers you can verify.</span>
          </h1>

          <p className="hero-sub">
            PolicySense reads renewable energy policy documents from the US and India,
            retrieves the most relevant evidence, and generates answers grounded in
            official government sources.
          </p>

          <div className="hero-buttons">
            <button onClick={() => setModal("signup")}      className="btn-primary btn-lg">Create account</button>
            <button onClick={() => router.push("/chat")}    className="btn-ghost btn-lg">Continue as guest</button>
          </div>

          {/* ── Country radio toggles ───────────────────────────────────── */}
          <div className="country-radios" role="radiogroup" aria-label="Country">
            {COUNTRIES.map((c) => (
              <label key={c.id} className={`country-radio ${country === c.id ? "country-radio-active" : ""}`}>
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

          {/* ── Input zone (green card around input bar) ────────────────── */}
          <div className="input-zone">
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
            <p className="input-zone-hint">
              Press Enter or ↑ to search · Sign in to save your chats
            </p>
          </div>

          {/* ── Inline copyright (always visible, no scroll needed) ─────── */}
          <div className="inline-copyright">
            <span>PolicySense is an informational tool only. Always verify with official sources.</span>
            <span className="copyright-sep">·</span>
            <span>© 2026 PolicySense. All rights reserved.</span>
          </div>

        </div>
      </section>

      {/* ── Auth Modal ──────────────────────────────────────────────────── */}
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
      `}</style>

      <style jsx>{`
        /* ── Nav ─────────────────────────────────────────────────────── */
        .nav {
          position: sticky; top: 0; z-index: 40;
          background: rgba(255,255,255,0.72);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid transparent;
          transition: border-color 0.25s ease, box-shadow 0.25s ease;
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
          text-decoration: none; opacity: 0.75;
          transition: opacity 0.15s ease;
        }
        .nav-link-btn {
          border: none; background: none; cursor: pointer; font-family: inherit;
        }
        .nav-link:hover { opacity: 1; }

        /* ── Buttons ─────────────────────────────────────────────────── */
        .btn-primary {
          border: none; background: var(--primary); color: #fff;
          font-weight: 700; cursor: pointer; border-radius: 999px;
          transition: background 0.15s ease, transform 0.15s ease;
          font-family: inherit;
        }
        .btn-primary:hover { background: var(--primary-hover); transform: translateY(-1px); }
        .btn-ghost {
          border: 1px solid var(--sidebar-border); background: #fff;
          color: var(--foreground); font-weight: 700; cursor: pointer;
          border-radius: 999px;
          transition: border-color 0.15s ease, background 0.15s ease;
          font-family: inherit;
        }
        .btn-ghost:hover { border-color: var(--primary); background: var(--primary-soft); }
        .btn-sm  { padding: 9px 18px; font-size: 13px; }
        .btn-lg  { padding: 14px 26px; font-size: 15px; }

        /* ── Hero ────────────────────────────────────────────────────── */
        .hero {
          flex: 1;
          max-width: 900px; margin: 0 auto; width: 100%;
          padding: 72px 32px 48px;
          display: flex; justify-content: center; align-items: center;
        }
        .hero-centered { width: 100%; text-align: center; }
        .hero-copy {
          opacity: 0; transform: translateY(14px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        .hero-copy.in { opacity: 1; transform: translateY(0); }
        .hero-title {
          font-size: 48px; line-height: 1.12;
          font-weight: 700; letter-spacing: -0.01em;
          color: var(--foreground); margin: 0 0 20px;
        }
        .hero-title-serif {
          font-family: "Iowan Old Style","Palatino Linotype",Georgia,ui-serif,serif;
          font-style: italic; font-weight: 500; color: var(--primary);
        }
        .hero-sub {
          font-size: 17px; line-height: 1.65;
          color: var(--placeholder-text);
          max-width: 680px; margin: 0 auto 32px;
        }
        .hero-buttons {
          display: flex; justify-content: center; align-items: center;
          gap: 16px; margin-top: 0; margin-bottom: 0; flex-wrap: wrap;
        }

        /* ── Country radios (bigger, pill-toggle style) ───────────────  */
        .country-radios {
          display: flex; justify-content: center; align-items: center;
          gap: 12px; margin-top: 40px; margin-bottom: 12px;
        }
        .country-radio {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 15px; font-weight: 600;
          color: var(--placeholder-text);
          cursor: pointer;
          padding: 10px 22px;
          border-radius: 999px;
          border: 2px solid var(--sidebar-border);
          background: #fff;
          transition: border-color 0.18s, background 0.18s, color 0.18s, box-shadow 0.18s;
          user-select: none;
        }
        .country-radio input {
          accent-color: var(--primary);
          cursor: pointer;
          width: 17px; height: 17px;
        }
        .country-radio-active {
          border-color: var(--primary);
          background: var(--primary-soft);
          color: var(--primary);
          box-shadow: 0 0 0 3px rgba(77,124,88,0.12);
        }

        /* ── Input zone ──────────────────────────────────────────────── */
        .input-zone {
          margin-top: 8px;
          background: linear-gradient(135deg, #edf5eb 0%, #f3f0fa 100%);
          border: 1.5px solid #c8e0c4;
          border-radius: 24px;
          padding: 20px 20px 14px;
          box-shadow: 0 4px 20px rgba(77,124,88,0.08), 0 1px 4px rgba(123,94,168,0.06);
        }
        .input-zone-hint {
          margin: 10px 0 0;
          font-size: 12px;
          color: var(--placeholder-text);
          opacity: 0.75;
        }

        /* ── Inline copyright ────────────────────────────────────────── */
        .inline-copyright {
          margin-top: 24px;
          font-size: 11.5px;
          color: var(--placeholder-text);
          opacity: 0.7;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .copyright-sep { opacity: 0.5; }

        @media (max-width: 860px) {
          .hero { padding-top: 40px; }
          .hero-title { font-size: 34px; }
          .nav-link { display: none; }
          .country-radio { padding: 8px 16px; font-size: 14px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-copy { transition: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Auth Modal ───────────────────────────────────────────────────────────────
type AuthModalProps = {
  mode: ModalMode;
  onSwitchMode: (m: ModalMode) => void;
  onClose: () => void;
  onSuccess: () => void;
  login: (token: string) => Promise<any>;
};

function AuthModal({ mode, onSwitchMode, onClose, onSuccess, login }: AuthModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose();
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(34,48,31,0.35)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
        animation: "fadeInBackdrop 0.2s ease",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          background: "#fff",
          borderRadius: 28,
          padding: "36px 40px",
          width: "100%",
          maxWidth: 420,
          boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)",
          position: "relative",
          animation: "slideUpModal 0.22s ease",
        }}
      >
        {/* Close × */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute", top: 18, right: 18,
            background: "var(--surface-soft)", border: "none",
            borderRadius: "50%", width: 32, height: 32,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", fontSize: 18, color: "var(--placeholder-text)",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#e5e5e5")}
          onMouseLeave={e => (e.currentTarget.style.background = "var(--surface-soft)")}
        >×</button>

        {/* Purple accent bar at top */}
        <div style={{
          height: 4, borderRadius: 999,
          background: "linear-gradient(90deg, var(--primary) 0%, var(--accent-purple) 100%)",
          marginBottom: 28,
        }} />

        {mode === "signup"
          ? <SignUpForm onSwitchToSignIn={() => onSwitchMode("signin")} onSuccess={onSuccess} login={login} />
          : <SignInForm onSwitchToSignUp={() => onSwitchMode("signup")} onSuccess={onSuccess} login={login} />
        }
      </div>

      <style jsx global>{`
        @keyframes fadeInBackdrop {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUpModal {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

// ─── Sign Up Form (inside modal) ─────────────────────────────────────────────
function SignUpForm({
  onSwitchToSignIn,
  onSuccess,
  login,
}: {
  onSwitchToSignIn: () => void;
  onSuccess: () => void;
  login: (token: string) => Promise<any>;
}) {
  const [name,       setName]       = useState("");
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [error,      setError]      = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Please fill in all fields."); return;
    }
    setError(null); setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), username: name.trim(), password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setError(err?.detail || "Could not create your account."); return;
      }
      const data = await res.json();
      await login(data.access_token);
      // Store name for any deferred use but skip onboarding entirely
      window.localStorage.setItem("policysense_user_name", name.trim());
      onSuccess();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%" }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px", color: "var(--foreground)" }}>
        Create account
      </h2>
      <p style={{ fontSize: 14, color: "var(--placeholder-text)", margin: "0 0 24px" }}>
        Join PolicySense — free forever.
      </p>

      {error && <p style={{ fontSize: 13, color: "#e5484d", margin: "0 0 12px" }}>{error}</p>}

      <ModalField label="Name"     type="text"     placeholder="Your name"    value={name}     onChange={setName} />
      <ModalField label="Email"    type="email"    placeholder="you@email.com" value={email}    onChange={setEmail} />
      <ModalField label="Password" type="password" placeholder="Min 8 chars"  value={password} onChange={setPassword} />

      <ModalSubmitBtn loading={submitting} label="Create account" loadingLabel="Creating…" />

      <p style={{ textAlign: "center", fontSize: 13, color: "var(--placeholder-text)", marginTop: 18 }}>
        Already have an account?{" "}
        <button type="button" onClick={onSwitchToSignIn}
          style={{ border: "none", background: "none", padding: 0, color: "var(--accent-purple)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          Sign in
        </button>
      </p>
    </form>
  );
}

// ─── Sign In Form (inside modal) ─────────────────────────────────────────────
function SignInForm({
  onSwitchToSignUp,
  onSuccess,
  login,
}: {
  onSwitchToSignUp: () => void;
  onSuccess: () => void;
  login: (token: string) => Promise<any>;
}) {
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [error,      setError]      = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password."); return;
    }
    setError(null); setSubmitting(true);
    try {
      const body = new URLSearchParams();
      body.append("username", email.trim());
      body.append("password", password);
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) {
        setError(res.status === 401 ? "Incorrect email or password." : "Something went wrong."); return;
      }
      const data = await res.json();
      await login(data.access_token);
      onSuccess();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%" }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px", color: "var(--foreground)" }}>
        Welcome back
      </h2>
      <p style={{ fontSize: 14, color: "var(--placeholder-text)", margin: "0 0 24px" }}>
        Sign in to your PolicySense account.
      </p>

      {error && <p style={{ fontSize: 13, color: "#e5484d", margin: "0 0 12px" }}>{error}</p>}

      <ModalField label="Email"    type="email"    placeholder="you@email.com" value={email}    onChange={setEmail} />
      <ModalField label="Password" type="password" placeholder="Your password" value={password} onChange={setPassword} />

      <ModalSubmitBtn loading={submitting} label="Sign in" loadingLabel="Signing in…" />

      <p style={{ textAlign: "center", fontSize: 13, color: "var(--placeholder-text)", marginTop: 18 }}>
        Don&apos;t have an account?{" "}
        <button type="button" onClick={onSwitchToSignUp}
          style={{ border: "none", background: "none", padding: 0, color: "var(--accent-purple)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          Sign up
        </button>
      </p>
    </form>
  );
}

// ─── Small shared form components ────────────────────────────────────────────
function ModalField({
  label, type = "text", placeholder, value, onChange,
}: {
  label: string; type?: string; placeholder: string;
  value: string; onChange: (v: string) => void;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--foreground)", marginBottom: 5 }}>
        {label}
      </label>
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        required
        style={{
          width: "100%", padding: "11px 14px",
          borderRadius: 12, border: "1.5px solid var(--input-border)",
          outline: "none", fontSize: 14,
          color: "var(--foreground)", background: "var(--input-bg)",
          fontFamily: "inherit", transition: "border-color 0.15s",
        }}
        onFocus={e  => (e.currentTarget.style.borderColor = "var(--accent-purple)")}
        onBlur={e   => (e.currentTarget.style.borderColor = "var(--input-border)")}
      />
    </div>
  );
}

function ModalSubmitBtn({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        width: "100%", padding: "13px 16px", marginTop: 8,
        borderRadius: 12, border: "none",
        background: "linear-gradient(135deg, var(--primary) 0%, var(--accent-purple) 100%)",
        color: "#fff", fontSize: 15, fontWeight: 700,
        cursor: loading ? "default" : "pointer",
        opacity: loading ? 0.75 : 1,
        transition: "opacity 0.15s, transform 0.15s",
        fontFamily: "inherit",
      }}
      onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {loading ? loadingLabel : label}
    </button>
  );
}
