// Wallets page — production version using real API data.

function WalletsPage({ t }) {
  const [wallets, setWallets] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [showAdd, setShowAdd] = React.useState(false);
  const [newWallet, setNewWallet] = React.useState({ label: '', address: '', coin: 'BTC' });

  const load = () => {
    setLoading(true);
    apiFetch('/api/wallets')
      .then(data => {
        setWallets(Array.isArray(data) ? data : (data.wallets || []));
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  };

  React.useEffect(() => { load(); }, []);

  const addWallet = () => {
    if (!newWallet.address.trim() || !newWallet.label.trim()) return;
    apiFetch('/api/wallets', { method: 'POST', body: JSON.stringify(newWallet) })
      .then(() => { setNewWallet({ label: '', address: '', coin: 'BTC' }); setShowAdd(false); load(); })
      .catch(() => {});
  };

  const deleteWallet = (id) => {
    apiFetch(`/api/wallets/${id}`, { method: 'DELETE' })
      .then(() => setWallets(wallets.filter(w => w.id !== id)))
      .catch(() => {});
  };

  const copyAddress = (addr) => {
    navigator.clipboard.writeText(addr).catch(() => {});
  };

  const total = wallets.reduce((a, w) => a + (w.payoutTotal || 0), 0);
  const lastPayout = wallets.map(w => w.lastPayout).filter(Boolean)[0] || '—';

  if (loading) return (
    <div style={{padding:60, textAlign:'center', color:t.textMuted}}>
      <Spinner t={t} size={20}/><div style={{marginTop:12}}>Loading wallets…</div>
    </div>
  );

  if (error) return (
    <div style={{padding:40, textAlign:'center', color:t.danger, fontSize:13}}>
      Failed to load wallets: {error}
      <div style={{marginTop:12}}><button onClick={load} style={{...protoBtn(t)}}>Retry</button></div>
    </div>
  );

  return (
    <div>
      <div style={{display:'flex', gap:12, marginBottom:14, flexWrap:'wrap', alignItems:'center'}}>
        <KpiSm t={t} label="Wallets" value={wallets.length} color={t.accent}/>
        {total > 0 && <KpiSm t={t} label="Lifetime payout" value={total.toFixed(5)} unit="BTC" color={t.honey}/>}
        {lastPayout !== '—' && <KpiSm t={t} label="Last payout" value={lastPayout} color={t.success}/>}
        <div style={{flex:1}}/>
        <button onClick={() => setShowAdd(v => !v)} style={{...protoBtn(t, 'primary'), padding:'8px 12px'}}>
          <Icons.plus size={13}/> Add wallet
        </button>
      </div>

      {showAdd && (
        <Card t={t} style={{marginBottom:14}}>
          <Label t={t} style={{marginBottom:12}}>Add wallet</Label>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:10, alignItems:'flex-end'}}>
            <FormField t={t} label="Label" value={newWallet.label} onChange={v => setNewWallet({...newWallet, label: v})}/>
            <FormField t={t} label="Coin" value={newWallet.coin} onChange={()=>{}} readOnly/>
            <div/>
          </div>
          <div style={{marginTop:10}}>
            <FormField t={t} label="Bitcoin address" value={newWallet.address} onChange={v => setNewWallet({...newWallet, address: v})} mono/>
          </div>
          <div style={{display:'flex', gap:8, marginTop:12}}>
            <button onClick={addWallet} style={{...protoBtn(t, 'primary')}}><Icons.check size={13}/> Add wallet</button>
            <button onClick={() => setShowAdd(false)} style={{...protoBtn(t)}}><Icons.x size={13}/> Cancel</button>
          </div>
        </Card>
      )}

      {wallets.length === 0 ? (
        <Card t={t}>
          <div style={{padding:48, textAlign:'center', color:t.textMuted}}>
            <div style={{fontSize:28, marginBottom:12}}>💰</div>
            <div style={{fontWeight:600, marginBottom:6}}>No wallets configured</div>
            <div style={{fontSize:12, color:t.textDim, marginBottom:16}}>
              Add your Bitcoin wallet address to track payouts and earnings.
            </div>
            <button onClick={() => setShowAdd(true)} style={{...protoBtn(t, 'primary')}}>
              <Icons.plus size={13}/> Add first wallet
            </button>
          </div>
        </Card>
      ) : (
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(440px, 1fr))', gap:12}}>
          {wallets.map(w => (
            <Card key={w.id} t={t}>
              <div style={{display:'flex', alignItems:'flex-start', gap:12, marginBottom:14}}>
                <div style={{width:36, height:36, borderRadius:8, background: w.coin === 'BTC' ? `${t.honey}22` : `${t.info}22`, border:`1px solid ${(w.coin === 'BTC' ? t.honey : t.info)}55`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontFamily:PROTO_MONO, fontSize:11, color: w.coin === 'BTC' ? t.honey : t.info}}>
                  {w.coin || 'BTC'}
                </div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex', alignItems:'baseline', gap:8}}>
                    <span style={{fontWeight:700, fontSize:15, letterSpacing:'-0.01em'}}>{w.label || 'Wallet'}</span>
                    {(w.assigned || 0) > 0 && <Pill t={t} sev="accent">{w.assigned} assigned</Pill>}
                    {(w.assigned || 0) === 0 && <Pill t={t} sev="muted">unused</Pill>}
                  </div>
                  {w.derivation && <div style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO, marginTop:2}}>{w.derivation} · {w.addedOn ? `added ${w.addedOn}` : ''}</div>}
                </div>
                <button onClick={() => { if (confirm(`Delete wallet "${w.label}"?`)) deleteWallet(w.id); }} style={{...protoBtn(t), padding:6}}><Icons.trash size={12}/></button>
              </div>

              <div style={{padding:'10px 12px', background:t.surface2, border:`1px solid ${t.border}`, borderRadius:8, fontFamily:PROTO_MONO, fontSize:11, color:t.text, marginBottom:12, wordBreak:'break-all', display:'flex', alignItems:'center', gap:8}}>
                <span style={{flex:1}}>{w.address}</span>
                <button onClick={() => copyAddress(w.address)} style={{...protoBtn(t), padding:5, flexShrink:0}}><Icons.copy size={11}/></button>
              </div>

              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
                <Stat t={t} label="Lifetime" value={(w.payoutTotal || 0) > 0 ? (w.payoutTotal).toFixed(5) : '—'} unit={(w.payoutTotal || 0) > 0 ? 'BTC' : ''} color={t.honey}/>
                <Stat t={t} label="Last payout" value={w.lastPayout || '—'} color={t.text}/>
              </div>

              <div style={{display:'flex', gap:6, marginTop:12, flexWrap:'wrap'}}>
                {w.address && (
                  <a href={`https://mempool.space/address/${w.address}`} target="_blank" rel="noopener"
                    style={{...protoBtn(t), fontSize:11, fontFamily:PROTO_MONO, textDecoration:'none', display:'flex', alignItems:'center', gap:4}}>
                    <Icons.eye size={11}/> View on explorer
                  </a>
                )}
                <button style={{...protoBtn(t), fontSize:11, fontFamily:PROTO_MONO}}><Icons.edit size={11}/> Rename</button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

window.WalletsPage = WalletsPage;
