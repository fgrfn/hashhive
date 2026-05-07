// Full-page Device Detail — bigger sibling of the drawer.

function DeviceDetailPage({ t, device, onBack }) {
  const [tab, setTab] = React.useState('overview');
  const P = PROTO;
  const seed = device.name.charCodeAt(device.name.length - 1);
  const hrMean = device.hr > 0 ? device.hr : 400;
  const hr1h = P.hr1h(seed, hrMean * 0.03, hrMean);
  const hr24h = P.hr24h.map(v => v * (hrMean / 2800));
  const tempData = P.hr1h(seed + 1, 3, device.temp || 60);
  const isAx = !!device.asic;

  return (
    <div>
      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:14}}>
        <button onClick={onBack} style={{...protoBtn(t), padding:7}}><Icons.arrowLeft size={14}/></button>
        <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO}}>
          {isAx ? 'BitAxe / NerdAxe' : 'NMMiner'} / {device.name}
        </div>
      </div>

      {/* Hero header */}
      <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:18}}>
        <div style={{width:54, height:54, borderRadius:12, background:t.surface, border:`1px solid ${t.border}`, display:'flex', alignItems:'center', justifyContent:'center'}}>
          {isAx ? <Icons.zap size={24} color={t.info}/> : <Icons.cpu size={24} color={t.accent}/>}
        </div>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:26, fontWeight:700, letterSpacing:'-0.02em'}}>{device.name}</div>
          <div style={{fontSize:12, color:t.textMuted, fontFamily:PROTO_MONO, marginTop:2}}>
            {device.ip} · {device.asic || device.version || '—'}{device.type ? ' · ' + device.type : ''}
          </div>
          <div style={{marginTop:8, display:'flex', gap:6}}>
            <StatusPill t={t} status={device.status}/>
            {device.rssi != null && <Pill t={t} sev="muted"><Icons.wifi size={10}/> {device.rssi} dBm</Pill>}
            <Pill t={t} sev="accent">uptime {device.uptime}</Pill>
          </div>
        </div>
        <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
          <button style={{...protoBtn(t), fontFamily:PROTO_MONO}}><Icons.pause size={13}/> Pause</button>
          <button style={{...protoBtn(t), fontFamily:PROTO_MONO}}><Icons.restart size={13}/> Restart</button>
          <button style={{...protoBtn(t), fontFamily:PROTO_MONO}}><Icons.eye size={13}/> Identify</button>
          <button style={{...protoBtn(t, 'primary'), fontFamily:PROTO_MONO}}><Icons.link size={13}/> Open {isAx ? 'AxeOS' : 'Web UI'}</button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:10, marginBottom:14}}>
        {[
          ['Hashrate', device.hr > 0 ? device.hr.toFixed(1) : '—', 'GH/s', t.accent],
          ['Temp',     device.temp != null ? device.temp : '—', '°C', device.temp > 70 ? t.danger : t.success],
          ['Power',    device.power != null ? device.power.toFixed(1) : '—', 'W', t.honey],
          ['Best Diff',device.bestDiff || '—', '', t.honey],
          ['Acc',      device.acc != null ? device.acc : '—', '%', t.success],
        ].map(([l, v, u, c]) => (
          <Card key={l} t={t} style={{padding:'12px 14px'}}>
            <Label t={t}>{l}</Label>
            <div style={{fontSize:22, fontWeight:700, color:c, fontFamily:PROTO_MONO, marginTop:4}}>
              {v} {u && <span style={{fontSize:11, color:t.textMuted, fontWeight:400}}>{u}</span>}
            </div>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div style={{display:'flex', borderBottom:`1px solid ${t.border}`, gap:2, marginBottom:14}}>
        {[['overview','Overview'],['charts','Charts'],['logs','Logs'],['console','Console'],['power','Power Curve'],['config','Config']].map(([id, l]) => (
          <div key={id} onClick={() => setTab(id)} style={{
            padding:'10px 14px', fontSize:12, fontWeight:500, cursor:'pointer',
            color: tab === id ? t.accent : t.textMuted,
            borderBottom: tab === id ? `2px solid ${t.accent}` : '2px solid transparent',
            marginBottom:-1,
          }}>{l}</div>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:14}}>
          <Card t={t}>
            <Label t={t} style={{marginBottom:8}}>Hashrate · 24h</Label>
            <AreaChart t={t} data={hr24h} accent={t.accent} h={180}/>
          </Card>
          <Card t={t}>
            <Label t={t} style={{marginBottom:10}}>Recent activity</Label>
            <div style={{display:'flex', flexDirection:'column', gap:4}}>
              {SAMPLE.logLines.slice(0,6).map((l, i) => (
                <div key={i} style={{display:'flex', gap:10, fontSize:11, fontFamily:PROTO_MONO, padding:'4px 0', borderBottom: i===5 ? 'none' : `1px solid ${t.border}`}}>
                  <span style={{color:t.textDim, flexShrink:0}}>{l.ts}</span>
                  <span style={{color: l.level==='critical'?t.danger : l.level==='warning'?t.warning : l.level==='ok'?t.success : t.text, flex:1, lineHeight:1.4}}>{l.msg}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card t={t} style={{gridColumn:'1 / -1'}}>
            <Label t={t} style={{marginBottom:8}}>Temperature · 1h</Label>
            <AreaChart t={t} data={tempData} accent={t.warning} h={120} unit="°C"/>
          </Card>
        </div>
      )}

      {tab === 'charts' && (
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
          <Card t={t}><Label t={t} style={{marginBottom:8}}>Hashrate · 1h</Label><AreaChart t={t} data={hr1h} accent={t.accent} h={170}/></Card>
          <Card t={t}><Label t={t} style={{marginBottom:8}}>Hashrate · 24h</Label><AreaChart t={t} data={hr24h} accent={t.accent} h={170}/></Card>
          <Card t={t}><Label t={t} style={{marginBottom:8}}>Temperature · 1h</Label><AreaChart t={t} data={tempData} accent={t.warning} h={170} unit="°C"/></Card>
          <Card t={t}>
            <Label t={t} style={{marginBottom:8}}>Shares · 24h</Label>
            <div style={{display:'flex', gap:18, alignItems:'baseline', marginTop:14}}>
              <div><div style={{fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO}}>ACCEPTED</div><div style={{fontSize:24, fontWeight:700, color:t.success, fontFamily:PROTO_MONO}}>1284</div></div>
              <div><div style={{fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO}}>REJECTED</div><div style={{fontSize:24, fontWeight:700, color:t.danger, fontFamily:PROTO_MONO}}>3</div></div>
              <div><div style={{fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO}}>STALE</div><div style={{fontSize:24, fontWeight:700, color:t.warning, fontFamily:PROTO_MONO}}>1</div></div>
              <div style={{flex:1}}/>
              <div><div style={{fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO}}>ACC%</div><div style={{fontSize:24, fontWeight:700, color:t.success, fontFamily:PROTO_MONO}}>99.7</div></div>
            </div>
          </Card>
        </div>
      )}

      {tab === 'logs' && (
        <Card t={t} noPad>
          <div style={{padding:'10px 14px', borderBottom:`1px solid ${t.border}`, display:'flex', alignItems:'center', gap:10}}>
            <Segmented t={t} value="all" onChange={()=>{}} options={[{value:'all',label:'All'},{value:'info',label:'Info'},{value:'warn',label:'Warn'},{value:'err',label:'Errors'}]}/>
            <div style={{flex:1}}/>
            <button style={{...protoBtn(t), fontSize:11}}><Icons.download size={11}/> Export</button>
            <button style={{...protoBtn(t), fontSize:11}}><Icons.copy size={11}/> Copy</button>
          </div>
          <div style={{padding:'10px 14px', fontFamily:PROTO_MONO, fontSize:11, maxHeight:520, overflow:'auto'}}>
            {SAMPLE.logLines.concat(SAMPLE.logLines).concat(SAMPLE.logLines).concat(SAMPLE.logLines).map((l, i) => (
              <div key={i} style={{display:'flex', gap:12, padding:'3px 0', lineHeight:1.7}}>
                <span style={{color:t.textDim, flexShrink:0, width:60}}>{l.ts}</span>
                <span style={{color:t.textMuted, flexShrink:0, width:54, textTransform:'uppercase', fontSize:10}}>{l.src}</span>
                <span style={{color: l.level==='critical'?t.danger : l.level==='warning'?t.warning : l.level==='ok'?t.success : t.text, flex:1}}>{l.msg}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === 'console' && (
        <Card t={t}>
          <Label t={t} style={{marginBottom:8}}>SSH / Stratum console</Label>
          <div style={{background:'#000', borderRadius:8, padding:'14px 16px', fontFamily:PROTO_MONO, fontSize:12, color:'#5dffa6', minHeight:340, lineHeight:1.7}}>
            <div style={{color:'#888'}}># connecting to {device.ip} via stratum-tap …</div>
            <div>[ok] handshake complete · diff 1024 · extra-nonce 0x3a91</div>
            <div>[work] new template @ height 836,419 (12.3 MvB) </div>
            <div>[share] submit accepted · ack 11ms · diff 1024</div>
            <div>[share] submit accepted · ack 9ms · diff 1024</div>
            <div style={{color:'#fbbf24'}}>[stat ] vr=58°C  chip=64°C  hr=412 GH/s  fan=58%</div>
            <div>[share] submit accepted · ack 14ms · diff 1024</div>
            <div style={{color:'#888', marginTop:10}}>$ <span style={{color:t.text, animation:'proto-blink 1s step-end infinite'}}>▮</span></div>
          </div>
          <div style={{display:'flex', gap:6, marginTop:10}}>
            <input placeholder="Send command…" style={{flex:1, padding:'8px 12px', background:t.surface2, border:`1px solid ${t.border}`, borderRadius:8, color:t.text, fontFamily:PROTO_MONO, fontSize:12, outline:'none'}}/>
            <button style={{...protoBtn(t, 'primary')}}>Send</button>
          </div>
        </Card>
      )}

      {tab === 'power' && (
        <Card t={t}>
          <Label t={t} style={{marginBottom:10}}>Power curve · clock vs voltage</Label>
          <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:18}}>
            <div>
              <AreaChart t={t} data={Array.from({length:40},(_,i)=> 380 + i*6 - Math.max(0,(i-30)*8))} accent={t.honey} h={200}/>
              <div style={{display:'flex', justifyContent:'space-between', fontSize:10, fontFamily:PROTO_MONO, color:t.textMuted, marginTop:6}}>
                <span>440 MHz · 1.05 V</span><span>490 MHz · 1.15 V</span><span>525 MHz · 1.20 V</span>
              </div>
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:14}}>
              <Slider t={t} label="Frequency" v={490} unit="MHz" min={400} max={550}/>
              <Slider t={t} label="Core voltage" v={1.15} unit="V" min={1.05} max={1.25} step={0.01}/>
              <Slider t={t} label="Fan speed" v={62} unit="%" min={20} max={100}/>
              <button style={{...protoBtn(t, 'primary'), fontFamily:PROTO_MONO}}>Apply curve</button>
              <button style={{...protoBtn(t), fontFamily:PROTO_MONO}}>Auto-tune (15 min)</button>
            </div>
          </div>
        </Card>
      )}

      {tab === 'config' && (
        <Card t={t}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
            <FormField t={t} label="Display name" value={device.name} onChange={()=>{}}/>
            <FormField t={t} label="Static IP" value={device.ip} onChange={()=>{}} mono/>
            <FormField t={t} label="Group" value="BitAxe Fleet" onChange={()=>{}}/>
            <FormField t={t} label="Pool" value={SAMPLE.pools[0].name} onChange={()=>{}}/>
            <FormField t={t} label="Worker" value={`bc1q...vj.${device.name.toLowerCase()}`} onChange={()=>{}} mono/>
            <FormField t={t} label="Firmware channel" value="stable" onChange={()=>{}}/>
          </div>
          <div style={{marginTop:18, display:'flex', flexDirection:'column', gap:12}}>
            {[['Auto-restart on hang', true],['Send alerts', true],['Include in summary', true],['Exclude from bulk ops', false]].map(([l, on]) => (
              <div key={l} style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <span style={{fontSize:13}}>{l}</span><Toggle t={t} on={on} onChange={()=>{}}/>
              </div>
            ))}
          </div>
          <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:14, paddingTop:14, borderTop:`1px solid ${t.border}`}}>
            <button style={{...protoBtn(t, 'danger')}}><Icons.trash size={13}/> Remove device</button>
            <div style={{flex:1}}/>
            <button style={{...protoBtn(t)}}>Cancel</button>
            <button style={{...protoBtn(t, 'primary')}}><Icons.check size={13}/> Save changes</button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Slider({ t, label, v, unit, min, max, step = 1 }) {
  const [val, setVal] = React.useState(v);
  const pct = ((val - min) / (max - min)) * 100;
  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', marginBottom:6}}>
        <Label t={t}>{label}</Label>
        <span style={{fontFamily:PROTO_MONO, fontSize:12, fontWeight:600, color:t.honey}}>{val}{unit}</span>
      </div>
      <div style={{height:6, background:t.surface2, borderRadius:3, position:'relative'}}>
        <div style={{position:'absolute', top:0, left:0, height:'100%', width:`${pct}%`, background:t.honey, borderRadius:3}}/>
        <div style={{position:'absolute', top:-4, left:`calc(${pct}% - 7px)`, width:14, height:14, borderRadius:'50%', background:t.honey, boxShadow:'0 1px 4px rgba(0,0,0,0.3)'}}/>
      </div>
      <input type="range" min={min} max={max} step={step} value={val} onChange={e => setVal(Number(e.target.value))}
        style={{position:'relative', marginTop:-14, width:'100%', opacity:0, cursor:'pointer', height:14}}/>
    </div>
  );
}

window.DeviceDetailPage = DeviceDetailPage;
