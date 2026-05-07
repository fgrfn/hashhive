// api.jsx — Global data layer: WebSocket + REST + React Context

// ─── REST helper ───────────────────────────────────────────────
window.apiFetch = async (path, opts = {}) => {
  const r = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};

// ─── React Context ──────────────────────────────────────────────
window.HiveContext = React.createContext({});
window.useHive = () => React.useContext(window.HiveContext);

// ─── Device normalisers ─────────────────────────────────────────
window.normalizeNM = (d) => ({
  ip: d.ip || d._ip || '',
  name: d.name || d.hostname || d.ip || 'NMMiner',
  status: d.online === false ? 'offline' : 'online',
  hr: parseFloat(d.GHs5s || d.GHs5 || d.GHs1m || d.GHsav || d.hashrate || 0),
  hrUnit: 'GH/s',
  temp: parseFloat(d.temp || d.Temp || 0),
  shares: {
    acc: parseInt(d.Accepted || d.accepted || d.sharesAccepted || 0),
    rej: parseInt(d.Rejected || d.rejected || d.sharesRejected || 0),
  },
  pool: d.pool || d.poolUrl || '',
  bestDiff: d.bestDiff || d.best_diff || '—',
  uptime: d.uptime || d.Uptime || '—',
  version: d.version || '—',
  _type: 'nmminer',
});

window.normalizeAxe = (d) => ({
  ip: d._ip || d.ip || '',
  name: d.hostname || d._ip || d.ASICModel || 'BitAxe',
  asic: d.ASICModel || '—',
  status: d._online ? 'online' : 'offline',
  hr: parseFloat(d.hashRate || d.hashrate || 0) / 1000, // MH/s → GH/s
  hrUnit: 'GH/s',
  temp: parseFloat(d.temp || 0),
  vrTemp: parseFloat(d.vrTemp || 0),
  power: parseFloat(d.power || 0),
  shares: {
    acc: parseInt(d.sharesAccepted || 0),
    rej: parseInt(d.sharesRejected || 0),
  },
  bestDiff: d.bestDiff || '—',
  uptime: d.uptimeSeconds ? `${Math.floor(d.uptimeSeconds / 3600)}h` : '—',
  pool: d.stratumURL || '—',
  rssi: d.wifiRSSI || d.rssi || 0,
  _type: 'axeos',
  _raw: d,
});

window.normalizeSolo = (d) => ({
  ip: d._ip || d.ip || '',
  name: d.minerName || d.hostname || d._ip || 'SoloMiner',
  status: d._online ? 'online' : 'offline',
  hr: parseFloat(d.hashRate || d.currentHashrate || 0),
  hrUnit: 'KH/s',
  _type: d._type || 'nerdminer',
});

// ─── WS state defaults ──────────────────────────────────────────
const WS_INIT = {
  nmminer:      { devices: [] },
  axeos:        { devices: [] },
  nerdminer:    { devices: [] },
  sparkminer:   { devices: [] },
  unread_alerts: 0,
  new_alerts:   [],
  config:       {},
  connected:    false,
};

// ─── HiveProvider ───────────────────────────────────────────────
function HiveProvider({ children }) {
  const [ws, setWs]         = React.useState(WS_INIT);
  const [btcPrice, setBtcPrice]   = React.useState(null);
  const [btcChange, setBtcChange] = React.useState(null);
  const [btcCurrency, setBtcCurrency] = React.useState('eur');

  // ── WebSocket ──
  const wsRef = React.useRef(null);
  const reconnTimer = React.useRef(null);

  const connect = React.useCallback(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const sock = new WebSocket(`${proto}://${location.host}/ws`);
    wsRef.current = sock;

    sock.onopen = () => setWs(prev => ({ ...prev, connected: true }));

    sock.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'dashboard') {
          setWs(prev => ({
            ...prev,
            nmminer:       msg.nmminer       || prev.nmminer,
            axeos:         msg.axeos         || prev.axeos,
            nerdminer:     msg.nerdminer     || prev.nerdminer,
            sparkminer:    msg.sparkminer    || prev.sparkminer,
            unread_alerts: msg.unread_alerts ?? prev.unread_alerts,
            new_alerts:    msg.new_alerts    || prev.new_alerts,
            config:        msg.config        || prev.config,
            connected:     true,
          }));
        }
      } catch (_) {}
    };

    sock.onclose = () => {
      setWs(prev => ({ ...prev, connected: false }));
      reconnTimer.current = setTimeout(connect, 3000);
    };

    sock.onerror = () => {
      sock.close();
    };
  }, []);

  React.useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  // ── BTC price polling ──
  const fetchBtcPrice = React.useCallback(() => {
    fetch('/api/market/prices?coin=bitcoin&currency=eur')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setBtcPrice(data.price ?? data.bitcoin?.eur ?? null);
        setBtcChange(data.change_24h ?? data.bitcoin?.eur_24h_change ?? null);
        setBtcCurrency('eur');
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    fetchBtcPrice();
    const id = setInterval(fetchBtcPrice, 60_000);
    return () => clearInterval(id);
  }, [fetchBtcPrice]);

  // ── REST fallback refresh ──
  const refresh = React.useCallback(() => {
    fetch('/api/dashboard')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setWs(prev => ({ ...prev, ...data, connected: prev.connected }));
      })
      .catch(() => {});
  }, []);

  // ── Computed helpers ──
  const nmminer   = ws.nmminer   || { devices: [] };
  const axeos     = ws.axeos     || { devices: [] };
  const nerdminer = ws.nerdminer || { devices: [] };
  const sparkminer= ws.sparkminer|| { devices: [] };

  const allDevices = [
    ...(nmminer.devices   || []).map(window.normalizeNM),
    ...(axeos.devices     || []).map(window.normalizeAxe),
    ...(nerdminer.devices || []).map(window.normalizeSolo),
    ...(sparkminer.devices|| []).map(window.normalizeSolo),
  ];

  const devicesOnline = allDevices.filter(d => d.status === 'online').length;
  const devicesTotal  = allDevices.length;
  const totalHashrate = allDevices.reduce((a, d) => a + (d.hr || 0), 0);
  const openAlerts    = ws.unread_alerts || 0;

  const ctx = {
    // Raw WS state
    nmminer, axeos, nerdminer, sparkminer,
    unread_alerts: ws.unread_alerts,
    new_alerts: ws.new_alerts,
    config: ws.config,
    connected: ws.connected,
    // BTC price
    btcPrice, btcChange, btcCurrency,
    // Computed
    allDevices, devicesOnline, devicesTotal, totalHashrate, openAlerts,
    // Actions
    refresh,
  };

  return React.createElement(window.HiveContext.Provider, { value: ctx }, children);
}

window.HiveProvider = HiveProvider;
