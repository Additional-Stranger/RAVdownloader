One-line: the standard action control — compact, 4px radius, Signal Blue for the single primary action in a view.

```jsx
<Button icon="play">Run job</Button>
<Button variant="secondary" size="sm" icon="folder-open">Choose watch folder</Button>
<Button variant="ghost" size="sm">Cancel</Button>
<Button variant="danger" icon="square">Stop encode</Button>
```

Labels are sentence case, verb-first, never uppercase. `loading` swaps the icon for a spinner and disables the button. Only one `primary` per screen region.
