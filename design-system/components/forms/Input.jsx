import React from "react";
import { Icon } from "../core/Icon.jsx";

const H = { sm: 28, md: 34, lg: 42 };

export function Input({
  label, hint, error, icon, suffix, size = "md", mono = false, multiline = false, rows = 3,
  id, style, containerStyle, ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const uid = id || React.useId();
  const bad = Boolean(error);
  const Field = multiline ? "textarea" : "input";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...containerStyle }}>
      {label && (
        <label htmlFor={uid} style={{ fontSize: "var(--size-2xs)", fontWeight: "var(--weight-medium)", color: "var(--text-body)", letterSpacing: "var(--track-label)" }}>{label}</label>
      )}
      <div style={{
        display: "flex", alignItems: multiline ? "flex-start" : "center", gap: 8,
        height: multiline ? undefined : H[size], padding: multiline ? "9px 10px" : "0 10px",
        background: "var(--bg-surface)", borderRadius: "var(--radius-sm)",
        border: `1px solid ${bad ? "var(--state-live)" : focus ? "var(--accent)" : "var(--border-default)"}`,
        boxShadow: focus ? (bad ? "var(--ring-danger)" : "var(--ring-focus)") : "var(--inset-well)",
        transition: "var(--transition-control)",
      }}>
        {icon && <Icon name={icon} size={14} style={{ color: "var(--text-muted)", marginTop: multiline ? 3 : 0 }} />}
        <Field
          id={uid} rows={multiline ? rows : undefined}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          {...rest}
          style={{
            flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent",
            fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
            fontSize: size === "sm" ? "var(--size-2xs)" : "var(--size-xs)",
            color: "var(--text-heading)", resize: multiline ? "vertical" : undefined,
            lineHeight: multiline ? "var(--leading-normal)" : undefined, padding: 0, ...style,
          }}
        />
        {suffix && <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--size-3xs)", color: "var(--text-muted)", flex: "none" }}>{suffix}</span>}
      </div>
      {(hint || error) && (
        <span style={{ fontSize: "var(--size-3xs)", color: bad ? "var(--state-live)" : "var(--text-muted)" }}>{error || hint}</span>
      )}
    </div>
  );
}
