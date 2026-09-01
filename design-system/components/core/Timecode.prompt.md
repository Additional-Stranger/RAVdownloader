One-line: tabular mono readout for SMPTE timecode, durations, and byte counts.

```jsx
<Timecode value="01:23:45:12" size="lg" />
<Timecode value="00:00:04:18" size="sm" tone="muted" />
<Timecode value="10:00:00:00" dropFrame />
```

Intentional addition: any numeric value an operator reads mid-task must be tabular mono so digits don't shift. Never set timecode in the sans face.
