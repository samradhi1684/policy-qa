type Props = {
  size?: number;
};

export default function Logo({ size = 56 }: Props) {
  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        background: "#0d0d0d",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#ffffff",
        fontWeight: 700,
        fontSize: `${Math.round(size * 0.32)}px`,
        letterSpacing: "0.02em",
        flexShrink: 0,
      }}
    >
      PL
    </div>
  );
}