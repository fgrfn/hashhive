import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, Globe, Eye, Bell, Thermometer, Download, HelpCircle, Lock, Radar, Upload } from 'lucide-react';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, Toggle, Input, Select, FormField, Segmented, Spinner, btnStyle, HiveMark } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api } from '../api';
import type { AppSettings } from '../api';
import { toast } from '../store/toast';
import { useMobile } from '../hooks/useWindowWidth';
import { DiscoveryModal } from '../components/DiscoveryModal';

const SECTIONS = [
  { id: 'general',       label: 'General',            Icon: SettingsIcon },
  { id: 'network',       label: 'Network & Discovery', Icon: Globe },
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
  const [discoveryOpen, setDiscoveryOpen] = useState(false);

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
            <Card t={t} style={{ marginBottom: 14 }}>
              <SettingRow t={t} label="Auto-Discover Devices" desc="Scan your local network to find NMMiner and BitAxe/NerdAxe devices automatically." last>
                <button onClick={() => setDiscoveryOpen(true)} style={{ ...btnStyle(t, 'primary'), fontSize: 12 }}>
                  <Radar size={13} /> Discover
                </button>
              </SettingRow>
            </Card>
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
    {discoveryOpen && <DiscoveryModal onClose={() => setDiscoveryOpen(false)} />}
    </>
  );
}

function BackupSection({ t }: { t: Theme }) {
  const { setSettings } = useAppStore();
  const [importing, setImporting] = useState(false);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Not an object');
        setPending(parsed);
      } catch {
        toast('Invalid backup file — expected a JSON object', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const confirmImport = async () => {
    if (!pending) return;
    setImporting(true);
    try {
      await api.settings.restore(pending);
      const updated = await api.settings.get();
      setSettings(updated);
      toast('Configuration restored — settings reloaded');
      setPending(null);
    } catch {
      toast('Restore failed', 'error');
    }
    setImporting(false);
  };

  return (
    <div>
      <SectionHeader t={t} title="Backup & Data" desc="Export and import your HashHive configuration." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {/* Export */}
        <Card t={t}>
          <Label t={t} style={{ marginBottom: 8 }}>Export configuration</Label>
          <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 12 }}>Download all settings, pools, and alert rules as JSON.</div>
          <a href="/api/settings/backup" download="hashhive-config.json" style={{ ...btnStyle(t, 'primary'), textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Download size={13} /> Export JSON
          </a>
        </Card>

        {/* Import */}
        <Card t={t} style={{ borderColor: pending ? t.accent : undefined }}>
          <Label t={t} style={{ marginBottom: 8 }}>Import configuration</Label>
          <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 12 }}>
            Restore settings from a previously exported JSON file. Existing settings will be overwritten.
          </div>
          <input ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} style={{ display: 'none' }} />
          {!pending ? (
            <button onClick={() => fileRef.current?.click()} style={{ ...btnStyle(t), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Upload size={13} /> Choose file…
            </button>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: t.accent, fontFamily: FONT_MONO, marginBottom: 10, padding: '6px 10px', background: t.accentGlow, borderRadius: 6 }}>
                Ready to restore — {Object.keys(pending).length} keys loaded
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPending(null)} style={btnStyle(t)}>Cancel</button>
                <button onClick={confirmImport} disabled={importing} style={{ ...btnStyle(t, 'primary'), opacity: importing ? 0.7 : 1 }}>
                  {importing ? 'Restoring…' : 'Confirm restore'}
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* Alert log */}
        <Card t={t}>
          <Label t={t} style={{ marginBottom: 8 }}>Alert log</Label>
          <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 12 }}>Download the last 30 days of alert history as JSON.</div>
          <a href="/api/alerts?days=30" download="hashhive-alerts.json" style={{ ...btnStyle(t), textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Download size={13} /> Export alerts
          </a>
        </Card>
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

function SecuritySection({ t, localSettings, updToggle }: {
  t: Theme;
  localSettings: AppSettings;
  updToggle: (patch: Partial<AppSettings>) => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const authEnabled = localSettings.auth?.enabled ?? false;

  const savePassword = async () => {
    if (!password || password !== confirm) { setPwMsg({ ok: false, text: 'Passwords do not match.' }); return; }
    if (password.length < 8) { setPwMsg({ ok: false, text: 'Minimum 8 characters.' }); return; }
    setPwSaving(true); setPwMsg(null);
    try {
      await api.settings.save({ ...localSettings, auth: { ...localSettings.auth, enabled: authEnabled, password } });
      setPassword(''); setConfirm('');
      setPwMsg({ ok: true, text: 'Password updated.' });
      toast('Password updated');
    } catch {
      setPwMsg({ ok: false, text: 'Save failed.' });
      toast('Failed to update password', 'error');
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div>
      <SectionHeader t={t} title="Security" desc="Password-protect the dashboard when exposed to the internet. Requires HTTPS for full protection." />
      <Card t={t}>
        <SettingRow t={t} label="Enable authentication" desc="Require a password to access the dashboard.">
          <Toggle t={t} on={authEnabled} onChange={v => updToggle({ auth: { ...localSettings.auth, enabled: v } })} />
        </SettingRow>
        {authEnabled && (
          <div style={{ paddingTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Change password</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
              <Input t={t} type="password" value={password} onChange={setPassword} placeholder="New password (min 8 chars)" mono={false} />
              <Input t={t} type="password" value={confirm} onChange={setConfirm} placeholder="Confirm new password" mono={false} />
              {pwMsg && (
                <div style={{ fontSize: 12, color: pwMsg.ok ? t.success : t.danger, padding: '6px 10px', background: (pwMsg.ok ? t.success : t.danger) + '18', borderRadius: 6 }}>
                  {pwMsg.text}
                </div>
              )}
              <button onClick={savePassword} disabled={!password || !confirm || pwSaving} style={{ ...btnStyle(t, 'primary'), opacity: password && confirm && !pwSaving ? 1 : 0.5, alignSelf: 'flex-start' }}>
                {pwSaving ? 'Saving…' : 'Set password'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 16 }}>
              Recovery: set <code style={{ fontFamily: FONT_MONO, background: t.surface2, padding: '1px 4px', borderRadius: 3 }}>HASHHIVE_PASSWORD=...</code> env var to override the password on every start — useful if locked out.
            </div>
          </div>
        )}
      </Card>
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
