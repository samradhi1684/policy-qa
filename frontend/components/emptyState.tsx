type Props = {
  selectedModel: string;
  onQuestionClick: (question: string) => void;
  isGuest?: boolean;
};

type CountryConfig = {
  badge: string;
  flag: string;
  headline: string;
  subtitle: string;
  suggestions: string[];
};

/**
 * All country-specific copy lives here so switching country in the sidebar
 * instantly swaps the welcome message and suggested queries with no stale
 * state (this component is fully derived from `selectedModel`).
 */
const COUNTRY_CONFIG: Record<string, CountryConfig> = {
  dsire: {
    badge: "United States",
    flag: "🇺🇸",
    headline: "Renewable Energy Policy Assistant",
    subtitle:
      "Explore federal and state renewable energy incentives, tax credits, regulations, and programs across the United States.",
    suggestions: [
      "How is funding distributed for the Charge at Work program?",
      "Where are Park & Plug chargers installed?",
      "Explain the VW Mitigation Program",
      "When are Indiana off-peak charging hours?",
    ],
  },
  mnre: {
    badge: "India",
    flag: "🇮🇳",
    headline: "Renewable Energy Policy Assistant",
    subtitle:
      "Explore federal and state renewable energy incentives, tax credits, regulations, and programs across India.",
    suggestions: [
      "What are the benefits under PM Surya Ghar Yojana?",
      "Explain the rooftop solar subsidy structure",
      "What is the PM-KUSUM scheme for farmers?",
      "What are India's renewable energy targets for 2030?",
    ],
  },
};

export default function EmptyState({
  selectedModel,
  onQuestionClick,
  isGuest = false,
}: Props) {
  const config = COUNTRY_CONFIG[selectedModel] ?? COUNTRY_CONFIG.dsire;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        gap: "16px",
      }}
    >
      {/* Country badge */}
      <div
        style={{
          background: "var(--primary-soft)",
          border: "1px solid var(--primary-soft-border)",
          borderRadius: "20px",
          padding: "4px 14px",
          fontSize: "13px",
          fontWeight: 700,
          color: "var(--primary)",
          letterSpacing: "0.04em",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span>{config.flag}</span>
        <span style={{ textTransform: "uppercase" }}>{config.badge}</span>
      </div>

      <h1
        style={{
          fontSize: "28px",
          fontWeight: 700,
          color: "var(--foreground)",
          margin: 0,
          textAlign: "center",
        }}
      >
        {config.headline}
      </h1>

      <p
        style={{
          fontSize: "15px",
          color: "var(--placeholder-text)",
          margin: 0,
          textAlign: "center",
          maxWidth: "420px",
          lineHeight: "1.6",
        }}
      >
        {config.subtitle}
      </p>

      {isGuest && (
        <div
          style={{
            fontSize: 12.5,
            color: "var(--accent-brown, #8a7357)",
            background: "var(--surface-soft, #faf8f4)",
            border: "1px solid var(--sidebar-border)",
            borderRadius: 10,
            padding: "6px 14px",
          }}
        >
          Guest mode — your questions and answers won’t be saved.
        </div>
      )}

      {/* Suggestion chips (keyed by country so they never go stale) */}
      <div
        key={selectedModel}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          justifyContent: "center",
          marginTop: "12px",
          maxWidth: "600px",
        }}
      >
        {config.suggestions.map((q) => (
          <button
            key={q}
            onClick={() => onQuestionClick(q)}
            style={{
              padding: "10px 16px",
              borderRadius: "12px",
              border: "1px solid var(--sidebar-border)",
              background: "var(--background)",
              cursor: "pointer",
              fontSize: "13px",
              color: "var(--foreground)",
              transition: "border-color 0.15s, background 0.15s",
              textAlign: "left",
              lineHeight: "1.4",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                "var(--primary)";
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--primary-soft)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                "var(--sidebar-border)";
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--background)";
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
