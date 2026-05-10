import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/app';
import { api, getAxeStatus } from '../api';
import type { AxeDevice } from '../api';

export function useDeviceStream() {
  const store = useAppStore();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/ws`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.nmminer?.devices) {
          store.setDevices(data.nmminer.devices);
        }
        if (data.axeos?.devices) {
          const axe = data.axeos.devices.map((d: AxeDevice) => ({ ...d, status: getAxeStatus(d) }));
          store.setAxeDevices(axe);
        }
        if (typeof data.unread_alerts === 'number') {
          store.setUnreadAlerts(data.unread_alerts);
        }
        if (data.config) {
          store.setSettings(data.config);
        }
        // Compute device counts
        const nmOnline = (data.nmminer?.devices || []).filter((d: { _online?: boolean }) => d._online !== false).length;
        const axeOnline = (data.axeos?.devices || []).filter((d: { _online?: boolean }) => d._online !== false).length;
        const nmTotal = (data.nmminer?.devices || []).length;
        const axeTotal = (data.axeos?.devices || []).length;
        store.setDeviceCounts(nmTotal + axeTotal, nmOnline + axeOnline);
      } catch {}
    };

    ws.onclose = () => {
      reconnectRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  useEffect(() => {
    connect();
    // Also do initial HTTP fetch
    api.dashboard().then(data => {
      if (data.nmminer?.devices) store.setDevices(data.nmminer.devices);
      if (data.axeos?.devices) {
        const axe = data.axeos.devices.map(d => ({ ...d, status: getAxeStatus(d) }));
        store.setAxeDevices(axe);
      }
      if (typeof data.unread_alerts === 'number') store.setUnreadAlerts(data.unread_alerts);
      if (data.config) store.setSettings(data.config);
    }).catch(() => {});

    return () => {
      wsRef.current?.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
