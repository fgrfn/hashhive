// Dashboard — production version using real device data from HiveContext.

function Dashboard({ t, onDevice, onNav }) {
  return <DashA t={t} onDevice={onDevice} onNav={onNav}/>;
}

// ─────── VARIANT A (only variant kept) ───────
function DashA({ t, onDevice, onNav }) {
  const { nmminer, axeos, openAlerts } = useHive();
  const P = PROTO;
  const [range, setRange] = React.useState('24h');
  const [brushed, setBrushed] = React.useState(null);

  const chartData = range === '7d' ? P.hr7d : P.hr24h;

  // Build normalized device list from real data
  const allDevices = React.useMemo(() => [
    ...(nmminer.devices || []).map(normalizeNM),
    ...(axeos.devices || []).map(normalizeAxe),
  ], [nmminer, axeos]);

  const nmDevices = (nmminer.devices || []).map(normalizeNM);
  const axDevices = (axeos.devices || []).map(normalizeAxe);

  const devicesOnline = allDevices.filter(d => d.status === 'online').length;
  const devicesTotal  = allDevices.length;
  const totalHashrate = allDevices.reduce((a, d) => a + (d.hr || 0), 0);
  const maxTemp       = allDevices.reduce((a, d) => Math.max(a, d.temp || 0), 0);
  const totalPower    = allDevices.reduce((a, d) => a + (d.power || 0), 0);

  const hotDevice = allDevices.reduce((best, d) => (d.temp || 0) > (best?.temp || 0) ? d : best, null);

  return (
    <div>
      {/* KPI strip */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:12, marginBottom:16}}>
        <KpiCard t={t} label="Total Hashrate"
          value={totalHashrate > 0 ? totalHashrate.toFixed(1) : '—'}
          unit="GH/s" accent={t.accent}
          trend={totalHashrate > 0 ? {pos:true, label:'live'} : null}
          spark={P.hr1h(1, 30, totalHashrate || 2800)}/>
        <KpiCard t={t} label="Devices Online"
          value={devicesTotal > 0 ? `${devicesOnline}/${devicesTotal}` : '—'}
          accent={t.success}
          trend={devicesTotal > 0 ? {pos: devicesOnline === devicesTotal, label: devicesOnline === devicesTotal ? 'all online' : `${devicesTotal - devicesOnline} offline`} : null}/>
        <KpiCard t={t} label="Max Temp"
          value={maxTemp > 0 ? maxTemp : '—'}
          unit={maxTemp > 0 ? '°C' : ''}
          accent={maxTemp > 75 ? t.danger : maxTemp > 65 ? t.warning : t.success}
          trend={hotDevice && maxTemp > 65 ? {pos: false, label: hotDevice.name + ' hot'} : null}/>
        <KpiCard t={t} label="Total Power"
          value={totalPower > 0 ? totalPower.toFixed(0) : '—'}
          unit={totalPower > 0 ? 'W' : ''}
          accent={t.honey}
          spark={totalPower > 0 ? P.hr1h(4, 8, totalPower) : null}/>
        <KpiCard t={t} label="Open Alerts"
          value={openAlerts != null ? openAlerts : '—'}
          unit={openAlerts > 0 ? 'unread' : ''}
          accent={t.danger}
          onClick={() => onNav('notifications')}/>
      </div>

      {/* Hero chart */}
      <Card t={t} style={{marginBottom:16}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14}}>
          <div>
            <Label t={t}>Hashrate · {range}</Label>
            <div style={{fontSize:18, fontWeight:600, letterSpacing:'-0.01em', marginTop:4}}>
              {chartData.reduce((a,b)=>a+b,0) / chartData.length | 0} <span style={{color:t.textMuted, fontSize:13, fontWeight:400}}>GH/s avg (historical)</span>
              {brushed && brushed.from !== brushed.to && (
                <span style={{marginLeft:12, fontSize:12, color:t.accent, fontFamily:PROTO_MONO}}>
                  · selection: {chartData.slice(brushed.from, brushed.to+1).reduce((a,b)=>a+b,0) / (brushed.to - brushed.from + 1) | 0} avg
                </span>
              )}
            </div>
          </div>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            {brushed && brushed.from !== brushed.to && (
              <button onClick={() => setBrushed(null)} style={{...protoBtn(t), padding:'4px 10px', fontSize:11}}>
                <Icons.x size={11}/> Clear
              </button>
            )}
            <Segmented t={t} options={['24h','7d','30d']} value={range} onChange={setRange}/>
          </div>
        </div>
        <AreaChart t={t} data={chartData} accent={t.accent} h={200} brushed={brushed} onBrush={setBrushed}/>
        <div style={{fontSize:10, color:t.textDim, marginTop:6, fontFamily:PROTO_MONO, textAlign:'right'}}>
          drag to select range · hover for exact value
        </div>
      </Card>

      {/* Offline / Warning devices warning strip */}
      {allDevices.filter(d => d.status !== 'online').length > 0 && (
        <div style={{
          padding:'10px 16px', background: t.danger + '18', border:`1px solid ${t.danger}44`,
          borderRadius:10, marginBottom:16, display:'flex', alignItems:'center', gap:10, fontSize:13,
        }}>
          <Icons.alert size={16} color={t.danger}/>
          <span style={{color:t.danger, fontWeight:600}}>
            {allDevices.filter(d => d.status !== 'online').length} device(s) offline or in warning state:
          </span>
          <span style={{color:t.textMuted, fontFamily:PROTO_MONO, fontSize:12}}>
            {allDevices.filter(d => d.status !== 'online').map(d => d.name).join(', ')}
          </span>
        </div>
      )}

      {/* Two device groups */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16}}>
        <DeviceMini t={t} title="NMMiner Swarm" accent={t.accent}
          rows={nmDevices} onDevice={onDevice} onViewAll={() => onNav('nmminer')}
          emptyMsg="No NMMiner devices configured yet"/>
        <DeviceMini t={t} title="BitAxe / NerdAxe Fleet" accent={t.info}
          rows={axDevices.slice(0, 5)} onDevice={onDevice} onViewAll={() => onNav('axeos')}
          emptyMsg="No BitAxe devices configured yet"/>
      </div>

      {/* Live log */}
      <Card t={t}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
          <Label t={t}>Activity</Label>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <div style={{display:'flex', alignItems:'center', gap:6, fontSize:11, color:t.success, fontFamily:PROTO_MONO}}>
              <span style={{width:6, height:6, borderRadius:'50%', background:t.success, boxShadow:`0 0 6px ${t.success}`}}/> live
            </div>
          </div>
        </div>
        {allDevices.length === 0 ? (
          <div style={{padding:'32px 0', textAlign:'center', color:t.textMuted, fontSize:13}}>
            <div style={{fontSize:24, marginBottom:8}}>⛏</div>
            No devices configured yet. <button onClick={() => onNav('settings')} style={{...protoBtn(t, 'primary'), marginLeft:8}}>Get started</button>
          </div>
        ) : (
          <div style={{background:t.bg, border:`1px solid ${t.border}`, borderRadius:8, padding:'8px 12px', fontFamily:PROTO_MONO, fontSize:12, maxHeight:220, overflow:'auto'}}>
            {allDevices.map((d, i) => (
              <div key={i} style={{display:'flex', gap:10, padding:'5px 0', lineHeight:1.6, alignItems:'center', borderBottom: i < allDevices.length-1 ? `1px solid ${t.border}22` : 'none'}}>
                <span style={{fontSize:10, padding:'0 6px', borderRadius:3, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em',
                  background: d._type==='nmminer' ? t.accentGlow : t.info + '22',
                  color: d._type==='nmminer' ? t.accent : t.info,
                }}>{d._type}</span>
                <span style={{fontWeight:600, color:t.text, minWidth:100}}>{d.name}</span>
                <span style={{color:t.textMuted, fontSize:11}}>{d.ip}</span>
                <span style={{marginLeft:'auto', color: d.status==='online' ? t.success : t.danger, fontWeight:600}}>{d.status}</span>
                {d.hr > 0 && <span style={{color:t.accent, fontFamily:PROTO_MONO}}>{d.hr.toFixed(1)} GH/s</span>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function KpiCard({ t, label, value, unit, accent, trend, spark, onClick }) {
  return (
    <div onClick={onClick} style={{background:t.surface, border:`1px solid ${t.border}`, borderRadius:12, padding:'14px 16px', position:'relative', overflow:'hidden', cursor: onClick ? 'pointer':'default', transition:'border-color .15s'}}
      onMouseEnter={e => onClick && (e.currentTarget.style.borderColor = accent)}
      onMouseLeave={e => onClick && (e.currentTarget.style.borderColor = t.border)}>
      <Label t={t}>{label}</Label>
      <div style={{display:'flex', alignItems:'baseline', gap:6, marginTop:8}}>
        <div style={{fontSize:26, fontWeight:700, color:accent, letterSpacing:'-0.02em', fontFamily:PROTO_MONO}}>{value}</div>
        {unit && <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO}}>{unit}</div>}
      </div>
      {trend && <div style={{fontSize:11, color:trend.pos ? t.success : t.danger, marginTop:4, fontFamily:PROTO_MONO}}>{trend.pos ? '▲' : '▼'} {trend.label}</div>}
      {spark && <div style={{position:'absolute', right:10, bottom:8, width:80, opacity:0.85}}><MiniChart t={t} data={spark} color={accent} h={30}/></div>}
    </div>
  );
}

function DeviceMini({ t, title, accent, rows, onDevice, onViewAll, emptyMsg }) {
  return (
    <Card t={t} noPad style={{position:'relative', overflow:'hidden'}}>
      <div style={{position:'absolute', top:0, left:0, right:0, height:2, background:accent}}/>
      <div style={{padding:'14px 18px 10px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{fontSize:14, fontWeight:600}}>{title}</div>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO}}>{rows.filter(r => r.status==='online').length}/{rows.length} online</div>
          <button onClick={onViewAll} style={{...protoBtn(t), padding:'3px 8px', fontSize:11}}>View all <Icons.arrowRight size={11}/></button>
        </div>
      </div>
      {rows.length === 0 ? (
        <div style={{padding:'24px 18px', textAlign:'center', color:t.textMuted, fontSize:12}}>
          {emptyMsg || 'No devices yet'}
        </div>
      ) : (
        <div>
          <div style={{display:'grid', gridTemplateColumns:'1.5fr 1fr 70px 90px', gap:8, padding:'6px 18px', borderBottom:`1px solid ${t.border}`, borderTop:`1px solid ${t.border}`, background:t.surface2}}>
            <Label t={t}>Name</Label><Label t={t}>Hashrate</Label><Label t={t}>Temp</Label><Label t={t}>Status</Label>
          </div>
          {rows.map((r, i) => (
            <div key={r.ip || i} onClick={() => onDevice && onDevice(r)}
              style={{display:'grid', gridTemplateColumns:'1.5fr 1fr 70px 90px', gap:8, padding:'10px 18px', borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${t.border}`, alignItems:'center', fontSize:13, cursor:'pointer', transition:'background .1s'}}
              onMouseEnter={e => e.currentTarget.style.background = t.surface2}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div>
                <div style={{fontWeight:500}}>{r.name}</div>
                <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO}}>{r.ip}</div>
              </div>
              <div style={{fontFamily:PROTO_MONO, fontWeight:600}}>
                {r.hr > 0 ? <><span>{r.hr.toFixed(1)}</span> <span style={{color:t.textMuted, fontWeight:400, fontSize:11}}>GH/s</span></> : <span style={{color:t.textMuted}}>—</span>}
              </div>
              <div style={{fontFamily:PROTO_MONO, color: r.temp==null||r.temp===0 ? t.textMuted : r.temp > 70 ? t.danger : r.temp > 65 ? t.warning : t.success}}>
                {r.temp > 0 ? `${r.temp}°` : '—'}
              </div>
              <StatusPill t={t} status={r.status}/>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function heatColor(v, t) {
  if (v < 55)  return 'oklch(62% 0.08 230)';
  if (v < 60)  return 'oklch(68% 0.10 200)';
  if (v < 64)  return 'oklch(72% 0.12 160)';
  if (v < 68)  return 'oklch(78% 0.14 110)';
  if (v < 72)  return 'oklch(75% 0.15 70)';
  if (v < 76)  return 'oklch(68% 0.17 40)';
  return 'oklch(60% 0.20 20)';
}

window.Dashboard = Dashboard;
