import React, { useState, useEffect } from 'react';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, Pill, Toggle, Modal, FormField, EmptyState, SkeletonCard, useLoading, btnStyle } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api } from '../api';
import type { PoolPreset } from '../api';
import { Database, Plus, Edit, Trash2, Send, Check } from 'lucide-react';

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
  const loading = useLoading(600);
  const [pools, setPools] = useState<PoolPreset[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<PoolPreset | null>(null);

  useEffect(() => {
    api.pools.list().then(setPools).catch(() => {});
  }, []);

  const deletePool = async (id: string) => {
    await api.pools.delete(id).catch(() => {});
    setPools(pools.filter(p => p.id !== id));
  };

  const savePool = async (data: Partial<PoolPreset>) => {
    if (editing) {
      const updated = await api.pools.update(editing.id, data).catch(() => null);
      if (updated) setPools(pools.map(p => p.id === editing.id ? updated : p));
    } else {
      const created = await api.pools.create(data).catch(() => null);
      if (created) setPools(prev => [...prev, created]);
    }
    setShowAdd(false);
    setEditing(null);
  };

  if (loading) {
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
        <div style={{ fontSize: 11, fontFamily: FONT_MONO, color: t.textMuted, marginTop: 4 }}>Worker: {p.worker || '—'}</div>
        {p.url2 && <div style={{ fontSize: 11, fontFamily: FONT_MONO, color: t.textDim, marginTop: 4, borderTop: `1px solid ${t.border}`, paddingTop: 4 }}>Backup: {p.url2}</div>}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onEdit} style={{ ...btnStyle(t), fontSize: 11 }}><Edit size={11} /> Edit</button>
        <button style={{ ...btnStyle(t), fontSize: 11 }}><Send size={11} /> Push to miners</button>
        <button onClick={onDelete} style={{ ...btnStyle(t, 'danger'), fontSize: 11, marginLeft: 'auto' }}><Trash2 size={11} /></button>
      </div>
    </Card>
  );
}

function PoolModal({ t, pool, onClose, onSave }: { t: Theme; pool: PoolPreset | null; onClose: () => void; onSave: (data: Partial<PoolPreset>) => void }) {
  const [name, setName] = useState(pool?.name || '');
  const [url, setUrl] = useState(pool?.url || '');
  const [worker, setWorker] = useState(pool?.worker || '');
  const [password, setPassword] = useState(pool?.password || 'x');
  const [url2, setUrl2] = useState(pool?.url2 || '');
  const [worker2, setWorker2] = useState(pool?.worker2 || '');
  const [coin, setCoin] = useState(pool?.coin || 'BTC');
  const [isDefault, setIsDefault] = useState(pool?.is_default || false);
  const valid = name.trim() && url.trim();

  return (
    <Modal t={t} title={pool ? 'Edit pool' : 'New pool'} onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField t={t} label="Name" value={name} onChange={setName} placeholder="e.g. Ocean.xyz main" />
          <FormField t={t} label="Coin" value={coin} onChange={setCoin} placeholder="BTC" mono />
        </div>

        <div style={{ padding: '12px 14px', background: t.surface2, borderRadius: 8, border: `1px solid ${t.border}` }}>
          <Label t={t} style={{ marginBottom: 10 }}>Primary pool</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <FormField t={t} label="URL" value={url} onChange={setUrl} mono placeholder="stratum+tcp://..." />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <FormField t={t} label="Worker" value={worker} onChange={setWorker} mono placeholder="wallet.worker1" />
              <FormField t={t} label="Password" value={password} onChange={setPassword} mono placeholder="x" />
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 14px', background: t.surface2, borderRadius: 8, border: `1px solid ${t.border}` }}>
          <Label t={t} style={{ marginBottom: 10 }}>Backup pool (optional)</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <FormField t={t} label="URL" value={url2} onChange={setUrl2} mono placeholder="stratum+tcp://..." />
            <FormField t={t} label="Worker" value={worker2} onChange={setWorker2} mono placeholder="wallet.worker1" />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Toggle t={t} on={isDefault} onChange={setIsDefault} />
          <span style={{ fontSize: 13, color: t.textMuted }}>Set as default pool</span>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${t.border}` }}>
          <button onClick={onClose} style={btnStyle(t)}>Cancel</button>
          <button onClick={() => valid && onSave({ name, url, worker, password, url2, worker2, coin, is_default: isDefault })} disabled={!valid} style={{ ...btnStyle(t, 'primary'), opacity: valid ? 1 : 0.5 }}>
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
