import React from "react";

export function Radio({ label, description, checked, disabled = false, name, value, onChange, style, ...rest }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "flex-start", gap: 9, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, ...style }}>
      <input type="radio" name={name} value={value} checked={Boolean(checked)} disabled={disabled} onChange={onChange} {...rest}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
      <span style={{
        width: 16, height: 16, flex: "none", marginTop: 1, borderRadius: "var(--radius-pill)",
        background: "var(--bg-surface)", border: `1px solid ${checked ? "var(--accent)" : "var(--border-strong)"}`,
        boxShadow: checked ? "inset 0 0 0 4px var(--accent)" : "var(--inset-well)",
        transition: "var(--transition-control)",
      }} />
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: "var(--size-xs)", color: "var(--text-heading)" }}>{label}</span>
        {description && <span style={{ fontSize: "var(--size-3xs)", color: "var(--text-muted)" }}>{description}</span>}
      </span>
    </label>
  );
}
