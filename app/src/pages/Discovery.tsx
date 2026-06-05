import React, { useState } from 'react';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Card, Label, Spinner, FormField, Select, btnStyle } from '../components/primitives';
import { FONT_MONO, type Theme } from '../tokens';
import { api } from '../api';
import type { DiscoveredDevice, AppSettings } from '../api';
import { Wifi, Radio, Search, CheckCircle, Radar, Plus, Trash2 } from 'lucide-react';
import { toast } from '../store/toast';
import { applyDashboardToStore } from '../hooks/useDeviceStream';

const TYPE_LABEL: Record<DiscoveredDevice['type'], string> = {
  bitaxe: 'BitAxe',
  nerdaxe: 'NerdAxe',
  lottominer_device: 'NMMiner',
  wroomminer_device: 'WroomMiner',
  axehub_device: 'NerdMiner-AxeHub',
};

const VIA_ICON: Record<DiscoveredDevice['discovered_via'], React.ReactNode> = {
  arp: <Radio size={11} />,
  mdns: <Wifi size={11} />,
  scan: <Search size={11} />,
};

// Manual-add device types → the records the backend /api/discovery/add expects.
const MANUAL_TYPES: [DiscoveredDevice['type'], string][] = [
  ['bitaxe', 'BitAxe'],
  ['nerdaxe', 'NerdAxe'],
  ['lottominer_device', 'NMMiner'],
  ['wroomminer_device', 'WroomMiner'],
  ['axehub_device', 'NerdMiner-AxeHub'],
];

interface ConfiguredDevice { ip: string; name: string; type: string; list: keyof AppSettings; }

/** Flatten the saved config into one list of currently-configured devices. */
function configuredDevices(s: AppSettings | null): ConfiguredDevice[] {
  if (!s) return [];
  const out: ConfiguredDevice[] = [];
  for (const d of s.axeos_devices || []) out.push({ ip: d.ip, name: d.name || d.ip, type: d.type || 'bitaxe', list: 'axeos_devices' });
  for (const d of s.lottominer_devices || []) out.push({ ip: d.ip, name: d.name || d.ip, type: 'lottominer', list: 'lottominer_devices' });
  for (const d of s.wroomminer_devices || []) out.push({ ip: d.ip, name: d.name || d.ip, type: 'wroomminer', list: 'wroomminer_devices' });
  for (const d of s.axehub_devices || []) out.push({ ip: d.ip, name: d.name || d.ip, type: 'axehub', list: 'axehub_devices' });
  return out;
}

/** Small numbered step badge for the top-to-bottom guided flow. */
function StepBadge({ t, n }: { t: Theme; n: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 11, background: t.accent, color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
      {n}
    </span>
  );
}

export function Discovery() {
  const { theme: t } = useThemeStore();
  const { settings, setSettings } = useAppStore();

  // ── Scan state ──────────────────────────────────────────────────────────
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ found: DiscoveredDevice[]; method: string; arp_count: number; mdns_count: number; subnet?: string } | null>(null);
  const [selected, setSelected] = useState(new Set<string>());
  const [adding, setAdding] = useState(false);
  const [subnet, setSubnet] = useState('');
  const [extraIps, setExtraIps] = useState('');

  // ── Manual-add state ────────────────────────────────────────────────────
  const [ip, setIp] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<DiscoveredDevice['type']>('bitaxe');
  const [busy, setBusy] = useState(false);

  const disc = settings?.discovery ?? {};
  const devices = configuredDevices(settings);
  const configuredIps = new Set(devices.map(d => d.ip));
  const addable = (result?.found ?? []).filter(d => !configuredIps.has(d.ip));

  const scan = async () => {
    setScanning(true);
    setResult(null);
    setSelected(new Set());
    try {
      setResult(await api.discovery.scan({ subnet: subnet.trim() || undefined, extra_ips: extraIps.trim() || undefined }));
    } catch {
      toast('Scan failed', 'error');
    }
    setScanning(false);
  };

  const toggle = (deviceIp: string) => {
    if (configuredIps.has(deviceIp)) return;  // already-added devices aren't selectable
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(deviceIp)) s.delete(deviceIp); else s.add(deviceIp);
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
      try { setSettings(await api.settings.get()); } catch { /* keep going */ }
      // Pull a fresh dashboard snapshot so the new devices appear in the
      // overview right away instead of waiting for the next WS broadcast.
      try { applyDashboardToStore(await api.dashboard()); } catch { /* keep going */ }
      const addedIps = new Set(res.added.map(d => d.ip));
      setResult({ ...result, found: result.found.filter(d => !addedIps.has(d.ip)) });
      setSelected(new Set());
    } catch {
      toast('Failed to add devices', 'error');
    }
    setAdding(false);
  };

  const addManual = async () => {
    const trimmed = ip.trim();
    if (!trimmed) { toast('Enter an IP address', 'error'); return; }
    setBusy(true);
    try {
      const res = await api.discovery.add([{ ip: trimmed, name: name.trim() || trimmed, type, discovered_via: 'scan' }]);
      if (res.count > 0) {
        toast(`Added ${TYPE_LABEL[type]} ${trimmed}`);
        setIp(''); setName('');
        try { setSettings(await api.settings.get()); } catch { /* keep going */ }
        // Refresh the overview immediately so the new device is visible at once.
        try { applyDashboardToStore(await api.dashboard()); } catch { /* keep going */ }
      } else {
        toast('Device already added or invalid IP', 'error');
      }
    } catch {
      toast('Failed to add device', 'error');
    }
    setBusy(false);
  };

  const remove = async (d: ConfiguredDevice) => {
    const s: AppSettings = { ...(settings || {}) };
    const arr = (s[d.list] as Array<{ ip: string }> | undefined) || [];
    (s as Record<string, unknown>)[d.list] = arr.filter(x => x.ip !== d.ip);
    try {
      const updated = await api.settings.save(s);
      setSettings(updated);
      // Reflect the removal in the overview without waiting for the next tick.
      try { applyDashboardToStore(await api.dashboard()); } catch { /* keep going */ }
      toast(`Removed ${d.ip}`);
    } catch {
      toast('Failed to remove device', 'error');
    }
  };

  const saveSettings = async (patch: Partial<NonNullable<AppSettings['discovery']>>) => {
    try {
      const updated = await api.settings.save({ ...(settings || {}), discovery: { ...disc, ...patch } } as Parameters<typeof api.settings.save>[0]);
      setSettings(updated);
      toast('Discovery settings saved');
    } catch {
      toast('Failed to save settings', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Step 1 · Scan the network ─────────────────────────────────────── */}
      <Card t={t}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <StepBadge t={t} n={1} />
          <div style={{ fontWeight: 700, fontSize: 15 }}>Scan your network for miners</div>
        </div>
        <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.5, marginBottom: 14, paddingLeft: 32 }}>
          Looks across your local network for AxeOS (BitAxe / NerdAxe), Lottominer (NMMiner)
          and AxeHub devices. Just press <strong>Start scan</strong> — the fields below are optional.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 6 }}>
          <FormField t={t} label="Subnet /24 prefix (optional)" value={subnet} onChange={setSubnet} mono placeholder="192.168.1" />
          <FormField t={t} label="Extra IPs (optional, comma-separated)" value={extraIps} onChange={setExtraIps} mono placeholder="10.0.0.5, 10.0.0.6" />
        </div>
        <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.5, marginBottom: 14 }}>
          Subnet is the first three octets of a /24 network (no last octet, no mask) — the scan
          covers <code>.1</code>–<code>.254</code> automatically. Leave blank to use the
          auto-detected network.
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
              <div style={{ textAlign: 'center', padding: '28px 0', color: t.textMuted }}>
                <Search size={26} style={{ marginBottom: 8, opacity: 0.3 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>No new devices found</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Make sure the miners are powered on and on the same network, or add one by IP below.</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.textMuted, cursor: addable.length ? 'pointer' : 'default' }}>
                    <input type="checkbox" disabled={addable.length === 0}
                      checked={addable.length > 0 && selected.size === addable.length}
                      onChange={() => setSelected(selected.size === addable.length ? new Set() : new Set(addable.map(d => d.ip)))}
                      style={{ accentColor: t.accent }}
                    />
                    Select all new
                  </label>
                  <span style={{ fontSize: 12, color: t.textMuted }}>{selected.size} selected</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
                  {result.found.map(d => {
                    const configured = configuredIps.has(d.ip);
                    const sel = selected.has(d.ip);
                    return (
                      <div key={d.ip} onClick={() => toggle(d.ip)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, border: `1px solid ${sel ? t.accent : t.border}`, background: sel ? t.accentGlow : t.surface, cursor: configured ? 'default' : 'pointer', opacity: configured ? 0.55 : 1 }}>
                        <input type="checkbox" checked={sel} disabled={configured} onChange={() => toggle(d.ip)} onClick={e => e.stopPropagation()} style={{ accentColor: t.accent }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</span>
                            <span style={{ fontSize: 10, color: t.accent, fontFamily: FONT_MONO, background: t.accentGlow, padding: '1px 5px', borderRadius: 4 }}>{TYPE_LABEL[d.type]}</span>
                            <span style={{ fontSize: 10, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 3 }}>{VIA_ICON[d.discovered_via]} {d.discovered_via}</span>
                            {configured && <span style={{ fontSize: 10, color: t.success, fontFamily: FONT_MONO, background: `${t.success}22`, padding: '1px 5px', borderRadius: 4 }}>Already added</span>}
                          </div>
                          <div style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT_MONO, marginTop: 2 }}>{d.ip}</div>
                        </div>
                        {sel && <CheckCircle size={16} style={{ color: t.accent, flexShrink: 0 }} />}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: t.textMuted }}>
                    {addable.length} new · {result.found.length - addable.length} already added
                  </span>
                  <button onClick={addSelected} disabled={selected.size === 0 || adding} style={{ ...btnStyle(t, 'primary'), opacity: selected.size === 0 || adding ? 0.5 : 1 }}>
                    {adding ? 'Adding…' : `Add ${selected.size || ''} device${selected.size !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      {/* ── Step 2 · Add by IP ────────────────────────────────────────────── */}
      <Card t={t}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <StepBadge t={t} n={2} />
          <div style={{ fontWeight: 700, fontSize: 15 }}>Or add a device by IP</div>
        </div>
        <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.5, marginBottom: 14, paddingLeft: 32 }}>
          Know the address already? Add it directly — handy for devices the scan can't reach.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1.4fr auto', gap: 10, alignItems: 'end' }}>
          <FormField t={t} label="IP address" value={ip} onChange={setIp} placeholder="192.168.1.50" mono />
          <FormField t={t} label="Name (optional)" value={name} onChange={setName} placeholder="e.g. Garage BitAxe" />
          <div>
            <Label t={t} style={{ marginBottom: 6 }}>Type</Label>
            <Select t={t} value={type} options={MANUAL_TYPES} onChange={v => setType(v as DiscoveredDevice['type'])} />
          </div>
          <button onClick={addManual} disabled={busy || !ip.trim()} style={{ ...btnStyle(t, 'primary'), opacity: busy || !ip.trim() ? 0.5 : 1, height: 38 }}>
            <Plus size={14} /> Add
          </button>
        </div>
      </Card>

      {/* ── Configured devices (always visible — confirms what was added) ──── */}
      <Card t={t} noPad>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Configured devices</div>
          <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: t.textMuted }}>{devices.length}</span>
        </div>
        {devices.length === 0 ? (
          <div style={{ padding: '20px 16px', color: t.textMuted, fontSize: 13 }}>No devices yet — scan above or add one by IP.</div>
        ) : devices.map((d, i) => (
          <div key={`${d.list}:${d.ip}:${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 110px 40px', gap: 10, padding: '11px 16px', borderBottom: i === devices.length - 1 ? 'none' : `1px solid ${t.border}`, alignItems: 'center', fontSize: 13 }}>
            <div style={{ fontWeight: 500 }}>{d.name}</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: t.textMuted }}>{d.ip}</div>
            <span style={{ fontSize: 10, color: t.accent, fontFamily: FONT_MONO, background: t.accentGlow, padding: '2px 6px', borderRadius: 4, justifySelf: 'start' }}>{d.type}</span>
            <button onClick={() => remove(d)} title="Remove" style={{ ...btnStyle(t, 'danger'), padding: '5px 8px', justifySelf: 'end' }}><Trash2 size={12} /></button>
          </div>
        ))}
      </Card>

      {/* ── Continuous background scan ─────────────────────────────────────── */}
      <Card t={t}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Radar size={16} color={t.textMuted} />
          <div style={{ fontWeight: 700, fontSize: 14 }}>Continuous scan</div>
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
