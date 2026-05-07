// Earnings page — production version using real API data.

function EarningsPage({ t }) {
  const [range, setRange] = React.useState('30d');
  const [allData, setAllData] = React.useState([]);
  const [payouts, setPayouts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    setLoading(true);
    apiFetch('/api/earnings?days=30')
      .then(data => {
        const rows = Array.isArray(data) ? data : (data.earnings || data.data || []);
        setAllData(rows);
        setPayouts(data.payouts || []);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const data = React.useMemo(() => {
    if (range === '7d')  return allData.slice(-7);
    if (range === '30d') return allData.slice(-30);
    return allData;
  }, [allData, range]);

  if (loading) return (
    <div style={{padding:60, textAlign:'center', color:t.textMuted}}>
      <Spinner t={t} size={20}/><div style={{marginTop:12}}>Loading earnings…</div>
    </div>
  );

  if (error) return (
    <div style={{padding:40, textAlign:'center', color:t.danger, fontSize:13}}>
      Failed to load earnings: {error}
    </div>
  );

  if (allData.length === 0) return (
    <div>
      <div style={{display:'flex', gap:12, marginBottom:14, alignItems:'center'}}>
        <div style={{flex:1}}/>
        <Segmented t={t} value={range} onChange={setRange} options={[{value:'7d',label:'7d'},{value:'30d',label:'30d'}]}/>
        <button style={{...protoBtn(t), fontFamily:PROTO_MONO}}><Icons.download size={12}/> Export CSV</button>
      </div>
      <Card t={t}>
        <div style={{padding:60, textAlign:'center', color:t.textMuted}}>
          <div style={{fontSize:28, marginBottom:12}}>📈</div>
          <div style={{fontWeight:600, marginBottom:6}}>No earnings data yet</div>
          <div style={{fontSize:12, color:t.textDim}}>
            Earnings will appear here once your miners start submitting shares.
          </div>
        </div>
      </Card>
    </div>
  );

  // API returns: {date, hashrate_gh, power_wh, cost_eur, shares, revenue_eur}
  // or {date, btcReward, usdReward, usdCost, lucky}
  // Normalize to a common shape
  const normalize = (d) => ({
    date: d.date,
    reward: parseFloat(d.revenue_eur ?? d.usdReward ?? 0),
    cost:   parseFloat(d.cost_eur   ?? d.usdCost   ?? 0),
    btc:    parseFloat(d.btcReward  ?? 0),
    hr:     parseFloat(d.hashrate_gh ?? d.hr ?? 0),
    lucky:  parseFloat(d.lucky ?? 0),
  });

  const norm = data.map(normalize);
  const totalReward = norm.reduce((a, d) => a + d.reward, 0);
  const totalCost   = norm.reduce((a, d) => a + d.cost, 0);
  const totalBtc    = norm.reduce((a, d) => a + d.btc, 0);
  const profit      = totalReward - totalCost;
  const days        = norm.length || 1;
  const avgLucky    = norm.reduce((a, d) => a + d.lucky, 0) / days;

  const currency = '€';

  return (
    <div>
      <div style={{display:'flex', gap:12, marginBottom:14, flexWrap:'wrap', alignItems:'center'}}>
        {totalBtc > 0 && <KpiSm t={t} label="Earned" value={totalBtc.toFixed(5)} unit="BTC" color={t.honey}/>}
        <KpiSm t={t} label="Revenue" value={`${currency}${totalReward.toFixed(0)}`} color={t.success}/>
        <KpiSm t={t} label="Electricity" value={`${currency}${totalCost.toFixed(0)}`} color={t.danger}/>
        <KpiSm t={t} label="Net" value={`${profit>=0?'+':''}${currency}${profit.toFixed(0)}`} color={profit >= 0 ? t.success : t.danger}/>
        {avgLucky > 0 && <KpiSm t={t} label="Avg lucky" value={avgLucky.toFixed(0)} unit="%" color={t.accent}/>}
        <div style={{flex:1}}/>
        <Segmented t={t} value={range} onChange={setRange} options={[{value:'7d',label:'7d'},{value:'30d',label:'30d'}]}/>
        <button style={{...protoBtn(t), fontFamily:PROTO_MONO}}><Icons.download size={12}/> Export CSV</button>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:14, marginBottom:14}}>
        <Card t={t}>
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:12}}>
            <Label t={t}>Revenue vs cost · {range}</Label>
            <div style={{display:'flex', gap:14, fontSize:11, fontFamily:PROTO_MONO}}>
              <span style={{display:'flex', alignItems:'center', gap:5}}><span style={{width:10, height:2, background:t.success}}/> Revenue</span>
              <span style={{display:'flex', alignItems:'center', gap:5}}><span style={{width:10, height:2, background:t.danger}}/> Cost</span>
            </div>
          </div>
          <DualLineChart t={t} h={220}
            series={[norm.map(d => d.reward), norm.map(d => d.cost)]}
            colors={[t.success, t.danger]}
            labels={[`Revenue ${currency}`, `Cost ${currency}`]}/>
        </Card>
        <Card t={t}>
          <Label t={t} style={{marginBottom:12}}>Profitability</Label>
          <div style={{display:'flex', flexDirection:'column', gap:10, fontSize:13}}>
            <Row k="Revenue / day" v={`${currency}${(totalReward/days).toFixed(2)}`} t={t} mono/>
            <Row k="Cost / day"    v={`${currency}${(totalCost/days).toFixed(2)}`} t={t} mono/>
            <Row k="Margin %"      v={totalReward > 0 ? `${((profit/totalReward)*100).toFixed(1)} %` : '—'} t={t} mono/>
            {avgLucky > 0 && <Row k="Lucky factor" v={`${avgLucky.toFixed(0)}%`} t={t} mono/>}
          </div>
        </Card>
      </div>

      {/* Daily reward bars */}
      <Card t={t} style={{marginBottom:14}}>
        <Label t={t} style={{marginBottom:10}}>Daily revenue</Label>
        {norm.length > 0 ? (
          <>
            <div style={{display:'flex', alignItems:'flex-end', gap:2, height:120}}>
              {norm.map((d, i) => {
                const max = Math.max(...norm.map(x => x.reward), 0.001);
                const h = max > 0 ? (d.reward / max) * 100 : 0;
                return (
                  <div key={i} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3, cursor:'pointer'}} title={`${d.date}: ${currency}${d.reward.toFixed(2)}`}>
                    <div style={{width:'100%', height:`${h}%`, background: d.reward === Math.max(...norm.map(x => x.reward)) ? t.honey : t.accent, opacity:0.85, borderRadius:'2px 2px 0 0', minHeight: d.reward > 0 ? 2 : 0}}/>
                  </div>
                );
              })}
            </div>
            <div style={{display:'flex', justifyContent:'space-between', marginTop:6, fontSize:9, fontFamily:PROTO_MONO, color:t.textDim}}>
              <span>{days}d ago</span><span>now</span>
            </div>
          </>
        ) : (
          <div style={{padding:24, textAlign:'center', color:t.textMuted, fontSize:12}}>No daily data available.</div>
        )}
      </Card>

      {/* Payout history */}
      <Card t={t} noPad>
        <div style={{padding:'12px 18px', borderBottom:`1px solid ${t.border}`, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <Label t={t}>Payout history</Label>
          <span style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO}}>{payouts.length} payouts</span>
        </div>
        {payouts.length === 0 ? (
          <div style={{padding:32, textAlign:'center', color:t.textMuted, fontSize:13}}>No payouts recorded yet.</div>
        ) : (
          <>
            <div style={{display:'grid', gridTemplateColumns:'1.2fr 1fr 1fr 1.2fr 1.6fr 0.8fr', gap:12, padding:'10px 18px', background:t.surface2, borderBottom:`1px solid ${t.border}`, fontSize:10, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:PROTO_MONO, fontWeight:600}}>
              <span>Time</span><span>Amount BTC</span><span>Value</span><span>Wallet</span><span>Source / TXID</span><span>Kind</span>
            </div>
            {payouts.map((p, i) => (
              <div key={i} style={{display:'grid', gridTemplateColumns:'1.2fr 1fr 1fr 1.2fr 1.6fr 0.8fr', gap:12, padding:'12px 18px', borderBottom: i === payouts.length-1 ? 'none' : `1px solid ${t.border}`, fontSize:12, fontFamily:PROTO_MONO, alignItems:'center'}}>
                <span style={{color:t.textMuted}}>{p.ts || p.timestamp || '—'}</span>
                <span style={{fontWeight:600, color:t.honey}}>{(p.amount || p.btc || 0).toFixed(5)}</span>
                <span style={{color:t.success}}>{currency}{(p.usd || p.eur || 0).toFixed(2)}</span>
                <span>{p.wallet || '—'}</span>
                <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                  <span style={{color:t.text}}>{p.source || '—'}</span>
                  {p.txid && <span style={{color:t.textDim, marginLeft:6, fontSize:11}}>{p.txid.slice(0,16)}…</span>}
                </span>
                <Pill t={t} sev={p.kind === 'solo-block' ? 'honey' : p.kind === 'pool-payout' ? 'accent' : 'info'}>{(p.kind || 'payout').replace('-', ' ')}</Pill>
              </div>
            ))}
          </>
        )}
      </Card>
    </div>
  );
}

window.EarningsPage = EarningsPage;
