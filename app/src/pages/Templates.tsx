import React, { useState, useEffect } from 'react';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, Pill, Modal, FormField, EmptyState, SkeletonCard, useLoading, btnStyle } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api } from '../api';
import { FileText, Plus, Edit, Trash2, Send, Check, X, ChevronDown } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  type: 'nmminer' | 'axeos' | 'both';
  description?: string;
  config: Record<string, unknown>;
  created_at?: string;
}

export function Templates() {
  const { theme: t } = useThemeStore();
  const loading = useLoading(600);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [pushTarget, setPushTarget] = useState<Template | null>(null);

  useEffect(() => {
    fetch('/api/templates').then(r => r.json()).then(setTemplates).catch(() => {
      setTemplates([
        { id: 't1', name: 'High performance', type: 'nmminer', description: 'Max freq, optimized pools', config: { frequency: 600, fan_speed: 100 } },
        { id: 't2', name: 'Efficiency mode', type: 'nmminer', description: 'Balanced power/hashrate', config: { frequency: 450, fan_speed: 70 } },
        { id: 't3', name: 'BitAxe stock', type: 'axeos', description: 'Factory defaults', config: { frequency: 525, core_voltage: 1100 } },
      ]);
    });
  }, []);

  const deleteTemplate = (id: string) => {
    setTemplates(templates.filter(t => t.id !== id));
  };

  if (loading) {
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
            <TemplateCard key={tmpl.id} t={t} template={tmpl} onPush={() => setPushTarget(tmpl)} onDelete={() => deleteTemplate(tmpl.id)} />
          ))}
        </div>
      )}

      {showAdd && <AddTemplateModal t={t} onClose={() => setShowAdd(false)} onCreate={tmpl => { setTemplates(prev => [...prev, tmpl]); setShowAdd(false); }} />}
      {pushTarget && <PushModal t={t} template={pushTarget} onClose={() => setPushTarget(null)} />}
    </div>
  );
}

function TemplateCard({ t, template: tmpl, onPush, onDelete }: { t: Theme; template: Template; onPush: () => void; onDelete: () => void }) {
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
        <button style={{ ...btnStyle(t), fontSize: 11 }}><Edit size={11} /> Edit</button>
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
        await fetch(`/api/device/${ip}/apply-template`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template_id: template.id, config: template.config }) });
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

function AddTemplateModal({ t, onClose, onCreate }: { t: Theme; onClose: () => void; onCreate: (tmpl: Template) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<Template['type']>('nmminer');
  const [description, setDescription] = useState('');
  const valid = name.trim();

  return (
    <Modal t={t} title="New template" onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FormField t={t} label="Name" value={name} onChange={setName} placeholder="e.g. High performance" />
        <FormField t={t} label="Description (optional)" value={description} onChange={setDescription} placeholder="Brief description" />
        <div>
          <Label t={t} style={{ marginBottom: 8 }}>Device type</Label>
          <div style={{ display: 'flex', gap: 6 }}>
            {([['nmminer', 'NMMiner'], ['axeos', 'AxeOS'], ['both', 'Both']] as [Template['type'], string][]).map(([v, label]) => (
              <button key={v} onClick={() => setType(v)} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: `1px solid ${type === v ? t.accent : t.border}`, background: type === v ? t.accentGlow : 'transparent', color: type === v ? t.accent : t.textMuted, cursor: 'pointer' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${t.border}` }}>
          <button onClick={onClose} style={btnStyle(t)}>Cancel</button>
          <button onClick={() => valid && onCreate({ id: Date.now().toString(), name, type, description, config: {} })} disabled={!valid} style={{ ...btnStyle(t, 'primary'), opacity: valid ? 1 : 0.5 }}>
            <Plus size={13} /> Create
          </button>
        </div>
      </div>
    </Modal>
  );
}
