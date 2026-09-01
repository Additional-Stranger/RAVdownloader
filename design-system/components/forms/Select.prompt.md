One-line: native single-select styled to match Input, with a chevron affordance.

```jsx
<Select label="Output codec" options={["ProRes 422 HQ","DNxHR SQ","H.264"]} />
<Select label="Priority" size="sm" options={[{value:"high",label:"High"},{value:"normal",label:"Normal"}]} />
```

Use for 3–12 known options. Above that, use a searchable Input pattern instead.
