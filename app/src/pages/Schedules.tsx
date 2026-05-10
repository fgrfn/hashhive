import React, { useState, useEffect } from 'react';
import { useThemeStore } from '../store/theme';
import { Card, Label, Pill, Toggle, Modal, FormField, EmptyState, SkeletonCard, btnStyle } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api } from '../api';
import type { Schedule } from '../api';
import { Clock, Plus, Edit, Trash2, Calendar } from 'lucide-react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function Schedules() {
  const { theme: t } = useThemeStore();
  const [fetched, setFetched] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [showAdd, setShowAdd] = useState(false);

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

  const addSchedule = async (s: Partial<Schedule>) => {
    const created = await api.schedules.create(s).catch(() => null);
    if (created) setSchedules(prev => [...prev, created]);
    setShowAdd(false);
  };

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
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, color: t.textMuted }}>
            {schedules.filter(s => s.enabled).length} of {schedules.length} schedules active
          </div>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ ...btnStyle(t, 'primary'), padding: '8px 12px' }}>
          <Plus size={13} /> New schedule
        </button>
      </div>

      {/* 24h Timeline */}
      {schedules.length > 0 && (
        <Card t={t} style={{ marginBottom: 14 }}>
          <Label t={t} style={{ marginBottom: 12 }}>Weekly overview</Label>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 600 }}>
              {/* Hour labels */}
              <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(24, 1fr)', gap: 1, marginBottom: 4 }}>
                <div />
                {HOURS.map(h => (
                  <div key={h} style={{ fontSize: 9, fontFamily: FONT_MONO, color: t.textDim, textAlign: 'center' }}>
                    {h % 6 === 0 ? `${h}h` : ''}
                  </div>
                ))}
              </div>
              {/* Day rows */}
              {DAYS.map(day => (
                <div key={day} style={{ display: 'grid', gridTemplateColumns: '48px repeat(24, 1fr)', gap: 1, marginBottom: 2 }}>
                  <div style={{ fontSize: 10, fontFamily: FONT_MONO, color: t.textMuted, display: 'flex', alignItems: 'center' }}>{day}</div>
                  {HOURS.map(hour => {
                    const active = schedules.some(s => {
                      if (!s.enabled) return false;
                      const dayMatch = !s.days || s.days.length === 0 || s.days.includes(day.toLowerCase().slice(0, 2));
                      const hStart = parseInt((s.time_start || '00:00').split(':')[0]);
                      const hEnd = parseInt((s.time_end || '23:59').split(':')[0]);
                      return dayMatch && hour >= hStart && hour <= hEnd;
                    });
                    return (
                      <div key={hour} style={{ height: 14, borderRadius: 2, background: active ? t.accent + '99' : t.surface2 }} />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 11 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 12, height: 8, borderRadius: 2, background: t.accent + '99', display: 'inline-block' }} /> Active
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 12, height: 8, borderRadius: 2, background: t.surface2, display: 'inline-block' }} /> Inactive
            </span>
          </div>
        </Card>
      )}

      {/* Schedule cards */}
      {schedules.length === 0 ? (
        <EmptyState t={t} icon={<Calendar size={32} />} title="No schedules" detail="Create schedules to automatically change pool configs or power limits at set times." action={<button onClick={() => setShowAdd(true)} style={btnStyle(t, 'primary')}><Plus size={13} /> New schedule</button>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 12 }}>
          {schedules.map(s => (
            <ScheduleCard key={s.id} t={t} schedule={s} onToggle={v => toggleSchedule(s.id, v)} onDelete={() => deleteSchedule(s.id)} />
          ))}
        </div>
      )}

      {showAdd && <AddScheduleModal t={t} onClose={() => setShowAdd(false)} onAdd={addSchedule} />}
    </div>
  );
}

function ScheduleCard({ t, schedule: s, onToggle, onDelete }: { t: Theme; schedule: Schedule; onToggle: (v: boolean) => void; onDelete: () => void }) {
  const actionColor = s.action === 'pool_switch' ? t.accent : s.action === 'power_limit' ? t.warning : t.success;
  const actionLabel = s.action === 'pool_switch' ? 'Pool switch' : s.action === 'power_limit' ? 'Power limit' : 'Restart';

  return (
    <Card t={t} style={{ opacity: s.enabled ? 1 : 0.6 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: `${actionColor}22`, border: `1px solid ${actionColor}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Clock size={16} color={actionColor} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <Pill t={t} sev="info">{actionLabel}</Pill>
            {s.scope && <span style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT_MONO }}>{s.scope}</span>}
          </div>
        </div>
        <Toggle t={t} on={s.enabled} onChange={onToggle} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div style={{ padding: '8px 10px', background: t.surface2, borderRadius: 8 }}>
          <div style={{ fontSize: 9, color: t.textMuted, fontFamily: FONT_MONO, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Time</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 700, marginTop: 2 }}>{s.time_start || '—'} – {s.time_end || '—'}</div>
        </div>
        <div style={{ padding: '8px 10px', background: t.surface2, borderRadius: 8 }}>
          <div style={{ fontSize: 9, color: t.textMuted, fontFamily: FONT_MONO, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Days</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, marginTop: 2 }}>
            {(s.days || []).length > 0 ? (s.days || []).join(', ') : 'Every day'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button style={{ ...btnStyle(t), fontSize: 11 }}><Edit size={11} /> Edit</button>
        <button onClick={onDelete} style={{ ...btnStyle(t, 'danger'), fontSize: 11, marginLeft: 'auto' }}><Trash2 size={11} /> Delete</button>
      </div>
    </Card>
  );
}

function AddScheduleModal({ t, onClose, onAdd }: { t: Theme; onClose: () => void; onAdd: (s: Partial<Schedule>) => void }) {
  const [name, setName] = useState('');
  const [action, setAction] = useState('pool_switch');
  const [timeStart, setTimeStart] = useState('08:00');
  const [timeEnd, setTimeEnd] = useState('20:00');
  const [days, setDays] = useState<string[]>([]);
  const valid = name.trim();

  const toggleDay = (d: string) => {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  return (
    <Modal t={t} title="New schedule" onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FormField t={t} label="Name" value={name} onChange={setName} placeholder="e.g. Peak hours pool switch" />

        <div>
          <Label t={t} style={{ marginBottom: 8 }}>Action</Label>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['pool_switch', 'Pool switch'], ['power_limit', 'Power limit'], ['restart', 'Restart']].map(([v, label]) => (
              <button key={v} onClick={() => setAction(v)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: `1px solid ${action === v ? t.accent : t.border}`, background: action === v ? t.accentGlow : 'transparent', color: action === v ? t.accent : t.textMuted, cursor: 'pointer' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField t={t} label="Start time" value={timeStart} onChange={setTimeStart} placeholder="08:00" mono />
          <FormField t={t} label="End time" value={timeEnd} onChange={setTimeEnd} placeholder="20:00" mono />
        </div>

        <div>
          <Label t={t} style={{ marginBottom: 8 }}>Days (empty = every day)</Label>
          <div style={{ display: 'flex', gap: 6 }}>
            {['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d, i) => {
              const on = days.includes(d);
              return (
                <button key={d} onClick={() => toggleDay(d)} style={{ width: 34, height: 34, borderRadius: 6, fontSize: 11, fontWeight: 700, border: `1px solid ${on ? t.accent : t.border}`, background: on ? t.accentGlow : 'transparent', color: on ? t.accent : t.textMuted, cursor: 'pointer', fontFamily: FONT_MONO }}>
                  {DAYS[i]}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${t.border}` }}>
          <button onClick={onClose} style={btnStyle(t)}>Cancel</button>
          <button onClick={() => valid && onAdd({ name, action: action as Schedule['action'], time_start: timeStart, time_end: timeEnd, days, enabled: true })} disabled={!valid} style={{ ...btnStyle(t, 'primary'), opacity: valid ? 1 : 0.5 }}>
            <Plus size={13} /> Create
          </button>
        </div>
      </div>
    </Modal>
  );
}
