type Props = {
  selectedModel: string;
  onQuestionClick: (question: string) => void;
};

const MODEL_LABELS: Record<string, string> = {
  dsire: "USA",
  mnre: "India",
};

export default function EmptyState({
  selectedModel,
  onQuestionClick,
}: Props) {
  const badgeLabel = MODEL_LABELS[selectedModel] ?? selectedModel.toUpperCase();

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
      {/* Model badge */}
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
          textTransform: "uppercase",
        }}
      >
        {badgeLabel}
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
        Renewable Energy Policy Assistant
      </h1>

      <p
        style={{
          fontSize: "15px",
          color: "var(--placeholder-text)",
          margin: 0,
          textAlign: "center",
          maxWidth: "380px",
          lineHeight: "1.6",
        }}
      >
        Explore renewable energy policies, incentives, regulations, and programs from the United States and India.
      </p>

      {/* Suggestion chips */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          justifyContent: "center",
          marginTop: "12px",
          maxWidth: "600px",
        }}
      >
        { [
          "Where are Park & Plug chargers installed?",
          "Explain the VW Mitigation Program",
          "What is the timeline for the SMUD - Commercial Fleet Pilot Program?",
          "When are Indiana off-peak charging hours?",
        ]
     .map((q) => (
          <button
            key={q}
            onClick={() => onQuestionClick(q)}
            style={{
              padding: "10px 16px",
              borderRadius: "12px",
              border: "1px solid var(--sidebar-border)",
              background: "#fff",
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
                "#fff";
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
