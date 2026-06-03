import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, Pill, SkeletonCard, EmptyState, Modal, FormField, Select, btnStyle } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api } from '../api';
import type { Group } from '../api';
import { Grid3x3, Plus, ArrowLeft, Power, Pause, Play, Globe, X, Pencil } from 'lucide-react';
import type { PoolPreset } from '../api';
import { toast } from '../store/toast';

const PRESET_COLORS = ['#a855f7', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#f97316', '#ec4899'];

function NewGroupModal({ t, onClose, onCreate }: { t: Theme; onClose: () => void; onCreate: (g: Group) => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const g = await api.groups.create({ name: name.trim(), desc, color } as Partial<Group>) as Group;
      toast(`Group "${g.name}" created`);
      onCreate(g);
      onClose();
    } catch {
      toast('Failed to create group', 'error');
    }
    setSaving(false);
  };

  return (
    <Modal t={t} title="New Group" onClose={onClose} width={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField t={t} label="Name" value={name} onChange={setName} placeholder="e.g. Living room miners" />
        <FormField t={t} label="Description (optional)" value={desc} onChange={setDesc} placeholder="Short note" />
        <div>
          <div style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Color</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PRESET_COLORS.map(c => (
              <div key={c} onClick={() => setColor(c)} style={{ width: 26, height: 26, borderRadius: 6, background: c, cursor: 'pointer', border: color === c ? `2px solid ${t.text}` : `2px solid transparent`, boxSizing: 'border-box' }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${t.border}` }}>
          <button onClick={onClose} style={btnStyle(t)}>Cancel</button>
          <button onClick={submit} disabled={!name.trim() || saving} style={{ ...btnStyle(t, 'primary'), opacity: !name.trim() || saving ? 0.6 : 1 }}>
            {saving ? 'Creating…' : 'Create group'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditGroupModal({ t, group, onClose, onSaved }: { t: Theme; group: Group; onClose: () => void; onSaved: (g: Group) => void }) {
  const [name, setName] = useState(group.name || '');
  const [desc, setDesc] = useState(group.desc ?? group.description ?? '');
  const [color, setColor] = useState(group.color || PRESET_COLORS[0]);
  const [poolId, setPoolId] = useState(group.poolId || '');
  const [pools, setPools] = useState<PoolPreset[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.pools.list().then(setPools).catch(() => {}); }, []);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const updated = await api.groups.update(group.id, { name: name.trim(), desc, color, poolId } as Partial<Group>) as Group;
      toast('Group updated');
      onSaved({ ...group, ...updated, name: name.trim(), desc, description: desc, color, poolId });
    } catch {
      toast('Failed to update group', 'error');
    }
    setSaving(false);
  };

  return (
    <Modal t={t} title="Edit group" onClose={onClose} width={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField t={t} label="Name" value={name} onChange={setName} placeholder="e.g. Living room miners" />
        <FormField t={t} label="Description (optional)" value={desc} onChange={setDesc} placeholder="Short note" />
        <div>
          <Label t={t} style={{ marginBottom: 6 }}>Pool for group push (optional)</Label>
          <Select t={t} value={poolId} options={[['', '— none —'], ...pools.map(p => [p.id, p.name || p.url] as [string, string])]} onChange={setPoolId} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Color</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PRESET_COLORS.map(c => (
              <div key={c} onClick={() => setColor(c)} style={{ width: 26, height: 26, borderRadius: 6, background: c, cursor: 'pointer', border: color === c ? `2px solid ${t.text}` : '2px solid transparent', boxSizing: 'border-box' }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${t.border}` }}>
          <button onClick={onClose} style={btnStyle(t)}>Cancel</button>
          <button onClick={submit} disabled={!name.trim() || saving} style={{ ...btnStyle(t, 'primary'), opacity: !name.trim() || saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function GroupsPage() {
  const { theme: t } = useThemeStore();
  const navigate = useNavigate();
  const { devices, axeDevices } = useAppStore();
  const [fetched, setFetched] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    api.groups.list().then(setGroups).catch(() => {}).finally(() => setFetched(true));
  }, []);

  // The list endpoint doesn't compute member counts, so derive them here from
  // the live device store (real-time online status), keyed by IP.
  const onlineIps = new Set<string>();
  for (const d of devices) { const ip = d.ip || ''; if (ip && d._online !== false && d.status !== 'offline') onlineIps.add(ip); }
  for (const d of axeDevices) { const ip = d._ip || ''; if (ip && d._online && d.status !== 'offline') onlineIps.add(ip); }
  const groupStats = (g: Group) => {
    const members = (g.devices ?? g.deviceIps ?? []).filter(Boolean);
    return { members, total: members.length, online: members.filter(ip => onlineIps.has(ip)).length };
  };

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
      <>
        <EmptyState t={t} icon={<Grid3x3 size={32} />} title="No groups yet" detail="Create groups to organize your miners and push pool configs to them." action={<button onClick={() => setCreateOpen(true)} style={btnStyle(t, 'primary')}><Plus size={13} /> New group</button>} />
        {createOpen && <NewGroupModal t={t} onClose={() => setCreateOpen(false)} onCreate={g => setGroups(gs => [...gs, g])} />}
      </>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <KpiSm t={t} label="Groups" value={String(groups.length)} color={t.accent} />
        <KpiSm t={t} label="Devices" value={String(groups.reduce((a, g) => a + groupStats(g).total, 0))} color={t.success} />
        <div style={{ flex: 1 }} />
        <button onClick={() => setCreateOpen(true)} style={{ ...btnStyle(t, 'primary'), padding: '8px 12px' }}><Plus size={13} /> New group</button>
      </div>
      {createOpen && <NewGroupModal t={t} onClose={() => setCreateOpen(false)} onCreate={g => setGroups(gs => [...gs, g])} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
        {groups.map(g => {
          const { members, total, online } = groupStats(g);
          const onlinePct = total ? (online / total) * 100 : 0;
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
                <StatBox t={t} label="Online" value={`${online}/${total}`} color={total === 0 ? t.textMuted : onlinePct === 100 ? t.success : onlinePct > 50 ? t.warning : t.danger} />
                <StatBox t={t} label="Devices" value={String(total)} color={t.text} />
              </div>
              <div style={{ height: 4, background: t.surface2, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${onlinePct}%`, height: '100%', background: color }} />
              </div>
              {members.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  {members.slice(0, 4).map(ip => (
                    <span key={ip} style={{ padding: '3px 8px', background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 6, fontSize: 10, fontFamily: FONT_MONO, color: t.textMuted }}>{ip}</span>
                  ))}
                  {members.length > 4 && <span style={{ padding: '3px 8px', fontSize: 10, fontFamily: FONT_MONO, color: t.textDim }}>+{members.length - 4}</span>}
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
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    api.groups.list().then(gs => setGroup(gs.find(g => g.id === id) || null)).catch(() => {});
  }, [id]);

  const memberIps = (g: Group): string[] => g.devices ?? g.deviceIps ?? [];

  const runAction = async (action: 'pool_switch' | 'restart' | 'pause' | 'resume') => {
    if (!group) return;
    if ((action === 'restart' || action === 'pool_switch') &&
        !window.confirm(`Run "${action.replace('_', ' ')}" on all devices in "${group.name}"?`)) return;
    setBusy(action);
    try {
      const res = await api.groups.action(group.id, { action });
      const ok = res.results.filter(r => r.status && r.status < 400).length;
      const failed = res.results.length - ok;
      toast(`${action.replace('_', ' ')}: ${ok} ok${failed ? `, ${failed} failed` : ''}`, failed ? 'error' : 'success');
    } catch {
      toast(`${action.replace('_', ' ')} failed`, 'error');
    }
    setBusy(null);
  };

  const removeDevice = async (ip: string) => {
    if (!group) return;
    const next = memberIps(group).filter(x => x !== ip);
    try {
      const updated = await api.groups.update(group.id, { devices: next });
      setGroup({ ...group, ...updated, devices: next, deviceIps: next });
      toast(`Removed ${ip} from group`);
    } catch {
      toast('Failed to remove device', 'error');
    }
  };

  const addMembers = async (toAdd: string[]) => {
    if (!group || toAdd.length === 0) return;
    const next = Array.from(new Set([...memberIps(group), ...toAdd]));
    try {
      const updated = await api.groups.update(group.id, { devices: next });
      setGroup({ ...group, ...updated, devices: next, deviceIps: next });
      toast(`Added ${toAdd.length} device${toAdd.length !== 1 ? 's' : ''}`);
    } catch {
      toast('Failed to add devices', 'error');
    }
    setShowAdd(false);
    setPick(new Set());
  };

  if (!group) {
    return (
      <div>
        <button onClick={() => navigate('/groups')} style={{ ...btnStyle(t), padding: 8, marginBottom: 14 }}><ArrowLeft size={14} /></button>
        <div style={{ color: t.textMuted }}>Group not found.</div>
      </div>
    );
  }

  const color = group.color || t.accent;
  const ips = memberIps(group);
  const allDevices = [...devices.map(d => ({ ip: d.ip || '', name: d.name || d.hostname || d.ip || '', status: d.status || 'online', hr: 0, temp: null as number | null })), ...axeDevices.map(d => ({ ip: d._ip || '', name: d._name || d.hostname || d._ip || '', status: d.status || 'offline', hr: d.hashRate || 0, temp: d.temp ?? null }))];
  // Show every member IP, even if the live device list hasn't loaded it yet.
  const groupDevices = ips.map(ip => allDevices.find(d => d.ip === ip) ?? { ip, name: ip, status: 'offline', hr: 0, temp: null as number | null });

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
          {(group.desc ?? group.description) && <div style={{ fontSize: 12, color: t.textMuted }}>{group.desc ?? group.description}</div>}
        </div>
        <button style={{ ...btnStyle(t) }} onClick={() => setEditOpen(true)}><Pencil size={13} /> Edit</button>
        <button style={{ ...btnStyle(t, 'danger') }} onClick={() => { if (window.confirm(`Delete group "${group.name}"? Devices are not affected.`)) api.groups.delete(group.id).then(() => navigate('/groups')).catch(() => {}); }}>Delete</button>
      </div>
      <Card t={t} style={{ marginBottom: 14 }}>
        <Label t={t} style={{ marginBottom: 10 }}>Group actions</Label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => runAction('pool_switch')} disabled={!!busy || !group.poolId} title={group.poolId ? '' : 'Assign a pool to this group first'} style={{ ...btnStyle(t, 'primary'), opacity: busy || !group.poolId ? 0.6 : 1 }}><Globe size={13} /> Push pool</button>
          <button onClick={() => runAction('restart')} disabled={!!busy} style={{ ...btnStyle(t), opacity: busy ? 0.6 : 1 }}><Power size={13} /> Restart all</button>
          <button onClick={() => runAction('pause')} disabled={!!busy} style={{ ...btnStyle(t), opacity: busy ? 0.6 : 1 }}><Pause size={13} /> Pause all</button>
          <button onClick={() => runAction('resume')} disabled={!!busy} style={{ ...btnStyle(t), opacity: busy ? 0.6 : 1 }}><Play size={13} /> Resume all</button>
        </div>
        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 8 }}>Pause/Resume apply to AxeOS devices; Restart applies to AxeOS and NMMiner.</div>
      </Card>
      <Card t={t} noPad>
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Label t={t}>Devices in this group</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: t.textMuted }}>{groupDevices.length} devices</span>
            <button onClick={() => { setPick(new Set()); setShowAdd(true); }} style={{ ...btnStyle(t, 'primary'), fontSize: 12, padding: '6px 10px' }}><Plus size={13} /> Add devices</button>
          </div>
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
            <button onClick={e => { e.stopPropagation(); removeDevice(d.ip); }} title="Remove from group" style={{ ...btnStyle(t, 'danger'), padding: '5px 8px', justifySelf: 'end' }}><X size={12} /></button>
          </div>
        ))}
      </Card>

      {showAdd && (() => {
        const available = allDevices.filter(d => d.ip && !ips.includes(d.ip));
        return (
          <Modal t={t} title="Add devices to group" onClose={() => setShowAdd(false)} width={460}>
            {available.length === 0 ? (
              <div style={{ color: t.textMuted, fontSize: 13, padding: '8px 0' }}>All configured devices are already in this group.</div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
                  {available.map(d => {
                    const sel = pick.has(d.ip);
                    return (
                      <label key={d.ip} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: `1px solid ${sel ? t.accent : t.border}`, background: sel ? t.accentGlow : t.surface, cursor: 'pointer' }}>
                        <input type="checkbox" checked={sel} onChange={() => setPick(prev => { const s = new Set(prev); if (s.has(d.ip)) s.delete(d.ip); else s.add(d.ip); return s; })} style={{ accentColor: t.accent }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
                          <div style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT_MONO }}>{d.ip}</div>
                        </div>
                        <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: d.status === 'online' ? t.success : t.danger }}>{d.status}</span>
                      </label>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12, marginTop: 12, borderTop: `1px solid ${t.border}` }}>
                  <button onClick={() => setShowAdd(false)} style={btnStyle(t)}>Cancel</button>
                  <button onClick={() => addMembers(Array.from(pick))} disabled={pick.size === 0} style={{ ...btnStyle(t, 'primary'), opacity: pick.size === 0 ? 0.5 : 1 }}>
                    Add {pick.size || ''} device{pick.size !== 1 ? 's' : ''}
                  </button>
                </div>
              </>
            )}
          </Modal>
        );
      })()}

      {editOpen && (
        <EditGroupModal t={t} group={group} onClose={() => setEditOpen(false)}
          onSaved={g => { setGroup(prev => prev ? { ...prev, ...g } : g); setEditOpen(false); }} />
      )}
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
