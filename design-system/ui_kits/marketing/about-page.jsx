const { Icon, Button, Card, Badge } = window.EditBayToolsDesignSystem_9ef02b;

function AboutPage({ setRoute }) {
  return (
    <div>
      <div style={{ background:"var(--ink-950)", color:"var(--white)", padding:"0 24px" }}>
        <div style={{ maxWidth:"var(--page-max)", margin:"0 auto", padding:"60px 0 56px" }}>
          <div className="ebt-eyebrow" style={{ color:"var(--blue-400)" }}>About us</div>
          <h1 style={{ marginTop:16, fontSize:"var(--size-4xl)", color:"var(--white)", maxWidth:820 }}>
            We build for the people behind the production
          </h1>
          <p style={{ marginTop:18, fontSize:"var(--size-lg)", color:"var(--ink-300)", maxWidth:640, lineHeight:1.55 }}>
            Edit Bay Tools builds smart, practical software for production engineers, video editors,
            broadcast teams and IT technicians. From the edit bay to the control room.
          </p>
        </div>
      </div>

      <Section eyebrow="How we work" title="Fix the boring part first"
        lead="Every feature in EditBay Studio started as something a working editor or engineer was doing by hand — pasting URLs into a converter, re-exporting a cut at four aspect ratios, adding the same credit to every clip, doing timecode maths on a phone calculator. We build the version that takes one click, then get out of the way.">
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:32 }}>
          {[["users","Made with operators","Features come from the floor, not a roadmap workshop. If nobody on shift asked for it, we don't ship it."],
            ["laptop","Local by default","Your media stays on your machine. No upload step, no queue in someone else's data centre."],
            ["wrench","Practical over clever","Plain controls, exact numbers, no hidden state. A tool you can hand to a new hire on day one."]].map(([ic,h,b])=>(
            <div key={h}>
              <span style={{ color:"var(--accent)" }}><Icon name={ic} size={20} /></span>
              <h4 style={{ marginTop:14, fontSize:"var(--size-lg)" }}>{h}</h4>
              <p style={{ marginTop:10, fontSize:"var(--size-sm)", color:"var(--text-body)", lineHeight:1.6 }}>{b}</p>
            </div>
          ))}
        </div>
      </Section>

      <div style={{ background:"var(--bg-well)", borderTop:"1px solid var(--border-subtle)", borderBottom:"1px solid var(--border-subtle)" }}>
        <Section eyebrow="Who it's for" title="The rooms we design for">
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16 }}>
            {[["film","Video editors","Cutting, versioning and delivering on a deadline."],
              ["settings","Production engineers","Keeping media moving between formats and machines."],
              ["radio","Broadcast teams","Getting the right file to the right output on time."],
              ["server","IT technicians","Supporting all of the above without becoming the bottleneck."]].map(([ic,h,b])=>(
              <Card key={h} padding={20}>
                <span style={{ color:"var(--accent)" }}><Icon name={ic} size={18} /></span>
                <h4 style={{ marginTop:12, fontSize:"var(--size-md)" }}>{h}</h4>
                <p style={{ marginTop:8, fontSize:"var(--size-sm)", color:"var(--text-body)", lineHeight:1.55 }}>{b}</p>
              </Card>
            ))}
          </div>
        </Section>
      </div>

      <Section>
        <div style={{ background:"var(--ink-900)", borderRadius:"var(--radius-xl)", padding:44,
          display:"flex", alignItems:"center", gap:32 }}>
          <div style={{ flex:1 }}>
            <h3 style={{ fontSize:"var(--size-2xl)", color:"var(--white)" }}>Tell us what's slowing you down</h3>
            <p style={{ marginTop:12, fontSize:"var(--size-md)", color:"var(--ink-300)", maxWidth:520, lineHeight:1.6 }}>
              The next tool usually comes out of a message like yours.
            </p>
          </div>
          <Button size="lg" icon="mail" onClick={()=>setRoute("contact")}>Contact us</Button>
        </div>
      </Section>
    </div>
  );
}
Object.assign(window, { AboutPage });
