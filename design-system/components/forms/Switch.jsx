import React from "react";

export function Switch({ checked, onChange, label, description, disabled = false, size = "md", style, ...rest }) {
  const w = size === "sm" ? 30 : 38, h = size === "sm" ? 17 : 21, k = h - 5;
  return (
    <label style={{ display: "inline-flex", alignItems: "flex-start", gap: 10, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, ...style }}>
      <input type="checkbox" role="switch" checked={Boolean(checked)} disabled={disabled} onChange={onChange} {...rest}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
      <span style={{
        width: w, height: h, flex: "none", borderRadius: "var(--radius-pill)", position: "relative",
        background: checked ? "var(--accent)" : "var(--ink-200)",
        transition: "background-color var(--dur-base) var(--ease-standard)", marginTop: 1,
      }}>
        <span style={{
          position: "absolute", top: 2.5, left: checked ? w - k - 2.5 : 2.5, width: k, height: k,
          borderRadius: "var(--radius-pill)", background: "#fff", boxShadow: "0 1px 2px rgba(5,9,15,.28)",
          transition: "left var(--dur-base) var(--ease-out)",
        }} />
      </span>
      {(label || description) && (
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: "var(--size-xs)", color: "var(--text-heading)" }}>{label}</span>
          {description && <span style={{ fontSize: "var(--size-3xs)", color: "var(--text-muted)" }}>{description}</span>}
        </span>
      )}
    </label>
  );
}
