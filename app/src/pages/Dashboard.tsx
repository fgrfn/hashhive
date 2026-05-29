import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, StatusPill, Segmented, SkeletonCard, useDataReady } from '../components/primitives';
import { AreaChart, MiniChart } from '../components/charts';
import { FONT_MONO, type Theme } from '../tokens';
import { api, getHashrate, getTemp, fmtHashrate, getAxeHashrate, matchesSearch, fmtProb, type StatSample, type ProbabilityResult } from '../api';
import type { Alert } from '../api';

export function Dashboard() {
  const { theme: t } = useThemeStore();
  const { devices, axeDevices, unreadAlerts, devicesOnline, devicesTotal, wsStatus, globalSearch } = useAppStore();
  const nmShown = devices.filter(d => matchesSearch(d, globalSearch));
  const axeShown = axeDevices.filter(d => matchesSearch(d, globalSearch));
  const navigate = useNavigate();
  const loading = useDataReady(wsStatus !== 'connecting');
  const [range, setRange] = useState('24h');
  const [metric, setMetric] = useState<'hashrate' | 'power' | 'efficiency'>('hashrate');
  const [logLines, setLogLines] = useState<Alert[]>([]);
  const [logFilter, setLogFilter] = useState('All');
  const logRef = useRef<HTMLDivElement>(null);

  const totalHr = devices.reduce((a, d) => a + getHashrate(d), 0) + axeDevices.reduce((a, d) => a + getAxeHashrate(d), 0);
  const maxTemp = Math.max(
    ...devices.map(d => getTemp(d) ?? 0),
    ...axeDevices.map(d => d.temp ?? 0),
    0
  );
  const totalPower = axeDevices.reduce((a, d) => a + (d.power ?? 0), 0);

  const [statSamples, setStatSamples] = useState<StatSample[]>([]);
  const [hrTrend, setHrTrend] = useState<{ pct: number; window: string } | null>(null);
  const [prob, setProb] = useState<ProbabilityResult | null>(null);

  useEffect(() => {
    api.alerts.list(1).then(a => setLogLines(a.slice(-40))).catch(() => {});
    api.probability().then(setProb).catch(() => setProb(null));
  }, []);

  // Fetch real hashrate history; derive chart data and trend from it
  useEffect(() => {
    const arg = range === '1h' ? { hours: 1 } : range === '6h' ? { hours: 6 }
      : range === '30d' ? { days: 30 } : range === '7d' ? { days: 7 } : { days: 1 };
    api.stats.hashrate(arg)
      .then(samples => {
        setStatSamples(samples);
        if (samples.length < 4) { setHrTrend(null); return; }
        const latest = samples[samples.length - 1];
        const latestHr = latest.gh ?? 0;
        if (latestHr <= 0) { setHrTrend(null); return; }
        const targetTs = Date.parse(latest.ts) - 3600_000;
        let candidate = samples[0];
        for (const s of samples) {
          if (Date.parse(s.ts) <= targetTs) candidate = s;
          else break;
        }
        const refHr = candidate.gh ?? 0;
        if (refHr <= 0) { setHrTrend(null); return; }
        setHrTrend({ pct: ((latestHr - refHr) / refHr) * 100, window: '1h' });
      })
      .catch(() => { setStatSamples([]); setHrTrend(null); });
  }, [range, devices.length, axeDevices.length]);

  // W/TH efficiency = power / (hashrate in TH/s); guard divide-by-zero.
  const metricValue = (s: StatSample): number => {
    if (metric === 'power') return s.pwr ?? 0;
    if (metric === 'efficiency') return s.gh && s.pwr ? s.pwr / (s.gh / 1000) : 0;
    return s.gh ?? 0;
  };
  const chartData = statSamples.map(metricValue);
  const sparkData = statSamples.slice(-30).map(s => s.gh ?? 0);
  const metricUnit = metric === 'power' ? 'W' : metric === 'efficiency' ? 'W/TH' : 'GH/s';

  const filteredLog = logLines.filter(l => {
    if (logFilter === 'NMMiner') return l.source === 'nmminer';
    if (logFilter === 'BitAxe')  return l.source === 'axeos';
    if (logFilter === 'System')  return l.source === 'system';
    return true;
  });

  if (loading) {
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 16 }}>
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} t={t} height={100} />)}
        </div>
        <SkeletonCard t={t} height={240} style={{ marginBottom: 16 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <SkeletonCard t={t} height={200} />
          <SkeletonCard t={t} height={200} />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KpiCard t={t} label="Total Hashrate" value={fmtHashrate(totalHr)} accent={t.accent} trend={hrTrend ? { pos: hrTrend.pct >= 0, label: `${hrTrend.pct >= 0 ? '+' : ''}${hrTrend.pct.toFixed(1)}% · ${hrTrend.window}` } : undefined} spark={sparkData.length > 1 ? sparkData : undefined} sparkColor={t.accent} />
        <KpiCard t={t} label="Devices Online" value={`${devicesOnline}/${devicesTotal}`} accent={t.success} trend={{ pos: true, label: devicesTotal > 0 ? `${Math.round(devicesOnline / devicesTotal * 100)}% uptime` : '' }} />
        <KpiCard t={t} label="Max Temp" value={maxTemp > 0 ? `${maxTemp}°C` : '—'} accent={maxTemp > 70 ? t.danger : maxTemp > 65 ? t.warning : t.success} />
        <KpiCard t={t} label="Total Power" value={totalPower > 0 ? `${totalPower.toFixed(1)}W` : '—'} accent={t.honey} />
        <KpiCard t={t} label="Open Alerts" value={String(unreadAlerts)} unit="unread" accent={t.danger} onClick={() => navigate('/alerts')} />
      </div>

      {/* Hero chart */}
      <Card t={t} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <Label t={t}>{metric === 'power' ? 'Power' : metric === 'efficiency' ? 'Efficiency' : 'Hashrate'} · {range}</Label>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', marginTop: 4 }}>
              {chartData.length > 0
                ? <>{metric === 'hashrate'
                      ? fmtHashrate(chartData.reduce((a, b) => a + b, 0) / chartData.length)
                      : `${(chartData.reduce((a, b) => a + b, 0) / chartData.length).toFixed(1)} ${metricUnit}`}
                    <span style={{ color: t.textMuted, fontSize: 13, fontWeight: 400, marginLeft: 6 }}>avg</span></>
                : <span style={{ color: t.textMuted, fontSize: 14, fontWeight: 400 }}>—</span>
              }
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Segmented t={t} options={['hashrate', 'power', 'efficiency']} value={metric} onChange={v => setMetric(v as typeof metric)} />
            <Segmented t={t} options={['1h', '6h', '24h', '7d', '30d']} value={range} onChange={setRange} />
          </div>
        </div>
        {chartData.length > 1
          ? <AreaChart t={t} data={chartData} accent={t.accent} h={200} unit={metricUnit} />
          : <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textMuted, fontSize: 13 }}>No historical data yet — data builds up over time.</div>
        }
        {chartData.length > 1 && (
          <div style={{ fontSize: 10, color: t.textDim, marginTop: 6, fontFamily: FONT_MONO, textAlign: 'right' }}>
            hover for exact value
          </div>
        )}
      </Card>

      {/* Block probability (Poisson) */}
      {prob && prob.fleet.hashrate_ghs > 0 && (
        <Card t={t} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <Label t={t}>Block chance · fleet {fmtHashrate(prob.fleet.hashrate_ghs)}</Label>
            <span style={{ fontSize: 10, color: t.textDim, fontFamily: FONT_MONO }}>Poisson · stat. estimate</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {(['1h', '24h', '7d'] as const).map(w => (
              <div key={w} style={{ padding: '12px 14px', background: t.surface2, borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: t.textMuted, fontFamily: FONT_MONO, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{w}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: t.honey, fontFamily: FONT_MONO, marginTop: 4 }}>{fmtProb(prob.fleet.block[w])}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Device mini tables */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
        <DeviceMini t={t} title="NMMiner Swarm" accent={t.accent} rows={nmShown.slice(0, 6).map(d => ({ ip: d.ip || '', name: d.name || d.hostname || d.ip || '', status: d.status || 'online', hr: d.GHs5s ?? d.GHs5 ?? d.GHsav ?? 0, temp: d.chipTemp ?? d.temp ?? null }))} onViewAll={() => navigate('/miners/nmminer')} onDevice={(d) => navigate(`/devices/${d.ip}`)} />
        <DeviceMini t={t} title="BitAxe / NerdAxe Fleet" accent={t.info} rows={axeShown.slice(0, 6).map(d => ({ ip: d._ip || '', name: d._name || d.hostname || d._ip || '', status: d.status || 'online', hr: d.hashRate || 0, temp: d.temp ?? null }))} onViewAll={() => navigate('/miners/axeos')} onDevice={(d) => navigate(`/devices/${d.ip}`)} />
      </div>

      {/* Live log */}
      <Card t={t}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Label t={t}>Live Log</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: t.success, fontFamily: FONT_MONO }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.success, boxShadow: `0 0 6px ${t.success}` }} />
              live
            </div>
          </div>
          <Segmented t={t} options={['All', 'NMMiner', 'BitAxe', 'System']} value={logFilter} onChange={setLogFilter} />
        </div>
        <div ref={logRef} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', fontFamily: FONT_MONO, fontSize: 12, maxHeight: 220, overflow: 'auto' }}>
          {filteredLog.length === 0 ? (
            <div style={{ color: t.textDim, padding: '8px 0' }}>No log entries yet.</div>
          ) : filteredLog.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '4px 0', lineHeight: 1.6, alignItems: 'flex-start' }}>
              <span style={{ color: t.textDim, fontSize: 11, flexShrink: 0 }}>{l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : l.when || ''}</span>
              <span style={{
                fontSize: 10, padding: '0 6px', borderRadius: 3, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0,
                background: l.source === 'nmminer' ? t.accentGlow : l.source === 'axeos' ? t.info + '22' : t.success + '22',
                color: l.source === 'nmminer' ? t.accent : l.source === 'axeos' ? t.info : t.success,
              }}>
                {l.source || 'sys'}
              </span>
              <span style={{
                color: l.severity === 'critical' ? t.danger : l.severity === 'warning' ? t.warning : l.severity === 'info' ? t.info : t.success,
                flex: 1,
              }}>
                {l.message}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ t, label, value, unit, accent, trend, spark, sparkColor, onClick }: {
  t: Theme;
  label: string; value: string; unit?: string; accent: string;
  trend?: { pos: boolean; label: string };
  spark?: number[]; sparkColor?: string; onClick?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: t.surface, border: `1px solid ${hovered && onClick ? accent : t.border}`,
        borderRadius: 12, padding: '14px 16px', position: 'relative', overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default', transition: 'border-color .15s',
      }}
    >
      <Label t={t}>{label}</Label>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: accent, letterSpacing: '-0.02em', fontFamily: FONT_MONO }}>{value}</div>
        {unit && <div style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT_MONO }}>{unit}</div>}
      </div>
      {trend && trend.label && (
        <div style={{ fontSize: 11, color: trend.pos ? t.success : t.danger, marginTop: 4, fontFamily: FONT_MONO }}>
          {trend.pos ? '▲' : '▼'} {trend.label}
        </div>
      )}
      {spark && sparkColor && (
        <div style={{ position: 'absolute', right: 10, bottom: 8, width: 80, opacity: 0.85 }}>
          <MiniChart data={spark} color={sparkColor} h={30} />
        </div>
      )}
    </div>
  );
}

// ─── Device Mini Table ───────────────────────────────────────────────────────

interface MiniRow { ip: string; name: string; status: string; hr: number; temp: number | null }

function DeviceMini({ t, title, accent, rows, onViewAll, onDevice }: {
  t: Theme;
  title: string; accent: string; rows: MiniRow[];
  onViewAll: () => void; onDevice: (d: MiniRow) => void;
}) {
  return (
    <Card t={t} noPad style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: accent }} />
      <div style={{ padding: '14px 18px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT_MONO }}>{rows.filter(r => r.status === 'online').length}/{rows.length} online</div>
          <button onClick={onViewAll} style={{ background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 6, padding: '3px 8px', fontSize: 11, color: t.text, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            View all →
          </button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 320, display: 'grid', gridTemplateColumns: '1.5fr 1fr 70px 90px', gap: 8, padding: '6px 18px', borderBottom: `1px solid ${t.border}`, borderTop: `1px solid ${t.border}`, background: t.surface2 }}>
          <Label t={t}>Name</Label><Label t={t}>Hashrate</Label><Label t={t}>Temp</Label><Label t={t}>Status</Label>
        </div>
        {rows.length === 0 && (
          <div style={{ padding: '16px 18px', color: t.textMuted, fontSize: 13 }}>No devices</div>
        )}
        {rows.map((r, i) => (
          <div key={r.ip || i} onClick={() => onDevice(r)} style={{ minWidth: 320, display: 'grid', gridTemplateColumns: '1.5fr 1fr 70px 90px', gap: 8, padding: '10px 18px', borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${t.border}`, alignItems: 'center', fontSize: 13, cursor: 'pointer', transition: 'background .1s' }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = t.surface2}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
          >
            <div>
              <div style={{ fontWeight: 500 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT_MONO }}>{r.ip}</div>
            </div>
            <div style={{ fontFamily: FONT_MONO, fontWeight: 600 }}>
              {fmtHashrate(r.hr)}
            </div>
            <div style={{ fontFamily: FONT_MONO, color: r.temp == null ? t.textMuted : r.temp > 70 ? t.danger : r.temp > 65 ? t.warning : t.success }}>
              {r.temp != null ? `${r.temp}°` : '—'}
            </div>
            <StatusPill t={t} status={r.status} />
          </div>
        ))}
      </div>
    </Card>
  );
}
