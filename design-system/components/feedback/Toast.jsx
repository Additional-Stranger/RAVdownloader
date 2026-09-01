import React from "react";
import { Icon } from "../core/Icon.jsx";
import { IconButton } from "../core/IconButton.jsx";

const TONES = {
  info: { icon: "info", color: "var(--accent)" },
  ok: { icon: "check", color: "var(--state-ok)" },
  warn: { icon: "triangle-alert", color: "var(--state-warn)" },
  error: { icon: "octagon-alert", color: "var(--state-live)" },
};

export function Toast({ tone = "info", title, description, action, onDismiss, style, ...rest }) {
  const t = TONES[tone] || TONES.info;
  return (
    <div role="status" {...rest} style={{
      display: "flex", alignItems: "flex-start", gap: 11, width: 360, maxWidth: "100%",
      padding: "12px 12px 12px 14px", background: "var(--bg-surface)",
      border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)",
      boxShadow: "var(--shadow-lg)", animation: "ebt-rise var(--dur-base) var(--ease-out)", ...style,
    }}>
      <span style={{ color: t.color, marginTop: 1 }}><Icon name={t.icon} size={16} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "var(--size-xs)", fontWeight: "var(--weight-semibold)", color: "var(--text-heading)" }}>{title}</div>
        {description && <div style={{ marginTop: 3, fontSize: "var(--size-3xs)", color: "var(--text-muted)", lineHeight: "var(--leading-snug)" }}>{description}</div>}
        {action && <div style={{ marginTop: 8 }}>{action}</div>}
      </div>
      {onDismiss && <IconButton icon="x" label="Dismiss" size="sm" onClick={onDismiss} />}
    </div>
  );
}
