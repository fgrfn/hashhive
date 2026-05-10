import React, { useState, useEffect } from 'react';
import { useThemeStore } from '../store/theme';
import { Card, Label, Modal, FormField, EmptyState, SkeletonCard, btnStyle } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api } from '../api';
import type { Wallet } from '../api';
import { Wallet as WalletIcon, Plus, Copy, Eye, Edit3, Trash2, Check } from 'lucide-react';

const COIN_META: Record<string, { label: string; symbol: string; color: string }> = {
  BTC:  { label: 'Bitcoin',          symbol: '₿',    color: '#F7931A' },
  LN:   { label: 'Lightning',        symbol: '⚡',    color: '#792EE5' },
  LTC:  { label: 'Litecoin',         symbol: 'Ł',    color: '#BFBBBB' },
  DOGE: { label: 'Dogecoin',         symbol: 'Ð',    color: '#C3A634' },
  DGB:  { label: 'DigiByte',         symbol: 'DGB',  color: '#0066CC' },
  KAS:  { label: 'Kaspa',            symbol: 'KAS',  color: '#70C7BA' },
  XMR:  { label: 'Monero',           symbol: 'ɱ',    color: '#FF6600' },
  BCH:  { label: 'Bitcoin Cash',     symbol: 'BCH',  color: '#0AC18E' },
  ZEC:  { label: 'Zcash',            symbol: 'ZEC',  color: '#ECB244' },
  RVN:  { label: 'Ravencoin',        symbol: 'RVN',  color: '#384182' },
  ETC:  { label: 'Ethereum Classic', symbol: 'ETC',  color: '#328332' },
  DASH: { label: 'Dash',             symbol: 'DASH', color: '#008CE7' },
  ERG:  { label: 'Ergo',             symbol: 'ERG',  color: '#FF5E5B' },
  ALPH: { label: 'Alephium',         symbol: 'ALPH', color: '#1F6FFF' },
};

export function Wallets() {
  const { theme: t } = useThemeStore();
  const [fetched, setFetched] = useState(false);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [coinFilter, setCoinFilter] = useState('ALL');
  const [showAdd, setShowAdd] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    api.wallets.list().then(setWallets).catch(() => {}).finally(() => setFetched(true));
  }, []);

  const coins = ['ALL', ...Object.keys(COIN_META).filter(c => wallets.some(w => w.coin === c))];
  const visible = coinFilter === 'ALL' ? wallets : wallets.filter(w => w.coin === coinFilter);

  const addWallet = async (w: Partial<Wallet>) => {
    const created = await api.wallets.create(w).catch(() => null);
    if (created) setWallets(prev => [...prev, created]);
    setShowAdd(false);
  };

  const deleteWallet = async (id: string) => {
    await api.wallets.delete(id).catch(() => {});
    setWallets(wallets.filter(w => w.id !== id));
  };

  const copyAddress = (addr: string, id: string) => {
    navigator.clipboard.writeText(addr).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!fetched) {
    return (
      <div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} t={t} height={60} style={{ flex: 1 }} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))', gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} t={t} height={180} />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <KpiSm t={t} label="Wallets" value={String(wallets.length)} color={t.accent} />
        <KpiSm t={t} label="Last payout" value="—" color={t.success} />
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowAdd(true)} style={{ ...btnStyle(t, 'primary'), padding: '8px 12px' }}>
          <Plus size={13} /> Add wallet
        </button>
      </div>

      {/* Coin filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {coins.map(c => {
          const meta = COIN_META[c];
          const on = coinFilter === c;
          const count = c === 'ALL' ? wallets.length : wallets.filter(w => w.coin === c).length;
          return (
            <button key={c} onClick={() => setCoinFilter(c)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: `1px solid ${on ? (meta?.color || t.accent) : t.border}`, background: on ? (meta?.color || t.accent) + '22' : 'transparent', color: on ? (meta?.color || t.accent) : t.textMuted, cursor: 'pointer', fontFamily: FONT_MONO, transition: 'all .15s' }}>
              {c === 'ALL' ? `All (${count})` : `${meta.symbol} ${c} (${count})`}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState t={t} icon={<WalletIcon size={32} />} title="No wallets" detail="Add your first wallet to track payouts." action={<button onClick={() => setShowAdd(true)} style={btnStyle(t, 'primary')}>Add wallet</button>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))', gap: 12 }}>
          {visible.map(w => {
            const meta = COIN_META[w.coin] || { color: t.accent, symbol: w.coin, label: w.coin };
            return (
              <Card key={w.id} t={t}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: `${meta.color}22`, border: `1px solid ${meta.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontFamily: FONT_MONO, fontSize: meta.symbol.length > 2 ? 10 : 16, color: meta.color }}>
                    {meta.symbol}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{w.label}</span>
                      <span style={{ fontSize: 10, fontFamily: FONT_MONO, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}44` }}>{w.coin}</span>
                    </div>
                    {w.derivation && <div style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT_MONO, marginTop: 3 }}>{w.derivation}</div>}
                  </div>
                </div>
                <div style={{ padding: '9px 12px', background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 8, fontFamily: FONT_MONO, fontSize: 11, marginBottom: 12, wordBreak: 'break-all', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ flex: 1, lineHeight: 1.5 }}>{w.address}</span>
                  <button onClick={() => copyAddress(w.address, w.id)} style={{ ...btnStyle(t), padding: '4px 6px', flexShrink: 0 }}>
                    {copied === w.id ? <Check size={11} /> : <Copy size={11} />}
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  <div style={{ padding: '8px 10px', background: t.surface2, borderRadius: 8 }}>
                    <div style={{ fontSize: 9, color: t.textMuted, fontFamily: FONT_MONO, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Lifetime payout</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: meta.color, fontFamily: FONT_MONO, marginTop: 3 }}>
                      {(w.payoutTotal || 0) > 0 ? (w.payoutTotal || 0).toFixed(5) : '—'} {(w.payoutTotal || 0) > 0 && <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 400 }}>{w.coin}</span>}
                    </div>
                  </div>
                  <div style={{ padding: '8px 10px', background: t.surface2, borderRadius: 8 }}>
                    <div style={{ fontSize: 9, color: t.textMuted, fontFamily: FONT_MONO, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Last payout</div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3, color: w.lastPayout ? t.text : t.textDim }}>{w.lastPayout || '—'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={{ ...btnStyle(t), fontSize: 11 }}><Eye size={11} /> Explorer</button>
                  <button style={{ ...btnStyle(t), fontSize: 11 }}><Edit3 size={11} /> Rename</button>
                  <button onClick={() => deleteWallet(w.id)} style={{ ...btnStyle(t, 'danger'), fontSize: 11, marginLeft: 'auto' }}><Trash2 size={11} /> Remove</button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showAdd && <AddWalletModal t={t} onClose={() => setShowAdd(false)} onAdd={addWallet} />}
    </div>
  );
}

function KpiSm({ t, label, value, unit, color }: { t: Theme; label: string; value: string; unit?: string; color: string }) {
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 14px' }}>
      <Label t={t}>{label}</Label>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: FONT_MONO, marginTop: 4 }}>
        {value} {unit && <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 400 }}>{unit}</span>}
      </div>
    </div>
  );
}

function AddWalletModal({ t, onClose, onAdd }: { t: Theme; onClose: () => void; onAdd: (w: Partial<Wallet>) => void }) {
  const [coin, setCoin] = useState('BTC');
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [derivation] = useState('native segwit (bech32)');
  const valid = label.trim() && address.trim();
  const meta = COIN_META[coin] || { color: t.accent, symbol: coin, label: coin };

  return (
    <Modal t={t} title="Add wallet" onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <Label t={t} style={{ marginBottom: 8 }}>Coin</Label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(COIN_META).map(([c, m]) => (
              <button key={c} onClick={() => setCoin(c)} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, border: `1px solid ${coin === c ? m.color : t.border}`, background: coin === c ? m.color + '22' : 'transparent', color: coin === c ? m.color : t.textMuted, cursor: 'pointer', fontFamily: FONT_MONO }}>
                {m.symbol} {c}
              </button>
            ))}
          </div>
        </div>
        <FormField t={t} label="Label" value={label} onChange={setLabel} placeholder={`e.g. ${meta.label} main`} />
        <FormField t={t} label="Address" value={address} onChange={setAddress} mono placeholder={coin === 'BTC' ? 'bc1q...' : coin === 'LTC' ? 'ltc1q...' : `${coin.toLowerCase()} address`} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${t.border}` }}>
          <button onClick={onClose} style={btnStyle(t)}>Cancel</button>
          <button onClick={() => valid && onAdd({ coin, label, address, derivation })} disabled={!valid} style={{ ...btnStyle(t, 'primary'), opacity: valid ? 1 : 0.5 }}>
            <Plus size={13} /> Add wallet
          </button>
        </div>
      </div>
    </Modal>
  );
}
