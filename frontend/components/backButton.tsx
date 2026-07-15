"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

type Props = {
  /** Where to navigate. Defaults to "/" (landing page). */
  fallbackHref?: string;
  label?: string;
  style?: React.CSSProperties;
};

/**
 * Back button used in the chat interface.
 * Always navigates to the landing page (router.replace "/") so the user
 * never ends up on a blank /signin or /signup page after clicking Back.
 * Using replace() keeps the landing page as the single entry in history
 * rather than stacking a duplicate, which also means pressing the browser
 * Back button from the landing page exits cleanly.
 */
export default function BackButton({
  fallbackHref = "/",
  label = "Back",
  style,
}: Props) {
  const router = useRouter();

  function handleBack() {
    router.replace(fallbackHref);
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label="Go to landing page"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px 6px 8px",
        borderRadius: 10,
        border: "1px solid var(--sidebar-border)",
        background: "var(--background)",
        color: "var(--foreground)",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
        ...style,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--sidebar-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--background)";
      }}
    >
      <ArrowLeft size={15} />
      {label}
    </button>
  );
}
