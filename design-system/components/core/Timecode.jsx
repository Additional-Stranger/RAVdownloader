import React from "react";

export function Timecode({ value, size = "md", tone = "default", dropFrame = false, style, ...rest }) {
  const fs = size === "sm" ? "var(--size-3xs)" : size === "lg" ? "var(--size-xl)" : "var(--size-xs)";
  const color = tone === "accent" ? "var(--accent)" : tone === "live" ? "var(--state-live)" : tone === "muted" ? "var(--text-muted)" : "var(--text-mono)";
  return (
    <span {...rest} style={{
      fontFamily: "var(--font-mono)", fontSize: fs, fontVariantNumeric: "tabular-nums",
      letterSpacing: "0.02em", color, whiteSpace: "nowrap",
      fontWeight: size === "lg" ? "var(--weight-medium)" : "var(--weight-regular)", ...style,
    }}>
      {dropFrame ? String(value).replace(/:(\d\d)$/, ";$1") : value}
    </span>
  );
}
