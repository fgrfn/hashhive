import React, { useState } from 'react';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, StatusPill, SkeletonRow, useDataReady, Modal, FormField, Toggle, btnStyle } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api, fmtUptime, fmtBestDiff, getHashrate, getTemp, getNmStatus } from '../api';
import type { NMMinerConfig, NMMinerDevice } from '../api';
import { Cpu, Edit3, Search, RotateCcw } from 'lucide-react';
import { toast } from '../store/toast';
import { useMobile } from '../hooks/useWindowWidth';
import type { NmAction } from '../api';

export function NMMiner() {
  const { theme: t } = useThemeStore();
  const { devices, wsStatus } = useAppStore();
  const loading = useDataReady(wsStatus !== 'connecting');
  const [editDevice, setEditDevice] = useState<string | null>(null);
  const [config, setConfig] = useState<NMMinerConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState(new Set<string>());

  const openEdit = async (ip: string) => {
    setEditDevice(ip);
    try {
      const cfg = await api.nmminer.deviceConfig(ip);
      setConfig(cfg);
    } catch {
      setConfig({ ip, PrimaryPool: '', PrimaryAddress: '', PrimaryPassword: 'x' });
    }
  };

  const saveEdit = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api.nmminer.saveDeviceConfig({
        ...config,
        SaveUptime: config.SaveUptime ? 1 : 0,
        LedEnable: config.LedEnable ? 1 : 0,
        AutoBrightness: config.AutoBrightness ? 1 : 0,
      });
      toast('Device config saved');
    } catch {
      toast('Failed to save config', 'error');
    }
    setSaving(false);
    setEditDevice(null);
  };

  const toggleSelect = (ip: string) => {
    const s = new Set(selected);
    if (s.has(ip)) s.delete(ip); else s.add(ip);
    setSelected(s);
  };

  const doBulkAction = async (action: NmAction) => {
    const ips = Array.from(selected);
    try {
      await api.nmminer.batchAction(ips, action);
      toast(`${action} sent to ${ips.length} device${ips.length !== 1 ? 's' : ''}`);
    } catch {
      toast(`Batch ${action} failed`, 'error');
    }
    setSelected(new Set());
  };

  const mobile = useMobile();
  const cols = ['', 'IP', 'Name', 'Status', 'Hashrate', 'Temp', 'Pool', 'Worker', 'Uptime', 'Best Share', 'Actions'];
  const colWidths = ['28px', '120px', '1fr', '90px', '110px', '80px', '160px', '160px', '80px', '90px', '60px'];

  if (loading) {
    return mobile ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} t={t}><SkeletonRow t={t} cols={['80px', '120px', '60px', '80px']} /></Card>
        ))}
      </div>
    ) : (
      <Card t={t} noPad>
        <div style={{ padding: '12px 18px', background: t.surface2, borderBottom: `1px solid ${t.border}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: colWidths.join(' '), gap: 12 }}>
            {cols.map(c => <Label key={c} t={t}>{c}</Label>)}
          </div>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRow key={i} t={t} cols={['100px', '120px', '70px', '80px', '50px', '140px', '140px', '60px', '70px', '40px']} />
        ))}
      </Card>
    );
  }

  if (devices.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: t.textMuted }}>
        <Cpu size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
        <div style={{ fontSize: 16, fontWeight: 600, color: t.text, marginBottom: 6 }}>No NMMiner devices</div>
        <div style={{ fontSize: 13 }}>Configure your NMMiner master IP in Settings to see devices here.</div>
      </div>
    );
  }

  const filtered = devices.filter(d => {
    const ip = d.ip || '';
    const name = d.name ?? d.hostname ?? ip;
    const status = getNmStatus(d);
    if (statusFilter !== 'all' && status !== statusFilter) return false;
    if (query && !name.toLowerCase().includes(query.toLowerCase()) && !ip.includes(query)) return false;
    return true;
  });

  const totalHr = filtered.reduce((a, d) => a + getHashrate(d), 0);
  const online = filtered.filter(d => getNmStatus(d) === 'online').length;

  return (
    <>
      {/* Filter bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 14px', minWidth: 100 }}>
            <Label t={t}>Hashrate</Label>
            <div style={{ fontSize: 20, fontWeight: 700, color: t.info, fontFamily: FONT_MONO, marginTop: 4 }}>
              {totalHr.toFixed(1)} <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 400 }}>GH/s</span>
            </div>
          </div>
          <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 14px', minWidth: 80 }}>
            <Label t={t}>Online</Label>
            <div style={{ fontSize: 20, fontWeight: 700, color: t.success, fontFamily: FONT_MONO, marginTop: 4 }}>
              {online}/{filtered.length}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8 }}>
            <Search size={13} style={{ color: t.textMuted }} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter…" style={{ background: 'transparent', border: 'none', outline: 'none', color: t.text, fontSize: 12, fontFamily: FONT_MONO, width: 140 }} />
          </div>
          {(['all', 'online', 'warning', 'offline'] as const).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} style={{ ...btnStyle(t), padding: '4px 10px', fontSize: 11, background: statusFilter === f ? t.accentGlow : 'transparent', color: statusFilter === f ? t.accent : t.textMuted }}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{ background: t.accentGlow, border: `1px solid ${t.accent}`, borderRadius: 10, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 13, color: t.accent, fontWeight: 600 }}>{selected.size} selected</div>
          <div style={{ flex: 1 }} />
          <button onClick={() => doBulkAction('restart')} style={{ ...btnStyle(t), fontSize: 12 }}><RotateCcw size={13} /> Restart</button>
          <button onClick={() => setSelected(new Set())} style={{ ...btnStyle(t), padding: 6 }}>✕</button>
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: t.textMuted }}>
          <Search size={32} style={{ marginBottom: 10, opacity: 0.3 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 4 }}>No devices match</div>
          <div style={{ fontSize: 13 }}>Try a different name, IP, or status filter.</div>
        </div>
      )}

      {mobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(d => (
            <NmMobileCard key={d.ip} t={t} d={d} selected={selected.has(d.ip || '')} onToggle={() => toggleSelect(d.ip || '')} onEdit={() => openEdit(d.ip || '')} />
          ))}
        </div>
      ) : filtered.length > 0 && (
      <div style={{ overflowX: 'auto' }}>
      <Card t={t} noPad style={{ minWidth: 960 }}>
        <div style={{ padding: '10px 18px', background: t.surface2, borderBottom: `1px solid ${t.border}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: colWidths.join(' '), gap: 12, alignItems: 'center' }}>
            <div><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={() => { if (selected.size === filtered.length) setSelected(new Set()); else setSelected(new Set(filtered.map(d => d.ip || ''))); }} style={{ accentColor: t.info }} /></div>
            {cols.slice(1).map(c => <Label key={c} t={t}>{c}</Label>)}
          </div>
        </div>
        {filtered.map((d, i) => {
          const status = getNmStatus(d);
          const hr = getHashrate(d);
          const temp = getTemp(d);
          const pool = d.pool ?? d.stratumURL ?? '—';
          const worker = d.worker ?? d.stratumUser ?? '—';
          const uptime = fmtUptime(d.uptime);
          const best = fmtBestDiff(d.bestShare ?? d.best_share ?? d.bestDiff);
          const ip = d.ip || '';
          const name = d.name ?? d.hostname ?? ip;
          return (
            <div key={ip} style={{ display: 'grid', gridTemplateColumns: colWidths.join(' '), gap: 12, padding: '12px 18px', borderBottom: i === filtered.length - 1 ? 'none' : `1px solid ${t.border}`, alignItems: 'center', fontSize: 13 }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = t.surface2}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
            >
              <div onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={selected.has(ip)} onChange={() => toggleSelect(ip)} style={{ accentColor: t.info }} />
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: t.textMuted }}>{ip}</div>
              <div style={{ fontWeight: 500 }}>{name}</div>
              <StatusPill t={t} status={status} />
              <div style={{ fontFamily: FONT_MONO, fontWeight: 600 }}>
                {hr > 0 ? <>{hr.toFixed(1)} <span style={{ color: t.textMuted, fontSize: 11, fontWeight: 400 }}>GH/s</span></> : <span style={{ color: t.textMuted }}>—</span>}
              </div>
              <div style={{ fontFamily: FONT_MONO, color: temp == null ? t.textMuted : temp > 70 ? t.danger : temp > 65 ? t.warning : t.success }}>
                {temp != null ? `${temp}°C` : '—'}
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pool}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{worker}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11 }}>{uptime}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: t.honey }}>{best}</div>
              <button onClick={() => openEdit(ip)} style={{ ...btnStyle(t), padding: '5px 8px', fontSize: 11 }}>
                <Edit3 size={12} />
              </button>
            </div>
          );
        })}
      </Card>
      </div>
      )}

      {editDevice && config && (
        <Modal t={t} title={`Configure ${config.Hostname || editDevice}`} onClose={() => setEditDevice(null)} width={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* WiFi */}
            <Section t={t} label="WiFi">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <FormField t={t} label="Hostname" value={config.Hostname || ''} onChange={v => setConfig({ ...config, Hostname: v })} />
                <FormField t={t} label="SSID" value={config.WiFiSSID || ''} onChange={v => setConfig({ ...config, WiFiSSID: v })} />
                <FormField t={t} label="Password" value={config.WiFiPWD || ''} onChange={v => setConfig({ ...config, WiFiPWD: v })} type="password" />
              </div>
            </Section>
            {/* Primary Pool */}
            <Section t={t} label="Primary Pool">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <FormField t={t} label="URL" value={config.PrimaryPool || ''} onChange={v => setConfig({ ...config, PrimaryPool: v })} mono placeholder="stratum+tcp://..." />
                <FormField t={t} label="Worker / Wallet" value={config.PrimaryAddress || ''} onChange={v => setConfig({ ...config, PrimaryAddress: v })} mono />
                <FormField t={t} label="Password" value={config.PrimaryPassword || 'x'} onChange={v => setConfig({ ...config, PrimaryPassword: v })} mono />
              </div>
            </Section>
            {/* Secondary Pool */}
            <Section t={t} label="Secondary Pool">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <FormField t={t} label="URL" value={config.SecondaryPool || ''} onChange={v => setConfig({ ...config, SecondaryPool: v })} mono placeholder="stratum+tcp://..." />
                <FormField t={t} label="Worker / Wallet" value={config.SecondaryAddress || ''} onChange={v => setConfig({ ...config, SecondaryAddress: v })} mono />
                <FormField t={t} label="Password" value={config.SecondaryPassword || 'x'} onChange={v => setConfig({ ...config, SecondaryPassword: v })} mono />
              </div>
            </Section>
            {/* Display */}
            <Section t={t} label="Display & System">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <FormField t={t} label="Brightness (0–100)" value={String(config.Brightness ?? 100)} onChange={v => setConfig({ ...config, Brightness: Number(v) })} mono type="number" />
                <FormField t={t} label="UI Refresh (s)" value={String(config.UIRefresh ?? 2)} onChange={v => setConfig({ ...config, UIRefresh: Number(v) })} mono type="number" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
                {[
                  ['Save History', 'SaveUptime'],
                  ['LED Enable', 'LedEnable'],
                  ['Auto Brightness', 'AutoBrightness'],
                ].map(([label, key]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13 }}>{label}</span>
                    <Toggle t={t} on={Boolean(config[key as keyof NMMinerConfig])} onChange={v => setConfig({ ...config, [key]: v ? 1 : 0 })} />
                  </div>
                ))}
              </div>
            </Section>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
              <button onClick={() => setEditDevice(null)} style={btnStyle(t)}>Cancel</button>
              <button onClick={saveEdit} disabled={saving} style={{ ...btnStyle(t, 'primary'), opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function NmMobileCard({ t, d, selected, onToggle, onEdit }: { t: Theme; d: NMMinerDevice; selected: boolean; onToggle: () => void; onEdit: () => void }) {
  const status = getNmStatus(d);
  const hr = getHashrate(d);
  const temp = getTemp(d);
  const ip = d.ip || '';
  const name = d.name ?? d.hostname ?? ip;
  const pool = d.pool ?? d.stratumURL ?? '—';
  const worker = d.worker ?? d.stratumUser ?? '—';
  return (
    <Card t={t} style={{ background: selected ? t.accentGlow : undefined, borderColor: selected ? t.accent : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={selected} onChange={onToggle} style={{ accentColor: t.info, marginTop: 3 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
            <div style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT_MONO }}>{ip}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <StatusPill t={t} status={status} />
          <button onClick={onEdit} style={{ ...btnStyle(t), padding: '4px 7px' }}><Edit3 size={12} /></button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
        <Kv t={t} label="Hashrate" value={hr > 0 ? `${hr.toFixed(1)} GH/s` : '—'} />
        <Kv t={t} label="Temp" value={temp != null ? `${temp}°C` : '—'} color={temp == null ? t.textMuted : temp > 70 ? t.danger : temp > 65 ? t.warning : t.success} />
        <Kv t={t} label="Uptime" value={fmtUptime(d.uptime)} />
        <Kv t={t} label="Best Share" value={fmtBestDiff(d.bestShare ?? d.best_share ?? d.bestDiff)} color={t.honey} />
      </div>
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${t.border}`, fontSize: 11, color: t.textMuted, fontFamily: FONT_MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {pool} · {worker}
      </div>
    </Card>
  );
}

function Kv({ t, label, value, color }: { t: Theme; label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: FONT_MONO, fontWeight: 600, color: color ?? t.text }}>{value}</div>
    </div>
  );
}

function Section({ t, label, children }: { t: Theme; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: t.accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT_MONO, marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  );
}
