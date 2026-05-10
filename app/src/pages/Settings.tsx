import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, Globe, Eye, Bell, Thermometer, Download, HelpCircle } from 'lucide-react';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, Toggle, Input, Select, FormField, Segmented, Spinner, btnStyle, HiveMark } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api } from '../api';
import type { AppSettings } from '../api';

const SECTIONS = [
  { id: 'general',       label: 'General',            Icon: SettingsIcon },
  { id: 'network',       label: 'Network & Discovery', Icon: Globe },
  { id: 'display',       label: 'Display',             Icon: Eye },
  { id: 'notifications', label: 'Notifications',       Icon: Bell },
  { id: 'thresholds',    label: 'Thresholds',          Icon: Thermometer },
  { id: 'backup',        label: 'Backup & Data',       Icon: Download },
  { id: 'about',         label: 'About',               Icon: HelpCircle },
];

export function Settings() {
  const params = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const { theme: t, dark, toggleDark, personality, setPersonality, density, setDensity } = useThemeStore();
  const { settings, setSettings } = useAppStore();
  const [section, setSection] = useState(params.section || 'general');
  const [saving, setSaving] = useState(false);
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings || {});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (settings) setLocalSettings(settings);
  }, [settings]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.settings.save(localSettings);
      setSettings(updated);
    } catch { /* save failed — keep local state */ }
    setSaving(false);
  };

  const upd = (patch: Partial<AppSettings>) => setLocalSettings(s => ({ ...s, ...patch }));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24 }}>
      {/* Side nav */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {SECTIONS.map(({ id, label, Icon }) => (
          <div key={id} onClick={() => { setSection(id); navigate(`/settings/${id}`); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, background: section === id ? t.accentGlow : 'transparent', color: section === id ? t.accent : t.textMuted, transition: 'all .12s' }}>
            <Icon size={15} />
            {label}
          </div>
        ))}
      </div>

      {/* Content */}
      <div>
        {section === 'general' && (
          <div>
            <SectionHeader t={t} title="General" desc="Basic preferences for your HashHive instance." />
            <Card t={t}>
              <SettingRow t={t} label="NMMiner Master IP" desc="IP address of your NMMiner swarm master.">
                <Input t={t} value={localSettings.nmminer_master || ''} onChange={v => upd({ nmminer_master: v })} placeholder="192.168.1.100" mono style={{ width: 200 }} />
              </SettingRow>
              <SettingRow t={t} label="Polling interval" desc="How often devices are queried (seconds).">
                <Input t={t} value={String(localSettings.refresh_interval || 30)} onChange={v => upd({ refresh_interval: Number(v) })} mono type="number" style={{ width: 80 }} />
              </SettingRow>
              <SettingRow t={t} label="Offline grace period" desc="Minutes before a device is marked offline.">
                <Input t={t} value={String(localSettings.offline_grace_minutes || 2)} onChange={v => upd({ offline_grace_minutes: Number(v) })} mono type="number" style={{ width: 80 }} />
              </SettingRow>
              <SettingRow t={t} label="Alert cooldown" desc="Minutes between repeated alerts for same device." last>
                <Input t={t} value={String(localSettings.alert_cooldown_minutes || 30)} onChange={v => upd({ alert_cooldown_minutes: Number(v) })} mono type="number" style={{ width: 80 }} />
              </SettingRow>
            </Card>
            <SaveBar t={t} saving={saving} onSave={save} />
          </div>
        )}

        {section === 'display' && (
          <div>
            <SectionHeader t={t} title="Display" desc="Customize how data is shown." />
            <Card t={t}>
              <SettingRow t={t} label="Theme">
                <Segmented t={t} value={dark ? 'dark' : 'light'} onChange={v => { if ((v === 'dark') !== dark) toggleDark(); }} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
              </SettingRow>
              <SettingRow t={t} label="Personality">
                <Segmented t={t} value={personality} onChange={p => setPersonality(p as 'hive' | 'foundry' | 'bloom')} options={[{ value: 'hive', label: 'Hive' }, { value: 'foundry', label: 'Foundry' }, { value: 'bloom', label: 'Bloom' }]} />
              </SettingRow>
              <SettingRow t={t} label="Density" last>
                <Segmented t={t} value={density} onChange={d => setDensity(d as 'compact' | 'cozy' | 'spacious')} options={[{ value: 'compact', label: 'Compact' }, { value: 'cozy', label: 'Cozy' }, { value: 'spacious', label: 'Spacious' }]} />
              </SettingRow>
            </Card>
            <Card t={t} style={{ marginTop: 14 }}>
              <SettingRow t={t} label="Electricity price (€/kWh)" desc="Used for profitability calculations." last>
                <Input t={t} value={String(localSettings.electricity_kwh_price || 0)} onChange={v => upd({ electricity_kwh_price: Number(v) })} mono type="number" style={{ width: 100 }} />
              </SettingRow>
            </Card>
            <SaveBar t={t} saving={saving} onSave={save} />
          </div>
        )}

        {section === 'thresholds' && (
          <div>
            <SectionHeader t={t} title="Thresholds" desc="Alert thresholds. Changes trigger real-time alerts." />
            <Card t={t}>
              {[
                ['temp_max', 'Chip temp max (°C)', '70'],
                ['vr_temp_max', 'VR temp max (°C)', '85'],
                ['hashrate_min', 'Hashrate min (GH/s)', '0'],
                ['error_rate_max', 'Share error rate max (%)', '2.0'],
              ].map(([key, label, placeholder], i, arr) => (
                <SettingRow key={key} t={t} label={label} last={i === arr.length - 1}>
                  <Input t={t} value={String((localSettings.thresholds as Record<string, number>)?.[key] ?? '')} onChange={v => upd({ thresholds: { ...localSettings.thresholds, [key]: Number(v) } })} mono type="number" style={{ width: 100 }} placeholder={placeholder} />
                </SettingRow>
              ))}
            </Card>
            <SaveBar t={t} saving={saving} onSave={save} />
          </div>
        )}

        {section === 'notifications' && (
          <div>
            <SectionHeader t={t} title="Notifications" desc="Delivery channels for alerts." />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { key: 'telegram', label: 'Telegram', color: t.info, fields: [['telegram_token', 'Bot token'], ['telegram_chat_id', 'Chat ID']] },
                { key: 'discord', label: 'Discord Webhook', color: t.accent, fields: [['discord_webhook', 'Webhook URL']] },
                { key: 'gotify', label: 'Gotify', color: t.success, fields: [['gotify_url', 'Gotify URL'], ['gotify_token', 'App token']] },
              ].map(({ key, label, color, fields }) => {
                const notifs = localSettings.notifications || {};
                const enabled = notifs[`${key}_enabled` as keyof typeof notifs] as boolean;
                return (
                  <Card key={key} t={t}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color }}>{label}</div>
                      <Toggle t={t} on={!!enabled} onChange={v => upd({ notifications: { ...notifs, [`${key}_enabled`]: v } })} />
                    </div>
                    {fields.map(([field, fieldLabel]) => (
                      <div key={field} style={{ marginBottom: 10 }}>
                        <FormField t={t} label={fieldLabel} value={String(notifs[field as keyof typeof notifs] || '')} onChange={v => upd({ notifications: { ...notifs, [field]: v } })} mono />
                      </div>
                    ))}
                    <button onClick={() => api.notifications.test().catch(() => {})} style={{ ...btnStyle(t), fontSize: 11, opacity: enabled ? 1 : 0.5 }} disabled={!enabled}>
                      Test
                    </button>
                  </Card>
                );
              })}
            </div>
            <SaveBar t={t} saving={saving} onSave={save} />
          </div>
        )}

        {section === 'backup' && (
          <div>
            <SectionHeader t={t} title="Backup & Data" desc="Export configuration and historical data." />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Card t={t}>
                <Label t={t} style={{ marginBottom: 8 }}>Configuration</Label>
                <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 12 }}>Export all settings, pools, and alert rules as JSON.</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <a href="/api/settings/backup" download="hashhive-config.json" style={{ ...btnStyle(t, 'primary'), textDecoration: 'none' }}>Export JSON</a>
                </div>
              </Card>
              <Card t={t}>
                <Label t={t} style={{ marginBottom: 8 }}>Alert log</Label>
                <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 12 }}>Download the current alert log as JSON.</div>
                <a href="/api/alerts?days=30" download="alerts.json" style={{ ...btnStyle(t), textDecoration: 'none' }}>Export alerts</a>
              </Card>
            </div>
          </div>
        )}

        {section === 'about' && (
          <div>
            <SectionHeader t={t} title="About" desc="" />
            <Card t={t}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', paddingBottom: 16, borderBottom: `1px solid ${t.border}` }}>
                <HiveMark size={52} primary={t.accent} secondary={t.honey} />
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>HashHive</div>
                  <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>Unified mining dashboard</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginTop: 18 }}>
                {[['License', 'MIT'], ['Backend', 'FastAPI + Python'], ['Frontend', 'React 18 + TypeScript']].map(([k, v]) => (
                  <div key={k}>
                    <Label t={t} style={{ marginBottom: 4 }}>{k}</Label>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 13 }}>{v}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {section === 'network' && (
          <div>
            <SectionHeader t={t} title="Network & Discovery" desc="Configure AxeOS device list." />
            <Card t={t}>
              <Label t={t} style={{ marginBottom: 10 }}>AxeOS Devices</Label>
              {(localSettings.axeos_devices || []).map((d, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 32px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <Input t={t} value={d.ip} onChange={v => { const devs = [...(localSettings.axeos_devices || [])]; devs[i] = { ...devs[i], ip: v }; upd({ axeos_devices: devs }); }} placeholder="IP" mono />
                  <Input t={t} value={d.name} onChange={v => { const devs = [...(localSettings.axeos_devices || [])]; devs[i] = { ...devs[i], name: v }; upd({ axeos_devices: devs }); }} placeholder="Name" mono={false} />
                  <Select t={t} value={d.type} options={[['bitaxe', 'BitAxe'], ['nerdaxe', 'NerdAxe']]} onChange={v => { const devs = [...(localSettings.axeos_devices || [])]; devs[i] = { ...devs[i], type: v }; upd({ axeos_devices: devs }); }} />
                  <button onClick={() => upd({ axeos_devices: localSettings.axeos_devices?.filter((_, j) => j !== i) })} style={{ ...btnStyle(t, 'danger'), padding: '6px 8px' }}>✕</button>
                </div>
              ))}
              <button onClick={() => upd({ axeos_devices: [...(localSettings.axeos_devices || []), { ip: '', name: '', type: 'bitaxe' }] })} style={{ ...btnStyle(t), fontSize: 12 }}>+ Add device</button>
            </Card>
            <SaveBar t={t} saving={saving} onSave={save} />
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ t, title, desc }: { t: Theme; title: string; desc: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</div>
      <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>{desc}</div>
    </div>
  );
}

function SettingRow({ t, label, desc, children, last }: { t: Theme; label: string; desc?: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 18, alignItems: 'center', padding: '16px 0', borderBottom: last ? 'none' : `1px solid ${t.border}` }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>{desc}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function SaveBar({ t, saving, onSave }: { t: Theme; saving: boolean; onSave: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
      <button onClick={onSave} disabled={saving} style={{ ...btnStyle(t, 'primary'), opacity: saving ? 0.7 : 1 }}>
        {saving ? <><Spinner t={t} size={12} /> Saving…</> : 'Save changes'}
      </button>
    </div>
  );
}
