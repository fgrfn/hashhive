import { create } from 'zustand';
import type { NMMinerDevice, AxeDevice, Alert, AppSettings } from '../api';

export type WsStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

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
  setDevices: (devices) => set({ devices }),
  setAxeDevices: (axeDevices) => set({ axeDevices }),
  setAlerts: (alerts) => set({ alerts }),
  setUnreadAlerts: (unreadAlerts) => set({ unreadAlerts }),
  setSettings: (settings) => set({ settings }),
  setGlobalSearch: (globalSearch) => set({ globalSearch }),
  setBtcPrice: (btcPrice, btcChange) => set({ btcPrice, btcChange }),
  setDeviceCounts: (devicesTotal, devicesOnline) => set({ devicesTotal, devicesOnline }),
  setWsStatus: (wsStatus) => set({ wsStatus }),
}));
