const { Button, Card, Badge, Icon, Input, Select, Checkbox, StatusDot, ProgressBar } = window.EditBayToolsDesignSystem_9ef02b;

function AuthShell({ eyebrow, title, lead, children, aside }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", minHeight:640 }}>
      <div style={{ display:"grid", placeItems:"center", padding:"56px 24px" }}>
        <div style={{ width:"100%", maxWidth:400 }}>
          <div className="ebt-eyebrow" style={{ marginBottom:12 }}>{eyebrow}</div>
          <h2 style={{ fontSize:"var(--size-2xl)" }}>{title}</h2>
          {lead && <p style={{ marginTop:12, fontSize:"var(--size-sm)", color:"var(--text-body)", lineHeight:1.6 }}>{lead}</p>}
          <div style={{ marginTop:26, display:"grid", gap:14 }}>{children}</div>
        </div>
      </div>
      <div className="ebt-dark" style={{ background:"var(--ink-950)", color:"var(--white)", display:"grid", placeItems:"center", padding:"56px 40px" }}>
        <div style={{ maxWidth:400 }}>{aside}</div>
      </div>
    </div>
  );
}

function TrialAside() {
  return (
    <>
      <img src="../../assets/logo-wordmark-knockout.png" alt="Edit Bay Tools" style={{ height:24, display:"block" }} />
      <h3 style={{ marginTop:26, fontSize:"var(--size-xl)", color:"var(--white)" }}>Everything unlocked for 14 days</h3>
      <div style={{ marginTop:20, display:"flex", flexDirection:"column", gap:11 }}>
        {["Download video and audio from the web","Convert virtually any media format","Social clip export at four aspect ratios","Attribution templates and graphics","Merge video and audio with waveform sync","Timecode calculator at any frame rate","Premiere Pro handoff"].map(f=>(
          <div key={f} style={{ display:"flex", gap:9, alignItems:"center", fontSize:"var(--size-sm)", color:"var(--ink-300)" }}>
            <Icon name="check" size={14} style={{ color:"var(--state-ok)" }} />{f}
          </div>
        ))}
      </div>
      <div style={{ marginTop:24, paddingTop:18, borderTop:"1px solid rgba(255,255,255,.1)",
        fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--ink-500)" }}>
        no card required · cancel by doing nothing
      </div>
    </>
  );
}

function LoginPage({ setRoute }) {
  return (
    <AuthShell eyebrow="Log in" title="Welcome back"
      lead="Sign in to manage your licence, seats and downloads."
      aside={<>
        <img src="../../assets/logo-wordmark-knockout.png" alt="Edit Bay Tools" style={{ height:24, display:"block" }} />
        <h3 style={{ marginTop:26, fontSize:"var(--size-xl)", color:"var(--white)" }}>Your licence, your machines</h3>
        <p style={{ marginTop:14, fontSize:"var(--size-sm)", color:"var(--ink-300)", lineHeight:1.6 }}>
          Move a seat between machines, download older builds, and see what changed in each release.
        </p>
        <div style={{ marginTop:22, display:"flex", flexDirection:"column", gap:10 }}>
          <StatusDot state="ok" label="Studio licence · 1 seat" />
          <StatusDot state="ok" label="Activated on 1 of 1 machine" />
        </div>
      </>}>
      <Input label="Work email" icon="mail" placeholder="you@studio.tv" />
      <Input label="Password" icon="lock" type="password" placeholder="••••••••••" />
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
        <Checkbox label="Keep me signed in" />
        <a href="#" onClick={e=>e.preventDefault()} style={{ fontSize:"var(--size-2xs)" }}>Forgot password?</a>
      </div>
      <Button size="lg" fullWidth icon="log-in">Log in</Button>
      <div style={{ display:"flex", alignItems:"center", gap:12, color:"var(--text-muted)" }}>
        <span style={{ flex:1, height:1, background:"var(--border-subtle)" }} />
        <span style={{ fontSize:"var(--size-3xs)" }}>or</span>
        <span style={{ flex:1, height:1, background:"var(--border-subtle)" }} />
      </div>
      <Button size="lg" fullWidth variant="secondary" icon="key-round">Use a licence key</Button>
      <p style={{ fontSize:"var(--size-2xs)", color:"var(--text-muted)", textAlign:"center" }}>
        No account yet? <a href="#" onClick={e=>{e.preventDefault();setRoute("signup");}}>Sign up</a>
      </p>
    </AuthShell>
  );
}

function SignupPage({ setRoute }) {
  return (
    <AuthShell eyebrow="Sign up" title="Create your account"
      lead="One account holds your licence, your seats and your download history."
      aside={<TrialAside />}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <Input label="First name" placeholder="Dana" />
        <Input label="Last name" placeholder="Kerr" />
      </div>
      <Input label="Work email" icon="mail" placeholder="you@studio.tv" />
      <Input label="Password" icon="lock" type="password" hint="At least 12 characters." placeholder="••••••••••••" />
      <Select label="What you do" options={["Video editor","Production engineer","Broadcast operator","IT technician","Other"]} />
      <Checkbox label="Email me release notes" description="One message per release. Nothing else." checked />
      <Checkbox label="I agree to the licence terms" />
      <Button size="lg" fullWidth icon="user-plus">Create account</Button>
      <p style={{ fontSize:"var(--size-2xs)", color:"var(--text-muted)", textAlign:"center" }}>
        Already have one? <a href="#" onClick={e=>{e.preventDefault();setRoute("login");}}>Log in</a>
      </p>
    </AuthShell>
  );
}

function TrialPage({ setRoute }) {
  const [step,setStep]=React.useState(0);
  const [os,setOs]=React.useState("macos");
  if (step === 1) {
    return (
      <AuthShell eyebrow="Free trial" title="You're in — 14 days, everything unlocked"
        lead="Install EditBay Studio and sign in with the account you just made. The counter starts at first launch."
        aside={<TrialAside />}>
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", background:"var(--bg-well)",
          border:"1px solid var(--border-subtle)", borderRadius:"var(--radius-md)" }}>
          <StatusDot state="ok" pulse />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:"var(--size-xs)", color:"var(--text-heading)", fontWeight:500 }}>Trial active</div>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--text-muted)", marginTop:3 }}>
              14 days remaining · expires 07 Sep 2026
            </div>
          </div>
          <Badge tone="ok">active</Badge>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {[["macos","apple","macOS"],["windows","monitor","Windows"]].map(([id,ic,l])=>(
            <button key={id} onClick={()=>setOs(id)} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
              gap:8, padding:"12px 8px", cursor:"pointer", borderRadius:"var(--radius-md)",
              background: os===id ? "var(--accent-soft)":"var(--bg-well)",
              border:"1px solid " + (os===id ? "var(--accent-border)":"var(--border-subtle)"),
              color: os===id ? "var(--accent)":"var(--text-body)", fontFamily:"var(--font-sans)",
              fontSize:"var(--size-2xs)", fontWeight:500, transition:"var(--transition-control)" }}>
              <Icon name={ic} size={16} />{l}
            </button>
          ))}
        </div>
        <Button size="lg" fullWidth icon="download">Download EditBay Studio 2.8.1</Button>
        <Button size="lg" fullWidth variant="ghost" iconRight="arrow-right" onClick={()=>setRoute("home")}>Back to the product</Button>
      </AuthShell>
    );
  }
  return (
    <AuthShell eyebrow="Free trial" title="Start your 14-day trial"
      lead="No card required. Every tool unlocked from first launch."
      aside={<TrialAside />}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:2 }}>
        <div style={{ flex:1 }}><ProgressBar value={50} height={3} label="Step 1 of 2" valueLabel="Account" /></div>
      </div>
      <Input label="Work email" icon="mail" placeholder="you@studio.tv" />
      <Input label="Password" icon="lock" type="password" hint="At least 12 characters." placeholder="••••••••••••" />
      <Select label="What you'll use it for" options={["Editing and delivery","Ingest and conversion","Social versioning","Broadcast operations","Evaluating for a team"]} />
      <Checkbox label="I agree to the licence terms" />
      <Button size="lg" fullWidth icon="arrow-right" onClick={()=>setStep(1)}>Start free trial</Button>
      <p style={{ fontSize:"var(--size-2xs)", color:"var(--text-muted)", textAlign:"center" }}>
        Already have an account? <a href="#" onClick={e=>{e.preventDefault();setRoute("login");}}>Log in</a>
      </p>
    </AuthShell>
  );
}
Object.assign(window, { LoginPage, SignupPage, TrialPage, AuthShell });
