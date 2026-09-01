One-line: centred modal on a blurred scrim, for confirmations and short forms — never for full workflows.

```jsx
<Dialog tone="danger" title="Delete 12 source files?" description="Checksums are verified. This cannot be undone."
  onClose={close} footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="danger">Delete files</Button></>} />
```

Confirm buttons name the action ("Delete files"), never "OK". Requires `ebt-fade`/`ebt-rise` keyframes from `guidelines/keyframes.css`.
