import React from "react";
import { Icon } from "../core/Icon.jsx";

export function Tabs({ items = [], value, onChange, variant = "underline", style, ...rest }) {
  const active = value ?? (items[0] && items[0].value);
  const seg = variant === "segmented";
  return (
    <div role="tablist" {...rest} style={{
      display: "inline-flex", gap: seg ? 2 : 20, alignItems: "stretch",
      background: seg ? "var(--bg-well)" : "transparent",
      padding: seg ? 3 : 0, borderRadius: seg ? "var(--radius-md)" : 0,
      borderBottom: seg ? "none" : "1px solid var(--border-subtle)", ...style,
    }}>
      {items.map((it) => {
        const on = it.value === active;
        return (
          <button key={it.value} role="tab" aria-selected={on} onClick={() => onChange && onChange(it.value)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, border: "none", cursor: "pointer",
              fontFamily: "var(--font-sans)", fontSize: "var(--size-xs)",
              fontWeight: on ? "var(--weight-semibold)" : "var(--weight-medium)",
              color: on ? (seg ? "var(--text-heading)" : "var(--text-heading)") : "var(--text-muted)",
              background: seg ? (on ? "var(--bg-surface)" : "transparent") : "transparent",
              boxShadow: seg && on ? "var(--shadow-sm)" : "none",
              borderRadius: seg ? "var(--radius-sm)" : 0,
              padding: seg ? "5px 12px" : "0 0 10px",
              borderBottom: seg ? "none" : `2px solid ${on ? "var(--accent)" : "transparent"}`,
              marginBottom: seg ? 0 : -1, transition: "var(--transition-control)",
            }}>
            {it.icon && <Icon name={it.icon} size={14} />}
            {it.label}
            {it.count != null && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--size-3xs)", color: "var(--text-muted)" }}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
