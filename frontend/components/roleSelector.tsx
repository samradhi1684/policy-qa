type Props = {
  value: string;
  onChange: (role: string) => void;
};

const ROLE_ROWS: string[][] = [
  ["Citizen"],
  ["Homeowner", "Farmer"],
  ["Student", "Researcher", "Business Owner"],
  ["Policy Maker"],
];

export default function RoleSelector({ value, onChange }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {ROLE_ROWS.map((row, i) => (
        <div key={i} style={{ display: "flex", gap: "8px" }}>
          {row.map((role) => {
            const selected = value === role;
            return (
              <button
                key={role}
                type="button"
                onClick={() => onChange(role)}
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: selected ? "1px solid var(--primary)" : "1px solid var(--input-border)",
                  background: selected ? "var(--primary)" : "#ffffff",
                  color: selected ? "#ffffff" : "var(--foreground)",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.15s, border-color 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {role}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}