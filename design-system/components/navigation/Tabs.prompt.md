One-line: switches views within a page — underline for page sections, segmented for in-panel scope.

```jsx
<Tabs value={tab} onChange={setTab} items={[
  {value:"queue",label:"Queue",count:12},
  {value:"history",label:"History"},
  {value:"presets",label:"Presets",icon:"sliders-horizontal"},
]} />
<Tabs variant="segmented" value={f} onChange={setF} items={[{value:"all",label:"All"},{value:"failed",label:"Failed"}]} />
```

Counts are set in mono. Never more than six tabs; move overflow into the sidebar.
