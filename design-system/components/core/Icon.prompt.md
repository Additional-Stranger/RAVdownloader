One-line: the brand's only icon primitive — a Lucide glyph rendered as a currentColor mask, so it tints with surrounding text.

```jsx
<Icon name="hard-drive" size={16} />
<span style={{color:"var(--state-live)"}}><Icon name="circle-dot" size={14}/></span>
```

Sizes: 14 (dense tables/inline), 16 (default, buttons), 20 (page headers, empty states). Never scale above 24 — use a full illustration instead. Names are Lucide kebab-case.
