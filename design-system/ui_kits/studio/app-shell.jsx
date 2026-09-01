const { Icon, IconButton, StatusDot, ProgressBar, Tooltip, Badge } = window.EditBayToolsDesignSystem_9ef02b;

function RailItem({ icon, label, active, onClick, hint }) {
  const [h,setH]=React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ display:"flex", alignItems:"center", gap:10, width:"100%", height:34, padding:"0 10px",
        border:"none", borderRadius:"var(--radius-sm)", cursor:"pointer", textAlign:"left",
        fontFamily:"var(--font-sans)", fontSize:"var(--size-xs)",
        fontWeight: active ? "var(--weight-semibold)":"var(--weight-medium)",
        color: active ? "var(--text-heading)" : h ? "var(--text-heading)":"var(--ink-300)",
        background: active ? "var(--accent-soft)" : h ? "rgba(255,255,255,.05)":"transparent",
        boxShadow: active ? "inset 2px 0 0 var(--accent)":"none", transition:"var(--transition-control)" }}>
      <Icon name={icon} size={15} style={{ color: active ? "var(--accent)":"inherit" }} />
      <span style={{ flex:1 }}>{label}</span>
      {hint && <span style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--text-muted)" }}>{hint}</span>}
    </button>
  );
}

function TitleBar() {
  return (
    <header style={{ height:38, flex:"none", display:"flex", alignItems:"center", gap:12, padding:"0 12px",
      background:"var(--ink-950)", borderBottom:"1px solid var(--border-subtle)", WebkitAppRegion:"drag" }}>
      <div style={{ display:"flex", gap:7, marginRight:6 }}>
        {["#3B4557","#3B4557","#3B4557"].map((c,i)=>(
          <span key={i} style={{ width:11, height:11, borderRadius:"var(--radius-pill)", background:c }} />
        ))}
      </div>
      <img src="../../assets/logo-wordmark-knockout.png" alt="Edit Bay Tools" style={{ height:15, display:"block", opacity:.95 }} />
      <span style={{ width:1, height:16, background:"var(--border-default)" }} />
      <span className="ebt-eyebrow" style={{ color:"var(--ink-400)" }}>Studio</span>
      <div style={{ flex:1 }} />
      <span style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--ink-500)" }}>2.8.1 · macOS</span>
    </header>
  );
}

function AppShell({ route, setRoute, children }) {
  const tools=[
    ["download","download","Download"],
    ["convert","refresh-cw","Convert"],
    ["social","crop","Social clips"],
    ["merge","layers","Merge A/V"],
    ["timecode","calculator","Timecode"],
    ["attribution","type","Attribution"],
  ];
  const a = window.EBTData.activity;
  return (
    <div className="ebt-dark" style={{ height:"100%", display:"flex", flexDirection:"column",
      background:"var(--bg-page)", color:"var(--text-body)", fontFamily:"var(--font-sans)" }}>
      <TitleBar />
      <div style={{ flex:1, display:"flex", minHeight:0 }}>
        <nav style={{ width:216, flex:"none", background:"var(--bg-surface)", borderRight:"1px solid var(--border-subtle)",
          padding:12, display:"flex", flexDirection:"column", gap:3 }}>
          <div className="ebt-eyebrow" style={{ padding:"4px 10px 8px" }}>Tools</div>
          {tools.map(([id,ic,l])=><RailItem key={id} icon={ic} label={l} active={route===id} onClick={()=>setRoute(id)} />)}
          <div style={{ height:14 }} />
          <div className="ebt-eyebrow" style={{ padding:"4px 10px 8px" }}>Library</div>
          <RailItem icon="folder-open" label="Recent files" hint="24" active={route==="library"} onClick={()=>setRoute("library")} />
          <RailItem icon="plug" label="Premiere Pro" hint="linked" active={route==="premiere"} onClick={()=>setRoute("premiere")} />
          <div style={{ flex:1 }} />
          <div style={{ borderTop:"1px solid var(--border-subtle)", paddingTop:12, display:"flex", flexDirection:"column", gap:9 }}>
            <StatusDot state="ok" label="Trial · 12 days left" />
            <Badge tone="accent" variant="outline" style={{ alignSelf:"flex-start" }}>Upgrade</Badge>
          </div>
        </nav>
        <main style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column" }}>
          <div style={{ flex:1, minHeight:0, overflow:"auto", padding:"22px 26px 32px" }}>{children}</div>
          <div style={{ flex:"none", height:44, borderTop:"1px solid var(--border-subtle)", background:"var(--bg-surface)",
            display:"flex", alignItems:"center", gap:14, padding:"0 16px" }}>
            <StatusDot state="processing" pulse />
            <span style={{ fontSize:"var(--size-2xs)", color:"var(--text-heading)" }}>{a.label}</span>
            <div style={{ width:200 }}><ProgressBar value={a.pct} height={4} tone="processing" /></div>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--text-muted)" }}>{a.pct}% · {a.eta} left</span>
            <div style={{ flex:1 }} />
            <Tooltip label="Pause all"><IconButton icon="pause" label="Pause all" size="sm" /></Tooltip>
            <Tooltip label="Open output folder" shortcut="⌘O"><IconButton icon="folder-open" label="Open output folder" size="sm" /></Tooltip>
          </div>
        </main>
      </div>
    </div>
  );
}

function PageHead({ eyebrow, title, meta, actions }) {
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:16, marginBottom:18 }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div className="ebt-eyebrow" style={{ marginBottom:7 }}>{eyebrow}</div>
        <h2 style={{ fontSize:"var(--size-2xl)" }}>{title}</h2>
        {meta && <div style={{ marginTop:8, fontFamily:"var(--font-mono)", fontSize:"var(--size-2xs)", color:"var(--text-muted)" }}>{meta}</div>}
      </div>
      {actions && <div style={{ display:"flex", gap:8, flex:"none" }}>{actions}</div>}
    </div>
  );
}

function Panel({ children, style }) {
  return <div style={{ background:"var(--surface-card)", border:"1px solid var(--border-subtle)",
    borderRadius:"var(--radius-lg)", overflow:"hidden", ...style }}>{children}</div>;
}
function Th({ children, style }) {
  return <th style={{ textAlign:"left", padding:"9px 14px", fontFamily:"var(--font-display)", fontSize:"var(--size-3xs)",
    fontWeight:600, textTransform:"uppercase", letterSpacing:"var(--track-label)", color:"var(--text-muted)",
    borderBottom:"1px solid var(--border-subtle)", background:"var(--bg-well)", whiteSpace:"nowrap", ...style }}>{children}</th>;
}
function Td({ children, style }) {
  return <td style={{ padding:"11px 14px", fontSize:"var(--size-xs)", color:"var(--text-body)",
    borderBottom:"1px solid var(--border-subtle)", verticalAlign:"middle", ...style }}>{children}</td>;
}
function Thumb({ w=132, h=74, icon="film", label }) {
  return (
    <div style={{ width:w, height:h, flex:"none", borderRadius:"var(--radius-sm)", background:"var(--ink-950)",
      border:"1px solid var(--border-default)", display:"grid", placeItems:"center", color:"var(--ink-600)", position:"relative" }}>
      <Icon name={icon} size={20} />
      {label && <span style={{ position:"absolute", bottom:5, right:6, fontFamily:"var(--font-mono)", fontSize:9, color:"var(--ink-400)" }}>{label}</span>}
    </div>
  );
}
Object.assign(window, { AppShell, PageHead, Panel, Th, Td, Thumb, RailItem });
