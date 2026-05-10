// ─── HTTP primitives (module-private) ────────────────────────────────────────

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

async function post<T = OkResponse>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

async function put<T = OkResponse>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

async function patch<T = OkResponse>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

async function del<T = OkResponse>(path: string): Promise<T> {
  const r = await fetch(path, { method: 'DELETE' });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const api = {
  dashboard: () => get<DashboardData>('/api/dashboard'),
  settings: {
    get:         ()                                                            => get<AppSettings>('/api/settings'),
    save:        (data: Partial<AppSettings>)                                  => post<AppSettings>('/api/settings', data),
    patchDevice: (data: { ip: string; name?: string; temp_max?: number })      => patch('/api/settings/device', data),
  },
  nmminer: {
    swarm:            ()                             => get<{ devices: NMMinerDevice[]; _error?: string }>('/api/nmminer/swarm'),
    deviceConfig:     (ip: string)                  => get<NMMinerConfig>(`/api/nmminer/device-config?ip=${ip}`),
    saveDeviceConfig: (cfg: NMMinerConfig)           => post('/api/nmminer/device-config', cfg),
    broadcastConfig:  (cfg: Record<string, unknown>) => post('/api/nmminer/broadcast-config', cfg),
  },
  axeos: {
    devices:     ()                                               => get<AxeDevice[]>('/api/axeos/devices'),
    action:      (ip: string, action: AxeAction)                 => post<AxeActionResponse>(`/api/axeos/action/${ip}?action=${action}`),
    batchAction: (ips: string[], action: AxeAction)              => post('/api/axeos/action/batch', { ips, action }),
    configAll:   (cfg: Record<string, unknown>)                  => patch('/api/axeos/config/all', cfg),
    configBatch: (ips: string[], freq: number, voltage: number)  => patch('/api/axeos/config/batch', { ips, frequency: freq, coreVoltage: voltage }),
    configOne:   (ip: string, cfg: Record<string, unknown>)      => patch<AxeActionResponse>(`/api/axeos/config/${ip}`, cfg),
    scan:        ()                                               => get<AxeDevice[]>('/api/axeos/scan'),
  },
  device: {
    logs:    (ip: string)              => get<string[] | { logs: string[] }>(`/api/device/${ip}/logs`),
    exec:    (ip: string, cmd: string) => post<{ output?: string; result?: string; error?: string }>(`/api/device/${ip}/exec`, { cmd }),
    restart: (ip: string)              => post(`/api/device/${ip}/restart`),
  },
  templates: {
    list:  ()                                                                       => get<DeviceTemplate[]>('/api/templates'),
    apply: (ip: string, templateId: string, config: Record<string, unknown>)       => post(`/api/device/${ip}/apply-template`, { template_id: templateId, config }),
  },
  stats: {
    hashrate: (days: number) => get<StatSample[]>(`/api/stats/hashrate?days=${days}`),
  },
  groups: {
    list:   ()                               => get<Group[]>('/api/groups'),
    create: (g: Partial<Group>)              => post<Group>('/api/groups', g),
    update: (id: string, g: Partial<Group>) => put<Group>(`/api/groups/${id}`, g),
    delete: (id: string)                    => del(`/api/groups/${id}`),
  },
  alerts: {
    list:    (days = 7) => get<Alert[]>(`/api/alerts?days=${days}`),
    readAll: ()         => post('/api/alerts/read-all'),
    delete:  ()         => del('/api/alerts'),
  },
  health:   (ip?: string) => ip ? get<HealthData>(`/api/health/${ip}`) : get<HealthData>('/api/health'),
  earnings: (days = 30)   => get<EarningsEntry[]>(`/api/earnings?days=${days}`),
  pools: {
    list:         ()                                   => get<PoolPreset[]>('/api/pools'),
    create:       (p: Partial<PoolPreset>)             => post<PoolPreset>('/api/pools', p),
    update:       (id: string, p: Partial<PoolPreset>) => put<PoolPreset>(`/api/pools/${id}`, p),
    delete:       (id: string)                         => del(`/api/pools/${id}`),
    pushToDevice: (ip: string, pool: Partial<PoolPreset>) => post(`/api/pools/push/${ip}`, pool),
  },
  wallets: {
    list:   ()                                => get<Wallet[]>('/api/wallets'),
    create: (w: Partial<Wallet>)              => post<Wallet>('/api/wallets', w),
    update: (id: string, w: Partial<Wallet>) => put<Wallet>(`/api/wallets/${id}`, w),
    delete: (id: string)                     => del(`/api/wallets/${id}`),
  },
  schedules: {
    list:   ()                                  => get<Schedule[]>('/api/schedules'),
    create: (s: Partial<Schedule>)              => post<Schedule>('/api/schedules', s),
    update: (id: string, s: Partial<Schedule>) => put<Schedule>(`/api/schedules/${id}`, s),
    delete: (id: string)                        => del(`/api/schedules/${id}`),
  },
  notifications: {
    test: () => post('/api/notifications/test'),
  },
};

// ─── Shared response shapes ───────────────────────────────────────────────────

export interface OkResponse { ok?: boolean; status?: string }
export interface AxeActionResponse { ip: string; action: string; status: number }
export interface StatSample { ts: number; total_ghs?: number; ghs?: number }
export interface DeviceTemplate {
  id: string;
  name: string;
  type: 'nmminer' | 'axeos' | 'both';
  description?: string;
  config: Record<string, unknown>;
  created_at?: string;
}

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface DashboardData {
  nmminer: { devices: NMMinerDevice[]; _error?: string };
  axeos:   { devices: AxeDevice[] };
  unread_alerts: number;
  config: AppSettings;
}

export interface NMMinerDevice {
  ip: string;
  name?: string;
  hostname?: string;
  status?: 'online' | 'offline' | 'warning';
  hashrate?: number;
  GHs5s?: number;
  GHs5?: number;
  GHs1m?: number;
  GHsav?: number;
  temp?: number;
  temperature?: number;
  chipTemp?: number;
  pool?: string;
  stratumURL?: string;
  worker?: string;
  stratumUser?: string;
  uptime?: number | string;
  bestShare?: string;
  best_share?: string;
  bestDiff?: string;
  version?: string;
  shares_ok?: number;
  shares_err?: number;
  _online?: boolean;
}

export interface AxeDevice {
  ip?: string;
  _ip?: string;
  _name?: string;
  _type?: 'bitaxe' | 'nerdaxe';
  _online?: boolean;
  hostname?: string;
  hashRate?: number;
  hashRate_1m?: number;
  hashRate_10m?: number;
  hashRate_1h?: number;
  expectedHashrate?: number;
  errorPercentage?: number;
  temp?: number;
  temp2?: number;
  vrTemp?: number;
  power?: number;
  current?: number;
  voltage?: number;
  frequency?: number;
  actualFrequency?: number;
  core_voltage?: number;
  fanspeed?: number;
  fanrpm?: number;
  fan2rpm?: number;
  sharesAccepted?: number;
  sharesRejected?: number;
  stratumURL?: string;
  stratumUser?: string;
  stratumPassword?: string;
  fallbackStratumURL?: string;
  isUsingFallbackStratum?: number;
  uptimeSeconds?: number;
  miningPaused?: boolean;
  bestDiff?: number;
  bestSessionDiff?: number;
  ASICModel?: string;
  boardVersion?: string;
  version?: string;
  axeOSVersion?: string;
  wifiSSID?: string;
  ssid?: string;
  rssi?: number;
  status?: 'online' | 'offline' | 'warning' | 'paused';
}

export interface Group {
  id: string;
  name: string;
  color: string;
  deviceIps: string[];
  description?: string;
  total?: number;
  online?: number;
  alerts?: number;
}

export interface Alert {
  id: string;
  device?: string;
  kind?: string;
  severity: 'critical' | 'warning' | 'info' | 'ok';
  message: string;
  timestamp?: string;
  read: boolean;
  resolved?: boolean;
  source?: string;
  title?: string;
  detail?: string;
  when?: string;
}

export interface Wallet {
  id: string;
  label: string;
  coin: string;
  address: string;
  derivation?: string;
  lastPayout?: string;
  payoutTotal?: number;
}

export interface Schedule {
  id: string;
  name: string;
  enabled: boolean;
  days?: string[];
  time_start?: string;
  time_end?: string;
  action?: 'pool_switch' | 'power_limit' | 'restart' | 'pause' | 'resume' | 'throttle';
  scope?: string;
  deviceIps?: string[];
  groupId?: string;
  pool_id?: string;
  power?: number;
}

export interface EarningsEntry {
  date: string;
  avg_hr_ghs: number;
  avg_power_w: number;
  btc_reward: number;
  usd_reward: number;
  usd_cost: number;
  samples: number;
}

export interface HealthData {
  version: string;
  uptime: number;
  nmminer_count: number;
  axeos_count: number;
  update?: { current: string; latest: string; notes: string[]; size_mb: number };
  hashrate_series?: number[];
  temp_series?: number[];
  power_series?: number[];
}

export interface AppSettings {
  nmminer_master?: string;
  nmminer_devices?: string[];
  axeos_devices?: Array<{ ip: string; name: string; type: string }>;
  refresh_interval?: number;
  offline_grace_minutes?: number;
  alert_cooldown_minutes?: number;
  thresholds?: {
    temp_max?: number;
    vr_temp_max?: number;
    hashrate_min?: number;
    error_rate_max?: number;
    share_rate_min?: number;
  };
  notifications?: {
    telegram_enabled?: boolean;
    telegram_token?: string;
    telegram_chat_id?: string;
    discord_enabled?: boolean;
    discord_webhook?: string;
    gotify_enabled?: boolean;
    gotify_url?: string;
    gotify_token?: string;
  };
  alert_types?: Record<string, boolean>;
  weekly_summary?: { enabled: boolean; day: string; time: string };
  pool_presets?: PoolPreset[];
  electricity_kwh_price?: number;
  wallets?: Wallet[];
  schedules?: Schedule[];
  groups?: Group[];
  market?: { currency?: string };
}

export interface NMMinerConfig {
  ip?: string;
  IP?: string;
  Hostname?: string;
  WiFiSSID?: string;
  WiFiPWD?: string;
  PrimaryPool?: string;
  PrimaryAddress?: string;
  PrimaryPassword?: string;
  SecondaryPool?: string;
  SecondaryAddress?: string;
  SecondaryPassword?: string;
  Timezone?: number;
  TimeFormat?: number;
  DateFormat?: string;
  UIRefresh?: number;
  ScreenTimeout?: number;
  Brightness?: number;
  SaveUptime?: number | boolean;
  LedEnable?: number | boolean;
  RotateScreen?: number;
  SelectedCoins?: string;
  AutoBrightness?: number | boolean;
}

export interface PoolPreset {
  id: string;
  name: string;
  url: string;
  worker: string;
  password: string;
  url2?: string;
  worker2?: string;
  password2?: string;
  fallback_url?: string;
  fallback_worker?: string;
  fallback_password?: string;
  coin?: string;
  is_default?: boolean;
}

export type AxeAction = 'pause' | 'resume' | 'restart' | 'identify';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getHashrate(d: NMMinerDevice): number {
  return d.GHs5s ?? d.GHs5 ?? d.GHs1m ?? d.GHsav ?? d.hashrate ?? 0;
}

export function getAxeHashrate(d: AxeDevice): number {
  return d.hashRate ?? 0;
}

export function getTemp(d: NMMinerDevice): number | null {
  return d.temp ?? d.temperature ?? d.chipTemp ?? null;
}

export function fmtUptime(seconds: number | string | undefined): string {
  if (seconds == null) return '—';
  const s = typeof seconds === 'string' ? parseInt(seconds, 10) : seconds;
  if (!Number.isFinite(s) || s < 0) {
    return typeof seconds === 'string' && !/^\d+$/.test(seconds) ? seconds : '—';
  }
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function fmtHashrate(ghs: number): string {
  if (ghs >= 1000) return `${(ghs / 1000).toFixed(2)} TH/s`;
  return `${ghs.toFixed(1)} GH/s`;
}

/** Format a best-share/best-diff value. Accepts a raw number or pre-formatted string. */
export function fmtBestDiff(v: number | string | null | undefined): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'string') {
    const n = Number(v);
    if (!Number.isNaN(n) && /^[\d.]+$/.test(v)) return fmtBestDiff(n);
    return v;
  }
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `${(v / 1e9).toFixed(2)}G`;
  if (v >= 1e6)  return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3)  return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

export function getAxeStatus(d: AxeDevice): 'online' | 'offline' | 'warning' | 'paused' {
  if (!d._online) return 'offline';
  if (d.miningPaused) return 'paused';
  if ((d.temp ?? 0) > (d._type === 'nerdaxe' ? 65 : 70)) return 'warning';
  return 'online';
}

export function getNmStatus(d: NMMinerDevice): 'online' | 'offline' | 'warning' {
  if (d._online === false) return 'offline';
  return d.status ?? 'online';
}
