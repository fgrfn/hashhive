import React, { useState, useEffect } from 'react';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, Pill, Toggle, Modal, FormField, EmptyState, SkeletonCard, btnStyle } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api } from '../api';
import type { PoolPreset } from '../api';
import { Database, Plus, Edit, Trash2, Send, Check } from 'lucide-react';
import { toast } from '../store/toast';

export function Pool() {
  const { theme: t } = useThemeStore();
  const [tab, setTab] = useState('library');

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: `1px solid ${t.border}`, marginBottom: 16 }}>
        {[['library', 'Pool library'], ['assignments', 'Miner assignments']].map(([id, label]) => (
          <div key={id} onClick={() => setTab(id)} style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: tab === id ? t.accent : t.textMuted, borderBottom: tab === id ? `2px solid ${t.accent}` : '2px solid transparent', marginBottom: -1 }}>
            {label}
          </div>
        ))}
      </div>
      {tab === 'library' && <PoolLibrary />}
      {tab === 'assignments' && <MinerAssignments />}
    </div>
  );
}

function PoolLibrary() {
  const { theme: t } = useThemeStore();
  const [fetched, setFetched] = useState(false);
  const [pools, setPools] = useState<PoolPreset[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<PoolPreset | null>(null);

  useEffect(() => {
    api.pools.list().then(setPools).catch(() => {}).finally(() => setFetched(true));
  }, []);

  const deletePool = async (id: string) => {
    const ok = await api.pools.delete(id).then(() => true).catch(() => false);
    if (ok) { setPools(pools.filter(p => p.id !== id)); toast('Pool deleted'); }
    else toast('Failed to delete pool', 'error');
  };

  const savePool = async (data: Partial<PoolPreset>) => {
    if (editing) {
      const updated = await api.pools.update(editing.id, data).catch(() => null);
      if (updated) { setPools(pools.map(p => p.id === editing.id ? updated : p)); toast('Pool updated'); }
      else toast('Failed to update pool', 'error');
    } else {
      const created = await api.pools.create(data).catch(() => null);
      if (created) { setPools(prev => [...prev, created]); toast('Pool created'); }
      else toast('Failed to create pool', 'error');
    }
    setShowAdd(false);
    setEditing(null);
  };

  if (!fetched) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} t={t} height={180} />)}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 14, color: t.textMuted }}>{pools.length} pool preset{pools.length !== 1 ? 's' : ''}</div>
        <button onClick={() => setShowAdd(true)} style={{ ...btnStyle(t, 'primary'), padding: '8px 12px' }}>
          <Plus size={13} /> New pool
        </button>
      </div>

      {pools.length === 0 ? (
        <EmptyState t={t} icon={<Database size={32} />} title="No pools" detail="Add pool presets to quickly assign them to miners or groups." action={<button onClick={() => setShowAdd(true)} style={btnStyle(t, 'primary')}><Plus size={13} /> New pool</button>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
          {pools.map(p => (
            <PoolCard key={p.id} t={t} pool={p} onEdit={() => setEditing(p)} onDelete={() => deletePool(p.id)} />
          ))}
        </div>
      )}

      {(showAdd || editing) && (
        <PoolModal t={t} pool={editing} onClose={() => { setShowAdd(false); setEditing(null); }} onSave={savePool} />
      )}
    </div>
  );
}

function PoolCard({ t, pool: p, onEdit, onDelete }: { t: Theme; pool: PoolPreset; onEdit: () => void; onDelete: () => void }) {
  const wallet = p.wallet || p.worker || '—';
  return (
    <Card t={t}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 38, height: 38, borderRadius: 8, background: `${t.accent}22`, border: `1px solid ${t.accent}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Database size={16} color={t.accent} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
          {p.coin && <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{p.coin}</div>}
        </div>
        {p.is_default && <Pill t={t} sev="success">default</Pill>}
      </div>

      <div style={{ padding: '10px 12px', background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontFamily: FONT_MONO, color: t.accent, wordBreak: 'break-all' }}>{p.url}</div>
        <div style={{ fontSize: 11, fontFamily: FONT_MONO, color: t.textMuted, marginTop: 4, wordBreak: 'break-all' }}>
          Wallet: {wallet}
        </div>
        <div style={{ fontSize: 10, color: t.textDim, marginTop: 2, fontStyle: 'italic' }}>Worker → {wallet === '—' ? '—' : `${wallet}.hostname`}</div>
        {p.url2 && <div style={{ fontSize: 11, fontFamily: FONT_MONO, color: t.textDim, marginTop: 6, borderTop: `1px solid ${t.border}`, paddingTop: 6 }}>Backup: {p.url2}</div>}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onEdit} style={{ ...btnStyle(t), fontSize: 11 }}><Edit size={11} /> Edit</button>
        <button style={{ ...btnStyle(t), fontSize: 11 }}><Send size={11} /> Push to miners</button>
        <button onClick={onDelete} style={{ ...btnStyle(t, 'danger'), fontSize: 11, marginLeft: 'auto' }}><Trash2 size={11} /></button>
      </div>
    </Card>
  );
}

function parseUrlPort(full: string): { base: string; port: string } {
  const m = full.match(/^(.*):(\d+)$/);
  return m ? { base: m[1], port: m[2] } : { base: full, port: '' };
}

function PoolSection({ t, label, base, port, wallet, password, onBase, onPort, onWallet, onPassword, optional }: {
  t: Theme; label: string; base: string; port: string; wallet: string; password: string;
  onBase: (v: string) => void; onPort: (v: string) => void; onWallet: (v: string) => void; onPassword: (v: string) => void;
  optional?: boolean;
}) {
  return (
    <div style={{ padding: '12px 14px', background: t.surface2, borderRadius: 8, border: `1px solid ${t.border}` }}>
      <Label t={t} style={{ marginBottom: 10 }}>{label}{optional && <span style={{ color: t.textDim, fontWeight: 400, marginLeft: 6 }}>(optional)</span>}</Label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8 }}>
          <FormField t={t} label="Host" value={base} onChange={onBase} mono placeholder="stratum+tcp://pool.example.com" />
          <FormField t={t} label="Port" value={port} onChange={onPort} mono placeholder="3333" type="number" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <FormField t={t} label="Wallet address" value={wallet} onChange={onWallet} mono placeholder="bc1q… or username" />
            {wallet && (
              <div style={{ fontSize: 10, color: t.textDim, fontFamily: FONT_MONO, marginTop: 4 }}>
                Worker → {wallet}.<em>hostname</em>
              </div>
            )}
          </div>
          <FormField t={t} label="Password" value={password} onChange={onPassword} mono placeholder="x" />
        </div>
      </div>
    </div>
  );
}

function PoolModal({ t, pool, onClose, onSave }: { t: Theme; pool: PoolPreset | null; onClose: () => void; onSave: (data: Partial<PoolPreset>) => void }) {
  const p1 = parseUrlPort(pool?.url || '');
  const p2 = parseUrlPort(pool?.url2 || '');
  const [name, setName] = useState(pool?.name || '');
  const [base, setBase] = useState(p1.base);
  const [port, setPort] = useState(p1.port);
  const [wallet, setWallet] = useState(pool?.wallet || pool?.worker || '');
  const [password, setPassword] = useState(pool?.password || 'x');
  const [base2, setBase2] = useState(p2.base);
  const [port2, setPort2] = useState(p2.port);
  const [wallet2, setWallet2] = useState(pool?.wallet2 || pool?.worker2 || '');
  const [password2, setPassword2] = useState(pool?.password2 || 'x');
  const [coin, setCoin] = useState(pool?.coin || 'BTC');
  const [isDefault, setIsDefault] = useState(pool?.is_default || false);

  const buildUrl = (b: string, p: string) => b ? (p ? `${b}:${p}` : b) : '';
  const valid = name.trim() && base.trim();

  return (
    <Modal t={t} title={pool ? 'Edit pool' : 'New pool'} onClose={onClose} width={540}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField t={t} label="Name" value={name} onChange={setName} placeholder="e.g. Ocean.xyz main" />
          <FormField t={t} label="Coin" value={coin} onChange={setCoin} placeholder="BTC" mono />
        </div>

        <PoolSection t={t} label="Primary pool"
          base={base} port={port} wallet={wallet} password={password}
          onBase={setBase} onPort={setPort} onWallet={setWallet} onPassword={setPassword} />

        <PoolSection t={t} label="Backup pool" optional
          base={base2} port={port2} wallet={wallet2} password={password2}
          onBase={setBase2} onPort={setPort2} onWallet={setWallet2} onPassword={setPassword2} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Toggle t={t} on={isDefault} onChange={setIsDefault} />
          <span style={{ fontSize: 13, color: t.textMuted }}>Set as default pool</span>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${t.border}` }}>
          <button onClick={onClose} style={btnStyle(t)}>Cancel</button>
          <button
            onClick={() => valid && onSave({ name, coin, is_default: isDefault, url: buildUrl(base, port), wallet, password, url2: buildUrl(base2, port2), wallet2, password2 })}
            disabled={!valid} style={{ ...btnStyle(t, 'primary'), opacity: valid ? 1 : 0.5 }}>
            {pool ? 'Save changes' : <><Plus size={13} /> Add pool</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function MinerAssignments() {
  const { theme: t } = useThemeStore();
  const { devices, axeDevices } = useAppStore();
  const [pools, setPools] = useState<PoolPreset[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [pushing, setPushing] = useState<Set<string>>(new Set());
  const [pushed, setPushed] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.pools.list().then(setPools).catch(() => {});
  }, []);

  const allDevices = [
    ...devices.map(d => ({ ip: d.ip || '', name: d.name || d.hostname || d.ip || '', type: 'nmminer' as const, status: d.status || 'online' })),
    ...axeDevices.map(d => ({ ip: d._ip || '', name: d._name || d.hostname || d._ip || '', type: 'axeos' as const, status: d.status || 'offline' })),
  ];

  const pushToDevice = async (ip: string) => {
    const poolId = assignments[ip];
    if (!poolId) return;
    const pool = pools.find(p => p.id === poolId);
    if (!pool) return;
    setPushing(prev => new Set(prev).add(ip));
    await api.pools.pushToDevice(ip, pool).catch(() => {});
    setPushing(prev => { const s = new Set(prev); s.delete(ip); return s; });
    setPushed(prev => new Set(prev).add(ip));
    setTimeout(() => setPushed(prev => { const s = new Set(prev); s.delete(ip); return s; }), 3000);
  };

  return (
    <div>
      <div style={{ fontSize: 14, color: t.textMuted, marginBottom: 14 }}>{allDevices.length} devices · assign pool presets and push</div>
      <Card t={t} noPad>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 80px 1fr auto', gap: 12, padding: '10px 16px', background: t.surface2, borderBottom: `1px solid ${t.border}`, fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT_MONO, fontWeight: 600 }}>
          <span>Device</span><span>Type</span><span>Pool preset</span><span>Action</span>
        </div>
        {allDevices.length === 0 ? (
          <div style={{ padding: '24px 18px', color: t.textMuted, fontSize: 13 }}>No devices found.</div>
        ) : allDevices.map((d, i) => (
          <div key={d.ip || i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 80px 1fr auto', gap: 12, padding: '12px 16px', borderBottom: i === allDevices.length - 1 ? 'none' : `1px solid ${t.border}`, alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
              <div style={{ fontSize: 10, fontFamily: FONT_MONO, color: t.textMuted }}>{d.ip}</div>
            </div>
            <Pill t={t} sev={d.type === 'nmminer' ? 'info' : 'success'}>{d.type}</Pill>
            <select
              value={assignments[d.ip] || ''}
              onChange={e => setAssignments(prev => ({ ...prev, [d.ip]: e.target.value }))}
              style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.surface2, color: t.text, fontSize: 12, fontFamily: FONT_MONO, cursor: 'pointer' }}
            >
              <option value="">— Select pool —</option>
              {pools.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button
              onClick={() => pushToDevice(d.ip)}
              disabled={!assignments[d.ip] || pushing.has(d.ip)}
              style={{ ...btnStyle(t, pushed.has(d.ip) ? 'honey' : 'primary'), fontSize: 11, opacity: assignments[d.ip] ? 1 : 0.4, minWidth: 70 }}
            >
              {pushed.has(d.ip) ? <><Check size={11} /> Pushed</> : pushing.has(d.ip) ? 'Pushing…' : <><Send size={11} /> Push</>}
            </button>
          </div>
        ))}
      </Card>
    </div>
  );
}
