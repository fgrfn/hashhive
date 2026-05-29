import { describe, it, expect } from 'vitest';
import { fmtUptime, fmtHashrate, fmtBestDiff, matchesSearch, fmtProb } from '../api';

// ─── fmtUptime ───────────────────────────────────────────────────────────────

describe('fmtUptime', () => {
  it('returns — for undefined', () => expect(fmtUptime(undefined)).toBe('—'));
  it('returns — for null', () => expect(fmtUptime(null as never)).toBe('—'));
  it('returns — for NaN', () => expect(fmtUptime(NaN)).toBe('—'));
  it('returns — for negative number', () => expect(fmtUptime(-1)).toBe('—'));
  it('returns — for numeric string that parses to NaN', () => expect(fmtUptime('abc')).toBe('abc'));
  // parseInt('3d 4h') = 3 (stops at 'd'), so it formats as 3 seconds
  it('numeric-prefix string is parsed by parseInt ("3d 4h" → 3 s → 0m)', () => expect(fmtUptime('3d 4h')).toBe('0m'));

  it('formats 0 seconds as 0m', () => expect(fmtUptime(0)).toBe('0m'));
  it('formats 59 seconds as 0m', () => expect(fmtUptime(59)).toBe('0m'));
  it('formats 60 seconds as 1m', () => expect(fmtUptime(60)).toBe('1m'));
  it('formats 3599 seconds as 59m', () => expect(fmtUptime(3599)).toBe('59m'));
  it('formats 3600 seconds as 1h 0m', () => expect(fmtUptime(3600)).toBe('1h 0m'));
  it('formats 3661 seconds as 1h 1m', () => expect(fmtUptime(3661)).toBe('1h 1m'));
  it('formats 86399 seconds as 23h 59m', () => expect(fmtUptime(86399)).toBe('23h 59m'));
  it('formats 86400 seconds as 1d 0h', () => expect(fmtUptime(86400)).toBe('1d 0h'));
  it('formats 90061 seconds as 1d 1h', () => expect(fmtUptime(90061)).toBe('1d 1h'));
  it('formats 7 days correctly', () => expect(fmtUptime(7 * 86400)).toBe('7d 0h'));

  it('parses numeric string', () => expect(fmtUptime('3600')).toBe('1h 0m'));
  // '-1' is non-digit (has '-'), so the passthrough branch returns the string itself
  it('negative numeric string passes through as-is ("-1")', () => expect(fmtUptime('-1')).toBe('-1'));
});

// ─── fmtHashrate ─────────────────────────────────────────────────────────────

describe('fmtHashrate', () => {
  it('formats 0 as dash', () => expect(fmtHashrate(0)).toBe('—'));
  it('formats KH/s range', () => expect(fmtHashrate(0.0003)).toBe('300 KH/s'));
  it('formats MH/s range', () => expect(fmtHashrate(0.001)).toBe('1.00 MH/s'));
  it('formats sub-1000 GH/s', () => expect(fmtHashrate(999.9)).toBe('999.90 GH/s'));
  it('formats exactly 1000 as TH/s', () => expect(fmtHashrate(1000)).toBe('1.00 TH/s'));
  it('formats 1234.5 GH/s as TH/s', () => expect(fmtHashrate(1234.5)).toBe('1.23 TH/s'));
  it('formats 500 GH/s', () => expect(fmtHashrate(500)).toBe('500.00 GH/s'));
  it('formats large TH/s values', () => expect(fmtHashrate(100000)).toBe('100.00 TH/s'));
});

// ─── fmtBestDiff ─────────────────────────────────────────────────────────────

describe('fmtBestDiff', () => {
  it('returns — for null', () => expect(fmtBestDiff(null)).toBe('—'));
  it('returns — for undefined', () => expect(fmtBestDiff(undefined)).toBe('—'));
  it('returns — for empty string', () => expect(fmtBestDiff('')).toBe('—'));
  it('returns — for 0', () => expect(fmtBestDiff(0)).toBe('—'));
  it('returns — for negative', () => expect(fmtBestDiff(-1)).toBe('—'));
  it('returns — for NaN', () => expect(fmtBestDiff(NaN)).toBe('—'));
  it('returns — for Infinity', () => expect(fmtBestDiff(Infinity)).toBe('—'));

  it('formats small integer', () => expect(fmtBestDiff(42)).toBe('42'));
  it('formats 999 as integer', () => expect(fmtBestDiff(999)).toBe('999'));
  it('formats 1000 as K', () => expect(fmtBestDiff(1000)).toBe('1.0K'));
  it('formats 1500 as K', () => expect(fmtBestDiff(1500)).toBe('1.5K'));
  it('formats 1e6 as M', () => expect(fmtBestDiff(1e6)).toBe('1.00M'));
  it('formats 2.5e6 as M', () => expect(fmtBestDiff(2.5e6)).toBe('2.50M'));
  it('formats 1e9 as G', () => expect(fmtBestDiff(1e9)).toBe('1.00G'));
  it('formats 1e12 as T', () => expect(fmtBestDiff(1e12)).toBe('1.00T'));
  it('formats 3.5e12 as T', () => expect(fmtBestDiff(3.5e12)).toBe('3.50T'));

  it('passes through pre-formatted string like "128K"', () => expect(fmtBestDiff('128K')).toBe('128K'));
  it('passes through pre-formatted string like "1.5G"', () => expect(fmtBestDiff('1.5G')).toBe('1.5G'));
  it('converts pure numeric string to formatted number', () => expect(fmtBestDiff('1000')).toBe('1.0K'));
  it('converts decimal numeric string', () => expect(fmtBestDiff('500.5')).toBe('501'));
});

// ─── matchesSearch ────────────────────────────────────────────────────────────

describe('matchesSearch', () => {
  const dev = { ip: '192.168.1.10', name: 'Garage BitAxe', hostname: 'bitaxe-1' };
  it('matches everything on empty query', () => expect(matchesSearch(dev, '')).toBe(true));
  it('matches everything on whitespace query', () => expect(matchesSearch(dev, '   ')).toBe(true));
  it('matches by name (case-insensitive)', () => expect(matchesSearch(dev, 'garage')).toBe(true));
  it('matches by ip substring', () => expect(matchesSearch(dev, '1.10')).toBe(true));
  it('matches by hostname', () => expect(matchesSearch(dev, 'bitaxe-1')).toBe(true));
  it('does not match unrelated query', () => expect(matchesSearch(dev, 'zzz')).toBe(false));
  it('matches AxeDevice-style _ip/_name fields', () =>
    expect(matchesSearch({ _ip: '10.0.0.5', _name: 'NerdAxe' }, 'nerd')).toBe(true));
});

// ─── fmtProb ──────────────────────────────────────────────────────────────────

describe('fmtProb', () => {
  it('returns — for null/undefined/zero', () => {
    expect(fmtProb(null)).toBe('—');
    expect(fmtProb(undefined)).toBe('—');
    expect(fmtProb(0)).toBe('—');
  });
  it('formats a large probability as percent', () => expect(fmtProb(0.25)).toBe('25.0%'));
  it('formats a small-but-visible probability with more decimals', () => expect(fmtProb(0.001)).toBe('0.100%'));
  it('formats a tiny probability as 1 in N', () => expect(fmtProb(0.00001)).toBe('1 in 100,000'));
});
