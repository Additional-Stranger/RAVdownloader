One-line: the tally light — a small coloured dot for device, feed, and worker state in lists and headers.

```jsx
<StatusDot state="live" label="PGM out" pulse />
<StatusDot state="ok" label="Node 3 · idle" />
<StatusDot state="warn" label="Disk 84% full" />
```

Intentional addition (not a generic primitive): broadcast surfaces need per-row device state at a glance. Requires the `ebt-pulse` keyframes from `guidelines/keyframes.css` when `pulse` is set.
