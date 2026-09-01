One-line: dark hover label for icon-only controls, with an optional keyboard-shortcut chip.

```jsx
<Tooltip label="Split clip" shortcut="⌘K"><IconButton icon="scissors" label="Split clip" /></Tooltip>
<Tooltip label="Last verified 14:02:11" side="right"><StatusDot state="ok" /></Tooltip>
```

Tooltips restate, they never introduce new information the user needs to complete a task. Always include the shortcut when one exists.
