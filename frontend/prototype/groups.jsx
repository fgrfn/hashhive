// Groups page + Group Detail page — production version using real API data.

function GroupsPage({ t, onOpenGroup }) {
  const { allDevices } = useHive();
  const [groups, setGroups] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [showNew, setShowNew] = React.useState(false);
  const [newName, setNewName] = React.useState('');

  const load = () => {
    setLoading(true);
    apiFetch('/api/groups')
      .then(data => {
        setGroups(Array.isArray(data) ? data : (data.groups || []));
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  };

  React.useEffect(() => { load(); }, []);

  const createGroup = () => {
    if (!newName.trim()) return;
    apiFetch('/api/groups', { method: 'POST', body: JSON.stringify({ name: newName.trim(), devices: [] }) })
      .then(() => { setNewName(''); setShowNew(false); load(); })
      .catch(() => {});
  };

  const deleteGroup = (id) => {
    apiFetch(`/api/groups/${id}`, { method: 'DELETE' })
      .then(() => load())
      .catch(() => {});
  };

  const totalHr      = groups.reduce((a, g) => a + (g.hr || 0), 0);
  const totalDevices = groups.reduce((a, g) => a + (g.total || g.device_count || 0), 0);
  const totalOnline  = groups.reduce((a, g) => a + (g.online || 0), 0);

  const COLORS = ['#a855f7','#38bdf8','#fbbf24','#34d399','#f87171','#fb923c'];

  if (loading) return (
    <div style={{padding:60, textAlign:'center', color:t.textMuted}}>
      <Spinner t={t} size={20}/><div style={{marginTop:12}}>Loading groups…</div>
    </div>
  );

  if (error) return (
    <div style={{padding:40, textAlign:'center', color:t.danger, fontSize:13}}>
      Failed to load groups: {error}
      <div style={{marginTop:12}}><button onClick={load} style={{...protoBtn(t)}}>Retry</button></div>
    </div>
  );

  return (
    <div>
      <div style={{display:'flex', gap:12, marginBottom:14, flexWrap:'wrap'}}>
        <KpiSm t={t} label="Groups" value={groups.length} color={t.accent}/>
        <KpiSm t={t} label="Devices" value={totalDevices > 0 ? `${totalOnline}/${totalDevices}` : allDevices.length} color={t.success}/>
        <KpiSm t={t} label="Total Hashrate" value={totalHr.toFixed(0)} unit="GH/s" color={t.honey}/>
        <div style={{flex:1}}/>
        <button onClick={() => setShowNew(v => !v)} style={{...protoBtn(t, 'primary'), padding:'8px 12px'}}>
          <Icons.plus size={13}/> New group
        </button>
      </div>

      {showNew && (
        <Card t={t} style={{marginBottom:14}}>
          <Label t={t} style={{marginBottom:8}}>New group</Label>
          <div style={{display:'flex', gap:8}}>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Group name…"
              style={{flex:1, background:t.surface2, border:`1px solid ${t.border}`, borderRadius:8, padding:'8px 12px', color:t.text, fontSize:13, outline:'none', fontFamily:PROTO_FONT}}/>
            <button onClick={createGroup} style={{...protoBtn(t, 'primary')}}><Icons.check size={13}/> Create</button>
            <button onClick={() => setShowNew(false)} style={{...protoBtn(t)}}><Icons.x size={13}/></button>
          </div>
        </Card>
      )}

      {groups.length === 0 ? (
        <Card t={t}>
          <div style={{padding:48, textAlign:'center', color:t.textMuted}}>
            <div style={{fontSize:28, marginBottom:12}}>📦</div>
            <div style={{fontWeight:600, marginBottom:6}}>No groups yet</div>
            <div style={{fontSize:12, color:t.textDim, marginBottom:16}}>
              Groups let you organize devices by location, type, or any other criteria.
            </div>
            <button onClick={() => setShowNew(true)} style={{...protoBtn(t, 'primary')}}>
              <Icons.plus size={13}/> Create first group
            </button>
          </div>
        </Card>
      ) : (
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(380px, 1fr))', gap:12}}>
          {groups.map((g, gi) => {
            const col = g.color || COLORS[gi % COLORS.length];
            const total = g.total || g.device_count || 0;
            const online = g.online || 0;
            const onlinePct = total ? (online / total) * 100 : 0;
            const devices = g.devices || [];
            return (
              <Card key={g.id} t={t} style={{cursor:'pointer', transition:'border-color .15s'}}
                onMouseEnter={e => e.currentTarget.style.borderColor = col}
                onMouseLeave={e => e.currentTarget.style.borderColor = t.border}>
                <div onClick={() => onOpenGroup(g.id)} style={{cursor:'pointer'}}>
                  <div style={{display:'flex', alignItems:'flex-start', gap:12, marginBottom:14}}>
                    <div style={{width:38, height:38, borderRadius:8, background:`${col}22`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, border:`1px solid ${col}55`}}>
                      <span style={{width:12, height:12, borderRadius:3, background:col}}/>
                    </div>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontWeight:700, fontSize:16, letterSpacing:'-0.01em'}}>{g.name}</div>
                      {g.desc && <div style={{fontSize:11, color:t.textMuted, marginTop:2, lineHeight:1.4}}>{g.desc}</div>}
                    </div>
                    {g.alerts > 0 && <Pill t={t} sev="warning">{g.alerts} alert{g.alerts>1?'s':''}</Pill>}
                  </div>

                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12}}>
                    <Stat t={t} label="Hashrate" value={(g.hr || 0).toFixed(0)} unit="GH/s" color={col}/>
                    <Stat t={t} label="Online" value={total > 0 ? `${online}/${total}` : '—'} color={onlinePct === 100 ? t.success : onlinePct > 50 ? t.warning : t.danger}/>
                    <Stat t={t} label="Power" value={(g.power || 0).toFixed(0)} unit="W" color={t.text}/>
                  </div>

                  {total > 0 && (
                    <div style={{height:4, background:t.surface2, borderRadius:2, overflow:'hidden', marginBottom:10}}>
                      <div style={{width:`${onlinePct}%`, height:'100%', background:col}}/>
                    </div>
                  )}

                  {devices.length > 0 && (
                    <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                      {devices.slice(0,4).map((d, di) => (
                        <span key={di} style={{padding:'3px 8px', background:t.surface2, border:`1px solid ${t.border}`, borderRadius:6, fontSize:10, fontFamily:PROTO_MONO, color:t.textMuted}}>
                          {typeof d === 'string' ? d : (d.name || d.ip)}
                        </span>
                      ))}
                      {devices.length > 4 && <span style={{padding:'3px 8px', fontSize:10, fontFamily:PROTO_MONO, color:t.textDim}}>+{devices.length - 4}</span>}
                    </div>
                  )}
                </div>

                <div style={{marginTop:12, paddingTop:10, borderTop:`1px solid ${t.border}`, display:'flex', gap:6}}>
                  <button onClick={e => { e.stopPropagation(); onOpenGroup(g.id); }} style={{...protoBtn(t), fontSize:11}}><Icons.eye size={11}/> View</button>
                  <button onClick={e => { e.stopPropagation(); if (confirm(`Delete group "${g.name}"?`)) deleteGroup(g.id); }} style={{...protoBtn(t, 'danger'), fontSize:11, marginLeft:'auto'}}><Icons.trash size={11}/></button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
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
  const { allDevices } = useHive();
  const [group, setGroup] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!groupId) return;
    apiFetch(`/api/groups/${groupId}`)
      .then(data => { setGroup(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [groupId]);

  if (loading) return (
    <div style={{padding:60, textAlign:'center', color:t.textMuted}}>
      <Spinner t={t} size={20}/><div style={{marginTop:12}}>Loading group…</div>
    </div>
  );

  if (error || !group) return (
    <div style={{padding:40, textAlign:'center', color:t.danger, fontSize:13}}>
      {error || 'Group not found'}
      <div style={{marginTop:12}}><button onClick={onBack} style={{...protoBtn(t)}}><Icons.arrowLeft size={13}/> Back</button></div>
    </div>
  );

  const col = group.color || '#a855f7';
  const deviceIds = group.devices || [];
  const groupDevices = allDevices.filter(d => deviceIds.includes(d.ip) || deviceIds.includes(d.name));
  const onlineDevices = groupDevices.filter(d => d.status === 'online');
  const hrSeries = PROTO.hr24h.map(v => v * ((group.hr || 1000) / 2800));

  return (
    <div>
      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:14}}>
        <button onClick={onBack} style={{...protoBtn(t), padding:7}}><Icons.arrowLeft size={14}/></button>
        <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO}}>Groups / {group.name}</div>
      </div>

      <div style={{display:'flex', alignItems:'center', gap:14, marginBottom:18}}>
        <div style={{width:52, height:52, borderRadius:12, background:`${col}22`, border:`1px solid ${col}55`, display:'flex', alignItems:'center', justifyContent:'center'}}>
          <span style={{width:18, height:18, borderRadius:4, background:col}}/>
        </div>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:24, fontWeight:700, letterSpacing:'-0.02em'}}>{group.name}</div>
          {group.desc && <div style={{fontSize:12, color:t.textMuted}}>{group.desc}</div>}
        </div>
        <button style={{...protoBtn(t), fontFamily:PROTO_MONO}}><Icons.edit size={13}/> Rename</button>
        <button style={{...protoBtn(t, 'danger'), fontFamily:PROTO_MONO}}><Icons.trash size={13}/> Delete</button>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:14, marginBottom:14}}>
        <Card t={t}>
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:12}}>
            <Label t={t}>Group hashrate · 24h</Label>
            <span style={{fontFamily:PROTO_MONO, fontSize:18, fontWeight:700, color:col}}>
              {(group.hr || 0).toFixed(1)} <span style={{fontSize:10, color:t.textMuted, fontWeight:400}}>GH/s</span>
            </span>
          </div>
          <AreaChart t={t} data={hrSeries} accent={col} h={150}/>
        </Card>
        <Card t={t}>
          <Label t={t} style={{marginBottom:10}}>Group config</Label>
          <div style={{display:'flex', flexDirection:'column', gap:10, fontSize:12}}>
            <Row k="Wallet" v={group.wallet || '—'} t={t} mono/>
            <Row k="Pool" v={group.pool || '—'} t={t}/>
            <Row k="Devices" v={groupDevices.length > 0 ? `${onlineDevices.length} online · ${groupDevices.length} total` : `${deviceIds.length} configured`} t={t}/>
            <Row k="Power" v={group.power > 0 ? `${(group.power||0).toFixed(1)} W` : '—'} t={t} mono/>
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
        {groupDevices.length === 0 && (
          <div style={{padding:30, textAlign:'center', color:t.textMuted, fontSize:13}}>
            {deviceIds.length === 0 ? 'No devices in this group yet.' : 'Devices not currently connected.'}
          </div>
        )}
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
            <div style={{fontFamily:PROTO_MONO, fontSize:12, color: (d.temp||0) > 70 ? t.danger : (d.temp||0) > 65 ? t.warning : t.text}}>
              {d.temp > 0 ? `${d.temp}°C` : '—'}
            </div>
            <div style={{fontFamily:PROTO_MONO, fontSize:12, fontWeight:600}}>
              {d.hr > 0 ? `${d.hr.toFixed(1)} GH/s` : <span style={{color:t.textMuted}}>—</span>}
            </div>
            <div style={{fontFamily:PROTO_MONO, fontSize:11, color:t.textMuted, textAlign:'right'}}>{d.uptime || '—'}</div>
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
