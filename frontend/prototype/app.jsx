// Main entry for HashHive — production build.

function HiveApp() {
  const [dark, setDark] = React.useState(true);
  const [screen, setScreen] = React.useState('dashboard');
  const [device, setDevice] = React.useState(null);
  const [detailDevice, setDetailDevice] = React.useState(null);
  const [groupId, setGroupId] = React.useState(null);
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [globalSearch, setGlobalSearch] = React.useState('');

  const tweaks = { personality: 'hive', density: 'cozy', motif: 'none' };
  const t = protoTheme(dark, tweaks.personality, tweaks.density);
  const bodyFont = protoBodyFont(tweaks.personality);

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

  const openDeviceDetail = (d) => { setDetailDevice(d); setScreen('device-detail'); };
  const openGroup = (id) => { setGroupId(id); setScreen('group-detail'); };

  const content = () => {
    switch (screen) {
      case 'dashboard':     return <Dashboard t={t} onDevice={setDevice} onNav={setScreen}/>;
      case 'nmminer':       return <DeviceListPage t={t} kind="nmminer" onDevice={openDeviceDetail}/>;
      case 'axeos':         return <DeviceListPage t={t} kind="axeos" onDevice={openDeviceDetail}/>;
      case 'groups':        return <GroupsPage t={t} onOpenGroup={openGroup}/>;
      case 'group-detail':  return <GroupDetailPage t={t} groupId={groupId} onBack={() => setScreen('groups')} onDevice={openDeviceDetail}/>;
      case 'device-detail': return detailDevice
        ? <DeviceDetailPage t={t} device={detailDevice} onBack={() => setScreen(detailDevice.asic ? 'axeos' : 'nmminer')}/>
        : <DeviceListPage t={t} kind="nmminer" onDevice={openDeviceDetail}/>;
      case 'pool':          return <PoolPage t={t}/>;
      case 'schedules':     return <SchedulesPage t={t}/>;
      case 'wallets':       return <WalletsPage t={t}/>;
      case 'earnings':      return <EarningsPage t={t}/>;
      case 'notifications': return <AlertsPage t={t}/>;
      case 'settings':      return <SettingsPage t={t}/>;
      default: return null;
    }
  };

  // Push density css vars
  React.useEffect(() => {
    const root = document.documentElement;
    root.dataset.personality = tweaks.personality;
    root.dataset.density = tweaks.density;
    root.dataset.motif = tweaks.motif;
    const fs = tweaks.density === 'compact' ? 14 : tweaks.density === 'spacious' ? 17 : 15.5;
    root.style.setProperty('--proto-fs', fs + 'px');
  }, []);

  return (
    <HiveProvider>
      <div
        className="proto-app"
        data-personality={tweaks.personality}
        data-density={tweaks.density}
        data-motif={tweaks.motif}
        style={{
          height: '100vh', width: '100vw', overflow: 'hidden',
          background: t.bg, color: t.text, fontFamily: bodyFont, position: 'relative',
        }}>

        <div style={{ position: 'relative', zIndex: 1, height: '100%', width: '100%' }}>
          <Shell t={t}
            dark={dark} onToggleTheme={() => setDark(d => !d)}
            active={screen} onNav={setScreen}
            onAddDevice={() => setShowOnboarding(true)}
            globalSearch={globalSearch} setGlobalSearch={setGlobalSearch}>
            {content()}
          </Shell>

          {device && <DeviceDrawerPro t={t} device={device} onClose={() => setDevice(null)}/>}

          {showOnboarding && (
            <div style={{ position: 'fixed', inset: 0, background: t.bg, zIndex: 100, overflow: 'auto' }}>
              <div style={{ position: 'sticky', top: 0, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, background: t.bg, borderBottom: `1px solid ${t.border}`, zIndex: 1 }}>
                <HiveMark size={22} primary={t.accent} secondary={t.honey}/>
                <div style={{ fontSize: 14, fontWeight: 700 }}>HashHive · Onboarding</div>
                <div style={{ flex: 1 }}/>
                <button onClick={() => setShowOnboarding(false)} style={{ ...protoBtn(t), padding: 6 }}><Icons.x size={14}/> Close</button>
              </div>
              <Onboarding t={t} onComplete={() => setShowOnboarding(false)}/>
            </div>
          )}
        </div>
      </div>
    </HiveProvider>
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

    html[data-density="compact"]  { --d-pad: 0.82; --d-gap: 0.8;  --d-row: 0.85; }
    html[data-density="cozy"]     { --d-pad: 1;    --d-gap: 1;    --d-row: 1; }
    html[data-density="spacious"] { --d-pad: 1.25; --d-gap: 1.25; --d-row: 1.2; }

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

    .proto-app[data-personality="foundry"],
    .proto-app[data-personality="foundry"] button,
    .proto-app[data-personality="foundry"] input {
      font-family: 'JetBrains Mono', ui-monospace, monospace !important;
      letter-spacing: 0;
    }

    .proto-app[data-personality="bloom"] { letter-spacing: 0.005em; }

    /* Sidebar collapse transition */
    .hive-sidebar { transition: width 0.2s ease; }
  `;
  document.head.appendChild(s);
})();

ReactDOM.createRoot(document.getElementById('root')).render(<HiveApp/>);
