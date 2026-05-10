import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, Pill, SkeletonCard, EmptyState, btnStyle } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api } from '../api';
import type { Group } from '../api';
import { Grid3x3, Plus, ArrowLeft } from 'lucide-react';

export function GroupsPage() {
  const { theme: t } = useThemeStore();
  const navigate = useNavigate();
  const [fetched, setFetched] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);

  useEffect(() => {
    api.groups.list().then(setGroups).catch(() => {}).finally(() => setFetched(true));
  }, []);

  if (!fetched) {
    return (
      <div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} t={t} height={60} style={{ flex: 1 }} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} t={t} height={220} />)}
        </div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState t={t} icon={<Grid3x3 size={32} />} title="No groups yet" detail="Create groups to organize your miners and push pool configs to them." action={<button style={btnStyle(t, 'primary')}><Plus size={13} /> New group</button>} />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <KpiSm t={t} label="Groups" value={String(groups.length)} color={t.accent} />
        <KpiSm t={t} label="Devices" value={String(groups.reduce((a, g) => a + (g.total || 0), 0))} color={t.success} />
        <div style={{ flex: 1 }} />
        <button style={{ ...btnStyle(t, 'primary'), padding: '8px 12px' }}><Plus size={13} /> New group</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
        {groups.map(g => {
          const onlinePct = g.total ? ((g.online || 0) / g.total) * 100 : 0;
          const color = g.color || t.accent;
          return (
            <Card key={g.id} t={t} style={{ cursor: 'pointer', transition: 'border-color .15s' }}
              onClick={() => navigate(`/groups/${g.id}`)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: 8, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${color}55` }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: 'block' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{g.name}</div>
                  {g.description && <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{g.description}</div>}
                </div>
                {(g.alerts || 0) > 0 && <Pill t={t} sev="warning">{g.alerts} alert{(g.alerts || 0) > 1 ? 's' : ''}</Pill>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <StatBox t={t} label="Online" value={`${g.online || 0}/${g.total || 0}`} color={onlinePct === 100 ? t.success : onlinePct > 50 ? t.warning : t.danger} />
                <StatBox t={t} label="Devices" value={String(g.total || 0)} color={t.text} />
              </div>
              <div style={{ height: 4, background: t.surface2, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${onlinePct}%`, height: '100%', background: color }} />
              </div>
              {(g.deviceIps || []).length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  {(g.deviceIps || []).slice(0, 4).map(ip => (
                    <span key={ip} style={{ padding: '3px 8px', background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 6, fontSize: 10, fontFamily: FONT_MONO, color: t.textMuted }}>{ip}</span>
                  ))}
                  {(g.deviceIps || []).length > 4 && <span style={{ padding: '3px 8px', fontSize: 10, fontFamily: FONT_MONO, color: t.textDim }}>+{(g.deviceIps || []).length - 4}</span>}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function GroupDetail() {
  const { theme: t } = useThemeStore();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { devices, axeDevices } = useAppStore();
  const [group, setGroup] = useState<Group | null>(null);

  useEffect(() => {
    api.groups.list().then(gs => setGroup(gs.find(g => g.id === id) || null)).catch(() => {});
  }, [id]);

  if (!group) {
    return (
      <div>
        <button onClick={() => navigate('/groups')} style={{ ...btnStyle(t), padding: 8, marginBottom: 14 }}><ArrowLeft size={14} /></button>
        <div style={{ color: t.textMuted }}>Group not found.</div>
      </div>
    );
  }

  const color = group.color || t.accent;
  const allDevices = [...devices.map(d => ({ ip: d.ip || '', name: d.name || d.hostname || d.ip || '', status: d.status || 'online', hr: 0, temp: null as number | null })), ...axeDevices.map(d => ({ ip: d._ip || '', name: d._name || d.hostname || d._ip || '', status: d.status || 'offline', hr: d.hashRate || 0, temp: d.temp ?? null }))];
  const groupDevices = allDevices.filter(d => (group.deviceIps || []).includes(d.ip));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button onClick={() => navigate('/groups')} style={{ ...btnStyle(t), padding: 7 }}><ArrowLeft size={14} /></button>
        <div style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT_MONO }}>Groups / {group.name}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <div style={{ width: 52, height: 52, borderRadius: 12, background: `${color}22`, border: `1px solid ${color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: 18, height: 18, borderRadius: 4, background: color, display: 'block' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{group.name}</div>
          {group.description && <div style={{ fontSize: 12, color: t.textMuted }}>{group.description}</div>}
        </div>
        <button style={{ ...btnStyle(t, 'danger') }} onClick={() => { api.groups.delete(group.id).then(() => navigate('/groups')).catch(() => {}); }}>Delete</button>
      </div>
      <Card t={t} noPad>
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between' }}>
          <Label t={t}>Devices in this group</Label>
          <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: t.textMuted }}>{groupDevices.length} devices</span>
        </div>
        {groupDevices.length === 0 ? (
          <div style={{ padding: '24px 18px', color: t.textMuted, fontSize: 13 }}>No devices in this group yet.</div>
        ) : groupDevices.map((d, i) => (
          <div key={d.ip || i} onClick={() => navigate(`/devices/${d.ip}`)} style={{ display: 'grid', gridTemplateColumns: '1.4fr 90px 80px 110px 80px', gap: 12, padding: '12px 18px', borderBottom: i === groupDevices.length - 1 ? 'none' : `1px solid ${t.border}`, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = t.surface2}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{d.name}</div>
              <div style={{ fontSize: 10, fontFamily: FONT_MONO, color: t.textMuted }}>{d.ip}</div>
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: d.status === 'online' ? t.success : t.danger }}>{d.status}</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: d.temp && d.temp > 70 ? t.danger : t.text }}>{d.temp != null ? `${d.temp}°C` : '—'}</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600 }}>{d.hr > 0 ? `${d.hr.toFixed(1)} GH/s` : <span style={{ color: t.textMuted }}>—</span>}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function KpiSm({ t, label, value, color }: { t: Theme; label: string; value: string; color: string }) {
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 14px' }}>
      <Label t={t}>{label}</Label>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: FONT_MONO, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function StatBox({ t, label, value, color }: { t: Theme; label: string; value: string; color: string }) {
  return (
    <div style={{ padding: '8px 10px', background: t.surface2, borderRadius: 8 }}>
      <div style={{ fontSize: 9, color: t.textMuted, fontFamily: FONT_MONO, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: FONT_MONO, marginTop: 2 }}>{value}</div>
    </div>
  );
}
