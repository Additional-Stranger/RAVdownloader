import React from "react";
import { Icon } from "./Icon.jsx";

export function Tag({ children, onRemove, icon, selected = false, onClick, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const clickable = Boolean(onClick);
  return (
    <span
      onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      {...rest}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: onRemove ? "0 4px 0 10px" : "0 10px",
        borderRadius: "var(--radius-pill)", fontFamily: "var(--font-sans)", fontSize: "var(--size-2xs)",
        fontWeight: "var(--weight-medium)",
        background: selected ? "var(--accent-soft)" : hover && clickable ? "var(--bg-well)" : "var(--bg-surface)",
        color: selected ? "var(--accent)" : "var(--text-body)",
        border: `1px solid ${selected ? "var(--accent-border)" : "var(--border-default)"}`,
        cursor: clickable ? "pointer" : "default", transition: "var(--transition-control)", ...style,
      }}
    >
      {icon && <Icon name={icon} size={12} />}
      {children}
      {onRemove && (
        <button type="button" aria-label="Remove" onClick={(e) => { e.stopPropagation(); onRemove(e); }}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18,
            border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer",
            borderRadius: "var(--radius-pill)", padding: 0 }}>
          <Icon name="x" size={11} />
        </button>
      )}
    </span>
  );
}
