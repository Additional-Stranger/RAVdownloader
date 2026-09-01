import React from "react";

const TONES = { accent: "var(--accent)", ok: "var(--state-ok)", warn: "var(--state-warn)", live: "var(--state-live)", processing: "var(--state-processing)" };

export function ProgressBar({ value = 0, tone = "accent", indeterminate = false, height = 4, label, valueLabel, style, ...rest }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div {...rest} style={{ ...style }}>
      {(label || valueLabel) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: "var(--size-2xs)", color: "var(--text-muted)" }}>{label}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--size-3xs)", color: "var(--text-mono)" }}>{valueLabel}</span>
        </div>
      )}
      <div style={{ height, background: "var(--bg-well)", borderRadius: "var(--radius-xs)", overflow: "hidden", boxShadow: "var(--inset-well)" }}>
        <div style={{
          height: "100%", width: indeterminate ? "35%" : pct + "%", background: TONES[tone] || TONES.accent,
          borderRadius: "var(--radius-xs)",
          transition: "width var(--dur-slow) var(--ease-standard)",
          animation: indeterminate ? "ebt-slide 1100ms var(--ease-standard) infinite" : "none",
        }} />
      </div>
    </div>
  );
}
