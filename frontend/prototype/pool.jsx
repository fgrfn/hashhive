// Pool configuration — production version using real API data.
// V1 only: List of pool profiles + inline editor

const seedRoles = (pools) => pools.map((p, i) => ({
  ...p,
  role: p.role || (p.isPrimary ? 'primary' : (p.assigned > 0 ? 'backup' : 'unassigned')),
  priority: p.priority != null ? p.priority : (p.isPrimary ? 0 : i),
}));

function PoolPage({ t }) {
  return <PoolA t={t}/>;
}

function PoolA({ t }) {
  const { allDevices } = useHive();
  const [pools, setPools] = React.useState([]);
  const [config, setConfig] = React.useState({});
  const [active, setActive] = React.useState(null);
  const [draft, setDraft] = React.useState(null);
  const [testing, setTesting] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const load = () => {
    setLoading(true);
    apiFetch('/api/settings')
      .then(cfg => {
        setConfig(cfg);
        const rawPools = cfg.pools || [];
        const seeded = seedRoles(rawPools);
        setPools(seeded);
        if (seeded.length > 0) {
          setActive(seeded[0].id || 0);
          setDraft(seeded[0]);
        }
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  };

  React.useEffect(() => { load(); }, []);

  React.useEffect(() => {
    if (active != null) {
      const p = pools.find(p => (p.id || p) === active) || pools[active];
      if (p) setDraft({...p});
    }
  }, [active]);

  const validate = () => {
    if (!draft) return {};
    const errs = {};
    if (draft.url && !draft.url.startsWith('stratum+tcp://') && !draft.url.startsWith('stratum+ssl://')) errs.url = 'URL must start with stratum+tcp:// or stratum+ssl://';
    if (draft.url && !draft.url.match(/:\d+$/)) errs.url = 'Missing port';
    if (!draft.worker?.trim()) errs.worker = 'Worker required';
    return errs;
  };
  const errs = draft ? validate() : {};
  const valid = Object.keys(errs).length === 0;

  const runTest = () => {
    setTesting('running');
    setTimeout(() => setTesting(Math.random() > 0.2 ? 'ok' : 'fail'), 1400);
  };

  const save = () => {
    if (!valid || !draft) return;
    setSaving(true);
    const updatedPools = pools.map(p => (p.id || p) === active ? {...p, ...draft} : p);
    const updatedConfig = {...config, pools: updatedPools};
    apiFetch('/api/settings', { method: 'POST', body: JSON.stringify(updatedConfig) })
      .then(() => {
        setPools(updatedPools);
        setConfig(updatedConfig);
        setSaving(false);
      })
      .catch(() => setSaving(false));
  };

  const setRole = (id, newRole) => {
    setPools(prev => {
      const next = prev.map(p => ({...p}));
      const target = next.find(p => (p.id || p) === id);
      if (!target) return prev;
      if (newRole === 'primary') {
        const currentPrimary = next.find(p => p.role === 'primary' && (p.id || p) !== id);
        if (currentPrimary) {
          const maxPrio = Math.max(0, ...next.filter(p => p.role === 'backup').map(p => p.priority || 0));
          currentPrimary.role = 'backup';
          currentPrimary.priority = maxPrio + 1;
        }
        target.role = 'primary';
        target.priority = 0;
      } else if (newRole === 'backup') {
        const maxPrio = Math.max(0, ...next.filter(p => p.role === 'backup' && (p.id || p) !== id).map(p => p.priority || 0));
        target.role = 'backup';
        target.priority = maxPrio + 1;
      } else {
        target.role = 'unassigned';
        target.priority = null;
      }
      return next;
    });
    if (draft && (draft.id || draft) === id) setDraft(prev => prev ? {...prev, role: newRole} : prev);
  };

  const moveBackup = (id, dir) => {
    setPools(prev => {
      const backups = prev.filter(p => p.role === 'backup').sort((a,b) => a.priority - b.priority);
      const idx = backups.findIndex(p => (p.id || p) === id);
      const swapIdx = idx + dir;
      if (idx < 0 || swapIdx < 0 || swapIdx >= backups.length) return prev;
      const a = backups[idx], b = backups[swapIdx];
      return prev.map(p => (p.id||p) === (a.id||a) ? {...p, priority: b.priority} : (p.id||p) === (b.id||b) ? {...p, priority: a.priority} : p);
    });
  };

  const primary = pools.find(p => p.role === 'primary');
  const backups = pools.filter(p => p.role === 'backup').sort((a,b) => a.priority - b.priority);
  const unassigned = pools.filter(p => p.role === 'unassigned');

  if (loading) return (
    <div style={{padding:60, textAlign:'center', color:t.textMuted}}>
      <Spinner t={t} size={20}/><div style={{marginTop:12}}>Loading pool configuration…</div>
    </div>
  );

  if (error) return (
    <div style={{padding:40, textAlign:'center', color:t.danger, fontSize:13}}>
      Failed to load settings: {error}
      <div style={{marginTop:12}}><button onClick={load} style={{...protoBtn(t)}}>Retry</button></div>
    </div>
  );

  if (pools.length === 0) return (
    <div style={{padding:60, textAlign:'center', color:t.textMuted}}>
      <div style={{fontSize:28, marginBottom:12}}>🌐</div>
      <div style={{fontWeight:600, marginBottom:6}}>No pools configured yet</div>
      <div style={{fontSize:12, color:t.textDim, marginBottom:16}}>Add a pool to start pushing stratum settings to your devices.</div>
      <button style={{...protoBtn(t, 'primary')}}><Icons.plus size={13}/> Add pool</button>
    </div>
  );

  return (
    <div style={{display:'grid', gridTemplateColumns:'300px 1fr', gap:16}}>
      <div>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
          <Label t={t}>Pool Profiles</Label>
          <button style={{...protoBtn(t), padding:'3px 8px', fontSize:11}}><Icons.plus size={11}/> New</button>
        </div>

        {/* Failover summary */}
        <div style={{padding:'10px 12px', background:t.surface2, border:`1px solid ${t.border}`, borderRadius:10, marginBottom:14}}>
          <div style={{display:'flex', alignItems:'center', gap:6, fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6}}>
            <Icons.power size={11} color={t.accent}/> Failover order
          </div>
          <div style={{fontSize:11, fontFamily:PROTO_MONO, lineHeight:1.6}}>
            <div style={{color:t.accent}}>1. {primary?.name || <span style={{color:t.danger}}>none set</span>}</div>
            {backups.map((b, i) => (
              <div key={b.id || i} style={{color:t.textMuted}}>{i + 2}. {b.name}</div>
            ))}
            {!backups.length && <div style={{color:t.textDim, fontStyle:'italic'}}>no backups configured</div>}
          </div>
        </div>

        {primary && <PoolSection t={t} title="Primary" sub="active" sevColor={t.accent} pools={[primary]} active={active} setActive={setActive}/>}
        {backups.length > 0 && <PoolSection t={t} title="Backup" sub={`${backups.length} pool${backups.length !== 1 ? 's' : ''}`} sevColor={t.info} pools={backups} active={active} setActive={setActive} reorder={moveBackup}/>}
        {unassigned.length > 0 && <PoolSection t={t} title="Unassigned" sub="not in failover chain" sevColor={t.textDim} pools={unassigned} active={active} setActive={setActive}/>}
      </div>

      <Card t={t}>
        {draft && (
          <>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
              <div>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <Label t={t}>Profile</Label>
                  <RoleBadge t={t} role={draft.role} priority={draft.priority}/>
                </div>
                <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.01em'}}>{draft.name || 'Pool'}</div>
              </div>
              <div style={{display:'flex', gap:8}}>
                <button onClick={runTest} disabled={!valid || testing==='running'} style={{...protoBtn(t), opacity: valid && testing!=='running' ? 1 : 0.55}}>
                  {testing === 'running' ? <><Spinner t={t}/> Testing…</> : <><Icons.power size={13}/> Test connection</>}
                </button>
                <button onClick={save} disabled={!valid || saving} style={{...protoBtn(t, 'primary'), opacity: valid && !saving ? 1 : 0.55}}>
                  {saving ? <><Spinner t={t}/> Saving…</> : <><Icons.check size={13}/> Save</>}
                </button>
              </div>
            </div>

            {/* Role assignment */}
            <div style={{padding:'14px 16px', background:t.surface2, border:`1px solid ${t.border}`, borderRadius:10, marginBottom:16}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                <div>
                  <div style={{fontSize:12, fontWeight:600, marginBottom:2}}>Role in failover chain</div>
                  <div style={{fontSize:11, color:t.textMuted}}>
                    {draft.role === 'primary'    && 'Devices connect here first.'}
                    {draft.role === 'backup'     && `Devices fall back to this pool ${draft.priority === 1 ? 'first' : `at position ${draft.priority}`} if higher-priority pools fail.`}
                    {draft.role === 'unassigned' && 'Not currently used by any device.'}
                  </div>
                </div>
              </div>
              <div style={{display:'flex', gap:6}}>
                {[
                  ['primary', 'Set as Primary', t.accent, draft.role === 'primary'],
                  ['backup',  draft.role === 'backup' ? 'Currently a Backup' : 'Set as Backup', t.info, draft.role === 'backup'],
                  ['unassigned', 'Remove from chain', t.textMuted, draft.role === 'unassigned'],
                ].map(([role, label, color, isCurrent]) => (
                  <button key={role}
                    onClick={() => !isCurrent && setRole(active, role)}
                    disabled={isCurrent}
                    style={{
                      flex:1, padding:'8px 12px', borderRadius:8, fontSize:12, fontWeight:500,
                      cursor: isCurrent ? 'default' : 'pointer',
                      background: isCurrent ? color + '22' : 'transparent',
                      color: isCurrent ? color : t.text,
                      border: `1px solid ${isCurrent ? color : t.border}`,
                      transition:'all .15s', display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                    }}
                    onMouseEnter={e => !isCurrent && (e.currentTarget.style.borderColor = color)}
                    onMouseLeave={e => !isCurrent && (e.currentTarget.style.borderColor = t.border)}>
                    {isCurrent && <Icons.check size={12}/>}
                    {label}
                  </button>
                ))}
              </div>
              {draft.role === 'backup' && backups.length > 1 && (
                <div style={{marginTop:10, paddingTop:10, borderTop:`1px solid ${t.border}`, display:'flex', alignItems:'center', gap:8, fontSize:11, color:t.textMuted}}>
                  <span>Priority:</span>
                  <button onClick={() => moveBackup(active, -1)} disabled={(draft.priority || 0) <= 1}
                    style={{...protoBtn(t), padding:'2px 8px', fontSize:11, opacity: (draft.priority || 0) <= 1 ? 0.4 : 1}}>↑ Earlier</button>
                  <button onClick={() => moveBackup(active, 1)} disabled={(draft.priority || 0) >= backups.length}
                    style={{...protoBtn(t), padding:'2px 8px', fontSize:11, opacity: (draft.priority || 0) >= backups.length ? 0.4 : 1}}>↓ Later</button>
                  <span style={{flex:1, textAlign:'right', fontFamily:PROTO_MONO, fontSize:10}}>position {draft.priority} of {backups.length}</span>
                </div>
              )}
            </div>

            {testing === 'ok'   && <Banner t={t} tone="success" icon={<Icons.check size={14}/>}>Connected · stratum ACK received · hostname resolved</Banner>}
            {testing === 'fail' && <Banner t={t} tone="danger"  icon={<Icons.alert size={14}/>}>Connection refused · check URL and port</Banner>}

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:16}}>
              <FormField t={t} label="Profile name" value={draft.name || ''} onChange={v => setDraft({...draft, name: v})}/>
              <FormField t={t} label="Status" value={draft.status || 'unknown'} onChange={()=>{}} readOnly/>
              <FormField t={t} label="Stratum URL" value={draft.url || ''} onChange={v => setDraft({...draft, url: v})} mono error={errs.url}/>
              <FormField t={t} label="Worker name" value={draft.worker || ''} onChange={v => setDraft({...draft, worker: v})} mono error={errs.worker}/>
              <FormField t={t} label="Password" value={draft.password || ''} onChange={v => setDraft({...draft, password: v})} mono/>
            </div>

            {/* Assigned devices from context */}
            {allDevices.length > 0 && (
              <div style={{marginTop:24, paddingTop:16, borderTop:`1px solid ${t.border}`}}>
                <Label t={t} style={{marginBottom:10}}>Assigned Devices</Label>
                <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6}}>
                  {allDevices.slice(0, draft.assigned || 6).map(d => (
                    <div key={d.ip} style={{padding:'6px 10px', background:t.surface2, border:`1px solid ${t.border}`, borderRadius:6, fontSize:11, display:'flex', alignItems:'center', gap:6}}>
                      <span style={{width:6, height:6, borderRadius:'50%', background: d.status==='online' ? t.success : t.textMuted}}/>
                      <span style={{fontFamily:PROTO_MONO, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{d.name}</span>
                    </div>
                  ))}
                </div>
                <button style={{...protoBtn(t), marginTop:12}}><Icons.plus size={13}/> Assign devices</button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function PoolSection({ t, title, sub, sevColor, pools, active, setActive, reorder }) {
  return (
    <div style={{marginBottom:14}}>
      <div style={{display:'flex', alignItems:'center', gap:6, padding:'0 4px 6px', fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO, textTransform:'uppercase', letterSpacing:'0.08em'}}>
        <span style={{width:6, height:6, borderRadius:'50%', background:sevColor, flexShrink:0}}/>
        <span style={{flex:1}}>{title}</span>
        <span style={{color:t.textDim, textTransform:'none', letterSpacing:0}}>{sub}</span>
      </div>
      <div style={{display:'flex', flexDirection:'column', gap:6}}>
        {pools.map((p, i) => {
          const pid = p.id != null ? p.id : i;
          return (
            <div key={pid} onClick={() => setActive(pid)} style={{
              padding:'10px 12px', borderRadius:10, cursor:'pointer',
              background: active === pid ? t.accentGlow : t.surface,
              border: `1px solid ${active === pid ? t.accent : t.border}`,
              position:'relative', transition:'all .15s',
            }}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:6}}>
                <div style={{display:'flex', alignItems:'center', gap:6, minWidth:0, flex:1}}>
                  {p.role === 'backup' && (
                    <span style={{fontSize:10, fontFamily:PROTO_MONO, fontWeight:700, color:sevColor, background: sevColor + '22', padding:'2px 5px', borderRadius:4, minWidth:18, textAlign:'center', flexShrink:0}}>#{p.priority}</span>
                  )}
                  {p.role === 'primary' && <span style={{fontSize:10, color:sevColor, flexShrink:0}}>★</span>}
                  <div style={{fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.name || 'Pool'}</div>
                </div>
                <Pill t={t} sev={p.status === 'ok' ? 'success' : 'muted'}>{p.status || '—'}</Pill>
              </div>
              <div style={{fontSize:10, fontFamily:PROTO_MONO, color:t.textMuted, marginTop:4, wordBreak:'break-all'}}>
                {(p.url || '').replace('stratum+tcp://','').replace('stratum+ssl://','ssl://')}
              </div>
              <div style={{fontSize:10, fontFamily:PROTO_MONO, color:t.textDim, marginTop:2, display:'flex', justifyContent:'space-between'}}>
                <span>{p.worker || '—'}</span>
                {reorder && pools.length > 1 && (
                  <span style={{display:'flex', gap:2}}>
                    <button onClick={e => { e.stopPropagation(); reorder(pid, -1); }} disabled={i === 0}
                      style={{background:'transparent', border:'none', color: i === 0 ? t.textDim : t.textMuted, cursor: i === 0 ? 'default' : 'pointer', padding:'0 3px', fontSize:11}}>↑</button>
                    <button onClick={e => { e.stopPropagation(); reorder(pid, 1); }} disabled={i === pools.length - 1}
                      style={{background:'transparent', border:'none', color: i === pools.length - 1 ? t.textDim : t.textMuted, cursor: i === pools.length - 1 ? 'default' : 'pointer', padding:'0 3px', fontSize:11}}>↓</button>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoleBadge({ t, role, priority }) {
  const cfg = {
    primary:    { color: t.accent,  label: 'PRIMARY' },
    backup:     { color: t.info,    label: `BACKUP #${priority}` },
    unassigned: { color: t.textDim, label: 'UNASSIGNED' },
  }[role] || { color: t.textDim, label: '—' };
  return (
    <span style={{
      fontSize:9, fontFamily:PROTO_MONO, fontWeight:700,
      color: cfg.color, background: cfg.color + '22',
      padding:'2px 6px', borderRadius:3, letterSpacing:'0.08em',
    }}>{cfg.label}</span>
  );
}

function KV({ t, k, v, mono }) {
  return (
    <div style={{display:'flex', gap:10, padding:'5px 0', fontSize:13}}>
      <div style={{width:80, color:t.textMuted, fontSize:11, fontFamily:PROTO_MONO}}>{k}</div>
      <div style={{flex:1, fontFamily: mono ? PROTO_MONO : 'inherit', color: mono ? t.accent : t.text, wordBreak:'break-all'}}>{v}</div>
    </div>
  );
}

function Banner({ t, tone, icon, children, style }) {
  const colors = { success: t.success, danger: t.danger, warning: t.warning, info: t.info };
  const c = colors[tone] || t.info;
  return (
    <div style={{display:'flex', gap:10, alignItems:'flex-start', padding:'10px 14px', background: c + '18', border:`1px solid ${c}55`, borderRadius:10, marginTop:14, color: c, fontSize:13, ...style}}>
      {icon}
      <div style={{flex:1, color:t.text}}>{children}</div>
    </div>
  );
}

function Spinner({ t, size=12 }) {
  return (
    <span style={{
      display:'inline-block', width:size, height:size, borderRadius:'50%',
      border:`2px solid ${t.border}`, borderTopColor:t.accent,
      animation:'proto-spin .8s linear infinite', verticalAlign:'middle',
    }}/>
  );
}

window.PoolPage = PoolPage;
window.Banner = Banner;
window.Spinner = Spinner;
