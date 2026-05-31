import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, Eye, Bell, Thermometer, Download, HelpCircle, Lock } from 'lucide-react';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, Toggle, Input, FormField, Segmented, btnStyle, HiveMark } from '../components/primitives';
import { FONT_MONO } from '../tokens';
import { api } from '../api';
import type { AppSettings } from '../api';
import { toast } from '../store/toast';
import { useMobile } from '../hooks/useWindowWidth';
import { BackupSection, SectionHeader, SettingRow, SecuritySection, SaveBar } from '../components/settings/SettingsParts';

const SECTIONS = [
  { id: 'general',       label: 'General',            Icon: SettingsIcon },
  { id: 'display',       label: 'Display',             Icon: Eye },
  { id: 'notifications', label: 'Notifications',       Icon: Bell },
  { id: 'thresholds',    label: 'Thresholds',          Icon: Thermometer },
  { id: 'security',      label: 'Security',            Icon: Lock },
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
  const latestSettings = useRef(localSettings);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    latestSettings.current = localSettings;
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (settings) setLocalSettings(settings);
  }, [settings]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const updated = await api.settings.save(latestSettings.current);
      setSettings(updated);
      toast('Settings saved');
    } catch {
      toast('Failed to save settings', 'error');
    }
    setSaving(false);
  }, [setSettings]);

  const upd = (patch: Partial<AppSettings>) => setLocalSettings(s => ({ ...s, ...patch }));

  // For toggles: patch state and debounce-save after 500ms so rapid changes coalesce.
  const updToggle = (patch: Partial<AppSettings>) => {
    setLocalSettings(s => {
      const next = { ...s, ...patch };
      latestSettings.current = next;
      return next;
    });
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(save, 500);
  };

  const mobile = useMobile();

  return (
    <>
    <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '220px 1fr', gap: mobile ? 16 : 24 }}>
      {/* Side nav */}
      <div style={mobile
        ? { display: 'flex', flexDirection: 'row', gap: 4, overflowX: 'auto', paddingBottom: 4 }
        : { display: 'flex', flexDirection: 'column', gap: 2 }}>
        {SECTIONS.map(({ id, label, Icon }) => (
          <div key={id} onClick={() => { setSection(id); navigate(`/settings/${id}`); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: mobile ? '8px 12px' : '10px 12px', borderRadius: 8, cursor: 'pointer', fontSize: mobile ? 12 : 13, fontWeight: 500, background: section === id ? t.accentGlow : 'transparent', color: section === id ? t.accent : t.textMuted, transition: 'all .12s', whiteSpace: 'nowrap', flexShrink: 0 }}>
            <Icon size={14} />
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

            <SectionHeader t={t} title="Auto-Fan (AxeOS)" desc="Server-side PID fan control to hold a target chip temperature. Overrides on-device auto-fan while enabled." />
            <Card t={t}>
              {(() => { const af = localSettings.auto_fan || {}; return (
                <>
                  <SettingRow t={t} label="Enable PID auto-fan">
                    <Toggle t={t} on={!!af.enabled} onChange={v => updToggle({ auto_fan: { ...af, enabled: v } })} />
                  </SettingRow>
                  {([
                    ['target_temp', 'Target temp (°C)', '60'],
                    ['min_pct', 'Min fan (%)', '30'],
                    ['max_pct', 'Max fan (%)', '100'],
                    ['interval_seconds', 'Interval (s)', '15'],
                  ] as [string, string, string][]).map(([key, label, ph], i, arr) => (
                    <SettingRow key={key} t={t} label={label} last={i === arr.length - 1}>
                      <Input t={t} value={String((af as Record<string, number>)[key] ?? '')} onChange={v => upd({ auto_fan: { ...af, [key]: Number(v) } })} mono type="number" style={{ width: 100 }} placeholder={ph} />
                    </SettingRow>
                  ))}
                </>
              ); })()}
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
                { key: 'ntfy', label: 'Ntfy', color: t.honey, fields: [['ntfy_url', 'Server URL'], ['ntfy_topic', 'Topic'], ['ntfy_token', 'Access token (optional)']] },
              ].map(({ key, label, color, fields }) => {
                const notifs = localSettings.notifications || {};
                const enabled = notifs[`${key}_enabled` as keyof typeof notifs] as boolean;
                return (
                  <Card key={key} t={t}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color }}>{label}</div>
                      <Toggle t={t} on={!!enabled} onChange={v => updToggle({ notifications: { ...notifs, [`${key}_enabled`]: v } })} />
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

            <DiscordDashboardCard t={t} localSettings={localSettings} upd={upd} updToggle={updToggle} />

            <SaveBar t={t} saving={saving} onSave={save} />
          </div>
        )}

        {section === 'security' && (
          <SecuritySection t={t} localSettings={localSettings} updToggle={updToggle} />
        )}

        {section === 'backup' && (
          <BackupSection t={t} />
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

      </div>
    </div>
    </>
  );
}

function DiscordDashboardCard({ t, localSettings, upd, updToggle }: {
  t: import('../tokens').Theme;
  localSettings: AppSettings;
  upd: (patch: Partial<AppSettings>) => void;
  updToggle: (patch: Partial<AppSettings>) => void;
}) {
  const dd = localSettings.discord_dashboard || {};
  const enabled = !!dd.enabled;
  const [testing, setTesting] = useState(false);
  // Falls back to the Discord alert webhook when no dedicated one is set.
  const hasWebhook = !!(dd.webhook || localSettings.notifications?.discord_webhook);

  const runTest = async () => {
    setTesting(true);
    try {
      await api.notifications.testDiscordDashboard();
      toast('Discord dashboard updated');
    } catch {
      toast('Failed to update Discord dashboard', 'error');
    }
    setTesting(false);
  };

  return (
    <Card t={t} style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: t.accent }}>Live Discord Dashboard</div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>
            A single fleet-summary embed that updates itself in place via webhook.
          </div>
        </div>
        <Toggle t={t} on={enabled} onChange={v => updToggle({ discord_dashboard: { ...dd, enabled: v } })} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <FormField t={t} label="Webhook URL (optional — uses the Discord alert webhook if blank)"
          value={String(dd.webhook || '')} onChange={v => upd({ discord_dashboard: { ...dd, webhook: v } })} mono
          placeholder="https://discord.com/api/webhooks/…" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <FormField t={t} label="Update interval (seconds, min 30)" type="number"
          value={String(dd.interval_seconds ?? 60)}
          onChange={v => upd({ discord_dashboard: { ...dd, interval_seconds: Math.max(30, Number(v) || 60) } })} mono />
      </div>
      <button onClick={runTest} disabled={!hasWebhook || testing}
        style={{ ...btnStyle(t), fontSize: 11, opacity: hasWebhook && !testing ? 1 : 0.5 }}>
        {testing ? 'Sending…' : 'Send now'}
      </button>
    </Card>
  );
}
