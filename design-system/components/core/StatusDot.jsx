import React from "react";

const COLORS = {
  live: "var(--state-live)", ok: "var(--state-ok)", warn: "var(--state-warn)",
  processing: "var(--state-processing)", idle: "var(--state-idle)", accent: "var(--accent)",
};

export function StatusDot({ state = "idle", label, pulse = false, size = 8, style, ...rest }) {
  const color = COLORS[state] || COLORS.idle;
  return (
    <span {...rest} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: "var(--size-2xs)", color: "var(--text-body)", ...style }}>
      <span style={{
        width: size, height: size, borderRadius: "var(--radius-pill)", background: color, flex: "none",
        boxShadow: pulse ? `0 0 0 3px ${state === "live" ? "rgba(240,56,74,.20)" : "rgba(6,182,212,.20)"}` : "none",
        animation: pulse ? "ebt-pulse 1400ms var(--ease-standard) infinite" : "none",
      }} />
      {label}
    </span>
  );
}
