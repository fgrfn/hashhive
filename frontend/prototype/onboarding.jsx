// Onboarding flow — first-run wizard, used on Dashboard when no devices yet.

function Onboarding({ t, onComplete }) {
  const [step, setStep] = React.useState(0);
  const [scanning, setScanning] = React.useState(false);
  const [found, setFound] = React.useState([]);
  const [selected, setSelected] = React.useState(new Set());
  const [ranges, setRanges] = React.useState('192.168.1.0/24');
  const [pool, setPool] = React.useState({ url: 'stratum+tcp://solo.ckpool.org:3333', worker: '', password: 'x' });
  const [channels, setChannels] = React.useState(new Set(['email']));

  const mockFound = [
    { name: 'BitAxe-Ultra-01', ip: '192.168.1.45', asic: 'BM1366', type: 'BitAxe Ultra' },
    { name: 'BitAxe-Ultra-02', ip: '192.168.1.46', asic: 'BM1366', type: 'BitAxe Ultra' },
    { name: 'NerdAxe-01', ip: '192.168.1.47', asic: 'BM1366', type: 'NerdAxe' },
    { name: 'NMMiner-rig01', ip: '192.168.1.50', type: 'NMMiner CPU' },
  ];

  const startScan = () => {
    setScanning(true); setFound([]);
    mockFound.forEach((d, i) => setTimeout(() => setFound(f => [...f, d]), 500 + i * 400));
    setTimeout(() => {
      setScanning(false);
      setSelected(new Set(mockFound.map(d => d.ip)));
    }, 500 + mockFound.length * 400 + 300);
  };

  const steps = [
    { title: 'Welcome to HashHive', desc: 'Unified dashboard for NMMiner, BitAxe and NerdAxe' },
    { title: 'Find your miners', desc: 'We’ll scan your network for supported devices' },
    { title: 'Select devices', desc: 'Choose which devices to manage' },
    { title: 'Default pool', desc: 'Set a default pool for new devices (you can change this later)' },
    { title: 'Notifications', desc: 'How do you want to be notified about issues?' },
    { title: 'All set', desc: '' },
  ];

  return (
    <div style={{maxWidth:680, margin:'40px auto'}}>
      {/* Progress */}
      <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:28}}>
        {steps.slice(0, -1).map((_, i) => (
          <div key={i} style={{
            flex:1, height:3, borderRadius:2,
            background: step >= i ? t.accent : t.border,
            transition: 'background .3s',
          }}/>
        ))}
        <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO, marginLeft:10, minWidth:50}}>
          {step + 1} / {steps.length}
        </div>
      </div>

      <div style={{marginBottom:26}}>
        <div style={{fontSize:28, fontWeight:700, letterSpacing:'-0.03em', textWrap:'balance'}}>{steps[step].title}</div>
        {steps[step].desc && <div style={{fontSize:15, color:t.textMuted, marginTop:8}}>{steps[step].desc}</div>}
      </div>

      {/* Step content */}
      {step === 0 && (
        <Card t={t} style={{padding:'28px 32px'}}>
          <div style={{display:'flex', justifyContent:'center', marginBottom:16}}>
            <HiveMark size={80} primary={t.accent} secondary={t.honey}/>
          </div>
          <div style={{fontSize:15, textAlign:'center', color:t.textMuted, lineHeight:1.6, maxWidth:420, margin:'0 auto'}}>
            You’re about to set up your mining command center. This takes about 2 minutes.
            We’ll find your miners, configure a default pool, and set up notifications.
          </div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10, marginTop:24}}>
            {[
              ['Unified', 'Manage NMMiner, BitAxe and NerdAxe from one place'],
              ['Alerts', 'Get notified when devices go offline or misbehave'],
              ['Insights', 'Charts, heatmaps, earnings and lucky factor'],
            ].map(([h, d]) => (
              <div key={h} style={{padding:'12px 14px', background:t.surface2, border:`1px solid ${t.border}`, borderRadius:10}}>
                <div style={{fontSize:13, fontWeight:600}}>{h}</div>
                <div style={{fontSize:11, color:t.textMuted, marginTop:3, lineHeight:1.5}}>{d}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card t={t}>
          <FormField t={t} label="Scan ranges (CIDR, comma-separated)" value={ranges} onChange={setRanges} mono/>
          <div style={{fontSize:12, color:t.textMuted, marginTop:6}}>
            Scanning covers HTTP ports used by BitAxe/NerdAxe (80, 8080) and NMMiner (4028, 4067). Nothing is sent outside your LAN.
          </div>
          {!scanning && found.length === 0 && (
            <button onClick={startScan} style={{...protoBtn(t, 'primary'), marginTop:18, width:'100%', padding:'12px', fontSize:13}}>
              <Icons.search size={15}/> Scan my network
            </button>
          )}
          {(scanning || found.length > 0) && (
            <div style={{marginTop:18, background:t.bg, border:`1px solid ${t.border}`, borderRadius:10, padding:'6px 0', fontFamily:PROTO_MONO, fontSize:12, minHeight:160, maxHeight:240, overflow:'auto'}}>
              <div style={{padding:'6px 12px', color:t.textMuted, display:'flex', alignItems:'center', gap:8, borderBottom:`1px solid ${t.border}`}}>
                {scanning ? <><Spinner t={t}/> scanning {ranges}…</> : <><Icons.check size={12} color={t.success}/> scan complete · {found.length} devices found</>}
              </div>
              {found.map((d,i) => (
                <div key={i} style={{padding:'6px 12px', color:t.success, animation: 'proto-fade-in .25s ease-out'}}>
                  ✓ {d.ip.padEnd(16)} {(d.name).padEnd(22)} <span style={{color:t.textMuted}}>{d.type}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {step === 2 && (
        <Card t={t} noPad>
          {found.map((d, i) => {
            const sel = selected.has(d.ip);
            return (
              <div key={d.ip} onClick={() => {
                const s = new Set(selected); if (s.has(d.ip)) s.delete(d.ip); else s.add(d.ip); setSelected(s);
              }} style={{
                display:'flex', gap:12, padding:'14px 18px', alignItems:'center', cursor:'pointer',
                borderBottom: i === found.length - 1 ? 'none' : `1px solid ${t.border}`,
                background: sel ? t.accentGlow : 'transparent',
              }}>
                <input type="checkbox" checked={sel} onChange={()=>{}} style={{accentColor:t.accent}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:14, fontWeight:600}}>{d.name}</div>
                  <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO, marginTop:2}}>{d.ip} · {d.asic || 'CPU'} · {d.type}</div>
                </div>
                <Pill t={t} sev="success">✓ online</Pill>
              </div>
            );
          })}
        </Card>
      )}

      {step === 3 && (
        <Card t={t}>
          <FormField t={t} label="Pool URL" value={pool.url} onChange={v => setPool({...pool, url: v})} mono/>
          <div style={{height:12}}/>
          <FormField t={t} label="Worker (wallet or username)" value={pool.worker} onChange={v => setPool({...pool, worker: v})} mono placeholder="bc1q… or user.worker"/>
          <div style={{height:12}}/>
          <FormField t={t} label="Password (usually 'x')" value={pool.password} onChange={v => setPool({...pool, password: v})} mono/>
          <Banner t={t} tone="info" icon={<Icons.help size={14}/>}>
            Not sure? We’ve prefilled CKPool for BTC solo mining. You can change this any time in Pool settings.
          </Banner>
        </Card>
      )}

      {step === 4 && (
        <Card t={t}>
          <Label t={t} style={{marginBottom:12}}>Select channels</Label>
          {['email','telegram','discord','webhook'].map(c => {
            const on = channels.has(c);
            return (
              <div key={c} onClick={() => {
                const s = new Set(channels); if (s.has(c)) s.delete(c); else s.add(c); setChannels(s);
              }} style={{
                display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:10, cursor:'pointer',
                background: on ? t.accentGlow : t.surface2, border:`1px solid ${on ? t.accent : t.border}`, marginBottom:8,
              }}>
                <div style={{width:34, height:34, borderRadius:8, background: t.surface, display:'flex', alignItems:'center', justifyContent:'center'}}>
                  {Icons[c === 'webhook' ? 'link' : c === 'email' ? 'mail' : c]({size:18, color: on ? t.accent : t.textMuted})}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13, fontWeight:600, textTransform:'capitalize'}}>{c}</div>
                  <div style={{fontSize:11, color:t.textMuted, marginTop:2}}>
                    {c === 'email' && 'Receive alerts by email'}
                    {c === 'telegram' && 'Push alerts to your Telegram chat'}
                    {c === 'discord' && 'Post alerts in a Discord channel'}
                    {c === 'webhook' && 'POST alerts to a custom URL'}
                  </div>
                </div>
                <div style={{width:18, height:18, border: `2px solid ${on ? t.accent : t.textMuted}`, borderRadius: 4, background: on ? t.accent : 'transparent', display:'flex', alignItems:'center', justifyContent:'center'}}>
                  {on && <Icons.check size={12} color="#fff" stroke={3}/>}
                </div>
              </div>
            );
          })}
          <div style={{fontSize:11, color:t.textMuted, marginTop:4}}>
            You’ll configure credentials for each channel after setup.
          </div>
        </Card>
      )}

      {step === 5 && (
        <Card t={t} style={{padding:'40px 32px', textAlign:'center'}}>
          <div style={{width:64, height:64, borderRadius:'50%', background: t.success + '22', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:14}}>
            <Icons.check size={32} color={t.success}/>
          </div>
          <div style={{fontSize:22, fontWeight:700}}>You’re all set</div>
          <div style={{fontSize:14, color:t.textMuted, marginTop:8, maxWidth:380, margin:'8px auto 0'}}>
            {selected.size} devices added, pool configured, notifications via {Array.from(channels).join(' & ')}.
          </div>
          <button onClick={onComplete} style={{...protoBtn(t, 'primary'), marginTop:24, padding:'12px 24px', fontSize:13}}>
            Open dashboard <Icons.arrowRight size={13}/>
          </button>
        </Card>
      )}

      {/* Footer */}
      {step < 5 && (
        <div style={{display:'flex', justifyContent:'space-between', marginTop:20}}>
          <button onClick={() => setStep(Math.max(0, step-1))} disabled={step === 0}
            style={{...protoBtn(t), opacity: step === 0 ? 0.4 : 1}}>
            <Icons.arrowLeft size={13}/> Back
          </button>
          <div style={{display:'flex', gap:8}}>
            {step > 0 && step < 4 && (
              <button onClick={onComplete} style={{...protoBtn(t)}}>Skip setup</button>
            )}
            <button
              disabled={step === 1 && found.length === 0 || step === 2 && selected.size === 0}
              onClick={() => setStep(step + 1)}
              style={{...protoBtn(t, 'primary'),
                opacity: (step === 1 && found.length === 0 || step === 2 && selected.size === 0) ? 0.5 : 1}}>
              {step === 4 ? 'Finish' : 'Continue'} <Icons.arrowRight size={13}/>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

window.Onboarding = Onboarding;
