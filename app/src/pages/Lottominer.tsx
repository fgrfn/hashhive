import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, StatusPill, SkeletonRow, useDataReady, Modal, FormField, Toggle, btnStyle } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api, fmtUptime, fmtBestDiff, fmtHashrate, fmtRssi, fmtShares, getHashrate, getTemp, getNmStatus, matchesSearch } from '../api';
import type { NMMinerConfig, NMMinerDevice, SoloDevice } from '../api';
import { Edit3, Search, RotateCcw } from 'lucide-react';
import { toast } from '../store/toast';
import { useMobile } from '../hooks/useWindowWidth';
import type { NmAction } from '../api';

export function Lottominer() {
  const { theme: t } = useThemeStore();
  const navigate = useNavigate();
  const { devices, wsStatus, globalSearch } = useAppStore();
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
      const cfg = await api.lottominer.deviceConfig(ip);
      setConfig(cfg);
    } catch {
      setConfig({ ip, PrimaryPool: '', PrimaryAddress: '', PrimaryPassword: 'x' });
    }
  };

  const saveEdit = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api.lottominer.saveDeviceConfig({
        ...config,
        LedEnable: config.LedEnable ? 1 : 0,
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
      await api.lottominer.batchAction(ips, action);
      toast(`${action} sent to ${ips.length} device${ips.length !== 1 ? 's' : ''}`);
    } catch {
      toast(`Batch ${action} failed`, 'error');
    }
    setSelected(new Set());
  };

  const mobile = useMobile();
  const cols = ['', 'IP', 'Name', 'Status', 'Hashrate', 'Temp', 'Pool', 'Worker', 'Uptime', 'Best Diff', 'Last Diff', 'RSSI', 'Shares A/R', 'Version', 'Actions'];
  const colWidths = ['28px', '110px', '1fr', '90px', '110px', '70px', '130px', '130px', '70px', '80px', '80px', '75px', '70px', '80px', '60px'];

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

  const filtered = devices.filter(d => {
    const ip = d.ip || '';
    const name = d.name ?? d.hostname ?? ip;
    const status = getNmStatus(d);
    if (statusFilter !== 'all' && status !== statusFilter) return false;
    if (query && !name.toLowerCase().includes(query.toLowerCase()) && !ip.includes(query)) return false;
    if (!matchesSearch(d, globalSearch)) return false;
    return true;
  });

  const totalHr = filtered.reduce((a, d) => a + getHashrate(d), 0);
  const online = filtered.filter(d => getNmStatus(d) === 'online').length;

  return (
    <>
      <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 10, fontFamily: FONT_MONO, textTransform: 'uppercase', letterSpacing: '0.06em' }}>NMMiner</div>
      {/* Filter bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 14px', minWidth: 100 }}>
            <Label t={t}>Hashrate</Label>
            <div style={{ fontSize: 20, fontWeight: 700, color: t.info, fontFamily: FONT_MONO, marginTop: 4 }}>
              {fmtHashrate(totalHr)}
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
            <NmMobileCard key={d.ip} t={t} d={d} selected={selected.has(d.ip || '')} onToggle={() => toggleSelect(d.ip || '')} onEdit={() => openEdit(d.ip || '')} onOpen={() => navigate(`/devices/${d.ip || ''}`)} />
          ))}
        </div>
      ) : filtered.length > 0 && (
      <div style={{ overflowX: 'auto' }}>
      <Card t={t} noPad style={{ width: 'max-content', minWidth: '100%' }}>
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
          const lastDiff = fmtBestDiff(d.lastDiff ?? d.lastShare);
          const rssi = fmtRssi(d.rssi ?? d.wifi_rssi);
          const shares = fmtShares(d.shares_ok, d.shares_err);
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
              <div onClick={() => navigate(`/devices/${ip}`)} style={{ fontFamily: FONT_MONO, fontSize: 12, color: t.textMuted, cursor: 'pointer' }}>{ip}</div>
              <div onClick={() => navigate(`/devices/${ip}`)} style={{ fontWeight: 500, cursor: 'pointer' }}>{name}</div>
              <StatusPill t={t} status={status} />
              <div style={{ fontFamily: FONT_MONO, fontWeight: 600 }}>
                {fmtHashrate(hr)}
              </div>
              <div style={{ fontFamily: FONT_MONO, color: temp == null ? t.textMuted : temp > 70 ? t.danger : temp > 65 ? t.warning : t.success }}>
                {temp != null ? `${temp}°C` : '—'}
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pool}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{worker}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11 }}>{uptime}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: t.honey }}>{best}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: t.honey }}>{lastDiff}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: rssi === '—' ? t.textMuted : Number(d.rssi ?? d.wifi_rssi) > -65 ? t.success : Number(d.rssi ?? d.wifi_rssi) > -80 ? t.warning : t.danger }}>{rssi}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11 }}>{shares}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: t.textMuted }}>{d.version || '—'}</div>
              <button onClick={() => openEdit(ip)} style={{ ...btnStyle(t), padding: '5px 8px', fontSize: 11 }}>
                <Edit3 size={12} />
              </button>
            </div>
          );
        })}
      </Card>
      </div>
      )}

      {devices.length === 0 && (
        <div style={{ padding: '20px', color: t.textMuted, fontSize: 13, textAlign: 'center', border: `1px dashed ${t.border}`, borderRadius: 10 }}>
          <div style={{ marginBottom: 12 }}>No NMMiner devices yet.</div>
          <button onClick={() => navigate('/discovery')} style={{ ...btnStyle(t, 'primary'), fontSize: 13 }}>+ Add devices</button>
        </div>
      )}

      <SoloFleet t={t} title="NerdMiner" fetcher={() => api.solo.nerdminer()} />
      <SoloFleet t={t} title="SparkMiner" fetcher={() => api.solo.sparkminer()} />

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
            <Section t={t} label="Display">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <FormField t={t} label="Brightness (1–100)" value={String(config.Brightness ?? 100)} onChange={v => setConfig({ ...config, Brightness: Number(v) })} mono type="number" />
                <div>
                  <Label t={t} style={{ marginBottom: 6 }}>Rotate screen</Label>
                  <select value={String(config.RotateScreen ?? 0)} onChange={e => setConfig({ ...config, RotateScreen: Number(e.target.value) })}
                    style={{ width: '100%', background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, fontSize: 13, padding: '8px 10px', fontFamily: FONT_MONO }}>
                    {[0, 90, 180, 270].map(deg => <option key={deg} value={deg}>{deg}°</option>)}
                  </select>
                </div>
                <div>
                  <Label t={t} style={{ marginBottom: 6 }}>Screen saver</Label>
                  <select value={config.ScreenSaver ?? 'never'} onChange={e => setConfig({ ...config, ScreenSaver: e.target.value })}
                    style={{ width: '100%', background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, fontSize: 13, padding: '8px 10px', fontFamily: FONT_MONO }}>
                    {['never', '30s', '1m', '5m', '15m', '30m'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <span style={{ fontSize: 13 }}>LED enabled</span>
                <Toggle t={t} on={Boolean(config.LedEnable)} onChange={v => setConfig({ ...config, LedEnable: v ? 1 : 0 })} />
              </div>
            </Section>
            {/* Time */}
            <Section t={t} label="Time">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <FormField t={t} label="Timezone (UTC offset)" value={String(config.Timezone ?? '')} onChange={v => setConfig({ ...config, Timezone: v })} mono placeholder="1" />
                <div>
                  <Label t={t} style={{ marginBottom: 6 }}>Clock</Label>
                  <select value={String(config.TimeFormat ?? 24)} onChange={e => setConfig({ ...config, TimeFormat: Number(e.target.value) })}
                    style={{ width: '100%', background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, fontSize: 13, padding: '8px 10px', fontFamily: FONT_MONO }}>
                    <option value={24}>24h</option>
                    <option value={12}>12h</option>
                  </select>
                </div>
                <div>
                  <Label t={t} style={{ marginBottom: 6 }}>Date format</Label>
                  <select value={config.DateFormat ?? 'YYYY-MM-DD'} onChange={e => setConfig({ ...config, DateFormat: e.target.value })}
                    style={{ width: '100%', background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, fontSize: 13, padding: '8px 10px', fontFamily: FONT_MONO }}>
                    {['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
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

function NmMobileCard({ t, d, selected, onToggle, onEdit, onOpen }: { t: Theme; d: NMMinerDevice; selected: boolean; onToggle: () => void; onEdit: () => void; onOpen: () => void }) {
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
          <div onClick={onOpen} style={{ cursor: 'pointer' }}>
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
        <Kv t={t} label="Hashrate" value={fmtHashrate(hr)} />
        <Kv t={t} label="Temp" value={temp != null ? `${temp}°C` : '—'} color={temp == null ? t.textMuted : temp > 70 ? t.danger : temp > 65 ? t.warning : t.success} />
        <Kv t={t} label="Uptime" value={fmtUptime(d.uptime)} />
        <Kv t={t} label="Best Diff" value={fmtBestDiff(d.bestShare ?? d.best_share ?? d.bestDiff)} color={t.honey} />
        <Kv t={t} label="Last Diff" value={fmtBestDiff(d.lastDiff ?? d.lastShare)} color={t.honey} />
        <Kv t={t} label="RSSI" value={fmtRssi(d.rssi ?? d.wifi_rssi)} />
        <Kv t={t} label="Shares A/R" value={fmtShares(d.shares_ok, d.shares_err)} />
        <Kv t={t} label="Version" value={d.version || '—'} />
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

function SoloFleet({ t, title, fetcher }: { t: Theme; title: string; fetcher: () => Promise<{ devices: SoloDevice[] }> }) {
  const { globalSearch } = useAppStore();
  const [devices, setDevices] = useState<SoloDevice[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => fetcher().then(r => { if (alive) { setDevices(r.devices || []); setLoaded(true); } }).catch(() => { if (alive) setLoaded(true); });
    load();
    const id = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, [fetcher]);

  const shown = devices.filter(d => matchesSearch(d, globalSearch));
  if (loaded && devices.length === 0) return null;  // hide empty families to keep the page clean

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 10, fontFamily: FONT_MONO, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</div>
      <div style={{ overflowX: 'auto' }}>
        <Card t={t} noPad style={{ width: 'max-content', minWidth: '100%' }}>
          <div style={{ padding: '10px 18px', background: t.surface2, borderBottom: `1px solid ${t.border}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px 110px 70px 100px 80px', gap: 12 }}>
              {['IP', 'Name', 'Status', 'Hashrate', 'Temp', 'Best Diff', 'Uptime'].map(c => <Label key={c} t={t}>{c}</Label>)}
            </div>
          </div>
          {shown.map((d, i) => {
            const ip = d._ip || d.ip || '';
            const name = d._name || d.hostname || ip;
            const online = d._online ?? d.online ?? false;
            const hr = typeof d.hashRate === 'number' ? fmtHashrate(d.hashRate) : (d.hashRate || '—');
            return (
              <div key={ip || i} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px 110px 70px 100px 80px', gap: 12, padding: '12px 18px', borderBottom: i === shown.length - 1 ? 'none' : `1px solid ${t.border}`, alignItems: 'center', fontSize: 13 }}>
                <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: t.textMuted }}>{ip}</div>
                <div style={{ fontWeight: 500 }}>{name}</div>
                <StatusPill t={t} status={online ? 'online' : 'offline'} />
                <div style={{ fontFamily: FONT_MONO, fontWeight: 600 }}>{hr}</div>
                <div style={{ fontFamily: FONT_MONO, color: d.temp == null ? t.textMuted : d.temp > 70 ? t.danger : t.success }}>{d.temp != null && d.temp > 0 ? `${d.temp}°C` : '—'}</div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: t.honey }}>{fmtBestDiff(d.bestDiff)}</div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 11 }}>{fmtUptime(d.uptime)}</div>
              </div>
            );
          })}
          {shown.length === 0 && (
            <div style={{ padding: '16px 18px', color: t.textMuted, fontSize: 12 }}>No devices match.</div>
          )}
        </Card>
      </div>
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
