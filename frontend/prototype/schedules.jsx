// Schedules page — production version using real API data.

function SchedulesPage({ t }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const load = () => {
    setLoading(true);
    apiFetch('/api/schedules')
      .then(data => {
        setItems(Array.isArray(data) ? data : (data.schedules || []));
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  };

  React.useEffect(() => { load(); }, []);

  const toggle = (id) => {
    const item = items.find(s => s.id === id);
    if (!item) return;
    const updated = {...item, enabled: !item.enabled};
    apiFetch(`/api/schedules/${id}`, { method: 'PUT', body: JSON.stringify(updated) })
      .then(() => setItems(items.map(s => s.id === id ? updated : s)))
      .catch(() => {});
  };

  const deleteSchedule = (id) => {
    apiFetch(`/api/schedules/${id}`, { method: 'DELETE' })
      .then(() => setItems(items.filter(s => s.id !== id)))
      .catch(() => {});
  };

  const enabledCount = items.filter(s => s.enabled).length;
  const nextRun = items.filter(s => s.enabled && s.nextRun && s.nextRun !== 'paused').map(s => s.nextRun)[0] || '—';

  if (loading) return (
    <div style={{padding:60, textAlign:'center', color:t.textMuted}}>
      <Spinner t={t} size={20}/><div style={{marginTop:12}}>Loading schedules…</div>
    </div>
  );

  if (error) return (
    <div style={{padding:40, textAlign:'center', color:t.danger, fontSize:13}}>
      Failed to load schedules: {error}
      <div style={{marginTop:12}}><button onClick={load} style={{...protoBtn(t)}}>Retry</button></div>
    </div>
  );

  return (
    <div>
      <div style={{display:'flex', gap:12, marginBottom:14, flexWrap:'wrap', alignItems:'center'}}>
        <KpiSm t={t} label="Schedules" value={items.length} color={t.accent}/>
        <KpiSm t={t} label="Active" value={enabledCount} color={t.success}/>
        {nextRun !== '—' && <KpiSm t={t} label="Next run" value={nextRun} color={t.honey}/>}
        <div style={{flex:1}}/>
        <button style={{...protoBtn(t, 'primary'), padding:'8px 12px'}}><Icons.plus size={13}/> New schedule</button>
      </div>

      {/* Timeline preview (only for enabled items with time windows) */}
      {items.filter(s => s.enabled).length > 0 && (
        <Card t={t} style={{marginBottom:14}}>
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:12}}>
            <Label t={t}>24h timeline preview</Label>
            <span style={{fontSize:11, fontFamily:PROTO_MONO, color:t.textMuted}}>local time · today</span>
          </div>
          <Timeline t={t} items={items.filter(s => s.enabled)}/>
        </Card>
      )}

      {items.length === 0 ? (
        <Card t={t}>
          <div style={{padding:48, textAlign:'center', color:t.textMuted}}>
            <div style={{fontSize:28, marginBottom:12}}>📅</div>
            <div style={{fontWeight:600, marginBottom:6}}>No schedules yet</div>
            <div style={{fontSize:12, color:t.textDim, marginBottom:16}}>
              Schedules let you automatically pause, resume, or change pool settings at specific times.
            </div>
            <button style={{...protoBtn(t, 'primary')}}><Icons.plus size={13}/> Create first schedule</button>
          </div>
        </Card>
      ) : (
        <Card t={t} noPad>
          <div style={{display:'grid', gridTemplateColumns:'40px 1.4fr 1.2fr 1fr 1fr 0.9fr 80px', gap:12, padding:'12px 18px', background:t.surface2, borderBottom:`1px solid ${t.border}`, fontSize:10, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:PROTO_MONO, fontWeight:600}}>
            <span>On</span><span>Name</span><span>Target</span><span>Window</span><span>Action</span><span>Next run</span><span/>
          </div>
          {items.map((s, i) => (
            <div key={s.id} style={{display:'grid', gridTemplateColumns:'40px 1.4fr 1.2fr 1fr 1fr 0.9fr 80px', gap:12, padding:'14px 18px', borderBottom: i === items.length-1 ? 'none' : `1px solid ${t.border}`, alignItems:'center', fontSize:13, opacity: s.enabled ? 1 : 0.55}}>
              <Toggle t={t} on={s.enabled} onChange={() => toggle(s.id)} size="sm"/>
              <div>
                <div style={{fontWeight:600}}>{s.name}</div>
                {s.desc && <div style={{fontSize:11, color:t.textMuted, marginTop:2, lineHeight:1.4}}>{s.desc}</div>}
              </div>
              <div style={{fontSize:12, fontFamily:PROTO_MONO}}>{s.target || '—'}</div>
              <div style={{fontSize:11, fontFamily:PROTO_MONO, color:t.honey}}>{s.window || '—'}</div>
              <div style={{fontSize:11, fontFamily:PROTO_MONO, color:t.textMuted}}>{s.action || '—'}</div>
              <div style={{fontSize:11, fontFamily:PROTO_MONO, color: s.nextRun==='paused' ? t.textDim : s.nextRun==='monitoring' ? t.info : t.success}}>{s.nextRun || '—'}</div>
              <div style={{display:'flex', gap:4}}>
                <button onClick={() => { if (confirm(`Delete "${s.name}"?`)) deleteSchedule(s.id); }}
                  style={{...protoBtn(t, 'danger'), padding:'3px 7px', fontSize:11}}><Icons.trash size={11}/></button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function Timeline({ t, items }) {
  const parse = (w) => {
    if (!w) return null;
    const m = w.match(/(\d{2}):(\d{2})\s*[→\-to]+\s*(\d{2}):(\d{2})/i);
    if (!m) return null;
    return { from: +m[1] + +m[2]/60, to: +m[3] + +m[4]/60 };
  };
  const colors = [t.accent, t.honey, t.info, t.success, t.danger];
  return (
    <div>
      <div style={{display:'grid', gridTemplateColumns:'120px 1fr', gap:10}}>
        <div/>
        <div style={{position:'relative', height:14, fontFamily:PROTO_MONO, fontSize:9, color:t.textDim}}>
          {[0,3,6,9,12,15,18,21,24].map(h => (
            <span key={h} style={{position:'absolute', left:`${h/24*100}%`, transform:'translateX(-50%)'}}>{h.toString().padStart(2,'0')}</span>
          ))}
        </div>
        {items.map((s, i) => {
          const c = colors[i % colors.length];
          const p = parse(s.window);
          return (
            <React.Fragment key={s.id}>
              <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO, padding:'5px 0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{s.name}</div>
              <div style={{position:'relative', height:22, background:t.surface2, borderRadius:5, border:`1px solid ${t.border}`}}>
                {p ? (
                  p.from < p.to ? (
                    <div style={{position:'absolute', left:`${p.from/24*100}%`, width:`${(p.to-p.from)/24*100}%`, top:0, bottom:0, background:`${c}33`, borderLeft:`2px solid ${c}`, borderRight:`2px solid ${c}`, borderRadius:4, display:'flex', alignItems:'center', paddingLeft:6, fontSize:9, fontFamily:PROTO_MONO, color:c, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', overflow:'hidden'}}>{(s.action||'').split('·')[0]}</div>
                  ) : (
                    <>
                      <div style={{position:'absolute', left:`${p.from/24*100}%`, right:0, top:0, bottom:0, background:`${c}33`, borderLeft:`2px solid ${c}`, borderRadius:4}}/>
                      <div style={{position:'absolute', left:0, width:`${p.to/24*100}%`, top:0, bottom:0, background:`${c}33`, borderRight:`2px solid ${c}`, borderRadius:4, display:'flex', alignItems:'center', paddingLeft:6, fontSize:9, fontFamily:PROTO_MONO, color:c, fontWeight:600, textTransform:'uppercase'}}>{(s.action||'').split('·')[0]}</div>
                    </>
                  )
                ) : (
                  <div style={{position:'absolute', inset:'2px 4px', background:`${c}22`, border:`1px dashed ${c}88`, borderRadius:4, display:'flex', alignItems:'center', paddingLeft:6, fontSize:9, fontFamily:PROTO_MONO, color:c}}>continuous · {s.window || 'always'}</div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

window.SchedulesPage = SchedulesPage;
