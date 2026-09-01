const { Button, Icon, Badge } = window.EditBayToolsDesignSystem_9ef02b;

function SiteHeader({ route, setRoute }) {
  const items=[["home","Product"],["download","Download"],["pricing","Pricing"],["about","About"],["contact","Contact"]];
  return (
    <header style={{ position:"sticky", top:0, zIndex:30, background:"rgba(255,255,255,.94)",
      backdropFilter:"blur(8px)", borderBottom:"1px solid var(--border-subtle)" }}>
      <div style={{ maxWidth:"var(--page-max)", margin:"0 auto", padding:"0 24px", height:64,
        display:"flex", alignItems:"center", gap:26 }}>
        <img src="../../assets/logo-wordmark-transparent.png" alt="Edit Bay Tools"
          style={{ height:26, display:"block", cursor:"pointer" }} onClick={()=>setRoute("home")} />
        <nav style={{ display:"flex", gap:20, flex:1 }}>
          {items.map(([id,label])=>(
            <button key={id} onClick={()=>setRoute(id)}
              style={{ border:"none", background:"none", cursor:"pointer", fontFamily:"var(--font-sans)",
                fontSize:"var(--size-sm)", fontWeight: route===id ? "var(--weight-semibold)":"var(--weight-medium)",
                color: route===id ? "var(--text-heading)":"var(--text-body)", padding:"4px 0",
                borderBottom: route===id ? "2px solid var(--accent)":"2px solid transparent" }}>{label}</button>
          ))}
        </nav>
        <button onClick={()=>setRoute("login")} style={{ border:"none", background:"none", cursor:"pointer",
          fontFamily:"var(--font-sans)", fontSize:"var(--size-sm)", fontWeight:500, color:"var(--text-body)" }}>Log in</button>
        <Button size="sm" onClick={()=>setRoute("trial")}>Start free trial</Button>
      </div>
    </header>
  );
}

function SiteFooter({ setRoute }) {
  const cols=[
    ["Product",[["Overview","home"],["Download","download"],["Pricing","pricing"],["Release notes","download"]]],
    ["Account",[["Log in","login"],["Sign up","signup"],["Start free trial","trial"],["Manage licence","login"]]],
    ["Company",[["About us","about"],["Contact","contact"],["Support","contact"],["Licensing","pricing"]]],
  ];
  return (
    <footer style={{ background:"var(--ink-900)", color:"var(--ink-300)", padding:"56px 24px 32px" }}>
      <div style={{ maxWidth:"var(--page-max)", margin:"0 auto", display:"grid",
        gridTemplateColumns:"1.4fr 1fr 1fr 1fr", gap:40 }}>
        <div>
          <img src="../../assets/logo-wordmark-knockout.png" alt="Edit Bay Tools" style={{ height:24, display:"block" }} />
          <p style={{ marginTop:16, fontSize:"var(--size-sm)", color:"var(--ink-400)", maxWidth:290, lineHeight:1.6 }}>
            Smart, practical software for the people behind the production.
          </p>
          <div style={{ marginTop:18, fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--ink-500)" }}>
            editbaytools.com
          </div>
        </div>
        {cols.map(([h,links])=>(
          <div key={h}>
            <div className="ebt-eyebrow" style={{ color:"var(--ink-500)", marginBottom:14 }}>{h}</div>
            <div style={{ display:"flex", flexDirection:"column", gap:9, alignItems:"flex-start" }}>
              {links.map(([l,r])=>(
                <button key={l} onClick={()=>setRoute(r)} style={{ border:"none", background:"none", padding:0,
                  cursor:"pointer", fontFamily:"var(--font-sans)", fontSize:"var(--size-sm)", color:"var(--ink-300)" }}>{l}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ maxWidth:"var(--page-max)", margin:"40px auto 0", paddingTop:20,
        borderTop:"1px solid rgba(255,255,255,.08)", display:"flex", gap:16,
        fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--ink-500)" }}>
        <span>© 2026 Edit Bay Tools</span><span style={{flex:1}} /><span>macOS 13+ · Windows 11</span>
      </div>
    </footer>
  );
}

function Section({ eyebrow, title, lead, children, style }) {
  return (
    <section style={{ maxWidth:"var(--page-max)", margin:"0 auto", padding:"72px 24px", ...style }}>
      {eyebrow && <div className="ebt-eyebrow" style={{ marginBottom:14 }}>{eyebrow}</div>}
      {title && <h2 style={{ fontSize:"var(--size-3xl)", maxWidth:760 }}>{title}</h2>}
      {lead && <p style={{ marginTop:16, fontSize:"var(--size-md)", color:"var(--text-body)", maxWidth:640, lineHeight:1.6 }}>{lead}</p>}
      {children && <div style={{ marginTop:36 }}>{children}</div>}
    </section>
  );
}
Object.assign(window, { SiteHeader, SiteFooter, Section });
