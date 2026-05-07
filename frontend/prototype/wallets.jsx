// Wallets page — payout addresses

function WalletsPage({ t }) {
  const wallets = PROTO2.wallets;
  const total = wallets.reduce((a, w) => a + w.payoutTotal, 0);

  return (
    <div>
      <div style={{display:'flex', gap:12, marginBottom:14, flexWrap:'wrap', alignItems:'center'}}>
        <KpiSm t={t} label="Wallets" value={wallets.length} color={t.accent}/>
        <KpiSm t={t} label="Lifetime payout" value={total.toFixed(5)} unit="BTC" color={t.honey}/>
        <KpiSm t={t} label="Last payout" value="3d ago" color={t.success}/>
        <div style={{flex:1}}/>
        <button style={{...protoBtn(t), fontFamily:PROTO_MONO}}><Icons.download size={12}/> Verify all</button>
        <button style={{...protoBtn(t, 'primary'), padding:'8px 12px'}}><Icons.plus size={13}/> Add wallet</button>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(440px, 1fr))', gap:12}}>
        {wallets.map(w => (
          <Card key={w.id} t={t}>
            <div style={{display:'flex', alignItems:'flex-start', gap:12, marginBottom:14}}>
              <div style={{width:36, height:36, borderRadius:8, background:w.coin === 'BTC' ? `${t.honey}22` : `${t.info}22`, border:`1px solid ${(w.coin === 'BTC' ? t.honey : t.info)}55`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontFamily:PROTO_MONO, fontSize:11, color: w.coin === 'BTC' ? t.honey : t.info}}>
                {w.coin}
              </div>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', alignItems:'baseline', gap:8}}>
                  <span style={{fontWeight:700, fontSize:15, letterSpacing:'-0.01em'}}>{w.label}</span>
                  {w.assigned > 0 && <Pill t={t} sev="accent">{w.assigned} assigned</Pill>}
                  {w.assigned === 0 && <Pill t={t} sev="muted">unused</Pill>}
                </div>
                <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO, marginTop:2}}>{w.derivation} · added {w.addedOn}</div>
              </div>
              <button style={{...protoBtn(t), padding:6}}><Icons.more size={12}/></button>
            </div>

            <div style={{padding:'10px 12px', background:t.surface2, border:`1px solid ${t.border}`, borderRadius:8, fontFamily:PROTO_MONO, fontSize:11, color:t.text, marginBottom:12, wordBreak:'break-all', display:'flex', alignItems:'center', gap:8}}>
              <span style={{flex:1}}>{w.address}</span>
              <button style={{...protoBtn(t), padding:5, flexShrink:0}}><Icons.copy size={11}/></button>
            </div>

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
              <Stat t={t} label="Lifetime" value={w.payoutTotal > 0 ? w.payoutTotal.toFixed(5) : '—'} unit="BTC" color={t.honey}/>
              <Stat t={t} label="Last payout" value={w.lastPayout} color={t.text}/>
            </div>

            <div style={{display:'flex', gap:6, marginTop:12, flexWrap:'wrap'}}>
              <button style={{...protoBtn(t), fontSize:11, fontFamily:PROTO_MONO}}><Icons.eye size={11}/> View on explorer</button>
              <button style={{...protoBtn(t), fontSize:11, fontFamily:PROTO_MONO}}><Icons.edit size={11}/> Rename</button>
              {w.assigned === 0 && <button style={{...protoBtn(t, 'danger'), fontSize:11, fontFamily:PROTO_MONO}}><Icons.trash size={11}/> Remove</button>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

window.WalletsPage = WalletsPage;
