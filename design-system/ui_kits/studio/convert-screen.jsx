const { Button, IconButton, Badge, Select, Input, Switch, Checkbox, ProgressBar, Tabs, Icon, Tooltip } = window.EditBayToolsDesignSystem_9ef02b;

function ConvertScreen({ onToast }) {
  const rows = window.EBTData.converts;
  const [filter,setFilter]=React.useState("all");
  const [hw,setHw]=React.useState(true);
  const shown = rows.filter(r=>filter==="all"?true:filter==="failed"?r.state==="failed":r.state!=="ok");
  return (
    <>
      <PageHead eyebrow="Transcode" title="Convert media"
        meta="5 files · 26.0 GB in · ProRes 422 HQ out"
        actions={<><Button variant="secondary" icon="plus">Add files</Button>
          <Button icon="play" onClick={()=>onToast({tone:"ok",title:"Conversion started",description:"3 files queued · hardware encoding on"})}>Start all</Button></>} />

      <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:16, alignItems:"start" }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
            <Tabs variant="segmented" value={filter} onChange={setFilter} items={[
              {value:"all",label:"All"},{value:"pending",label:"Pending"},{value:"failed",label:"Failed"}]} />
            <div style={{ flex:1 }} />
            <span style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--text-muted)" }}>1 failed · retry available</span>
          </div>
          <Panel>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr><Th>File</Th><Th>Conversion</Th><Th style={{width:180}}>Progress</Th><Th>Size</Th><Th style={{width:64}}></Th></tr></thead>
              <tbody>
                {shown.map(r=>(
                  <tr key={r.name}>
                    <Td>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <Icon name={r.name.endsWith(".M4A")?"audio-lines":"film"} size={15} style={{ color:"var(--text-muted)" }} />
                        <span style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-2xs)", color:"var(--text-heading)" }}>{r.name}</span>
                      </div>
                    </Td>
                    <Td><span style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--text-mono)" }}>{r.from} → {r.to}</span></Td>
                    <Td>{r.state==="queued"
                      ? <span style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--text-muted)" }}>queued</span>
                      : <ProgressBar value={r.pct} height={4} tone={r.state==="failed"?"live":r.state==="ok"?"ok":"processing"}
                          valueLabel={r.state==="processing" ? r.pct+"% · "+r.eta : r.state==="failed" ? "stalled at "+r.pct+"%" : "100%"} />}</Td>
                    <Td><span style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--text-mono)" }}>{r.size}</span></Td>
                    <Td><div style={{ display:"flex", gap:2 }}>
                      {r.state==="failed"
                        ? <Tooltip label="Retry" shortcut="⌘R"><IconButton icon="refresh-cw" label="Retry" size="sm" /></Tooltip>
                        : <IconButton icon="ellipsis" label="More" size="sm" />}
                    </div></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel style={{ marginTop:14, padding:18, borderStyle:"dashed", background:"transparent",
            display:"flex", alignItems:"center", justifyContent:"center", gap:10, color:"var(--text-muted)" }}>
            <Icon name="upload" size={16} /><span style={{ fontSize:"var(--size-xs)" }}>Drop files or folders here to add them</span>
          </Panel>
        </div>

        <Panel style={{ padding:18 }}>
          <div className="ebt-eyebrow" style={{ marginBottom:14 }}>Output</div>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <Select label="Preset" options={window.EBTData.presets} />
            <Select label="Resolution" options={["Match source","3840 × 2160","1920 × 1080","1280 × 720"]} />
            <Select label="Frame rate" options={["Match source","25p","23.976p","29.97p"]} />
            <Input label="Bitrate" suffix="Mbps" defaultValue="180" />
            <Input label="Destination" icon="folder" mono defaultValue="~/Movies/EditBay/out" />
            <div style={{ height:1, background:"var(--border-subtle)" }} />
            <Switch checked={hw} onChange={e=>setHw(e.target.checked)} label="Hardware encoding"
              description="Uses the GPU where the codec allows." />
            <Checkbox label="Keep source audio channels" checked />
            <Checkbox label="Delete source when finished" description="Only after a byte-for-byte verify." />
            <Button fullWidth icon="check">Save as preset</Button>
          </div>
        </Panel>
      </div>
    </>
  );
}
Object.assign(window, { ConvertScreen });
