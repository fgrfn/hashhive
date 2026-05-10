import React from 'react';
import type { Theme } from '../tokens';

interface Props {
  children: React.ReactNode;
  theme: Theme;
}

interface State {
  error: Error | null;
}

export class PageErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { theme: t } = this.props;
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320, padding: 24 }}>
        <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: '32px 40px', maxWidth: 520, width: '100%' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.danger, marginBottom: 10 }}>Page error</div>
          <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 20 }}>
            This page crashed. Navigation still works — try switching to another page.
          </div>
          <pre style={{ fontSize: 11, color: t.text, background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 6, padding: '10px 12px', overflow: 'auto', maxHeight: 200, margin: '0 0 20px' }}>
            {error.message}
            {error.stack ? '\n\n' + error.stack : ''}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ background: t.accentGlow, border: `1px solid ${t.accent}`, color: t.accent, borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
