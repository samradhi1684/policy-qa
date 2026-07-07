"use client";

import { useRouter } from "next/navigation";
import AuthLayout from "../components/authLayout";

export default function LandingPage() {
  const router = useRouter();

  return (
    <AuthLayout
    imageSrc="/images/landing.png"
    imageAlt="Renewable energy landscape"
    >
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "20px",
          }}
        >
          <h1
            style={{
              fontSize: "34px",
              fontWeight: 700,
              lineHeight: 1.2,
              margin: 0,
              color: "var(--foreground)",
            }}
          >
            Your Gateway to Renewable Energy Policies
          </h1>

          <p
            style={{
              fontSize: "15px",
              lineHeight: 1.7,
              color: "var(--placeholder-text)",
              margin: 0,
              maxWidth: "440px",
            }}
          >
            An AI assistant that helps you understand government policies,
            targets and incentives that shape clean energy and help empower
            Renewable production backed by a primary source.
          </p>

          <div style={{ marginTop: "8px" }}>
            <p style={{ fontSize: "14px", color: "var(--placeholder-text)", margin: "0 0 6px" }}>
              Explore clean energy policies of:
            </p>
            <p style={{ fontSize: "15px", margin: "2px 0", color: "var(--foreground)" }}>
              India 🇮🇳
            </p>
            <p style={{ fontSize: "15px", margin: "2px 0", color: "var(--foreground)" }}>
              United States of America 🇺🇸
            </p>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <p style={{ fontSize: "14px", color: "var(--placeholder-text)", margin: 0 }}>
            Understand renewable policies that shape world,{" "}
            <button
              onClick={() => router.push("/signup")}
              style={{
                border: "none",
                background: "none",
                padding: 0,
                color: "var(--primary)",
                fontWeight: 700,
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              Get Started
            </button>
          </p>

          <button
            onClick={() => router.push("/signup")}
            aria-label="Get started"
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "16px",
              border: "none",
              background: "var(--primary)",
              boxShadow: "0 8px 20px rgba(91, 79, 229, 0.35)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.background = "var(--primary-hover)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.background = "var(--primary)")
            }
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="7" y1="17" x2="17" y2="7" />
              <polyline points="7 7 17 7 17 17" />
            </svg>
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}