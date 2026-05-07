// Groups page + Group Detail page

function GroupsPage({ t, onOpenGroup, onNav }) {
  const groups = PROTO2.groups;
  const totalHr = groups.reduce((a,g) => a + g.hr, 0);
  const totalDevices = groups.reduce((a,g) => a + g.total, 0);
  const totalOnline = groups.reduce((a,g) => a + g.online, 0);

  return (
    <div>
      <div style={{display:'flex', gap:12, marginBottom:14, flexWrap:'wrap'}}>
        <KpiSm t={t} label="Groups" value={groups.length} color={t.accent}/>
        <KpiSm t={t} label="Devices" value={`${totalOnline}/${totalDevices}`} color={t.success}/>
        <KpiSm t={t} label="Total Hashrate" value={totalHr.toFixed(0)} unit="GH/s" color={t.honey}/>
        <div style={{flex:1}}/>
        <button style={{...protoBtn(t, 'primary'), padding:'8px 12px'}}>
          <Icons.plus size={13}/> New group
        </button>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(380px, 1fr))', gap:12}}>
        {groups.map(g => {
          const onlinePct = g.total ? (g.online / g.total) * 100 : 0;
          return (
            <Card key={g.id} t={t} style={{cursor:'pointer', transition:'border-color .15s'}}
              onMouseEnter={e => e.currentTarget.style.borderColor = g.color}
              onMouseLeave={e => e.currentTarget.style.borderColor = t.border}>
              <div onClick={() => onOpenGroup(g.id)} style={{cursor:'pointer'}}>
                <div style={{display:'flex', alignItems:'flex-start', gap:12, marginBottom:14}}>
                  <div style={{width:38, height:38, borderRadius:8, background:`${g.color}22`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, border:`1px solid ${g.color}55`}}>
                    <span style={{width:12, height:12, borderRadius:3, background:g.color}}/>
                  </div>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontWeight:700, fontSize:16, letterSpacing:'-0.01em'}}>{g.name}</div>
                    <div style={{fontSize:11, color:t.textMuted, marginTop:2, lineHeight:1.4}}>{g.desc}</div>
                  </div>
                  {g.alerts > 0 && <Pill t={t} sev="warning">{g.alerts} alert{g.alerts>1?'s':''}</Pill>}
                </div>

                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12}}>
                  <Stat t={t} label="Hashrate" value={g.hr.toFixed(0)} unit="GH/s" color={g.color}/>
                  <Stat t={t} label="Online" value={`${g.online}/${g.total}`} color={onlinePct === 100 ? t.success : onlinePct > 50 ? t.warning : t.danger}/>
                  <Stat t={t} label="Power" value={g.power.toFixed(1)} unit="W" color={t.text}/>
                </div>

                <div style={{height:4, background:t.surface2, borderRadius:2, overflow:'hidden', marginBottom:10}}>
                  <div style={{width:`${onlinePct}%`, height:'100%', background:g.color}}/>
                </div>

                <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                  {g.devices.slice(0,4).map(d => (
                    <span key={d} style={{padding:'3px 8px', background:t.surface2, border:`1px solid ${t.border}`, borderRadius:6, fontSize:10, fontFamily:PROTO_MONO, color:t.textMuted}}>{d}</span>
                  ))}
                  {g.devices.length > 4 && <span style={{padding:'3px 8px', fontSize:10, fontFamily:PROTO_MONO, color:t.textDim}}>+{g.devices.length - 4}</span>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ t, label, value, unit, color }) {
  return (
    <div style={{padding:'8px 10px', background:t.surface2, borderRadius:8}}>
      <div style={{fontSize:9, color:t.textMuted, fontFamily:PROTO_MONO, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600}}>{label}</div>
      <div style={{fontSize:15, fontWeight:700, color, fontFamily:PROTO_MONO, marginTop:2}}>
        {value} {unit && <span style={{fontSize:10, color:t.textMuted, fontWeight:400}}>{unit}</span>}
      </div>
    </div>
  );
}

function GroupDetailPage({ t, groupId, onBack, onDevice }) {
  const g = PROTO2.groups.find(x => x.id === groupId) || PROTO2.groups[0];
  const allDevices = [...SAMPLE.nmminer, ...SAMPLE.axeos];
  const groupDevices = allDevices.filter(d => g.devices.includes(d.name));
  const onlineDevices = groupDevices.filter(d => d.status === 'online');
  const hrSeries = PROTO.hr24h.map(v => v * (g.hr / 2800));

  return (
    <div>
      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:14}}>
        <button onClick={onBack} style={{...protoBtn(t), padding:7}}><Icons.arrowLeft size={14}/></button>
        <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO}}>Groups / {g.name}</div>
      </div>

      <div style={{display:'flex', alignItems:'center', gap:14, marginBottom:18}}>
        <div style={{width:52, height:52, borderRadius:12, background:`${g.color}22`, border:`1px solid ${g.color}55`, display:'flex', alignItems:'center', justifyContent:'center'}}>
          <span style={{width:18, height:18, borderRadius:4, background:g.color}}/>
        </div>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:24, fontWeight:700, letterSpacing:'-0.02em'}}>{g.name}</div>
          <div style={{fontSize:12, color:t.textMuted}}>{g.desc}</div>
        </div>
        <button style={{...protoBtn(t), fontFamily:PROTO_MONO}}><Icons.edit size={13}/> Rename</button>
        <button style={{...protoBtn(t), fontFamily:PROTO_MONO}}><Icons.copy size={13}/> Duplicate</button>
        <button style={{...protoBtn(t, 'danger'), fontFamily:PROTO_MONO}}><Icons.trash size={13}/> Delete</button>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:14, marginBottom:14}}>
        <Card t={t}>
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:12}}>
            <Label t={t}>Group hashrate · 24h</Label>
            <span style={{fontFamily:PROTO_MONO, fontSize:18, fontWeight:700, color:g.color}}>
              {g.hr.toFixed(1)} <span style={{fontSize:10, color:t.textMuted, fontWeight:400}}>GH/s</span>
            </span>
          </div>
          <AreaChart t={t} data={hrSeries} accent={g.color} h={150}/>
        </Card>
        <Card t={t}>
          <Label t={t} style={{marginBottom:10}}>Group config</Label>
          <div style={{display:'flex', flexDirection:'column', gap:10, fontSize:12}}>
            <Row k="Pool" v={SAMPLE.pools.find(p => p.id === g.poolId)?.name || '—'} t={t}/>
            <Row k="Wallet" v={g.wallet} t={t} mono/>
            <Row k="Devices" v={`${g.online} online · ${g.total} total`} t={t}/>
            <Row k="Combined power" v={`${g.power.toFixed(1)} W`} t={t} mono/>
            <Row k="Efficiency" v={g.eff > 0 ? `${g.eff.toFixed(1)} J/TH` : '—'} t={t} mono/>
          </div>
          <div style={{display:'flex', gap:6, marginTop:12, flexWrap:'wrap'}}>
            <button style={{...protoBtn(t), fontFamily:PROTO_MONO, fontSize:11}}><Icons.pause size={11}/> Pause all</button>
            <button style={{...protoBtn(t), fontFamily:PROTO_MONO, fontSize:11}}><Icons.restart size={11}/> Restart all</button>
            <button style={{...protoBtn(t), fontFamily:PROTO_MONO, fontSize:11}}><Icons.globe size={11}/> Push pool</button>
          </div>
        </Card>
      </div>

      <Card t={t} noPad>
        <div style={{padding:'12px 18px', borderBottom:`1px solid ${t.border}`, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <Label t={t}>Devices in this group</Label>
          <button style={{...protoBtn(t), fontSize:11, padding:'5px 9px'}}><Icons.plus size={11}/> Add device</button>
        </div>
        {groupDevices.length === 0 && <div style={{padding:30, textAlign:'center', color:t.textMuted, fontSize:13}}>No devices yet.</div>}
        {groupDevices.map((d, i) => (
          <div key={d.ip} onClick={() => onDevice(d)}
            style={{display:'grid', gridTemplateColumns:'1.4fr 1fr 0.8fr 1fr 0.8fr', gap:12, padding:'12px 18px', borderBottom: i === groupDevices.length-1 ? 'none' : `1px solid ${t.border}`, alignItems:'center', cursor:'pointer', transition:'background .1s'}}
            onMouseEnter={e => e.currentTarget.style.background = t.surface2}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div>
              <div style={{fontWeight:600, fontSize:13}}>{d.name}</div>
              <div style={{fontSize:10, fontFamily:PROTO_MONO, color:t.textMuted}}>{d.ip}</div>
            </div>
            <StatusPill t={t} status={d.status}/>
            <div style={{fontFamily:PROTO_MONO, fontSize:12, color: d.temp > 70 ? t.danger : d.temp > 65 ? t.warning : t.text}}>
              {d.temp != null ? `${d.temp}°C` : '—'}
            </div>
            <div style={{fontFamily:PROTO_MONO, fontSize:12, fontWeight:600}}>
              {d.hr > 0 ? `${d.hr.toFixed(1)} GH/s` : <span style={{color:t.textMuted}}>—</span>}
            </div>
            <div style={{fontFamily:PROTO_MONO, fontSize:11, color:t.textMuted, textAlign:'right'}}>{d.uptime}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Row({ k, v, t, mono }) {
  return (
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:10}}>
      <span style={{color:t.textMuted, fontSize:11}}>{k}</span>
      <span style={{fontFamily: mono ? PROTO_MONO : 'inherit', fontSize:12, color:t.text, textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:220}}>{v}</span>
    </div>
  );
}

window.GroupsPage = GroupsPage;
window.GroupDetailPage = GroupDetailPage;
window.Stat = Stat;
window.Row = Row;
