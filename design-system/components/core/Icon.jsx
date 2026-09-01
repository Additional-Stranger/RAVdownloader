import React from "react";

const BASE = "https://unpkg.com/lucide-static@0.446.0/icons/";
const cache = new Map();

/* Lucide is the substituted icon set — no icon assets shipped with the brand.
   The SVG source is fetched once per name and inlined, so the glyph inherits
   currentColor and survives static capture (an SVG mask does not). */
function load(name) {
  if (!cache.has(name)) {
    cache.set(name, fetch(BASE + name + ".svg")
      .then((r) => (r.ok ? r.text() : ""))
      .then((t) => t.replace(/<!--[\s\S]*?-->/g, "").replace(/width="24"|height="24"/g, "").trim())
      .catch(() => ""));
  }
  return cache.get(name);
}

export function Icon({ name, size = 16, label, style, className, ...rest }) {
  const [svg, setSvg] = React.useState(null);
  React.useEffect(() => {
    let live = true;
    load(name).then((t) => { if (live) setSvg(t); });
    return () => { live = false; };
  }, [name]);

  return (
    <span
      role="img"
      aria-label={label || name}
      className={"ebt-icon" + (className ? " " + className : "")}
      {...rest}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: size, height: size, flex: "none", color: "inherit",
        ["--ebt-icon-size"]: size + "px",
        ...style,
      }}
    />
  );
}
