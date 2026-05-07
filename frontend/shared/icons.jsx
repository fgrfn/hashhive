// Minimal icon set — Lucide-style stroke icons used across directions.
// All 16x16, currentColor, stroke 1.5.

const mk = (paths) => ({ size = 16, color = 'currentColor', stroke = 1.5, style } = {}) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
       fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
       style={{display:'inline-block', verticalAlign:'middle', ...style}}>
    {paths}
  </svg>
);

const Icons = {
  dashboard: mk(<><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></>),
  cpu: mk(<><rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/></>),
  zap: mk(<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>),
  globe: mk(<><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20"/></>),
  bell: mk(<><path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 004 0"/></>),
  settings: mk(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></>),
  search: mk(<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>),
  thermo: mk(<path d="M14 4a2 2 0 00-4 0v10.5a4 4 0 104 0V4z"/>),
  pause: mk(<><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>),
  play: mk(<polygon points="5 3 19 12 5 21 5 3"/>),
  restart: mk(<><path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></>),
  chevron: mk(<polyline points="9 18 15 12 9 6"/>),
  check: mk(<polyline points="20 6 9 17 4 12"/>),
  x: mk(<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>),
  alert: mk(<><path d="M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>),
  download: mk(<><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>),
  plus: mk(<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>),
  moon: mk(<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>),
  sun: mk(<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>),
  activity: mk(<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>),
  wifi: mk(<><path d="M5 12.55a11 11 0 0114 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></>),
  filter: mk(<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>),
  more: mk(<><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>),
  copy: mk(<><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>),
  eye: mk(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>),
  arrowLeft: mk(<><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>),
  arrowRight: mk(<><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>),
  arrowUp: mk(<><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>),
  arrowDown: mk(<><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>),
  sort: mk(<><path d="M3 6h18M6 12h12M10 18h4"/></>),
  chevronDown: mk(<polyline points="6 9 12 15 18 9"/>),
  chevronUp: mk(<polyline points="18 15 12 9 6 15"/>),
  telegram: mk(<path d="M21 3 3 10l6 2 2 7 4-4 5 5 2-17z"/>),
  discord: mk(<><rect x="3" y="5" width="18" height="14" rx="4"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/></>),
  mail: mk(<><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/></>),
  help: mk(<><circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.5 2.5 0 015 0c0 2-2.5 2-2.5 4"/><line x1="12" y1="17" x2="12.01" y2="17"/></>),
  link: mk(<><path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/></>),
  upload: mk(<><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>),
  trash: mk(<><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></>),
  edit: mk(<><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></>),
  grid: mk(<><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>),
  list: mk(<><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>),
  menu: mk(<><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>),
  power: mk(<><path d="M18.36 6.64a9 9 0 11-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></>),
  trending: mk(<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>),
  dollar: mk(<><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>),
};

window.Icons = Icons;

// Honeycomb hex icon used as logo mark in all directions
function HiveMark({ size = 22, primary = '#a855f7', secondary = '#fbbf24' }) {
  return (
    <svg width={size} height={size * 44/38} viewBox="0 0 38 44" style={{display:'block'}}>
      <defs>
        <linearGradient id={`hm-${primary}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={secondary}/>
          <stop offset="100%" stopColor={primary}/>
        </linearGradient>
      </defs>
      <path d="M19 1 L37 11 L37 33 L19 43 L1 33 L1 11 Z" fill={`url(#hm-${primary})`} />
      <text x="19" y="27" textAnchor="middle" fontSize="18" fontWeight="800" fill="#000" fontFamily="'JetBrains Mono', monospace" opacity="0.8">#</text>
    </svg>
  );
}
window.HiveMark = HiveMark;
