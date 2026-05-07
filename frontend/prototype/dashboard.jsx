// Dashboard — two variants.
// V1 (A): KPI grid + big chart + dual device lists + live log (sharpened refresh of current UI)
// V2 (B): Analytics-focused — hero chart with brush, health radial, heatmap, pool latency, dual earnings chart

function Dashboard({ t, variant, onDevice, onNav }) {
  return variant === 'v1' ? <DashA t={t} onDevice={onDevice} onNav={onNav}/> : <DashB t={t} onDevice={onDevice} onNav={onNav}/>;
}

// ─────── VARIANT A ───────
function DashA({ t, onDevice, onNav }) {
  const S = SAMPLE;
  const P = PROTO;
  const [range, setRange] = React.useState('24h');
  const [brushed, setBrushed] = React.useState(null);

  const chartData = range === '7d' ? P.hr7d : P.hr24h;

  return (
    <div>
      {/* KPI strip */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:12, marginBottom:16}}>
        <KpiCard t={t} label="Total Hashrate" value={S.totalHashrate.toLocaleString()} unit={S.totalHashrateUnit} accent={t.accent} trend={{pos:true, label:'+2.1% · 1h'}} spark={P.hr1h(1, 30, S.totalHashrate)}/>
        <KpiCard t={t} label="Devices Online" value={`${S.devicesOnline}/${S.devicesTotal}`} accent={t.success} trend={{pos:true, label:'87.5% uptime'}}/>
        <KpiCard t={t} label="Max Temp" value={S.maxTemp} unit="°C" accent={t.warning} trend={{pos:false, label:'Axe-04 hot'}}/>
        <KpiCard t={t} label="Total Power" value={S.totalPower} unit="W" accent={t.honey} spark={P.hr1h(4, 8, S.totalPower)}/>
        <KpiCard t={t} label="Open Alerts" value={S.openAlerts} unit="unread" accent={t.danger} onClick={() => onNav('notifications')}/>
      </div>

      {/* Hero chart with zoom */}
      <Card t={t} style={{marginBottom:16}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14}}>
          <div>
            <Label t={t}>Hashrate · {range}</Label>
            <div style={{fontSize:18, fontWeight:600, letterSpacing:'-0.01em', marginTop:4}}>
              {chartData.reduce((a,b)=>a+b,0) / chartData.length | 0} <span style={{color:t.textMuted, fontSize:13, fontWeight:400}}>GH/s avg</span>
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

      {/* Two device groups */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16}}>
        <DeviceMini t={t} title="NMMiner Swarm" accent={t.accent} rows={S.nmminer} onDevice={onDevice} onViewAll={() => onNav('nmminer')}/>
        <DeviceMini t={t} title="BitAxe / NerdAxe Fleet" accent={t.info} rows={S.axeos.slice(0, 5)} onDevice={onDevice} onViewAll={() => onNav('axeos')}/>
      </div>

      {/* Live log */}
      <Card t={t}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
          <Label t={t}>Live Log</Label>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <div style={{display:'flex', alignItems:'center', gap:6, fontSize:11, color:t.success, fontFamily:PROTO_MONO}}>
              <span style={{width:6, height:6, borderRadius:'50%', background:t.success, boxShadow:`0 0 6px ${t.success}`}}/> live
            </div>
            <Segmented t={t} options={['All','NMMiner','BitAxe','System']} value="All" onChange={() => {}}/>
          </div>
        </div>
        <div style={{background:t.bg, border:`1px solid ${t.border}`, borderRadius:8, padding:'8px 12px', fontFamily:PROTO_MONO, fontSize:12, maxHeight:220, overflow:'auto'}}>
          {S.logLines.map((l,i) => (
            <div key={i} style={{display:'flex', gap:10, padding:'4px 0', lineHeight:1.6, alignItems:'center'}}>
              <span style={{color:t.textDim, fontSize:11}}>{l.ts}</span>
              <span style={{fontSize:10, padding:'0 6px', borderRadius:3, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em',
                background: l.src==='nmminer'?t.accentGlow:l.src==='axeos'?t.info + '22':t.success + '22',
                color: l.src==='nmminer'?t.accent:l.src==='axeos'?t.info:t.success,
              }}>{l.src}</span>
              <span style={{color: l.level==='critical'?t.danger : l.level==='warning'?t.warning : l.level==='ok'?t.success : t.text, flex:1}}>{l.msg}</span>
            </div>
          ))}
        </div>
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

function DeviceMini({ t, title, accent, rows, onDevice, onViewAll }) {
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
      <div>
        <div style={{display:'grid', gridTemplateColumns:'1.5fr 1fr 70px 90px', gap:8, padding:'6px 18px', borderBottom:`1px solid ${t.border}`, borderTop:`1px solid ${t.border}`, background:t.surface2}}>
          <Label t={t}>Name</Label><Label t={t}>Hashrate</Label><Label t={t}>Temp</Label><Label t={t}>Status</Label>
        </div>
        {rows.map((r, i) => (
          <div key={i} onClick={() => onDevice && onDevice(r)}
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
            <div style={{fontFamily:PROTO_MONO, color: r.temp==null ? t.textMuted : r.temp > 70 ? t.danger : r.temp > 65 ? t.warning : t.success}}>
              {r.temp != null ? `${r.temp}°` : '—'}
            </div>
            <StatusPill t={t} status={r.status}/>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─────── VARIANT B — analytics heavy ───────
function DashB({ t, onDevice, onNav }) {
  const S = SAMPLE;
  const P = PROTO;
  const [range, setRange] = React.useState('7d');
  const [brushed, setBrushed] = React.useState(null);

  const chartData = range === '24h' ? P.hr24h : P.hr7d;

  // Health radial: 14 of 16 online = 87.5%
  const healthPct = Math.round((S.devicesOnline / S.devicesTotal) * 100);

  return (
    <div>
      {/* Hero row: big hashrate + health radial + top stats */}
      <div style={{display:'grid', gridTemplateColumns:'2.2fr 1fr', gap:16, marginBottom:16}}>
        <Card t={t}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16}}>
            <div>
              <Label t={t}>Hashrate · {range} · drag to zoom</Label>
              <div style={{display:'flex', alignItems:'baseline', gap:10, marginTop:6}}>
                <div style={{fontSize:32, fontWeight:700, color:t.accent, fontFamily:PROTO_MONO, letterSpacing:'-0.02em'}}>
                  {S.totalHashrate.toLocaleString()}
                </div>
                <div style={{fontSize:14, color:t.textMuted, fontFamily:PROTO_MONO}}>GH/s now</div>
                <div style={{fontSize:12, color:t.success, fontFamily:PROTO_MONO}}>▲ 2.1% vs 1h</div>
              </div>
            </div>
            <Segmented t={t} options={['24h','7d','30d']} value={range} onChange={setRange}/>
          </div>
          <AreaChart t={t} data={chartData} accent={t.accent} h={180} brushed={brushed} onBrush={setBrushed}/>
        </Card>

        <Card t={t}>
          <Label t={t}>Fleet Health</Label>
          <div style={{display:'flex', alignItems:'center', gap:18, marginTop:12}}>
            <Donut t={t} size={120} thickness={14}
              label={`${healthPct}%`} sublabel="online"
              segments={[
                {value: S.devicesOnline, color: t.success},
                {value: S.devicesTotal - S.devicesOnline, color: t.danger + '44'},
              ]}/>
            <div style={{flex:1, display:'flex', flexDirection:'column', gap:8}}>
              {[
                ['Online', S.devicesOnline, t.success],
                ['Warning', SAMPLE.axeos.concat(SAMPLE.nmminer).filter(r => r.status==='warning').length, t.warning],
                ['Offline', SAMPLE.axeos.concat(SAMPLE.nmminer).filter(r => r.status==='offline').length, t.danger],
                ['Paused', SAMPLE.axeos.concat(SAMPLE.nmminer).filter(r => r.status==='paused').length, t.textMuted],
              ].map(([l,v,c]) => (
                <div key={l} style={{display:'flex', alignItems:'center', gap:8}}>
                  <span style={{width:8, height:8, borderRadius:2, background:c}}/>
                  <span style={{fontSize:12, flex:1}}>{l}</span>
                  <span style={{fontFamily:PROTO_MONO, fontSize:14, fontWeight:600, color:c}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Row 2: Earnings | Pool Latency | Lucky */}
      <div style={{display:'grid', gridTemplateColumns:'1.6fr 1fr 1fr', gap:16, marginBottom:16}}>
        <Card t={t}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
            <div>
              <Label t={t}>Earnings vs Cost · 30d</Label>
              <div style={{display:'flex', gap:14, marginTop:6, fontFamily:PROTO_MONO}}>
                <div>
                  <span style={{fontSize:10, color:t.textMuted}}>Reward 30d</span>
                  <div style={{fontSize:18, fontWeight:600, color:t.success}}>€{P.earnings30d.reduce((a,d)=>a+d.reward,0).toFixed(2)}</div>
                </div>
                <div>
                  <span style={{fontSize:10, color:t.textMuted}}>Power 30d</span>
                  <div style={{fontSize:18, fontWeight:600, color:t.warning}}>€{P.earnings30d.reduce((a,d)=>a+d.cost,0).toFixed(2)}</div>
                </div>
                <div>
                  <span style={{fontSize:10, color:t.textMuted}}>Net</span>
                  <div style={{fontSize:18, fontWeight:600, color: P.earnings30d.reduce((a,d)=>a+d.reward-d.cost,0) >= 0 ? t.success : t.danger}}>
                    €{P.earnings30d.reduce((a,d)=>a+d.reward-d.cost,0).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div style={{marginTop:10}}>
            <DualLineChart t={t}
              series={[P.earnings30d.map(d => d.reward), P.earnings30d.map(d => d.cost)]}
              colors={[t.success, t.warning]}
              labels={['Reward €', 'Power €']}
              h={160}/>
          </div>
        </Card>

        <Card t={t}>
          <Label t={t}>Pool Health</Label>
          <div style={{marginTop:10, display:'flex', flexDirection:'column', gap:12}}>
            {[['primary', P.poolLatency.primary, t.accent], ['fallback', P.poolLatency.fallback, t.info]].map(([id, p, c]) => (
              <div key={id}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <div style={{display:'flex', alignItems:'center', gap:6}}>
                    <span style={{width:6, height:6, borderRadius:'50%', background:c}}/>
                    <span style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO, textTransform:'uppercase'}}>{id}</span>
                  </div>
                  <span style={{fontSize:10, color:t.success, fontFamily:PROTO_MONO}}>● stratum up</span>
                </div>
                <div style={{fontSize:12, fontFamily:PROTO_MONO, marginTop:3, color:t.text}}>{p.name}</div>
                <div style={{display:'flex', alignItems:'baseline', gap:10, marginTop:4}}>
                  <div style={{fontSize:22, fontWeight:700, color:c, fontFamily:PROTO_MONO}}>{p.current}</div>
                  <div style={{fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO}}>ms · p50 {p.p50} · p95 {p.p95}</div>
                </div>
                <div style={{marginTop:4}}>
                  <MiniChart t={t} data={p.series} color={c} h={28}/>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card t={t}>
          <Label t={t}>Lucky Factor · 30d</Label>
          <div style={{display:'flex', alignItems:'baseline', gap:8, marginTop:6}}>
            <div style={{fontSize:28, fontWeight:700, color:t.honey, fontFamily:PROTO_MONO, letterSpacing:'-0.02em'}}>{S.luckyFactor}%</div>
            <div style={{fontSize:11, color:t.success, fontFamily:PROTO_MONO}}>▲ running above expected</div>
          </div>
          <div style={{marginTop:14}}>
            <BarChart t={t} bars={P.luckyBuckets} accent={t.honey} h={90} highlight={5}/>
          </div>
        </Card>
      </div>

      {/* Row 3: Temp heatmap full-width */}
      <Card t={t} style={{marginBottom:16}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:12}}>
          <div>
            <Label t={t}>Temperature Heatmap · 24h</Label>
            <div style={{fontSize:13, color:t.textMuted, marginTop:4, fontFamily:PROTO_MONO}}>
              chip temperature per device, 30-minute buckets
            </div>
          </div>
          <div style={{display:'flex', gap:10, alignItems:'center', fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO}}>
            <span>cool</span>
            <div style={{display:'flex', gap:1}}>
              {[50, 58, 65, 70, 75, 80].map(v => (
                <div key={v} style={{width:16, height:10, background: heatColor(v, t)}}/>
              ))}
            </div>
            <span>hot</span>
          </div>
        </div>
        <Heatmap t={t}
          rows={PROTO.tempHeatmap}
          getColor={v => heatColor(v, t)}
          cellSize={14} gap={2}
          labels={['-24h','','','','-18h','','','','-12h','','','','-6h','','','','now'].filter((_,i) => i % 3 === 0)}/>
      </Card>
    </div>
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
