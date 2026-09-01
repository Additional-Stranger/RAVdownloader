import React from "react";
import { Icon } from "./Icon.jsx";

const SIZES = {
  sm: { height: 28, padding: "0 10px", font: "var(--size-2xs)", icon: 14, gap: 6 },
  md: { height: 34, padding: "0 14px", font: "var(--size-xs)", icon: 16, gap: 7 },
  lg: { height: 42, padding: "0 20px", font: "var(--size-sm)", icon: 16, gap: 8 },
};

const VARIANTS = {
  primary: { background: "var(--accent)", color: "var(--on-accent)", border: "1px solid var(--accent)" },
  secondary: { background: "var(--bg-surface)", color: "var(--text-heading)", border: "1px solid var(--border-default)" },
  ghost: { background: "transparent", color: "var(--text-body)", border: "1px solid transparent" },
  danger: { background: "var(--state-live)", color: "#fff", border: "1px solid var(--state-live)" },
};

const HOVER = {
  primary: { background: "var(--accent-hover)", borderColor: "var(--accent-hover)" },
  secondary: { background: "var(--surface-card-hover)", borderColor: "var(--border-strong)" },
  ghost: { background: "var(--bg-well)", color: "var(--text-heading)" },
  danger: { background: "var(--tally-600)", borderColor: "var(--tally-600)" },
};

export function Button({
  children, variant = "primary", size = "md", icon, iconRight, loading = false,
  disabled = false, fullWidth = false, type = "button", style, onClick, ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [down, setDown] = React.useState(false);
  const s = SIZES[size] || SIZES.md;
  const v = VARIANTS[variant] || VARIANTS.primary;
  const off = disabled || loading;

  return (
    <button
      type={type}
      disabled={off}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setDown(false); }}
      onMouseDown={() => setDown(true)}
      onMouseUp={() => setDown(false)}
      {...rest}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: s.gap, height: s.height, padding: s.padding, width: fullWidth ? "100%" : undefined,
        fontFamily: "var(--font-sans)", fontSize: s.font, fontWeight: "var(--weight-medium)",
        letterSpacing: "var(--track-label)", borderRadius: "var(--radius-sm)",
        cursor: off ? "not-allowed" : "pointer", opacity: off ? 0.45 : 1,
        transition: "var(--transition-control), transform var(--dur-instant) var(--ease-standard)",
        transform: down && !off ? "translateY(1px)" : "none",
        whiteSpace: "nowrap", ...v,
        ...(hover && !off ? HOVER[variant] : null),
        ...style,
      }}
    >
      {loading ? <Icon name="loader-circle" size={s.icon} style={{ animation: "ebt-spin 700ms linear infinite" }} />
               : icon ? <Icon name={icon} size={s.icon} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={s.icon} /> : null}
    </button>
  );
}
