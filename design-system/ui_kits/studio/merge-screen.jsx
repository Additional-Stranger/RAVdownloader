const { Button, IconButton, Badge, Input, Select, Checkbox, Icon, Timecode, StatusDot } = window.EditBayToolsDesignSystem_9ef02b;

function Slot({ icon, kind, name, meta, onPick }) {
  return (
    <Panel style={{ padding:16, display:"flex", alignItems:"center", gap:14 }}>
      <div style={{ width:44, height:44, borderRadius:"var(--radius-md)", background:"var(--accent-soft)",
        color:"var(--accent)", display:"grid", placeItems:"center", flex:"none" }}><Icon name={icon} size={20} /></div>
      <div style={{ flex:1, minWidth:0 }}>
        <div className="ebt-eyebrow" style={{ marginBottom:5 }}>{kind}</div>
        <div style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-2xs)", color:"var(--text-heading)" }}>{name}</div>
        <div style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--text-muted)", marginTop:3 }}>{meta}</div>
      </div>
      <Button variant="secondary" size="sm" icon="folder-open" onClick={onPick}>Replace</Button>
    </Panel>
  );
}

function MergeScreen({ onToast }) {
  const [offset,setOffset]=React.useState("00:00:00:00");
  return (
    <>
      <PageHead eyebrow="Sync" title="Merge video and audio"
        meta="drift 0 frames · both sources 25p"
        actions={<Button icon="layers" onClick={()=>onToast({tone:"ok",title:"Merge queued",description:"A007_C012 + vo_take3 · ProRes 422 HQ"})}>Merge files</Button>} />
      <div style={{ display:"grid", gap:12, maxWidth:760 }}>
        <Slot icon="film" kind="Video track" name="A007_C012.MXF" meta="XAVC-I · 3840 × 2160 · 25p · 00:04:12:06" />
        <Slot icon="audio-lines" kind="Audio track" name="vo_take3.WAV" meta="48 kHz · 24-bit · 2ch · 00:04:12:09" />
        <Panel style={{ padding:18 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
            <Input label="Audio offset" mono value={offset} onChange={e=>setOffset(e.target.value)} suffix="frames" />
            <Select label="Sync method" options={["Waveform match","Timecode","Manual offset"]} />
            <Select label="Output container" options={["MOV · ProRes 422 HQ","MP4 · H.264","MXF · DNxHR SQ"]} />
          </div>
          <div style={{ display:"flex", gap:22, marginTop:16, flexWrap:"wrap" }}>
            <Checkbox label="Keep original video audio as second track" checked />
            <Checkbox label="Normalise to -23 LUFS" />
            <Checkbox label="Trim to shortest track" checked />
          </div>
        </Panel>
        <Panel style={{ padding:16, display:"flex", alignItems:"center", gap:16 }}>
          <StatusDot state="ok" label="Waveform match found" />
          <span style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--text-muted)" }}>confidence 98.2% · offset +3 frames</span>
          <div style={{ flex:1 }} />
          <Timecode value="00:04:12:06" size="sm" />
          <Badge tone="ok">ready</Badge>
        </Panel>
      </div>
    </>
  );
}
Object.assign(window, { MergeScreen });
