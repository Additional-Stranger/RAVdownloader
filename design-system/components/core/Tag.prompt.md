One-line: pill chip for user-entered values and filter selections — the only pill-radius component in the system.

```jsx
<Tag icon="folder">/Volumes/RAID-02</Tag>
<Tag selected onClick={toggle}>Failed jobs</Tag>
<Tag onRemove={() => drop(id)}>camera-a</Tag>
```

Tags carry user data or filters. For system state use Badge instead.
