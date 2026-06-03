import { describe, it, expect } from 'vitest';
import { useAppStore } from '../store/app';
import type { NMMinerDevice, AxeDevice } from '../api';

// Devices arrive in non-deterministic completion order; the store must always
// expose them sorted by hostname (then IP) so the UI order is stable and only
// changes when a hostname changes.

describe('useAppStore.setDevices', () => {
  it('sorts NMMiner devices by hostname', () => {
    const input: NMMinerDevice[] = [
      { ip: '10.0.0.3', hostname: 'charlie' },
      { ip: '10.0.0.1', hostname: 'alpha' },
      { ip: '10.0.0.2', hostname: 'bravo' },
    ];
    useAppStore.getState().setDevices(input);
    expect(useAppStore.getState().devices.map(d => d.hostname)).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('falls back to name then ip, with ip as a stable tiebreaker', () => {
    const input: NMMinerDevice[] = [
      { ip: '10.0.0.20', name: 'nm' },
      { ip: '10.0.0.3', name: 'nm' },
    ];
    useAppStore.getState().setDevices(input);
    // equal name → numeric IP tiebreak keeps a deterministic order
    expect(useAppStore.getState().devices.map(d => d.ip)).toEqual(['10.0.0.3', '10.0.0.20']);
  });
});

describe('useAppStore.setAxeDevices', () => {
  it('sorts AxeOS devices by hostname', () => {
    const input: AxeDevice[] = [
      { _ip: '10.0.1.2', hostname: 'zeta' },
      { _ip: '10.0.1.1', hostname: 'beta' },
    ];
    useAppStore.getState().setAxeDevices(input);
    expect(useAppStore.getState().axeDevices.map(d => d.hostname)).toEqual(['beta', 'zeta']);
  });
});
