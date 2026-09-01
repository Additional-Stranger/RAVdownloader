One-line: square icon-only control for toolbars, table row actions, and tool palettes.

```jsx
<IconButton icon="refresh-cw" label="Rescan volume" />
<IconButton icon="scissors" label="Split clip" active />
<IconButton icon="trash-2" label="Delete" variant="outline" size="sm" />
```

Always pass `label` — icon-only controls have no visible text. Use `active` for sticky tool selection, not for hover.
