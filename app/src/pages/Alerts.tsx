import React, { useState, useEffect } from 'react';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, Pill, StatusPill, Toggle, Segmented, SkeletonRow, useLoading, EmptyState, btnStyle } from '../components/primitives';
import { FONT_MONO } from '../tokens';
import { api } from '../api';
import type { Alert } from '../api';
import { Bell, Check, Eye, Download, Plus, Edit, MoreHorizontal } from 'lucide-react';

export function Alerts() {
  const { theme: t } = useThemeStore();
  const [tab, setTab] = useState('feed');

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: `1px solid ${t.border}`, gap: 0, marginBottom: 16 }}>
        {[['feed', 'Alert feed'], ['rules', 'Rules'], ['channels', 'Channels']].map(([id, label]) => (
          <div key={id} onClick={() => setTab(id)} style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: tab === id ? t.accent : t.textMuted, borderBottom: tab === id ? `2px solid ${t.accent}` : '2px solid transparent', marginBottom: -1 }}>
            {label}
          </div>
        ))}
      </div>
      {tab === 'feed'     && <AlertFeed />}
      {tab === 'rules'    && <AlertRules />}
      {tab === 'channels' && <AlertChannels />}
    </div>
  );
}

function AlertFeed() {
  const { theme: t } = useThemeStore();
  const { unreadAlerts, setUnreadAlerts } = useAppStore();
  const loading = useLoading(600);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [sev, setSev] = useState('all');
  const [state, setState] = useState('all');
  const [selected, setSelected] = useState(new Set<string>());

  useEffect(() => {
    api.alerts.list(7).then(setAlerts).catch(() => {});
  }, []);

  const markAllRead = async () => {
    await api.alerts.readAll().catch(() => {});
    setAlerts(alerts.map(a => ({ ...a, read: true })));
    setUnreadAlerts(0);
  };

  const filtered = alerts.filter(a => {
    if (sev !== 'all' && a.severity !== sev) return false;
    if (state === 'unread' && a.read) return false;
    if (state === 'unresolved' && a.resolved) return false;
    return true;
  });

  if (loading) {
    return (
      <Card t={t} noPad>
        {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} t={t} cols={['20px', '80px', '200px', '100px', '60px']} height={68} />)}
      </Card>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <Segmented t={t} value={sev} onChange={setSev} options={[{ value: 'all', label: 'All' }, { value: 'critical', label: 'Critical' }, { value: 'warning', label: 'Warning' }, { value: 'info', label: 'Info' }]} />
        <Segmented t={t} value={state} onChange={setState} options={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }, { value: 'unresolved', label: 'Open' }]} />
        <div style={{ flex: 1 }} />
        {unreadAlerts > 0 && <button onClick={markAllRead} style={{ ...btnStyle(t), fontSize: 12 }}><Check size={13} /> Mark all read</button>}
        <button style={{ ...btnStyle(t), fontSize: 12 }}><Download size={13} /> Export</button>
      </div>

      <Card t={t} noPad>
        {filtered.length === 0 && (
          <EmptyState t={t} icon={<Bell size={32} />} title={sev === 'all' && state === 'all' ? 'All clear' : 'No matching alerts'} detail={sev === 'all' && state === 'all' ? 'No active alerts — your fleet is running smoothly.' : 'Adjust the severity or status filter.'} />
        )}
        {filtered.map((a, i) => {
          const sevColor = a.severity === 'critical' ? t.danger : a.severity === 'warning' ? t.warning : t.info;
          const sel = selected.has(a.id);
          return (
            <div key={a.id} style={{ display: 'flex', gap: 12, padding: '14px 18px', borderBottom: i === filtered.length - 1 ? 'none' : `1px solid ${t.border}`, alignItems: 'flex-start', background: sel ? t.accentGlow : !a.read ? t.surface2 : 'transparent', borderLeft: `3px solid ${a.read ? 'transparent' : sevColor}` }}>
              <input type="checkbox" checked={sel} onChange={() => { const s = new Set(selected); if (s.has(a.id)) s.delete(a.id); else s.add(a.id); setSelected(s); }} style={{ accentColor: t.accent, marginTop: 4 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Pill t={t} sev={a.severity === 'critical' ? 'critical' : a.severity as 'warning' | 'info'}>{a.severity}</Pill>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{a.title || a.message}</span>
                  {a.device && <span style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT_MONO }}>· {a.device}</span>}
                  {a.resolved && <Pill t={t} sev="success"><Check size={10} /> resolved</Pill>}
                </div>
                {a.detail && <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>{a.detail}</div>}
                <div style={{ fontSize: 11, color: t.textDim, fontFamily: FONT_MONO, marginTop: 6 }}>{a.when || (a.timestamp ? new Date(a.timestamp).toLocaleString() : '')}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {!a.read && <button onClick={() => setAlerts(alerts.map(x => x.id === a.id ? { ...x, read: true } : x))} style={{ ...btnStyle(t), padding: '5px 10px', fontSize: 11 }}><Eye size={11} /> Mark read</button>}
                {!a.resolved && <button onClick={() => setAlerts(alerts.map(x => x.id === a.id ? { ...x, resolved: true } : x))} style={{ ...btnStyle(t), padding: '5px 10px', fontSize: 11 }}><Check size={11} /> Resolve</button>}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

const MOCK_RULES = [
  { id: 'r1', name: 'Device offline', condition: 'no response > 5 min', severity: 'critical', channels: ['telegram'], enabled: true, fired24h: 3, scope: 'all devices' },
  { id: 'r2', name: 'Chip temperature high', condition: 'chip temp > 70 °C', severity: 'warning', channels: ['telegram'], enabled: true, fired24h: 12, scope: 'all devices' },
  { id: 'r3', name: 'Share error rate', condition: 'rejects > 3% over 15 min', severity: 'warning', channels: ['email'], enabled: true, fired24h: 4, scope: 'all devices' },
  { id: 'r4', name: 'Pool disconnected', condition: 'stratum drop > 30 s', severity: 'critical', channels: ['telegram'], enabled: true, fired24h: 1, scope: 'all devices' },
  { id: 'r5', name: 'Hashrate drop', condition: 'hr < 80% expected for 10 min', severity: 'warning', channels: ['email'], enabled: false, fired24h: 2, scope: 'all devices' },
];

function AlertRules() {
  const { theme: t } = useThemeStore();
  const [rules, setRules] = useState(MOCK_RULES);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: t.textMuted }}>Rules are evaluated every 10 seconds.</div>
        <button style={{ ...btnStyle(t, 'primary') }}><Plus size={13} /> New rule</button>
      </div>
      <Card t={t} noPad>
        <div style={{ display: 'grid', gridTemplateColumns: '40px 1.5fr 1fr 0.9fr 1fr 100px 50px', gap: 10, padding: '10px 16px', background: t.surface2, borderBottom: `1px solid ${t.border}`, fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT_MONO, fontWeight: 600 }}>
          <span /><span>Rule</span><span>Condition</span><span>Severity</span><span>Channels</span><span>Fired 24h</span><span />
        </div>
        {rules.map((r, i) => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '40px 1.5fr 1fr 0.9fr 1fr 100px 50px', gap: 10, padding: '14px 16px', borderBottom: i === rules.length - 1 ? 'none' : `1px solid ${t.border}`, alignItems: 'center', fontSize: 13, opacity: r.enabled ? 1 : 0.55 }}>
            <Toggle t={t} on={r.enabled} onChange={v => setRules(rules.map(x => x.id === r.id ? { ...x, enabled: v } : x))} size="sm" />
            <div>
              <div style={{ fontWeight: 600 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>Scope: {r.scope}</div>
            </div>
            <div style={{ fontSize: 12, fontFamily: FONT_MONO, color: t.accent }}>{r.condition}</div>
            <Pill t={t} sev={r.severity === 'critical' ? 'critical' : 'warning'}>{r.severity}</Pill>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {r.channels.map(c => <span key={c} style={{ padding: '2px 7px', background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 4, fontSize: 10, fontFamily: FONT_MONO }}>{c}</span>)}
            </div>
            <div style={{ fontFamily: FONT_MONO, color: r.fired24h > 0 ? t.warning : t.textMuted }}>{r.fired24h}x</div>
            <div style={{ color: t.textMuted, display: 'flex', gap: 4 }}>
              <Edit size={13} style={{ cursor: 'pointer' }} />
              <MoreHorizontal size={13} style={{ cursor: 'pointer' }} />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

const CHANNELS = [
  { id: 'telegram', name: 'Telegram', status: 'connected', detail: '@hashhive_alerts', color: '#38bdf8' },
  { id: 'discord', name: 'Discord Webhook', status: 'connected', detail: 'webhook · #mining-alerts', color: '#a855f7' },
  { id: 'email', name: 'Email (SMTP)', status: 'disconnected', detail: 'Configure SMTP settings', color: '#fbbf24' },
];

function AlertChannels() {
  const { theme: t } = useThemeStore();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
      {CHANNELS.map(c => (
        <Card key={c.id} t={t}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: c.color }}>{c.name}</div>
              <div style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT_MONO, marginTop: 2 }}>{c.detail}</div>
            </div>
            <Pill t={t} sev={c.status === 'connected' ? 'success' : 'muted'}>{c.status}</Pill>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{ ...btnStyle(t), fontSize: 11 }}>Test</button>
            <button style={{ ...btnStyle(t), fontSize: 11 }}>Configure</button>
            {c.status === 'disconnected' && <button style={{ ...btnStyle(t, 'primary'), fontSize: 11, marginLeft: 'auto' }}>Connect</button>}
          </div>
        </Card>
      ))}
    </div>
  );
}
