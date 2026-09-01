const { Button, Card, Icon, Input, Select, Checkbox, Badge, StatusDot } = window.EditBayToolsDesignSystem_9ef02b;

function ContactPage() {
  const [sent,setSent]=React.useState(false);
  return (
    <div>
      <div style={{ background:"var(--ink-950)", color:"var(--white)", padding:"0 24px" }}>
        <div style={{ maxWidth:"var(--page-max)", margin:"0 auto", padding:"60px 0 56px" }}>
          <div className="ebt-eyebrow" style={{ color:"var(--blue-400)" }}>Contact</div>
          <h1 style={{ marginTop:16, fontSize:"var(--size-4xl)", color:"var(--white)" }}>Talk to a human</h1>
          <p style={{ marginTop:16, fontSize:"var(--size-lg)", color:"var(--ink-300)", maxWidth:580, lineHeight:1.55 }}>
            Support, licensing, or a feature you need. We answer within one business day.
          </p>
        </div>
      </div>
      <Section>
        <div style={{ display:"grid", gridTemplateColumns:"1.3fr 1fr", gap:24, alignItems:"start" }}>
          <Card padding={24} title={sent ? "Message sent" : "Send us a message"}
            footer={sent ? <><Icon name="check" size={12} /> Reference #EB-8421</> : "We answer within one business day."}>
            {sent
              ? <p style={{ fontSize:"var(--size-sm)", lineHeight:1.6 }}>
                  Thanks — we have your message and the details of your setup. You'll get a reply at
                  the address you gave us, usually well inside a business day.
                </p>
              : <div style={{ display:"grid", gap:14 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                    <Input label="Name" placeholder="Dana Kerr" />
                    <Input label="Work email" icon="mail" placeholder="you@studio.tv" />
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                    <Select label="Topic" options={["Technical support","Licensing and billing","Feature request","Something else"]} />
                    <Select label="Role" options={["Video editor","Production engineer","Broadcast operator","IT technician","Other"]} />
                  </div>
                  <Input label="Platform and version" mono placeholder="macOS 14.5 · EditBay Studio 2.8.1" />
                  <Input label="Message" multiline rows={5}
                    placeholder="What happened, what you expected, and the file formats involved." />
                  <Checkbox label="Attach the app's diagnostic log" description="Speeds up support by a lot. No media is included." checked />
                  <Button size="lg" icon="send" onClick={()=>setSent(true)}>Send message</Button>
                </div>}
          </Card>
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <Card padding={20} title="Direct">
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {[["mail","support@editbaytools.com","Support and technical"],
                  ["receipt","billing@editbaytools.com","Licences and invoices"],
                  ["globe","editbaytools.com","Docs and release notes"]].map(([ic,a,b])=>(
                  <div key={a} style={{ display:"flex", gap:11, alignItems:"flex-start" }}>
                    <span style={{ color:"var(--accent)", marginTop:2 }}><Icon name={ic} size={15} /></span>
                    <div>
                      <div style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-2xs)", color:"var(--text-heading)" }}>{a}</div>
                      <div style={{ fontSize:"var(--size-3xs)", color:"var(--text-muted)", marginTop:2 }}>{b}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card padding={20} title="Response times">
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <StatusDot state="ok" label="Support · replying today" />
                <StatusDot state="ok" label="Billing · replying today" />
                <StatusDot state="processing" label="Feature requests · weekly triage" />
                <div style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-3xs)", color:"var(--text-muted)", marginTop:2 }}>
                  Mon–Fri · 09:00–18:00 GMT
                </div>
              </div>
            </Card>
          </div>
        </div>
      </Section>
    </div>
  );
}
Object.assign(window, { ContactPage });
