// Alerts + rules

function AlertsPage({ t, variant }) {
  const [tab, setTab] = React.useState('feed');
  return (
    <div>
      <div style={{display:'flex', borderBottom:`1px solid ${t.border}`, gap:0, marginBottom:16}}>
        {[['feed', 'Alert feed'], ['rules', 'Rules'], ['channels', 'Channels']].map(([id, l]) => (
          <div key={id} onClick={() => setTab(id)} style={{
            padding:'12px 16px', fontSize:13, fontWeight:500, cursor:'pointer',
            color: tab === id ? t.accent : t.textMuted,
            borderBottom: tab === id ? `2px solid ${t.accent}` : '2px solid transparent',
            marginBottom:-1,
          }}>{l}</div>
        ))}
      </div>
      {tab === 'feed' && <AlertFeed t={t}/>}
      {tab === 'rules' && <AlertRules t={t}/>}
      {tab === 'channels' && <AlertChannels t={t}/>}
    </div>
  );
}

function AlertFeed({ t }) {
  const [sev, setSev] = React.useState('all');
  const [state, setState] = React.useState('all');
  const [selected, setSelected] = React.useState(new Set());

  const rows = SAMPLE.alerts.filter(a => {
    if (sev !== 'all' && a.severity !== sev) return false;
    if (state === 'unread' && a.read) return false;
    if (state === 'unresolved' && a.resolved) return false;
    return true;
  });

  return (
    <div>
      <div style={{display:'flex', gap:10, alignItems:'center', marginBottom:14, flexWrap:'wrap'}}>
        <Segmented t={t} value={sev} onChange={setSev}
          options={[{value:'all',label:'All'},{value:'critical',label:'Critical'},{value:'warning',label:'Warning'},{value:'info',label:'Info'}]}/>
        <Segmented t={t} value={state} onChange={setState}
          options={[{value:'all',label:'All'},{value:'unread',label:'Unread'},{value:'unresolved',label:'Open'}]}/>
        <div style={{flex:1}}/>
        {selected.size > 0 ? (
          <>
            <div style={{fontSize:12, color:t.textMuted}}>{selected.size} selected</div>
            <button style={{...protoBtn(t)}}><Icons.check size={13}/> Mark read</button>
            <button style={{...protoBtn(t)}}><Icons.check size={13}/> Resolve</button>
          </>
        ) : (
          <>
            <button style={{...protoBtn(t)}}><Icons.check size={13}/> Mark all read</button>
            <button style={{...protoBtn(t)}}><Icons.download size={13}/> Export</button>
          </>
        )}
      </div>

      <Card t={t} noPad>
        {rows.map((a, i) => {
          const sevColor = a.severity === 'critical' ? t.danger : a.severity === 'warning' ? t.warning : t.info;
          const sel = selected.has(a.id);
          return (
            <div key={a.id} style={{
              display:'flex', gap:12, padding:'14px 18px',
              borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${t.border}`,
              alignItems:'flex-start',
              background: sel ? t.accentGlow : !a.read ? t.surface2 : 'transparent',
              borderLeft: `3px solid ${a.read ? 'transparent' : sevColor}`,
            }}>
              <input type="checkbox" checked={sel} onChange={() => {
                const s = new Set(selected);
                if (s.has(a.id)) s.delete(a.id); else s.add(a.id);
                setSelected(s);
              }} style={{accentColor:t.accent, marginTop:4}}/>
              <div style={{flex:1}}>
                <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                  <Pill t={t} sev={a.severity === 'critical' ? 'danger' : a.severity}>
                    {a.severity === 'critical' && <Icons.alert size={10}/>}
                    {a.severity}
                  </Pill>
                  <span style={{fontSize:14, fontWeight:600}}>{a.title}</span>
                  <span style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO}}>· {a.device}</span>
                  {a.resolved && <Pill t={t} sev="success"><Icons.check size={10}/> resolved</Pill>}
                </div>
                <div style={{fontSize:13, color:t.textMuted, marginTop:4}}>{a.detail}</div>
                <div style={{fontSize:11, color:t.textDim, fontFamily:PROTO_MONO, marginTop:6}}>{a.time}</div>
              </div>
              <div style={{display:'flex', gap:6}}>
                {!a.read && <button style={{...protoBtn(t), padding:'5px 10px', fontSize:11}}><Icons.eye size={11}/> Mark read</button>}
                {!a.resolved && <button style={{...protoBtn(t), padding:'5px 10px', fontSize:11}}><Icons.check size={11}/> Resolve</button>}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <div style={{padding:40, textAlign:'center', color:t.textMuted}}>No alerts match.</div>}
      </Card>
    </div>
  );
}

function AlertRules({ t }) {
  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
        <div style={{fontSize:13, color:t.textMuted}}>Active rules decide when HashHive notifies you. Rules are evaluated every 10 seconds.</div>
        <button style={{...protoBtn(t, 'primary')}}><Icons.plus size={13}/> New rule</button>
      </div>
      <Card t={t} noPad>
        <div style={{display:'grid', gridTemplateColumns:'40px 1.5fr 1fr 0.9fr 1fr 100px 50px', gap:10, padding:'10px 16px', background:t.surface2, borderBottom:`1px solid ${t.border}`, fontSize:10, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:PROTO_MONO, fontWeight:600}}>
          <span></span><span>Rule</span><span>Condition</span><span>Severity</span><span>Channels</span><span>Fired 24h</span><span></span>
        </div>
        {SAMPLE.alertRules.map((r, i) => (
          <div key={r.id} style={{display:'grid', gridTemplateColumns:'40px 1.5fr 1fr 0.9fr 1fr 100px 50px', gap:10, padding:'14px 16px', borderBottom: i === SAMPLE.alertRules.length - 1 ? 'none' : `1px solid ${t.border}`, alignItems:'center', fontSize:13}}>
            <Toggle t={t} on={r.enabled} onChange={()=>{}}/>
            <div>
              <div style={{fontWeight:600}}>{r.name}</div>
              <div style={{fontSize:11, color:t.textMuted, marginTop:2}}>Scope: {r.scope}</div>
            </div>
            <div style={{fontSize:12, fontFamily:PROTO_MONO, color:t.accent}}>{r.condition}</div>
            <Pill t={t} sev={r.severity === 'critical' ? 'danger' : r.severity}>{r.severity}</Pill>
            <div style={{display:'flex', gap:4, flexWrap:'wrap'}}>
              {r.channels.map(c => (
                <span key={c} style={{padding:'2px 7px', background:t.surface2, border:`1px solid ${t.border}`, borderRadius:4, fontSize:10, fontFamily:PROTO_MONO}}>{c}</span>
              ))}
            </div>
            <div style={{fontFamily:PROTO_MONO, color:r.fired24h > 0 ? t.warning : t.textMuted}}>{r.fired24h}x</div>
            <div style={{color:t.textMuted, display:'flex', gap:4, justifyContent:'flex-end'}}><Icons.edit size={14} style={{cursor:'pointer'}}/><Icons.more size={14} style={{cursor:'pointer'}}/></div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function AlertChannels({ t }) {
  const channels = [
    { id: 'telegram', name: 'Telegram', icon: 'telegram', status: 'connected', detail: '@hashhive_alerts · chat 812442', color:t.info },
    { id: 'discord', name: 'Discord', icon: 'discord', status: 'connected', detail: 'webhook · #mining-alerts', color:t.accent },
    { id: 'email', name: 'Email (SMTP)', icon: 'mail', status: 'connected', detail: 'alerts@hashhive.local · smtp.mailgun.org', color:t.honey },
    { id: 'webhook', name: 'Webhook', icon: 'link', status: 'disconnected', detail: 'Post alerts to any URL', color:t.textMuted },
  ];
  return (
    <div style={{display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:14}}>
      {channels.map(c => (
        <Card t={t} key={c.id}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12}}>
            <div style={{display:'flex', gap:12, alignItems:'center'}}>
              <div style={{width:42, height:42, borderRadius:10, background: c.color + '22', display:'flex', alignItems:'center', justifyContent:'center', color:c.color}}>
                {Icons[c.icon]({size:20, color:c.color})}
              </div>
              <div>
                <div style={{fontSize:14, fontWeight:600}}>{c.name}</div>
                <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO, marginTop:2}}>{c.detail}</div>
              </div>
            </div>
            <Pill t={t} sev={c.status === 'connected' ? 'success' : 'muted'}>{c.status}</Pill>
          </div>
          <div style={{display:'flex', gap:6}}>
            <button style={{...protoBtn(t)}}><Icons.power size={13}/> Test</button>
            <button style={{...protoBtn(t)}}><Icons.edit size={13}/> Configure</button>
            {c.status === 'disconnected' && <button style={{...protoBtn(t, 'primary'), marginLeft:'auto'}}>Connect</button>}
          </div>
        </Card>
      ))}
    </div>
  );
}

window.AlertsPage = AlertsPage;
