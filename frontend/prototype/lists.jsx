// Device lists (NMMiner + AxeOS) — with sort, filter, bulk actions.

function DeviceListPage({ t, kind, onDevice }) {
  const isAx = kind === 'axeos';
  const rowsOrig = isAx ? SAMPLE.axeos : SAMPLE.nmminer;
  const accent = isAx ? t.info : t.accent;

  const [sortKey, setSortKey] = React.useState('name');
  const [sortDir, setSortDir] = React.useState('asc');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState(new Set());
  const [bulkOpen, setBulkOpen] = React.useState(false);

  const rows = React.useMemo(() => {
    let r = rowsOrig.filter(x => {
      if (statusFilter !== 'all' && x.status !== statusFilter) return false;
      if (query && !x.name.toLowerCase().includes(query.toLowerCase()) && !x.ip.includes(query)) return false;
      return true;
    });
    r = [...r].sort((a, b) => {
      const av = a[sortKey] ?? '', bv = b[sortKey] ?? '';
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return r;
  }, [rowsOrig, sortKey, sortDir, statusFilter, query]);

  const toggle = (ip) => {
    const s = new Set(selected);
    if (s.has(ip)) s.delete(ip); else s.add(ip);
    setSelected(s);
  };
  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.ip)));
  };

  const sortHead = (key, label) => (
    <div onClick={() => {
      if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
      else { setSortKey(key); setSortDir('desc'); }
    }} style={{cursor:'pointer', display:'flex', alignItems:'center', gap:4, userSelect:'none'}}>
      <span>{label}</span>
      {sortKey === key && (sortDir === 'asc' ? <Icons.chevronUp size={11}/> : <Icons.chevronDown size={11}/>)}
    </div>
  );

  const cols = isAx
    ? '28px 1.3fr 1fr 1fr 1.1fr 0.7fr 0.7fr 0.8fr 0.9fr 36px'
    : '28px 1.3fr 1fr 1fr 1.3fr 0.7fr 0.8fr 0.9fr 36px';

  const totalHr = rows.reduce((a, r) => a + r.hr, 0);

  return (
    <div>
      {/* Stats header */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, gap:16, flexWrap:'wrap'}}>
        <div style={{display:'flex', gap:12}}>
          <KpiSm t={t} label="Hashrate" value={totalHr.toFixed(1)} unit="GH/s" color={accent}/>
          <KpiSm t={t} label="Online" value={`${rows.filter(r => r.status === 'online').length}/${rows.length}`} color={t.success}/>
          {isAx && <KpiSm t={t} label="Efficiency" value="32.4" unit="J/TH" color={t.honey}/>}
          {isAx && <KpiSm t={t} label="Power" value={rowsOrig.reduce((a,r)=>a+(r.power||0),0).toFixed(1)} unit="W" color={t.text}/>}
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <div style={{display:'flex', alignItems:'center', gap:6, padding:'6px 10px', background:t.surface, border:`1px solid ${t.border}`, borderRadius:8, fontSize:12, fontFamily:PROTO_MONO, minWidth:180}}>
            <Icons.search size={13}/>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter name or IP…"
              style={{flex:1, background:'transparent', border:'none', outline:'none', color:t.text, fontSize:12, fontFamily:PROTO_MONO}}/>
          </div>
          <Segmented t={t} value={statusFilter} onChange={setStatusFilter}
            options={[{value:'all',label:'All'},{value:'online',label:'Online'},{value:'warning',label:'Warn'},{value:'offline',label:'Off'}]}/>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{background:t.accentGlow, border:`1px solid ${t.accent}`, borderRadius:10, padding:'10px 14px', marginBottom:10, display:'flex', alignItems:'center', gap:12}}>
          <div style={{fontSize:13, color:t.accent, fontWeight:600}}>
            {selected.size} selected
          </div>
          <div style={{flex:1}}/>
          <button style={{...protoBtn(t), fontFamily:PROTO_MONO, fontSize:12}}><Icons.pause size={13}/> Pause</button>
          <button style={{...protoBtn(t), fontFamily:PROTO_MONO, fontSize:12}}><Icons.play size={13}/> Resume</button>
          <button style={{...protoBtn(t), fontFamily:PROTO_MONO, fontSize:12}}><Icons.restart size={13}/> Restart</button>
          <button style={{...protoBtn(t), fontFamily:PROTO_MONO, fontSize:12}}><Icons.globe size={13}/> Push pool</button>
          <button style={{...protoBtn(t, 'danger'), fontFamily:PROTO_MONO, fontSize:12}}><Icons.trash size={13}/> Remove</button>
          <button onClick={() => setSelected(new Set())} style={{...protoBtn(t), padding:6}}><Icons.x size={12}/></button>
        </div>
      )}

      <Card t={t} noPad>
        <div style={{display:'grid', gridTemplateColumns: cols, gap:10, padding:'12px 18px', background:t.surface2, borderBottom:`1px solid ${t.border}`, fontSize:10, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:PROTO_MONO, fontWeight:600}}>
          <div><input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} style={{accentColor:accent}}/></div>
          {sortHead('name', 'Name / IP')}
          {isAx && sortHead('asic', 'ASIC')}
          <span>Status</span>
          {sortHead('hr', 'Hashrate')}
          {sortHead('temp', 'Temp')}
          {isAx && sortHead('power', 'Power')}
          {!isAx && <span>Shares</span>}
          {isAx && sortHead('eff', 'J/TH')}
          <span>Best / Uptime</span>
          <span></span>
        </div>
        {rows.length === 0 && (
          <div style={{padding:40, textAlign:'center', color:t.textMuted, fontSize:13}}>No devices match your filter.</div>
        )}
        {rows.map((r, i) => {
          const hrPct = r.hrExpected ? Math.min(120, (r.hr / r.hrExpected) * 100) : 0;
          return (
            <div key={r.ip} onClick={() => onDevice(r)}
              style={{display:'grid', gridTemplateColumns: cols, gap:10, padding:'12px 18px', borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${t.border}`, alignItems:'center', fontSize:13, cursor:'pointer', transition:'background .1s'}}
              onMouseEnter={e => e.currentTarget.style.background = t.surface2}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={selected.has(r.ip)} onChange={() => toggle(r.ip)} style={{accentColor:accent}}/>
              </div>
              <div>
                <div style={{fontWeight:600}}>{r.name}</div>
                <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO}}>{r.ip}</div>
              </div>
              {isAx && (
                <div>
                  <div style={{fontSize:12, fontFamily:PROTO_MONO}}>{r.asic}</div>
                  <div style={{fontSize:10, color:t.textMuted}}>{r.type}</div>
                </div>
              )}
              <StatusPill t={t} status={r.status}/>
              <div>
                <div style={{fontFamily:PROTO_MONO, fontWeight:600, fontSize:13}}>
                  {r.hr > 0 ? r.hr.toFixed(1) : <span style={{color:t.textMuted}}>—</span>}
                  {r.hr > 0 && <span style={{fontSize:10, color:t.textMuted, fontWeight:400, marginLeft:4}}>GH/s</span>}
                </div>
                {isAx && r.hr > 0 && (
                  <div style={{display:'flex', alignItems:'center', gap:4, marginTop:3}}>
                    <div style={{height:3, flex:1, background:t.border, borderRadius:2, overflow:'hidden'}}>
                      <div style={{height:'100%', width:`${Math.min(100,hrPct)}%`, background: hrPct>=95 ? t.success : hrPct>=85 ? t.warning : t.danger}}/>
                    </div>
                    <span style={{fontSize:9, color:t.textMuted, fontFamily:PROTO_MONO}}>{hrPct.toFixed(0)}%</span>
                  </div>
                )}
              </div>
              <div style={{fontFamily:PROTO_MONO, color: r.temp==null ? t.textMuted : r.temp > 70 ? t.danger : r.temp > 65 ? t.warning : t.success}}>
                {r.temp != null ? `${r.temp}°` : '—'}
              </div>
              {isAx && <div style={{fontFamily:PROTO_MONO, color:t.text}}>{r.power > 0 ? `${r.power.toFixed(1)}W` : <span style={{color:t.textMuted}}>—</span>}</div>}
              {!isAx && <div style={{fontFamily:PROTO_MONO, fontSize:12, color: r.acc==null ? t.textMuted : r.acc > 99 ? t.success : t.warning}}>{r.shares}{r.acc != null ? ` · ${r.acc}%` : ''}</div>}
              {isAx && <div style={{fontFamily:PROTO_MONO, color:t.text}}>{r.eff > 0 ? r.eff.toFixed(1) : <span style={{color:t.textMuted}}>—</span>}</div>}
              <div>
                <div style={{fontFamily:PROTO_MONO, color:t.honey, fontWeight:600, fontSize:12}}>{r.bestDiff}</div>
                <div style={{fontFamily:PROTO_MONO, color:t.textMuted, fontSize:10, marginTop:2}}>{r.uptime}</div>
              </div>
              <div style={{color:t.textMuted, display:'flex', justifyContent:'flex-end'}}><Icons.more size={16}/></div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function KpiSm({ t, label, value, unit, color }) {
  return (
    <div style={{background:t.surface, border:`1px solid ${t.border}`, borderRadius:10, padding:'10px 14px'}}>
      <Label t={t}>{label}</Label>
      <div style={{fontSize:20, fontWeight:700, color, fontFamily:PROTO_MONO, marginTop:4}}>
        {value} {unit && <span style={{fontSize:11, color:t.textMuted, fontWeight:400}}>{unit}</span>}
      </div>
    </div>
  );
}

window.DeviceListPage = DeviceListPage;
window.KpiSm = KpiSm;
