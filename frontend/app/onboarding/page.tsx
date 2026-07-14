"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthLayout from "../../components/authLayout";
import FormField from "../../components/formField";
import RoleSelector from "../../components/roleSelector";

const DEFAULT_ROLE = "Citizen";
const API_URL =
  (process.env.NEXT_PUBLIC_BACKEND_URL ?? "").replace(/\/+$/, "");

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState(DEFAULT_ROLE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill the name if it was captured on the signup screen.
  useEffect(() => {
    const savedName = window.localStorage.getItem("policylens_user_name");
    if (savedName) setName(savedName);
  }, []);

  async function handleContinue() {
    const token = window.localStorage.getItem("token");

    if (!token) {
      // Shouldn't happen in the normal signup -> onboarding flow, but
      // guards against someone landing here without a session.
      router.push("/signin");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/auth/onboarding`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          display_name: name.trim() || "Guest",
          role,
        }),
      });

      if (!res.ok) {
        setError("Could not save your details. Please try again.");
        return;
      }

      window.localStorage.removeItem("policylens_user_name");
      router.push("/chat");
    } catch {
      setError("Could not reach the server. Is the backend running?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
        step={2}
        showBack
        onBack={() => router.push("/signup")}
        imageSrc="/images/onboarding.png"
        imageAlt="Renewable landscape"
    >
      <div style={{ width: "100%" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 700, margin: "0 0 8px", color: "var(--foreground)" }}>
          What do we call you?
        </h1>
        <p style={{ fontSize: "14px", color: "var(--placeholder-text)", margin: "0 0 24px" }}>
          Personalize your PolicySense experience.
        </p>

        <FormField label="Your name" placeholder="Your name" value={name} onChange={setName} />

        {error && (
          <p style={{ fontSize: "13px", color: "#e5484d", margin: "8px 0 0" }}>{error}</p>
        )}

        <div style={{ marginTop: "8px", marginBottom: "24px" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--placeholder-text)", margin: "0 0 10px" }}>
            Your Role
          </p>
          <RoleSelector value={role} onChange={setRole} />
        </div>

        <button
          type="button"
          onClick={handleContinue}
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
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--primary-hover)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--primary)")}
        >
          {submitting ? "Saving..." : "Continue"}
        </button>
      </div>
    </AuthLayout>
  );
}