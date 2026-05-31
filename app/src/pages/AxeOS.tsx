import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, StatusPill, SkeletonRow, useDataReady, Modal, FormField, Toggle, btnStyle } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api, fmtUptime, fmtBestDiff, fmtRssi, fmtShares, matchesSearch } from '../api';
import type { AxeDevice } from '../api';
import { Zap, Pause, Play, RotateCcw, Lightbulb, Settings as SettingsIcon } from 'lucide-react';
import { toast } from '../store/toast';
import { useMobile } from '../hooks/useWindowWidth';

/** Writeable AxeOS config (matches the backend CONFIG_FIELDS whitelist). */
interface AxeConfig {
  stratumURL?: string; stratumPort?: number; stratumUser?: string; stratumPassword?: string;
  fallbackStratumURL?: string; fallbackStratumPort?: number; fallbackStratumUser?: string; fallbackStratumPassword?: string;
  frequency?: number; coreVoltage?: number;
  autofanspeed?: number; fanspeed?: number; temptarget?: number;
  hostname?: string; ssid?: string; wifiPass?: string;
}

export function AxeOS() {
  const { theme: t } = useThemeStore();
  const { axeDevices, wsStatus, globalSearch } = useAppStore();
  const navigate = useNavigate();
  const loading = useDataReady(wsStatus !== 'connecting');
  const [selected, setSelected] = useState(new Set<string>());
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [bulkFreqOpen, setBulkFreqOpen] = useState(false);
  const [editIp, setEditIp] = useState<string | null>(null);
  const mobile = useMobile();

  const filtered = axeDevices.filter(d => {
    const ip = d._ip || '';
    const name = d._name || d.hostname || ip;
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (query && !name.toLowerCase().includes(query.toLowerCase()) && !ip.includes(query)) return false;
    if (!matchesSearch(d, globalSearch)) return false;
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
      toast(`${action} sent to ${ip}`);
    } catch {
      toast(`${action} failed for ${ip}`, 'error');
    }
  };

  const doBulkAction = async (action: string) => {
    const ips = Array.from(selected);
    try {
      await api.axeos.batchAction(ips, action as 'pause' | 'resume' | 'restart' | 'identify');
      toast(`${action} sent to ${ips.length} device${ips.length !== 1 ? 's' : ''}`);
    } catch {
      toast(`Batch ${action} failed`, 'error');
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
        <div style={{ fontSize: 13, marginBottom: 14 }}>Discover them on your network or add one by IP.</div>
        <button onClick={() => navigate('/discovery')} style={{ ...btnStyle(t, 'primary'), fontSize: 13 }}>+ Add devices</button>
      </div>
    );
  }

  return (
    <div>
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

      {mobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(d => (
            <AxeMobileCard key={d._ip || ''} t={t} d={d} onAction={doAction} onNavigate={navigate} onConfigure={setEditIp} />
          ))}
        </div>
      ) : (
      <div style={{ overflowX: 'auto' }}>
      <Card t={t} noPad style={{ width: 'max-content', minWidth: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '28px 1.4fr 1fr 90px 110px 70px 75px 85px 80px 80px 80px 65px 70px 80px', gap: 10, padding: '10px 16px', background: t.surface2, borderBottom: `1px solid ${t.border}`, fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT_MONO, fontWeight: 600 }}>
          <div><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={() => { if (selected.size === filtered.length) setSelected(new Set()); else setSelected(new Set(filtered.map(d => d._ip || ''))); }} style={{ accentColor: t.info }} /></div>
          <Label t={t}>Name / IP</Label>
          <Label t={t}>ASIC / Board</Label>
          <Label t={t}>Status</Label>
          <Label t={t}>Hashrate</Label>
          <Label t={t}>Temp</Label>
          <Label t={t}>Power W</Label>
          <Label t={t}>Best Diff</Label>
          <Label t={t}>Last Diff</Label>
          <Label t={t}>Uptime</Label>
          <Label t={t}>Shares A/R</Label>
          <Label t={t}>RSSI</Label>
          <Label t={t}>Version</Label>
          <Label t={t}>Actions</Label>
        </div>
        {filtered.map((d, i) => {
          const ip = d._ip || '';
          const name = d._name || d.hostname || ip;
          const status = d.status || (d._online ? 'online' : 'offline');
          const temp = d.temp ?? null;
          const best = fmtBestDiff(d.bestDiff);
          const lastDiff = fmtBestDiff(d.lastDiff);
          const uptime = fmtUptime(d.uptimeSeconds);
          const shares = fmtShares(d.sharesAccepted, d.sharesRejected);
          const rssi = fmtRssi(d.rssi);
          return (
            <div key={ip || i}
              style={{ display: 'grid', gridTemplateColumns: '28px 1.4fr 1fr 90px 110px 70px 75px 85px 80px 80px 80px 65px 70px 80px', gap: 10, padding: '11px 16px', borderBottom: i === filtered.length - 1 ? 'none' : `1px solid ${t.border}`, alignItems: 'center', fontSize: 12 }}
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
              <div style={{ fontFamily: FONT_MONO, color: t.honey, fontSize: 11 }}>{lastDiff}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11 }}>{uptime}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11 }}>{shares}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: rssi === '—' ? t.textMuted : (d.rssi ?? 0) > -65 ? t.success : (d.rssi ?? 0) > -80 ? t.warning : t.danger }}>{rssi}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: t.textMuted }}>{d.version || d.axeOSVersion || '—'}</div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button title="Configure" onClick={() => setEditIp(ip)} style={{ ...btnStyle(t), padding: '3px 5px' }}><SettingsIcon size={11} /></button>
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
      </div>
      )}

      {bulkFreqOpen && (
        <BulkFreqModal t={t} onClose={() => setBulkFreqOpen(false)}
          onApply={async (freq, voltage) => {
            await api.axeos.configBatch(Array.from(selected), freq, voltage).catch(() => {});
            setBulkFreqOpen(false);
            setSelected(new Set());
          }}
        />
      )}

      {editIp && <AxeConfigModal t={t} ip={editIp} onClose={() => setEditIp(null)} />}
    </div>
  );
}

function AxeConfigModal({ t, ip, onClose }: { t: Theme; ip: string; onClose: () => void }) {
  const [cfg, setCfg] = useState<AxeConfig | null>(null);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    api.axeos.configOne1(ip).then(d => setCfg(d as AxeConfig)).catch(() => {
      toast('Failed to load device config', 'error');
      setCfg({});
    });
  }, [ip]);

  const set = (patch: Partial<AxeConfig>) => setCfg(c => ({ ...(c || {}), ...patch }));
  const num = (v: string): number | undefined => (v === '' ? undefined : Number(v));

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    // Send only fields that carry a value (empty password keeps the device's current one).
    const payload = Object.fromEntries(
      Object.entries(cfg).filter(([, v]) => v !== undefined && v !== '')
    );
    try {
      await api.axeos.configOne(ip, payload);
      toast('Device config saved — restart to apply pool/wifi changes');
      onClose();
    } catch {
      toast('Failed to save config', 'error');
    }
    setSaving(false);
  };

  const autofan = !!cfg?.autofanspeed;

  return (
    <Modal t={t} title={`Configure ${cfg?.hostname || ip}`} onClose={onClose} width={560}>
      {!cfg ? (
        <div style={{ color: t.textMuted, fontSize: 13, padding: 20 }}>Loading device config…</div>
      ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <AxeSection t={t} label="Network">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FormField t={t} label="Hostname" value={cfg.hostname || ''} onChange={v => set({ hostname: v })} />
            <FormField t={t} label="WiFi SSID" value={cfg.ssid || ''} onChange={v => set({ ssid: v })} />
            <FormField t={t} label="WiFi Password (blank = keep)" value={cfg.wifiPass || ''} onChange={v => set({ wifiPass: v })} type="password" />
          </div>
        </AxeSection>

        <AxeSection t={t} label="Primary Pool">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <FormField t={t} label="Stratum URL" value={cfg.stratumURL || ''} onChange={v => set({ stratumURL: v })} mono placeholder="stratum.example.com" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 10 }}>
              <FormField t={t} label="Worker / User" value={cfg.stratumUser || ''} onChange={v => set({ stratumUser: v })} mono />
              <FormField t={t} label="Port" value={String(cfg.stratumPort ?? '')} onChange={v => set({ stratumPort: num(v) })} mono type="number" />
            </div>
            <FormField t={t} label="Password" value={cfg.stratumPassword || ''} onChange={v => set({ stratumPassword: v })} mono placeholder="x" />
          </div>
        </AxeSection>

        <AxeSection t={t} label="Fallback Pool">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <FormField t={t} label="Stratum URL" value={cfg.fallbackStratumURL || ''} onChange={v => set({ fallbackStratumURL: v })} mono placeholder="backup.example.com" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 10 }}>
              <FormField t={t} label="Worker / User" value={cfg.fallbackStratumUser || ''} onChange={v => set({ fallbackStratumUser: v })} mono />
              <FormField t={t} label="Port" value={String(cfg.fallbackStratumPort ?? '')} onChange={v => set({ fallbackStratumPort: num(v) })} mono type="number" />
            </div>
            <FormField t={t} label="Password" value={cfg.fallbackStratumPassword || ''} onChange={v => set({ fallbackStratumPassword: v })} mono placeholder="x" />
          </div>
        </AxeSection>

        <AxeSection t={t} label="Performance">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FormField t={t} label="Frequency (MHz)" value={String(cfg.frequency ?? '')} onChange={v => set({ frequency: num(v) })} mono type="number" />
            <FormField t={t} label="Core Voltage (mV)" value={String(cfg.coreVoltage ?? '')} onChange={v => set({ coreVoltage: num(v) })} mono type="number" />
          </div>
        </AxeSection>

        <AxeSection t={t} label="Cooling">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13 }}>Automatic fan control</span>
            <Toggle t={t} on={autofan} onChange={v => set({ autofanspeed: v ? 1 : 0 })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {autofan
              ? <FormField t={t} label="Target temp (°C)" value={String(cfg.temptarget ?? '')} onChange={v => set({ temptarget: num(v) })} mono type="number" />
              : <FormField t={t} label="Fan speed (%)" value={String(cfg.fanspeed ?? '')} onChange={v => set({ fanspeed: num(v) })} mono type="number" />
            }
          </div>
        </AxeSection>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
          <button onClick={onClose} style={btnStyle(t)}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ ...btnStyle(t, 'primary'), opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      )}
    </Modal>
  );
}

function AxeSection({ t, label, children }: { t: Theme; label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label t={t} style={{ marginBottom: 8 }}>{label}</Label>
      {children}
    </div>
  );
}

function AxeMobileCard({ t, d, onAction, onNavigate, onConfigure }: { t: Theme; d: AxeDevice; onAction: (ip: string, action: 'pause' | 'resume' | 'restart' | 'identify') => void; onNavigate: (path: string) => void; onConfigure: (ip: string) => void }) {
  const ip = d._ip || '';
  const name = d._name || d.hostname || ip;
  const status = d.status || (d._online ? 'online' : 'offline');
  const temp = d.temp ?? null;
  return (
    <Card t={t}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div onClick={() => onNavigate(`/devices/${ip}`)} style={{ cursor: 'pointer', flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
          <div style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT_MONO }}>{ip}</div>
          {d._type && <div style={{ fontSize: 10, color: t.info, fontFamily: FONT_MONO, textTransform: 'uppercase' }}>{d._type}</div>}
        </div>
        <StatusPill t={t} status={status} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, marginBottom: 10 }}>
        <AxeKv t={t} label="Hashrate" value={d.hashRate ? `${d.hashRate.toFixed(1)} GH/s` : '—'} />
        <AxeKv t={t} label="Temp" value={temp != null ? `${temp}°` : '—'} color={temp == null ? t.textMuted : temp > 70 ? t.danger : temp > 65 ? t.warning : t.success} />
        <AxeKv t={t} label="Power" value={d.power ? `${d.power.toFixed(1)} W` : '—'} />
        <AxeKv t={t} label="Best Diff" value={fmtBestDiff(d.bestDiff)} color={t.honey} />
        <AxeKv t={t} label="Last Diff" value={fmtBestDiff(d.lastDiff)} color={t.honey} />
        <AxeKv t={t} label="Uptime" value={fmtUptime(d.uptimeSeconds)} />
        <AxeKv t={t} label="Shares A/R" value={fmtShares(d.sharesAccepted, d.sharesRejected)} />
        <AxeKv t={t} label="RSSI" value={fmtRssi(d.rssi)} />
        <AxeKv t={t} label="Version" value={d.version || d.axeOSVersion || '—'} />
        <AxeKv t={t} label="ASIC" value={d.ASICModel || '—'} />
      </div>
      <div style={{ display: 'flex', gap: 6, paddingTop: 8, borderTop: `1px solid ${t.border}` }}>
        <button onClick={() => onConfigure(ip)} style={{ ...btnStyle(t), fontSize: 11, flex: 1 }}><SettingsIcon size={11} /> Configure</button>
        {d._online && (
          <>
            {status !== 'paused'
              ? <button onClick={() => onAction(ip, 'pause')} style={{ ...btnStyle(t), fontSize: 11, flex: 1 }}><Pause size={11} /> Pause</button>
              : <button onClick={() => onAction(ip, 'resume')} style={{ ...btnStyle(t), fontSize: 11, flex: 1 }}><Play size={11} /> Resume</button>
            }
            <button onClick={() => onAction(ip, 'restart')} style={{ ...btnStyle(t), fontSize: 11, flex: 1 }}><RotateCcw size={11} /> Restart</button>
            <button onClick={() => onAction(ip, 'identify')} style={{ ...btnStyle(t), padding: '5px 10px' }}><Lightbulb size={11} /></button>
          </>
        )}
      </div>
    </Card>
  );
}

function AxeKv({ t, label, value, color }: { t: Theme; label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: FONT_MONO, fontWeight: 600, color: color ?? t.text }}>{value}</div>
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
