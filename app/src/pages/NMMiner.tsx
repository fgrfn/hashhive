import React, { useState, useEffect } from 'react';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, StatusPill, SkeletonRow, useLoading, Modal, FormField, Toggle, Select, btnStyle } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api, fmtUptime, fmtBestDiff, getHashrate, getTemp, getNmStatus } from '../api';
import type { NMMinerConfig } from '../api';
import { Cpu, Edit3, ChevronDown } from 'lucide-react';

export function NMMiner() {
  const { theme: t } = useThemeStore();
  const { devices } = useAppStore();
  const loading = useLoading(600);
  const [editDevice, setEditDevice] = useState<string | null>(null);
  const [config, setConfig] = useState<NMMinerConfig | null>(null);
  const [saving, setSaving] = useState(false);

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
    } catch {}
    setSaving(false);
    setEditDevice(null);
  };

  const cols = ['IP', 'Name', 'Status', 'Hashrate', 'Temp', 'Pool', 'Worker', 'Uptime', 'Best Share', 'Actions'];
  const colWidths = ['120px', '1fr', '90px', '110px', '80px', '160px', '160px', '80px', '90px', '60px'];

  if (loading) {
    return (
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

  return (
    <>
      <Card t={t} noPad>
        <div style={{ padding: '10px 18px', background: t.surface2, borderBottom: `1px solid ${t.border}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: colWidths.join(' '), gap: 12 }}>
            {cols.map(c => <Label key={c} t={t}>{c}</Label>)}
          </div>
        </div>
        {devices.map((d, i) => {
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
            <div key={ip} style={{ display: 'grid', gridTemplateColumns: colWidths.join(' '), gap: 12, padding: '12px 18px', borderBottom: i === devices.length - 1 ? 'none' : `1px solid ${t.border}`, alignItems: 'center', fontSize: 13 }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = t.surface2}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
            >
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

function Section({ t, label, children }: { t: Theme; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: t.accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT_MONO, marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  );
}
