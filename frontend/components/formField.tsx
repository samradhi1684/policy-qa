type Props = {
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  rightSlot?: React.ReactNode;
};

export default function FormField({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  required = false,
  rightSlot,
}: Props) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "6px",
        }}
      >
        <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--foreground)" }}>
          {label}
          {required && <span style={{ color: "#e5484d" }}>*</span>}
        </label>
        {rightSlot}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{
          width: "100%",
          padding: "12px 16px",
          borderRadius: "12px",
          border: "1px solid var(--input-border)",
          outline: "none",
          fontSize: "14px",
          color: "var(--foreground)",
          background: "var(--input-bg)",
          fontFamily: "inherit",
        }}
        onFocus={(e) =>
          ((e.currentTarget as HTMLInputElement).style.borderColor = "var(--primary)")
        }
        onBlur={(e) =>
          ((e.currentTarget as HTMLInputElement).style.borderColor = "var(--input-border)")
        }
      />
    </div>
  );
}