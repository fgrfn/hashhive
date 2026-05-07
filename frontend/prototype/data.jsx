// Extended mock data for the Hive OS prototype.
// Extends SAMPLE with long time-series, shares history, earnings, temperatures, events.

const PROTO = (() => {
  // 7d hashrate series (1 point per 10min = 1008 points — downsample to 288 ≈ 30min)
  const hr7d = Array.from({length: 288}, (_, i) => {
    const base = 2800;
    const daily = 120 * Math.sin(i / 48 * Math.PI);          // day/night
    const weekly = 60 * Math.sin(i / 288 * Math.PI * 2);
    const noise = 30 * Math.sin(i / 3.1) + 12 * Math.cos(i * 1.7);
    const dip = i > 120 && i < 135 ? -400 : 0;               // brief outage
    return base + daily + weekly + noise + dip;
  });

  // 24h (144 points, 10min interval)
  const hr24h = hr7d.slice(-144);

  // 1h (60 points, 1min interval) — per device
  const hr1h = (seed, amp = 12, mean = 420) =>
    Array.from({length: 60}, (_, i) =>
      mean + amp * Math.sin(i / 4 + seed) + amp * 0.4 * Math.cos(i / 1.3 + seed * 2)
    );

  // Share distribution per device (accepted/rejected counts over 24h)
  const shareDist = [
    { name: 'NM-Alpha',   acc: 1284, rej: 3,  stale: 1,  hr: 412.8, accent: '#a855f7' },
    { name: 'NM-Bravo',   acc: 1190, rej: 7,  stale: 2,  hr: 398.1, accent: '#a855f7' },
    { name: 'NM-Charlie', acc: 1112, rej: 2,  stale: 0,  hr: 404.2, accent: '#a855f7' },
    { name: 'NM-Delta',   acc: 984,  rej: 12, stale: 4,  hr: 381.5, accent: '#a855f7' },
    { name: 'Axe-01',     acc: 842,  rej: 4,  stale: 1,  hr: 512.3, accent: '#38bdf8' },
    { name: 'Axe-02',     acc: 798,  rej: 2,  stale: 0,  hr: 498.7, accent: '#38bdf8' },
    { name: 'Axe-03',     acc: 1042, rej: 1,  stale: 0,  hr: 620.1, accent: '#fbbf24' },
    { name: 'Axe-04',     acc: 612,  rej: 18, stale: 6,  hr: 445.0, accent: '#38bdf8' },
    { name: 'Axe-06',     acc: 995,  rej: 3,  stale: 1,  hr: 612.8, accent: '#fbbf24' },
    { name: 'Axe-07',     acc: 812,  rej: 5,  stale: 2,  hr: 504.2, accent: '#38bdf8' },
  ];

  // Temp heatmap: 14 devices × 48 half-hours
  const tempNames = [
    'NM-Alpha','NM-Bravo','NM-Charlie','NM-Delta',
    'Axe-01','Axe-02','Axe-03','Axe-04','Axe-06','Axe-07',
  ];
  const tempHeatmap = tempNames.map((name, di) => ({
    name,
    values: Array.from({length: 48}, (_, i) => {
      const base = 60 + (di % 3) * 4;
      const heat = 6 * Math.sin(i / 8 + di);
      const spike = (di === 3 && i > 30 && i < 42) ? 10 : 0;   // NM-Delta hot spike
      const hot = (di === 7 && i > 38) ? 12 : 0;               // Axe-04 going hot
      return Math.round(base + heat + spike + hot + Math.random() * 2);
    }),
  }));

  // Pool latency over time (ms)
  const poolLatency = {
    primary: {
      name: 'solo.ckpool.org',
      series: Array.from({length: 60}, (_, i) => 10 + 3 * Math.sin(i / 5) + (i === 42 ? 28 : 0) + Math.random() * 2),
      current: 11, p50: 11, p95: 18, p99: 34, acceptRate: 99.6, stratumUp: true,
    },
    fallback: {
      name: 'public-pool.io',
      series: Array.from({length: 60}, (_, i) => 14 + 4 * Math.sin(i / 4) + Math.random() * 3),
      current: 14, p50: 14, p95: 22, p99: 41, acceptRate: 99.3, stratumUp: true,
    },
  };

  // Earnings vs costs — 30 days
  const earnings30d = Array.from({length: 30}, (_, i) => {
    const day = 30 - i;
    const reward = 1.8 + 0.3 * Math.sin(i / 3) + 0.1 * (Math.random() - 0.5) + (i === 14 ? 1.2 : 0); // one lucky day
    const cost = 2.31 + 0.05 * Math.sin(i / 7);
    return { day, reward: +reward.toFixed(2), cost: +cost.toFixed(2) };
  });

  // Lucky factor histogram (10 buckets)
  const luckyBuckets = [
    { label: '0-20%',   count: 1 },
    { label: '20-40%',  count: 2 },
    { label: '40-60%',  count: 4 },
    { label: '60-80%',  count: 6 },
    { label: '80-100%', count: 8 },
    { label: '100-120%',count: 5 },   // current: 112
    { label: '120-140%',count: 3 },
    { label: '140-160%',count: 1 },
    { label: '160-180%',count: 0 },
    { label: '180%+',   count: 0 },
  ];

  const alertRules = [
    { id: 1, name: 'Device offline',          on: true,  cond: 'no heartbeat for', val: 5,  unit: 'min', sev: 'critical', chans: ['telegram','discord'] },
    { id: 2, name: 'High chip temperature',   on: true,  cond: 'chip temp >',       val: 70, unit: '°C',  sev: 'warning',  chans: ['telegram'] },
    { id: 3, name: 'High VR temperature',     on: true,  cond: 'VR temp >',         val: 68, unit: '°C',  sev: 'warning',  chans: ['telegram'] },
    { id: 4, name: 'Low hashrate',            on: true,  cond: 'hashrate <',        val: 85, unit: '% expected', sev: 'warning', chans: ['discord'] },
    { id: 5, name: 'High reject rate',        on: true,  cond: 'reject ratio >',    val: 3,  unit: '%',   sev: 'warning',  chans: ['telegram'] },
    { id: 6, name: 'Pool unreachable',        on: true,  cond: 'stratum down for',  val: 2,  unit: 'min', sev: 'critical', chans: ['telegram','discord','gotify'] },
    { id: 7, name: 'Best difficulty reached', on: false, cond: 'best diff >',       val: 1,  unit: 'G',   sev: 'info',     chans: ['discord'] },
    { id: 8, name: 'Weekly summary',          on: true,  cond: 'every',             val: 'Sunday 09:00', unit: '', sev: 'info', chans: ['telegram'] },
  ];

  const events30d = [
    { ts: '2026-04-23 14:28', sev: 'critical', msg: 'Axe-08 offline — last seen 14 min ago', src: 'axeos', device: 'Axe-08', resolved: false },
    { ts: '2026-04-23 14:17', sev: 'warning',  msg: 'NM-Delta chip temperature 72°C (threshold 70°C)', src: 'nmminer', device: 'NM-Delta', resolved: false },
    { ts: '2026-04-23 14:10', sev: 'warning',  msg: 'Axe-04 share error rate 4.2% over last 15 min', src: 'axeos', device: 'Axe-04', resolved: false },
    { ts: '2026-04-23 12:28', sev: 'info',     msg: 'Weekly summary sent to Telegram', src: 'system', device: null, resolved: true },
    { ts: '2026-04-23 10:28', sev: 'info',     msg: 'Fallback pool activated briefly on Axe-02', src: 'axeos', device: 'Axe-02', resolved: true },
    { ts: '2026-04-23 09:14', sev: 'warning',  msg: 'Axe-04 VR temp 69°C', src: 'axeos', device: 'Axe-04', resolved: true },
    { ts: '2026-04-23 04:02', sev: 'critical', msg: 'NEW BEST DIFF — Axe-03 hit 1.2G', src: 'axeos', device: 'Axe-03', resolved: true, good: true },
    { ts: '2026-04-22 22:41', sev: 'warning',  msg: 'NM-Bravo reject ratio 3.4% over 20 min', src: 'nmminer', device: 'NM-Bravo', resolved: true },
    { ts: '2026-04-22 18:10', sev: 'critical', msg: 'Stratum down on primary pool — 3:41 duration', src: 'system', device: null, resolved: true },
    { ts: '2026-04-22 11:05', sev: 'info',     msg: 'Firmware update available for BitAxe Ultra', src: 'system', device: null, resolved: false },
    { ts: '2026-04-21 15:32', sev: 'warning',  msg: 'Axe-06 temperature peaked at 71°C', src: 'axeos', device: 'Axe-06', resolved: true },
    { ts: '2026-04-21 09:15', sev: 'info',     msg: 'Weekly summary sent to Telegram', src: 'system', device: null, resolved: true },
  ];

  return { hr7d, hr24h, hr1h, shareDist, tempNames, tempHeatmap, poolLatency, earnings30d, luckyBuckets, alertRules, events30d };
})();

window.PROTO = PROTO;
