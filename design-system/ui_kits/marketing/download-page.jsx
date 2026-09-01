const { Button, Card, Badge, Icon, Input, Select, Checkbox, StatusDot } = window.EditBayToolsDesignSystem_9ef02b;

function DownloadPage({ setRoute }) {
  const [os,setOs]=React.useState("macos");
  const builds={ macos:["EditBayStudio-2.8.1.dmg","macOS 13+ · Apple silicon and Intel","148.2 MB"],
    windows:["EditBayStudio-2.8.1-x64.msi","Windows 11 · Windows 10 21H2+","162.7 MB"] };
  const b=builds[os];
  return (
    <div>
      <div style={{ background:"var(--ink-950)", color:"var(--white)", padding:"0 24px" }}>
        <div style={{ maxWidth:"var(--page-max)", margin:"0 auto", padding:"60px 0 56px" }}>
          <div className="ebt-eyebrow" style={{ color:"var(--blue-400)" }}>Download</div>
          <h1 style={{ marginTop:16, fontSize:"var(--size-4xl)", color:"var(--white)" }}>EditBay Studio 2.8.1</h1>
          <p style={{ marginTop:16, fontSize:"var(--size-lg)", color:"var(--ink-300)", maxWidth:600, lineHeight:1.55 }}>
            Signed builds for macOS and Windows. The trial unlocks every tool for 14 days.
          </p>
        </div>
      </div>

      <Section>
        <div style={{ display:"grid", gridTemplateColumns:"1.2fr 1fr", gap:24, alignItems:"start" }}>
          <Card padding={24} meta="Latest release" title="Pick your platform"
            footer={<><Icon name="shield-check" size={12} /> SHA-256 published with every build</>}>
            <div style={{ display:"flex", gap:8, marginTop:4, marginBottom:20 }}>
              {[["macos","apple","macOS"],["windows","monitor","Windows"]].map(([id,ic,label])=>(
                <button key={id} onClick={()=>setOs(id)}
                  style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:8, padding:"16px 8px",
                    cursor:"pointer", borderRadius:"var(--radius-md)",
                    background: os===id ? "var(--accent-soft)":"var(--bg-well)",
                    border:"1px solid " + (os===id ? "var(--accent-border)":"var(--border-subtle)"),
                    color: os===id ? "var(--accent)":"var(--text-body)", transition:"var(--transition-control)" }}>
                  <Icon name={ic} size={22} />
                  <span style={{ fontFamily:"var(--font-sans)", fontSize:"var(--size-2xs)", fontWeight:500 }}>{label}</span>
                </button>
              ))}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px",
              background:"var(--bg-well)", borderRadius:"var(--radius-md)", border:"1px solid var(--border-subtle)" }}>
              <Icon name="package" size={18} style={{ color:"var(--text-muted)" }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-2xs)", color:"var(--text-heading)" }}>{b[0]}</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--text-muted)", marginTop:3 }}>{b[1]} · {b[2]}</div>
              </div>
              <Button icon="download">Download</Button>
            </div>
            <p style={{ marginTop:16, fontSize:"var(--size-sm)", color:"var(--text-body)" }}>
              Already have a licence? <a href="#" onClick={e=>{e.preventDefault();setRoute("login");}}>Log in</a> to activate after install.
            </p>
          </Card>

          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <Card padding={20} title="Release channel">
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <StatusDot state="ok" label="Stable · 2.8.1" /><Badge tone="ok">current</Badge>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <StatusDot state="processing" label="Beta · 2.9.0-rc2" /><Badge tone="processing">testing</Badge>
                </div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--text-muted)" }}>
                  released 14 Aug 2026
                </div>
              </div>
            </Card>
            <Card padding={20} title="What's in 2.8.1">
              <div style={{ display:"grid", gap:10 }}>
                {[["ok","Fixed","Audio channel padding on 6ch XAVC-I sources."],
                  ["accent","Added","4:5 export preset with safe-area caption placement."],
                  ["accent","Added","Waveform sync confidence score in Merge A/V."],
                  ["warn","Changed","Downloads now retry twice before reporting a failure."]].map(([tone,k,t],i)=>(
                  <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                    <Badge tone={tone} style={{ width:64, justifyContent:"center", flex:"none" }}>{k}</Badge>
                    <span style={{ fontSize:"var(--size-sm)", color:"var(--text-body)", lineHeight:1.5 }}>{t}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card padding={20} title="System requirements">
              {[["macOS","13 Ventura or later"],["Windows","10 21H2 / 11"],["Memory","8 GB minimum, 16 GB recommended"],["Disk","2 GB plus working media"]].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", gap:12, padding:"7px 0",
                  borderBottom:"1px solid var(--border-subtle)" }}>
                  <span style={{ fontSize:"var(--size-2xs)", color:"var(--text-muted)" }}>{k}</span>
                  <span style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-2xs)", color:"var(--text-heading)" }}>{v}</span>
                </div>
              ))}
            </Card>
          </div>
        </div>
      </Section>
    </div>
  );
}
Object.assign(window, { DownloadPage });
