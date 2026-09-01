const { Button, IconButton, Badge, Input, Select, Tabs, Timecode, Icon, Tooltip } = window.EditBayToolsDesignSystem_9ef02b;

function TimecodeScreen() {
  const [op,setOp]=React.useState("add");
  const [a,setA]=React.useState("01:23:45:12");
  const [b,setB]=React.useState("00:04:12:06");
  const fps=25;
  const toF=s=>{const [h,m,se,f]=s.split(":").map(Number); return ((h*3600+m*60+se)*fps)+f;};
  const toTC=n=>{n=Math.max(0,n);const f=n%fps,t=Math.floor(n/fps);
    return [Math.floor(t/3600),Math.floor(t%3600/60),t%60,f].map(v=>String(v).padStart(2,"0")).join(":");};
  const result = op==="add" ? toTC(toF(a)+toF(b)) : op==="sub" ? toTC(toF(a)-toF(b)) : toTC(Math.abs(toF(a)-toF(b)));
  return (
    <>
      <PageHead eyebrow="Calculate" title="Timecode calculator" meta={"base 25 fps · non-drop"} />
      <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:16, alignItems:"start" }}>
        <Panel style={{ padding:22 }}>
          <Tabs variant="segmented" value={op} onChange={setOp} style={{ marginBottom:20 }} items={[
            {value:"add",label:"Add"},{value:"sub",label:"Subtract"},{value:"dur",label:"Duration between"}]} />
          <div style={{ display:"grid", gap:14, maxWidth:340 }}>
            <Input label={op==="dur"?"In point":"Timecode A"} mono value={a} onChange={e=>setA(e.target.value)} size="lg" />
            <Input label={op==="dur"?"Out point":"Timecode B"} mono value={b} onChange={e=>setB(e.target.value)} size="lg" />
          </div>
          <div style={{ marginTop:24, paddingTop:20, borderTop:"1px solid var(--border-subtle)" }}>
            <div className="ebt-eyebrow" style={{ marginBottom:10 }}>Result</div>
            <div style={{ display:"flex", alignItems:"baseline", gap:14 }}>
              <Timecode value={result} size="lg" tone="accent" />
              <span style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-2xs)", color:"var(--text-muted)" }}>
                {toF(result)} frames · {(toF(result)/fps).toFixed(2)} s
              </span>
              <div style={{ flex:1 }} />
              <Tooltip label="Copy result" shortcut="⌘C"><IconButton icon="copy" label="Copy result" /></Tooltip>
            </div>
          </div>
        </Panel>
        <Panel style={{ padding:18 }}>
          <div className="ebt-eyebrow" style={{ marginBottom:14 }}>Base</div>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <Select label="Frame rate" options={["25 fps","24 fps","23.976 fps","29.97 fps","30 fps","50 fps","59.94 fps"]} />
            <Select label="Counting" options={["Non-drop","Drop frame"]} />
            <div style={{ height:1, background:"var(--border-subtle)" }} />
            <div className="ebt-eyebrow">Conversions</div>
            {[["Frames",toF(result)],["Seconds",(toF(result)/fps).toFixed(3)],["Feet + frames (35mm)",Math.floor(toF(result)/16)+"+"+(toF(result)%16)]].map(([k,v])=>(
              <div key={k} style={{ display:"flex", justifyContent:"space-between", gap:12 }}>
                <span style={{ fontSize:"var(--size-2xs)", color:"var(--text-muted)" }}>{k}</span>
                <span style={{ fontFamily:"var(--font-mono)", fontSize:"var(--size-2xs)", color:"var(--text-heading)" }}>{v}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
Object.assign(window, { TimecodeScreen });
