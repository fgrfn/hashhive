import React, { useState, useEffect } from 'react';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Pill, Toggle, Segmented, SkeletonRow, SkeletonCard, EmptyState, btnStyle } from '../components/primitives';
import { FONT_MONO } from '../tokens';
import { api } from '../api';
import type { Alert, AlertRule, NotificationChannel } from '../api';
import { Bell, Check, Eye, Download, Settings as SettingsIcon } from 'lucide-react';
import { useMobile } from '../hooks/useWindowWidth';
import { useNavigate } from 'react-router-dom';

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
  const [fetched, setFetched] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [sev, setSev] = useState('all');
  const [state, setState] = useState('all');
  const [selected, setSelected] = useState(new Set<string>());

  useEffect(() => {
    api.alerts.list(7).then(setAlerts).catch(() => {}).finally(() => setFetched(true));
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

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['timestamp', 'severity', 'source', 'device', 'kind', 'message'];
    const rows = filtered.map(a => [a.timestamp || a.when || '', a.severity, a.source || '', a.device || '', a.kind || '', a.title || a.message]);
    const csv = [header, ...rows].map(r => r.map(esc).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `hashhive-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!fetched) {
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
        <button onClick={exportCsv} disabled={filtered.length === 0} style={{ ...btnStyle(t), fontSize: 12, opacity: filtered.length === 0 ? 0.5 : 1 }}><Download size={13} /> Export</button>
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

function AlertRules() {
  const { theme: t } = useThemeStore();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const mobile = useMobile();

  useEffect(() => {
    api.alerts.rules().then(setRules).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const toggle = async (r: AlertRule, on: boolean) => {
    setRules(rs => rs.map(x => x.kind === r.kind ? { ...x, enabled: on } : x));
    await api.alerts.updateRule(r.kind, { enabled: on }).catch(() => {
      setRules(rs => rs.map(x => x.kind === r.kind ? { ...x, enabled: !on } : x));  // revert on failure
    });
  };

  const startEdit = (r: AlertRule) => { setEditing(r.kind); setDraft(String(r.threshold ?? '')); };

  const saveEdit = async (r: AlertRule) => {
    const value = Number(draft);
    setEditing(null);
    if (!Number.isFinite(value) || value === r.threshold) return;
    setRules(rs => rs.map(x => x.kind === r.kind ? { ...x, threshold: value } : x));
    await api.alerts.updateRule(r.kind, { threshold: value })
      .then(() => api.alerts.rules().then(setRules))  // re-pull to refresh the condition string
      .catch(() => {});
  };

  if (!loaded) {
    return <Card t={t} noPad>{Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} t={t} cols={['40px', '200px', '160px', '90px', '70px']} height={60} />)}</Card>;
  }

  const renderThreshold = (r: AlertRule) => {
    if (!r.threshold_key) return <span style={{ color: t.textDim }}>—</span>;
    if (editing === r.kind) {
      return (
        <input
          autoFocus type="number" value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => saveEdit(r)}
          onKeyDown={e => { if (e.key === 'Enter') saveEdit(r); if (e.key === 'Escape') setEditing(null); }}
          style={{ width: 72, background: t.surface2, border: `1px solid ${t.accent}`, borderRadius: 4, color: t.text, fontFamily: FONT_MONO, fontSize: 12, padding: '3px 6px' }}
        />
      );
    }
    return (
      <span onClick={() => startEdit(r)} title="Click to edit threshold" style={{ cursor: 'pointer', fontFamily: FONT_MONO, fontSize: 12, color: t.accent, borderBottom: `1px dashed ${t.border}` }}>
        {r.threshold}{r.unit ? ` ${r.unit}` : ''}
      </span>
    );
  };

  return (
    <div>
      <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 12 }}>
        These are HashHive's built-in detectors. Toggle one off to silence it, or click a threshold to tune it.
      </div>
      {mobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rules.map(r => (
            <Card key={r.kind} t={t} style={{ opacity: r.enabled ? 1 : 0.55 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{r.label}</div>
                  <div style={{ fontSize: 12, fontFamily: FONT_MONO, color: t.accent, marginTop: 3 }}>{r.condition}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Pill t={t} sev={r.severity === 'critical' ? 'critical' : r.severity === 'info' ? 'info' : 'warning'}>{r.severity}</Pill>
                  <Toggle t={t} on={r.enabled} onChange={v => toggle(r, v)} size="sm" />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>{renderThreshold(r)}</div>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: r.fired24h > 0 ? t.warning : t.textMuted }}>{r.fired24h}× · 24h</span>
              </div>
            </Card>
          ))}
        </div>
      ) : (
      <Card t={t} noPad>
        <div style={{ display: 'grid', gridTemplateColumns: '50px 1.5fr 1.4fr 0.9fr 100px 90px', gap: 10, padding: '10px 16px', background: t.surface2, borderBottom: `1px solid ${t.border}`, fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT_MONO, fontWeight: 600 }}>
          <span /><span>Rule</span><span>Condition</span><span>Severity</span><span>Threshold</span><span>Fired 24h</span>
        </div>
        {rules.map((r, i) => (
          <div key={r.kind} style={{ display: 'grid', gridTemplateColumns: '50px 1.5fr 1.4fr 0.9fr 100px 90px', gap: 10, padding: '14px 16px', borderBottom: i === rules.length - 1 ? 'none' : `1px solid ${t.border}`, alignItems: 'center', fontSize: 13, opacity: r.enabled ? 1 : 0.55 }}>
            <Toggle t={t} on={r.enabled} onChange={v => toggle(r, v)} size="sm" />
            <div style={{ fontWeight: 600 }}>{r.label}</div>
            <div style={{ fontSize: 12, fontFamily: FONT_MONO, color: t.accent }}>{r.condition}</div>
            <Pill t={t} sev={r.severity === 'critical' ? 'critical' : r.severity === 'info' ? 'info' : 'warning'}>{r.severity}</Pill>
            <div>{renderThreshold(r)}</div>
            <div style={{ fontFamily: FONT_MONO, color: r.fired24h > 0 ? t.warning : t.textMuted }}>{r.fired24h}×</div>
          </div>
        ))}
      </Card>
      )}
    </div>
  );
}

function AlertChannels() {
  const { theme: t } = useThemeStore();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    api.alerts.channels().then(setChannels).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await api.alerts.test().catch(() => ({ results: {} as Record<string, boolean> }));
    setTestResult(res.results || {});
    setTesting(false);
  };

  if (!loaded) {
    return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} t={t} height={120} />)}</div>;
  }

  const anyConnected = channels.some(c => c.status === 'connected');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 13, color: t.textMuted }}>Channels are configured on the Settings page. Send a test to every connected channel below.</div>
        <button onClick={runTest} disabled={testing || !anyConnected} style={{ ...btnStyle(t, 'primary'), fontSize: 12, opacity: testing || !anyConnected ? 0.6 : 1 }}>
          {testing ? 'Sending…' : 'Send test'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {channels.map(c => {
          const tested = testResult ? testResult[c.id] : undefined;
          return (
            <Card key={c.id} t={t} style={{ opacity: c.status === 'connected' ? 1 : 0.75 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: c.color }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT_MONO, marginTop: 2, wordBreak: 'break-all' }}>{c.detail}</div>
                </div>
                <Pill t={t} sev={c.status === 'connected' ? 'success' : 'muted'}>{c.status}</Pill>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button onClick={() => navigate('/settings')} style={{ ...btnStyle(t), fontSize: 11 }}><SettingsIcon size={11} /> Configure</button>
                {tested !== undefined && (
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: FONT_MONO, color: tested ? t.success : t.danger }}>
                    {tested ? '✓ delivered' : '✗ failed'}
                  </span>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
