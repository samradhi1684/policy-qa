"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";

const API_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "").replace(/\/+$/, "");

// Standalone sign-in page (reachable at /signin from nav/bookmarks).
// When triggered from the landing page, the inline modal is used instead.
export default function SignInPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [error,      setError]      = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
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
        setError(res.status === 401 ? "Incorrect email or password." : "Something went wrong signing you in.");
        return;
      }
      const data = await res.json();
      await login(data.access_token);
      // Always go to chat — onboarding is removed
      router.push("/chat");
    } catch {
      setError("Could not reach the server. Is the backend running?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "var(--app-gradient)", padding: 24,
    }}>
      <div style={{
        background: "#fff", borderRadius: 28, padding: "40px 44px",
        width: "100%", maxWidth: 420,
        boxShadow: "0 24px 64px rgba(0,0,0,0.1)",
        border: "1px solid var(--sidebar-border)",
      }}>
        <div style={{
          height: 4, borderRadius: 999, marginBottom: 28,
          background: "linear-gradient(90deg, var(--primary) 0%, var(--accent-purple) 100%)",
        }} />
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 6px", color: "var(--foreground)" }}>
          Welcome back
        </h1>
        <p style={{ fontSize: 14, color: "var(--placeholder-text)", margin: "0 0 24px" }}>
          Sign in to your PolicySense account.
        </p>
        {error && <p style={{ fontSize: 13, color: "#e5484d", margin: "0 0 12px" }}>{error}</p>}
        <form onSubmit={handleSignIn} style={{ width: "100%" }}>
          <Field label="Email"    type="email"    placeholder="you@email.com" value={email}    onChange={setEmail} />
          <Field label="Password" type="password" placeholder="Your password" value={password} onChange={setPassword} />
          <button type="submit" disabled={submitting} style={{
            width: "100%", padding: "13px 16px", marginTop: 8,
            borderRadius: 12, border: "none",
            background: "linear-gradient(135deg, var(--primary) 0%, var(--accent-purple) 100%)",
            color: "#fff", fontSize: 15, fontWeight: 700,
            cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.75 : 1,
            fontFamily: "inherit",
          }}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p style={{ textAlign: "center", fontSize: 13, color: "var(--placeholder-text)", marginTop: 20 }}>
          Don&apos;t have an account?{" "}
          <button type="button" onClick={() => router.push("/signup")}
            style={{ border: "none", background: "none", padding: 0, color: "var(--accent-purple)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
}

function Field({ label, type="text", placeholder, value, onChange }: {
  label: string; type?: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--foreground)", marginBottom: 5 }}>
        {label}
      </label>
      <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        required style={{
          width: "100%", padding: "11px 14px", borderRadius: 12,
          border: "1.5px solid var(--input-border)", outline: "none",
          fontSize: 14, color: "var(--foreground)", background: "var(--input-bg)", fontFamily: "inherit",
        }}
        onFocus={e => (e.currentTarget.style.borderColor = "var(--accent-purple)")}
        onBlur={e  => (e.currentTarget.style.borderColor = "var(--input-border)")}
      />
    </div>
  );
}
