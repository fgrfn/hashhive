// Earnings page — rewards, profitability, payout history

function EarningsPage({ t }) {
  const [range, setRange] = React.useState('30d');
  const all = PROTO2.earnings60d;
  const data = range === '60d' ? all : range === '7d' ? all.slice(-7) : all.slice(-30);

  const totalBtc = data.reduce((a,d) => a + d.btcReward, 0);
  const totalUsd = data.reduce((a,d) => a + d.usdReward, 0);
  const totalCost = data.reduce((a,d) => a + d.usdCost, 0);
  const profit = totalUsd - totalCost;
  const days = data.length;

  return (
    <div>
      <div style={{display:'flex', gap:12, marginBottom:14, flexWrap:'wrap', alignItems:'center'}}>
        <KpiSm t={t} label="Earned" value={totalBtc.toFixed(5)} unit="BTC" color={t.honey}/>
        <KpiSm t={t} label="Earned (USD)" value={`$${totalUsd.toFixed(0)}`} color={t.success}/>
        <KpiSm t={t} label="Electricity" value={`$${totalCost.toFixed(0)}`} color={t.danger}/>
        <KpiSm t={t} label="Net" value={`${profit>=0 ? '+' : ''}$${profit.toFixed(0)}`} color={profit >= 0 ? t.success : t.danger}/>
        <KpiSm t={t} label="Avg lucky" value={(data.reduce((a,d)=>a+d.lucky,0)/days).toFixed(0)} unit="%" color={t.accent}/>
        <div style={{flex:1}}/>
        <Segmented t={t} value={range} onChange={setRange} options={[{value:'7d',label:'7d'},{value:'30d',label:'30d'},{value:'60d',label:'60d'}]}/>
        <button style={{...protoBtn(t), fontFamily:PROTO_MONO}}><Icons.download size={12}/> Export CSV</button>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:14, marginBottom:14}}>
        <Card t={t}>
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:12}}>
            <Label t={t}>Reward vs cost · {range}</Label>
            <div style={{display:'flex', gap:14, fontSize:11, fontFamily:PROTO_MONO}}>
              <span style={{display:'flex', alignItems:'center', gap:5}}><span style={{width:10, height:2, background:t.success}}/> Reward USD</span>
              <span style={{display:'flex', alignItems:'center', gap:5}}><span style={{width:10, height:2, background:t.danger}}/> Cost</span>
            </div>
          </div>
          <DualLineChart t={t} h={220}
            seriesA={data.map(d => d.usdReward)} colorA={t.success}
            seriesB={data.map(d => d.usdCost)} colorB={t.danger}
            unit="$"/>
        </Card>
        <Card t={t}>
          <Label t={t} style={{marginBottom:12}}>Profitability gauge</Label>
          <div style={{display:'flex', flexDirection:'column', gap:10, fontSize:13}}>
            <Row k="Reward / day (avg)" v={`$${(totalUsd/days).toFixed(2)}`} t={t} mono/>
            <Row k="Cost / day (avg)" v={`$${(totalCost/days).toFixed(2)}`} t={t} mono/>
            <Row k="Margin %" v={`${((profit/totalUsd)*100).toFixed(1)} %`} t={t} mono/>
            <Row k="Break-even price" v="$72,400" t={t} mono/>
            <Row k="Lucky factor" v="112%" t={t} mono/>
            <Row k="Solo blocks (60d)" v="1" t={t} mono/>
          </div>
          <div style={{marginTop:14, padding:'10px 12px', background:t.accentGlow, border:`1px solid ${t.accent}55`, borderRadius:8, fontSize:11, color:t.text, lineHeight:1.5}}>
            <strong style={{color:t.accent}}>Solo bonus</strong> · Apr 4 — Axe-03 hit a block at height 836,412 worth ≈ <strong>$4,707</strong>.
          </div>
        </Card>
      </div>

      {/* Daily rewards bar */}
      <Card t={t} style={{marginBottom:14}}>
        <Label t={t} style={{marginBottom:10}}>Daily BTC reward</Label>
        <div style={{display:'flex', alignItems:'flex-end', gap:2, height:120}}>
          {data.map((d, i) => {
            const max = Math.max(...data.map(x => x.btcReward));
            const h = (d.btcReward / max) * 100;
            const isLucky = d.btcReward / max > 0.85;
            return (
              <div key={i} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3, cursor:'pointer'}} title={`Day -${d.day}: ${d.btcReward.toFixed(5)} BTC ($${d.usdReward.toFixed(2)})`}>
                <div style={{width:'100%', height:`${h}%`, background: isLucky ? t.honey : t.accent, opacity: 0.85, borderRadius:'2px 2px 0 0'}}/>
              </div>
            );
          })}
        </div>
        <div style={{display:'flex', justifyContent:'space-between', marginTop:6, fontSize:9, fontFamily:PROTO_MONO, color:t.textDim}}>
          <span>{days}d ago</span><span>now</span>
        </div>
      </Card>

      {/* Payout history */}
      <Card t={t} noPad>
        <div style={{padding:'12px 18px', borderBottom:`1px solid ${t.border}`, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <Label t={t}>Payout history</Label>
          <span style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO}}>{PROTO2.payouts.length} payouts</span>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1.2fr 1fr 1fr 1.2fr 1.6fr 0.8fr', gap:12, padding:'10px 18px', background:t.surface2, borderBottom:`1px solid ${t.border}`, fontSize:10, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:PROTO_MONO, fontWeight:600}}>
          <span>Time</span><span>Amount BTC</span><span>USD</span><span>Wallet</span><span>Source / TXID</span><span>Kind</span>
        </div>
        {PROTO2.payouts.map((p, i) => (
          <div key={i} style={{display:'grid', gridTemplateColumns:'1.2fr 1fr 1fr 1.2fr 1.6fr 0.8fr', gap:12, padding:'12px 18px', borderBottom: i === PROTO2.payouts.length-1 ? 'none' : `1px solid ${t.border}`, fontSize:12, fontFamily:PROTO_MONO, alignItems:'center'}}>
            <span style={{color:t.textMuted}}>{p.ts}</span>
            <span style={{fontWeight:600, color:t.honey}}>{p.amount.toFixed(5)}</span>
            <span style={{color:t.success}}>${p.usd.toFixed(2)}</span>
            <span>{p.wallet}</span>
            <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
              <span style={{color:t.text}}>{p.source}</span>
              <span style={{color:t.textDim, marginLeft:6, fontSize:11}}>{p.txid}</span>
            </span>
            <Pill t={t} sev={p.kind === 'solo-block' ? 'honey' : p.kind === 'pool-payout' ? 'accent' : 'info'}>{p.kind.replace('-', ' ')}</Pill>
          </div>
        ))}
      </Card>
    </div>
  );
}

window.EarningsPage = EarningsPage;
