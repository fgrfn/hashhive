import React, { useEffect, useState } from 'react';
import { useThemeStore } from '../store/theme';
import { Card, Label, useDataReady } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api, fmtHashrate, fmtBestDiff, fmtProb } from '../api';
import type { AnalyticsResult, ProbWindows } from '../api';
import { Award, Target, Trophy } from 'lucide-react';

/** Humanize a duration in seconds into a coarse "12 months" / "46 years" string. */
function humanizeDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const m = seconds / 60, h = m / 60, d = h / 24, y = d / 365;
  if (y >= 2) return `${Math.round(y)} years`;
  if (d >= 60) return `${Math.round(d / 30)} months`;
  if (d >= 2) return `${Math.round(d)} days`;
  if (h >= 1) return `${Math.round(h)} h`;
  if (m >= 1) return `${Math.round(m)} min`;
  return `${Math.round(seconds)} s`;
}

function relativeTime(ts: string | null): string {
  if (!ts) return '—';
  const diff = (Date.now() - Date.parse(ts)) / 1000;
  if (!Number.isFinite(diff) || diff < 0) return '—';
  const d = Math.floor(diff / 86400), h = Math.floor(diff / 3600), m = Math.floor(diff / 60);
  if (d >= 1) return `${d}d ago`;
  if (h >= 1) return `${h}h ago`;
  if (m >= 1) return `${m}m ago`;
  return 'just now';
}

const MEDAL = ['#f59e0b', '#9ca3af', '#b45309'];

export function Analytics() {
  const { theme: t } = useThemeStore();
  const [data, setData] = useState<AnalyticsResult | null>(null);
  const [fetched, setFetched] = useState(false);
  const loading = useDataReady(fetched);

  useEffect(() => {
    api.analytics().then(setData).catch(() => setData(null)).finally(() => setFetched(true));
  }, []);

  if (loading || !data) {
    return <div style={{ color: t.textMuted, fontSize: 13 }}>Loading analytics…</div>;
  }

  const { fleet, beat_best, block, leaderboard } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card t={t}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <Label t={t}>Predictions</Label>
            <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>Statistical odds based on current fleet hashrate.</div>
          </div>
          <div style={{ textAlign: 'right', fontFamily: FONT_MONO, fontSize: 12, color: t.textMuted, lineHeight: 1.7 }}>
            <div>{fmtHashrate(fleet.hashrate_ghs)} fleet</div>
            <div>best {fmtBestDiff(fleet.best_share)}</div>
            <div>net {fmtBestDiff(fleet.network_difficulty ?? 0)}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14, marginTop: 16 }}>
          <PredictionCard t={t} icon={<Award size={16} color={t.accent} />} title="Beat all-time best"
            subtitle={`Current record: ${fmtBestDiff(beat_best.record)}`}
            expected={humanizeDuration(beat_best.expected_seconds)} windows={beat_best.windows} accent={t.accent} />
          <PredictionCard t={t} icon={<Target size={16} color={t.honey} />} title="Find a block (solo)"
            subtitle={`Network difficulty: ${fmtBestDiff(fleet.network_difficulty ?? 0)}`}
            expected={humanizeDuration(block.expected_seconds)} windows={block.windows} accent={t.honey} />
        </div>
      </Card>

      <Card t={t} noPad>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Trophy size={16} color={t.honey} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Top best shares</div>
            <div style={{ fontSize: 12, color: t.textMuted }}>All-time leaderboard across your miners.</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 120px 90px', gap: 10, padding: '8px 18px', borderBottom: `1px solid ${t.border}` }}>
          {['#', 'MINER', 'BEST', 'WHEN'].map((c, i) => (
            <Label key={c} t={t} style={{ textAlign: i >= 2 ? 'right' : 'left' }}>{c}</Label>
          ))}
        </div>
        {leaderboard.length === 0 ? (
          <div style={{ padding: '24px 18px', color: t.textMuted, fontSize: 13 }}>No best-share records yet — they accumulate as your miners run.</div>
        ) : leaderboard.map((d, i) => (
          <div key={d.ip} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 120px 90px', gap: 10, padding: '12px 18px', borderBottom: i === leaderboard.length - 1 ? 'none' : `1px solid ${t.border}`, alignItems: 'center', fontSize: 13 }}>
            <div style={{ color: MEDAL[i] || t.textMuted, fontWeight: 700, fontFamily: FONT_MONO }}>
              {i < 3 ? '●' : ''} {i + 1}
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>{d.name}</div>
              {d.type && <div style={{ fontSize: 11, color: t.textMuted }}>{d.type}</div>}
            </div>
            <div style={{ textAlign: 'right', fontFamily: FONT_MONO, fontWeight: 700, color: t.accent }}>{fmtBestDiff(d.best_diff)}</div>
            <div style={{ textAlign: 'right', fontSize: 12, color: t.textMuted, fontFamily: FONT_MONO }}>{relativeTime(d.ts)}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function PredictionCard({ t, icon, title, subtitle, expected, windows, accent }: {
  t: Theme; icon: React.ReactNode; title: string; subtitle: string; expected: string; windows: ProbWindows; accent: string;
}) {
  return (
    <div style={{ background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {icon}
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>
          <div style={{ fontSize: 11, color: t.textMuted }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', borderBottom: `1px solid ${t.border}`, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Expected time</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: accent, fontFamily: FONT_MONO }}>{expected}</span>
      </div>
      {(['1h', '24h', '7d'] as const).map(w => (
        <div key={w} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
          <span style={{ color: t.textMuted }}>Within {w === '1h' ? '1 hour' : w === '24h' ? '24 hours' : '7 days'}</span>
          <span style={{ fontFamily: FONT_MONO, color: t.text }}>{fmtProb(windows[w])}</span>
        </div>
      ))}
    </div>
  );
}
