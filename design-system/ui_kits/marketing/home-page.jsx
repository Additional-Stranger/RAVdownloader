const { Button, Card, Badge, Icon, StatusDot, ProgressBar, Timecode, Tag } = window.EditBayToolsDesignSystem_9ef02b;

const TOOLS = [
  { icon:"download", name:"Download", blurb:"Pull video and audio from the web at full quality, with metadata and subtitles intact." },
  { icon:"refresh-cw", name:"Convert", blurb:"Virtually any media format in, the codec your timeline wants out. Batch or single file." },
  { icon:"crop", name:"Social clips", blurb:"Cut once, export 9:16, 1:1, 4:5 and 16:9 with captions inside the safe area." },
  { icon:"type", name:"Attribution & graphics", blurb:"Source credits, lower thirds and slates from saved templates." },
  { icon:"layers", name:"Merge A/V", blurb:"Marry a video track to separate audio with waveform sync and frame-accurate offset." },
  { icon:"calculator", name:"Timecode", blurb:"Add, subtract and measure timecode at any frame rate, drop or non-drop." },
  { icon:"plug", name:"Premiere Pro", blurb:"Finished files land in your project bin without a round trip through Finder." },
];

function AppPreview() {
  return (
    <div className="ebt-dark" style={{ background:"var(--bg-surface)", border:"1px solid var(--border-default)",
      borderRadius:"var(--radius-xl)", overflow:"hidden", boxShadow:"var(--shadow-panel)" }}>
      <div style={{ height:34, display:"flex", alignItems:"center", gap:8, padding:"0 12px",
        background:"var(--ink-950)", borderBottom:"1px solid var(--border-subtle)" }}>
        <span style={{ display:"flex", gap:6 }}>{[0,1,2].map(i=><span key={i} style={{ width:9, height:9, borderRadius:999, background:"#3B4557" }} />)}</span>
        <span className="ebt-eyebrow" style={{ color:"var(--ink-500)", marginLeft:6 }}>EditBay Studio</span>
      </div>
      <div style={{ padding:16, display:"flex", flexDirection:"column", gap:14 }}>
        {[["Keynote livestream — full session","MP4 · 1080p · 2.1 GB",100,"ok","Complete"],
          ["A007_C013.MXF → ProRes 422 HQ","XAVC-I · 9.8 GB",78,"processing","78%"],
          ["reel_9x16.mp4","H.264 · 1080 × 1920 · 148 MB",100,"ok","Exported"]].map(([n,m,p,t,b])=>(
          <div key={n} style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:"var(--size-xs)", color:"var(--white)", fontWeight:500 }}>{n}</div>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--ink-400)", marginTop:3 }}>{m}</div>
              <div style={{ marginTop:8 }}><ProgressBar value={p} tone={t} height={4} /></div>
            </div>
            <Badge tone={t==="ok"?"ok":"processing"}>{b}</Badge>
          </div>
        ))}
        <div style={{ display:"flex", alignItems:"center", gap:10, borderTop:"1px solid var(--border-subtle)", paddingTop:12 }}>
          <StatusDot state="processing" pulse label="Converting" />
          <span style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--ink-400)" }}>1m 42s left</span>
          <div style={{ flex:1 }} />
          <Timecode value="00:04:12:06" size="sm" />
        </div>
      </div>
    </div>
  );
}

function HomePage({ setRoute }) {
  return (
    <div>
      <div style={{ background:"var(--ink-950)", color:"var(--white)", padding:"0 24px" }}>
        <div style={{ maxWidth:"var(--page-max)", margin:"0 auto", padding:"80px 0 84px",
          display:"grid", gridTemplateColumns:"1fr 1fr", gap:52, alignItems:"center" }}>
          <div>
            <div className="ebt-eyebrow" style={{ color:"var(--blue-400)" }}>EditBay Studio · macOS and Windows</div>
            <h1 style={{ marginTop:18, fontSize:"var(--size-5xl)", color:"var(--white)", lineHeight:1.03 }}>
              An all-in-one media toolkit
            </h1>
            <p style={{ marginTop:22, fontSize:"var(--size-lg)", color:"var(--ink-300)", maxWidth:520, lineHeight:1.55 }}>
              Built for editors, production engineers and media professionals. Download video and
              audio from the web, convert virtually any format, cut social-ready content, add source
              attribution, merge video and audio, calculate timecode, and hand off straight to
              Premiere Pro — from one desktop application.
            </p>
            <div style={{ display:"flex", gap:10, marginTop:30 }}>
              <Button size="lg" icon="download" onClick={()=>setRoute("trial")}>Start free trial</Button>
              <Button size="lg" variant="ghost" iconRight="arrow-right" style={{ color:"var(--white)" }}
                onClick={()=>setRoute("download")}>See downloads</Button>
            </div>
            <div style={{ display:"flex", gap:18, marginTop:32, fontFamily:"var(--font-mono)",
              fontSize:"var(--size-3xs)", color:"var(--ink-500)", flexWrap:"wrap" }}>
              <span>14-day trial</span><span>·</span><span>no card required</span><span>·</span><span>runs on your machine</span>
            </div>
          </div>
          <AppPreview />
        </div>
      </div>

      <Section eyebrow="What it does" title="Seven jobs, one application"
        lead="Each tool replaces something you currently do with a browser tab, a command line, or a second app.">
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
          {TOOLS.map(t=>(
            <Card key={t.name} padding={20}>
              <div style={{ display:"flex", alignItems:"center", gap:11, marginBottom:11 }}>
                <span style={{ width:32, height:32, borderRadius:"var(--radius-md)", background:"var(--accent-soft)",
                  color:"var(--accent)", display:"grid", placeItems:"center", flex:"none" }}><Icon name={t.icon} size={17} /></span>
                <h4 style={{ fontSize:"var(--size-md)" }}>{t.name}</h4>
              </div>
              <p style={{ fontSize:"var(--size-sm)", color:"var(--text-body)", lineHeight:1.55 }}>{t.blurb}</p>
            </Card>
          ))}
        </div>
      </Section>

      <div style={{ background:"var(--bg-well)", borderTop:"1px solid var(--border-subtle)", borderBottom:"1px solid var(--border-subtle)" }}>
        <Section eyebrow="Why it stays installed" title="Built for the shift, not the demo">
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:32 }}>
            {[["gauge","No round trips","Fetch, convert, caption and hand off without leaving the window or waiting on a browser."],
              ["shield-check","Your machine, your files","Processing is local. Nothing is uploaded, nothing needs an internet connection to run."],
              ["plug","Sits next to Premiere","Finished media lands in the project bin, named and credited the way you set it up once."]].map(([ic,h,b])=>(
              <div key={h}>
                <span style={{ color:"var(--accent)" }}><Icon name={ic} size={20} /></span>
                <h4 style={{ marginTop:14, fontSize:"var(--size-lg)" }}>{h}</h4>
                <p style={{ marginTop:10, fontSize:"var(--size-sm)", color:"var(--text-body)", lineHeight:1.6 }}>{b}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section>
        <div style={{ background:"var(--ink-900)", borderRadius:"var(--radius-xl)", padding:44,
          display:"flex", alignItems:"center", gap:32 }}>
          <div style={{ flex:1 }}>
            <h3 style={{ fontSize:"var(--size-2xl)", color:"var(--white)" }}>Try it on the next job</h3>
            <p style={{ marginTop:12, fontSize:"var(--size-md)", color:"var(--ink-300)", maxWidth:520, lineHeight:1.6 }}>
              Fourteen days, every tool unlocked, no card required.
            </p>
          </div>
          <Button size="lg" icon="download" onClick={()=>setRoute("trial")}>Start free trial</Button>
        </div>
      </Section>
    </div>
  );
}
Object.assign(window, { HomePage });
