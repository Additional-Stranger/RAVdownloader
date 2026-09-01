import React from "react";
import { Icon } from "./Icon.jsx";

const TONES = {
  neutral: { solid: "var(--ink-600)", soft: "var(--bg-well)", text: "var(--text-body)", border: "var(--border-default)" },
  accent: { solid: "var(--accent)", soft: "var(--accent-soft)", text: "var(--accent)", border: "var(--accent-border)" },
  live: { solid: "var(--state-live)", soft: "var(--tally-100)", text: "var(--tally-600)", border: "var(--tally-500)" },
  warn: { solid: "var(--state-warn)", soft: "var(--amber-100)", text: "var(--amber-600)", border: "var(--amber-500)" },
  ok: { solid: "var(--state-ok)", soft: "var(--green-100)", text: "var(--green-600)", border: "var(--green-500)" },
  processing: { solid: "var(--state-processing)", soft: "var(--cyan-100)", text: "var(--cyan-600)", border: "var(--cyan-500)" },
};

export function Badge({ children, tone = "neutral", variant = "soft", icon, uppercase = true, style, ...rest }) {
  const t = TONES[tone] || TONES.neutral;
  const skin =
    variant === "solid" ? { background: t.solid, color: "#fff", border: "1px solid transparent" }
    : variant === "outline" ? { background: "transparent", color: t.text, border: `1px solid ${t.border}` }
    : { background: t.soft, color: t.text, border: "1px solid transparent" };
  return (
    <span {...rest} style={{
      display: "inline-flex", alignItems: "center", gap: 5, height: 20, padding: "0 7px",
      borderRadius: "var(--radius-xs)", fontFamily: "var(--font-display)", fontSize: "var(--size-3xs)",
      fontWeight: "var(--weight-semibold)", textTransform: uppercase ? "uppercase" : "none",
      letterSpacing: uppercase ? "var(--track-label)" : 0, whiteSpace: "nowrap", ...skin, ...style,
    }}>
      {icon && <Icon name={icon} size={11} />}
      {children}
    </span>
  );
}
