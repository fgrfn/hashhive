// Shared sample data — all three directions consume this so the comparison is fair.

const SAMPLE = {
  totalHashrate: 2847.3,
  totalHashrateUnit: 'GH/s',
  devicesOnline: 14,
  devicesTotal: 16,
  maxTemp: 68,
  openAlerts: 3,
  totalPower: 428,
  costPerDay: 2.31,
  rewardPerDay: 1.84,
  luckyFactor: 112,
  btcPrice: 97_842,
  btcChange: 2.34,

  nmminer: [
    { ip: '192.168.1.41', name: 'NM-Alpha',  status: 'online',  hr: 412.8, temp: 58, shares: '1284/3', acc: 99.8, pool: 'solo.ckpool.org', bestDiff: '42.1M', uptime: '7d 14h', version: 'v3.2.1' },
    { ip: '192.168.1.42', name: 'NM-Bravo',  status: 'online',  hr: 398.1, temp: 61, shares: '1190/7', acc: 99.4, pool: 'solo.ckpool.org', bestDiff: '38.9M', uptime: '5d 02h', version: 'v3.2.1' },
    { ip: '192.168.1.43', name: 'NM-Charlie',status: 'online',  hr: 404.2, temp: 64, shares: '1112/2', acc: 99.8, pool: 'solo.ckpool.org', bestDiff: '128M',  uptime: '12d 8h', version: 'v3.2.1' },
    { ip: '192.168.1.44', name: 'NM-Delta',  status: 'warning', hr: 381.5, temp: 72, shares: '984/12', acc: 98.8, pool: 'solo.ckpool.org', bestDiff: '22.4M', uptime: '3d 11h', version: 'v3.2.0' },
    { ip: '192.168.1.45', name: 'NM-Echo',   status: 'offline', hr: 0,     temp: null, shares: '—',    acc: null,  pool: '—',               bestDiff: '—',    uptime: '—',      version: 'v3.2.1' },
  ],

  axeos: [
    { ip: '192.168.1.51', name: 'Axe-01', asic: 'BM1368',  type: 'BitAxe Ultra',   status: 'online',  hr: 512.3, hrExpected: 500, temp: 62, vrTemp: 58, power: 18.2, eff: 35.5, shares: '842/4', acc: 99.5, bestDiff: '512M', uptime: '9d 4h',  rssi: -42, pool: 'public-pool.io' },
    { ip: '192.168.1.52', name: 'Axe-02', asic: 'BM1368',  type: 'BitAxe Ultra',   status: 'online',  hr: 498.7, hrExpected: 500, temp: 60, vrTemp: 56, power: 17.9, eff: 35.9, shares: '798/2', acc: 99.7, bestDiff: '128M', uptime: '14d 2h', rssi: -38, pool: 'public-pool.io' },
    { ip: '192.168.1.53', name: 'Axe-03', asic: 'BM1370',  type: 'NerdAxe',        status: 'online',  hr: 620.1, hrExpected: 600, temp: 58, vrTemp: 52, power: 15.8, eff: 25.4, shares: '1042/1', acc: 99.9, bestDiff: '1.2G', uptime: '21d 7h', rssi: -44, pool: 'public-pool.io' },
    { ip: '192.168.1.54', name: 'Axe-04', asic: 'BM1368',  type: 'BitAxe Ultra',   status: 'warning', hr: 445.0, hrExpected: 500, temp: 74, vrTemp: 68, power: 19.4, eff: 43.6, shares: '612/18', acc: 97.1, bestDiff: '64M',  uptime: '2d 14h', rssi: -58, pool: 'public-pool.io' },
    { ip: '192.168.1.55', name: 'Axe-05', asic: 'BM1366',  type: 'BitAxe Max',     status: 'paused',  hr: 0,     hrExpected: 400, temp: 34, vrTemp: 32, power: 2.1,  eff: 0,    shares: '—',    acc: null,  bestDiff: '—',    uptime: '—',      rssi: -48, pool: 'public-pool.io' },
    { ip: '192.168.1.56', name: 'Axe-06', asic: 'BM1370',  type: 'NerdAxe',        status: 'online',  hr: 612.8, hrExpected: 600, temp: 59, vrTemp: 54, power: 15.5, eff: 25.3, shares: '995/3', acc: 99.7, bestDiff: '256M', uptime: '18d 0h', rssi: -41, pool: 'public-pool.io' },
    { ip: '192.168.1.57', name: 'Axe-07', asic: 'BM1368',  type: 'BitAxe Ultra',   status: 'online',  hr: 504.2, hrExpected: 500, temp: 63, vrTemp: 57, power: 18.0, eff: 35.7, shares: '812/5', acc: 99.4, bestDiff: '96M',  uptime: '7d 22h', rssi: -45, pool: 'public-pool.io' },
    { ip: '192.168.1.58', name: 'Axe-08', asic: 'BM1368',  type: 'BitAxe Ultra',   status: 'offline', hr: 0,     hrExpected: 500, temp: null, vrTemp: null, power: 0, eff: 0, shares: '—',    acc: null,  bestDiff: '—',    uptime: '—',      rssi: null, pool: '—' },
  ],

  alerts: [
    { id: 1, sev: 'critical', severity: 'critical', read: false, resolved: false, title: 'Device offline',            detail: 'Axe-08 offline — last heartbeat 14 min ago. Retrying every 30 s.',            msg: 'Axe-08 offline — last seen 14 min ago',                       when: '2m ago',  time: '2m ago',  src: 'axeos',   device: 'Axe-08' },
    { id: 2, sev: 'warning',  severity: 'warning',  read: false, resolved: false, title: 'Chip temperature high',     detail: 'NM-Delta chip temperature 72°C (threshold 70°C). Sustained 3 min.',     msg: 'NM-Delta chip temperature 72°C (threshold 70°C)',             when: '11m ago', time: '11m ago', src: 'nmminer', device: 'NM-Delta' },
    { id: 3, sev: 'warning',  severity: 'warning',  read: false, resolved: false, title: 'Share rejects elevated',    detail: 'Axe-04 share error rate above 3% over last 15 min (rule: r3).',            msg: 'Axe-04 share error rate above 3% over last 15 min',            when: '18m ago', time: '18m ago', src: 'axeos',   device: 'Axe-04' },
    { id: 4, sev: 'info',     severity: 'info',     read: true,  resolved: true,  title: 'Weekly summary sent',       detail: 'Telegram delivery confirmed at 12:02 UTC.',                                 msg: 'Weekly summary sent to Telegram',                              when: '2h ago',  time: '2h ago',  src: 'system',  device: null },
    { id: 5, sev: 'info',     severity: 'info',     read: true,  resolved: true,  title: 'Fallback pool activated',   detail: 'Primary stratum lost for 14 s. Fallback engaged on Axe-02. Recovered.', msg: 'Fallback pool activated briefly on Axe-02',                    when: '4h ago',  time: '4h ago',  src: 'axeos',   device: 'Axe-02' },
    { id: 6, sev: 'warning',  severity: 'warning',  read: true,  resolved: true,  title: 'Brief disconnect',          detail: 'Axe-03 reconnected after 42 s outage. No hashrate lost.',                   msg: 'Axe-03 reconnected after 42 s outage',                         when: '5h ago',  time: '5h ago',  src: 'axeos',   device: 'Axe-03' },
    { id: 7, sev: 'info',     severity: 'info',     read: true,  resolved: false, title: 'Firmware update available', detail: 'NMMiner v3.2.1 available for 4 devices (NM-Alpha, NM-Bravo, NM-Charlie, NM-Echo).', msg: 'Firmware v3.2.1 available for 4 NMMiner devices',             when: '1d ago',  time: '1d ago',  src: 'system',  device: null },
    { id: 8, sev: 'critical', severity: 'critical', read: true,  resolved: true,  title: 'Power draw spike',          detail: 'Axe-04 power draw hit 19.4 W (+8% nominal). Returned to baseline in 4 min.', msg: 'Power draw spike on Axe-04 (19.4 W, +8% nominal)',             when: '1d ago',  time: '1d ago',  src: 'axeos',   device: 'Axe-04' },
  ],

  alertRules: [
    { id: 'r1', name: 'Device offline',        condition: 'no response > 5 min',          severity: 'critical', channels: ['email','telegram'],   enabled: true,  fired24h: 3 },
    { id: 'r2', name: 'Chip temperature high', condition: 'chip temp > 70 °C',                severity: 'warning',  channels: ['telegram'],           enabled: true,  fired24h: 12 },
    { id: 'r3', name: 'Share error rate',      condition: 'rejects > 3% over 15 min',     severity: 'warning',  channels: ['email'],              enabled: true,  fired24h: 4 },
    { id: 'r4', name: 'Pool disconnected',     condition: 'stratum drop > 30 s',          severity: 'critical', channels: ['telegram','webhook'], enabled: true,  fired24h: 1 },
    { id: 'r5', name: 'Hashrate drop',         condition: 'hr < 80% expected for 10 min', severity: 'warning',  channels: ['email'],              enabled: true,  fired24h: 2 },
    { id: 'r6', name: 'Firmware available',    condition: 'new release detected',         severity: 'info',     channels: ['email'],              enabled: false, fired24h: 0 },
    { id: 'r7', name: 'Best-diff milestone',   condition: 'new best diff > 100 M',        severity: 'info',     channels: ['telegram'],           enabled: true,  fired24h: 1 },
  ],

  pools: [
    { id: 'p1', name: 'Primary · solo.ckpool.org',  url: 'stratum+tcp://solo.ckpool.org:3333',         worker: 'bc1q.....n9kr2h3vj.swarm', password: 'x', assigned: 5, status: 'ok',   isPrimary: true  },
    { id: 'p2', name: 'Public Pool',                  url: 'stratum+tcp://public-pool.io:21496',         worker: 'bc1q.....n9kr2h3vj.axefleet', password: 'x', assigned: 6, status: 'ok',   isPrimary: false },
    { id: 'p3', name: 'Fallback · CKPool EU',         url: 'stratum+tcp://eu.ckpool.org:3333',           worker: 'bc1q.....n9kr2h3vj.fallback', password: 'x', assigned: 0, status: 'ok',   isPrimary: false },
    { id: 'p4', name: 'Nerdaxe Lab',                  url: 'stratum+tcp://192.168.1.10:3333',            worker: 'nerdaxe.lab',                 password: 'x', assigned: 3, status: 'down', isPrimary: false },
  ],

  logLines: [
    { ts: '14:28:41', src: 'axeos',   level: 'info',     msg: 'Axe-03 submitted share — diff 1.2G (new best)' },
    { ts: '14:28:36', src: 'nmminer', level: 'ok',       msg: 'NM-Alpha accepted share, pool ack 11ms' },
    { ts: '14:28:12', src: 'system',  level: 'info',     msg: 'Scheduled refresh cycle complete (16 devices polled)' },
    { ts: '14:27:58', src: 'axeos',   level: 'warning',  msg: 'Axe-04 VR temp 68°C — monitoring' },
    { ts: '14:27:44', src: 'nmminer', level: 'ok',       msg: 'NM-Bravo accepted share, pool ack 14ms' },
    { ts: '14:27:11', src: 'axeos',   level: 'critical', msg: 'Axe-08 no response after 3 retries → marked offline' },
    { ts: '14:26:59', src: 'system',  level: 'info',     msg: 'Price feed updated — BTC 97,842 USD (+2.34%)' },
    { ts: '14:26:42', src: 'nmminer', level: 'ok',       msg: 'NM-Charlie accepted share, pool ack 9ms' },
  ],

  // Simple synthetic sparkline data — 48 points, 0..1 normalized
  sparkline: Array.from({length:48}, (_,i) => 0.55 + 0.25*Math.sin(i/3.2) + 0.12*Math.sin(i/7.1) + 0.04*Math.cos(i*1.7)),

  // Bigger hashrate series for charts — 96 points
  hashSeries: Array.from({length:96}, (_,i) => 2700 + 180*Math.sin(i/8.4) + 80*Math.sin(i/2.7) + 40*Math.cos(i*1.3)),
};

window.SAMPLE = SAMPLE;

// Tiny inline sparkline renderer used by all directions
function Sparkline({ data = SAMPLE.sparkline, w = 80, h = 22, color = 'currentColor', fill = true, strokeWidth = 1.4 }) {
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v,i) => {
    const x = (i/(data.length-1)) * w;
    const y = h - ((v-min)/range) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const d = 'M' + pts.join(' L');
  const area = d + ` L ${w},${h} L 0,${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:'block', overflow:'visible'}}>
      {fill && <path d={area} fill={color} opacity="0.12" />}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
window.Sparkline = Sparkline;
