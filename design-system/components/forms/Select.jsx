import React from "react";
import { Icon } from "../core/Icon.jsx";

const H = { sm: 28, md: 34, lg: 42 };

export function Select({ label, hint, options = [], size = "md", id, style, containerStyle, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const uid = id || React.useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...containerStyle }}>
      {label && <label htmlFor={uid} style={{ fontSize: "var(--size-2xs)", fontWeight: "var(--weight-medium)", color: "var(--text-body)", letterSpacing: "var(--track-label)" }}>{label}</label>}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <select
          id={uid} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} {...rest}
          style={{
            appearance: "none", width: "100%", height: H[size], padding: "0 30px 0 10px",
            fontFamily: "var(--font-sans)", fontSize: size === "sm" ? "var(--size-2xs)" : "var(--size-xs)",
            color: "var(--text-heading)", background: "var(--bg-surface)",
            border: `1px solid ${focus ? "var(--accent)" : "var(--border-default)"}`,
            borderRadius: "var(--radius-sm)", boxShadow: focus ? "var(--ring-focus)" : "var(--inset-well)",
            transition: "var(--transition-control)", outline: "none", cursor: "pointer", ...style,
          }}
        >
          {options.map((o) => {
            const v = typeof o === "string" ? o : o.value;
            const l = typeof o === "string" ? o : o.label;
            return <option key={v} value={v}>{l}</option>;
          })}
        </select>
        <Icon name="chevron-down" size={14} style={{ position: "absolute", right: 9, color: "var(--text-muted)", pointerEvents: "none" }} />
      </div>
      {hint && <span style={{ fontSize: "var(--size-3xs)", color: "var(--text-muted)" }}>{hint}</span>}
    </div>
  );
}
