import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Cpu, Zap, Grid3x3, Globe, Copy,
  Activity, Wallet, TrendingUp, Bell, Settings, Radar,
  Sun, Moon, Plus, Search, Menu, X,
  Download, LogOut, type LucideIcon,
} from 'lucide-react';
import { useThemeStore } from '../../store/theme';
import { type Theme, FONT_MONO, bodyFont } from '../../tokens';
import { HiveMark, Spinner, btnStyle } from '../primitives';
import { useAppStore } from '../../store/app';
import { useWindowWidth } from '../../hooks/useWindowWidth';

function useWindowWidthLocal() {
  return useWindowWidth();
}

const NAV_ITEMS: Array<{ id: string; path: string; label: string; Icon: LucideIcon; badge?: boolean }> = [
  { id: 'dashboard',     path: '/dashboard',      label: 'Dashboard',        Icon: LayoutDashboard },
  { id: 'lottominer',    path: '/miners/lottominer', label: 'Lottominer',     Icon: Cpu },
  { id: 'axeos',         path: '/miners/axeos',    label: 'BitAxe / NerdAxe', Icon: Zap },
  { id: 'discovery',     path: '/discovery',       label: 'Discovery',        Icon: Radar },
  { id: 'groups',        path: '/groups',          label: 'Groups',           Icon: Grid3x3 },
  { id: 'pool',          path: '/pool',            label: 'Pool',             Icon: Globe },
  { id: 'templates',     path: '/templates',       label: 'Templates',        Icon: Copy },
  { id: 'schedules',     path: '/schedules',       label: 'Schedules',        Icon: Activity },
  { id: 'wallets',       path: '/wallets',         label: 'Wallets',          Icon: Wallet },
  { id: 'earnings',      path: '/earnings',        label: 'Earnings',         Icon: TrendingUp },
  { id: 'alerts',        path: '/alerts',          label: 'Alerts',           Icon: Bell, badge: true },
  { id: 'settings',      path: '/settings',        label: 'Settings',         Icon: Settings },
];

const TITLE_MAP: Record<string, string> = {
  dashboard: 'Dashboard',
  lottominer: 'Lottominer',
  axeos: 'BitAxe / NerdAxe',
  discovery: 'Device Discovery',
  groups: 'Groups',
  pool: 'Pool Configuration',
  templates: 'Templates',
  schedules: 'Schedules',
  wallets: 'Wallets',
  earnings: 'Earnings',
  alerts: 'Alerts & Notifications',
  settings: 'Settings',
  device: 'Device Detail',
};

function activeId(pathname: string): string {
  if (pathname.startsWith('/miners/lottominer')) return 'lottominer';
  if (pathname.startsWith('/miners/axeos'))   return 'axeos';
  if (pathname.startsWith('/devices/'))       return 'axeos';
  if (pathname.startsWith('/groups/'))        return 'groups';
  if (pathname.startsWith('/settings'))       return 'settings';
  const seg = pathname.split('/')[1];
  return seg || 'dashboard';
}

export function AppShell({ children, onLogout }: { children: React.ReactNode; onLogout?: () => void }) {
  const { theme, dark, toggleDark, personality } = useThemeStore();
  const { unreadAlerts, btcPrice, btcChange, globalSearch, setGlobalSearch, wsStatus } = useAppStore();
  const t = theme;
  const navigate = useNavigate();
  const location = useLocation();
  const winW = useWindowWidthLocal();

  const isTablet = winW >= 640 && winW < 1080;
  const isMobile = winW < 640;
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarExpanded = !isTablet || sidebarHovered;
  const active = activeId(location.pathname);
  const font = bodyFont(personality);

  const go = useCallback((path: string) => {
    navigate(path);
    setMobileOpen(false);
  }, [navigate]);

  if (isMobile) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: t.bg, color: t.text, fontFamily: font }}>
        <header style={{ height: 56, flexShrink: 0, padding: '0 16px', borderBottom: `1px solid ${t.border}`, background: t.surface, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <HiveMark size={26} primary={t.accent} secondary={t.honey} />
            <LogoText t={t} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={toggleDark} style={{ ...btnStyle(t), padding: 7 }}>
              {dark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button onClick={() => setMobileOpen(true)} style={{ ...btnStyle(t), padding: 7 }}>
              <Menu size={14} />
            </button>
          </div>
        </header>

        <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px 80px' }}>{children}</div>

        <nav style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: t.surface, borderTop: `1px solid ${t.border}`, display: 'flex', padding: '8px 4px 10px', justifyContent: 'space-around', zIndex: 50 }}>
          {NAV_ITEMS.filter(n => ['dashboard','lottominer','axeos','earnings','alerts'].includes(n.id)).map(({ id, path, label, Icon, badge }) => {
            const on = active === id;
            return (
              <button key={id} onClick={() => go(path)} style={{ background: 'transparent', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '4px 8px', cursor: 'pointer', color: on ? t.accent : t.textMuted, position: 'relative' }}>
                <Icon size={18} />
                <span style={{ fontSize: 10, fontFamily: FONT_MONO }}>{label.split(' ')[0]}</span>
                {badge && unreadAlerts > 0 && <span style={{ position: 'absolute', top: 0, right: 4, background: t.danger, color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8, fontFamily: FONT_MONO }}>{unreadAlerts}</span>}
              </button>
            );
          })}
        </nav>

        {mobileOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100 }} onClick={() => setMobileOpen(false)}>
            <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 280, background: t.surface, padding: 18, display: 'flex', flexDirection: 'column', gap: 4 }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: t.textMuted, fontFamily: FONT_MONO, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Menu</div>
                <button onClick={() => setMobileOpen(false)} style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer' }}><X size={16} /></button>
              </div>
              {NAV_ITEMS.map(({ id, path, label, Icon, badge }) => (
                <div key={id} onClick={() => go(path)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', color: active === id ? t.accent : t.textMuted, background: active === id ? t.accentGlow : 'transparent', fontWeight: active === id ? 600 : 500, fontSize: 14 }}>
                  <Icon size={16} />
                  <span>{label}</span>
                  {badge && unreadAlerts > 0 && <span style={{ marginLeft: 'auto', background: t.danger, color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, fontFamily: FONT_MONO }}>{unreadAlerts}</span>}
                </div>
              ))}
              {onLogout && (
                <div onClick={onLogout} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', color: t.textMuted, fontSize: 14, marginTop: 8, borderTop: `1px solid ${t.border}` }}>
                  <LogOut size={16} /><span>Sign out</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: t.bg, color: t.text, fontFamily: font }}>
      <aside
        onMouseEnter={() => isTablet && setSidebarHovered(true)}
        onMouseLeave={() => isTablet && setSidebarHovered(false)}
        style={{
          width: sidebarExpanded ? 232 : 64, flexShrink: 0,
          background: t.surface, borderRight: `1px solid ${t.border}`,
          display: 'flex', flexDirection: 'column',
          transition: 'width .2s ease', overflow: 'hidden',
          position: 'relative', zIndex: isTablet && sidebarHovered ? 20 : 'auto',
          boxShadow: isTablet && sidebarHovered ? '4px 0 24px rgba(0,0,0,0.18)' : 'none',
        }}
      >
        {/* Logo */}
        <div style={{ padding: '20px 0 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${t.border}`, paddingLeft: sidebarExpanded ? 20 : 0, justifyContent: sidebarExpanded ? 'flex-start' : 'center', transition: 'padding .2s' }}>
          <HiveMark size={28} primary={t.accent} secondary={t.honey} />
          {sidebarExpanded && <LogoText t={t} size={18} />}
        </div>

        {/* Nav */}
        <nav style={{ padding: sidebarExpanded ? '12px 10px' : '12px 6px', flex: 1, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', overflowX: 'hidden' }}>
          {NAV_ITEMS.map(({ id, path, label, Icon, badge }) => {
            const on = active === id;
            return (
              <NavItem key={id} t={t} on={on} expanded={sidebarExpanded} onClick={() => go(path)} label={label} badge={badge && unreadAlerts > 0 ? unreadAlerts : 0}>
                <Icon size={16} style={{ flexShrink: 0 }} />
              </NavItem>
            );
          })}
        </nav>

        <LiveFooter t={t} collapsed={!sidebarExpanded} />
        {onLogout && (
          <button onClick={onLogout} title="Sign out" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: sidebarExpanded ? '10px 16px' : '10px 0', justifyContent: sidebarExpanded ? 'flex-start' : 'center', background: 'transparent', border: 'none', borderTop: `1px solid ${t.border}`, color: t.textMuted, cursor: 'pointer', fontSize: 12, width: '100%' }}>
            <LogOut size={14} style={{ flexShrink: 0 }} />
            {sidebarExpanded && 'Sign out'}
          </button>
        )}
      </aside>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <Topbar
          t={t} active={active} dark={dark} onToggleDark={toggleDark}
          globalSearch={globalSearch} setGlobalSearch={setGlobalSearch}
          compact={isTablet} btcPrice={btcPrice} btcChange={btcChange}
          onAddDevice={() => {
            if (location.pathname.startsWith('/miners/nmminer')) {
              navigate('/settings/general');
            } else if (location.pathname.startsWith('/miners/axeos')) {
              navigate('/settings/network');
            } else {
              navigate('/settings/general');
            }
          }}
        />
        {(wsStatus === 'disconnected' || wsStatus === 'reconnecting') && (
          <div style={{ background: wsStatus === 'reconnecting' ? t.warning + '22' : t.danger + '22', borderBottom: `1px solid ${wsStatus === 'reconnecting' ? t.warning : t.danger}44`, padding: '6px 20px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: wsStatus === 'reconnecting' ? t.warning : t.danger, fontFamily: FONT_MONO }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
            {wsStatus === 'reconnecting' ? 'Reconnecting to server…' : 'Connection lost — retrying…'}
          </div>
        )}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ padding: isTablet ? '16px 18px 40px' : '22px 26px 40px' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function LogoText({ t, size = 17 }: { t: Theme; size?: number }) {
  return (
    <div style={{ fontWeight: 700, fontSize: size, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
      <span style={{ color: t.text }}>Hash</span>
      <span style={{ background: `linear-gradient(135deg, ${t.honey}, ${t.accent})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Hive</span>
    </div>
  );
}

function NavItem({ t, on, expanded, onClick, label, badge, children }: {
  t: Theme; on: boolean; expanded: boolean; onClick: () => void;
  label: string; badge?: number; children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      title={!expanded ? label : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: expanded ? 10 : 0,
        padding: expanded ? '10px 12px' : '10px 0',
        justifyContent: expanded ? 'flex-start' : 'center',
        borderRadius: 8, cursor: 'pointer',
        color: on ? t.accent : t.textMuted,
        background: on ? t.accentGlow : hovered ? t.surface2 : 'transparent',
        fontWeight: on ? 600 : 500, fontSize: 13,
        transition: 'all .15s', position: 'relative', flexShrink: 0,
      }}
    >
      {children}
      {expanded && <span style={{ whiteSpace: 'nowrap' }}>{label}</span>}
      {badge ? (
        <span style={{
          marginLeft: expanded ? 'auto' : 0,
          position: expanded ? 'static' : 'absolute',
          top: expanded ? 'auto' : 6, right: expanded ? 'auto' : 6,
          background: t.danger, color: '#fff', fontSize: 9, fontWeight: 700,
          padding: '1px 5px', borderRadius: 8, fontFamily: FONT_MONO,
        }}>{badge}</span>
      ) : null}
    </div>
  );
}

function Topbar({ t, active, dark, onToggleDark, globalSearch, setGlobalSearch, compact, btcPrice, btcChange, onAddDevice }: {
  t: Theme; active: string; dark: boolean; onToggleDark: () => void;
  globalSearch: string; setGlobalSearch: (v: string) => void;
  compact: boolean; btcPrice: number; btcChange: number; onAddDevice: () => void;
}) {
  const title = TITLE_MAP[active] || active;
  return (
    <header style={{ height: compact ? 52 : 64, flexShrink: 0, padding: `0 ${compact ? 16 : 26}px`, borderBottom: `1px solid ${t.border}`, background: t.surface, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        {!compact && (
          <div style={{ fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: FONT_MONO }}>
            HashHive / {title}
          </div>
        )}
        <div style={{ fontSize: compact ? 16 : 20, fontWeight: 600, letterSpacing: '-0.02em', marginTop: compact ? 0 : 2 }}>{title}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 10, flexShrink: 0 }}>
        {!compact && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', border: `1px solid ${t.border}`, borderRadius: 8, fontSize: 12, fontFamily: FONT_MONO, color: t.textMuted, width: 220, background: t.surface }}>
            <Search size={14} />
            <input
              value={globalSearch}
              onChange={e => setGlobalSearch(e.target.value)}
              placeholder="Search devices…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: t.text, fontSize: 12, fontFamily: FONT_MONO }}
            />
            <span style={{ padding: '1px 6px', background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 4, fontSize: 10 }}>⌘K</span>
          </div>
        )}
        {compact && <button style={{ ...btnStyle(t), padding: '6px 8px' }}><Search size={14} /></button>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', border: `1px solid ${t.border}`, borderRadius: 8, fontFamily: FONT_MONO, fontSize: 12, background: t.surface }}>
          <span style={{ color: t.textMuted }}>BTC</span>
          <span style={{ fontWeight: 600 }}>${btcPrice > 0 ? btcPrice.toLocaleString() : '—'}</span>
          {!compact && btcPrice > 0 && (
            <span style={{ color: btcChange >= 0 ? t.success : t.danger, fontSize: 11 }}>
              {btcChange >= 0 ? '▲' : '▼'}{Math.abs(btcChange).toFixed(2)}%
            </span>
          )}
        </div>
        <button onClick={onToggleDark} style={{ ...btnStyle(t), padding: '7px 9px' }}>
          {dark ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button onClick={onAddDevice} style={{ ...btnStyle(t, 'primary'), padding: compact ? '7px 10px' : '7px 12px' }}>
          <Plus size={14} />{!compact && ' Add device'}
        </button>
      </div>
    </header>
  );
}

function LiveFooter({ t, collapsed }: { t: Theme; collapsed: boolean }) {
  const [state, setState] = useState<'checking' | 'up-to-date' | 'available'>('checking');
  const [current, setCurrent] = useState<string>('');
  const [latest, setLatest] = useState<string>('');
  const [releaseNotes, setReleaseNotes] = useState<string[]>([]);
  const [releaseSize, setReleaseSize] = useState<string>('');
  const [showPopover, setShowPopover] = useState(false);
  const [installing, setInstalling] = useState(false);
  const { devicesTotal } = useAppStore();

  useEffect(() => {
    const ver = (v: string) => v.startsWith('v') ? v : `v${v}`;
    fetch('/api/updates/latest')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) { setState('up-to-date'); return; }
        const cur = ver(d.current || '');
        setCurrent(cur);
        if (d.latest) {
          setLatest(ver(d.latest.version || ''));
          setReleaseNotes(Array.isArray(d.latest.notes) ? d.latest.notes : []);
          if (d.latest.size_mb) setReleaseSize(`${d.latest.size_mb} MB`);
        }
        setState(d.update_available ? 'available' : 'up-to-date');
      })
      .catch(() => setState('up-to-date'));
  }, []);

  const doInstall = () => {
    setInstalling(true);
    setTimeout(() => { setInstalling(false); setState('up-to-date'); setShowPopover(false); }, 2400);
  };

  if (collapsed) {
    const dotColor = state === 'available' ? t.warning : state === 'checking' ? t.textMuted : t.success;
    return (
      <div style={{ padding: '14px 0', display: 'flex', justifyContent: 'center', borderTop: `1px solid ${t.border}` }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, boxShadow: `0 0 8px ${dotColor}`, display: 'block' }} />
      </div>
    );
  }

  const cfg = {
    checking:    { color: t.textMuted, dot: t.textMuted, label: 'Checking for updates…', sub: '' },
    'up-to-date': { color: t.success,  dot: t.success,   label: 'Up to date',            sub: 'latest version' },
    available:   { color: t.warning,   dot: t.warning,   label: 'Update available',       sub: latest ? `${current} → ${latest}` : '' },
  }[state];

  return (
    <div style={{ padding: '12px 16px', borderTop: `1px solid ${t.border}`, fontFamily: FONT_MONO, position: 'relative' }}>
      <div
        onClick={() => state === 'available' && setShowPopover(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: state === 'available' ? 'pointer' : 'default', padding: state === 'available' ? '6px 8px' : 0, margin: state === 'available' ? '-6px -8px 0' : 0, borderRadius: 6, background: state === 'available' && showPopover ? t.surface2 : 'transparent', transition: 'background .15s' }}
      >
        <span style={{ position: 'relative', width: 8, height: 8, borderRadius: '50%', background: cfg.dot, boxShadow: `0 0 8px ${cfg.dot}`, flexShrink: 0 }}>
          {state === 'available' && <span style={{ position: 'absolute', inset: -3, borderRadius: '50%', border: `1.5px solid ${cfg.dot}`, animation: 'proto-pulse 2s ease-out infinite' }} />}
        </span>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontSize: 11, color: cfg.color, fontWeight: 500 }}>{cfg.label}</span>
          {cfg.sub && <span style={{ fontSize: 10, color: t.textDim, lineHeight: 1.3 }}>{cfg.sub}</span>}
        </div>
        {state === 'available' && (
          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, fontWeight: 700, letterSpacing: '0.06em', background: t.warning + '22', color: t.warning }}>NEW</span>
        )}
      </div>
      <div style={{ fontSize: 10, color: t.textDim, display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span>{current || '—'}</span>
        <span>{devicesTotal} devices</span>
      </div>

      {showPopover && state === 'available' && (
        <>
          <div onClick={() => setShowPopover(false)} style={{ position: 'fixed', inset: 0, zIndex: 39 }} />
          <div className="fade-in" style={{ position: 'fixed', bottom: 70, left: 244, zIndex: 40, width: 300, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.3)', padding: 16, fontFamily: 'inherit' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: t.warning, fontWeight: 700, fontFamily: FONT_MONO, letterSpacing: '0.06em' }}>UPDATE AVAILABLE</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>HashHive {latest}</div>
                {releaseSize && <div style={{ fontSize: 10, color: t.textMuted, fontFamily: FONT_MONO, marginTop: 2 }}>{releaseSize}</div>}
              </div>
              <button onClick={() => setShowPopover(false)} style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer' }}><X size={14} /></button>
            </div>
            <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FONT_MONO }}>What's new</div>
            {releaseNotes.length > 0 && (
              <ul style={{ margin: '0 0 12px', padding: '0 0 0 14px', fontSize: 11, color: t.text, lineHeight: 1.6 }}>
                {releaseNotes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            )}
            <button onClick={doInstall} disabled={installing} style={{ ...btnStyle(t, 'primary'), width: '100%', padding: '9px 12px', fontSize: 12, justifyContent: 'center', marginBottom: 6, opacity: installing ? 0.7 : 1, boxSizing: 'border-box' }}>
              {installing ? <><Spinner t={t} size={11} /> Installing…</> : <><Download size={12} /> Install & restart</>}
            </button>
            <button onClick={() => setShowPopover(false)} style={{ ...btnStyle(t), width: '100%', padding: '7px 12px', fontSize: 12, justifyContent: 'center', boxSizing: 'border-box' }}>Later</button>
            <div style={{ fontSize: 9, color: t.textDim, marginTop: 8, fontFamily: FONT_MONO, textAlign: 'center' }}>Devices keep mining during update · ~30 s downtime for WebUI</div>
          </div>
        </>
      )}
    </div>
  );
}
