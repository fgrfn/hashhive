// Device drawer — charts, logs, controls, per-device pool config.

function DeviceDrawerPro({ t, device, onClose }) {
  const [tab, setTab] = React.useState('overview');
  const P = PROTO;
  const hrSeed = device.name.charCodeAt(device.name.length - 1);
  const hrMean = device.hr > 0 ? device.hr : 400;
  const hrData = P.hr1h(hrSeed, hrMean * 0.03, hrMean);
  const tempSeed = hrSeed + 1;
  const tempData = P.hr1h(tempSeed, 3, device.temp || 60);

  return (
    <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:80, display:'flex', justifyContent:'flex-end'}} onClick={onClose}>
      <div style={{width:520, height:'100%', background:t.surface, borderLeft:`1px solid ${t.border}`, overflow:'auto', boxShadow:'-20px 0 60px rgba(0,0,0,0.3)'}} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{padding:'20px 24px 16px', borderBottom:`1px solid ${t.border}`}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12}}>
            <div>
              <Label t={t}>Device</Label>
              <div style={{fontSize:24, fontWeight:700, marginTop:4, letterSpacing:'-0.02em'}}>{device.name}</div>
              <div style={{fontSize:12, color:t.textMuted, fontFamily:PROTO_MONO, marginTop:2}}>{device.ip} · {device.asic || device.version || '—'} · {device.type || 'NMMiner'}</div>
              <div style={{marginTop:10, display:'flex', gap:6}}>
                <StatusPill t={t} status={device.status}/>
                {device.rssi != null && <Pill t={t} sev="muted"><Icons.wifi size={10}/> {device.rssi} dBm</Pill>}
              </div>
            </div>
            <button onClick={onClose} style={{...protoBtn(t), padding:7}}><Icons.x size={14}/></button>
          </div>

          {/* Actions */}
          <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
            <button style={{...protoBtn(t), fontFamily:PROTO_MONO}}><Icons.pause size={13}/> Pause</button>
            <button style={{...protoBtn(t), fontFamily:PROTO_MONO}}><Icons.restart size={13}/> Restart</button>
            <button style={{...protoBtn(t), fontFamily:PROTO_MONO}}><Icons.eye size={13}/> Identify</button>
            <button style={{...protoBtn(t), fontFamily:PROTO_MONO}}><Icons.edit size={13}/> Rename</button>
            <button style={{...protoBtn(t, 'primary'), fontFamily:PROTO_MONO, marginLeft:'auto'}}><Icons.link size={13}/> Open {device.asic ? 'AxeOS' : 'Web UI'}</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:'flex', borderBottom:`1px solid ${t.border}`, padding:'0 14px', gap:2, background:t.surface}}>
          {[['overview','Overview'],['metrics','Metrics'],['logs','Logs'],['pool','Pool'],['config','Config']].map(([id, l]) => (
            <div key={id} onClick={() => setTab(id)} style={{
              padding:'12px 14px', fontSize:12, fontWeight:500, cursor:'pointer',
              color: tab === id ? t.accent : t.textMuted,
              borderBottom: tab === id ? `2px solid ${t.accent}` : '2px solid transparent',
              marginBottom:-1,
            }}>{l}</div>
          ))}
        </div>

        <div style={{padding:'18px 24px'}}>
          {tab === 'overview' && (
            <>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14}}>
                {[
                  ['Hashrate', device.hr > 0 ? `${device.hr.toFixed(1)}` : '—', 'GH/s', t.accent],
                  ['Temp', device.temp != null ? `${device.temp}` : '—', '°C', device.temp > 70 ? t.danger : t.success],
                  ['Power', device.power != null ? `${device.power.toFixed(1)}` : '—', 'W', t.honey],
                  ['Best Diff', device.bestDiff || '—', '', t.honey],
                ].map(([l,v,u,c]) => (
                  <div key={l} style={{background:t.bg, border:`1px solid ${t.border}`, borderRadius:10, padding:'12px 14px'}}>
                    <Label t={t}>{l}</Label>
                    <div style={{fontSize:20, fontWeight:700, color:c, fontFamily:PROTO_MONO, marginTop:4}}>{v} {u && <span style={{fontSize:11, color:t.textMuted, fontWeight:400}}>{u}</span>}</div>
                  </div>
                ))}
              </div>

              <Label t={t} style={{marginBottom:8}}>Hashrate · 1h</Label>
              <div style={{background:t.bg, border:`1px solid ${t.border}`, borderRadius:10, padding:10, marginBottom:14}}>
                <AreaChart t={t} data={hrData} accent={t.accent} h={120}/>
              </div>

              <Label t={t} style={{marginBottom:8}}>Temperature · 1h</Label>
              <div style={{background:t.bg, border:`1px solid ${t.border}`, borderRadius:10, padding:10, marginBottom:14}}>
                <AreaChart t={t} data={tempData} accent={device.temp > 70 ? t.danger : t.warning} h={100} unit="°C"/>
              </div>

              <Label t={t} style={{marginBottom:8}}>Recent Events</Label>
              <div style={{display:'flex', flexDirection:'column', gap:4}}>
                {SAMPLE.logLines.slice(0,5).map((l,i) => (
                  <div key={i} style={{display:'flex', gap:10, fontSize:12, fontFamily:PROTO_MONO, padding:'5px 0', borderBottom: i===4 ? 'none' : `1px solid ${t.border}`}}>
                    <span style={{color:t.textDim, flexShrink:0}}>{l.ts}</span>
                    <span style={{color: l.level==='critical'?t.danger : l.level==='warning'?t.warning : l.level==='ok'?t.success : t.text, flex:1}}>{l.msg}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'metrics' && (
            <>
              <Label t={t} style={{marginBottom:8}}>Hashrate · 1h</Label>
              <div style={{background:t.bg, border:`1px solid ${t.border}`, borderRadius:10, padding:10, marginBottom:14}}>
                <AreaChart t={t} data={hrData} accent={t.accent} h={140}/>
              </div>
              <Label t={t} style={{marginBottom:8}}>Temperature · 1h</Label>
              <div style={{background:t.bg, border:`1px solid ${t.border}`, borderRadius:10, padding:10, marginBottom:14}}>
                <AreaChart t={t} data={tempData} accent={t.warning} h={120} unit="°C"/>
              </div>
              <Label t={t} style={{marginBottom:8}}>Shares · 24h</Label>
              <div style={{display:'flex', gap:18, padding:'12px 14px', background:t.bg, border:`1px solid ${t.border}`, borderRadius:10, marginBottom:8}}>
                <div><div style={{fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO}}>ACCEPTED</div><div style={{fontSize:18, fontWeight:700, color:t.success, fontFamily:PROTO_MONO}}>1284</div></div>
                <div><div style={{fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO}}>REJECTED</div><div style={{fontSize:18, fontWeight:700, color:t.danger, fontFamily:PROTO_MONO}}>3</div></div>
                <div><div style={{fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO}}>STALE</div><div style={{fontSize:18, fontWeight:700, color:t.warning, fontFamily:PROTO_MONO}}>1</div></div>
                <div style={{flex:1}}/>
                <div><div style={{fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO}}>ACC%</div><div style={{fontSize:18, fontWeight:700, color:t.success, fontFamily:PROTO_MONO}}>99.7%</div></div>
              </div>
            </>
          )}

          {tab === 'logs' && (
            <div style={{background:t.bg, border:`1px solid ${t.border}`, borderRadius:10, padding:'10px 12px', fontFamily:PROTO_MONO, fontSize:11, maxHeight:440, overflow:'auto'}}>
              {SAMPLE.logLines.concat(SAMPLE.logLines).concat(SAMPLE.logLines).map((l,i) => (
                <div key={i} style={{display:'flex', gap:10, padding:'3px 0', lineHeight:1.6}}>
                  <span style={{color:t.textDim, flexShrink:0}}>{l.ts}</span>
                  <span style={{color: l.level==='critical'?t.danger : l.level==='warning'?t.warning : l.level==='ok'?t.success : t.text}}>{l.msg}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'pool' && (
            <div>
              <Label t={t} style={{marginBottom:10}}>Current Pool</Label>
              <div style={{padding:'12px 14px', background:t.bg, border:`1px solid ${t.border}`, borderRadius:10, marginBottom:14}}>
                <div style={{fontFamily:PROTO_MONO, fontSize:13, color:t.accent, marginBottom:4}}>stratum+tcp://{device.pool || 'solo.ckpool.org'}:3333</div>
                <div style={{fontFamily:PROTO_MONO, fontSize:11, color:t.textMuted}}>worker: wallet.{device.name}</div>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                <div><Label t={t} style={{marginBottom:6}}>Pool URL</Label><Input t={t} value={`stratum+tcp://${device.pool || 'solo.ckpool.org'}:3333`} onChange={()=>{}}/></div>
                <div><Label t={t} style={{marginBottom:6}}>Worker</Label><Input t={t} value={`wallet.${device.name}`} onChange={()=>{}}/></div>
              </div>
              <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:14}}>
                <button style={{...protoBtn(t)}}>Cancel</button>
                <button style={{...protoBtn(t, 'primary')}}>Apply</button>
              </div>
            </div>
          )}

          {tab === 'config' && (
            <div style={{display:'flex', flexDirection:'column', gap:14}}>
              {[['Auto-restart on hang', true],['Send alerts', true],['Include in summary', true],['Exclude from bulk ops', false]].map(([l,on]) => (
                <div key={l} style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <span style={{fontSize:13}}>{l}</span>
                  <Toggle t={t} on={on} onChange={()=>{}}/>
                </div>
              ))}
              <div>
                <Label t={t} style={{marginBottom:6}}>Notes</Label>
                <textarea placeholder="Internal notes about this device…"
                  style={{width:'100%', minHeight:80, padding:'9px 12px', background:t.surface2, border:`1px solid ${t.border}`, borderRadius:8, color:t.text, fontSize:12, fontFamily:PROTO_MONO, outline:'none', resize:'vertical'}}/>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

window.DeviceDrawerPro = DeviceDrawerPro;
