// Mobile variant — a compact layout of the dashboard + device list + drawer,
// shown inside an iOS frame artboard. Not a separate route; rendered by the
// shell when mobile mode is on.

function MobileShell({ t, initial = 'dashboard' }) {
  const [screen, setScreen] = React.useState(initial);
  const [device, setDevice] = React.useState(null);
  const [menu, setMenu] = React.useState(false);

  const tabs = [
    { id: 'dashboard', label: 'Home', icon: 'dashboard' },
    { id: 'devices', label: 'Devices', icon: 'cpu' },
    { id: 'alerts', label: 'Alerts', icon: 'bell' },
    { id: 'more', label: 'More', icon: 'menu' },
  ];

  return (
    <div style={{position:'relative', height:'100%', background:t.bg, color:t.text, overflow:'hidden'}}>
      {/* Topbar */}
      <div style={{display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderBottom:`1px solid ${t.border}`, background:t.surface, position:'sticky', top:0, zIndex:5}}>
        <HiveMark size={20} primary={t.accent} secondary={t.honey}/>
        <div style={{fontSize:15, fontWeight:700, letterSpacing:'-0.01em'}}>HashHive</div>
        <div style={{flex:1}}/>
        <div style={{padding:'4px 8px', background:t.success + '22', color:t.success, borderRadius:6, fontSize:10, fontFamily:PROTO_MONO, display:'flex', alignItems:'center', gap:4}}>
          <span style={{width:5, height:5, borderRadius:'50%', background:t.success, boxShadow:`0 0 5px ${t.success}`}}/> live
        </div>
      </div>

      {/* Content */}
      <div style={{padding:'14px 14px 72px', height:'calc(100% - 56px)', overflow:'auto'}}>
        {screen === 'dashboard' && <MobileDash t={t} onDevice={d => { setDevice(d); }}/>}
        {screen === 'devices' && <MobileDevices t={t} onDevice={d => { setDevice(d); }}/>}
        {screen === 'alerts' && <MobileAlerts t={t}/>}
        {screen === 'more' && <MobileMore t={t}/>}
      </div>

      {/* Tab bar */}
      <div style={{position:'absolute', left:0, right:0, bottom:0, display:'grid', gridTemplateColumns:'repeat(4, 1fr)', background:t.surface, borderTop:`1px solid ${t.border}`, paddingBottom:0}}>
        {tabs.map(tab => {
          const active = screen === tab.id;
          return (
            <div key={tab.id} onClick={() => setScreen(tab.id)} style={{
              display:'flex', flexDirection:'column', alignItems:'center', gap:3, padding:'9px 4px 11px',
              color: active ? t.accent : t.textMuted, cursor:'pointer',
            }}>
              {Icons[tab.icon]({size:19, color: active ? t.accent : t.textMuted})}
              <span style={{fontSize:10, fontWeight:active?600:500}}>{tab.label}</span>
            </div>
          );
        })}
      </div>

      {/* Device sheet */}
      {device && (
        <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', zIndex:20, display:'flex', alignItems:'flex-end'}} onClick={() => setDevice(null)}>
          <div onClick={e => e.stopPropagation()} style={{background:t.surface, width:'100%', maxHeight:'88%', borderRadius:'18px 18px 0 0', overflow:'auto', padding:'14px 18px 24px', animation:'proto-slide-up .2s ease-out'}}>
            <div style={{width:36, height:4, background:t.border, borderRadius:2, margin:'0 auto 14px'}}/>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14}}>
              <div>
                <div style={{fontSize:20, fontWeight:700, letterSpacing:'-0.02em'}}>{device.name}</div>
                <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO, marginTop:3}}>{device.ip} · {device.asic || device.type}</div>
                <div style={{marginTop:8}}><StatusPill t={t} status={device.status}/></div>
              </div>
              <button onClick={() => setDevice(null)} style={{...protoBtn(t), padding:6}}><Icons.x size={14}/></button>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14}}>
              {[
                ['Hashrate', device.hr > 0 ? `${device.hr.toFixed(1)}` : '—', 'GH/s', t.accent],
                ['Temp', device.temp != null ? `${device.temp}°` : '—', 'C', t.warning],
                ['Power', device.power != null ? `${device.power.toFixed(1)}` : '—', 'W', t.honey],
                ['Best', device.bestDiff || '—', '', t.honey],
              ].map(([l,v,u,c]) => (
                <div key={l} style={{background:t.bg, border:`1px solid ${t.border}`, borderRadius:10, padding:'10px 12px'}}>
                  <div style={{fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO, textTransform:'uppercase', letterSpacing:'0.08em'}}>{l}</div>
                  <div style={{fontSize:18, fontWeight:700, color:c, fontFamily:PROTO_MONO, marginTop:2}}>{v} <span style={{fontSize:10, color:t.textMuted, fontWeight:400}}>{u}</span></div>
                </div>
              ))}
            </div>
            <AreaChart t={t} data={PROTO.hr1h(device.name.length, (device.hr || 400) * 0.03, device.hr || 400)} accent={t.accent} h={110}/>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:14}}>
              <button style={{...protoBtn(t), justifyContent:'center', padding:'10px'}}><Icons.pause size={14}/> Pause</button>
              <button style={{...protoBtn(t), justifyContent:'center', padding:'10px'}}><Icons.restart size={14}/> Restart</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileDash({ t, onDevice }) {
  const S = SAMPLE;
  return (
    <div>
      <div style={{padding:'4px 0 12px'}}>
        <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO, textTransform:'uppercase', letterSpacing:'0.08em'}}>Total hashrate</div>
        <div style={{display:'flex', alignItems:'baseline', gap:8, marginTop:4}}>
          <div style={{fontSize:34, fontWeight:700, color:t.accent, fontFamily:PROTO_MONO, letterSpacing:'-0.02em'}}>{S.totalHashrate.toLocaleString()}</div>
          <div style={{fontSize:12, color:t.textMuted, fontFamily:PROTO_MONO}}>GH/s</div>
          <div style={{fontSize:11, color:t.success, fontFamily:PROTO_MONO, marginLeft:'auto'}}>▲ 2.1%</div>
        </div>
        <div style={{marginTop:8, background:t.surface, border:`1px solid ${t.border}`, borderRadius:10, padding:10}}>
          <MiniChart t={t} data={PROTO.hr24h} color={t.accent} h={60}/>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6, marginBottom:14}}>
        {[
          [`${S.devicesOnline}/${S.devicesTotal}`, 'Online', t.success],
          [`${S.maxTemp}°`, 'Max temp', t.warning],
          [`${S.openAlerts}`, 'Alerts', t.danger],
        ].map(([v, l, c]) => (
          <div key={l} style={{background:t.surface, border:`1px solid ${t.border}`, borderRadius:10, padding:'10px 12px'}}>
            <div style={{fontSize:18, fontWeight:700, color:c, fontFamily:PROTO_MONO}}>{v}</div>
            <div style={{fontSize:10, color:t.textMuted, marginTop:2}}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO, textTransform:'uppercase', letterSpacing:'0.08em', margin:'6px 2px 8px'}}>Devices</div>
      {S.axeos.slice(0,5).map((r, i) => (
        <div key={r.ip} onClick={() => onDevice(r)} style={{padding:'12px 14px', background:t.surface, border:`1px solid ${t.border}`, borderRadius:10, marginBottom:6, display:'flex', alignItems:'center', gap:10}}>
          <div style={{width:30, height:30, borderRadius:8, background: r.status==='online' ? t.accent + '22' : t.border, display:'flex', alignItems:'center', justifyContent:'center'}}>
            {Icons.cpu({size:15, color: r.status==='online' ? t.accent : t.textMuted})}
          </div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.name}</div>
            <div style={{fontSize:10, fontFamily:PROTO_MONO, color:t.textMuted}}>{r.hr.toFixed(1)} GH/s · {r.temp}°</div>
          </div>
          <StatusPill t={t} status={r.status}/>
        </div>
      ))}
    </div>
  );
}

function MobileDevices({ t, onDevice }) {
  return (
    <div>
      <Segmented t={t} value="all" onChange={()=>{}} options={['All','NMMiner','BitAxe']} style={{marginBottom:10}}/>
      {SAMPLE.axeos.concat(SAMPLE.nmminer).map(r => (
        <div key={r.ip} onClick={() => onDevice(r)} style={{padding:'12px 14px', background:t.surface, border:`1px solid ${t.border}`, borderRadius:10, marginBottom:6, display:'flex', alignItems:'center', gap:10}}>
          <div style={{width:30, height:30, borderRadius:8, background: r.status==='online' ? t.accent + '22' : t.border, display:'flex', alignItems:'center', justifyContent:'center'}}>
            {Icons.cpu({size:15, color: r.status==='online' ? t.accent : t.textMuted})}
          </div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.name}</div>
            <div style={{fontSize:10, fontFamily:PROTO_MONO, color:t.textMuted}}>{r.hr > 0 ? r.hr.toFixed(1) + ' GH/s' : '—'} · {r.temp != null ? r.temp + '°' : '—'}</div>
          </div>
          <StatusPill t={t} status={r.status}/>
        </div>
      ))}
    </div>
  );
}

function MobileAlerts({ t }) {
  return (
    <div>
      <Segmented t={t} value="all" onChange={()=>{}} options={['All','Open','Resolved']} style={{marginBottom:10}}/>
      {SAMPLE.alerts.map(a => {
        const c = a.severity === 'critical' ? t.danger : a.severity === 'warning' ? t.warning : t.info;
        return (
          <div key={a.id} style={{padding:'12px 14px', background:t.surface, border:`1px solid ${t.border}`, borderLeft:`3px solid ${c}`, borderRadius:10, marginBottom:6}}>
            <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:4}}>
              <Pill t={t} sev={a.severity === 'critical' ? 'danger' : a.severity}>{a.severity}</Pill>
              <span style={{fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO}}>{a.time}</span>
              {a.resolved && <Pill t={t} sev="success">✓</Pill>}
            </div>
            <div style={{fontSize:13, fontWeight:600}}>{a.title}</div>
            <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO, marginTop:2}}>{a.device}</div>
            <div style={{fontSize:12, color:t.textMuted, marginTop:4, lineHeight:1.45}}>{a.detail}</div>
          </div>
        );
      })}
    </div>
  );
}

function MobileMore({ t }) {
  const items = [
    ['Pool configuration', 'globe'],
    ['Alert rules', 'bell'],
    ['Settings', 'settings'],
    ['Documentation', 'help'],
    ['Sign out', 'power'],
  ];
  return (
    <div>
      <div style={{display:'flex', alignItems:'center', gap:12, padding:'16px 14px', background:t.surface, border:`1px solid ${t.border}`, borderRadius:12, marginBottom:14}}>
        <HiveMark size={36} primary={t.accent} secondary={t.honey}/>
        <div>
          <div style={{fontSize:15, fontWeight:700}}>Rig A · Home</div>
          <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO, marginTop:2}}>HashHive v1.4.2 · 16 devices</div>
        </div>
      </div>
      {items.map(([l, icon], i) => (
        <div key={l} style={{padding:'13px 14px', background:t.surface, border:`1px solid ${t.border}`, borderRadius:10, marginBottom:6, display:'flex', alignItems:'center', gap:12}}>
          <div style={{color:t.textMuted}}>{Icons[icon]({size:17})}</div>
          <div style={{flex:1, fontSize:14, fontWeight:500}}>{l}</div>
          <Icons.chevron size={14} color={t.textMuted}/>
        </div>
      ))}
    </div>
  );
}

window.MobileShell = MobileShell;
