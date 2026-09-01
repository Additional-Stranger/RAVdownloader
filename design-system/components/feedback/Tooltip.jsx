import React from "react";

export function Tooltip({ label, shortcut, side = "top", children, style, ...rest }) {
  const [show, setShow] = React.useState(false);
  const pos = {
    top: { bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" },
    bottom: { top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" },
    left: { right: "calc(100% + 6px)", top: "50%", transform: "translateY(-50%)" },
    right: { left: "calc(100% + 6px)", top: "50%", transform: "translateY(-50%)" },
  }[side];
  return (
    <span {...rest} style={{ position: "relative", display: "inline-flex", ...style }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)} onBlur={() => setShow(false)}>
      {children}
      {show && (
        <span role="tooltip" style={{
          position: "absolute", zIndex: 70, ...pos, display: "inline-flex", alignItems: "center", gap: 7,
          padding: "5px 8px", background: "var(--ink-900)", color: "var(--white)",
          fontSize: "var(--size-3xs)", fontWeight: "var(--weight-medium)", whiteSpace: "nowrap",
          borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow-lg)",
          animation: "ebt-fade var(--dur-fast) var(--ease-standard)", pointerEvents: "none",
        }}>
          {label}
          {shortcut && <kbd style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-300)", border: "1px solid rgba(255,255,255,.18)", borderRadius: 2, padding: "0 3px" }}>{shortcut}</kbd>}
        </span>
      )}
    </span>
  );
}
