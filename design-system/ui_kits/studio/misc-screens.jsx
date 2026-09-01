const { Button, IconButton, Badge, Input, Select, Switch, Checkbox, StatusDot, Icon, Tag, Timecode, Card } = window.EditBayToolsDesignSystem_9ef02b;

function AttributionScreen() {
  return (
    <>
      <PageHead eyebrow="Credit" title="Source attribution & graphics"
        meta="4 saved templates · applied to 128 clips this month"
        actions={<Button icon="plus">New template</Button>} />
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:14 }}>
        {[["Lower third — interview","Name + role, 4s hold, fade in 12f","type"],
          ["Source credit — archive","Rights holder + year, bottom left","copyright"],
          ["Social attribution","Handle + platform mark, safe-area aware","at-sign"],
          ["Slate — internal review","Job, preset, operator, date","clipboard-list"]].map(([n,m,ic])=>(
          <Panel key={n} style={{ padding:16, display:"flex", gap:14, alignItems:"center" }}>
            <div style={{ width:40, height:40, borderRadius:"var(--radius-md)", background:"var(--accent-soft)",
              color:"var(--accent)", display:"grid", placeItems:"center", flex:"none" }}><Icon name={ic} size={18} /></div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:"var(--size-xs)", color:"var(--text-heading)", fontWeight:500 }}>{n}</div>
              <div style={{ fontSize:"var(--size-3xs)", color:"var(--text-muted)", marginTop:3 }}>{m}</div>
            </div>
            <Button variant="secondary" size="sm">Edit</Button>
            <IconButton icon="ellipsis" label="More" size="sm" />
          </Panel>
        ))}
      </div>
    </>
  );
}

function LibraryScreen() {
  const files=[["keynote_full.mp4","MP4 · 2160p · 2.1 GB","01:12:40","Downloaded"],
    ["A007_C012.mov","ProRes 422 HQ · 12.4 GB","00:04:12","Converted"],
    ["reel_9x16.mp4","H.264 · 148 MB","00:00:28","Social clip"],
    ["vo_take3_merged.mov","ProRes 422 HQ · 13.1 GB","00:04:12","Merged"]];
  return (
    <>
      <PageHead eyebrow="Output" title="Recent files" meta="24 files · 41.8 GB · ~/Movies/EditBay"
        actions={<Button variant="secondary" icon="folder-open">Reveal in Finder</Button>} />
      <Panel>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr><Th>File</Th><Th>Details</Th><Th>Duration</Th><Th>Made by</Th><Th style={{width:64}}></Th></tr></thead>
          <tbody>
            {files.map(([n,d,dur,by])=>(
              <tr key={n}>
                <Td><div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <Icon name="film" size={15} style={{ color:"var(--text-muted)" }} />
                  <span style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-2xs)", color:"var(--text-heading)" }}>{n}</span>
                </div></Td>
                <Td><span style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--text-mono)" }}>{d}</span></Td>
                <Td><Timecode value={"00:"+dur.slice(3)+":00"} size="sm" /></Td>
                <Td><Badge>{by}</Badge></Td>
                <Td><IconButton icon="ellipsis" label="More" size="sm" /></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

function PremiereScreen() {
  const [watch,setWatch]=React.useState(true);
  return (
    <>
      <PageHead eyebrow="Integration" title="Premiere Pro" meta="linked · CC 2026 · panel 2.8.1" />
      <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:16, alignItems:"start", maxWidth:900 }}>
        <Panel style={{ padding:20 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
            <StatusDot state="ok" pulse label="Connected to Premiere Pro" />
            <Badge tone="ok">panel installed</Badge>
          </div>
          <div style={{ display:"grid", gap:14, maxWidth:420 }}>
            <Input label="Project" icon="folder" mono defaultValue="~/Projects/EP212/EP212.prproj" />
            <Select label="Import as" options={["New bin per job","Flat into project root","Replace matching clips"]} />
            <Select label="On import" options={["Do nothing","Create sequence from clips","Append to active sequence"]} />
            <Switch checked={watch} onChange={e=>setWatch(e.target.checked)} label="Send finished files automatically"
              description="Converted and downloaded media lands in the bin without a round trip." />
            <Checkbox label="Attach source attribution as clip marker" checked />
          </div>
          <div style={{ display:"flex", gap:8, marginTop:20 }}>
            <Button icon="plug">Send selection now</Button>
            <Button variant="secondary" icon="refresh-cw">Re-link panel</Button>
          </div>
        </Panel>
        <Panel style={{ padding:18 }}>
          <div className="ebt-eyebrow" style={{ marginBottom:12 }}>Last handoff</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {[["reel_9x16.mp4","14:06:22"],["A007_C012.mov","13:58:04"],["vo_take3_merged.mov","13:41:19"]].map(([n,t])=>(
              <div key={n} style={{ display:"flex", justifyContent:"space-between", gap:10 }}>
                <span style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--text-heading)" }}>{n}</span>
                <span style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--text-muted)" }}>{t}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
Object.assign(window, { AttributionScreen, LibraryScreen, PremiereScreen });
