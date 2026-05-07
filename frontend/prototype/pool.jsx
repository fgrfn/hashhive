// Pool configuration — two variants.
// V1: List of pool profiles + inline editor
// V2: Push-to-devices flow with validation

function PoolPage({ t, variant }) {
  return variant === 'v1' ? <PoolA t={t}/> : <PoolB t={t}/>;
}

// ─────── VARIANT A ───────
// Each pool has a `role`: 'primary' | 'backup' | 'unassigned'
// Exactly one pool is primary at a time. Backup pools have a `priority`
// (1 = first fallback, 2 = second fallback, …). Devices try primary first,
// then walk the backup list in priority order on stratum failure.
const seedRoles = (pools) => pools.map((p, i) => ({
  ...p,
  role: p.isPrimary ? 'primary' : (p.status === 'ok' && p.assigned > 0 ? 'backup' : 'unassigned'),
  priority: p.isPrimary ? 0 : (p.status === 'ok' ? i : null),
}));

function PoolA({ t }) {
  const [pools, setPools] = React.useState(() => seedRoles(SAMPLE.pools));
  const [active, setActive] = React.useState(pools[0].id);
  const pool = pools.find(p => p.id === active);
  const [draft, setDraft] = React.useState(pool);
  const [testing, setTesting] = React.useState(null);

  React.useEffect(() => setDraft(pool), [active]);

  const validate = () => {
    const errs = {};
    if (!draft.url.startsWith('stratum+tcp://') && !draft.url.startsWith('stratum+ssl://')) errs.url = 'URL must start with stratum+tcp:// or stratum+ssl://';
    if (!draft.url.match(/:\d+$/)) errs.url = 'Missing port';
    if (!draft.worker.trim()) errs.worker = 'Worker required';
    if (!draft.worker.match(/^[a-zA-Z0-9._-]+$/)) errs.worker = 'Invalid characters in worker';
    return errs;
  };
  const errs = draft ? validate() : {};
  const valid = Object.keys(errs).length === 0;

  const runTest = () => {
    setTesting('running');
    setTimeout(() => setTesting(Math.random() > 0.2 ? 'ok' : 'fail'), 1400);
  };

  // Role mutations — only one primary at a time; backups keep an ordered priority list.
  const setRole = (id, newRole) => {
    setPools(prev => {
      const next = prev.map(p => ({...p}));
      const target = next.find(p => p.id === id);
      if (!target) return prev;

      if (newRole === 'primary') {
        // Demote current primary → backup at end of list
        const currentPrimary = next.find(p => p.role === 'primary' && p.id !== id);
        if (currentPrimary) {
          const maxPrio = Math.max(0, ...next.filter(p => p.role === 'backup').map(p => p.priority || 0));
          currentPrimary.role = 'backup';
          currentPrimary.priority = maxPrio + 1;
        }
        target.role = 'primary';
        target.priority = 0;
      } else if (newRole === 'backup') {
        const maxPrio = Math.max(0, ...next.filter(p => p.role === 'backup' && p.id !== id).map(p => p.priority || 0));
        target.role = 'backup';
        target.priority = maxPrio + 1;
      } else {
        target.role = 'unassigned';
        target.priority = null;
      }
      return next;
    });
  };

  const moveBackup = (id, dir) => {
    setPools(prev => {
      const backups = prev.filter(p => p.role === 'backup').sort((a,b) => a.priority - b.priority);
      const idx = backups.findIndex(p => p.id === id);
      const swapIdx = idx + dir;
      if (idx < 0 || swapIdx < 0 || swapIdx >= backups.length) return prev;
      const a = backups[idx], b = backups[swapIdx];
      return prev.map(p => p.id === a.id ? {...p, priority: b.priority} : p.id === b.id ? {...p, priority: a.priority} : p);
    });
  };

  // Sorted by role for sidebar display
  const primary = pools.find(p => p.role === 'primary');
  const backups = pools.filter(p => p.role === 'backup').sort((a,b) => a.priority - b.priority);
  const unassigned = pools.filter(p => p.role === 'unassigned');

  return (
    <div style={{display:'grid', gridTemplateColumns:'300px 1fr', gap:16}}>
      <div>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
          <Label t={t}>Pool Profiles</Label>
          <button style={{...protoBtn(t), padding:'3px 8px', fontSize:11}}><Icons.plus size={11}/> New</button>
        </div>

        {/* Failover summary card */}
        <div style={{padding:'10px 12px', background:t.surface2, border:`1px solid ${t.border}`, borderRadius:10, marginBottom:14}}>
          <div style={{display:'flex', alignItems:'center', gap:6, fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6}}>
            <Icons.power size={11} color={t.accent}/> Failover order
          </div>
          <div style={{fontSize:11, fontFamily:PROTO_MONO, lineHeight:1.6}}>
            <div style={{color:t.accent}}>1. {primary?.name.replace(/^Primary · |^Public /, '') || <span style={{color:t.danger}}>none set</span>}</div>
            {backups.map((b, i) => (
              <div key={b.id} style={{color:t.textMuted}}>{i + 2}. {b.name.replace(/^Primary · |^Fallback · /, '')}</div>
            ))}
            {!backups.length && <div style={{color:t.textDim, fontStyle:'italic'}}>no backups configured</div>}
          </div>
        </div>

        {/* Primary section */}
        {primary && <PoolSection t={t} title="Primary" sub="active" sevColor={t.accent} pools={[primary]} active={active} setActive={setActive}/>}
        {/* Backup section */}
        {backups.length > 0 && <PoolSection t={t} title="Backup" sub={`${backups.length} pool${backups.length !== 1 ? 's' : ''}`} sevColor={t.info} pools={backups} active={active} setActive={setActive} reorder={moveBackup}/>}
        {/* Unassigned */}
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
                <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.01em'}}>{draft.name}</div>
              </div>
              <div style={{display:'flex', gap:8}}>
                <button onClick={runTest} disabled={!valid || testing==='running'} style={{...protoBtn(t), opacity: valid && testing!=='running' ? 1 : 0.55}}>
                  {testing === 'running' ? <><Spinner t={t}/> Testing…</> : <><Icons.power size={13}/> Test connection</>}
                </button>
                <button disabled={!valid} style={{...protoBtn(t, 'primary'), opacity: valid ? 1 : 0.55}}>
                  <Icons.check size={13}/> Save
                </button>
              </div>
            </div>

            {/* Role assignment block — the new bit */}
            <div style={{padding:'14px 16px', background:t.surface2, border:`1px solid ${t.border}`, borderRadius:10, marginBottom:16}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                <div>
                  <div style={{fontSize:12, fontWeight:600, marginBottom:2}}>Role in failover chain</div>
                  <div style={{fontSize:11, color:t.textMuted}}>
                    {draft.role === 'primary'  && 'Devices connect here first.'}
                    {draft.role === 'backup'   && `Devices fall back to this pool ${draft.priority === 1 ? 'first' : `at position ${draft.priority}`} if higher-priority pools fail.`}
                    {draft.role === 'unassigned' && 'Not currently used by any device.'}
                  </div>
                </div>
              </div>
              <div style={{display:'flex', gap:6}}>
                {[
                  ['primary','Set as Primary', t.accent, draft.role === 'primary'],
                  ['backup', draft.role === 'backup' ? 'Currently a Backup' : 'Set as Backup', t.info, draft.role === 'backup'],
                  ['unassigned','Remove from chain', t.textMuted, draft.role === 'unassigned'],
                ].map(([role, label, color, isCurrent]) => (
                  <button key={role}
                    onClick={() => !isCurrent && setRole(draft.id, role)}
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
                  <button onClick={() => moveBackup(draft.id, -1)} disabled={draft.priority <= 1}
                    style={{...protoBtn(t), padding:'2px 8px', fontSize:11, opacity: draft.priority <= 1 ? 0.4 : 1}}>
                    ↑ Earlier
                  </button>
                  <button onClick={() => moveBackup(draft.id, 1)} disabled={draft.priority >= backups.length}
                    style={{...protoBtn(t), padding:'2px 8px', fontSize:11, opacity: draft.priority >= backups.length ? 0.4 : 1}}>
                    ↓ Later
                  </button>
                  <span style={{flex:1, textAlign:'right', fontFamily:PROTO_MONO, fontSize:10}}>position {draft.priority} of {backups.length}</span>
                </div>
              )}
            </div>

            {testing === 'ok' && <Banner t={t} tone="success" icon={<Icons.check size={14}/>}>Connected · stratum ACK received in 142 ms · hostname resolved</Banner>}
            {testing === 'fail' && <Banner t={t} tone="danger" icon={<Icons.alert size={14}/>}>Connection refused · check URL and port</Banner>}

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:16}}>
              <FormField t={t} label="Profile name" value={draft.name} onChange={v => setDraft({...draft, name: v})}/>
              <FormField t={t} label="Status" value={draft.status} onChange={()=>{}} readOnly/>
              <FormField t={t} label="Stratum URL" value={draft.url} onChange={v => setDraft({...draft, url: v})} mono error={errs.url}/>
              <FormField t={t} label="Worker name" value={draft.worker} onChange={v => setDraft({...draft, worker: v})} mono error={errs.worker}/>
              <FormField t={t} label="Password" value={draft.password} onChange={v => setDraft({...draft, password: v})} mono/>
            </div>

            <div style={{marginTop:24, paddingTop:16, borderTop:`1px solid ${t.border}`}}>
              <Label t={t} style={{marginBottom:10}}>Assigned Devices ({draft.assigned})</Label>
              <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6}}>
                {SAMPLE.axeos.concat(SAMPLE.nmminer).slice(0, draft.assigned).map(d => (
                  <div key={d.ip} style={{padding:'6px 10px', background:t.surface2, border:`1px solid ${t.border}`, borderRadius:6, fontSize:11, display:'flex', alignItems:'center', gap:6}}>
                    <span style={{width:6, height:6, borderRadius:'50%', background: d.status==='online'?t.success:t.textMuted}}/>
                    <span style={{fontFamily:PROTO_MONO, flex:1}}>{d.name}</span>
                  </div>
                ))}
              </div>
              <button style={{...protoBtn(t), marginTop:12}}><Icons.plus size={13}/> Assign devices</button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ─────── Helpers for Variant A ───────
function PoolSection({ t, title, sub, sevColor, pools, active, setActive, reorder }) {
  return (
    <div style={{marginBottom:14}}>
      <div style={{display:'flex', alignItems:'center', gap:6, padding:'0 4px 6px', fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO, textTransform:'uppercase', letterSpacing:'0.08em'}}>
        <span style={{width:6, height:6, borderRadius:'50%', background:sevColor, flexShrink:0}}/>
        <span style={{flex:1}}>{title}</span>
        <span style={{color:t.textDim, textTransform:'none', letterSpacing:0}}>{sub}</span>
      </div>
      <div style={{display:'flex', flexDirection:'column', gap:6}}>
        {pools.map((p, i) => (
          <div key={p.id} onClick={() => setActive(p.id)} style={{
            padding:'10px 12px', borderRadius:10, cursor:'pointer',
            background: active === p.id ? t.accentGlow : t.surface,
            border: `1px solid ${active === p.id ? t.accent : t.border}`,
            position:'relative',
            transition:'all .15s',
          }}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:6}}>
              <div style={{display:'flex', alignItems:'center', gap:6, minWidth:0, flex:1}}>
                {p.role === 'backup' && (
                  <span style={{
                    fontSize:10, fontFamily:PROTO_MONO, fontWeight:700,
                    color:sevColor, background: sevColor + '22',
                    padding:'2px 5px', borderRadius:4, minWidth:18, textAlign:'center', flexShrink:0,
                  }}>#{p.priority}</span>
                )}
                {p.role === 'primary' && (
                  <span style={{fontSize:10, color:sevColor, flexShrink:0}}>★</span>
                )}
                <div style={{fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.name}</div>
              </div>
              <Pill t={t} sev={p.status === 'ok' ? 'success' : 'danger'}>{p.status}</Pill>
            </div>
            <div style={{fontSize:10, fontFamily:PROTO_MONO, color:t.textMuted, marginTop:4, wordBreak:'break-all'}}>{p.url.replace('stratum+tcp://','')}</div>
            <div style={{fontSize:10, fontFamily:PROTO_MONO, color:t.textDim, marginTop:2, display:'flex', justifyContent:'space-between'}}>
              <span>assigned: {p.assigned} devices</span>
              {reorder && pools.length > 1 && (
                <span style={{display:'flex', gap:2}}>
                  <button onClick={e => { e.stopPropagation(); reorder(p.id, -1); }} disabled={i === 0}
                    style={{background:'transparent', border:'none', color: i === 0 ? t.textDim : t.textMuted, cursor: i === 0 ? 'default' : 'pointer', padding:'0 3px', fontSize:11}}>↑</button>
                  <button onClick={e => { e.stopPropagation(); reorder(p.id, 1); }} disabled={i === pools.length - 1}
                    style={{background:'transparent', border:'none', color: i === pools.length - 1 ? t.textDim : t.textMuted, cursor: i === pools.length - 1 ? 'default' : 'pointer', padding:'0 3px', fontSize:11}}>↓</button>
                </span>
              )}
            </div>
          </div>
        ))}
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

// ─────── VARIANT B — push-to-devices wizard ───────
function PoolB({ t }) {
  const [step, setStep] = React.useState(0); // 0: configure, 1: review, 2: push, 3: done
  const [draft, setDraft] = React.useState({
    name: 'CKPool Solo',
    url: 'stratum+tcp://solo.ckpool.org:3333',
    worker: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh.hashhive',
    password: 'x',
  });
  const [selected, setSelected] = React.useState(new Set(SAMPLE.axeos.slice(0,6).map(d => d.ip)));
  const [pushState, setPushState] = React.useState({}); // ip → 'pending'|'ok'|'fail'

  const devices = SAMPLE.axeos.concat(SAMPLE.nmminer);
  const selectedDevices = devices.filter(d => selected.has(d.ip));

  const validate = () => {
    const e = {};
    if (!draft.url.startsWith('stratum+')) e.url = 'Must start with stratum+tcp:// or stratum+ssl://';
    if (!draft.worker) e.worker = 'Required';
    return e;
  };
  const errs = validate();
  const valid = Object.keys(errs).length === 0;

  const doPush = () => {
    setStep(2);
    selectedDevices.forEach((d, i) => {
      setTimeout(() => setPushState(s => ({...s, [d.ip]: 'pending'})), i * 100);
      setTimeout(() => setPushState(s => ({...s, [d.ip]: Math.random() > 0.1 ? 'ok' : 'fail'})), 600 + i * 180);
    });
    setTimeout(() => setStep(3), 600 + selectedDevices.length * 180 + 400);
  };

  return (
    <div>
      {/* Stepper */}
      <div style={{display:'flex', gap:0, marginBottom:20, background:t.surface, border:`1px solid ${t.border}`, borderRadius:12, padding:4}}>
        {['Configure','Select devices','Review','Push'].map((l, i) => (
          <div key={l} style={{
            flex:1, padding:'10px 12px', fontSize:12, fontWeight:500, textAlign:'center', borderRadius:8, position:'relative',
            background: step === i ? t.accent : 'transparent',
            color: step === i ? '#fff' : step > i ? t.accent : t.textMuted,
            cursor: step > i ? 'pointer' : 'default',
            transition:'all .2s',
          }} onClick={() => { if (step > i) setStep(i); }}>
            {step > i && <Icons.check size={11} style={{marginRight:5}}/>}
            {i + 1}. {l}
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card t={t}>
          <Label t={t}>New pool configuration</Label>
          <div style={{fontSize:13, color:t.textMuted, marginTop:4, marginBottom:16}}>
            This will be pushed to selected devices. No changes are made until you confirm in step 4.
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
            <FormField t={t} label="Profile name" value={draft.name} onChange={v => setDraft({...draft, name: v})}/>
            <div/>
            <FormField t={t} label="Stratum URL" value={draft.url} onChange={v => setDraft({...draft, url: v})} mono error={errs.url}/>
            <FormField t={t} label="Worker name" value={draft.worker} onChange={v => setDraft({...draft, worker: v})} mono error={errs.worker}/>
            <FormField t={t} label="Password (usually 'x')" value={draft.password} onChange={v => setDraft({...draft, password: v})} mono/>
          </div>
          <div style={{marginTop:18, display:'flex', justifyContent:'flex-end'}}>
            <button disabled={!valid} onClick={() => setStep(1)} style={{...protoBtn(t, 'primary'), opacity: valid ? 1 : 0.55}}>
              Next <Icons.arrowRight size={13}/>
            </button>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card t={t}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
            <div>
              <Label t={t}>Choose devices · {selected.size} selected</Label>
              <div style={{fontSize:13, color:t.textMuted, marginTop:3}}>The new pool will replace the current pool on these devices.</div>
            </div>
            <div style={{display:'flex', gap:6}}>
              <button onClick={() => setSelected(new Set(devices.filter(d => d.status === 'online').map(d => d.ip)))} style={{...protoBtn(t), fontSize:11}}>Only online</button>
              <button onClick={() => setSelected(new Set(devices.map(d => d.ip)))} style={{...protoBtn(t), fontSize:11}}>All</button>
              <button onClick={() => setSelected(new Set())} style={{...protoBtn(t), fontSize:11}}>None</button>
            </div>
          </div>
          <div style={{maxHeight:420, overflow:'auto', border:`1px solid ${t.border}`, borderRadius:10}}>
            {devices.map((d, i) => (
              <div key={d.ip} onClick={() => {
                const s = new Set(selected);
                if (s.has(d.ip)) s.delete(d.ip); else s.add(d.ip);
                setSelected(s);
              }} style={{
                display:'grid', gridTemplateColumns:'28px 1.2fr 1fr 0.8fr 1fr 0.7fr', gap:10, padding:'11px 14px',
                borderBottom: i === devices.length - 1 ? 'none' : `1px solid ${t.border}`,
                alignItems:'center', fontSize:12, cursor:'pointer', background: selected.has(d.ip) ? t.accentGlow : 'transparent',
              }}>
                <input type="checkbox" checked={selected.has(d.ip)} onChange={()=>{}} style={{accentColor:t.accent}}/>
                <div>
                  <div style={{fontWeight:600}}>{d.name}</div>
                  <div style={{fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO}}>{d.ip}</div>
                </div>
                <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO}}>{d.asic || d.type || 'NMMiner'}</div>
                <StatusPill t={t} status={d.status}/>
                <div style={{fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO}}>current: {d.pool || '—'}</div>
                <div/>
              </div>
            ))}
          </div>
          <div style={{marginTop:18, display:'flex', justifyContent:'space-between'}}>
            <button onClick={() => setStep(0)} style={{...protoBtn(t)}}><Icons.arrowLeft size={13}/> Back</button>
            <button onClick={() => setStep(2)} disabled={selected.size === 0} style={{...protoBtn(t, 'primary'), opacity: selected.size > 0 ? 1 : 0.55}}>Next <Icons.arrowRight size={13}/></button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card t={t}>
          <Label t={t}>Review & push</Label>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:14}}>
            <div style={{background:t.bg, border:`1px solid ${t.border}`, borderRadius:10, padding:14}}>
              <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10}}>New pool</div>
              <KV t={t} k="Name" v={draft.name}/>
              <KV t={t} k="URL" v={draft.url} mono/>
              <KV t={t} k="Worker" v={draft.worker} mono/>
              <KV t={t} k="Password" v="••"/>
            </div>
            <div style={{background:t.bg, border:`1px solid ${t.border}`, borderRadius:10, padding:14}}>
              <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10}}>Pushing to</div>
              <div style={{fontSize:22, fontWeight:700, color:t.accent, fontFamily:PROTO_MONO, letterSpacing:'-0.02em'}}>{selectedDevices.length} <span style={{fontSize:12, color:t.textMuted, fontWeight:400}}>devices</span></div>
              <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO, marginTop:4}}>
                {selectedDevices.filter(d=>d.status==='online').length} online · {selectedDevices.filter(d=>d.status!=='online').length} will retry when back online
              </div>
            </div>
          </div>
          <Banner t={t} tone="warning" icon={<Icons.alert size={14}/>} style={{marginTop:14}}>
            Devices will briefly restart mining when the new pool is applied. Expect ~10s downtime per device.
          </Banner>

          {/* Device push progress */}
          <div style={{marginTop:16, maxHeight:260, overflow:'auto', border:`1px solid ${t.border}`, borderRadius:10}}>
            {selectedDevices.map((d, i) => {
              const s = pushState[d.ip];
              return (
                <div key={d.ip} style={{display:'grid', gridTemplateColumns:'1.2fr 1fr 100px', gap:10, padding:'10px 14px', borderBottom: i === selectedDevices.length-1 ? 'none' : `1px solid ${t.border}`, alignItems:'center', fontSize:12}}>
                  <div style={{fontWeight:600}}>{d.name}</div>
                  <div style={{fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO}}>{d.ip}</div>
                  <div>
                    {s === 'pending' && <Pill t={t} sev="info"><Spinner t={t} size={10}/> pushing…</Pill>}
                    {s === 'ok' && <Pill t={t} sev="success"><Icons.check size={10}/> applied</Pill>}
                    {s === 'fail' && <Pill t={t} sev="danger"><Icons.x size={10}/> failed</Pill>}
                    {!s && <Pill t={t} sev="muted">queued</Pill>}
                  </div>
                </div>
              );
            })}
          </div>

          {Object.keys(pushState).length === 0 && (
            <div style={{marginTop:18, display:'flex', justifyContent:'space-between'}}>
              <button onClick={() => setStep(1)} style={{...protoBtn(t)}}><Icons.arrowLeft size={13}/> Back</button>
              <button onClick={doPush} style={{...protoBtn(t, 'primary')}}><Icons.upload size={13}/> Push to {selected.size} devices</button>
            </div>
          )}
        </Card>
      )}

      {step === 3 && (() => {
        const ok = Object.values(pushState).filter(v => v === 'ok').length;
        const fail = Object.values(pushState).filter(v => v === 'fail').length;
        return (
          <Card t={t}>
            <div style={{textAlign:'center', padding:'30px 20px'}}>
              <div style={{width:56, height:56, borderRadius:'50%', background: fail === 0 ? t.success + '22' : t.warning + '22', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:14}}>
                {fail === 0 ? <Icons.check size={28} color={t.success}/> : <Icons.alert size={28} color={t.warning}/>}
              </div>
              <div style={{fontSize:22, fontWeight:700, letterSpacing:'-0.02em'}}>
                {fail === 0 ? 'All devices updated' : `${ok} updated · ${fail} failed`}
              </div>
              <div style={{fontSize:13, color:t.textMuted, marginTop:6}}>
                {fail === 0 ? 'Mining has resumed on the new pool.' : 'Failed devices will retry automatically when online.'}
              </div>
              <div style={{marginTop:20, display:'flex', gap:8, justifyContent:'center'}}>
                <button onClick={() => { setStep(0); setPushState({}); }} style={{...protoBtn(t)}}>Push another pool</button>
                <button style={{...protoBtn(t, 'primary')}}><Icons.dashboard size={13}/> Back to dashboard</button>
              </div>
            </div>
          </Card>
        );
      })()}
    </div>
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
  const colors = {
    success: t.success, danger: t.danger, warning: t.warning, info: t.info,
  };
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
