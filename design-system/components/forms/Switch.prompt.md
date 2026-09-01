One-line: instant-effect on/off toggle for settings that apply the moment they change.

```jsx
<Switch checked={auto} onChange={...} label="Auto-transcode on ingest" description="Runs the default preset as soon as a card mounts." />
<Switch size="sm" checked={v} onChange={...} />
```

If the change needs a Save button, use Checkbox instead — a Switch implies it already took effect.
