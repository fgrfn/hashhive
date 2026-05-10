import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, StatusPill, SkeletonRow, useLoading, Modal, FormField, btnStyle, Banner } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api, fmtUptime, fmtBestDiff } from '../api';
import { Zap, Pause, Play, RotateCcw, Lightbulb } from 'lucide-react';

export function AxeOS() {
  const { theme: t } = useThemeStore();
  const { axeDevices } = useAppStore();
  const navigate = useNavigate();
  const loading = useLoading(600);
  const [selected, setSelected] = useState(new Set<string>());
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [bulkFreqOpen, setBulkFreqOpen] = useState(false);
  const [actionResult, setActionResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const filtered = axeDevices.filter(d => {
    const ip = d._ip || '';
    const name = d._name || d.hostname || ip;
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (query && !name.toLowerCase().includes(query.toLowerCase()) && !ip.includes(query)) return false;
    return true;
  });

  const totalHr = filtered.reduce((a, d) => a + (d.hashRate || 0), 0);
  const totalPower = filtered.reduce((a, d) => a + (d.power || 0), 0);
  const online = filtered.filter(d => d._online).length;

  const toggle = (ip: string) => {
    const s = new Set(selected);
    if (s.has(ip)) s.delete(ip); else s.add(ip);
    setSelected(s);
  };

  const doAction = async (ip: string, action: 'pause' | 'resume' | 'restart' | 'identify') => {
    try {
      await api.axeos.action(ip, action);
      setActionResult({ ok: true, msg: `${action} sent to ${ip}` });
    } catch (e) {
      setActionResult({ ok: false, msg: `Failed: ${String(e)}` });
    }
    setTimeout(() => setActionResult(null), 3000);
  };

  const doBulkAction = async (action: string) => {
    for (const ip of selected) {
      await api.axeos.action(ip, action as 'pause' | 'resume' | 'restart' | 'identify').catch(() => {});
    }
    setSelected(new Set());
  };

  if (loading) {
    return (
      <Card t={t} noPad>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonRow key={i} t={t} cols={['20px', '120px', '80px', '70px', '90px', '60px', '60px', '70px', '60px']} />
        ))}
      </Card>
    );
  }

  if (axeDevices.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: t.textMuted }}>
        <Zap size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
        <div style={{ fontSize: 16, fontWeight: 600, color: t.text, marginBottom: 6 }}>No BitAxe / NerdAxe devices</div>
        <div style={{ fontSize: 13 }}>Add your devices in Settings → General → AxeOS Devices.</div>
      </div>
    );
  }

  return (
    <div>
      {actionResult && (
        <Banner t={t} sev={actionResult.ok ? 'info' : 'critical'}>{actionResult.msg}</Banner>
      )}

      {/* Stats header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <KpiSm t={t} label="Hashrate" value={`${totalHr.toFixed(1)}`} unit="GH/s" color={t.info} />
          <KpiSm t={t} label="Online" value={`${online}/${filtered.length}`} color={t.success} />
          <KpiSm t={t} label="Power" value={`${totalPower.toFixed(1)}`} unit="W" color={t.honey} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, fontSize: 12, fontFamily: FONT_MONO }}>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter…" style={{ background: 'transparent', border: 'none', outline: 'none', color: t.text, fontSize: 12, fontFamily: FONT_MONO, width: 160 }} />
          </div>
          {['all', 'online', 'warning', 'offline', 'paused'].map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} style={{ ...btnStyle(t), padding: '4px 10px', fontSize: 11, background: statusFilter === f ? t.accentGlow : 'transparent', color: statusFilter === f ? t.accent : t.textMuted }}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div style={{ background: t.accentGlow, border: `1px solid ${t.accent}`, borderRadius: 10, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 13, color: t.accent, fontWeight: 600 }}>{selected.size} selected</div>
          <div style={{ flex: 1 }} />
          <button onClick={() => doBulkAction('pause')} style={{ ...btnStyle(t), fontSize: 12 }}><Pause size={13} /> Pause</button>
          <button onClick={() => doBulkAction('resume')} style={{ ...btnStyle(t), fontSize: 12 }}><Play size={13} /> Resume</button>
          <button onClick={() => doBulkAction('restart')} style={{ ...btnStyle(t), fontSize: 12 }}><RotateCcw size={13} /> Restart</button>
          <button onClick={() => setBulkFreqOpen(true)} style={{ ...btnStyle(t), fontSize: 12 }}>Freq / Voltage</button>
          <button onClick={() => setSelected(new Set())} style={{ ...btnStyle(t), padding: 6 }}>✕</button>
        </div>
      )}

      <Card t={t} noPad>
        <div style={{ display: 'grid', gridTemplateColumns: '28px 1.4fr 1fr 90px 110px 70px 80px 90px 80px 80px', gap: 10, padding: '10px 16px', background: t.surface2, borderBottom: `1px solid ${t.border}`, fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT_MONO, fontWeight: 600 }}>
          <div><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={() => { if (selected.size === filtered.length) setSelected(new Set()); else setSelected(new Set(filtered.map(d => d._ip || ''))); }} style={{ accentColor: t.info }} /></div>
          <Label t={t}>Name / IP</Label>
          <Label t={t}>ASIC / Board</Label>
          <Label t={t}>Status</Label>
          <Label t={t}>Hashrate</Label>
          <Label t={t}>Temp</Label>
          <Label t={t}>Power (W)</Label>
          <Label t={t}>Best Diff</Label>
          <Label t={t}>Uptime</Label>
          <Label t={t}>Actions</Label>
        </div>
        {filtered.map((d, i) => {
          const ip = d._ip || '';
          const name = d._name || d.hostname || ip;
          const status = d.status || (d._online ? 'online' : 'offline');
          const temp = d.temp ?? null;
          const best = fmtBestDiff(d.bestDiff);
          const uptime = fmtUptime(d.uptimeSeconds);
          return (
            <div key={ip || i}
              style={{ display: 'grid', gridTemplateColumns: '28px 1.4fr 1fr 90px 110px 70px 80px 90px 80px 80px', gap: 10, padding: '11px 16px', borderBottom: i === filtered.length - 1 ? 'none' : `1px solid ${t.border}`, alignItems: 'center', fontSize: 12 }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = t.surface2}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
            >
              <div onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={selected.has(ip)} onChange={() => toggle(ip)} style={{ accentColor: t.info }} />
              </div>
              <div onClick={() => navigate(`/devices/${ip}`)} style={{ cursor: 'pointer' }}>
                <div style={{ fontWeight: 600 }}>{name}</div>
                <div style={{ fontSize: 10, color: t.textMuted, fontFamily: FONT_MONO }}>{ip}</div>
                {d._type && <div style={{ fontSize: 9, color: t.info, fontFamily: FONT_MONO, textTransform: 'uppercase' }}>{d._type}</div>}
              </div>
              <div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 11 }}>{d.ASICModel || '—'}</div>
                <div style={{ fontSize: 10, color: t.textDim, fontFamily: FONT_MONO }}>{d.boardVersion || ''}</div>
              </div>
              <StatusPill t={t} status={status} />
              <div style={{ fontFamily: FONT_MONO, fontWeight: 600 }}>
                {d.hashRate ? <>{d.hashRate.toFixed(1)} <span style={{ color: t.textMuted, fontSize: 10, fontWeight: 400 }}>GH/s</span></> : <span style={{ color: t.textMuted }}>—</span>}
              </div>
              <div style={{ fontFamily: FONT_MONO, color: temp == null ? t.textMuted : temp > 70 ? t.danger : temp > 65 ? t.warning : t.success }}>
                {temp != null ? `${temp}°` : '—'}
              </div>
              <div style={{ fontFamily: FONT_MONO }}>{d.power ? d.power.toFixed(1) : '—'}</div>
              <div style={{ fontFamily: FONT_MONO, color: t.honey, fontSize: 11 }}>{best}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11 }}>{uptime}</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {d._online && (
                  <>
                    {status !== 'paused'
                      ? <button title="Pause" onClick={() => doAction(ip, 'pause')} style={{ ...btnStyle(t), padding: '3px 5px' }}><Pause size={11} /></button>
                      : <button title="Resume" onClick={() => doAction(ip, 'resume')} style={{ ...btnStyle(t), padding: '3px 5px' }}><Play size={11} /></button>
                    }
                    <button title="Restart" onClick={() => doAction(ip, 'restart')} style={{ ...btnStyle(t), padding: '3px 5px' }}><RotateCcw size={11} /></button>
                    <button title="Identify" onClick={() => doAction(ip, 'identify')} style={{ ...btnStyle(t), padding: '3px 5px' }}><Lightbulb size={11} /></button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      {bulkFreqOpen && (
        <BulkFreqModal t={t} onClose={() => setBulkFreqOpen(false)}
          onApply={async (freq, voltage) => {
            await api.axeos.configBatch(Array.from(selected), freq, voltage).catch(() => {});
            setBulkFreqOpen(false);
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}

function KpiSm({ t, label, value, unit, color }: { t: Theme; label: string; value: string; unit?: string; color: string }) {
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 14px' }}>
      <Label t={t}>{label}</Label>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: FONT_MONO, marginTop: 4 }}>
        {value} {unit && <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 400 }}>{unit}</span>}
      </div>
    </div>
  );
}

function BulkFreqModal({ t, onClose, onApply }: { t: Theme; onClose: () => void; onApply: (freq: number, voltage: number) => void }) {
  const [freq, setFreq] = useState('490');
  const [voltage, setVoltage] = useState('1150');
  return (
    <Modal t={t} title="Bulk Freq / Voltage" onClose={onClose} width={360}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField t={t} label="Frequency (MHz)" value={freq} onChange={setFreq} mono type="number" />
        <FormField t={t} label="Core Voltage (mV)" value={voltage} onChange={setVoltage} mono type="number" />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${t.border}` }}>
          <button onClick={onClose} style={btnStyle(t)}>Cancel</button>
          <button onClick={() => onApply(Number(freq), Number(voltage))} style={btnStyle(t, 'primary')}>Apply to selected</button>
        </div>
      </div>
    </Modal>
  );
}
