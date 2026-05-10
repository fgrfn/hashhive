import React from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { useToastStore, type ToastKind } from '../store/toast';
import { useThemeStore } from '../store/theme';

const ICONS: Record<ToastKind, React.ElementType> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

export function ToastContainer() {
  const { toasts, dismiss } = useToastStore();
  const { theme: t } = useThemeStore();

  if (toasts.length === 0) return null;

  const COLORS: Record<ToastKind, string> = {
    success: t.success,
    error: t.danger,
    info: t.info,
    warning: t.warning,
  };

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9000,
      display: 'flex', flexDirection: 'column-reverse', gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map(item => {
        const color = COLORS[item.kind];
        const Icon = ICONS[item.kind];
        return (
          <div
            key={item.id}
            className="fade-in"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 10,
              background: t.surface, border: `1px solid ${color}44`,
              boxShadow: `0 4px 24px rgba(0,0,0,0.22), 0 0 0 1px ${color}18`,
              fontSize: 13, color: t.text, maxWidth: 340,
              pointerEvents: 'auto',
            }}
          >
            <Icon size={15} style={{ color, flexShrink: 0 }} />
            <span style={{ flex: 1, lineHeight: 1.4 }}>{item.message}</span>
            <button
              onClick={() => dismiss(item.id)}
              style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', padding: 2, flexShrink: 0 }}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
