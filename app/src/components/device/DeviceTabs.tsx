// Per-tab views for the device detail page (extracted from DeviceDetail.tsx).
import React, { useState, useEffect, useCallback } from 'react';
import { Card, Label, Spinner, btnStyle } from '../primitives';
import { AreaChart } from '../charts';
import { FONT_MONO, type Theme } from '../../tokens';
import { api, fmtUptime, fmtHashrate, fmtBestDiff, fmtProb } from '../../api';
import type { NMMinerDevice, AxeDevice, HealthData, ProbabilityResult } from '../../api';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export function StatGrid({ t, stats }: { t: Theme; stats: [string, string, string?][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
      {stats.map(([label, value, color]) => (
        <div key={label} style={{ padding: '10px 12px', background: t.surface2, borderRadius: 8, minWidth: 0 }}>
          <div style={{ fontSize: 9, color: t.textMuted, fontFamily: FONT_MONO, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: color || t.text, fontFamily: FONT_MONO, marginTop: 3, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{value}</div>
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
    ['Accepted', String(nmDevice.shares_ok ?? '—'), t.success],
    ['Rejected', String(nmDevice.shares_err ?? '—'), nmDevice.shares_err ? t.danger : t.text],
    ['Best diff', fmtBestDiff(nmDevice.bestShare ?? nmDevice.best_share ?? nmDevice.bestDiff)],
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

      {nmDevice && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
          <Card t={t}>
            <Label t={t} style={{ marginBottom: 8 }}>Network</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontFamily: FONT_MONO }}>
              {[
                ['Pool', nmDevice.stratumURL ?? nmDevice.pool ?? '—'],
                ['Worker', nmDevice.stratumUser ?? nmDevice.worker ?? '—'],
                ['RSSI', (nmDevice.rssi ?? nmDevice.wifi_rssi) != null ? `${nmDevice.rssi ?? nmDevice.wifi_rssi} dBm` : '—'],
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
                ['Firmware', nmDevice.version || '—'],
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
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.axeos.logs(ip);
      setLogs(d.logs || []);
      setSource(d.source || '');
      if (d.error) setError(d.error);
    } catch {
      setError('Failed to fetch logs');
      setLogs([]);
    }
    setLoading(false);
  }, [ip]);

  // Fetch on mount without a synchronous setState in the effect body.
  useEffect(() => {
    let active = true;
    api.axeos.logs(ip).then(d => {
      if (!active) return;
      setLogs(d.logs || []);
      setSource(d.source || '');
      setError(d.error || null);
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setError('Failed to fetch logs');
      setLogs([]);
      setLoading(false);
    });
    return () => { active = false; };
  }, [ip]);

  // `live` means we briefly tapped the device's WebSocket stream (a snapshot of
  // recent lines), `history` means the firmware served a buffered log file.
  const sourceLabel = source === 'history' ? 'buffered history'
    : source === 'live' ? 'live snapshot' : '';

  return (
    <Card t={t} noPad>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Label t={t}>Device log</Label>
          {sourceLabel && <span style={{ fontSize: 10, color: t.textMuted, fontFamily: FONT_MONO, background: t.surface2, padding: '1px 6px', borderRadius: 4 }}>{sourceLabel}</span>}
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: t.textMuted }}>{logs.length} lines</span>
        </div>
        <button onClick={load} disabled={loading} style={{ ...btnStyle(t), fontSize: 11, padding: '4px 10px' }}>
          {loading ? <Spinner t={t} size={12} /> : <RotateCcw size={12} />} Refresh
        </button>
      </div>
      <div style={{ maxHeight: 480, overflowY: 'auto', padding: '12px 16px', fontFamily: FONT_MONO, fontSize: 11, lineHeight: 1.7 }}>
        {loading && logs.length === 0 ? (
          <div style={{ color: t.textMuted }}>Fetching logs…</div>
        ) : error && logs.length === 0 ? (
          <div style={{ color: t.textMuted }}>{error} — the device may not expose logs over HTTP/WebSocket.</div>
        ) : logs.length === 0 ? (
          <div style={{ color: t.textMuted }}>No log lines captured.</div>
        ) : logs.map((line, i) => {
          const isError = /error|fail|err\b/i.test(line);
          const isWarn = /warn/i.test(line);
          return (
            <div key={i} style={{ color: isError ? t.danger : isWarn ? t.warning : t.textMuted, marginBottom: 2, wordBreak: 'break-all' }}>{line}</div>
          );
        })}
      </div>
    </Card>
  );
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function PowerCurveTab({ t, ip, axeDevice }: { t: Theme; ip: string; axeDevice?: AxeDevice }) {
  const curFreq = axeDevice?.frequency ?? 525;
  // AxeOS exposes the ASIC core voltage as `coreVoltage` (set, mV) / `coreVoltageActual`
  // (measured, mV). The plain `voltage` field is the *input* rail (~5000 mV) and must NOT
  // be used here, or the slider/estimate blow up (e.g. 4955 mV -> ~60 W).
  const curVolt = axeDevice?.coreVoltage ?? axeDevice?.core_voltage ?? axeDevice?.coreVoltageActual ?? 1200;
  const [freq, setFreq] = useState(clamp(curFreq, 200, 800));
  const [volt, setVolt] = useState(clamp(curVolt, 1000, 1300));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!axeDevice) {
    return <div style={{ color: t.textMuted, fontSize: 13 }}>Power curve is only available for AxeOS devices.</div>;
  }

  // Dynamic ASIC power scales ~linearly with frequency and with the square of core
  // voltage (P proportional to f*V^2). Anchor on the device's measured power at its current
  // operating point so the estimate matches reality at the current settings.
  const basePower = axeDevice.power || 15;
  const freqFactor = curFreq > 0 ? freq / curFreq : 1;
  const voltFactor = curVolt > 0 ? volt / curVolt : 1;
  const estimatedPower = basePower * freqFactor * voltFactor * voltFactor;

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
