One-line: the standard panel — 10px radius, hairline border, near-flat shadow; the footer strip is where technical metadata lives.

```jsx
<Card meta="Transcode" title="Dailies — Stage 4B" actions={<IconButton icon="ellipsis" label="More"/>}
      footer={<><Icon name="clock" size={12}/> Queued 14:02:11</>}>
  62 clips · ProRes 422 HQ → H.264 proxy
</Card>
```

Use `interactive` only when the whole card navigates. Don't nest cards; use a divider instead.
