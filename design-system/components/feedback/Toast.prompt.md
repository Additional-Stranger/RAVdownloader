One-line: 360px transient notification, bottom-right stack, for the outcome of a background job.

```jsx
<Toast tone="ok" title="Render complete" description="Dailies — Stage 4B · 62 clips · 8m 04s" action={<Button variant="ghost" size="sm">Reveal in Finder</Button>} onDismiss={...} />
<Toast tone="error" title="Node 3 unreachable" description="Retrying in 30s." />
```

Errors that block work belong in a Dialog or inline, not a Toast. Keep the description to one line of facts.
