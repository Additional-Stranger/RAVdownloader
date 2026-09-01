import React from "react";
import { Icon } from "./Icon.jsx";

const BOX = { sm: 28, md: 34, lg: 42 };
const GLYPH = { sm: 14, md: 16, lg: 18 };

export function IconButton({
  icon, label, size = "md", variant = "ghost", active = false, disabled = false, style, onClick, ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const box = BOX[size] || BOX.md;
  const base = variant === "solid"
    ? { background: "var(--accent)", color: "var(--on-accent)", border: "1px solid var(--accent)" }
    : variant === "outline"
    ? { background: "var(--bg-surface)", color: "var(--text-body)", border: "1px solid var(--border-default)" }
    : { background: active ? "var(--accent-soft)" : "transparent", color: active ? "var(--accent)" : "var(--text-muted)", border: "1px solid transparent" };

  return (
    <button
      type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      {...rest}
      style={{
        width: box, height: box, display: "inline-flex", alignItems: "center", justifyContent: "center",
        borderRadius: "var(--radius-sm)", cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1, transition: "var(--transition-control)", ...base,
        ...(hover && !disabled ? (variant === "solid" ? { background: "var(--accent-hover)" } : { background: "var(--bg-well)", color: "var(--text-heading)" }) : null),
        ...style,
      }}
    >
      <Icon name={icon} size={GLYPH[size] || 16} label={label} />
    </button>
  );
}
