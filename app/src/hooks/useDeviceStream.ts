import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/app';
import { api, getAxeStatus } from '../api';
import type { AxeDevice } from '../api';

const BACKOFF_BASE = 1_000;
const BACKOFF_MAX  = 30_000;

export function useDeviceStream() {
  const store = useAppStore();
  const wsRef        = useRef<WebSocket | null>(null);
  const retryTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef   = useRef(0);
  const destroyedRef = useRef(false);

  function scheduleReconnect() {
    if (destroyedRef.current) return;
    const delay = Math.min(BACKOFF_BASE * 2 ** attemptRef.current, BACKOFF_MAX);
    attemptRef.current += 1;
    store.setWsStatus('reconnecting');
    retryTimer.current = setTimeout(connect, delay);
  }

  function connect() {
    if (destroyedRef.current) return;
    wsRef.current?.close();

    store.setWsStatus(attemptRef.current === 0 ? 'connecting' : 'reconnecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      attemptRef.current = 0;
      store.setWsStatus('connected');
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.lottominer?.devices) store.setDevices(data.lottominer.devices);
        if (data.axeos?.devices) {
          store.setAxeDevices(data.axeos.devices.map((d: AxeDevice) => ({ ...d, status: getAxeStatus(d) })));
        }
        if (typeof data.unread_alerts === 'number') store.setUnreadAlerts(data.unread_alerts);
        if (data.config) store.setSettings(data.config);
        const nmOnline  = (data.lottominer?.devices  || []).filter((d: { _online?: boolean }) => d._online !== false).length;
        const axeOnline = (data.axeos?.devices    || []).filter((d: { _online?: boolean }) => d._online !== false).length;
        const nmTotal   = (data.lottominer?.devices  || []).length;
        const axeTotal  = (data.axeos?.devices    || []).length;
        store.setDeviceCounts(nmTotal + axeTotal, nmOnline + axeOnline);
      } catch { /* malformed WS frame — ignore */ }
    };

    ws.onclose = () => {
      if (destroyedRef.current) return;
      store.setWsStatus('disconnected');
      scheduleReconnect();
    };

    ws.onerror = () => { ws.close(); };
  }

  useEffect(() => {
    destroyedRef.current = false;

    connect();

    api.dashboard().then(data => {
      if (data.lottominer?.devices) store.setDevices(data.lottominer.devices);
      if (data.axeos?.devices) store.setAxeDevices(data.axeos.devices.map(d => ({ ...d, status: getAxeStatus(d) })));
      if (typeof data.unread_alerts === 'number') store.setUnreadAlerts(data.unread_alerts);
      if (data.config) store.setSettings(data.config);
    }).catch(() => {});

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const ws = wsRef.current;
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; }
        attemptRef.current = 0;
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      destroyedRef.current = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      wsRef.current?.close();
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
