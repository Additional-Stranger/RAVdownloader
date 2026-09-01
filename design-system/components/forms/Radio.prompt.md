One-line: single-choice control for 2–5 mutually exclusive options, stacked vertically with optional descriptions.

```jsx
<Radio name="mode" value="copy" label="Copy" description="Leave the source untouched." checked={m==="copy"} onChange={...} />
<Radio name="mode" value="move" label="Move" checked={m==="move"} onChange={...} />
```

Always stack vertically and always share a `name`. Never use a radio group where a Select is shorter.
