import React, { useState } from 'react';
import {
  AreaChart as ReAreaChart, Area,
  LineChart, Line,
  BarChart as ReBarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { type Theme, FONT_MONO } from '../../tokens';

// ─── Sparkline (inline mini chart, no axes) ──────────────────────────────────

interface SparklineProps {
  data?: number[];
  w?: number;
  h?: number;
  color?: string;
  fill?: boolean;
  strokeWidth?: number;
}

export function Sparkline({ data = [], w = 80, h = 22, color = 'currentColor', fill = true, strokeWidth = 1.4 }: SparklineProps) {
  if (!data.length) return <svg width={w} height={h} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const d = 'M' + pts.join(' L');
  const area = d + ` L ${w},${h} L 0,${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
      {fill && <path d={area} fill={color} opacity="0.12" />}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── MiniChart (recharts-based tiny line, no axes) ───────────────────────────

export function MiniChart({ data = [], color, h = 36 }: { data: number[]; color: string; h?: number }) {
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={h}>
      <LineChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── AreaChart (hero chart with brush support) ────────────────────────────────

interface BrushState { from: number; to: number }

interface AreaChartProps {
  t: Theme;
  data: number[];
  accent: string;
  h?: number;
  brushed?: BrushState | null;
  onBrush?: (b: BrushState | null) => void;
  labels?: string[];
  unit?: string;
}

export function AreaChart({ t, data, accent, h = 200, labels, unit = 'GH/s' }: AreaChartProps) {
  const chartData = data.map((v, i) => ({ i, v, label: labels?.[i] || i }));

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number }> }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', fontFamily: FONT_MONO, fontSize: 12 }}>
        <div style={{ color: accent, fontWeight: 600 }}>{payload[0].value.toFixed(1)} {unit}</div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={h}>
      <ReAreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
        <defs>
          <linearGradient id={`areaGrad-${accent.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={accent} stopOpacity={0.25} />
            <stop offset="95%" stopColor={accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={t.border} strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: t.textDim, fontFamily: FONT_MONO }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10, fill: t.textDim, fontFamily: FONT_MONO }} tickLine={false} axisLine={false} width={45} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}T` : `${v}`} />
        <Tooltip content={<CustomTooltip />} />
        <Area type="monotone" dataKey="v" stroke={accent} strokeWidth={2} fill={`url(#areaGrad-${accent.replace('#', '')})`} dot={false} />
      </ReAreaChart>
    </ResponsiveContainer>
  );
}

// ─── BarChart ────────────────────────────────────────────────────────────────

export function BarChartComponent({ t, data, color, h = 160, labels }: { t: Theme; data: number[]; color: string; h?: number; labels?: string[] }) {
  const chartData = data.map((v, i) => ({ i, v, label: labels?.[i] || i }));
  return (
    <ResponsiveContainer width="100%" height={h}>
      <ReBarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
        <CartesianGrid stroke={t.border} strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: t.textDim, fontFamily: FONT_MONO }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10, fill: t.textDim, fontFamily: FONT_MONO }} tickLine={false} axisLine={false} width={45} />
        <Tooltip contentStyle={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, fontFamily: FONT_MONO, fontSize: 12 }} />
        <Bar dataKey="v" fill={color} radius={[3, 3, 0, 0]} />
      </ReBarChart>
    </ResponsiveContainer>
  );
}

// ─── Donut chart ─────────────────────────────────────────────────────────────

export function DonutChart({ data, size = 100 }: { data: { value: number; color: string; label: string }[]; size?: number }) {
  return (
    <PieChart width={size} height={size}>
      <Pie data={data} innerRadius={size * 0.3} outerRadius={size * 0.45} paddingAngle={2} dataKey="value" stroke="none">
        {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
      </Pie>
    </PieChart>
  );
}

// ─── Heatmap (custom SVG grid) ───────────────────────────────────────────────

interface HeatmapProps {
  t: Theme;
  data: number[][];
  rowLabels?: string[];
  colLabels?: string[];
  colorFn?: (v: number) => string;
}

export function Heatmap({ t, data, rowLabels, colLabels, colorFn }: HeatmapProps) {
  const [hovered, setHovered] = useState<{ r: number; c: number; v: number } | null>(null);
  const cellW = 28;
  const cellH = 20;
  const cols = data[0]?.length || 0;
  const rows = data.length;
  const maxVal = Math.max(...data.flat(), 1);

  const defaultColor = (v: number) => {
    const intensity = v / maxVal;
    const r = Math.round(intensity * 168);
    const g = Math.round(intensity * 85);
    const b = Math.round(intensity * 247);
    return intensity === 0 ? t.surface3 : `rgba(${r},${g},${b},${0.2 + intensity * 0.8})`;
  };
  const getColor = colorFn || defaultColor;

  return (
    <div style={{ position: 'relative', overflowX: 'auto' }}>
      <svg width={(cols + 1) * cellW + 40} height={(rows + 1) * cellH + 4}>
        {colLabels?.map((label, c) => (
          <text key={c} x={(c + 1) * cellW + cellW / 2 + 40} y={12} textAnchor="middle" fontSize={8} fill={t.textDim} fontFamily={FONT_MONO}>{label}</text>
        ))}
        {data.map((row, r) => (
          <g key={r}>
            {rowLabels && <text x={36} y={(r + 1) * cellH + cellH / 2 + 2 + (colLabels ? 14 : 0)} textAnchor="end" fontSize={9} fill={t.textDim} fontFamily={FONT_MONO} dominantBaseline="middle">{rowLabels[r]}</text>}
            {row.map((v, c) => (
              <rect
                key={c}
                x={(c + 1) * cellW + 40}
                y={(r + 1) * cellH + (colLabels ? 14 : 0)}
                width={cellW - 2}
                height={cellH - 2}
                rx={2}
                fill={getColor(v)}
                onMouseEnter={() => setHovered({ r, c, v })}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'crosshair' }}
              />
            ))}
          </g>
        ))}
      </svg>
      {hovered && (
        <div style={{ position: 'absolute', top: 0, left: 0, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 11, fontFamily: FONT_MONO, pointerEvents: 'none', color: t.text }}>
          {hovered.v > 0 ? `${hovered.v.toFixed(1)} GH/s` : 'No data'}
        </div>
      )}
    </div>
  );
}
