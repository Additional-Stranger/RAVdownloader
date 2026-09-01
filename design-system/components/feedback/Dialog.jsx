import React from "react";
import { IconButton } from "../core/IconButton.jsx";

export function Dialog({ open = true, title, description, children, footer, width = 460, onClose, tone = "default", style, ...rest }) {
  if (!open) return null;
  return (
    <div role="presentation" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center", padding: 24,
      background: "rgba(5,9,15,.55)", backdropFilter: "blur(3px)",
      animation: "ebt-fade var(--dur-base) var(--ease-standard)",
    }}>
      <div role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
        onClick={(e) => e.stopPropagation()} {...rest}
        style={{
          width, maxWidth: "100%", background: "var(--bg-surface)", borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-panel)", overflow: "hidden",
          animation: "ebt-rise var(--dur-panel) var(--ease-out)", ...style,
        }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 18px 0" }}>
          <div style={{ flex: 1 }}>
            <h4 style={{ fontFamily: "var(--font-display)", fontSize: "var(--size-lg)", fontWeight: "var(--weight-semibold)", color: tone === "danger" ? "var(--state-live)" : "var(--text-heading)", letterSpacing: "var(--track-tight)" }}>{title}</h4>
            {description && <p style={{ marginTop: 7, fontSize: "var(--size-xs)", color: "var(--text-body)", lineHeight: "var(--leading-normal)" }}>{description}</p>}
          </div>
          {onClose && <IconButton icon="x" label="Close" size="sm" onClick={onClose} />}
        </div>
        {children != null && <div style={{ padding: "16px 18px 0", fontSize: "var(--size-xs)", color: "var(--text-body)" }}>{children}</div>}
        {footer && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: 18, marginTop: 18, borderTop: "1px solid var(--border-subtle)", background: "var(--bg-well)" }}>{footer}</div>
        )}
      </div>
    </div>
  );
}
