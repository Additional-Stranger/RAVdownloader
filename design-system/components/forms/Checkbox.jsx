import React from "react";
import { Icon } from "../core/Icon.jsx";

export function Checkbox({ label, description, checked, indeterminate = false, disabled = false, onChange, style, ...rest }) {
  const on = Boolean(checked) || indeterminate;
  return (
    <label style={{ display: "inline-flex", alignItems: "flex-start", gap: 9, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, ...style }}>
      <input type="checkbox" checked={Boolean(checked)} disabled={disabled} onChange={onChange} {...rest}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
      <span style={{
        width: 16, height: 16, flex: "none", marginTop: 1, display: "inline-flex", alignItems: "center", justifyContent: "center",
        borderRadius: "var(--radius-xs)", background: on ? "var(--accent)" : "var(--bg-surface)",
        border: `1px solid ${on ? "var(--accent)" : "var(--border-strong)"}`,
        boxShadow: on ? "none" : "var(--inset-well)", transition: "var(--transition-control)", color: "#fff",
      }}>
        {indeterminate ? <Icon name="minus" size={11} /> : Boolean(checked) && <Icon name="check" size={11} />}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: "var(--size-xs)", color: "var(--text-heading)" }}>{label}</span>
        {description && <span style={{ fontSize: "var(--size-3xs)", color: "var(--text-muted)" }}>{description}</span>}
      </span>
    </label>
  );
}
