// Extended data for new pages: groups, schedules, wallets, earnings.

const PROTO2 = (() => {
  const groups = [
    {
      id:'g-nm',  name:'NMMiner Swarm', color:'#a855f7',
      desc:'Solo lottery swarm — 5 NMMiner devices on solo.ckpool.org',
      devices:['NM-Alpha','NM-Bravo','NM-Charlie','NM-Delta','NM-Echo'],
      poolId:'p1', wallet:'bc1q...n9kr2h3vj.swarm',
      hr: 1596.6, online: 4, total: 5, power: 92, eff: 57.6, alerts: 1,
    },
    {
      id:'g-ax',  name:'BitAxe Fleet', color:'#38bdf8',
      desc:'Production BitAxe Ultra fleet, public-pool.io',
      devices:['Axe-01','Axe-02','Axe-04','Axe-05','Axe-07','Axe-08'],
      poolId:'p2', wallet:'bc1q...n9kr2h3vj.axefleet',
      hr: 1960.2, online: 4, total: 6, power: 73.5, eff: 37.5, alerts: 2,
    },
    {
      id:'g-na',  name:'NerdAxe', color:'#fbbf24',
      desc:'High-efficiency BM1370 lab pair',
      devices:['Axe-03','Axe-06'],
      poolId:'p2', wallet:'bc1q...n9kr2h3vj.axefleet',
      hr: 1232.9, online: 2, total: 2, power: 31.3, eff: 25.4, alerts: 0,
    },
    {
      id:'g-lab', name:'Lab Bench', color:'#34d399',
      desc:'Test bench — temporary devices, ignore in summary',
      devices:['Axe-05'],
      poolId:'p4', wallet:'nerdaxe.lab',
      hr: 0, online: 0, total: 1, power: 2.1, eff: 0, alerts: 0,
    },
  ];

  // Schedules — power & pool profiles applied on a clock
  const schedules = [
    {
      id:'s1', name:'Off-peak boost', enabled:true,
      desc:'Push power +12% during cheap-tariff hours',
      target:'BitAxe Fleet',
      window:'00:00 → 06:00 daily',
      action:'Set freq 525 MHz · core 1.20 V',
      lastRun:'today 06:00', nextRun:'tomorrow 00:00',
    },
    {
      id:'s2', name:'Quiet hours',  enabled:true,
      desc:'Reduce fan + freq while household is asleep',
      target:'NMMiner Swarm',
      window:'22:30 → 06:30 daily',
      action:'Fan auto · throttle to 92%',
      lastRun:'today 06:30', nextRun:'today 22:30',
    },
    {
      id:'s3', name:'Heatwave throttle', enabled:true,
      desc:'When NWS forecast > 32°C, lower power 20%',
      target:'All devices',
      window:'on demand · weather hook',
      action:'Power -20%',
      lastRun:'never', nextRun:'monitoring',
    },
    {
      id:'s4', name:'Weekly reboot', enabled:false,
      desc:'Restart devices Sunday 04:00 to clear state',
      target:'BitAxe Fleet · NerdAxe',
      window:'Sun 04:00 weekly',
      action:'Restart',
      lastRun:'Sun 04:00', nextRun:'paused',
    },
    {
      id:'s5', name:'Spot price gate', enabled:true,
      desc:'If €/kWh > 0.42, pause Lab Bench',
      target:'Lab Bench',
      window:'continuous · Awattar',
      action:'Pause',
      lastRun:'Apr 21 14:00', nextRun:'monitoring',
    },
  ];

  // Wallets
  const wallets = [
    {
      id:'w1', label:'Primary BTC', coin:'BTC',
      address:'bc1qxe7p4lzltqe3rk04qz0lmkk5fnj0v9rln9kr2h3vj',
      derivation:'native segwit',
      assigned:5, // groups using
      addedOn:'2025-08-14', lastPayout:'2026-04-12',
      payoutTotal: 0.04218,
    },
    {
      id:'w2', label:'AxeFleet', coin:'BTC',
      address:'bc1q9w8l2rdsk4hxnxa5kdtru4cjj8m4f56vqe7k1g',
      derivation:'native segwit',
      assigned:8,
      addedOn:'2025-09-02', lastPayout:'2026-04-12',
      payoutTotal: 0.03182,
    },
    {
      id:'w3', label:'Cold storage', coin:'BTC',
      address:'bc1qllr0n8u5w39wynmwedj5n9k7vh3pqxqvfqv8tu',
      derivation:'taproot',
      assigned:0,
      addedOn:'2024-12-19', lastPayout:'—',
      payoutTotal: 0,
    },
    {
      id:'w4', label:'Lightning sink', coin:'LN',
      address:'lnurl1dp68gurn8ghj7mrww4exctnrdakj7m...',
      derivation:'lnurl',
      assigned:1,
      addedOn:'2026-01-08', lastPayout:'2026-04-22',
      payoutTotal: 0.00164,
    },
  ];

  // Daily earnings — 60 days, BTC reward + USD value + electricity cost
  const earnings60d = Array.from({length:60}, (_, i) => {
    const day = 60 - i;
    const btcRewardSat = 1700 + 600*Math.sin(i/3.4) + (i===14 ? 95000 : 0) + 200*Math.cos(i*0.8);
    const btcReward = +(btcRewardSat / 1e8 * 1e5).toFixed(0); // expressed in 1e-5 BTC
    const usdReward = +(btcReward / 1e5 * 97842).toFixed(2);
    const usdCost = +(2.31 + 0.18*Math.sin(i/7) + 0.05*(Math.random()-0.5)).toFixed(2);
    return { day, btcReward: btcReward / 1e5, usdReward, usdCost, lucky: 90 + 25*Math.sin(i/2.4) };
  });

  // Payout history
  const payouts = [
    { ts:'2026-04-22 18:14', amount:0.00164, usd:160.42, wallet:'Lightning sink',  txid:'bolt11:lnbc164u1p3xy...',          source:'Axe-03 (NerdAxe lab)', kind:'block-or-bonus' },
    { ts:'2026-04-12 09:02', amount:0.00298, usd:291.59, wallet:'AxeFleet',         txid:'7e3a8b...c92f10',                  source:'public-pool · weekly', kind:'pool-payout' },
    { ts:'2026-04-12 09:02', amount:0.00412, usd:403.11, wallet:'Primary BTC',      txid:'a1f8d2...b3091c',                  source:'solo.ckpool · weekly', kind:'pool-payout' },
    { ts:'2026-04-04 16:31', amount:0.04812, usd:4707.81,wallet:'Primary BTC',      txid:'9c44e1...77beac',                  source:'SOLO BLOCK · 836 412', kind:'solo-block' },
    { ts:'2026-04-01 09:02', amount:0.00198, usd:193.73, wallet:'AxeFleet',         txid:'12bb44...ee8881',                  source:'public-pool · weekly', kind:'pool-payout' },
    { ts:'2026-03-25 09:02', amount:0.00271, usd:265.16, wallet:'AxeFleet',         txid:'c3eed0...9a2b18',                  source:'public-pool · weekly', kind:'pool-payout' },
    { ts:'2026-03-18 09:02', amount:0.00299, usd:292.55, wallet:'Primary BTC',      txid:'eef311...44cc20',                  source:'solo.ckpool · weekly', kind:'pool-payout' },
  ];

  return { groups, schedules, wallets, earnings60d, payouts };
})();

window.PROTO2 = PROTO2;
