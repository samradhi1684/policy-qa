"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

type Props = {
  /** Where to go when there is no history to go back to. */
  fallbackHref?: string;
  /** Optional label next to the arrow (defaults to "Back"). */
  label?: string;
  /** Extra positioning styles from the parent, if needed. */
  style?: React.CSSProperties;
};

/**
 * Consistent top-left back button used on every page except the landing
 * page. Uses router.back() and falls back to `fallbackHref` when the tab
 * has no in-app history (e.g. the page was opened via a direct link).
 */
export default function BackButton({
  fallbackHref = "/",
  label = "Back",
  style,
}: Props) {
  const router = useRouter();

  function handleBack() {
    // window.history.length is 1 when this tab has nowhere to go back to.
    // referrer check guards against "back" leaving the app entirely after
    // a hard navigation.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.replace(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label="Go back"
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
        (e.currentTarget as HTMLButtonElement).style.background =
          "var(--sidebar-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          "var(--background)";
      }}
    >
      <ArrowLeft size={15} />
      {label}
    </button>
  );
}
