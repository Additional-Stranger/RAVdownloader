const { Button, Card, Badge, Icon, StatusDot } = window.EditBayToolsDesignSystem_9ef02b;

function Row({ label, on }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:9, fontSize:"var(--size-sm)",
      color: on ? "var(--text-body)":"var(--text-muted)" }}>
      <Icon name={on ? "check" : "minus"} size={14} style={{ color: on ? "var(--state-ok)":"var(--text-muted)" }} />
      {label}
    </div>
  );
}

function PricingPage({ setRoute }) {
  const feats=["Download from the web","Convert any format","Social clip export","Attribution templates","Merge video and audio","Timecode calculator","Premiere Pro handoff","Batch queues","Priority support"];
  const plans=[
    { name:"Free trial", price:"$0", per:"for 14 days", note:"Every tool unlocked. No card required.", cta:"Start free trial", route:"trial", on:9, variant:"secondary" },
    { name:"Studio", price:"$19", per:"per month", note:"One seat, one machine at a time.", cta:"Buy Studio", route:"signup", on:8, variant:"primary", featured:true },
    { name:"Studio Team", price:"$15", per:"per seat / month", note:"Five seats or more, one invoice.", cta:"Contact sales", route:"contact", on:9, variant:"secondary" },
  ];
  return (
    <div>
      <div style={{ background:"var(--ink-950)", color:"var(--white)", padding:"0 24px" }}>
        <div style={{ maxWidth:"var(--page-max)", margin:"0 auto", padding:"60px 0 56px" }}>
          <div className="ebt-eyebrow" style={{ color:"var(--blue-400)" }}>Pricing</div>
          <h1 style={{ marginTop:16, fontSize:"var(--size-4xl)", color:"var(--white)" }}>One product, three ways to pay</h1>
          <p style={{ marginTop:16, fontSize:"var(--size-lg)", color:"var(--ink-300)", maxWidth:580, lineHeight:1.55 }}>
            Start on the trial. Move to a licence when it earns its place in your workflow.
          </p>
        </div>
      </div>
      <Section>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, alignItems:"start" }}>
          {plans.map(p=>(
            <div key={p.name} style={{ background:"var(--surface-card)",
              border:"1px solid " + (p.featured ? "var(--accent-border)":"var(--border-subtle)"),
              borderRadius:"var(--radius-lg)", padding:24,
              boxShadow: p.featured ? "var(--shadow-md)":"var(--shadow-sm)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                <div className="ebt-eyebrow">{p.name}</div>
                {p.featured && <Badge tone="accent">most picked</Badge>}
              </div>
              <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
                <span style={{ fontFamily:"var(--font-display)", fontSize:"var(--size-3xl)", fontWeight:600,
                  letterSpacing:"var(--track-display)", color:"var(--text-heading)" }}>{p.price}</span>
                <span style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-2xs)", color:"var(--text-muted)" }}>{p.per}</span>
              </div>
              <p style={{ marginTop:12, fontSize:"var(--size-sm)", color:"var(--text-body)" }}>{p.note}</p>
              <div style={{ margin:"18px 0", height:1, background:"var(--border-subtle)" }} />
              <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                {feats.map((f,i)=><Row key={f} label={f} on={i < p.on} />)}
              </div>
              <div style={{ marginTop:22 }}>
                <Button fullWidth size="lg" variant={p.variant} onClick={()=>setRoute(p.route)}>{p.cta}</Button>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <div style={{ background:"var(--bg-well)", borderTop:"1px solid var(--border-subtle)" }}>
        <Section eyebrow="Trial terms" title="How the free trial works">
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:32 }}>
            {[["calendar-days","14 days from first launch","Every tool unlocked. The counter starts when you open the app, not when you download it."],
              ["credit-card","No card up front","We ask for payment details only when you choose a licence."],
              ["file-check","Your work stays yours","Files made during the trial carry no watermark and stay readable after it ends."]].map(([ic,h,b])=>(
              <div key={h}>
                <span style={{ color:"var(--accent)" }}><Icon name={ic} size={20} /></span>
                <h4 style={{ marginTop:14, fontSize:"var(--size-lg)" }}>{h}</h4>
                <p style={{ marginTop:10, fontSize:"var(--size-sm)", color:"var(--text-body)", lineHeight:1.6 }}>{b}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
Object.assign(window, { PricingPage });
