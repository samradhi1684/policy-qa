"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";

const API_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "").replace(/\/+$/, "");

export type AuthModalMode = "signup" | "signin" | null;

type AuthModalProps = {
  mode: AuthModalMode;
  onSwitchMode: (m: AuthModalMode) => void;
  onClose: () => void;
  onSuccess?: () => void;
};

export default function AuthModal({ mode, onSwitchMode, onClose, onSuccess }: AuthModalProps) {
  const { login } = useAuth();
  const backdropRef = useRef<HTMLDivElement>(null);

  function handleSuccess() {
    onClose();
    onSuccess?.();
  }

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
      <style>{`
        @keyframes fadeInBackdrop { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUpModal { from { opacity: 0; transform: translateY(18px) scale(0.97); } to { opacity: 1; transform: none; } }
      `}</style>

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
          ? <SignUpForm onSwitch={() => onSwitchMode("signin")} onSuccess={handleSuccess} login={login} />
          : <SignInForm onSwitch={() => onSwitchMode("signup")} onSuccess={handleSuccess} login={login} />
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
function MF({ label, type = "text", placeholder, value, onChange }: {
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
