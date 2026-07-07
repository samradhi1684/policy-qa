"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthLayout from "../../components/authLayout";
import FormField from "../../components/formField";

import { useAuth } from "../../context/AuthContext";

const API_URL = "http://127.0.0.1:8000";

export default function SignUpPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          username: name.trim(),
          password,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setError(err?.detail || "Could not create your account.");
        return;
      }

      const data = await res.json();
      await login(data.access_token);

      // Name is passed along so the onboarding screen can pre-fill it,
      // but the source of truth is now the DB, saved via PATCH /auth/onboarding.
      window.localStorage.setItem("policylens_user_name", name.trim());

      router.push("/onboarding");
    } catch {
      setError("Could not reach the server. Is the backend running?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
        step={1}
        imageSrc="/images/signup.png"
        imageAlt="Solar panels"
    >
      <form onSubmit={handleCreateAccount} style={{ width: "100%" }}>
        <h1 style={{ fontSize: "30px", fontWeight: 700, margin: "0 0 8px", color: "var(--foreground)" }}>
          Create Account
        </h1>
        <p style={{ fontSize: "14px", color: "var(--placeholder-text)", margin: "0 0 28px" }}>
          Fill in your details to personalize your experience.
        </p>

        {error && (
          <p style={{ fontSize: "13px", color: "#e5484d", margin: "0 0 12px" }}>{error}</p>
        )}

        <FormField label="Name" required placeholder="Enter your Name" value={name} onChange={setName} />
        <FormField label="Email" type="email" required placeholder="Enter your email" value={email} onChange={setEmail} />
        <FormField label="Password" type="password" required placeholder="Create a password" value={password} onChange={setPassword} />

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            padding: "13px 16px",
            borderRadius: "12px",
            border: "none",
            background: "var(--primary)",
            color: "#ffffff",
            fontSize: "15px",
            fontWeight: 700,
            cursor: submitting ? "default" : "pointer",
            opacity: submitting ? 0.7 : 1,
            marginTop: "4px",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--primary-hover)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--primary)")}
        >
          {submitting ? "Creating Account..." : "Create Account"}
        </button>




        <p style={{ textAlign: "center", fontSize: "13px", color: "var(--placeholder-text)", marginTop: "20px" }}>
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => router.push("/signin")}
            style={{ border: "none", background: "none", padding: 0, color: "var(--primary)", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Sign in
          </button>
        </p>
      </form>
    </AuthLayout>
  );
}