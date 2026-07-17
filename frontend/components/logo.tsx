type Props = {
  size?: number;
};

/**
 * PolicySense logo mark — a magnifier over a mini document,
 * inside a green rounded-square. The mark reads as
 * "searching policy documents" at a glance.
 * Brand colours: primary #4d7c58 (green), accent #7b5ea8 (purple).
 */
export default function Logo({ size = 56 }: Props) {
  const s = size;

  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, display: "block" }}
      aria-label="PolicySense"
    >
      {/* Background */}
      <rect width="40" height="40" rx="9" fill="#4d7c58" />

      {/* Mini document behind the glass */}
      <rect x="13" y="11" width="13" height="17" rx="2" fill="white" opacity="0.22" />
      <rect x="15" y="15" width="9" height="1.6" rx="0.8" fill="white" opacity="0.55" />
      <rect x="15" y="18" width="7" height="1.6" rx="0.8" fill="white" opacity="0.55" />
      <rect x="15" y="21" width="8" height="1.6" rx="0.8" fill="white" opacity="0.55" />

      {/* Magnifier circle */}
      <circle cx="19" cy="19" r="9" stroke="white" strokeWidth="2.4" />

      {/* Magnifier handle */}
      <line
        x1="25.5"
        y1="25.5"
        x2="31"
        y2="31"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
      />

      {/* Small leaf vein inside glass — energy hint */}
      <path
        d="M15.5 15 C17 18 19 21 21 24"
        stroke="white"
        strokeWidth="0.7"
        strokeLinecap="round"
        opacity="0.35"
      />
    </svg>
  );
}
