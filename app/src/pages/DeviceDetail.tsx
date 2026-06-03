import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useThemeStore } from '../store/theme';
import { useAppStore } from '../store/app';
import { Pill, StatusPill, btnStyle } from '../components/primitives';
import { FONT_MONO } from '../tokens';
import { api, getHashrate } from '../api';
import type { HealthData, ProbabilityResult } from '../api';
import { ArrowLeft, Cpu, Activity, FileText, Zap, Settings, RefreshCw, Play, Pause } from 'lucide-react';
import { OverviewTab, ChartsTab, LogsTab, PowerCurveTab, ConfigTab } from '../components/device/DeviceTabs';

export function DeviceDetail() {
  const { ip } = useParams<{ ip: string }>();
  const navigate = useNavigate();
  const { theme: t } = useThemeStore();
  const { devices, axeDevices } = useAppStore();
  const [tab, setTab] = useState('overview');
  const [health, setHealth] = useState<HealthData | null>(null);
  const [fwLatest, setFwLatest] = useState<Record<string, { version: string; html_url: string }>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [prob, setProb] = useState<ProbabilityResult | null>(null);

  const nmDevice = devices.find(d => d.ip === ip);
  const axeDevice = axeDevices.find(d => d._ip === ip);
  const isAxe = !!axeDevice && !nmDevice;
  const devProb = prob?.devices.find(d => d.ip === ip) ?? null;

  // Logs come from the AxeOS HTTP/WebSocket log endpoints; NMMiner exposes none.
  const TABS = [
    { id: 'overview', label: 'Overview', Icon: Activity },
    { id: 'charts', label: 'Charts', Icon: Activity },
    ...(isAxe ? [{ id: 'logs', label: 'Logs', Icon: FileText }] : []),
    { id: 'power', label: 'Power curve', Icon: Zap },
    { id: 'config', label: 'Config', Icon: Settings },
  ];

  useEffect(() => {
    if (ip) api.health(ip).then(setHealth).catch(() => {});
    api.probability().then(setProb).catch(() => setProb(null));
    api.firmware.latest().then(setFwLatest).catch(() => {});
  }, [ip]);

  if (!nmDevice && !axeDevice) {
    return (
      <div>
        <button onClick={() => navigate(-1)} style={{ ...btnStyle(t), padding: 8, marginBottom: 14 }}><ArrowLeft size={14} /></button>
        <div style={{ color: t.textMuted }}>Device not found: {ip}</div>
      </div>
    );
  }

  const name = nmDevice ? (nmDevice.name || nmDevice.hostname || nmDevice.ip) : (axeDevice!._name || axeDevice!.hostname || axeDevice!._ip);
  const status = nmDevice ? (nmDevice.status || 'online') : (axeDevice!.status || 'offline');
  const hr = nmDevice ? getHashrate(nmDevice) : (axeDevice!.hashRate || 0);
  const temp = nmDevice ? (nmDevice.chipTemp ?? nmDevice.temp ?? null) : (axeDevice!.temp ?? null);
  const uptime = nmDevice ? (nmDevice.uptime ?? null) : (axeDevice!.uptimeSeconds != null ? axeDevice!.uptimeSeconds : null);
  const deviceType = isAxe ? (axeDevice!._type || 'bitaxe') : 'lottominer';

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button onClick={() => navigate(-1)} style={{ ...btnStyle(t), padding: 7 }}><ArrowLeft size={14} /></button>
        <div style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT_MONO }}>Devices / {name}</div>
      </div>

      {/* Device header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{ width: 56, height: 56, borderRadius: 12, background: `${t.accent}22`, border: `1px solid ${t.accent}44`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Cpu size={24} color={t.accent} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>{name}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
            <StatusPill t={t} status={status} />
            <Pill t={t} sev="info">{deviceType}</Pill>
            <span style={{ fontSize: 11, fontFamily: FONT_MONO, color: t.textMuted }}>{ip}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {actionError && (
            <span style={{ fontSize: 11, color: t.danger, fontFamily: FONT_MONO }}>{actionError}</span>
          )}
          {isAxe && axeDevice!.miningPaused && (
            <button style={{ ...btnStyle(t, 'primary'), fontSize: 12 }}
              onClick={() => { setActionError(null); api.axeos.action(ip!, 'resume').catch(e => setActionError(String(e))); }}>
              <Play size={12} /> Resume
            </button>
          )}
          {isAxe && !axeDevice!.miningPaused && (
            <button style={{ ...btnStyle(t), fontSize: 12 }}
              onClick={() => { setActionError(null); api.axeos.action(ip!, 'pause').catch(e => setActionError(String(e))); }}>
              <Pause size={12} /> Pause
            </button>
          )}
          <button style={{ ...btnStyle(t), fontSize: 12 }}
            onClick={() => {
              setActionError(null);
              // NMMiner / AxeHub restart goes through the lottominer batch
              // endpoint (routes by family); api.device.restart has no backend
              // route and returned 405.
              const call = isAxe
                ? api.axeos.action(ip!, 'restart')
                : api.lottominer.batchAction([ip!], 'restart');
              call.catch(e => setActionError(String(e)));
            }}>
            <RefreshCw size={12} /> Restart
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${t.border}`, marginBottom: 16, gap: 0 }}>
        {TABS.map(({ id, label, Icon }) => (
          <div key={id} onClick={() => setTab(id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: tab === id ? t.accent : t.textMuted, borderBottom: tab === id ? `2px solid ${t.accent}` : '2px solid transparent', marginBottom: -1, whiteSpace: 'nowrap' }}>
            <Icon size={13} />
            {label}
          </div>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab t={t} nmDevice={nmDevice} axeDevice={axeDevice} hr={hr} temp={temp} uptime={uptime} health={health} prob={devProb} fwLatest={fwLatest} />}
      {tab === 'charts' && <ChartsTab t={t} ip={ip!} health={health} />}
      {tab === 'logs' && isAxe && <LogsTab t={t} ip={ip!} />}
      {tab === 'power' && <PowerCurveTab t={t} ip={ip!} axeDevice={axeDevice} />}
      {tab === 'config' && <ConfigTab t={t} ip={ip!} nmDevice={nmDevice} axeDevice={axeDevice} />}
    </div>
  );
}
