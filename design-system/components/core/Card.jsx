import React from "react";

export function Card({
  title, meta, actions, footer, children, interactive = false, padding = 20, style, onClick, ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...rest}
      style={{
        background: hover && interactive ? "var(--surface-card-hover)" : "var(--surface-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        boxShadow: interactive && hover ? "var(--shadow-md)" : "var(--shadow-sm)",
        transition: "background-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-base) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)",
        borderColor: hover && interactive ? "var(--border-default)" : "var(--border-subtle)",
        cursor: interactive ? "pointer" : "default",
        overflow: "hidden", ...style,
      }}
    >
      {(title || actions || meta) && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: `${padding}px ${padding}px 0` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {meta && <div className="ebt-eyebrow" style={{ marginBottom: 6 }}>{meta}</div>}
            {title && <h4 style={{ fontFamily: "var(--font-display)", fontSize: "var(--size-md)", fontWeight: "var(--weight-semibold)", color: "var(--text-heading)", letterSpacing: "var(--track-tight)" }}>{title}</h4>}
          </div>
          {actions && <div style={{ display: "flex", gap: 4, flex: "none" }}>{actions}</div>}
        </div>
      )}
      {children != null && (
        <div style={{ padding: title || meta ? `12px ${padding}px ${padding}px` : padding, fontSize: "var(--size-sm)", color: "var(--text-body)" }}>{children}</div>
      )}
      {footer && (
        <div style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--bg-well)", padding: `12px ${padding}px`, fontSize: "var(--size-2xs)", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 10 }}>{footer}</div>
      )}
    </div>
  );
}
