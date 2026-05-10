import React, { useEffect, useState } from 'react';
import { type Theme, FONT_MONO, RADIUS } from '../../tokens';

// ─── Button helpers ────────────────────────────────────────────────────────

export type BtnVariant = 'ghost' | 'primary' | 'honey' | 'danger';

// eslint-disable-next-line react-refresh/only-export-components
export function btnStyle(t: Theme, v: BtnVariant = 'ghost'): React.CSSProperties {
  const r = RADIUS.btn(t._rs);
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    borderRadius: r, padding: '6px 10px', fontSize: 12, fontWeight: 500,
    fontFamily: 'inherit', cursor: 'pointer', transition: 'all .15s',
    whiteSpace: 'nowrap', border: 'none', outline: 'none',
  };
  if (v === 'primary') return { ...base, background: t.accent, color: '#fff', border: `1px solid ${t.accent}` };
  if (v === 'honey')   return { ...base, background: t.honey,  color: '#1a1200', border: `1px solid ${t.honey}` };
  if (v === 'danger')  return { ...base, background: 'transparent', color: t.danger, border: `1px solid rgba(244,63,94,0.25)` };
  return { ...base, background: 'transparent', color: t.text, border: `1px solid ${t.border}` };
}

// ─── Card ──────────────────────────────────────────────────────────────────

interface CardProps {
  t: Theme;
  children: React.ReactNode;
  style?: React.CSSProperties;
  noPad?: boolean;
  onClick?: () => void;
}

export function Card({ t, children, style, noPad, onClick }: CardProps) {
  const r = RADIUS.card(t._rs);
  return (
    <div
      onClick={onClick}
      style={{
        background: t.surface,
        border: `1px solid ${t.border}`,
        borderRadius: r,
        padding: noPad ? 0 : 18,
        ...(onClick && { cursor: 'pointer' }),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Label ─────────────────────────────────────────────────────────────────

export function Label({ t, children, style }: { t: Theme; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: 10, color: t.textMuted, textTransform: 'uppercase',
      letterSpacing: '0.1em', fontWeight: 600, fontFamily: FONT_MONO,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Pill ──────────────────────────────────────────────────────────────────

type Severity = 'critical' | 'warning' | 'info' | 'success' | 'muted' | 'accent' | 'honey';

interface PillProps {
  t: Theme;
  sev: Severity;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Pill({ t, sev, children, style }: PillProps) {
  const map: Record<Severity, { bg: string; fg: string }> = {
    critical: { bg: t.danger + '22',  fg: t.danger },
    warning:  { bg: t.warning + '22', fg: t.warning },
    info:     { bg: t.info + '22',    fg: t.info },
    success:  { bg: t.success + '22', fg: t.success },
    muted:    { bg: t.surface2,       fg: t.textMuted },
    accent:   { bg: t.accentGlow,     fg: t.accent },
    honey:    { bg: t.honey + '22',   fg: t.honey },
  };
  const c = map[sev] || map.muted;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, padding: '3px 8px', borderRadius: RADIUS.pill,
      background: c.bg, color: c.fg, fontWeight: 500, fontFamily: FONT_MONO,
      letterSpacing: '0.02em',
      ...style,
    }}>
      {children}
    </span>
  );
}

// ─── StatusPill ─────────────────────────────────────────────────────────────

const STATUS_MAP = {
  online:  { sev: 'success'  as Severity, label: 'Online'  },
  warning: { sev: 'warning'  as Severity, label: 'Warning' },
  offline: { sev: 'critical' as Severity, label: 'Offline' },
  paused:  { sev: 'muted'    as Severity, label: 'Paused'  },
};

export function StatusPill({ t, status }: { t: Theme; status: string }) {
  const m = STATUS_MAP[status as keyof typeof STATUS_MAP] || STATUS_MAP.online;
  const dotColor = ({ success: t.success, warning: t.warning, critical: t.danger, muted: t.textMuted, accent: t.accent, honey: t.honey, info: t.info } as Record<string, string>)[m.sev] ?? t.textMuted;
  return (
    <Pill t={t} sev={m.sev}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor }} />
      {m.label}
    </Pill>
  );
}

// ─── Toggle ─────────────────────────────────────────────────────────────────

export function Toggle({
  t, on = false, onChange, size = 'md',
}: { t: Theme; on?: boolean; onChange?: (v: boolean) => void; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 30 : 36;
  const h = size === 'sm' ? 18 : 20;
  const thumb = h - 4;
  return (
    <div
      onClick={() => onChange?.(!on)}
      style={{
        width: w, height: h, borderRadius: h / 2,
        background: on ? t.accent : t.borderStrong,
        position: 'relative', transition: 'background .15s',
        cursor: 'pointer', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 2,
        left: on ? w - thumb - 2 : 2,
        width: thumb, height: thumb, borderRadius: '50%', background: '#fff',
        transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  );
}

// ─── Segmented ──────────────────────────────────────────────────────────────

interface SegmentedOption { value: string; label: string }

export function Segmented({
  t, options, value, onChange, style,
}: {
  t: Theme;
  options: (string | SegmentedOption)[];
  value: string;
  onChange: (v: string) => void;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{
      display: 'inline-flex', gap: 4, padding: 3,
      background: t.surface2, borderRadius: 8,
      border: `1px solid ${t.border}`,
      ...style,
    }}>
      {options.map(opt => {
        const v = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        const on = v === value;
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            style={{
              background: on ? t.accent : 'transparent',
              color: on ? '#fff' : t.textMuted,
              border: 'none', borderRadius: 6, padding: '4px 10px',
              fontSize: 11, fontWeight: 500, cursor: 'pointer',
              fontFamily: FONT_MONO, letterSpacing: '0.02em', transition: 'all .15s',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Input ──────────────────────────────────────────────────────────────────

export function Input({
  t, value, onChange, placeholder, type = 'text', mono = true, style, disabled,
}: {
  t: Theme; value: string; onChange?: (v: string) => void;
  placeholder?: string; type?: string; mono?: boolean;
  style?: React.CSSProperties; disabled?: boolean;
}) {
  const r = RADIUS.input(t._rs);
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: '100%', padding: '9px 12px',
        background: t.surface2, border: `1px solid ${t.border}`, borderRadius: r,
        color: t.text, fontSize: 13,
        fontFamily: mono ? FONT_MONO : 'inherit', outline: 'none',
        transition: 'border-color .15s',
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}
      onFocus={e => { e.target.style.borderColor = t.accent; }}
      onBlur={e => { e.target.style.borderColor = t.border; }}
    />
  );
}

// ─── FormField ─────────────────────────────────────────────────────────────

export function FormField({
  t, label, value, onChange, mono = false, placeholder, error, readOnly, type,
}: {
  t: Theme; label: string; value: string; onChange?: (v: string) => void;
  mono?: boolean; placeholder?: string; error?: string; readOnly?: boolean; type?: string;
}) {
  const r = RADIUS.input(t._rs);
  return (
    <div>
      <Label t={t} style={{ marginBottom: 6 }}>{label}</Label>
      <input
        value={value}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        type={type}
        style={{
          width: '100%', padding: '9px 12px',
          background: t.surface2,
          border: `1px solid ${error ? t.danger : t.border}`,
          borderRadius: r,
          color: t.text, fontSize: 13,
          fontFamily: mono ? FONT_MONO : 'inherit', outline: 'none',
          transition: 'border-color .15s',
          opacity: readOnly ? 0.7 : 1,
        }}
        onFocus={e => { if (!error) e.target.style.borderColor = t.accent; }}
        onBlur={e => { if (!error) e.target.style.borderColor = t.border; }}
      />
      {error && (
        <div style={{ fontSize: 11, color: t.danger, marginTop: 4, fontFamily: FONT_MONO }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Select ─────────────────────────────────────────────────────────────────

export function Select({
  t, value, options, onChange, style,
}: {
  t: Theme; value: string; options: [string, string][]; onChange?: (v: string) => void;
  style?: React.CSSProperties;
}) {
  const r = RADIUS.input(t._rs);
  return (
    <select
      value={value}
      onChange={e => onChange?.(e.target.value)}
      style={{
        padding: '8px 30px 8px 12px',
        background: t.surface2, border: `1px solid ${t.border}`, borderRadius: r,
        color: t.text, fontSize: 13, fontFamily: FONT_MONO, outline: 'none', cursor: 'pointer',
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 4l3 3 3-3' stroke='${encodeURIComponent(t.textMuted)}' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
        ...style,
      }}
    >
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

// ─── Spinner ────────────────────────────────────────────────────────────────

export function Spinner({ t, size = 14 }: { t: Theme; size?: number }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      border: `2px solid ${t.border}`,
      borderTopColor: t.accent,
      borderRadius: '50%',
      animation: 'proto-spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  );
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

export function Skeleton({
  t, w = '100%', h = 14, r = 6, style,
}: { t: Theme; w?: string | number; h?: number; r?: number; style?: React.CSSProperties }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: `linear-gradient(90deg, ${t.surface2} 25%, ${t.surface3} 50%, ${t.surface2} 75%)`,
      backgroundSize: '400% 100%',
      animation: 'sk-shimmer 1.4s ease infinite',
      flexShrink: 0,
      ...style,
    }} />
  );
}

export function SkeletonCard({ t, height = 120, style }: { t: Theme; height?: number; style?: React.CSSProperties }) {
  const r = RADIUS.card(t._rs);
  return (
    <div style={{
      background: t.surface, border: `1px solid ${t.border}`, borderRadius: r,
      padding: 18, height, display: 'flex', flexDirection: 'column', gap: 12,
      ...style,
    }}>
      <Skeleton t={t} w="40%" h={10} />
      <Skeleton t={t} w="70%" h={22} />
      <Skeleton t={t} w="55%" h={10} />
    </div>
  );
}

export function SkeletonRow({ t, cols, height = 52 }: { t: Theme; cols: (string | number)[]; height?: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, padding: '0 18px',
      height, borderBottom: `1px solid ${t.border}`,
    }}>
      {cols.map((w, i) => <Skeleton key={i} t={t} w={w} h={12} />)}
    </div>
  );
}

// ─── useLoading ─────────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export function useLoading(ms = 1200): boolean {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return loading;
}

// ─── EmptyState ─────────────────────────────────────────────────────────────

export function EmptyState({
  t, icon, title, detail, action,
}: {
  t: Theme;
  icon: React.ReactNode;
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '48px 24px', gap: 12, color: t.textMuted, textAlign: 'center',
    }}>
      <div style={{ opacity: 0.4 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: t.text }}>{title}</div>
      {detail && <div style={{ fontSize: 13, maxWidth: 320 }}>{detail}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

// ─── Banner ─────────────────────────────────────────────────────────────────

export function Banner({
  t, sev, children,
}: { t: Theme; sev: 'warning' | 'critical' | 'info'; children: React.ReactNode }) {
  const colors = {
    warning:  { bg: t.warning + '18', border: t.warning + '44', text: t.warning },
    critical: { bg: t.danger  + '18', border: t.danger  + '44', text: t.danger },
    info:     { bg: t.info    + '18', border: t.info    + '44', text: t.info },
  }[sev];
  return (
    <div style={{
      background: colors.bg, border: `1px solid ${colors.border}`,
      borderRadius: RADIUS.card(t._rs), padding: '10px 14px',
      color: colors.text, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
      marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

// ─── Modal ──────────────────────────────────────────────────────────────────

export function Modal({
  t, title, onClose, children, width = 480,
}: {
  t: Theme; title: string; onClose: () => void;
  children: React.ReactNode; width?: number;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="fade-in"
        style={{
          background: t.surface, border: `1px solid ${t.border}`,
          borderRadius: RADIUS.card(t._rs),
          width: Math.min(width, window.innerWidth - 40),
          maxHeight: '90vh', overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 14px', borderBottom: `1px solid ${t.border}`,
        }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', padding: 4 }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: '20px' }}>{children}</div>
      </div>
    </div>
  );
}

// ─── HiveMark logo ───────────────────────────────────────────────────────────

export function HiveMark({ size = 28, primary, secondary }: { size?: number; primary: string; secondary: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" style={{ flexShrink: 0 }}>
      <polygon points="14,2 24,8 24,20 14,26 4,20 4,8" fill={primary} opacity="0.2" />
      <polygon points="14,2 24,8 24,20 14,26 4,20 4,8" fill="none" stroke={primary} strokeWidth="1.5" />
      <polygon points="14,8 19,11 19,17 14,20 9,17 9,11" fill={secondary} opacity="0.6" />
    </svg>
  );
}
