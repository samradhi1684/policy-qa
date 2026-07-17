type Props = {
  selectedModel: string;
  onQuestionClick: (question: string) => void;
  isGuest?: boolean;
};

type SuggestionGroup = {
  label: string;
  color: "green" | "purple";
  questions: string[];
};

type CountryConfig = {
  badge: string;
  flag: string;
  headline: string;
  subtitle: string;
  groups: SuggestionGroup[];
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
    groups: [
      {
        label: "Incentives & funding",
        color: "green",
        questions: [
          "How is funding distributed for the Charge at Work program?",
          "What solar tax credits are available in New York?",
        ],
      },
      {
        label: "Programs & regulations",
        color: "purple",
        questions: [
          "Where are Park & Plug chargers installed?",
          "Explain the VW Mitigation Program",
          "When are Indiana off-peak charging hours?",
        ],
      },
    ],
  },
  mnre: {
    badge: "India",
    flag: "🇮🇳",
    headline: "Renewable Energy Policy Assistant",
    subtitle:
      "Explore federal and state renewable energy incentives, tax credits, regulations, and programs across India.",
    groups: [
      {
        label: "Subsidies & schemes",
        color: "green",
        questions: [
          "What are the benefits under PM Surya Ghar Yojana?",
          "Explain the rooftop solar subsidy structure",
        ],
      },
      {
        label: "Targets & programs",
        color: "purple",
        questions: [
          "What is the PM-KUSUM scheme for farmers?",
          "What are India's renewable energy targets for 2030?",
        ],
      },
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

      {/* Suggestion chips — grouped by topic, keyed by country */}
            <div
              key={selectedModel}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                marginTop: "12px",
                maxWidth: "620px",
                width: "100%",
                alignItems: "center",  // ← center the whole column
              }}
            >
              {config.groups.map((group) => {
                const isGreen = group.color === "green";
                const chipBg     = isGreen ? "var(--primary-soft)"       : "var(--accent-purple-soft)";
                const chipBorder = isGreen ? "var(--primary-soft-border)" : "var(--accent-purple-border)";
                const chipColor  = isGreen ? "#3e6a49"                   : "var(--accent-purple-text)";
                const chipHoverBg     = isGreen ? "#dcefd8" : "#e4daf5";
                const chipHoverBorder = isGreen ? "#9ec89a" : "#b5a0e0";
                const labelColor = isGreen ? "#3e6a49" : "var(--accent-purple-text)";

                return (
                  <div key={group.label} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>  {/* ← center label + chips */}
                    <p style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: labelColor,
                      margin: "0 0 8px 2px",
                      textAlign: "center",  // ← center label text
                    }}>
                      {group.label}
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center" }}>  {/* ← center chips row */}
                      {group.questions.slice(0, 2).map((q) => (  // ← enforce max 2
                        <button
                          key={q}
                          onClick={() => onQuestionClick(q)}
                          style={{
                            padding: "8px 14px",
                            borderRadius: "20px",
                            border: `1px solid ${chipBorder}`,
                            background: chipBg,
                            cursor: "pointer",
                            fontSize: "13px",
                            color: chipColor,
                            transition: "border-color 0.15s, background 0.15s",
                            textAlign: "center",  // ← center chip text
                            lineHeight: "1.4",
                            fontFamily: "inherit",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = chipHoverBg;
                            (e.currentTarget as HTMLButtonElement).style.borderColor = chipHoverBorder;
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = chipBg;
                            (e.currentTarget as HTMLButtonElement).style.borderColor = chipBorder;
                          }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
    </div>
  );
}
