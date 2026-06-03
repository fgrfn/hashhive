import { create } from 'zustand';
import type { NMMinerDevice, AxeDevice, Alert, AppSettings } from '../api';

export type WsStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

// Devices arrive from the backend in completion order of concurrent polls, so
// the order jitters between refreshes. Always present miners sorted by hostname
// (falling back to name, then IP), with IP as a stable tiebreaker — so the
// order only changes when a hostname actually changes.
function sortByHostname<T>(list: T[], key: (d: T) => { host: string; ip: string }): T[] {
  return [...list].sort((a, b) => {
    const ka = key(a), kb = key(b);
    return ka.host.localeCompare(kb.host, undefined, { numeric: true, sensitivity: 'base' })
      || ka.ip.localeCompare(kb.ip, undefined, { numeric: true });
  });
}

interface AppStore {
  devices: NMMinerDevice[];
  axeDevices: AxeDevice[];
  alerts: Alert[];
  unreadAlerts: number;
  settings: AppSettings | null;
  globalSearch: string;
  btcPrice: number;
  btcChange: number;
  devicesTotal: number;
  devicesOnline: number;
  wsStatus: WsStatus;
  setDevices: (d: NMMinerDevice[]) => void;
  setAxeDevices: (d: AxeDevice[]) => void;
  setAlerts: (a: Alert[]) => void;
  setUnreadAlerts: (n: number) => void;
  setSettings: (s: AppSettings) => void;
  setGlobalSearch: (v: string) => void;
  setBtcPrice: (price: number, change: number) => void;
  setDeviceCounts: (total: number, online: number) => void;
  setWsStatus: (s: WsStatus) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  devices: [],
  axeDevices: [],
  alerts: [],
  unreadAlerts: 0,
  settings: null,
  globalSearch: '',
  btcPrice: 0,
  btcChange: 0,
  devicesTotal: 0,
  devicesOnline: 0,
  wsStatus: 'connecting',
  setDevices: (devices) => set({
    devices: sortByHostname(devices, d => ({ host: (d.hostname ?? d.name ?? d.ip ?? '').toString(), ip: (d.ip ?? '').toString() })),
  }),
  setAxeDevices: (axeDevices) => set({
    axeDevices: sortByHostname(axeDevices, d => ({ host: (d.hostname ?? d._name ?? d._ip ?? '').toString(), ip: (d._ip ?? '').toString() })),
  }),
  setAlerts: (alerts) => set({ alerts }),
  setUnreadAlerts: (unreadAlerts) => set({ unreadAlerts }),
  setSettings: (settings) => set({ settings }),
  setGlobalSearch: (globalSearch) => set({ globalSearch }),
  setBtcPrice: (btcPrice, btcChange) => set({ btcPrice, btcChange }),
  setDeviceCounts: (devicesTotal, devicesOnline) => set({ devicesTotal, devicesOnline }),
  setWsStatus: (wsStatus) => set({ wsStatus }),
}));
