import React, { useState } from 'react';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Modal, Spinner, btnStyle } from './primitives';
import { FONT_MONO } from '../tokens';
import { api } from '../api';
import type { DiscoveredDevice } from '../api';
import { Wifi, Radio, Search, CheckCircle } from 'lucide-react';
import { toast } from '../store/toast';

const TYPE_LABEL: Record<DiscoveredDevice['type'], string> = {
  bitaxe: 'BitAxe',
  nerdaxe: 'NerdAxe',
  nmminer_master: 'NMMiner Master',
  nmminer_device: 'NMMiner Device',
};

const VIA_ICON = {
  arp:  <Radio size={11} />,
  mdns: <Wifi size={11} />,
  scan: <Search size={11} />,
};

export function DiscoveryModal({ onClose }: { onClose: () => void }) {
  const { theme: t } = useThemeStore();
  const { settings, setSettings } = useAppStore();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ found: DiscoveredDevice[]; method: string; arp_count: number; mdns_count: number } | null>(null);
  const [selected, setSelected] = useState(new Set<string>());
  const [adding, setAdding] = useState(false);

  const scan = async () => {
    setScanning(true);
    setResult(null);
    setSelected(new Set());
    try {
      const data = await api.discovery.scan();
      setResult(data);
    } catch {
      toast('Scan failed', 'error');
    }
    setScanning(false);
  };

  const toggle = (ip: string) => {
    const s = new Set(selected);
    if (s.has(ip)) s.delete(ip); else s.add(ip);
    setSelected(s);
  };

  const addSelected = async () => {
    if (!result) return;
    setAdding(true);

    const devicesToAdd = result.found.filter(d => selected.has(d.ip));
    const current = settings || {};
    const patch: Record<string, unknown> = {};

    const nmMasters = devicesToAdd.filter(d => d.type === 'nmminer_master' || d.type === 'nmminer_device');
    const axeDevices = devicesToAdd.filter(d => d.type === 'bitaxe' || d.type === 'nerdaxe');

    if (nmMasters.length > 0) {
      // Use the first master, or the device IP if it's a standalone device
      const master = nmMasters.find(d => d.type === 'nmminer_master') ?? nmMasters[0];
      patch.nmminer_master = master.ip;
    }

    if (axeDevices.length > 0) {
      const rawExisting = (current as Record<string, unknown>).axeos_devices ?? [];
      const existingAxe = (rawExisting as Array<unknown>).map(d =>
        typeof d === 'string' ? { ip: d, name: d, type: 'bitaxe' } : d as { ip: string; name: string; type: string }
      );
      const existingIps = new Set(existingAxe.map(d => d.ip));
      const newDevices = axeDevices
        .filter(d => !existingIps.has(d.ip))
        .map(d => ({ ip: d.ip, name: d.name || d.ip, type: d.type === 'nerdaxe' ? 'nerdaxe' : 'bitaxe' }));
      patch.axeos_devices = [...existingAxe, ...newDevices];
    }

    try {
      const updated = await api.settings.save({ ...current, ...patch } as Parameters<typeof api.settings.save>[0]);
      setSettings(updated);
      toast(`Added ${devicesToAdd.length} device${devicesToAdd.length !== 1 ? 's' : ''}`);
      onClose();
    } catch {
      toast('Failed to save devices', 'error');
    }
    setAdding(false);
  };

  return (
    <Modal t={t} title="Discover Devices" onClose={onClose} width={600}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Explanation */}
        <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>
          Scans your local network using ARP table lookups, mDNS, and HTTP probing to find NMMiner and BitAxe/NerdAxe devices automatically.
        </div>

        <button onClick={scan} disabled={scanning} style={{ ...btnStyle(t, 'primary'), alignSelf: 'flex-start' }}>
          {scanning ? <><Spinner t={t} size={14} /> Scanning…</> : <><Search size={14} /> Start Scan</>}
        </button>

        {result && (
          <>
            <div style={{ fontSize: 12, color: t.textMuted, fontFamily: FONT_MONO }}>
              {result.method} · {result.arp_count} ARP hosts · {result.mdns_count} mDNS · {result.found.length} device{result.found.length !== 1 ? 's' : ''} found
            </div>

            {result.found.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: t.textMuted }}>
                <Search size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>No devices found</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Make sure devices are on the same network and powered on.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.textMuted }}>
                    <input type="checkbox"
                      checked={selected.size === result.found.length}
                      onChange={() => {
                        if (selected.size === result.found.length) setSelected(new Set());
                        else setSelected(new Set(result.found.map(d => d.ip)));
                      }}
                      style={{ accentColor: t.accent }}
                    />
                    Select all
                  </div>
                  <span style={{ fontSize: 12, color: t.textMuted }}>{selected.size} selected</span>
                </div>
                {result.found.map(d => (
                  <div key={d.ip} onClick={() => toggle(d.ip)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, border: `1px solid ${selected.has(d.ip) ? t.accent : t.border}`, background: selected.has(d.ip) ? t.accentGlow : t.surface, cursor: 'pointer' }}
                  >
                    <input type="checkbox" checked={selected.has(d.ip)} onChange={() => toggle(d.ip)} onClick={e => e.stopPropagation()} style={{ accentColor: t.accent }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</span>
                        <span style={{ fontSize: 10, color: t.accent, fontFamily: FONT_MONO, background: t.accentGlow, padding: '1px 5px', borderRadius: 4 }}>{TYPE_LABEL[d.type]}</span>
                        <span style={{ fontSize: 10, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 3 }}>{VIA_ICON[d.discovered_via]} {d.discovered_via}</span>
                      </div>
                      <div style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT_MONO, marginTop: 2 }}>
                        {d.ip}
                        {d.asic && ` · ${d.asic}`}
                        {d.hashrate != null && d.hashrate > 0 && ` · ${d.hashrate.toFixed(1)} GH/s`}
                        {d.temp != null && d.temp > 0 && ` · ${d.temp}°C`}
                        {d.device_count != null && ` · ${d.device_count} device${d.device_count !== 1 ? 's' : ''}`}
                      </div>
                    </div>
                    {selected.has(d.ip) && <CheckCircle size={16} style={{ color: t.accent, flexShrink: 0 }} />}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
          <button onClick={onClose} style={btnStyle(t)}>Cancel</button>
          {result && result.found.length > 0 && (
            <button onClick={addSelected} disabled={selected.size === 0 || adding} style={{ ...btnStyle(t, 'primary'), opacity: selected.size === 0 ? 0.5 : 1 }}>
              {adding ? 'Adding…' : `Add ${selected.size > 0 ? selected.size : ''} Device${selected.size !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
