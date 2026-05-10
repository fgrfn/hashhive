export const PALETTES = {
  hive: {
    dark: {
      bg: '#0f0b18',
      surface: '#181124',
      surface2: '#211733',
      surface3: '#2a1f42',
      border: 'rgba(255,255,255,0.07)',
      borderStrong: 'rgba(255,255,255,0.14)',
      text: '#ece7f5',
      textMuted: '#8b83a3',
      textDim: '#5d576f',
      accent: '#a855f7',
      accentDim: '#7c3aed',
      accentGlow: 'rgba(168,85,247,0.14)',
      honey: '#fbbf24',
      honeyDim: '#d97706',
      success: '#34d399',
      warning: '#f59e0b',
      danger: '#f43f5e',
      info: '#38bdf8',
    },
    light: {
      bg: '#faf8ff',
      surface: '#ffffff',
      surface2: '#f3eeff',
      surface3: '#e9e0ff',
      border: 'rgba(20,15,40,0.08)',
      borderStrong: 'rgba(20,15,40,0.15)',
      text: '#191327',
      textMuted: '#6b6485',
      textDim: '#a09bb3',
      accent: '#7c3aed',
      accentDim: '#6d28d9',
      accentGlow: 'rgba(124,58,237,0.10)',
      honey: '#d97706',
      honeyDim: '#b45309',
      success: '#059669',
      warning: '#d97706',
      danger: '#e11d48',
      info: '#0284c7',
    },
  },
  foundry: {
    dark: {
      bg: '#0a0c10',
      surface: '#11151c',
      surface2: '#181e27',
      surface3: '#222a36',
      border: 'rgba(255,255,255,0.06)',
      borderStrong: 'rgba(255,255,255,0.12)',
      text: '#e6ebf2',
      textMuted: '#7d8797',
      textDim: '#4d5868',
      accent: '#f59e0b',
      accentDim: '#d97706',
      accentGlow: 'rgba(245,158,11,0.12)',
      honey: '#38bdf8',
      honeyDim: '#0284c7',
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
      info: '#38bdf8',
    },
    light: {
      bg: '#f4f6f9',
      surface: '#ffffff',
      surface2: '#eceff4',
      surface3: '#dfe3eb',
      border: 'rgba(15,20,30,0.08)',
      borderStrong: 'rgba(15,20,30,0.18)',
      text: '#0f1724',
      textMuted: '#576170',
      textDim: '#8a94a3',
      accent: '#c2410c',
      accentDim: '#9a3412',
      accentGlow: 'rgba(194,65,12,0.09)',
      honey: '#0369a1',
      honeyDim: '#075985',
      success: '#047857',
      warning: '#b45309',
      danger: '#b91c1c',
      info: '#0369a1',
    },
  },
  bloom: {
    dark: {
      bg: '#1a1117',
      surface: '#241820',
      surface2: '#2f2029',
      surface3: '#3d2a35',
      border: 'rgba(255,255,255,0.06)',
      borderStrong: 'rgba(255,255,255,0.13)',
      text: '#fbeee8',
      textMuted: '#c39eaa',
      textDim: '#8a6c78',
      accent: '#fb7185',
      accentDim: '#e11d48',
      accentGlow: 'rgba(251,113,133,0.14)',
      honey: '#5eead4',
      honeyDim: '#14b8a6',
      success: '#34d399',
      warning: '#fbbf24',
      danger: '#fb7185',
      info: '#5eead4',
    },
    light: {
      bg: '#fff3f2',
      surface: '#ffffff',
      surface2: '#ffe4e0',
      surface3: '#fecdcd',
      border: 'rgba(90,30,45,0.08)',
      borderStrong: 'rgba(90,30,45,0.15)',
      text: '#3f1b22',
      textMuted: '#8a5a64',
      textDim: '#b88d95',
      accent: '#e11d48',
      accentDim: '#be123c',
      accentGlow: 'rgba(225,29,72,0.10)',
      honey: '#0d9488',
      honeyDim: '#0f766e',
      success: '#059669',
      warning: '#d97706',
      danger: '#e11d48',
      info: '#0891b2',
    },
  },
} as const;

export type Personality = 'hive' | 'foundry' | 'bloom';
export type Density = 'compact' | 'cozy' | 'spacious';
export type ColorMode = 'dark' | 'light';

export interface Theme {
  _personality: Personality;
  _density: Density;
  _dark: boolean;
  _ds: number;
  _rs: number;
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textDim: string;
  accent: string;
  accentDim: string;
  accentGlow: string;
  honey: string;
  honeyDim: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
}

export function buildTheme(dark: boolean, personality: Personality = 'hive', density: Density = 'cozy'): Theme {
  const pal = PALETTES[personality][dark ? 'dark' : 'light'] as Record<string, string>;
  const ds = density === 'compact' ? 0.78 : density === 'spacious' ? 1.18 : 1;
  const rs = personality === 'foundry' ? 0.3 : personality === 'bloom' ? 1.35 : 1;
  return { ...pal, _personality: personality, _density: density, _dark: dark, _ds: ds, _rs: rs } as Theme;
}

export const FONT_BODY = "'Space Grotesk', 'Inter', system-ui, sans-serif";
export const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";
export const FONT_FOUNDRY = "'JetBrains Mono', ui-monospace, monospace";

export function bodyFont(personality: Personality): string {
  return personality === 'foundry' ? FONT_FOUNDRY : FONT_BODY;
}

export const COIN_COLORS: Record<string, string> = {
  BTC: '#F7931A',
  LN: '#792EE5',
  LTC: '#BFBBBB',
  DOGE: '#C3A634',
  KAS: '#70C7BA',
  XMR: '#FF6600',
};

export const RADIUS = {
  card: (rs: number) => Math.round(12 * rs),
  btn: (rs: number) => Math.round(8 * rs),
  pill: 12,
  input: (rs: number) => Math.round(8 * rs),
};
