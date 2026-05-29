import React, { useState, useEffect } from 'react';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, Pill, Toggle, Modal, FormField, Select, EmptyState, SkeletonCard, btnStyle } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api } from '../api';
import type { Schedule, Group, PoolPreset } from '../api';
import { Clock, Plus, Edit, Trash2, Calendar } from 'lucide-react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_TOKENS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const ACTION_META: Record<string, { label: string; color: (t: Theme) => string }> = {
  pool_switch: { label: 'Pool switch', color: t => t.accent },
  restart: { label: 'Restart', color: t => t.warning },
  pause: { label: 'Pause', color: t => t.danger },
  resume: { label: 'Resume', color: t => t.success },
};

export function Schedules() {
  const { theme: t } = useThemeStore();
  const [fetched, setFetched] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Schedule | null>(null);

  useEffect(() => {
    api.schedules.list().then(setSchedules).catch(() => {}).finally(() => setFetched(true));
  }, []);

  const toggleSchedule = async (id: string, enabled: boolean) => {
    await api.schedules.update(id, { enabled }).catch(() => {});
    setSchedules(schedules.map(s => s.id === id ? { ...s, enabled } : s));
  };

  const deleteSchedule = async (id: string) => {
    await api.schedules.delete(id).catch(() => {});
    setSchedules(schedules.filter(s => s.id !== id));
  };

  const upsert = (saved: Schedule) =>
    setSchedules(prev => prev.some(s => s.id === saved.id) ? prev.map(s => s.id === saved.id ? saved : s) : [...prev, saved]);

  if (!fetched) {
    return (
      <div>
        <SkeletonCard t={t} height={200} style={{ marginBottom: 14 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} t={t} height={160} />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: t.textMuted }}>
          {schedules.filter(s => s.enabled).length} of {schedules.length} schedules active
        </div>
        <button onClick={() => setShowAdd(true)} style={{ ...btnStyle(t, 'primary'), padding: '8px 12px' }}>
          <Plus size={13} /> New schedule
        </button>
      </div>

      {schedules.length > 0 && (
        <Card t={t} style={{ marginBottom: 14 }}>
          <Label t={t} style={{ marginBottom: 12 }}>Weekly overview</Label>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 600 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(24, 1fr)', gap: 1, marginBottom: 4 }}>
                <div />
                {HOURS.map(h => (
                  <div key={h} style={{ fontSize: 9, fontFamily: FONT_MONO, color: t.textDim, textAlign: 'center' }}>
                    {h % 6 === 0 ? `${h}h` : ''}
                  </div>
                ))}
              </div>
              {DAYS.map((day, di) => (
                <div key={day} style={{ display: 'grid', gridTemplateColumns: '48px repeat(24, 1fr)', gap: 1, marginBottom: 2 }}>
                  <div style={{ fontSize: 10, fontFamily: FONT_MONO, color: t.textMuted, display: 'flex', alignItems: 'center' }}>{day}</div>
                  {HOURS.map(hour => {
                    const active = schedules.some(s => {
                      if (!s.enabled) return false;
                      const dayMatch = !s.days || s.days.length === 0 || s.days.includes(DAY_TOKENS[di]);
                      const hStart = parseInt((s.time_start || '00:00').split(':')[0]);
                      const hEnd = parseInt((s.time_end || s.time_start || '23:59').split(':')[0]);
                      return dayMatch && hour >= hStart && hour <= hEnd;
                    });
                    return <div key={hour} style={{ height: 14, borderRadius: 2, background: active ? t.accent + '99' : t.surface2 }} />;
                  })}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {schedules.length === 0 ? (
        <EmptyState t={t} icon={<Calendar size={32} />} title="No schedules" detail="Create schedules to automatically switch pools, restart or pause/resume devices at set times." action={<button onClick={() => setShowAdd(true)} style={btnStyle(t, 'primary')}><Plus size={13} /> New schedule</button>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 12 }}>
          {schedules.map(s => (
            <ScheduleCard key={s.id} t={t} schedule={s} onToggle={v => toggleSchedule(s.id, v)} onEdit={() => setEditTarget(s)} onDelete={() => deleteSchedule(s.id)} />
          ))}
        </div>
      )}

      {showAdd && <ScheduleModal t={t} onClose={() => setShowAdd(false)} onSaved={s => { upsert(s); setShowAdd(false); }} />}
      {editTarget && <ScheduleModal t={t} existing={editTarget} onClose={() => setEditTarget(null)} onSaved={s => { upsert(s); setEditTarget(null); }} />}
    </div>
  );
}

function ScheduleCard({ t, schedule: s, onToggle, onEdit, onDelete }: { t: Theme; schedule: Schedule; onToggle: (v: boolean) => void; onEdit: () => void; onDelete: () => void }) {
  const meta = ACTION_META[s.action || 'restart'] || ACTION_META.restart;
  const color = meta.color(t);
  return (
    <Card t={t} style={{ opacity: s.enabled ? 1 : 0.6 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: `${color}22`, border: `1px solid ${color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Clock size={16} color={color} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
            <Pill t={t} sev="info">{meta.label}</Pill>
            <span style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT_MONO }}>{s.scope || 'all'}</span>
          </div>
        </div>
        <Toggle t={t} on={s.enabled} onChange={onToggle} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div style={{ padding: '8px 10px', background: t.surface2, borderRadius: 8 }}>
          <div style={{ fontSize: 9, color: t.textMuted, fontFamily: FONT_MONO, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Runs at</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 700, marginTop: 2 }}>{s.time_start || '—'}</div>
        </div>
        <div style={{ padding: '8px 10px', background: t.surface2, borderRadius: 8 }}>
          <div style={{ fontSize: 9, color: t.textMuted, fontFamily: FONT_MONO, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Days</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, marginTop: 2 }}>
            {(s.days || []).length > 0 ? (s.days || []).join(', ') : 'Every day'}
          </div>
        </div>
      </div>
      {s.lastRun && s.lastRun !== 'never' && (
        <div style={{ fontSize: 11, color: t.textDim, marginBottom: 10, fontFamily: FONT_MONO }}>Last run: {new Date(s.lastRun).toLocaleString()}</div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onEdit} style={{ ...btnStyle(t), fontSize: 11 }}><Edit size={11} /> Edit</button>
        <button onClick={onDelete} style={{ ...btnStyle(t, 'danger'), fontSize: 11, marginLeft: 'auto' }}><Trash2 size={11} /> Delete</button>
      </div>
    </Card>
  );
}

function ScheduleModal({ t, existing, onClose, onSaved }: { t: Theme; existing?: Schedule; onClose: () => void; onSaved: (s: Schedule) => void }) {
  const { devices, axeDevices } = useAppStore();
  const [name, setName] = useState(existing?.name ?? '');
  const [action, setAction] = useState<string>(existing?.action ?? 'pool_switch');
  const [timeStart, setTimeStart] = useState(existing?.time_start ?? '08:00');
  const [timeEnd, setTimeEnd] = useState(existing?.time_end ?? '');
  const [days, setDays] = useState<string[]>(existing?.days ?? []);
  const [scope, setScope] = useState(existing?.scope ?? 'all');
  const [groupId, setGroupId] = useState(existing?.groupId ?? '');
  const [poolId, setPoolId] = useState(existing?.pool_id ?? '');
  const [deviceIps, setDeviceIps] = useState<string[]>(existing?.deviceIps ?? []);
  const [groups, setGroups] = useState<Group[]>([]);
  const [pools, setPools] = useState<PoolPreset[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.groups.list().then(setGroups).catch(() => {});
    api.pools.list().then(setPools).catch(() => {});
  }, []);

  const allDevices = [
    ...devices.map(d => ({ ip: d.ip || '', name: d.name || d.hostname || d.ip || '' })),
    ...axeDevices.map(d => ({ ip: d._ip || '', name: d._name || d.hostname || d._ip || '' })),
  ].filter(d => d.ip);

  const valid = name.trim() && (action !== 'pool_switch' || poolId) && (scope !== 'group' || groupId);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const payload: Partial<Schedule> = {
      name, action: action as Schedule['action'], time_start: timeStart, time_end: timeEnd,
      days, enabled: existing?.enabled ?? true, scope, groupId, pool_id: poolId, deviceIps,
    };
    const saved = existing
      ? await api.schedules.update(existing.id, payload).catch(() => null)
      : await api.schedules.create(payload).catch(() => null);
    setSaving(false);
    if (saved) onSaved(saved);
  };

  return (
    <Modal t={t} title={existing ? 'Edit schedule' : 'New schedule'} onClose={onClose} width={500}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FormField t={t} label="Name" value={name} onChange={setName} placeholder="e.g. Night pause" />

        <div>
          <Label t={t} style={{ marginBottom: 8 }}>Action</Label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(ACTION_META).map(([v, m]) => (
              <button key={v} onClick={() => setAction(v)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: `1px solid ${action === v ? t.accent : t.border}`, background: action === v ? t.accentGlow : 'transparent', color: action === v ? t.accent : t.textMuted, cursor: 'pointer' }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {action === 'pool_switch' && (
          <div>
            <Label t={t} style={{ marginBottom: 6 }}>Pool preset</Label>
            <Select t={t} value={poolId} options={[['', '— select pool —'], ...pools.map(p => [p.id, p.name || p.url] as [string, string])]} onChange={setPoolId} />
          </div>
        )}

        <div>
          <Label t={t} style={{ marginBottom: 8 }}>Scope</Label>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['all', 'All devices'], ['group', 'Group'], ['device', 'Devices']].map(([v, label]) => (
              <button key={v} onClick={() => setScope(v)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: `1px solid ${scope === v ? t.accent : t.border}`, background: scope === v ? t.accentGlow : 'transparent', color: scope === v ? t.accent : t.textMuted, cursor: 'pointer' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {scope === 'group' && (
          <Select t={t} value={groupId} options={[['', '— select group —'], ...groups.map(g => [g.id, g.name] as [string, string])]} onChange={setGroupId} />
        )}
        {scope === 'device' && (
          <div style={{ maxHeight: 160, overflowY: 'auto', border: `1px solid ${t.border}`, borderRadius: 8, padding: 8 }}>
            {allDevices.length === 0 ? <div style={{ fontSize: 12, color: t.textMuted }}>No devices.</div> : allDevices.map(d => (
              <label key={d.ip} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={deviceIps.includes(d.ip)} onChange={() => setDeviceIps(prev => prev.includes(d.ip) ? prev.filter(x => x !== d.ip) : [...prev, d.ip])} style={{ accentColor: t.accent }} />
                <span>{d.name}</span>
                <span style={{ color: t.textMuted, fontFamily: FONT_MONO }}>{d.ip}</span>
              </label>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField t={t} label="Run at (HH:MM)" value={timeStart} onChange={setTimeStart} placeholder="08:00" mono />
          <FormField t={t} label="End (overview only)" value={timeEnd} onChange={setTimeEnd} placeholder="20:00" mono />
        </div>

        <div>
          <Label t={t} style={{ marginBottom: 8 }}>Days (empty = every day)</Label>
          <div style={{ display: 'flex', gap: 6 }}>
            {DAY_TOKENS.map((d, i) => {
              const on = days.includes(d);
              return (
                <button key={d} onClick={() => setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])} style={{ width: 34, height: 34, borderRadius: 6, fontSize: 11, fontWeight: 700, border: `1px solid ${on ? t.accent : t.border}`, background: on ? t.accentGlow : 'transparent', color: on ? t.accent : t.textMuted, cursor: 'pointer', fontFamily: FONT_MONO }}>
                  {DAYS[i].slice(0, 2)}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${t.border}` }}>
          <button onClick={onClose} style={btnStyle(t)}>Cancel</button>
          <button onClick={save} disabled={!valid || saving} style={{ ...btnStyle(t, 'primary'), opacity: valid && !saving ? 1 : 0.5 }}>
            <Plus size={13} /> {saving ? 'Saving…' : existing ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
