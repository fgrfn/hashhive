import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, StatusPill, SkeletonRow, useDataReady, Modal, FormField, Toggle, btnStyle } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api, fmtUptime, fmtBestDiff, fmtHashrate, fmtRssi, fmtShares, getHashrate, getTemp, getNmStatus, matchesSearch } from '../api';
import type { NMMinerConfig, NMMinerDevice, AppSettings } from '../api';
import { Cpu, RotateCcw, Trash2, Settings as SettingsIcon } from 'lucide-react';
import { applyDashboardToStore } from '../hooks/useDeviceStream';
import { toast } from '../store/toast';
import { useMobile } from '../hooks/useWindowWidth';
import { useFirmwareLatest } from '../hooks/useFirmwareLatest';
import { FwBadge } from '../components/FirmwareBadge';
import type { NmAction } from '../api';

export function Lottominer() {
  const { theme: t } = useThemeStore();
  const navigate = useNavigate();
  const fwLatest = useFirmwareLatest();
  const { devices, settings, setSettings, wsStatus, globalSearch } = useAppStore();
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

  // Remove selected devices from HashHive's config (the miners keep running).
  const removeSelected = async () => {
    const ips = Array.from(selected);
    if (!ips.length) return;
    const n = ips.length;
    if (!window.confirm(`Remove ${n} device${n !== 1 ? 's' : ''} from HashHive? The miner${n !== 1 ? 's' : ''} keep${n === 1 ? 's' : ''} running — this only stops monitoring ${n !== 1 ? 'them' : 'it'} here.`)) return;
    const s: AppSettings = { ...(settings || {}) };
    s.lottominer_devices = (s.lottominer_devices || []).filter(d => !ips.includes(d.ip));
    s.axehub_devices = (s.axehub_devices || []).filter(d => !ips.includes(d.ip));
    if (s.lottominer_master && ips.includes(s.lottominer_master)) s.lottominer_master = '';
    try {
      setSettings(await api.settings.save(s));
      try { applyDashboardToStore(await api.dashboard()); } catch { /* keep going */ }
      toast(`Removed ${n} device${n !== 1 ? 's' : ''}`);
    } catch {
      toast('Failed to remove devices', 'error');
    }
    setSelected(new Set());
  };

  const doAction = async (ip: string, action: NmAction) => {
    try {
      await api.lottominer.batchAction([ip], action);
      toast(`${action} sent to ${ip}`);
    } catch {
      toast(`${action} failed for ${ip}`, 'error');
    }
  };

  const mobile = useMobile();

  if (loading) {
    return (
      <Card t={t} noPad>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonRow key={i} t={t} cols={['20px', '120px', '80px', '70px', '90px', '60px', '60px', '70px', '60px']} />
        ))}
      </Card>
    );
  }

  if (devices.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: t.textMuted }}>
        <Cpu size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
        <div style={{ fontSize: 16, fontWeight: 600, color: t.text, marginBottom: 6 }}>No NMMiner devices</div>
        <div style={{ fontSize: 13, marginBottom: 14 }}>Discover them on your network or add one by IP.</div>
        <button onClick={() => navigate('/discovery')} style={{ ...btnStyle(t, 'primary'), fontSize: 13 }}>+ Add devices</button>
      </div>
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
    <div>
      {/* Stats header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <KpiSm t={t} label="Hashrate" value={fmtHashrate(totalHr)} color={t.info} />
          <KpiSm t={t} label="Online" value={`${online}/${filtered.length}`} color={t.success} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, fontSize: 12, fontFamily: FONT_MONO }}>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter…" style={{ background: 'transparent', border: 'none', outline: 'none', color: t.text, fontSize: 12, fontFamily: FONT_MONO, width: 160 }} />
          </div>
          {['all', 'online', 'warning', 'offline'].map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} style={{ ...btnStyle(t), padding: '4px 10px', fontSize: 11, background: statusFilter === f ? t.accentGlow : 'transparent', color: statusFilter === f ? t.accent : t.textMuted }}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div style={{ background: t.accentGlow, border: `1px solid ${t.accent}`, borderRadius: 10, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 13, color: t.accent, fontWeight: 600 }}>{selected.size} selected</div>
          <div style={{ flex: 1 }} />
          <button onClick={() => doBulkAction('restart')} style={{ ...btnStyle(t), fontSize: 12 }}><RotateCcw size={13} /> Restart</button>
          <button onClick={removeSelected} style={{ ...btnStyle(t, 'danger'), fontSize: 12 }}><Trash2 size={13} /> Remove</button>
          <button onClick={() => setSelected(new Set())} style={{ ...btnStyle(t), padding: 6 }}>✕</button>
        </div>
      )}

      {mobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(d => (
            <NmMobileCard key={d.ip} t={t} d={d} onConfigure={openEdit} onAction={doAction} onNavigate={navigate} fwLatest={fwLatest} />
          ))}
        </div>
      ) : (
      <div style={{ overflowX: 'auto' }}>
      <Card t={t} noPad style={{ width: 'max-content', minWidth: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '28px 1.4fr 90px 110px 70px 85px 80px 80px 80px 65px 70px 80px', gap: 10, padding: '10px 16px', background: t.surface2, borderBottom: `1px solid ${t.border}`, fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT_MONO, fontWeight: 600 }}>
          <div><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={() => { if (selected.size === filtered.length) setSelected(new Set()); else setSelected(new Set(filtered.map(d => d.ip || ''))); }} style={{ accentColor: t.info }} /></div>
          <Label t={t}>Name / IP</Label>
          <Label t={t}>Status</Label>
          <Label t={t}>Hashrate</Label>
          <Label t={t}>Temp</Label>
          <Label t={t}>Best Diff</Label>
          <Label t={t}>Last Diff</Label>
          <Label t={t}>Uptime</Label>
          <Label t={t}>Shares A/R</Label>
          <Label t={t}>RSSI</Label>
          <Label t={t}>Version</Label>
          <Label t={t}>Actions</Label>
        </div>
        {filtered.map((d, i) => {
          const status = getNmStatus(d);
          const hr = getHashrate(d);
          const temp = getTemp(d);
          const uptime = fmtUptime(d.uptime);
          const best = fmtBestDiff(d.bestShare ?? d.best_share ?? d.bestDiff);
          const lastDiff = fmtBestDiff(d.lastDiff ?? d.lastShare);
          const rssi = fmtRssi(d.rssi ?? d.wifi_rssi);
          const shares = fmtShares(d.shares_ok, d.shares_err);
          const ip = d.ip || '';
          const name = d.name ?? d.hostname ?? ip;
          return (
            <div key={ip || i} style={{ display: 'grid', gridTemplateColumns: '28px 1.4fr 90px 110px 70px 85px 80px 80px 80px 65px 70px 80px', gap: 10, padding: '11px 16px', borderBottom: i === filtered.length - 1 ? 'none' : `1px solid ${t.border}`, alignItems: 'center', fontSize: 12 }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = t.surface2}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
            >
              <div onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={selected.has(ip)} onChange={() => toggleSelect(ip)} style={{ accentColor: t.info }} />
              </div>
              <div onClick={() => navigate(`/devices/${ip}`)} style={{ cursor: 'pointer' }}>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  {d._type === 'axehub' && (
                    <span style={{ fontSize: 9, color: t.accent, fontFamily: FONT_MONO, background: t.accentGlow, padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>AxeHub</span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: t.textMuted, fontFamily: FONT_MONO }}>{ip}</div>
                {d._type && d._type !== 'axehub' && <div style={{ fontSize: 9, color: t.info, fontFamily: FONT_MONO, textTransform: 'uppercase' }}>{d._type}</div>}
              </div>
              <StatusPill t={t} status={status} />
              <div style={{ fontFamily: FONT_MONO, fontWeight: 600 }}>{fmtHashrate(hr)}</div>
              <div style={{ fontFamily: FONT_MONO, color: temp == null ? t.textMuted : temp > 70 ? t.danger : temp > 65 ? t.warning : t.success }}>
                {temp != null ? `${temp}°C` : '—'}
              </div>
              <div style={{ fontFamily: FONT_MONO, color: t.honey, fontSize: 11 }}>{best}</div>
              <div style={{ fontFamily: FONT_MONO, color: t.honey, fontSize: 11 }}>{lastDiff}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11 }}>{uptime}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11 }}>{shares}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: rssi === '—' ? t.textMuted : Number(d.rssi ?? d.wifi_rssi) > -65 ? t.success : Number(d.rssi ?? d.wifi_rssi) > -80 ? t.warning : t.danger }}>{rssi}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: t.textMuted, display: 'flex', alignItems: 'center' }}>
                {d.version || '—'}
                <FwBadge t={t} current={d.version} family={d._type === 'axehub' ? 'axehub' : 'lottominer'} fwLatest={fwLatest} />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {d._type === 'axehub' ? (
                  <span style={{ fontSize: 10, color: t.textMuted, fontFamily: FONT_MONO, alignSelf: 'center' }} title="Configure AxeHub pools from the Pools page">—</span>
                ) : (
                  <button title="Configure" onClick={() => openEdit(ip)} style={{ ...btnStyle(t), padding: '3px 5px' }}><SettingsIcon size={11} /></button>
                )}
                <button title="Restart" onClick={() => doAction(ip, 'restart')} style={{ ...btnStyle(t), padding: '3px 5px' }}><RotateCcw size={11} /></button>
              </div>
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
            {/* Market / price ticker */}
            <Section t={t} label="Market">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <FormField t={t} label="Main coin" value={String(config.MainCoin ?? '')} onChange={v => setConfig({ ...config, MainCoin: v })} mono placeholder="BTC" />
                <FormField t={t} label="Watch coins (comma-separated)" value={String(config.WatchCoins ?? '')} onChange={v => setConfig({ ...config, WatchCoins: v })} mono placeholder="BTC,ETH,LTC" />
                <div>
                  <Label t={t} style={{ marginBottom: 6 }}>Price page mode</Label>
                  <select value={config.PricePageMode ?? 'kline'} onChange={e => setConfig({ ...config, PricePageMode: e.target.value })}
                    style={{ width: '100%', background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, fontSize: 13, padding: '8px 10px', fontFamily: FONT_MONO }}>
                    {['kline', 'pricewall'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <Label t={t} style={{ marginBottom: 6 }}>Kline interval</Label>
                  <select value={config.KlineInterval ?? '1h'} onChange={e => setConfig({ ...config, KlineInterval: e.target.value })}
                    style={{ width: '100%', background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, fontSize: 13, padding: '8px 10px', fontFamily: FONT_MONO }}>
                    {['1m', '5m', '15m', '1h', '4h', '1d', '1w'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
            </Section>
            {/* Weather widget */}
            <Section t={t} label="Weather">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <FormField t={t} label="City" value={String(config.WeatherCity ?? '')} onChange={v => setConfig({ ...config, WeatherCity: v })} placeholder="Berlin" />
                <FormField t={t} label="Latitude" value={String(config.WeatherLat ?? '')} onChange={v => setConfig({ ...config, WeatherLat: v })} mono placeholder="52.52" />
                <FormField t={t} label="Longitude" value={String(config.WeatherLon ?? '')} onChange={v => setConfig({ ...config, WeatherLon: v })} mono placeholder="13.40" />
                <div>
                  <Label t={t} style={{ marginBottom: 6 }}>Temperature</Label>
                  <select value={config.WeatherTempUnit ?? 'celsius'} onChange={e => setConfig({ ...config, WeatherTempUnit: e.target.value })}
                    style={{ width: '100%', background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, fontSize: 13, padding: '8px 10px', fontFamily: FONT_MONO }}>
                    {['celsius', 'fahrenheit'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <Label t={t} style={{ marginBottom: 6 }}>Wind speed</Label>
                  <select value={config.WeatherSpeedUnit ?? 'kmh'} onChange={e => setConfig({ ...config, WeatherSpeedUnit: e.target.value })}
                    style={{ width: '100%', background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, fontSize: 13, padding: '8px 10px', fontFamily: FONT_MONO }}>
                    {['kmh', 'mph', 'ms', 'kn'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <Label t={t} style={{ marginBottom: 6 }}>Altitude mode</Label>
                  <select value={config.WeatherAltMode ?? 'pressure'} onChange={e => setConfig({ ...config, WeatherAltMode: e.target.value })}
                    style={{ width: '100%', background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, fontSize: 13, padding: '8px 10px', fontFamily: FONT_MONO }}>
                    {['pressure', 'altitude'].map(o => <option key={o} value={o}>{o}</option>)}
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
    </div>
  );
}

function NmMobileCard({ t, d, onConfigure, onAction, onNavigate, fwLatest }: { t: Theme; d: NMMinerDevice; onConfigure: (ip: string) => void; onAction: (ip: string, action: NmAction) => void; onNavigate: (path: string) => void; fwLatest: Record<string, { version: string; html_url: string }> }) {
  const status = getNmStatus(d);
  const hr = getHashrate(d);
  const temp = getTemp(d);
  const ip = d.ip || '';
  const name = d.name ?? d.hostname ?? ip;
  return (
    <Card t={t}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div onClick={() => onNavigate(`/devices/${ip}`)} style={{ cursor: 'pointer', flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            {d._type === 'axehub' && (
              <span style={{ fontSize: 9, color: t.accent, fontFamily: FONT_MONO, background: t.accentGlow, padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>AxeHub</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT_MONO }}>{ip}</div>
          {d._type && d._type !== 'axehub' && <div style={{ fontSize: 10, color: t.info, fontFamily: FONT_MONO, textTransform: 'uppercase' }}>{d._type}</div>}
        </div>
        <StatusPill t={t} status={status} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, marginBottom: 10 }}>
        <NmKv t={t} label="Hashrate" value={fmtHashrate(hr)} />
        <NmKv t={t} label="Temp" value={temp != null ? `${temp}°C` : '—'} color={temp == null ? t.textMuted : temp > 70 ? t.danger : temp > 65 ? t.warning : t.success} />
        <NmKv t={t} label="Best Diff" value={fmtBestDiff(d.bestShare ?? d.best_share ?? d.bestDiff)} color={t.honey} />
        <NmKv t={t} label="Last Diff" value={fmtBestDiff(d.lastDiff ?? d.lastShare)} color={t.honey} />
        <NmKv t={t} label="Uptime" value={fmtUptime(d.uptime)} />
        <NmKv t={t} label="Shares A/R" value={fmtShares(d.shares_ok, d.shares_err)} />
        <NmKv t={t} label="RSSI" value={fmtRssi(d.rssi ?? d.wifi_rssi)} />
        <NmKv t={t} label="Version" value={d.version || '—'} badge={<FwBadge t={t} current={d.version} family={d._type === 'axehub' ? 'axehub' : 'lottominer'} fwLatest={fwLatest} />} />
      </div>
      <div style={{ display: 'flex', gap: 6, paddingTop: 8, borderTop: `1px solid ${t.border}` }}>
        {d._type !== 'axehub' && (
          <button onClick={() => onConfigure(ip)} style={{ ...btnStyle(t), fontSize: 11, flex: 1 }}><SettingsIcon size={11} /> Configure</button>
        )}
        <button onClick={() => onAction(ip, 'restart')} style={{ ...btnStyle(t), fontSize: 11, flex: 1 }}><RotateCcw size={11} /> Restart</button>
      </div>
    </Card>
  );
}

function NmKv({ t, label, value, color, badge }: { t: Theme; label: string; value: string; color?: string; badge?: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: FONT_MONO, fontWeight: 600, color: color ?? t.text, display: 'flex', alignItems: 'center' }}>{value}{badge}</div>
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

function Section({ t, label, children }: { t: Theme; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: t.accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT_MONO, marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  );
}
