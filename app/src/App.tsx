import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { PageErrorBoundary } from './components/ErrorBoundary';
import { useDeviceStream } from './hooks/useDeviceStream';
import { useThemeStore } from './store/theme';

const Dashboard   = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const NMMiner     = lazy(() => import('./pages/NMMiner').then(m => ({ default: m.NMMiner })));
const AxeOS       = lazy(() => import('./pages/AxeOS').then(m => ({ default: m.AxeOS })));
const GroupsPage  = lazy(() => import('./pages/Groups').then(m => ({ default: m.GroupsPage })));
const GroupDetail = lazy(() => import('./pages/Groups').then(m => ({ default: m.GroupDetail })));
const Pool        = lazy(() => import('./pages/Pool').then(m => ({ default: m.Pool })));
const Templates   = lazy(() => import('./pages/Templates').then(m => ({ default: m.Templates })));
const Schedules   = lazy(() => import('./pages/Schedules').then(m => ({ default: m.Schedules })));
const Alerts      = lazy(() => import('./pages/Alerts').then(m => ({ default: m.Alerts })));
const Earnings    = lazy(() => import('./pages/Earnings').then(m => ({ default: m.Earnings })));
const Wallets     = lazy(() => import('./pages/Wallets').then(m => ({ default: m.Wallets })));
const Settings    = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const DeviceDetail = lazy(() => import('./pages/DeviceDetail').then(m => ({ default: m.DeviceDetail })));

function AppInner() {
  useDeviceStream();
  const { theme: t } = useThemeStore();
  const location = useLocation();
  return (
    <AppShell>
      <PageErrorBoundary key={location.key} theme={t}>
        <Suspense fallback={<div />}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/miners/nmminer" element={<NMMiner />} />
            <Route path="/miners/axeos" element={<AxeOS />} />
            <Route path="/devices/:ip" element={<DeviceDetail />} />
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/groups/:id" element={<GroupDetail />} />
            <Route path="/pool" element={<Pool />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/schedules" element={<Schedules />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/earnings" element={<Earnings />} />
            <Route path="/wallets" element={<Wallets />} />
            <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
            <Route path="/settings/:section" element={<Settings />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </PageErrorBoundary>
    </AppShell>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}
