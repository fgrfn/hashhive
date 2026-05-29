// Per-tab views for the device detail page (extracted from DeviceDetail.tsx).
import React, { useState, useEffect, useRef } from 'react';
import { Card, Label, Spinner, btnStyle } from '../primitives';
import { AreaChart } from '../charts';
import { FONT_MONO, type Theme } from '../../tokens';
import { api, fmtUptime, fmtHashrate, fmtBestDiff, fmtProb } from '../../api';
import type { NMMinerDevice, AxeDevice, HealthData, ProbabilityResult } from '../../api';
import { AlertTriangle } from 'lucide-react';

export function StatGrid({ t, stats }: { t: Theme; stats: [string, string, string?][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
      {stats.map(([label, value, color]) => (
        <div key={label} style={{ padding: '10px 12px', background: t.surface2, borderRadius: 8 }}>
          <div style={{ fontSize: 9, color: t.textMuted, fontFamily: FONT_MONO, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: color || t.text, fontFamily: FONT_MONO, marginTop: 3 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

export function OverviewTab({ t, nmDevice, axeDevice, hr, temp, uptime, health, prob }: {
  t: Theme;
  nmDevice?: NMMinerDevice;
  axeDevice?: AxeDevice;
  hr: number;
  temp: number | null;
  uptime: number | string | null;
  health: HealthData | null;
  prob: ProbabilityResult['devices'][number] | null;
}) {
  const tempColor = temp != null ? (temp > 80 ? t.danger : temp > 70 ? t.warning : t.success) : t.text;

  const nmStats: [string, string, string?][] = nmDevice ? [
    ['Hashrate', fmtHashrate(hr), t.accent],
    ['Chip temp', temp != null ? `${temp}°C` : '—', tempColor],
    ['Uptime', uptime != null ? fmtUptime(typeof uptime === 'string' ? parseInt(uptime) : uptime) : '—'],
    ['Pool', nmDevice.stratumURL || nmDevice.pool || '—'],
    ['Worker', nmDevice.stratumUser || nmDevice.worker || '—'],
    ['Best share', fmtBestDiff(nmDevice.bestShare ?? nmDevice.best_share ?? nmDevice.bestDiff)],
    ['Accepted', String(nmDevice.shares_ok ?? '—'), t.success],
    ['Rejected', String(nmDevice.shares_err ?? '—'), nmDevice.shares_err ? t.danger : t.text],
    ['Version', nmDevice.version || '—'],
  ] : [];

  const axeStats: [string, string, string?][] = axeDevice ? [
    ['Hashrate', fmtHashrate(hr), t.accent],
    ['Chip temp', temp != null ? `${temp}°C` : '—', tempColor],
    ['VR temp', axeDevice.vrTemp != null ? `${axeDevice.vrTemp}°C` : '—'],
    ['Power', axeDevice.power != null ? `${axeDevice.power.toFixed(1)} W` : '—'],
    ['Frequency', axeDevice.frequency != null ? `${axeDevice.frequency} MHz` : '—'],
    ['Fan', axeDevice.fanspeed != null ? `${axeDevice.fanspeed}%` : axeDevice.fanrpm != null ? `${axeDevice.fanrpm} RPM` : '—'],
    ['Accepted', String(axeDevice.sharesAccepted ?? '—'), t.success],
    ['Rejected', String(axeDevice.sharesRejected ?? '—'), axeDevice.sharesRejected ? t.danger : t.text],
    ['Best diff', fmtBestDiff(axeDevice.bestDiff)],
    ['Error rate', axeDevice.errorPercentage != null ? `${axeDevice.errorPercentage.toFixed(2)}%` : '—', axeDevice.errorPercentage && axeDevice.errorPercentage > 2 ? t.warning : t.text],
    ['Uptime', axeDevice.uptimeSeconds != null ? fmtUptime(axeDevice.uptimeSeconds) : '—'],
    ['Model', axeDevice.ASICModel || axeDevice._type || '—'],
  ] : [];

  const stats = nmDevice ? nmStats : axeStats;

  return (
    <div>
      <StatGrid t={t} stats={stats} />

      {prob && prob.hashrate_ghs > 0 && (
        <Card t={t} style={{ marginTop: 14 }}>
          <Label t={t} style={{ marginBottom: 10 }}>Solo odds · Poisson estimate (24h)</Label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ padding: '12px 14px', background: t.surface2, borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: t.textMuted, fontFamily: FONT_MONO, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Beat best share</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: t.accent, fontFamily: FONT_MONO, marginTop: 4 }}>{fmtProb(prob.beat_best_share['24h'])}</div>
            </div>
            <div style={{ padding: '12px 14px', background: t.surface2, borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: t.textMuted, fontFamily: FONT_MONO, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Find a block</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: t.honey, fontFamily: FONT_MONO, marginTop: 4 }}>{fmtProb(prob.block['24h'])}</div>
            </div>
          </div>
        </Card>
      )}

      {health && health.hashrate_series && health.hashrate_series.length > 0 && (
        <Card t={t} style={{ marginTop: 14 }}>
          <Label t={t} style={{ marginBottom: 10 }}>Hashrate · last 24h</Label>
          <AreaChart t={t} data={health.hashrate_series} accent={t.accent} h={160} unit="GH/s" />
        </Card>
      )}

      {axeDevice && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
          <Card t={t}>
            <Label t={t} style={{ marginBottom: 8 }}>Network</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontFamily: FONT_MONO }}>
              {[
                ['SSID', axeDevice.wifiSSID || axeDevice.ssid || '—'],
                ['RSSI', axeDevice.rssi != null ? `${axeDevice.rssi} dBm` : '—'],
                ['Pool', axeDevice.stratumURL || '—'],
                ['Worker', axeDevice.stratumUser || '—'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: t.textMuted }}>{k}</span>
                  <span style={{ color: t.text, maxWidth: '60%', textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card t={t}>
            <Label t={t} style={{ marginBottom: 8 }}>Firmware</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontFamily: FONT_MONO }}>
              {[
                ['Board', axeDevice.boardVersion || '—'],
                ['Firmware', axeDevice.version || axeDevice.axeOSVersion || '—'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: t.textMuted }}>{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export function ChartsTab({ t, health }: { t: Theme; ip?: string; health: HealthData | null }) {
  if (!health) {
    return <div style={{ color: t.textMuted, fontSize: 13 }}>Loading chart data…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {health.hashrate_series && health.hashrate_series.length > 0 && (
        <Card t={t}>
          <Label t={t} style={{ marginBottom: 10 }}>Hashrate (GH/s)</Label>
          <AreaChart t={t} data={health.hashrate_series} accent={t.accent} h={180} unit="GH/s" />
        </Card>
      )}
      {health.temp_series && health.temp_series.length > 0 && (
        <Card t={t}>
          <Label t={t} style={{ marginBottom: 10 }}>Temperature (°C)</Label>
          <AreaChart t={t} data={health.temp_series} accent={t.danger} h={160} unit="°C" />
        </Card>
      )}
      {health.power_series && health.power_series.length > 0 && (
        <Card t={t}>
          <Label t={t} style={{ marginBottom: 10 }}>Power (W)</Label>
          <AreaChart t={t} data={health.power_series} accent={t.honey} h={160} unit="W" />
        </Card>
      )}
      {(!health.hashrate_series || health.hashrate_series.length === 0) && (!health.temp_series || health.temp_series.length === 0) && (!health.power_series || health.power_series.length === 0) && (
        <div style={{ color: t.textMuted, fontSize: 13, padding: '24px 0' }}>No historical data available yet.</div>
      )}
    </div>
  );
}

export function LogsTab({ t, ip }: { t: Theme; ip: string }) {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    api.device.logs(ip).then(d => {
      setLogs(Array.isArray(d) ? d : d.logs || []);
    }).catch(() => {
      setLogs(['[INFO] No log data available for this device.']);
    });
  }, [ip]);

  return (
    <Card t={t} noPad>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Label t={t}>Device log</Label>
        <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: t.textMuted }}>{logs.length} lines</span>
      </div>
      <div style={{ maxHeight: 480, overflowY: 'auto', padding: '12px 16px', fontFamily: FONT_MONO, fontSize: 11, lineHeight: 1.7 }}>
        {logs.length === 0 ? (
          <div style={{ color: t.textMuted }}>No logs available.</div>
        ) : logs.map((line, i) => {
          const isError = /error|fail|err/i.test(line);
          const isWarn = /warn/i.test(line);
          return (
            <div key={i} style={{ color: isError ? t.danger : isWarn ? t.warning : t.textMuted, marginBottom: 2 }}>{line}</div>
          );
        })}
      </div>
    </Card>
  );
}

export function ConsoleTab({ t, ip }: { t: Theme; ip: string }) {
  const [history, setHistory] = useState<{ cmd: string; out: string }[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const run = async () => {
    const cmd = input.trim();
    if (!cmd || running) return;
    setInput('');
    setRunning(true);
    try {
      const data = await api.device.exec(ip, cmd);
      setHistory(prev => [...prev, { cmd, out: data.output || data.result || JSON.stringify(data) }]);
    } catch {
      setHistory(prev => [...prev, { cmd, out: 'Error: command failed' }]);
    }
    setRunning(false);
  };

  return (
    <Card t={t} noPad>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}` }}>
        <Label t={t}>Remote console</Label>
      </div>
      <div style={{ height: 380, overflowY: 'auto', padding: '12px 16px', fontFamily: FONT_MONO, fontSize: 12, background: t.surface2 }}>
        {history.length === 0 && <div style={{ color: t.textDim }}>Type a command below and press Enter.</div>}
        {history.map((h, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ color: t.accent }}>{'>'} {h.cmd}</div>
            <pre style={{ margin: 0, color: t.text, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{h.out}</pre>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderTop: `1px solid ${t.border}` }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: t.accent, display: 'flex', alignItems: 'center' }}>{'>'}</span>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && run()}
          placeholder="Enter command…"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: FONT_MONO, fontSize: 13, color: t.text }}
          autoFocus
        />
        {running && <Spinner t={t} size={14} />}
      </div>
    </Card>
  );
}

export function PowerCurveTab({ t, ip, axeDevice }: { t: Theme; ip: string; axeDevice?: AxeDevice }) {
  const curFreq = axeDevice?.frequency ?? 525;
  const curVolt = axeDevice?.core_voltage ?? axeDevice?.voltage ?? 1100;
  const [freq, setFreq] = useState(curFreq);
  const [volt, setVolt] = useState(curVolt);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!axeDevice) {
    return <div style={{ color: t.textMuted, fontSize: 13 }}>Power curve is only available for AxeOS devices.</div>;
  }

  const estimatedPower = (freq / 525) * (volt / 1100) * (axeDevice.power || 15);

  const apply = async () => {
    setSaving(true);
    await api.axeos.configOne(ip, { frequency: freq, core_voltage: volt }).catch(() => { /* save failed */ });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card t={t}>
        <Label t={t} style={{ marginBottom: 14 }}>Frequency & voltage</Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13 }}>Frequency</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 700, color: t.accent }}>{freq} MHz</span>
            </div>
            <input type="range" min={200} max={800} step={25} value={freq} onChange={e => setFreq(Number(e.target.value))} style={{ width: '100%', accentColor: t.accent }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: t.textDim, fontFamily: FONT_MONO, marginTop: 2 }}>
              <span>200</span><span>800 MHz</span>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13 }}>Core voltage</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 700, color: t.warning }}>{volt} mV</span>
            </div>
            <input type="range" min={1000} max={1300} step={10} value={volt} onChange={e => setVolt(Number(e.target.value))} style={{ width: '100%', accentColor: t.warning }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: t.textDim, fontFamily: FONT_MONO, marginTop: 2 }}>
              <span>1000</span><span>1300 mV</span>
            </div>
          </div>

          <div style={{ padding: '12px 14px', background: t.surface2, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: t.textMuted }}>Estimated power draw</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 16, fontWeight: 700, color: estimatedPower > 20 ? t.danger : t.success }}>{estimatedPower.toFixed(1)} W</span>
          </div>

          {(freq > curFreq * 1.2 || volt > 1200) && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: `${t.warning}22`, border: `1px solid ${t.warning}55`, borderRadius: 8, fontSize: 12, color: t.warning }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              High frequency/voltage may overheat or damage the device.
            </div>
          )}

          <button onClick={apply} disabled={saving} style={{ ...btnStyle(t, saved ? 'honey' : 'primary'), alignSelf: 'flex-end', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Applying…' : saved ? 'Applied!' : 'Apply settings'}
          </button>
        </div>
      </Card>
    </div>
  );
}

export function ConfigTab({ t, nmDevice, axeDevice }: { t: Theme; ip?: string; nmDevice?: NMMinerDevice; axeDevice?: AxeDevice }) {
  const raw = nmDevice ? nmDevice : axeDevice;

  return (
    <Card t={t} noPad>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}` }}>
        <Label t={t}>Raw device config</Label>
      </div>
      <pre style={{ padding: '16px', fontFamily: FONT_MONO, fontSize: 11, color: t.text, margin: 0, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6 }}>
        {JSON.stringify(raw, null, 2)}
      </pre>
    </Card>
  );
}
