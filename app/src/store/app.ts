import { create } from 'zustand';
import type { NMMinerDevice, AxeDevice, Alert, AppSettings } from '../api';

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
  setDevices: (d: NMMinerDevice[]) => void;
  setAxeDevices: (d: AxeDevice[]) => void;
  setAlerts: (a: Alert[]) => void;
  setUnreadAlerts: (n: number) => void;
  setSettings: (s: AppSettings) => void;
  setGlobalSearch: (v: string) => void;
  setBtcPrice: (price: number, change: number) => void;
  setDeviceCounts: (total: number, online: number) => void;
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
  setDevices: (devices) => set({ devices }),
  setAxeDevices: (axeDevices) => set({ axeDevices }),
  setAlerts: (alerts) => set({ alerts }),
  setUnreadAlerts: (unreadAlerts) => set({ unreadAlerts }),
  setSettings: (settings) => set({ settings }),
  setGlobalSearch: (globalSearch) => set({ globalSearch }),
  setBtcPrice: (btcPrice, btcChange) => set({ btcPrice, btcChange }),
  setDeviceCounts: (devicesTotal, devicesOnline) => set({ devicesTotal, devicesOnline }),
}));
