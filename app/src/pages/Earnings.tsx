import React, { useState, useEffect } from 'react';
import { useThemeStore } from '../store/theme';
import { Card, Label, Segmented, SkeletonCard, btnStyle } from '../components/primitives';
import { AreaChart } from '../components/charts';
import { FONT_MONO, type Theme } from '../tokens';
import { api } from '../api';
import type { EarningsEntry } from '../api';
import { Download } from 'lucide-react';

export function Earnings() {
  const { theme: t } = useThemeStore();
  const [fetched, setFetched] = useState(false);
  const [range, setRange] = useState('30d');
  const [earnings, setEarnings] = useState<EarningsEntry[]>([]);

  useEffect(() => {
    api.earnings(60).then(setEarnings).catch(() => {}).finally(() => setFetched(true));
  }, []);

  const days = range === '7d' ? 7 : range === '30d' ? 30 : 60;
  const data = earnings.slice(-days);

  const totalBtc = data.reduce((a, d) => a + d.btc_reward, 0);
  const totalUsd = data.reduce((a, d) => a + d.usd_reward, 0);
  const totalCost = data.reduce((a, d) => a + d.usd_cost, 0);
  const profit = totalUsd - totalCost;

  if (!fetched) {
    return (
      <div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} t={t} height={70} style={{ flex: 1 }} />)}
        </div>
        <SkeletonCard t={t} height={260} style={{ marginBottom: 14 }} />
      </div>
    );
  }

  const hrSeries = data.map(d => d.avg_hr_ghs);
  const rewardSeries = data.map(d => d.usd_reward);
  const labels = data.map(d => d.date.slice(5)); // MM-DD

  const maxBar = Math.max(...data.map(d => d.btc_reward), 0.000001);

  return (
    <div>
      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <KpiSm t={t} label="Earned (BTC)" value={totalBtc.toFixed(6)} color={t.honey} />
        <KpiSm t={t} label="Earned (USD)" value={`$${totalUsd.toFixed(0)}`} color={t.success} />
        <KpiSm t={t} label="Electricity" value={`$${totalCost.toFixed(0)}`} color={t.danger} />
        <KpiSm t={t} label="Net profit" value={`${profit >= 0 ? '+' : ''}$${profit.toFixed(0)}`} color={profit >= 0 ? t.success : t.danger} />
        <div style={{ flex: 1 }} />
        <Segmented t={t} value={range} onChange={setRange} options={[{ value: '7d', label: '7d' }, { value: '30d', label: '30d' }, { value: '60d', label: '60d' }]} />
        <button style={{ ...btnStyle(t), fontSize: 12 }}><Download size={12} /> Export CSV</button>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card t={t}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <Label t={t}>Reward vs cost · {range}</Label>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, fontFamily: FONT_MONO }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 2, background: t.success, display: 'inline-block' }} /> Reward</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 2, background: t.danger, display: 'inline-block' }} /> Cost</span>
            </div>
          </div>
          <AreaChart t={t} data={rewardSeries} accent={t.success} h={200} labels={labels} unit="$" />
        </Card>
        <Card t={t}>
          <Label t={t} style={{ marginBottom: 12 }}>Profitability</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            {[
              ['Days tracked', String(data.length)],
              ['Reward / day avg', `$${data.length > 0 ? (totalUsd / data.length).toFixed(2) : '—'}`],
              ['Cost / day avg', `$${data.length > 0 ? (totalCost / data.length).toFixed(2) : '—'}`],
              ['Margin', data.length > 0 && totalUsd > 0 ? `${((profit / totalUsd) * 100).toFixed(1)}%` : '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ color: t.textMuted, fontSize: 12 }}>{k}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 13 }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Hashrate chart */}
      {hrSeries.some(v => v > 0) && (
        <Card t={t} style={{ marginBottom: 14 }}>
          <Label t={t} style={{ marginBottom: 10 }}>Average hashrate · {range}</Label>
          <AreaChart t={t} data={hrSeries} accent={t.accent} h={160} labels={labels} unit="GH/s" />
        </Card>
      )}

      {/* Daily bar chart */}
      <Card t={t} style={{ marginBottom: 14 }}>
        <Label t={t} style={{ marginBottom: 10 }}>Daily BTC reward</Label>
        {data.length === 0 ? (
          <div style={{ color: t.textMuted, fontSize: 13, padding: '16px 0' }}>No earnings data available yet.</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 100 }}>
            {data.map((d, i) => {
              const h = Math.max(4, (d.btc_reward / maxBar) * 90);
              return (
                <div key={i} title={`${d.date}: ${d.btc_reward.toFixed(8)} BTC`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{ width: '100%', height: `${h}%`, background: t.honey, opacity: 0.85, borderRadius: '2px 2px 0 0' }} />
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 9, fontFamily: FONT_MONO, color: t.textDim }}>
          <span>{days}d ago</span><span>now</span>
        </div>
      </Card>
    </div>
  );
}

function KpiSm({ t, label, value, color }: { t: Theme; label: string; value: string; color: string }) {
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 14px' }}>
      <Label t={t}>{label}</Label>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: FONT_MONO, marginTop: 4 }}>{value}</div>
    </div>
  );
}
