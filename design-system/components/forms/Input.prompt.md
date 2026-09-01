One-line: the standard text field — inset well, 4px radius, blue focus ring, mono variant for machine values.

```jsx
<Input label="Watch folder" icon="folder" mono placeholder="/Volumes/RAID-02/ingest" />
<Input label="Target bitrate" suffix="Mbps" defaultValue="45" />
<Input label="Preset name" error="A preset with this name already exists." />
<Input label="Notes" multiline rows={4} />
```

Any value the machine produced or consumes (paths, IPs, hostnames, codecs) gets `mono`. Labels are sentence case with no trailing colon.
