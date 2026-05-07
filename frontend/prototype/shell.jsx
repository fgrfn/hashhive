// App shell — sidebar + topbar + mobile nav
// Used by the full-screen prototype.

function Shell({ t, active, onNav, onToggleTheme, dark, children, mobileMode = false, onAddDevice, globalSearch, setGlobalSearch, variant, onVariant }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const S = SAMPLE;

  const navItems = [
    ['dashboard',    'Dashboard',         Icons.dashboard],
    ['nmminer',      'NMMiner',           Icons.cpu],
    ['axeos',        'BitAxe / NerdAxe',  Icons.zap],
    ['groups',       'Groups',            Icons.grid],
    ['pool',         'Pool',              Icons.globe],
    ['schedules',    'Schedules',         Icons.activity],
    ['wallets',      'Wallets',           Icons.dollar],
    ['earnings',     'Earnings',          Icons.trending],
    ['notifications','Alerts',            Icons.bell,    S.openAlerts],
    ['settings',     'Settings',          Icons.settings],
  ];

  if (mobileMode) {
    return (
      <div style={{width:'100%', height:'100%', display:'flex', flexDirection:'column',
        background:t.bg, color:t.text, fontFamily:PROTO_FONT}}>
        {/* Mobile topbar */}
        <header style={{
          height:56, flexShrink:0, padding:'0 16px',
          borderBottom:`1px solid ${t.border}`, background:t.surface,
          display:'flex', alignItems:'center', justifyContent:'space-between',
        }}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <HiveMark size={26} primary={t.accent} secondary={t.honey}/>
            <div style={{fontWeight:700, fontSize:17, letterSpacing:'-0.02em'}}>
              <span>Hash</span>
              <span style={{background:`linear-gradient(135deg, ${t.honey}, ${t.accent})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>Hive</span>
            </div>
          </div>
          <div style={{display:'flex', gap:6}}>
            <button onClick={onToggleTheme} style={{...protoBtn(t), padding:7}}>
              {dark ? <Icons.sun size={14}/> : <Icons.moon size={14}/>}
            </button>
            <button onClick={() => setMobileOpen(true)} style={{...protoBtn(t), padding:7}}>
              <Icons.menu size={14}/>
            </button>
          </div>
        </header>

        <div style={{flex:1, overflow:'auto', padding:'14px 16px 80px'}}>{children}</div>

        {/* Mobile bottom nav */}
        <nav style={{
          position:'absolute', left:0, right:0, bottom:0,
          background:t.surface, borderTop:`1px solid ${t.border}`,
          display:'flex', padding:'8px 4px 10px', justifyContent:'space-around',
        }}>
          {navItems.filter(n => ['dashboard','nmminer','axeos','earnings','notifications'].includes(n[0])).map(([id,label,I,badge]) => {
            const on = active === id;
            return (
              <button key={id} onClick={() => onNav(id)} style={{
                background:'transparent', border:'none', display:'flex', flexDirection:'column',
                alignItems:'center', gap:3, padding:'4px 8px', cursor:'pointer',
                color: on ? t.accent : t.textMuted, position:'relative',
              }}>
                <I size={18}/>
                <span style={{fontSize:10, fontFamily:PROTO_MONO}}>{label.split(' ')[0]}</span>
                {badge ? <span style={{position:'absolute', top:0, right:4, background:t.danger, color:'#fff', fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:8, fontFamily:PROTO_MONO}}>{badge}</span> : null}
              </button>
            );
          })}
        </nav>

        {mobileOpen && (
          <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', zIndex:100}} onClick={() => setMobileOpen(false)}>
            <div style={{position:'absolute', top:0, right:0, bottom:0, width:280, background:t.surface,
              padding:18, display:'flex', flexDirection:'column', gap:10}} onClick={e => e.stopPropagation()}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
                <Label t={t}>Menu</Label>
                <button onClick={() => setMobileOpen(false)} style={{...protoBtn(t), padding:6}}><Icons.x size={12}/></button>
              </div>
              {navItems.map(([id,label,I,badge]) => (
                <div key={id} onClick={() => { onNav(id); setMobileOpen(false); }} style={{
                  display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
                  borderRadius:8, cursor:'pointer',
                  color: active === id ? t.accent : t.textMuted,
                  background: active === id ? t.accentGlow : 'transparent',
                  fontWeight: active === id ? 600 : 500, fontSize:14,
                }}>
                  <I size={16}/>
                  <span>{label}</span>
                  {badge ? <span style={{marginLeft:'auto', background:t.danger, color:'#fff', fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:10, fontFamily:PROTO_MONO}}>{badge}</span> : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      width:'100%', height:'100%', display:'flex',
      background: t.bg, color: t.text, fontFamily: PROTO_FONT,
    }}>
      {/* Sidebar */}
      <aside style={{
        width: 232, flexShrink:0, background: t.surface,
        borderRight: `1px solid ${t.border}`,
        display:'flex', flexDirection:'column',
      }}>
        <div style={{padding:'20px 20px 16px', display:'flex', alignItems:'center', gap:10, borderBottom:`1px solid ${t.border}`}}>
          <HiveMark size={28} primary={t.accent} secondary={t.honey}/>
          <div style={{fontWeight:700, fontSize:18, letterSpacing:'-0.02em'}}>
            <span>Hash</span>
            <span style={{background:`linear-gradient(135deg, ${t.honey}, ${t.accent})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text'}}>Hive</span>
          </div>
        </div>

        <nav style={{padding:'12px 10px', flex:1, display:'flex', flexDirection:'column', gap:2}}>
          {navItems.map(([id, label, I, badge]) => {
            const on = active === id;
            return (
              <div key={id} onClick={() => onNav(id)} style={{
                display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
                borderRadius:8, cursor:'pointer',
                color: on ? t.accent : t.textMuted,
                background: on ? t.accentGlow : 'transparent',
                fontWeight: on ? 600 : 500, fontSize:13,
                transition:'all .15s',
              }}
              onMouseEnter={e => !on && (e.currentTarget.style.background = t.surface2)}
              onMouseLeave={e => !on && (e.currentTarget.style.background = 'transparent')}>
                <I size={16}/>
                <span>{label}</span>
                {badge ? <span style={{marginLeft:'auto', background:t.danger, color:'#fff', fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:10, fontFamily:PROTO_MONO}}>{badge}</span> : null}
              </div>
            );
          })}

          <div style={{marginTop:16, padding:'0 2px'}}>
            <Label t={t} style={{marginBottom:8, paddingLeft:10}}>Groups</Label>
            {[['NMMiner Swarm', 5, t.accent], ['BitAxe Fleet', 6, t.info], ['NerdAxe', 2, t.honey], ['Lab Bench', 3, t.success]].map(([n, c, col]) => (
              <div key={n} style={{display:'flex', alignItems:'center', gap:8, padding:'7px 12px', borderRadius:6, fontSize:12, color:t.textMuted, cursor:'pointer', transition:'all .15s'}}
                onMouseEnter={e => e.currentTarget.style.background = t.surface2}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{width:8, height:8, borderRadius:2, background:col, flexShrink:0}}/>
                <span style={{flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{n}</span>
                <span style={{fontFamily:PROTO_MONO, fontSize:10, color:t.textDim}}>{c}</span>
              </div>
            ))}
          </div>
        </nav>

        <LiveFooter t={t}/>
      </aside>

      {/* Main */}
      <div style={{flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden'}}>
        <Topbar t={t} active={active}
          onToggleTheme={onToggleTheme} dark={dark}
          onAddDevice={onAddDevice}
          globalSearch={globalSearch} setGlobalSearch={setGlobalSearch}
          variant={variant} onVariant={onVariant}/>
        <div style={{flex:1, overflow:'auto'}}>
          <div style={{padding:'22px 26px 40px', minWidth:900}}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function Topbar({ t, active, onToggleTheme, dark, onAddDevice, globalSearch, setGlobalSearch, variant, onVariant }) {
  const titleMap = {
    dashboard:'Dashboard', nmminer:'NMMiner', axeos:'BitAxe / NerdAxe',
    groups:'Groups', 'group-detail':'Group Detail', 'device-detail':'Device Detail',
    pool:'Pool Configuration', schedules:'Schedules', wallets:'Wallets',
    earnings:'Earnings', notifications:'Alerts & Notifications', settings:'Settings',
    onboarding:'Welcome',
  };
  return (
    <header style={{
      height:64, flexShrink:0, padding:'0 26px',
      borderBottom:`1px solid ${t.border}`, background:t.surface,
      display:'flex', alignItems:'center', justifyContent:'space-between',
      gap:16,
    }}>
      <div style={{minWidth:0}}>
        <div style={{fontSize:10, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.12em', fontFamily:PROTO_MONO}}>
          HashHive / {titleMap[active] || active}
        </div>
        <div style={{fontSize:20, fontWeight:600, letterSpacing:'-0.02em', marginTop:2}}>
          {titleMap[active] || active}
        </div>
      </div>
      <div style={{display:'flex', alignItems:'center', gap:10, flexShrink:0}}>
        <div style={{display:'flex', alignItems:'center', gap:8, padding:'7px 12px', border:`1px solid ${t.border}`, borderRadius:8, fontSize:12, fontFamily:PROTO_MONO, color:t.textMuted, width:220, background:t.surface}}>
          <Icons.search size={14}/>
          <input value={globalSearch || ''} onChange={e => setGlobalSearch && setGlobalSearch(e.target.value)}
            placeholder="Search devices…"
            style={{flex:1, background:'transparent', border:'none', outline:'none', color:t.text, fontSize:12, fontFamily:PROTO_MONO}}/>
          <span style={{padding:'1px 6px', background:t.surface2, border:`1px solid ${t.border}`, borderRadius:4, fontSize:10}}>⌘K</span>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:6, padding:'7px 10px', border:`1px solid ${t.border}`, borderRadius:8, fontFamily:PROTO_MONO, fontSize:12, background:t.surface}}>
          <span style={{color:t.textMuted}}>BTC</span>
          <span style={{fontWeight:600}}>${SAMPLE.btcPrice.toLocaleString()}</span>
          <span style={{color:SAMPLE.btcChange >= 0 ? t.success : t.danger, fontSize:11}}>{SAMPLE.btcChange >= 0 ? '▲' : '▼'}{Math.abs(SAMPLE.btcChange).toFixed(2)}%</span>
        </div>
        {variant && onVariant && <VariantBar t={t} variant={variant} onChange={onVariant}/>}
        <button onClick={onToggleTheme} style={{...protoBtn(t), padding:'7px 9px'}} title={dark ? 'Switch to light' : 'Switch to dark'}>
          {dark ? <Icons.sun size={14}/> : <Icons.moon size={14}/>}
        </button>
        <button onClick={onAddDevice} style={{...protoBtn(t, 'primary'), padding:'7px 12px'}}>
          <Icons.plus size={14}/> Add device
        </button>
      </div>
    </header>
  );
}

window.Shell = Shell;

// ─────── Update status footer ───────
// Shows current version + whether a HashHive software update is available.
// Three states: up-to-date, update-available, checking.
// Click "Update available" to open a small popover with release notes + install button.
// Uses backend-proxied /api/updates/* endpoints (avoids client CORS + GitHub rate limits).

function LiveFooter({ t }) {
  const [state, setState]           = React.useState('checking');
  const [showPopover, setShowPopover] = React.useState(false);
  const [currentVer, setCurrentVer] = React.useState('');
  const [latestRelease, setLatestRelease] = React.useState(null);
  const [allReleases, setAllReleases]     = React.useState([]);
  const [selectedVer, setSelectedVer]     = React.useState('');
  const [copying, setCopying]             = React.useState(false);

  React.useEffect(() => {
    fetch('/api/updates/latest')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) { setState('up-to-date'); return; }
        setCurrentVer(data.current || '');
        if (data.update_available && data.latest) {
          setLatestRelease(data.latest);
          setSelectedVer(data.latest.version);
          setState('available');
        } else {
          setState('up-to-date');
        }
      })
      .catch(() => setState('up-to-date'));
  }, []);

  const openPopover = async () => {
    setShowPopover(true);
    if (allReleases.length === 0) {
      try {
        const data = await fetch('/api/updates/releases').then(r => r.json());
        setAllReleases(data.releases || []);
      } catch (_) {}
    }
  };

  const selectRelease = (ver) => {
    setSelectedVer(ver);
    const rel = allReleases.find(r => r.version === ver);
    if (rel) setLatestRelease(rel);
  };

  const copyCmd = () => {
    if (!latestRelease) return;
    const cmd = `docker pull ${latestRelease.docker_image} && docker compose up -d`;
    navigator.clipboard.writeText(cmd).then(() => {
      setCopying(true);
      setTimeout(() => setCopying(false), 1500);
    }).catch(() => {});
  };

  const displayedRelease = allReleases.find(r => r.version === selectedVer) || latestRelease;
  const releaseNotes = displayedRelease
    ? (displayedRelease.body || '').split('\n')
        .filter(l => l.trim().startsWith('*') || l.trim().startsWith('-'))
        .slice(0, 5)
        .map(n => n.replace(/^[\*\-]\s*/, ''))
    : [];

  const currentDisplay = currentVer ? `v${currentVer}` : '…';
  const latestDisplay  = latestRelease ? `v${latestRelease.version}` : '';

  const cfg = {
    'checking':   { color: t.textMuted, dot: t.textMuted, label: 'Checking for updates…', sub: '' },
    'up-to-date': { color: t.success,   dot: t.success,   label: 'Up to date',             sub: `${currentDisplay} · latest` },
    'available':  { color: t.warning,   dot: t.warning,   label: 'Update available',        sub: `${currentDisplay} → ${latestDisplay}` },
  }[state];

  return (
    <div style={{padding:'12px 16px', borderTop:`1px solid ${t.border}`, fontFamily:PROTO_MONO, background:t.surface, position:'relative'}}>
      <div
        onClick={() => state === 'available' && (showPopover ? setShowPopover(false) : openPopover())}
        style={{
          display:'flex', alignItems:'center', gap:8,
          cursor: state === 'available' ? 'pointer' : 'default',
          padding: state === 'available' ? '6px 8px' : 0, margin: state === 'available' ? '-6px -8px 0' : 0,
          borderRadius:6,
          background: state === 'available' && showPopover ? t.surface2 : 'transparent',
          transition:'background .15s',
        }}
        onMouseEnter={e => state === 'available' && !showPopover && (e.currentTarget.style.background = t.surface2)}
        onMouseLeave={e => state === 'available' && !showPopover && (e.currentTarget.style.background = 'transparent')}>
        <span style={{
          position:'relative', width:8, height:8, borderRadius:'50%',
          background: cfg.dot, boxShadow: `0 0 8px ${cfg.dot}`, flexShrink:0,
        }}>
          {state === 'available' && (
            <span style={{
              position:'absolute', inset:-3, borderRadius:'50%',
              border:`1.5px solid ${cfg.dot}`,
              animation:'proto-pulse 2s ease-out infinite',
            }}/>
          )}
        </span>
        <div style={{flex:1, display:'flex', flexDirection:'column', minWidth:0}}>
          <span style={{fontSize:11, color: cfg.color, fontWeight:500}}>{cfg.label}</span>
          {cfg.sub && <span style={{fontSize:10, color:t.textDim, lineHeight:1.3}}>{cfg.sub}</span>}
        </div>
        {state === 'available' && (
          <span style={{
            fontSize:9, padding:'2px 6px', borderRadius:3, fontWeight:700, letterSpacing:'0.06em',
            background: t.warning + '22', color: t.warning,
          }}>NEW</span>
        )}
      </div>

      {/* Row 2: version + device count */}
      <div style={{fontSize:10, color:t.textDim, display:'flex', justifyContent:'space-between', marginTop:6}}>
        <span>{currentDisplay}</span>
        <span>{SAMPLE.devicesTotal} devices</span>
      </div>

      {/* Update popover */}
      {showPopover && state === 'available' && (
        <>
          <div onClick={() => setShowPopover(false)} style={{position:'fixed', inset:0, zIndex:39}}/>
          <div style={{
            position:'absolute', bottom:'calc(100% - 8px)', left:12, right:12,
            background:t.surface, border:`1px solid ${t.border}`, borderRadius:12,
            boxShadow:'0 8px 32px rgba(0,0,0,0.25)',
            padding:14, zIndex:40,
          }}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10}}>
              <div>
                <div style={{fontSize:11, color:t.warning, fontWeight:700, fontFamily:PROTO_MONO, letterSpacing:'0.06em'}}>UPDATE AVAILABLE</div>
                <div style={{fontSize:14, fontWeight:600, marginTop:3}}>
                  HashHive {displayedRelease ? `v${displayedRelease.version}` : latestDisplay}
                </div>
                {displayedRelease?.published_at && (
                  <div style={{fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO, marginTop:2}}>
                    released {new Date(displayedRelease.published_at).toLocaleDateString()}
                  </div>
                )}
              </div>
              <button onClick={() => setShowPopover(false)} style={{background:'transparent', border:'none', color:t.textMuted, cursor:'pointer', padding:2}}>
                <Icons.x size={14}/>
              </button>
            </div>

            {/* Release notes */}
            <div style={{fontSize:11, color:t.textMuted, marginBottom:6, fontWeight:500}}>What's new</div>
            <ul style={{margin:0, padding:'0 0 0 14px', fontSize:11, color:t.text, lineHeight:1.55}}>
              {(releaseNotes.length ? releaseNotes : ['See release notes for details']).map((n, i) =>
                <li key={i} style={{marginBottom:2}}>{n}</li>
              )}
            </ul>

            {/* Docker command */}
            {displayedRelease?.docker_image && (
              <div style={{marginTop:10}}>
                <div style={{fontSize:10, color:t.textMuted, marginBottom:4, fontWeight:500, textTransform:'uppercase', letterSpacing:'.08em', fontFamily:PROTO_MONO}}>Docker update command</div>
                <div style={{background:t.surface2, border:`1px solid ${t.border}`, borderRadius:6, padding:'8px 10px', display:'flex', alignItems:'center', gap:8}}>
                  <code style={{fontFamily:PROTO_MONO, fontSize:10, color:t.text, flex:1, wordBreak:'break-all'}}>
                    {`docker pull ${displayedRelease.docker_image} && docker compose up -d`}
                  </code>
                  <button onClick={copyCmd} style={{...protoBtn(t), padding:'3px 7px', fontSize:10, flexShrink:0}}>
                    {copying ? '✓' : 'copy'}
                  </button>
                </div>
              </div>
            )}

            {/* Version selector for downgrade */}
            {allReleases.length > 1 && (
              <div style={{marginTop:10}}>
                <div style={{fontSize:10, color:t.textMuted, marginBottom:4, fontWeight:500, textTransform:'uppercase', letterSpacing:'.08em', fontFamily:PROTO_MONO}}>Switch version</div>
                <select
                  value={selectedVer}
                  onChange={e => selectRelease(e.target.value)}
                  style={{width:'100%', background:t.surface2, border:`1px solid ${t.border}`, borderRadius:6, padding:'6px 8px', color:t.text, fontSize:12, fontFamily:PROTO_MONO, outline:'none'}}>
                  {allReleases.map(r => (
                    <option key={r.version} value={r.version}>
                      {`v${r.version}${r.version === currentVer ? ' (current)' : ''}${r.prerelease ? ' [pre]' : ''}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{display:'flex', gap:6, marginTop:12}}>
              {displayedRelease?.html_url && (
                <a href={displayedRelease.html_url} target="_blank" rel="noopener"
                  style={{flex:1, textAlign:'center', padding:'7px 10px', fontSize:12, background:t.accent, color:'#fff', borderRadius:8, textDecoration:'none'}}>
                  View release →
                </a>
              )}
              <button onClick={() => setShowPopover(false)} style={{...protoBtn(t), padding:'7px 10px', fontSize:12}}>Later</button>
            </div>
            <div style={{fontSize:9, color:t.textDim, marginTop:8, fontFamily:PROTO_MONO, textAlign:'center'}}>
              Devices keep mining during update · ~30 s downtime for WebUI
            </div>
          </div>
        </>
      )}
    </div>
  );
}
