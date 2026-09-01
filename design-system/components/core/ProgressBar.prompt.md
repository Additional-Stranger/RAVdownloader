One-line: thin determinate/indeterminate track for renders, transfers, and ingest.

```jsx
<ProgressBar label="Transcode" valueLabel="62% · 4m 12s left" value={62} tone="processing" />
<ProgressBar indeterminate height={2} />
```

Intentional addition: nearly every Edit Bay Tools surface reports long-running work. Pair the mono `valueLabel` with an ETA — a bare percentage is not useful to an operator.
