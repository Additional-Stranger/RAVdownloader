const { Button, IconButton, Badge, Input, Select, Tabs, Checkbox, Icon, Tag, Timecode } = window.EditBayToolsDesignSystem_9ef02b;

function SocialScreen({ onToast }) {
  const [ratio,setRatio]=React.useState("9:16");
  const dims={ "9:16":[214,380], "1:1":[300,300], "4:5":[264,330], "16:9":[400,225] }[ratio];
  return (
    <>
      <PageHead eyebrow="Repurpose" title="Social-ready clips"
        meta="source keynote_full.mp4 · 01:12:40 · 3840 × 2160"
        actions={<><Button variant="secondary" icon="plus">New clip</Button>
          <Button icon="share" onClick={()=>onToast({tone:"ok",title:"Export queued",description:"3 aspect ratios · 1080 × 1920 · H.264"})}>Export clip</Button></>} />

      <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:16, alignItems:"start" }}>
        <Panel style={{ padding:18 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
            <Tabs variant="segmented" value={ratio} onChange={setRatio} items={[
              {value:"9:16",label:"9:16"},{value:"1:1",label:"1:1"},{value:"4:5",label:"4:5"},{value:"16:9",label:"16:9"}]} />
            <div style={{ flex:1 }} />
            <Badge uppercase={false}>1080 × 1920</Badge>
          </div>
          <div style={{ display:"grid", placeItems:"center", padding:"10px 0 18px" }}>
            <div style={{ width:dims[0], height:dims[1], background:"var(--ink-950)", border:"1px solid var(--border-default)",
              borderRadius:"var(--radius-md)", position:"relative", display:"grid", placeItems:"center",
              transition:"width var(--dur-slow) var(--ease-standard), height var(--dur-slow) var(--ease-standard)" }}>
              <Icon name="film" size={26} style={{ color:"var(--ink-600)" }} />
              <div style={{ position:"absolute", inset:"8%", border:"1px dashed rgba(16,96,248,.45)", borderRadius:4 }} />
              <div style={{ position:"absolute", left:14, right:14, bottom:16, textAlign:"center",
                fontFamily:"var(--font-display)", fontSize:13, fontWeight:600, color:"var(--white)", letterSpacing:"-.01em" }}>
                "The queue never waits on a person."
              </div>
              <div style={{ position:"absolute", left:14, bottom:6, fontFamily:"var(--font-mono)", fontSize:8, color:"var(--ink-400)" }}>
                Source: Edit Bay Tools keynote, 2026
              </div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12, borderTop:"1px solid var(--border-subtle)", paddingTop:14 }}>
            <IconButton icon="skip-back" label="Previous frame" size="sm" />
            <IconButton icon="play" label="Play" variant="solid" size="sm" />
            <IconButton icon="skip-forward" label="Next frame" size="sm" />
            <div style={{ flex:1, height:4, background:"var(--bg-well)", borderRadius:2, position:"relative" }}>
              <div style={{ position:"absolute", left:"22%", width:"18%", top:-4, height:12,
                background:"rgba(16,96,248,.28)", border:"1px solid var(--accent)", borderRadius:2 }} />
            </div>
            <Timecode value="00:14:02:11" size="sm" />
            <span style={{ color:"var(--text-muted)" }}>/</span>
            <Timecode value="00:00:28:00" size="sm" tone="accent" />
          </div>
        </Panel>

        <Panel style={{ padding:18 }}>
          <div className="ebt-eyebrow" style={{ marginBottom:14 }}>Overlay</div>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <Input label="Caption" multiline rows={3} defaultValue={'"The queue never waits on a person."'} />
            <Input label="Attribution" icon="type" defaultValue="Edit Bay Tools keynote, 2026" />
            <Select label="Caption style" options={["Lower third","Centred block","Top banner","None"]} />
            <Select label="Safe area" options={["TikTok / Reels","YouTube Shorts","LinkedIn","None"]} />
            <div style={{ height:1, background:"var(--border-subtle)" }} />
            <Checkbox label="Burn in captions" description="Otherwise exported as a sidecar .srt." checked />
            <Checkbox label="Add source URL to description file" checked />
            <div className="ebt-eyebrow" style={{ marginTop:4 }}>Export set</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              <Tag selected onClick={()=>{}}>9:16</Tag><Tag selected onClick={()=>{}}>1:1</Tag>
              <Tag onClick={()=>{}}>4:5</Tag><Tag onClick={()=>{}}>16:9</Tag>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
Object.assign(window, { SocialScreen });
