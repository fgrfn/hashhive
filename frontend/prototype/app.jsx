// Main entry for the Hive OS full prototype.

const HIVE_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "personality": "hive",
  "density": "cozy",
  "motif": "none"
}/*EDITMODE-END*/;

function HiveApp() {
  const [dark, setDark] = React.useState(true);
  const [screen, setScreen] = React.useState('dashboard');
  const [variant, setVariant] = React.useState('v1');
  const [device, setDevice] = React.useState(null);
  const [detailDevice, setDetailDevice] = React.useState(null);
  const [groupId, setGroupId] = React.useState(null);
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [showMobile, setShowMobile] = React.useState(false);
  const [globalSearch, setGlobalSearch] = React.useState('');
  const [tweaks, setTweak] = useTweaks(HIVE_TWEAK_DEFAULTS);

  const t = protoTheme(dark, tweaks.personality, tweaks.density);
  const bodyFont = protoBodyFont(tweaks.personality);

  const hasVariants = new Set(['dashboard', 'pool']);

  const titles = {
    dashboard: 'Dashboard',
    nmminer: 'NMMiner',
    axeos: 'BitAxe / NerdAxe',
    groups: 'Groups',
    'group-detail': 'Group Detail',
    'device-detail': 'Device Detail',
    pool: 'Pool Configuration',
    schedules: 'Schedules',
    wallets: 'Wallets',
    earnings: 'Earnings',
    notifications: 'Alerts & Notifications',
    settings: 'Settings',
  };

  // Open the full device-detail page (vs the slide-out drawer)
  const openDeviceDetail = (d) => { setDetailDevice(d); setScreen('device-detail'); };
  const openGroup = (id) => { setGroupId(id); setScreen('group-detail'); };

  const content = () => {
    switch (screen) {
      case 'dashboard':      return <Dashboard t={t} variant={variant} onDevice={setDevice} onNav={setScreen}/>;
      case 'nmminer':        return <DeviceListPage t={t} kind="nmminer" onDevice={openDeviceDetail}/>;
      case 'axeos':          return <DeviceListPage t={t} kind="axeos" onDevice={openDeviceDetail}/>;
      case 'groups':         return <GroupsPage t={t} onOpenGroup={openGroup}/>;
      case 'group-detail':   return <GroupDetailPage t={t} groupId={groupId} onBack={() => setScreen('groups')} onDevice={openDeviceDetail}/>;
      case 'device-detail':  return detailDevice
        ? <DeviceDetailPage t={t} device={detailDevice} onBack={() => setScreen(detailDevice.asic ? 'axeos' : 'nmminer')}/>
        : <DeviceListPage t={t} kind="nmminer" onDevice={openDeviceDetail}/>;
      case 'pool':           return <PoolPage t={t} variant={variant}/>;
      case 'schedules':      return <SchedulesPage t={t}/>;
      case 'wallets':        return <WalletsPage t={t}/>;
      case 'earnings':       return <EarningsPage t={t}/>;
      case 'notifications':  return <AlertsPage t={t}/>;
      case 'settings':       return <SettingsPage t={t}/>;
      default: return null;
    }
  };

  React.useEffect(() => {
    if (!hasVariants.has(screen)) setVariant('v1');
  }, [screen]);

  // Push personality/density/motif to the outer document so CSS can respond
  React.useEffect(() => {
    const root = document.documentElement;
    root.dataset.personality = tweaks.personality;
    root.dataset.density = tweaks.density;
    root.dataset.motif = tweaks.motif;
    const fs = tweaks.density === 'compact' ? 14 : tweaks.density === 'spacious' ? 17 : 15.5;
    root.style.setProperty('--proto-fs', fs + 'px');
  }, [tweaks.personality, tweaks.density, tweaks.motif]);

  const panelTitle = {hive:'Swarm · Tweaks', foundry:'Foundry · Tweaks', bloom:'Bloom · Tweaks'}[tweaks.personality] || 'Tweaks';

  return (
    <div data-screen-label={`HashHive · ${titles[screen] || screen}`}
      className="proto-app"
      data-personality={tweaks.personality}
      data-density={tweaks.density}
      data-motif={tweaks.motif}
      style={{height:'100vh', width:'100vw', overflow:'hidden', background:t.bg, color:t.text, fontFamily: bodyFont, position:'relative'}}>

      {/* Motif layer — sits above bg, below content */}
      <MotifLayer t={t} motif={tweaks.motif} personality={tweaks.personality}/>

      <div style={{position:'relative', zIndex:1, height:'100%', width:'100%'}}>
        <Shell t={t}
          dark={dark} onToggleTheme={() => setDark(d => !d)}
          active={screen} onNav={setScreen}
          onAddDevice={() => setShowOnboarding(true)}
          globalSearch={globalSearch} setGlobalSearch={setGlobalSearch}
          variant={hasVariants.has(screen) ? variant : null}
          onVariant={hasVariants.has(screen) ? setVariant : null}>
          {content()}
        </Shell>

        <button onClick={() => setShowMobile(true)} style={{
          position:'fixed', right:18, bottom:18, zIndex:40,
          background: t.accent, color:'#fff', border:'none',
          borderRadius:24 * t._rs, padding:'10px 16px', cursor:'pointer',
          display:'flex', alignItems:'center', gap:8, fontSize:12, fontWeight:600,
          fontFamily: bodyFont,
          boxShadow: `0 10px 30px rgba(0,0,0,0.35), 0 0 0 1px ${t.accent}88`,
        }}>
          <Icons.cpu size={14} color="#fff"/> Mobile preview
        </button>

        {device && <DeviceDrawerPro t={t} device={device} onClose={() => setDevice(null)}/>}

        {showOnboarding && (
          <div style={{position:'fixed', inset:0, background:t.bg, zIndex:100, overflow:'auto'}}>
            <div style={{position:'sticky', top:0, padding:'10px 16px', display:'flex', alignItems:'center', gap:10, background:t.bg, borderBottom:`1px solid ${t.border}`, zIndex:1}}>
              <HiveMark size={22} primary={t.accent} secondary={t.honey}/>
              <div style={{fontSize:14, fontWeight:700}}>HashHive · Onboarding</div>
              <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO}}>(demo · no real changes)</div>
              <div style={{flex:1}}/>
              <button onClick={() => setShowOnboarding(false)} style={{...protoBtn(t), padding:6}}><Icons.x size={14}/> Close</button>
            </div>
            <Onboarding t={t} onComplete={() => setShowOnboarding(false)}/>
          </div>
        )}

        {showMobile && <MobileOverlay t={t} onClose={() => setShowMobile(false)}/>}
      </div>

      {/* Tweaks panel */}
      <TweaksPanel title={panelTitle}>
        <TweakSection label="Personality">
          <TweakRadio value={tweaks.personality} onChange={v => setTweak('personality', v)}
            options={[
              {value:'hive',    label:'Hive'},
              {value:'foundry', label:'Foundry'},
              {value:'bloom',   label:'Bloom'},
            ]}/>
          <div style={{fontSize:11, opacity:0.6, marginTop:4, lineHeight:1.45}}>
            Recolors, reshapes corners, swaps typeface.
          </div>
        </TweakSection>

        <TweakSection label="Density">
          <TweakRadio value={tweaks.density} onChange={v => setTweak('density', v)}
            options={[
              {value:'compact',  label:'Tight'},
              {value:'cozy',     label:'Cozy'},
              {value:'spacious', label:'Roomy'},
            ]}/>
          <div style={{fontSize:11, opacity:0.6, marginTop:4, lineHeight:1.45}}>
            Type scale + card padding. Affects how much fleet you see at once.
          </div>
        </TweakSection>

        <TweakSection label="Motif">
          <TweakRadio value={tweaks.motif} onChange={v => setTweak('motif', v)}
            options={[
              {value:'none', label:'Off'},
              {value:'hex',  label:'Honeycomb'},
              {value:'grid', label:'Grid'},
              {value:'dots', label:'Dots'},
            ]}/>
          <div style={{fontSize:11, opacity:0.6, marginTop:4, lineHeight:1.45}}>
            Subtle background pattern behind everything.
          </div>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

// ─── motif: fixed-positioned SVG pattern behind all content ───
function MotifLayer({ t, motif, personality }) {
  if (motif === 'none') return null;

  // Choose stroke/fill color + opacity per personality + theme
  const col = t.accent;
  // Brighter in dark bg, darker in light bg — keep subtle
  const op = 0.055;

  let bgImage;
  if (motif === 'hex') {
    // Honeycomb pattern via SVG
    const s = 28; // hex size
    const w = s * Math.sqrt(3);
    const h = s * 2;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w*2}' height='${h*1.5}' viewBox='0 0 ${w*2} ${h*1.5}'>
      <g fill='none' stroke='${col}' stroke-opacity='${op*3}' stroke-width='1'>
        <polygon points='${w/2},0 ${w*1.5},0 ${w*2},${s*0.5} ${w*1.5},${s} ${w/2},${s} 0,${s*0.5}'/>
        <polygon points='${w*1.5},${s} ${w*2.5},${s} ${w*3},${s*1.5} ${w*2.5},${s*2} ${w*1.5},${s*2} ${w},${s*1.5}'/>
        <polygon points='${-w/2},${s} ${w/2},${s} ${w},${s*1.5} ${w/2},${s*2} ${-w/2},${s*2} ${-w},${s*1.5}'/>
      </g>
    </svg>`;
    bgImage = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  } else if (motif === 'grid') {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'>
      <g stroke='${col}' stroke-opacity='${op*2.5}' stroke-width='1'>
        <path d='M0 0 H40 M0 40 H40' fill='none'/>
        <path d='M0 0 V40 M40 0 V40' fill='none'/>
      </g>
      <circle cx='0' cy='0' r='1.6' fill='${col}' fill-opacity='${op*6}'/>
    </svg>`;
    bgImage = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  } else if (motif === 'dots') {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 22 22'>
      <circle cx='11' cy='11' r='1.2' fill='${col}' fill-opacity='${op*5}'/>
    </svg>`;
    bgImage = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }

  return (
    <div aria-hidden="true" style={{
      position:'absolute', inset:0, pointerEvents:'none', zIndex:0,
      backgroundImage: bgImage, backgroundRepeat:'repeat',
      maskImage: 'radial-gradient(ellipse at top right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.15) 100%)',
      WebkitMaskImage: 'radial-gradient(ellipse at top right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.15) 100%)',
    }}/>
  );
}

// ─── mobile viewer: iPhone frames floating over the desktop app ───
function MobileOverlay({ t, onClose }) {
  return (
    <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.78)', zIndex:90, display:'flex', alignItems:'center', justifyContent:'center', padding:20, overflow:'auto'}} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{display:'flex', gap:28, alignItems:'center', flexWrap:'wrap', justifyContent:'center'}}>
        <Phone t={t} label="Home"><MobileShell t={t} initial="dashboard"/></Phone>
        <Phone t={t} label="Devices"><MobileShell t={t} initial="devices"/></Phone>
        <Phone t={t} label="Alerts"><MobileShell t={t} initial="alerts"/></Phone>
        <button onClick={onClose} style={{...protoBtn(t), padding:'10px 14px', background: t.surface, alignSelf:'flex-start'}}>
          <Icons.x size={14}/> Close
        </button>
      </div>
    </div>
  );
}

function Phone({ t, children, label }) {
  return (
    <div style={{display:'flex', flexDirection:'column', gap:10, alignItems:'center'}}>
      <div style={{
        width: 320, height: 660, background:'#000', borderRadius:44, padding:11,
        boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 0 2px rgba(255,255,255,0.08)',
        position:'relative', flexShrink:0,
      }}>
        <div style={{width:'100%', height:'100%', borderRadius:34, overflow:'hidden', background:t.bg, position:'relative'}}>
          <div style={{position:'absolute', top:8, left:'50%', transform:'translateX(-50%)', width:92, height:24, background:'#000', borderRadius:14, zIndex:60}}/>
          <div style={{paddingTop:28, height:'100%', boxSizing:'border-box'}}>{children}</div>
        </div>
      </div>
      <div style={{fontSize:11, color:'#aaa', fontFamily:PROTO_MONO, textTransform:'uppercase', letterSpacing:'0.1em'}}>{label}</div>
    </div>
  );
}

// Global keyframes + density-reactive CSS
(function injectStyles() {
  if (document.getElementById('proto-anim')) return;
  const s = document.createElement('style');
  s.id = 'proto-anim';
  s.innerText = `
    :root { --proto-fs: 15.5px; }
    body { font-size: var(--proto-fs); }
    @keyframes proto-spin { to { transform: rotate(360deg); } }
    @keyframes proto-fade-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
    @keyframes proto-slide-up { from { transform: translateY(100%); } to { transform: none; } }
    @keyframes proto-pulse { 0% { transform: scale(1); opacity: 0.7; } 100% { transform: scale(2.4); opacity: 0; } }
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.2); border-radius: 5px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.35); }

    /* Density affects overall type/chrome scale via a root-level zoom-like adjustment */
    html[data-density="compact"]  { --d-pad: 0.82; --d-gap: 0.8;  --d-row: 0.85; }
    html[data-density="cozy"]     { --d-pad: 1;    --d-gap: 1;    --d-row: 1; }
    html[data-density="spacious"] { --d-pad: 1.25; --d-gap: 1.25; --d-row: 1.2; }

    /* Personality-driven corner treatment — scoped to the proto app shell so overlays (phone frames, tweaks panel) keep their own radii. */
    .proto-app[data-personality="foundry"] button,
    .proto-app[data-personality="foundry"] input,
    .proto-app[data-personality="foundry"] select,
    .proto-app[data-personality="foundry"] [data-card],
    .proto-app[data-personality="foundry"] [data-pill] {
      border-radius: 2px !important;
    }
    .proto-app[data-personality="bloom"] button,
    .proto-app[data-personality="bloom"] input,
    .proto-app[data-personality="bloom"] [data-card] {
      border-radius: 16px !important;
    }

    /* Density-driven padding/gap adjustments on "chrome" cards */
    html[data-density="compact"]  [class*="surface"]:not(input),
    html[data-density="compact"]  .proto-card { }

    /* Foundry = mono typography everywhere inside the shell */
    .proto-app[data-personality="foundry"],
    .proto-app[data-personality="foundry"] button,
    .proto-app[data-personality="foundry"] input {
      font-family: 'JetBrains Mono', ui-monospace, monospace !important;
      letter-spacing: 0;
    }

    /* Bloom gets a slightly friendlier display feel */
    .proto-app[data-personality="bloom"] { letter-spacing: 0.005em; }
  `;
  document.head.appendChild(s);
})();

ReactDOM.createRoot(document.getElementById('root')).render(<HiveApp/>);
