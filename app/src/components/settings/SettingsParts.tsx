// Shared Settings building blocks (extracted from pages/Settings.tsx).
import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/app';
import { Card, Label, Toggle, Input, btnStyle } from '../primitives';
import { FONT_MONO, type Theme } from '../../tokens';
import { api } from '../../api';
import type { AppSettings } from '../../api';
import { toast } from '../../store/toast';
import { Download, Upload, Trash2, AlertTriangle } from 'lucide-react';

export function BackupSection({ t }: { t: Theme }) {
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

      <PurgeCard t={t} />
    </div>
  );
}

function PurgeCard({ t }: { t: Theme }) {
  const { setSettings } = useAppStore();
  const [cats, setCats] = useState<Array<{ id: string; label: string }>>([]);
  const [selected, setSelected] = useState(new Set<string>());
  const [confirming, setConfirming] = useState(false);
  const [purging, setPurging] = useState(false);

  useEffect(() => {
    api.settings.purgeCategories().then(setCats).catch(() => {});
  }, []);

  const toggle = (id: string) => setSelected(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  const purge = async () => {
    setPurging(true);
    try {
      await api.settings.purge(Array.from(selected));
      setSettings(await api.settings.get());
      toast('Selected data purged');
      setSelected(new Set());
      setConfirming(false);
    } catch {
      toast('Purge failed', 'error');
    }
    setPurging(false);
  };

  return (
    <Card t={t} style={{ marginTop: 14, borderColor: `${t.danger}55` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Trash2 size={15} color={t.danger} />
        <Label t={t} style={{ margin: 0, color: t.danger }}>Purge data</Label>
      </div>
      <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 14 }}>
        Reset selected data to empty. This cannot be undone — export a backup first if unsure.
        Auth and general preferences are never affected.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: 14 }}>
        {cats.map(c => {
          const on = selected.has(c.id);
          return (
            <label key={c.id} onClick={() => toggle(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, border: `1px solid ${on ? t.danger : t.border}`, background: on ? `${t.danger}18` : t.surface }}>
              <input type="checkbox" checked={on} onChange={() => toggle(c.id)} onClick={e => e.stopPropagation()} style={{ accentColor: t.danger }} />
              {c.label}
            </label>
          );
        })}
      </div>
      {!confirming ? (
        <button onClick={() => setConfirming(true)} disabled={selected.size === 0}
          style={{ ...btnStyle(t), color: selected.size ? t.danger : t.textMuted, borderColor: selected.size ? `${t.danger}88` : t.border, opacity: selected.size ? 1 : 0.5 }}>
          <Trash2 size={13} /> Purge {selected.size || ''} {selected.size === 1 ? 'category' : 'categories'}
        </button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', background: `${t.danger}18`, border: `1px solid ${t.danger}55`, borderRadius: 8 }}>
          <AlertTriangle size={15} color={t.danger} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, flex: 1 }}>
            Permanently clear: <strong>{cats.filter(c => selected.has(c.id)).map(c => c.label).join(', ')}</strong>?
          </span>
          <button onClick={() => setConfirming(false)} style={btnStyle(t)}>Cancel</button>
          <button onClick={purge} disabled={purging}
            style={{ ...btnStyle(t), background: t.danger, color: '#fff', borderColor: t.danger, opacity: purging ? 0.7 : 1 }}>
            {purging ? 'Purging…' : 'Yes, purge'}
          </button>
        </div>
      )}
    </Card>
  );
}

export function SectionHeader({ t, title, desc }: { t: Theme; title: string; desc: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</div>
      <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>{desc}</div>
    </div>
  );
}

export function SettingRow({ t, label, desc, children, last }: { t: Theme; label: string; desc?: string; children: React.ReactNode; last?: boolean }) {
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

export function SecuritySection({ t, localSettings, updToggle }: {
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
