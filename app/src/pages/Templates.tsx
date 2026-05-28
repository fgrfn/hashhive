import React, { useState, useEffect } from 'react';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, Pill, Modal, FormField, EmptyState, SkeletonCard, btnStyle } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api, type DeviceTemplate as Template } from '../api';
import { toast } from '../store/toast';
import { FileText, Plus, Edit, Trash2, Send, Check, X } from 'lucide-react';

export function Templates() {
  const { theme: t } = useThemeStore();
  const [fetched, setFetched] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Template | null>(null);
  const [pushTarget, setPushTarget] = useState<Template | null>(null);

  useEffect(() => {
    api.templates.list().then(setTemplates).catch(() => setTemplates([])).finally(() => setFetched(true));
  }, []);

  const deleteTemplate = async (id: string) => {
    try {
      await api.templates.delete(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
      toast('Template deleted');
    } catch {
      toast('Failed to delete template', 'error');
    }
  };

  if (!fetched) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} t={t} height={200} />)}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 14, color: t.textMuted }}>{templates.length} template{templates.length !== 1 ? 's' : ''}</div>
        <button onClick={() => setShowAdd(true)} style={{ ...btnStyle(t, 'primary'), padding: '8px 12px' }}>
          <Plus size={13} /> New template
        </button>
      </div>

      {templates.length === 0 ? (
        <EmptyState t={t} icon={<FileText size={32} />} title="No templates" detail="Create templates to quickly apply configurations to multiple miners at once." action={<button onClick={() => setShowAdd(true)} style={btnStyle(t, 'primary')}><Plus size={13} /> New template</button>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
          {templates.map(tmpl => (
            <TemplateCard key={tmpl.id} t={t} template={tmpl} onPush={() => setPushTarget(tmpl)} onEdit={() => setEditTarget(tmpl)} onDelete={() => deleteTemplate(tmpl.id)} />
          ))}
        </div>
      )}

      {showAdd && <TemplateModal t={t} onClose={() => setShowAdd(false)} onSaved={tmpl => { setTemplates(prev => [...prev, tmpl]); setShowAdd(false); }} />}
      {editTarget && <TemplateModal t={t} existing={editTarget} onClose={() => setEditTarget(null)} onSaved={tmpl => { setTemplates(prev => prev.map(x => x.id === tmpl.id ? tmpl : x)); setEditTarget(null); }} />}
      {pushTarget && <PushModal t={t} template={pushTarget} onClose={() => setPushTarget(null)} />}
    </div>
  );
}

function TemplateCard({ t, template: tmpl, onPush, onEdit, onDelete }: { t: Theme; template: Template; onPush: () => void; onEdit: () => void; onDelete: () => void }) {
  const typeColor = tmpl.type === 'nmminer' ? t.accent : tmpl.type === 'axeos' ? t.success : t.honey;

  return (
    <Card t={t}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 38, height: 38, borderRadius: 8, background: `${typeColor}22`, border: `1px solid ${typeColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FileText size={16} color={typeColor} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{tmpl.name}</div>
          {tmpl.description && <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{tmpl.description}</div>}
        </div>
        <Pill t={t} sev={tmpl.type === 'nmminer' ? 'info' : tmpl.type === 'axeos' ? 'success' : 'warning'}>{tmpl.type}</Pill>
      </div>

      <div style={{ padding: '10px 12px', background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 8, marginBottom: 12, fontFamily: FONT_MONO, fontSize: 11, color: t.textMuted }}>
        {Object.entries(tmpl.config).slice(0, 4).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ color: t.textDim }}>{k}</span>
            <span style={{ color: t.text }}>{String(v)}</span>
          </div>
        ))}
        {Object.keys(tmpl.config).length > 4 && (
          <div style={{ color: t.textDim, marginTop: 4 }}>+{Object.keys(tmpl.config).length - 4} more fields</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onEdit} style={{ ...btnStyle(t), fontSize: 11 }}><Edit size={11} /> Edit</button>
        <button onClick={onPush} style={{ ...btnStyle(t, 'primary'), fontSize: 11 }}><Send size={11} /> Push</button>
        <button onClick={onDelete} style={{ ...btnStyle(t, 'danger'), fontSize: 11, marginLeft: 'auto' }}><Trash2 size={11} /></button>
      </div>
    </Card>
  );
}

function PushModal({ t, template, onClose }: { t: Theme; template: Template; onClose: () => void }) {
  const { devices, axeDevices } = useAppStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pushing, setPushing] = useState(false);
  const [progress, setProgress] = useState<Record<string, 'pending' | 'ok' | 'error'>>({});

  const allDevices = [
    ...(template.type !== 'axeos' ? devices.map(d => ({ ip: d.ip || '', name: d.name || d.hostname || d.ip || '', type: 'nmminer' as const })) : []),
    ...(template.type !== 'nmminer' ? axeDevices.map(d => ({ ip: d._ip || '', name: d._name || d.hostname || d._ip || '', type: 'axeos' as const })) : []),
  ];

  const toggleAll = () => {
    if (selected.size === allDevices.length) setSelected(new Set());
    else setSelected(new Set(allDevices.map(d => d.ip)));
  };

  const toggleDevice = (ip: string) => {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(ip)) s.delete(ip); else s.add(ip);
      return s;
    });
  };

  const doPush = async () => {
    if (selected.size === 0) return;
    setPushing(true);
    const ips = Array.from(selected);
    const init: Record<string, 'pending' | 'ok' | 'error'> = {};
    ips.forEach(ip => { init[ip] = 'pending'; });
    setProgress(init);

    for (const ip of ips) {
      try {
        await api.templates.apply(ip, template.id, template.config);
        setProgress(prev => ({ ...prev, [ip]: 'ok' }));
      } catch {
        setProgress(prev => ({ ...prev, [ip]: 'error' }));
      }
      await new Promise(r => setTimeout(r, 200));
    }
    setPushing(false);
  };

  const done = Object.keys(progress).length > 0 && !pushing;

  return (
    <Modal t={t} title={`Push · ${template.name}`} onClose={onClose} width={500}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: t.textMuted }}>{allDevices.length} compatible device{allDevices.length !== 1 ? 's' : ''}</div>
          <button onClick={toggleAll} style={{ ...btnStyle(t), fontSize: 11 }}>
            {selected.size === allDevices.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>

        <div style={{ maxHeight: 280, overflowY: 'auto', border: `1px solid ${t.border}`, borderRadius: 8 }}>
          {allDevices.map((d, i) => {
            const sel = selected.has(d.ip);
            const prog = progress[d.ip];
            return (
              <div key={d.ip} onClick={() => !pushing && toggleDevice(d.ip)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i === allDevices.length - 1 ? 'none' : `1px solid ${t.border}`, cursor: pushing ? 'default' : 'pointer', background: sel ? t.accentGlow : 'transparent' }}>
                {prog ? (
                  <div style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {prog === 'ok' ? <Check size={14} color={t.success} /> : prog === 'error' ? <X size={14} color={t.danger} /> : <div style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${t.accent}`, borderTopColor: 'transparent', animation: 'proto-spin 0.8s linear infinite' }} />}
                  </div>
                ) : (
                  <input type="checkbox" checked={sel} onChange={() => {}} style={{ accentColor: t.accent }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</div>
                  <div style={{ fontSize: 10, fontFamily: FONT_MONO, color: t.textMuted }}>{d.ip}</div>
                </div>
                <Pill t={t} sev={d.type === 'nmminer' ? 'info' : 'success'}>{d.type}</Pill>
              </div>
            );
          })}
        </div>

        {done && (
          <div style={{ padding: '10px 14px', background: t.surface2, borderRadius: 8, fontSize: 13, color: t.textMuted }}>
            Push complete — {Object.values(progress).filter(v => v === 'ok').length} succeeded, {Object.values(progress).filter(v => v === 'error').length} failed.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${t.border}` }}>
          <button onClick={onClose} style={btnStyle(t)}>{done ? 'Close' : 'Cancel'}</button>
          {!done && (
            <button onClick={doPush} disabled={selected.size === 0 || pushing} style={{ ...btnStyle(t, 'primary'), opacity: selected.size > 0 && !pushing ? 1 : 0.5 }}>
              {pushing ? 'Pushing…' : <><Send size={13} /> Push to {selected.size} device{selected.size !== 1 ? 's' : ''}</>}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

interface ConfigRow { k: string; v: string }

function TemplateModal({ t, existing, onClose, onSaved }: { t: Theme; existing?: Template; onClose: () => void; onSaved: (tmpl: Template) => void }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<Template['type']>(existing?.type ?? 'nmminer');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [rows, setRows] = useState<ConfigRow[]>(
    existing ? Object.entries(existing.config).map(([k, v]) => ({ k, v: String(v) })) : [],
  );
  const [saving, setSaving] = useState(false);
  const valid = name.trim();

  const setRow = (i: number, patch: Partial<ConfigRow>) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const buildConfig = (): Record<string, unknown> => {
    const cfg: Record<string, unknown> = {};
    for (const { k, v } of rows) {
      const key = k.trim();
      if (!key) continue;
      const num = Number(v);
      cfg[key] = v.trim() !== '' && !Number.isNaN(num) ? num : v;
    }
    return cfg;
  };

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const payload = { name, type, description, config: buildConfig() };
    try {
      const tmpl = existing
        ? await api.templates.update(existing.id, payload)
        : await api.templates.create(payload);
      toast(existing ? 'Template updated' : 'Template created');
      onSaved(tmpl);
    } catch {
      toast('Failed to save template', 'error');
      setSaving(false);
    }
  };

  return (
    <Modal t={t} title={existing ? 'Edit template' : 'New template'} onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FormField t={t} label="Name" value={name} onChange={setName} placeholder="e.g. High performance" />
        <FormField t={t} label="Description (optional)" value={description} onChange={setDescription} placeholder="Brief description" />
        <div>
          <Label t={t} style={{ marginBottom: 8 }}>Device type</Label>
          <div style={{ display: 'flex', gap: 6 }}>
            {([['nmminer', 'NMMiner'], ['axeos', 'AxeOS'], ['solominer', 'SoloMiner'], ['both', 'Both']] as [Template['type'], string][]).map(([v, label]) => (
              <button key={v} onClick={() => setType(v)} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: `1px solid ${type === v ? t.accent : t.border}`, background: type === v ? t.accentGlow : 'transparent', color: type === v ? t.accent : t.textMuted, cursor: 'pointer' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label t={t} style={{ marginBottom: 8 }}>Config fields</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input value={r.k} onChange={e => setRow(i, { k: e.target.value })} placeholder="key (e.g. frequency)"
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontSize: 12, fontFamily: FONT_MONO }} />
                <input value={r.v} onChange={e => setRow(i, { v: e.target.value })} placeholder="value"
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontSize: 12, fontFamily: FONT_MONO }} />
                <button onClick={() => setRows(prev => prev.filter((_, idx) => idx !== i))} style={{ ...btnStyle(t, 'danger'), padding: '6px 8px' }}><X size={12} /></button>
              </div>
            ))}
            <button onClick={() => setRows(prev => [...prev, { k: '', v: '' }])} style={{ ...btnStyle(t), fontSize: 12, alignSelf: 'flex-start' }}>
              <Plus size={12} /> Add field
            </button>
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
