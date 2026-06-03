// Pure formatting / selector helpers used across pages and components.
import type { NMMinerDevice, AxeDevice } from './types';

export function getHashrate(d: NMMinerDevice): number {
  return d.GHs5s ?? d.GHs5 ?? d.GHs1m ?? d.GHsav ?? d.GHs ?? d.hashrate ?? 0;
}

export function getAxeHashrate(d: AxeDevice): number {
  return d.hashRate ?? 0;
}

export function getTemp(d: NMMinerDevice): number | null {
  return d.temp ?? d.temperature ?? d.chipTemp ?? null;
}

export function fmtUptime(seconds: number | string | undefined): string {
  if (seconds == null) return '—';
  const s = typeof seconds === 'string' ? parseInt(seconds, 10) : seconds;
  if (!Number.isFinite(s) || s < 0) {
    return typeof seconds === 'string' && !/^\d+$/.test(seconds) ? seconds : '—';
  }
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function fmtRssi(rssi: number | undefined): string {
  if (rssi == null) return '—';
  return `${rssi} dBm`;
}

export function fmtShares(ok: number | undefined, err: number | undefined): string {
  if (ok == null && err == null) return '—';
  return `${ok ?? 0}/${err ?? 0}`;
}

export function fmtHashrate(ghs: number): string {
  if (ghs <= 0) return '—';
  if (ghs >= 1000) return `${(ghs / 1000).toFixed(2)} TH/s`;
  if (ghs >= 1) return `${ghs.toFixed(2)} GH/s`;
  if (ghs >= 0.001) return `${(ghs * 1000).toFixed(2)} MH/s`;
  return `${(ghs * 1_000_000).toFixed(0)} KH/s`;
}

/** Format a best-share/best-diff value. Accepts a raw number or pre-formatted string. */
export function fmtBestDiff(v: number | string | null | undefined): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'string') {
    const n = Number(v);
    if (!Number.isNaN(n) && /^[\d.]+$/.test(v)) return fmtBestDiff(n);
    return v;
  }
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `${(v / 1e9).toFixed(2)}G`;
  if (v >= 1e6)  return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3)  return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

export function getAxeStatus(d: AxeDevice): 'online' | 'offline' | 'warning' | 'paused' {
  if (!d._online) return 'offline';
  if (d.miningPaused) return 'paused';
  if ((d.temp ?? 0) > (d._type === 'nerdaxe' ? 65 : 70)) return 'warning';
  return 'online';
}

export function getNmStatus(d: NMMinerDevice): 'online' | 'offline' | 'warning' {
  if (d._online === false) return 'offline';
  return d.status ?? 'online';
}

/** Format a probability (0..1) as a readable chance: percent, or "1 in N" when tiny. */
export function fmtProb(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p) || p <= 0) return '—';
  if (p >= 0.0001) return `${(p * 100).toFixed(p >= 0.1 ? 1 : 3)}%`;
  return `1 : ${Math.round(1 / p).toLocaleString()}`;
}

/** Scale a GH/s series to a readable unit for charting. Tiny ESP-miner values
 *  (NMMiner ~0.001 GH/s) become MH/s (or kH/s), so the axis reads "1.0 MH/s"
 *  instead of "0.001 GH/s"; AxeOS-scale values stay in GH/s. */
export function scaleHashrateSeries(ghs: number[]): { data: number[]; unit: string } {
  const max = ghs.reduce((m, v) => Math.max(m, v || 0), 0);
  if (max <= 0 || max >= 1) return { data: ghs, unit: 'GH/s' };
  if (max >= 0.001) return { data: ghs.map(v => (v || 0) * 1_000), unit: 'MH/s' };
  return { data: ghs.map(v => (v || 0) * 1_000_000), unit: 'kH/s' };
}


/** True if `current` firmware is strictly older than `latest`. Lenient: ignores
 *  a 'v' prefix and non-numeric noise; returns false when either is unparseable
 *  (mirrors the backend so we don't cry wolf on unknown version formats). */
export function isFirmwareOutdated(current: string | undefined, latest: string | undefined): boolean {
  const nums = (v: string | undefined) => (v ? (v.match(/\d+/g) || []).map(Number) : []);
  const c = nums(current), l = nums(latest);
  if (c.length === 0 || l.length === 0) return false;
  const n = Math.max(c.length, l.length);
  for (let i = 0; i < n; i++) {
    const a = c[i] ?? 0, b = l[i] ?? 0;
    if (a !== b) return a < b;
  }
  return false;
}

/** Case-insensitive match of a global search query against a device's name/hostname/ip.
 *  Empty/whitespace queries match everything. Used by the topbar global search. */
export function matchesSearch(
  d: { ip?: string; _ip?: string; name?: string; _name?: string; hostname?: string },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [d.name, d._name, d.hostname, d.ip, d._ip]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}
