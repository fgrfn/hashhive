// Shared response shapes and domain types for the HashHive API client.

export interface OkResponse { ok?: boolean; status?: string }

export interface DiscoveredDevice {
  ip: string;
  type: 'bitaxe' | 'nerdaxe' | 'lottominer_master' | 'lottominer_device' | 'axehub_device';
  name: string;
  discovered_via: 'arp' | 'mdns' | 'scan';
  asic?: string;
  hashrate?: number | string;
  temp?: number;
  version?: string;
  device_count?: number;
}

export interface GroupActionResult {
  group: string;
  action: string;
  results: Array<{ ip?: string; status?: number; type?: string; error?: string }>;
}

export interface DiscoveryScanResult {
  local_ip: string;
  subnet: string;
  arp_count: number;
  mdns_count: number;
  probed: number;
  method: string;
  found: DiscoveredDevice[];
}
export type ProbWindows = { '1h': number | null; '24h': number | null; '7d': number | null };
export interface ProbabilityResult {
  network_difficulty: number | null;
  windows: string[];
  fleet: { hashrate_ghs: number; block: ProbWindows };
  devices: Array<{
    ip: string;
    name: string;
    hashrate_ghs: number;
    best_diff: number;
    block: ProbWindows;
    beat_best_share: ProbWindows;
  }>;
}

export interface AnalyticsResult {
  fleet: { hashrate_ghs: number; network_difficulty: number | null; best_share: number };
  summary: {
    all_time_best: number;
    record_count: number;
    active_miners: number;
    shares_today: number;
    shares_7d: number;
    best_today: number;
    best_7d: number;
  };
  best_share_series: Array<{ date: string; best: number }>;
  efficiency: Array<{ ip: string; name: string; hashrate_ghs: number; power_w: number; w_per_th: number }>;
  beat_best: { record: number; expected_seconds: number | null; windows: ProbWindows };
  block: { expected_seconds: number | null; windows: ProbWindows };
  leaderboard: Array<{ ip: string; name: string; type: string; best_diff: number; ts: string | null }>;
}

export interface AxeActionResponse { ip: string; action: string; status: number }
export interface StatSample { ts: string; gh: number; pwr?: number; shares?: number }
export interface DeviceTemplate {
  id: string;
  name: string;
  type: 'lottominer' | 'axeos' | 'both';
  description?: string;
  config: Record<string, unknown>;
  created_at?: string;
}

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface DashboardData {
  lottominer: { devices: NMMinerDevice[]; _error?: string };
  axeos:   { devices: AxeDevice[] };
  unread_alerts: number;
  config: AppSettings;
}

export interface NMMinerDevice {
  ip: string;
  _type?: 'lottominer' | 'axehub';
  name?: string;
  hostname?: string;
  status?: 'online' | 'offline' | 'warning';
  hashrate?: number;
  GHs?: number;
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
  lastDiff?: string | number;
  lastShare?: string;
  version?: string;
  shares_ok?: number;
  shares_err?: number;
  rssi?: number;
  wifi_rssi?: number;
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
  coreVoltage?: number;
  coreVoltageActual?: number;
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
  lastDiff?: number;
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
  /** Backend storage field — list of device IPs in the group. */
  devices?: string[];
  desc?: string;
  poolId?: string;
  wallet?: string;
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

export interface AlertRule {
  kind: string;
  label: string;
  severity: 'critical' | 'warning' | 'info';
  enabled: boolean;
  condition: string;
  threshold_key: string | null;
  threshold: number | null;
  unit: string;
  fired24h: number;
}

export interface NotificationChannel {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
  configured: boolean;
  detail: string;
  status: 'connected' | 'disconnected';
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
  lastRun?: string;
  nextRun?: string;
  desc?: string;
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
  timestamps?: string[];
}

export interface AppSettings {
  lottominer_master?: string;
  lottominer_devices?: Array<{ ip: string; name?: string }>;
  axehub_devices?: Array<{ ip: string; name?: string }>;
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
    ntfy_enabled?: boolean;
    ntfy_url?: string;
    ntfy_topic?: string;
    ntfy_token?: string;
  };
  alert_types?: Record<string, boolean>;
  weekly_summary?: { enabled: boolean; day: string; time: string };
  discord_dashboard?: { enabled?: boolean; webhook?: string; interval_seconds?: number };
  discord_bot?: { enabled?: boolean; token?: string; prefix?: string; channel_id?: string };
  pool_presets?: PoolPreset[];
  electricity_kwh_price?: number;
  discovery?: { auto_scan?: boolean; interval_minutes?: number; auto_add?: boolean; notify?: boolean };
  auto_fan?: { enabled?: boolean; target_temp?: number; min_pct?: number; max_pct?: number; kp?: number; ki?: number; kd?: number; interval_seconds?: number };
  wallets?: Wallet[];
  schedules?: Schedule[];
  groups?: Group[];
  market?: { currency?: string };
  auth?: {
    enabled?: boolean;
    password?: string; // plaintext on write — backend hashes it; never returned on read
  };
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
  // /api/setting/time
  Timezone?: number | string;
  TimeFormat?: number;
  DateFormat?: string;
  // /api/setting/preference
  Brightness?: number;
  RotateScreen?: number;
  LedEnable?: number | boolean;
  ScreenSaver?: string;
  ScreenSaverMode?: string;
  // /api/setting/market
  MainCoin?: string;
  WatchCoins?: string;
  KlineInterval?: string;
  KlineRotate?: string;
  PricePageMode?: string;
  // /api/setting/weather
  WeatherCity?: string;
  WeatherLat?: string;
  WeatherLon?: string;
  WeatherTempUnit?: string;
  WeatherSpeedUnit?: string;
  WeatherAltMode?: string;
}

export interface PoolPreset {
  id: string;
  name: string;
  url: string;
  wallet?: string;
  worker?: string;
  password?: string;
  url2?: string;
  wallet2?: string;
  worker2?: string;
  password2?: string;
  coin?: string;
  is_default?: boolean;
}

export type AxeAction = 'pause' | 'resume' | 'restart' | 'identify';
export type NmAction = 'restart';
