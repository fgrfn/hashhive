import React, { useState, useEffect } from 'react';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, Pill, Toggle, Modal, FormField, EmptyState, SkeletonCard, btnStyle } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api } from '../api';
import type { PoolPreset, PoolSlot, StratumProtocol, Sv2Channel } from '../api';
import { Database, Plus, Edit, Trash2, Send, Check } from 'lucide-react';
import { toast } from '../store/toast';

/** A device a pool can be pushed to, unified across miner families. */
interface PushTarget { ip: string; name: string; type: string; online: boolean }

/** Build the unified push-target list from both device stores. */
function usePushTargets(): PushTarget[] {
  const { devices, axeDevices } = useAppStore();
  return [
    ...devices.map(d => ({
      ip: d.ip || '', name: d.hostname || d.name || d.ip || '',
      type: d._type || 'lottominer', online: d._online !== false,
    })),
    ...axeDevices.map(d => ({
      ip: d._ip || '', name: d.hostname || d._name || d._ip || '',
      type: d._type || 'bitaxe', online: !!d._online,
    })),
  ].filter(d => d.ip);
}

/** AxeHub firmware has a single pool — it can't receive a backup-slot push. */
function supportsSlot(type: string, slot: PoolSlot): boolean {
  return slot === 'primary' || type !== 'axehub';
}

export function Pool() {
  const { theme: t } = useThemeStore();
  const [tab, setTab] = useState('library');

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: `1px solid ${t.border}`, marginBottom: 16 }}>
        {[['library', 'Pool library'], ['assignments', 'Miner assignments'], ['status', 'Pool status']].map(([id, label]) => (
          <div key={id} onClick={() => setTab(id)} style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: tab === id ? t.accent : t.textMuted, borderBottom: tab === id ? `2px solid ${t.accent}` : '2px solid transparent', marginBottom: -1 }}>
            {label}
          </div>
        ))}
      </div>
      {tab === 'library' && <PoolLibrary />}
      {tab === 'assignments' && <MinerAssignments />}
      {tab === 'status' && <PoolStatus />}
    </div>
  );
}

function PoolLibrary() {
  const { theme: t } = useThemeStore();
  const [fetched, setFetched] = useState(false);
  const [pools, setPools] = useState<PoolPreset[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<PoolPreset | null>(null);
  const [pushPool, setPushPool] = useState<PoolPreset | null>(null);

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
            <PoolCard key={p.id} t={t} pool={p} onEdit={() => setEditing(p)} onDelete={() => deletePool(p.id)}
              onPush={() => setPushPool(p)} />
          ))}
        </div>
      )}

      {(showAdd || editing) && (
        <PoolModal t={t} pool={editing} onClose={() => { setShowAdd(false); setEditing(null); }} onSave={savePool} />
      )}

      {pushPool && (
        <PushModal t={t} pool={pushPool} onClose={() => setPushPool(null)} />
      )}
    </div>
  );
}

function PoolCard({ t, pool: p, onEdit, onDelete, onPush }: { t: Theme; pool: PoolPreset; onEdit: () => void; onDelete: () => void; onPush: () => void }) {
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
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {p.protocol === 'SV2' && <Pill t={t} sev="info">SV2</Pill>}
          {p.tls && <Pill t={t} sev="warning">TLS</Pill>}
          {p.is_default && <Pill t={t} sev="success">default</Pill>}
        </div>
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
        <button onClick={onPush} style={{ ...btnStyle(t), fontSize: 11 }}><Send size={11} /> Push to miners</button>
        <button onClick={onDelete} style={{ ...btnStyle(t, 'danger'), fontSize: 11, marginLeft: 'auto' }}><Trash2 size={11} /></button>
      </div>
    </Card>
  );
}

function PushModal({ t, pool, onClose }: { t: Theme; pool: PoolPreset; onClose: () => void }) {
  const targets = usePushTargets();
  const [slot, setSlot] = useState<PoolSlot>('primary');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(targets.map(d => d.ip)));
  const [pushing, setPushing] = useState(false);
  const [results, setResults] = useState<Record<string, 'ok' | 'fail' | 'skip'>>({});

  // Only targets that can accept the chosen slot count as selectable.
  const eligible = targets.filter(d => supportsSlot(d.type, slot));
  const selectedEligible = eligible.filter(d => selected.has(d.ip));

  const toggle = (ip: string) => setSelected(prev => {
    const s = new Set(prev);
    if (s.has(ip)) s.delete(ip); else s.add(ip);
    return s;
  });
  const allSelected = eligible.length > 0 && eligible.every(d => selected.has(d.ip));
  const toggleAll = () => setSelected(prev => {
    if (allSelected) { const s = new Set(prev); eligible.forEach(d => s.delete(d.ip)); return s; }
    const s = new Set(prev); eligible.forEach(d => s.add(d.ip)); return s;
  });

  const doPush = async () => {
    const ips = selectedEligible.map(d => d.ip);
    if (ips.length === 0) return;
    setPushing(true);
    setResults({});
    const settled = await Promise.allSettled(
      ips.map(ip => api.pools.pushToDevice(ip, { ...pool, slot }).then(() => ip)),
    );
    const next: Record<string, 'ok' | 'fail' | 'skip'> = {};
    settled.forEach((r, i) => { next[ips[i]] = r.status === 'fulfilled' ? 'ok' : 'fail'; });
    setResults(next);
    setPushing(false);
    const ok = settled.filter(r => r.status === 'fulfilled').length;
    toast(`Pushed to ${ok}/${ips.length} miner${ips.length !== 1 ? 's' : ''}${ok < ips.length ? ' — some failed' : ''}`, ok ? undefined : 'error');
  };

  const typeSev = (type: string): 'success' | 'info' | 'warning' =>
    type === 'bitaxe' || type === 'nerdaxe' ? 'success' : type === 'axehub' ? 'warning' : 'info';

  return (
    <Modal t={t} title={`Push "${pool.name}" to miners`} onClose={onClose} width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Slot selector */}
        <div>
          <Label t={t} style={{ marginBottom: 8 }}>Target pool slot</Label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['primary', 'backup'] as PoolSlot[]).map(s => (
              <button key={s} onClick={() => setSlot(s)}
                style={{ ...btnStyle(t, slot === s ? 'primary' : 'ghost'), flex: 1, fontSize: 12, textTransform: 'capitalize' }}>
                {s} pool
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: t.textDim, marginTop: 6 }}>
            {slot === 'primary'
              ? 'Sets the device’s primary pool (and backup pool if the preset has one).'
              : 'Writes this preset into the device’s backup/fallback slot, leaving the primary pool unchanged.'}
          </div>
        </div>

        {/* Device list */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Label t={t}>Miners ({selectedEligible.length}/{eligible.length} selected)</Label>
            {eligible.length > 0 && (
              <button onClick={toggleAll} style={{ ...btnStyle(t), fontSize: 11, padding: '4px 8px' }}>
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>
          {targets.length === 0 ? (
            <div style={{ padding: '16px', color: t.textMuted, fontSize: 13, textAlign: 'center', border: `1px solid ${t.border}`, borderRadius: 8 }}>
              No devices configured.
            </div>
          ) : (
            <div style={{ maxHeight: 280, overflow: 'auto', border: `1px solid ${t.border}`, borderRadius: 8 }}>
              {targets.map((d, i) => {
                const unsupported = !supportsSlot(d.type, slot);
                const checked = !unsupported && selected.has(d.ip);
                const res = results[d.ip];
                return (
                  <div key={d.ip} onClick={() => !unsupported && !pushing && toggle(d.ip)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                      borderBottom: i === targets.length - 1 ? 'none' : `1px solid ${t.border}`,
                      cursor: unsupported || pushing ? 'default' : 'pointer', opacity: unsupported ? 0.5 : 1 }}>
                    <input type="checkbox" checked={checked} disabled={unsupported || pushing} readOnly
                      style={{ accentColor: t.accent, cursor: unsupported || pushing ? 'default' : 'pointer' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                      <div style={{ fontSize: 10, fontFamily: FONT_MONO, color: t.textMuted }}>{d.ip}</div>
                    </div>
                    {!d.online && <span style={{ fontSize: 10, color: t.textDim }}>offline</span>}
                    {unsupported && <span style={{ fontSize: 10, color: t.textDim }}>no backup slot</span>}
                    {res === 'ok' && <Check size={13} color={t.success} />}
                    {res === 'fail' && <span style={{ fontSize: 11, color: t.danger }}>failed</span>}
                    <Pill t={t} sev={typeSev(d.type)}>{d.type}</Pill>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4, borderTop: `1px solid ${t.border}` }}>
          <button onClick={onClose} style={btnStyle(t)}>Cancel</button>
          <button onClick={doPush} disabled={pushing || selectedEligible.length === 0}
            style={{ ...btnStyle(t, 'primary'), opacity: pushing || selectedEligible.length === 0 ? 0.5 : 1 }}>
            <Send size={13} /> {pushing ? 'Pushing…' : `Push to ${selectedEligible.length} miner${selectedEligible.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function parseUrlPort(full: string): { base: string; port: string } {
  const m = full.match(/^(.*):(\d+)$/);
  return m ? { base: m[1], port: m[2] } : { base: full, port: '' };
}

interface PoolAdvanced {
  protocol: StratumProtocol; tls: boolean; channel: Sv2Channel; pubkey: string;
  onProtocol: (v: StratumProtocol) => void; onTls: (v: boolean) => void;
  onChannel: (v: Sv2Channel) => void; onPubkey: (v: string) => void;
}

function Segmented<T extends string>({ t, value, options, onChange }: {
  t: Theme; value: T; options: [T, string][]; onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          style={{ ...btnStyle(t, value === v ? 'primary' : 'ghost'), flex: 1, fontSize: 11, padding: '5px 8px' }}>
          {label}
        </button>
      ))}
    </div>
  );
}

function PoolSection({ t, label, base, port, wallet, password, onBase, onPort, onWallet, onPassword, optional, adv }: {
  t: Theme; label: string; base: string; port: string; wallet: string; password: string;
  onBase: (v: string) => void; onPort: (v: string) => void; onWallet: (v: string) => void; onPassword: (v: string) => void;
  optional?: boolean; adv: PoolAdvanced;
}) {
  const [showAdv, setShowAdv] = useState(adv.protocol === 'SV2' || adv.tls);
  return (
    <div style={{ padding: '12px 14px', background: t.surface2, borderRadius: 8, border: `1px solid ${t.border}` }}>
      <Label t={t} style={{ marginBottom: 10 }}>{label}{optional && <span style={{ color: t.textDim, fontWeight: 400, marginLeft: 6 }}>(optional)</span>}</Label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8 }}>
          <FormField t={t} label="Host" value={base} onChange={onBase} mono placeholder="pool.example.com" />
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

        <button type="button" onClick={() => setShowAdv(s => !s)}
          style={{ background: 'transparent', border: 'none', color: t.accent, cursor: 'pointer', fontSize: 11, padding: 0, textAlign: 'left', width: 'fit-content' }}>
          {showAdv ? '▾' : '▸'} Protocol & security
        </button>
        {showAdv && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px', background: t.surface, borderRadius: 6, border: `1px solid ${t.border}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <Label t={t} style={{ marginBottom: 6 }}>Stratum protocol</Label>
                <Segmented t={t} value={adv.protocol} onChange={adv.onProtocol}
                  options={[['SV1', 'Stratum V1'], ['SV2', 'Stratum V2']]} />
              </div>
              <div>
                <Label t={t} style={{ marginBottom: 6 }}>Encryption</Label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30 }}>
                  <Toggle t={t} on={adv.tls} onChange={adv.onTls} />
                  <span style={{ fontSize: 12, color: t.textMuted }}>TLS{adv.tls ? ' on' : ' off'}</span>
                </div>
              </div>
            </div>
            {adv.protocol === 'SV2' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <Label t={t} style={{ marginBottom: 6 }}>SV2 channel type</Label>
                  <Segmented t={t} value={adv.channel} onChange={adv.onChannel}
                    options={[['extended', 'Extended'], ['standard', 'Standard']]} />
                  <div style={{ fontSize: 10, color: t.textDim, marginTop: 4 }}>Extended is recommended for external SV2 pools.</div>
                </div>
                <FormField t={t} label="SV2 authority pubkey" value={adv.pubkey} onChange={adv.onPubkey} mono placeholder="Base58 key (optional)" />
              </div>
            )}
            <div style={{ fontSize: 10, color: t.textDim }}>
              Applied to AxeOS (BitAxe/NerdAxe). NMMiner is SV1-only; TLS is sent as <span style={{ fontFamily: FONT_MONO }}>stratum+ssl://</span>.
            </div>
          </div>
        )}
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
  // Primary protocol/security
  const [protocol, setProtocol] = useState<StratumProtocol>(pool?.protocol || 'SV1');
  const [tls, setTls] = useState(pool?.tls || false);
  const [channel, setChannel] = useState<Sv2Channel>(pool?.channel || 'extended');
  const [pubkey, setPubkey] = useState(pool?.sv2_pubkey || '');
  // Backup protocol/security
  const [protocol2, setProtocol2] = useState<StratumProtocol>(pool?.protocol2 || 'SV1');
  const [tls2, setTls2] = useState(pool?.tls2 || false);
  const [channel2, setChannel2] = useState<Sv2Channel>(pool?.channel2 || 'extended');
  const [pubkey2, setPubkey2] = useState(pool?.sv2_pubkey2 || '');

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
          onBase={setBase} onPort={setPort} onWallet={setWallet} onPassword={setPassword}
          adv={{ protocol, tls, channel, pubkey, onProtocol: setProtocol, onTls: setTls, onChannel: setChannel, onPubkey: setPubkey }} />

        <PoolSection t={t} label="Backup pool" optional
          base={base2} port={port2} wallet={wallet2} password={password2}
          onBase={setBase2} onPort={setPort2} onWallet={setWallet2} onPassword={setPassword2}
          adv={{ protocol: protocol2, tls: tls2, channel: channel2, pubkey: pubkey2, onProtocol: setProtocol2, onTls: setTls2, onChannel: setChannel2, onPubkey: setPubkey2 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Toggle t={t} on={isDefault} onChange={setIsDefault} />
          <span style={{ fontSize: 13, color: t.textMuted }}>Set as default pool</span>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${t.border}` }}>
          <button onClick={onClose} style={btnStyle(t)}>Cancel</button>
          <button
            onClick={() => valid && onSave({
              name, coin, is_default: isDefault,
              url: buildUrl(base, port), wallet, password,
              protocol, tls, channel, sv2_pubkey: pubkey,
              url2: buildUrl(base2, port2), wallet2, password2,
              protocol2, tls2, channel2, sv2_pubkey2: pubkey2,
            })}
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
    ...devices.map(d => ({ ip: d.ip || '', name: d.name || d.hostname || d.ip || '', type: 'lottominer' as const, status: d.status || 'online' })),
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
            <Pill t={t} sev={d.type === 'lottominer' ? 'info' : 'success'}>{d.type}</Pill>
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

interface PoolStat { url: string; devices: number; online: number; accepted: number; rejected: number; }

function PoolStatus() {
  const { theme: t } = useThemeStore();
  const { devices, axeDevices } = useAppStore();
  const [pings, setPings] = useState<Record<string, number | null>>({});
  const [serverHealth, setServerHealth] = useState<Record<string, { up: boolean; latency_ms: number | null }>>({});

  // Aggregate per active pool URL across all configured miners.
  const stats: PoolStat[] = (() => {
    const map = new Map<string, PoolStat>();
    const add = (url: string, online: boolean, acc: number, rej: number) => {
      const key = (url || '').trim();
      if (!key) return;
      const s = map.get(key) || { url: key, devices: 0, online: 0, accepted: 0, rejected: 0 };
      s.devices += 1;
      if (online) { s.online += 1; s.accepted += acc; s.rejected += rej; }
      map.set(key, s);
    };
    for (const d of axeDevices) {
      // AxeOS reports host and port separately — combine so the pool has a
      // pingable host:port (NMMiner already reports the full URL with port).
      const useFb = !!d.isUsingFallbackStratum;
      const host = (useFb ? d.fallbackStratumURL : d.stratumURL) || d.stratumURL || '';
      const port = (useFb ? d.fallbackStratumPort : d.stratumPort) ?? d.stratumPort;
      const url = host && port && !host.includes('://') && !host.includes(':') ? `${host}:${port}` : host;
      add(url, !!d._online, d.sharesAccepted || 0, d.sharesRejected || 0);
    }
    for (const d of devices) {
      add(d.pool || d.stratumURL || '', d._online !== false, d.shares_ok || 0, d.shares_err || 0);
    }
    return [...map.values()].sort((a, b) => b.devices - a.devices);
  })();

  useEffect(() => {
    let alive = true;
    stats.forEach(s => {
      api.pools.ping(s.url).then(r => { if (alive) setPings(p => ({ ...p, [s.url]: r.latency_ms })); }).catch(() => {});
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.map(s => s.url).join(',')]);

  // Server-side health: HashHive's background monitor pings each in-use pool and
  // alerts on outages. Poll it so the badge reflects the same source as alerts.
  useEffect(() => {
    let alive = true;
    const load = () => api.pools.health()
      .then(list => { if (alive) setServerHealth(Object.fromEntries(list.map(h => [h.url, { up: h.up, latency_ms: h.latency_ms }]))); })
      .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (stats.length === 0) {
    return <Card t={t}><div style={{ color: t.textMuted, fontSize: 13, padding: '8px 0' }}>No pool data yet — connect miners to a pool to see live status here.</div></Card>;
  }

  return (
    <Card t={t} noPad>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 110px 110px 90px 90px 90px', gap: 10, padding: '10px 16px', background: t.surface2, borderBottom: `1px solid ${t.border}` }}>
        {['Pool', 'Health', 'Accepted', 'Rejected', 'Accept %', 'Ping', 'Devices'].map((c, i) => (
          <Label key={c} t={t} style={{ textAlign: i === 0 ? 'left' : 'right' }}>{c}</Label>
        ))}
      </div>
      {stats.map((s, i) => {
        const total = s.accepted + s.rejected;
        const pct = total > 0 ? (s.accepted / total) * 100 : null;
        const ping = pings[s.url];
        const health = serverHealth[s.url];
        return (
          <div key={s.url} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 110px 110px 90px 90px 90px', gap: 10, padding: '12px 16px', borderBottom: i === stats.length - 1 ? 'none' : `1px solid ${t.border}`, alignItems: 'center', fontSize: 13 }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url}</div>
            <div style={{ textAlign: 'right', fontFamily: FONT_MONO, color: health === undefined ? t.textMuted : health.up ? t.success : t.danger }}>
              {health === undefined ? '—' : health.up ? '● up' : '● down'}
            </div>
            <div style={{ textAlign: 'right', fontFamily: FONT_MONO, color: t.success }}>{s.accepted.toLocaleString()}</div>
            <div style={{ textAlign: 'right', fontFamily: FONT_MONO, color: s.rejected > 0 ? t.danger : t.textMuted }}>{s.rejected.toLocaleString()}</div>
            <div style={{ textAlign: 'right', fontFamily: FONT_MONO }}>{pct != null ? `${pct.toFixed(1)}%` : '—'}</div>
            <div style={{ textAlign: 'right', fontFamily: FONT_MONO, color: ping == null ? t.danger : ping < 100 ? t.success : ping < 300 ? t.warning : t.danger }}>
              {ping === undefined ? '…' : ping == null ? 'down' : `${ping} ms`}
            </div>
            <div style={{ textAlign: 'right', fontFamily: FONT_MONO, color: s.online === s.devices ? t.success : s.online > 0 ? t.warning : t.danger }}>{s.online}/{s.devices}</div>
          </div>
        );
      })}
    </Card>
  );
}
