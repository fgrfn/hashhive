import React, { useState } from 'react';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, Spinner, FormField, btnStyle } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api } from '../api';
import type { DiscoveredDevice } from '../api';
import { Wifi, Radio, Search, CheckCircle, Radar, Save } from 'lucide-react';
import { toast } from '../store/toast';

const TYPE_LABEL: Record<DiscoveredDevice['type'], string> = {
  bitaxe: 'BitAxe',
  nerdaxe: 'NerdAxe',
  nmminer_master: 'NMMiner Master',
  nmminer_device: 'NMMiner Device',
  nerdminer: 'NerdMiner',
  sparkminer: 'SparkMiner',
};

const VIA_ICON: Record<DiscoveredDevice['discovered_via'], React.ReactNode> = {
  arp: <Radio size={11} />,
  mdns: <Wifi size={11} />,
  scan: <Search size={11} />,
};

export function Discovery() {
  const { theme: t } = useThemeStore();
  const { settings, setSettings } = useAppStore();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ found: DiscoveredDevice[]; method: string; arp_count: number; mdns_count: number; subnet?: string } | null>(null);
  const [selected, setSelected] = useState(new Set<string>());
  const [adding, setAdding] = useState(false);
  const [subnet, setSubnet] = useState('');
  const [extraIps, setExtraIps] = useState('');

  const disc = settings?.discovery ?? {};

  const scan = async () => {
    setScanning(true);
    setResult(null);
    setSelected(new Set());
    try {
      const data = await api.discovery.scan({ subnet: subnet.trim() || undefined, extra_ips: extraIps.trim() || undefined });
      setResult(data);
    } catch {
      toast('Scan failed', 'error');
    }
    setScanning(false);
  };

  const toggle = (ip: string) => {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(ip)) s.delete(ip); else s.add(ip);
      return s;
    });
  };

  const addSelected = async () => {
    if (!result) return;
    setAdding(true);
    const devicesToAdd = result.found.filter(d => selected.has(d.ip));
    try {
      const res = await api.discovery.add(devicesToAdd);
      toast(`Added ${res.count} device${res.count !== 1 ? 's' : ''}`);
      // Drop the added devices from the list so it reflects the new state.
      const addedIps = new Set(res.added.map(d => d.ip));
      setResult({ ...result, found: result.found.filter(d => !addedIps.has(d.ip)) });
      setSelected(new Set());
    } catch {
      toast('Failed to add devices', 'error');
    }
    setAdding(false);
  };

  const saveSettings = async (patch: Record<string, unknown>) => {
    const next = { ...disc, ...patch };
    try {
      const updated = await api.settings.save({ ...(settings || {}), discovery: next } as Parameters<typeof api.settings.save>[0]);
      setSettings(updated);
      toast('Discovery settings saved');
    } catch {
      toast('Failed to save settings', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card t={t}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Radar size={18} color={t.accent} />
          <div style={{ fontWeight: 700, fontSize: 15 }}>Scan for miners</div>
        </div>
        <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.5, marginBottom: 14 }}>
          Scans your local network using ARP, mDNS and HTTP probing to find AxeOS (BitAxe/NerdAxe),
          NMMiner and SoloMiner (NerdMiner/SparkMiner) devices automatically.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <FormField t={t} label="Subnet (optional)" value={subnet} onChange={setSubnet} placeholder="e.g. 192.168.1" />
          <FormField t={t} label="Extra IPs (comma-separated)" value={extraIps} onChange={setExtraIps} placeholder="e.g. 10.0.0.5, 10.0.0.6" />
        </div>
        <button onClick={scan} disabled={scanning} style={{ ...btnStyle(t, 'primary'), alignSelf: 'flex-start' }}>
          {scanning ? <><Spinner t={t} size={14} /> Scanning…</> : <><Search size={14} /> Start scan</>}
        </button>

        {result && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, color: t.textMuted, fontFamily: FONT_MONO }}>
              {result.method} · {result.subnet ?? ''} · {result.arp_count} ARP · {result.mdns_count} mDNS · {result.found.length} found
            </div>

            {result.found.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: t.textMuted }}>
                <Search size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>No new devices found</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Make sure devices are powered on and on the same network.</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.textMuted, cursor: 'pointer' }}>
                    <input type="checkbox"
                      checked={selected.size === result.found.length && result.found.length > 0}
                      onChange={() => setSelected(selected.size === result.found.length ? new Set() : new Set(result.found.map(d => d.ip)))}
                      style={{ accentColor: t.accent }}
                    />
                    Select all
                  </label>
                  <span style={{ fontSize: 12, color: t.textMuted }}>{selected.size} selected</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
                  {result.found.map(d => {
                    const sel = selected.has(d.ip);
                    return (
                      <div key={d.ip} onClick={() => toggle(d.ip)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, border: `1px solid ${sel ? t.accent : t.border}`, background: sel ? t.accentGlow : t.surface, cursor: 'pointer' }}>
                        <input type="checkbox" checked={sel} onChange={() => toggle(d.ip)} onClick={e => e.stopPropagation()} style={{ accentColor: t.accent }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</span>
                            <span style={{ fontSize: 10, color: t.accent, fontFamily: FONT_MONO, background: t.accentGlow, padding: '1px 5px', borderRadius: 4 }}>{TYPE_LABEL[d.type]}</span>
                            <span style={{ fontSize: 10, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 3 }}>{VIA_ICON[d.discovered_via]} {d.discovered_via}</span>
                          </div>
                          <div style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT_MONO, marginTop: 2 }}>
                            {d.ip}
                            {d.asic && ` · ${d.asic}`}
                            {d.hashrate != null && d.hashrate !== 0 && ` · ${d.hashrate}`}
                            {d.temp != null && d.temp > 0 && ` · ${d.temp}°C`}
                            {d.device_count != null && ` · ${d.device_count} device${d.device_count !== 1 ? 's' : ''}`}
                          </div>
                        </div>
                        {sel && <CheckCircle size={16} style={{ color: t.accent, flexShrink: 0 }} />}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={addSelected} disabled={selected.size === 0 || adding} style={{ ...btnStyle(t, 'primary'), opacity: selected.size === 0 || adding ? 0.5 : 1 }}>
                    {adding ? 'Adding…' : `Add ${selected.size || ''} device${selected.size !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      <Card t={t}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Save size={16} color={t.accent} />
          <div style={{ fontWeight: 700, fontSize: 15 }}>Continuous scan</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ToggleRow t={t} label="Automatically scan in the background" value={!!disc.auto_scan} onChange={v => saveSettings({ auto_scan: v })} />
          <ToggleRow t={t} label="Notify when a new device appears" value={disc.notify ?? true} onChange={v => saveSettings({ notify: v })} />
          <ToggleRow t={t} label="Auto-add newly discovered devices" value={!!disc.auto_add} onChange={v => saveSettings({ auto_add: v })} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Label t={t}>Scan interval (minutes)</Label>
            <input type="number" min={1} defaultValue={disc.interval_minutes ?? 30}
              onBlur={e => saveSettings({ interval_minutes: Math.max(1, parseInt(e.target.value, 10) || 30) })}
              style={{ width: 90, padding: '7px 10px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontSize: 13, fontFamily: FONT_MONO }} />
          </div>
        </div>
      </Card>
    </div>
  );
}

function ToggleRow({ t, label, value, onChange }: { t: Theme; label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} style={{ accentColor: t.accent }} />
      {label}
    </label>
  );
}
