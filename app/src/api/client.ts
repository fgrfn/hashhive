// The typed API client (endpoint namespaces).
import { get, post, put, patch, del } from './http';
import type {
  DashboardData, AppSettings, NMMinerDevice, NMMinerConfig, AxeDevice,
  AxeActionResponse, AxeAction, NmAction, DeviceTemplate, StatSample,
  Group, GroupActionResult, Alert, HealthData, PoolPreset, Wallet,
  Schedule, DiscoveryScanResult, DiscoveredDevice, ProbabilityResult, AnalyticsResult,
  AlertRule, NotificationChannel,
} from './types';

export const api = {
  auth: {
    check:  ()                     => get<{ authenticated: boolean; auth_enabled: boolean }>('/api/auth/check'),
    login:  (password: string)     => post<{ ok: boolean }>('/api/auth/login', { password }),
    logout: ()                     => post('/api/auth/logout'),
  },
  dashboard: () => get<DashboardData>('/api/dashboard'),
  settings: {
    get:         ()                                                            => get<AppSettings>('/api/settings'),
    save:        (data: Partial<AppSettings>)                                  => post<AppSettings>('/api/settings', data),
    restore:     (data: Record<string, unknown>)                               => post<{ status: string }>('/api/settings/restore', data),
    patchDevice: (data: { ip: string; name?: string; temp_max?: number })      => patch('/api/settings/device', data),
    purgeCategories: ()                       => get<Array<{ id: string; label: string }>>('/api/settings/purge-categories'),
    purge:           (categories: string[])   => post<{ status: string; purged: string[] }>('/api/settings/purge', { categories }),
  },
  lottominer: {
    swarm:            ()                                         => get<{ devices: NMMinerDevice[]; _error?: string }>('/api/lottominer/swarm'),
    deviceConfig:     (ip: string)                              => get<NMMinerConfig>(`/api/lottominer/device-config?ip=${ip}`),
    saveDeviceConfig: (cfg: NMMinerConfig)                      => post('/api/lottominer/device-config', cfg),
    broadcastConfig:  (cfg: Record<string, unknown>)            => post('/api/lottominer/broadcast-config', cfg),
    batchAction:      (ips: string[], action: NmAction)         => post('/api/lottominer/action/batch', { ips, action }),
  },
  axeos: {
    devices:     ()                                               => get<AxeDevice[]>('/api/axeos/devices'),
    action:      (ip: string, action: AxeAction)                 => post<AxeActionResponse>(`/api/axeos/action/${ip}?action=${action}`),
    batchAction: (ips: string[], action: AxeAction)              => post('/api/axeos/action/batch', { ips, action }),
    configAll:   (cfg: Record<string, unknown>)                  => patch('/api/axeos/config/all', cfg),
    configBatch: (ips: string[], freq: number, voltage: number)  => patch('/api/axeos/config/batch', { ips, frequency: freq, coreVoltage: voltage }),
    configOne:   (ip: string, cfg: Record<string, unknown>)      => patch<AxeActionResponse>(`/api/axeos/config/${ip}`, cfg),
    configOne1:  (ip: string)                                     => get<Record<string, unknown>>(`/api/axeos/config/${ip}`),
    scan:        ()                                               => get<AxeDevice[]>('/api/axeos/scan'),
  },
  device: {
    logs:    (ip: string)              => get<string[] | { logs: string[] }>(`/api/device/${ip}/logs`),
    exec:    (ip: string, cmd: string) => post<{ output?: string; result?: string; error?: string }>(`/api/device/${ip}/exec`, { cmd }),
    restart: (ip: string)              => post(`/api/device/${ip}/restart`),
  },
  templates: {
    list:   ()                                                                       => get<DeviceTemplate[]>('/api/templates'),
    create: (t: Partial<DeviceTemplate>)                                             => post<DeviceTemplate>('/api/templates', t),
    update: (id: string, t: Partial<DeviceTemplate>)                                 => put<DeviceTemplate>(`/api/templates/${id}`, t),
    delete: (id: string)                                                             => del(`/api/templates/${id}`),
    apply:  (ip: string, templateId: string, config: Record<string, unknown>)        => post(`/api/device/${ip}/apply-template`, { template_id: templateId, config }),
  },
  stats: {
    hashrate: (opts: { days?: number; hours?: number }) => {
      const q = opts.hours != null ? `hours=${opts.hours}` : `days=${opts.days ?? 1}`;
      return get<StatSample[]>(`/api/stats/hashrate?${q}`);
    },
  },
  groups: {
    list:   ()                               => get<Group[]>('/api/groups'),
    create: (g: Partial<Group>)              => post<Group>('/api/groups', g),
    update: (id: string, g: Partial<Group>) => put<Group>(`/api/groups/${id}`, g),
    delete: (id: string)                    => del(`/api/groups/${id}`),
    action: (id: string, body: { action: string; pool_id?: string }) => post<GroupActionResult>(`/api/groups/${id}/action`, body),
  },
  alerts: {
    list:    (days = 7) => get<Alert[]>(`/api/alerts?days=${days}`),
    readAll: ()         => post('/api/alerts/read-all'),
    delete:  ()         => del('/api/alerts'),
    rules:      ()                                                  => get<AlertRule[]>('/api/alerts/rules'),
    updateRule: (kind: string, body: { enabled?: boolean; threshold?: number }) => patch(`/api/alerts/rules/${kind}`, body),
    channels:   ()                                                  => get<NotificationChannel[]>('/api/notifications/channels'),
    test:       ()                                                  => post<{ results: Record<string, boolean> }>('/api/notifications/test'),
  },
  health:   (ip?: string) => ip ? get<HealthData>(`/api/health/${ip}`) : get<HealthData>('/api/health'),
  pools: {
    list:         ()                                   => get<PoolPreset[]>('/api/pools'),
    create:       (p: Partial<PoolPreset>)             => post<PoolPreset>('/api/pools', p),
    update:       (id: string, p: Partial<PoolPreset>) => put<PoolPreset>(`/api/pools/${id}`, p),
    delete:       (id: string)                         => del(`/api/pools/${id}`),
    pushToDevice: (ip: string, pool: Partial<PoolPreset>) => post(`/api/pools/push/${ip}`, pool),
    ping:         (target: string)                     => get<{ target: string; latency_ms: number | null }>(`/api/pools/ping?target=${encodeURIComponent(target)}`),
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
    testDiscordDashboard: () => post('/api/discord-dashboard/test'),
  },
  probability: () => get<ProbabilityResult>('/api/probability'),
  analytics: () => get<AnalyticsResult>('/api/analytics'),
  discovery: {
    scan: (opts?: { subnet?: string; extra_ips?: string }) => {
      const q = new URLSearchParams();
      if (opts?.subnet) q.set('subnet', opts.subnet);
      if (opts?.extra_ips) q.set('extra_ips', opts.extra_ips);
      const qs = q.toString();
      return get<DiscoveryScanResult>(`/api/discovery/scan${qs ? `?${qs}` : ''}`);
    },
    add: (devices: DiscoveredDevice[]) => post<{ added: DiscoveredDevice[]; count: number }>('/api/discovery/add', { devices }),
  },
};
