import React, { useState } from 'react';
import { useThemeStore } from '../store/theme';
import { api } from '../api';
import { HiveMark } from './primitives';
import { FONT_MONO } from '../tokens';

interface Props {
  onAuth: () => void;
}

export function LoginGate({ onAuth }: Props) {
  const { theme: t } = useThemeStore();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.auth.login(password);
      onAuth();
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      setError(status === 429 ? 'Too many attempts. Please wait.' : 'Invalid password.');
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: t.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'inherit',
    }}>
      <div style={{ width: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <HiveMark size={48} primary={t.accent} secondary={t.honey} />
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 12 }}>HashHive</div>
          <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>Sign in to continue</div>
        </div>

        <form onSubmit={submit}>
          <div style={{ marginBottom: 12 }}>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box',
                background: t.surface, border: `1px solid ${error ? t.danger : t.border}`,
                borderRadius: 8, padding: '12px 14px', fontSize: 14,
                color: t.text, outline: 'none', fontFamily: FONT_MONO,
              }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: t.danger, marginBottom: 12, padding: '8px 12px', background: t.danger + '18', borderRadius: 6 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!password || busy}
            style={{
              width: '100%', padding: '12px', borderRadius: 8, fontSize: 14,
              fontWeight: 600, cursor: password && !busy ? 'pointer' : 'default',
              background: t.accent, color: '#000', border: 'none',
              opacity: password && !busy ? 1 : 0.5, transition: 'opacity .15s',
            }}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
