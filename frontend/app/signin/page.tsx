"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthLayout from "../../components/authLayout";
import FormField from "../../components/formField";
import { useAuth } from "../../context/AuthContext";

const API_URL =
  (process.env.NEXT_PUBLIC_BACKEND_URL ?? "").replace(/\/+$/, "");

export default function SignInPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      // /auth/login is an OAuth2PasswordRequestForm endpoint on the
      // backend, so it expects form-urlencoded "username" (= email) and
      // "password", not JSON.
      const body = new URLSearchParams();
      body.append("username", email.trim());
      body.append("password", password);

      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      if (!res.ok) {
        setError(
          res.status === 401
            ? "Incorrect email or password."
            : "Something went wrong signing you in."
        );
        return;
      }

      const data = await res.json();
      const user = await login(data.access_token);

      router.push(user.onboarding_completed ? "/chat" : "/onboarding");
    } catch {
      setError("Could not reach the server. Is the backend running?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
        imageSrc="/images/signin.png"
        imageAlt="Wind farm"
    >
      <form onSubmit={handleSignIn} style={{ width: "100%" }}>
        <h1 style={{ fontSize: "30px", fontWeight: 700, margin: "0 0 8px", color: "var(--foreground)" }}>
          Welcome Back
        </h1>
        <p style={{ fontSize: "14px", color: "var(--placeholder-text)", margin: "0 0 28px" }}>
          Sign in to your PolicyLens account.
        </p>

        {error && (
          <p style={{ fontSize: "13px", color: "#e5484d", margin: "0 0 12px" }}>{error}</p>
        )}

        <FormField label="Email" type="email" required placeholder="Enter your email" value={email} onChange={setEmail} />
        <FormField
          label="Password"
          type="password"
          required
          placeholder="Create a password"
          value={password}
          onChange={setPassword}
          rightSlot={
            <button
              type="button"
              title="Password reset isn't available yet — no auth backend is wired up."
              onClick={() =>
                setError("Password reset isn't available yet — this build has no auth backend.")
              }
              style={{ border: "none", background: "none", padding: 0, color: "var(--primary)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
            >
              Forgot Password?
            </button>
          }
        />

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
            marginTop: "16px",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--primary-hover)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--primary)")}
        >
          {submitting ? "Signing In..." : "Sign In"}
        </button>


        <p style={{ textAlign: "center", fontSize: "13px", color: "var(--placeholder-text)", marginTop: "20px" }}>
          Don&apos;t have an account?{" "}
          <button
            type="button"
            onClick={() => router.push("/signup")}
            style={{ border: "none", background: "none", padding: 0, color: "var(--primary)", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Sign up
          </button>
        </p>
      </form>
    </AuthLayout>
  );
}