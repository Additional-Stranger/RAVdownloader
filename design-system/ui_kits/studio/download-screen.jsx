const { Button, IconButton, Badge, Input, Select, Checkbox, ProgressBar, Timecode, Tag, Icon, Tooltip } = window.EditBayToolsDesignSystem_9ef02b;

function DownloadScreen({ onToast }) {
  const items = window.EBTData.downloads;
  return (
    <>
      <PageHead eyebrow="Fetch" title="Download from the web"
        meta="3 items · 1 downloading · 7.8 GB total"
        actions={<><Button variant="secondary" icon="clipboard-paste">Paste from clipboard</Button>
          <Button icon="folder-open">Output folder</Button></>} />

      <Panel style={{ padding:18, marginBottom:18 }}>
        <div style={{ display:"flex", gap:10, alignItems:"flex-end" }}>
          <Input containerStyle={{ flex:1 }} label="Source URL" icon="link" mono
            defaultValue="https://www.youtube.com/watch?v=8xK2pQ" />
          <Select label="Format" options={["MP4 · video + audio","MP4 · video only","M4A · audio only","WAV · audio only"]} />
          <Select label="Quality" options={["Best available","2160p","1080p","720p"]} />
          <Button size="lg" icon="download" onClick={()=>onToast({ tone:"ok", title:"Added to queue",
            description:"Keynote livestream · MP4 1080p · waiting for slot" })}>Add</Button>
        </div>
        <div style={{ display:"flex", gap:22, marginTop:16, flexWrap:"wrap" }}>
          <Checkbox label="Embed thumbnail and metadata" checked />
          <Checkbox label="Write .srt if subtitles exist" checked />
          <Checkbox label="Split chapters into separate files" />
        </div>
      </Panel>

      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <div className="ebt-eyebrow">Queue</div>
        <Tag icon="folder">~/Movies/EditBay</Tag>
        <div style={{ flex:1 }} />
        <span style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--text-muted)" }}>2 concurrent · 42 MB/s</span>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {items.map(d=>(
          <Panel key={d.title} style={{ padding:14, display:"flex", gap:14, alignItems:"center" }}>
            <Thumb label={d.dur} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                <span style={{ fontSize:"var(--size-xs)", color:"var(--text-heading)", fontWeight:500 }}>{d.title}</span>
                <Badge tone={d.state==="ok"?"ok":d.state==="processing"?"processing":"neutral"}
                  icon={d.state==="ok"?"check":d.state==="processing"?"loader-circle":"clock"}>
                  {d.state==="ok"?"Complete":d.state==="processing"?"Downloading":"Queued"}
                </Badge>
              </div>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--text-muted)", marginTop:4 }}>
                {d.src} · {d.fmt} · {d.size}
              </div>
              <div style={{ marginTop:9, maxWidth:420 }}>
                {d.state==="queued"
                  ? <span style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--text-muted)" }}>waiting for slot</span>
                  : <ProgressBar value={d.pct} height={4} tone={d.state==="ok"?"ok":"processing"}
                      valueLabel={d.state==="processing" ? d.pct+"% · "+d.eta+" left" : "100%"} />}
              </div>
            </div>
            <Timecode value={"00:"+d.dur.slice(3)+":00"} size="sm" />
            <div style={{ display:"flex", gap:2 }}>
              <Tooltip label="Send to Premiere Pro"><IconButton icon="plug" label="Send to Premiere Pro" size="sm" /></Tooltip>
              <IconButton icon="ellipsis" label="More" size="sm" />
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
Object.assign(window, { DownloadScreen });
